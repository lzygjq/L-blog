---
order: 4
date: 2026-09-12
title: 分布式锁与消息队列
desc: 从 SETNX 三个坑到 Redisson 看门狗的锁演进全记录、Lua 原子化秒杀、List/PubSub/Stream 三种 MQ 选型
---

# 分布式锁与消息队列

这一篇讲 Redis 被用到「数据库本职之外」的两件事：锁和队列。共同主题是**原子性**——单条命令原子，组合命令不原子，所有坑都长在组合命令上。

## 一、从超卖问题说起

并发扣库存的经典事故：线程 A、B 同时读到库存 1，各自判断充足，各扣一次，卖超。DB 层可用乐观锁兜底（`UPDATE ... SET stock=stock-1 WHERE stock>0`），但热点行会打爆 DB；于是把「判断 + 扣减」整体上移到 Redis，用锁或 Lua 保证原子。

## 二、分布式锁的演进：一个 SETNX 的三个坑

### 坑 1：SETNX 和 EXPIRE 分两条命令

```bash
SETNX lock:order 1     # 加锁成功
EXPIRE lock:order 10   # ← 若进程在这两条之间宕机，锁永不过期（死锁）
```

修复：`SET lock:order <uuid> NX EX 10`，一条命令同时完成加锁和设 TTL。

### 坑 2：误删别人的锁

业务执行超过 TTL：A 的锁过期自动释放 → B 拿到锁 → A 执行完 DEL，把 B 的锁删了。修复：**值存唯一标识，释放前校验**——校验和删除又必须是原子的，于是需要 Lua：

```lua
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
else
    return 0
end
```

Lua 脚本在 Redis 中原子执行（整个脚本是一个命令），这是 Redis 解决「组合操作原子性」的通用手段。

### 坑 3：业务没执行完，锁先过期

锁的 TTL 是拍脑袋定的：定短了锁提前失效回到坑 2，定长了持有者宕机后别人干等。根治方案是**自动续期**——这超出了手写的合理复杂度，交给成熟实现。

## 三、Redisson：生产级的锁实现

```java
RLock lock = redissonClient.getLock("lock:order:" + orderId);
try {
    boolean got = lock.tryLock(3, 30, TimeUnit.SECONDS); // waitTime / leaseTime
    if (got) { /* 业务 */ }
} finally {
    if (lock.isHeldByCurrentThread()) lock.unlock();
}
```

三个核心机制：

| 机制 | 实现 |
|---|---|
| 可重入 | 锁不是 String 而是 Hash：`field=线程标识, value=重入计数`，重入加计数，解锁减到 0 才真删 |
| 看门狗自动续期 | 不指定 leaseTime 时默认锁 30s，后台线程每 1/3 TTL（10s）检查持有状态并续期——业务再慢锁也不会中途失效 |
| 阻塞等待 | 等锁线程订阅锁 channel，释放时 pub 通知唤醒，避免轮询空转 |

**面试加分点**：Redlock（多节点独立加锁过半成功）在工业界争议很大（Martin Kleppmann 与 antirez 的著名论战），结论是大多数场景**单实例 + 哨兵 + 看门狗已经足够**，真正要求极端正确性的互斥（如资金）不该依赖 Redis 锁，要么 DB 乐观锁兜底，要么上 ZooKeeper/etcd。

## 四、秒杀链路：Lua + MQ 的组合

单用锁解决不了秒杀的吞吐，标准链路是「Lua 原子预扣 + MQ 异步下单」：

```lua
-- KEYS[1]=库存  KEYS[2]=已购集合  ARGV[1]=userId
if tonumber(redis.call('GET', KEYS[1])) <= 0 then return -1 end         -- 售罄
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then return -2 end     -- 重复下单
redis.call('DECR', KEYS[1])
redis.call('SADD', KEYS[2], ARGV[1])
return 1
```

一次网络往返内原子完成「库存判断 + 去重 + 扣减」，资格通过后发 MQ，由消费者慢慢完成创建订单 + 扣 DB 库存。DB 永远只承受与真实库存量级的写入，而不是请求量级的写入。

## 五、三种消息队列：List / PubSub / Stream

| 维度 | List（BRPOP） | PubSub | Stream（5.0+） |
|---|---|---|---|
| 持久化 | 消息即数据，可持久化 | **不持久化，离线即丢** | 持久化，消息留在流里 |
| 消费确认 | 无（弹出即责任转移） | 无 | XACK 确认，Pending 列表可重新投递 |
| 消费者组 | 无 | 无 | 有：组内竞争消费、独立消费进度 |
| 消息堆积 | 可以，但全量内存 | 不适用 | 可以，受 MAXLEN 控制 |
| 适用 | 简单任务队列 | 实时广播（Redisson 锁唤醒在用） | 轻量可靠队列 |

**选型判断**：允许丢、只求削峰 → List；在线广播（所有在线者收到即可）→ PubSub；要可靠不丢、要确认重投 → Stream。**再往上的边界**：需要事务消息、死信、延迟分级、大吞吐堆积，就该出域了——Redis Stream 是「轻量可靠」，不是 RocketMQ 的替代品（对比见[消息队列板块](/middleware/)）。从零搭建的微服务项目里 MQ 选型最终落到专业 MQ，Redis Stream 只承担轻量异步场景，原因正在这张表里。

## 六、面试问答

**Q: 手写分布式锁要处理哪些问题？**
至少五个：加锁与设 TTL 原子（SET NX EX）、值存唯一标识防误删、释放用 Lua 保证「校验+删除」原子、锁超时与业务时长的关系（自动续期）、以及可重入。答全五个的候选人不多，这题是分层信号题。

**Q: 为什么释放锁必须用 Lua？**
GET 校验和 DEL 是两条命令，中间锁可能恰好过期易主。Lua 脚本整体原子，等价于把「if 我才是持有者 then 删除」变成不可分割的操作。

**Q: Lua 脚本有什么使用禁忌？**
Redis 执行脚本是原子的 = 脚本执行期间阻塞其他命令。脚本要短小（判断+写回级别），禁止循环遍历大集合——否则它就从「原子性工具」变成「自己制造的慢命令」。

**Q: Redis Stream 消费了没 ACK 会怎样？**
消息留在消费者组的 PEL（Pending 列表）里，用 XPENDING 可查、XCLAIM 可转给其他消费者——这正是可靠投递的基础，也是它与 PubSub 的本质区别。
