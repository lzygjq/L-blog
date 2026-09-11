---
order: 2
date: 2026-09-12
title: 底层原理：数据结构与网络模型
desc: SDS/Dict 渐进式 rehash/跳表/紧凑列表、RedisObject 编码体系、IO 多路复用与内存淘汰策略
---

# 底层原理：数据结构与网络模型

「Redis 为什么快」是一道烂大街的题，但能答出编码级细节的很少。这一篇把命令背后的存储结构、网络模型、内存策略一次讲透——后面的[最佳实践](/database/redis/best-practices)里每一条规则，根源都在这里。

## 一、SDS：为什么不直接用 C 字符串

C 的字符串是 `char[]` + 结尾 `\0`，四个硬伤：求长度 O(N)、非二进制安全（中间出现 `\0` 即截断）、不可修改、缓冲区溢出风险。

Redis 自己实现了 SDS（Simple Dynamic String）：

```c
struct sdshdr8 {
    uint8_t len;    // 已用长度
    uint8_t alloc;  // 分配总长度
    unsigned char flags; // 头类型，控制头大小
    char buf[];     // 实际数据
};
```

三个收益：

| 特性 | 实现 |
|---|---|
| O(1) 取长度 | 直接读 `len`，`STRLEN` 不再扫描 |
| 二进制安全 | 按 `len` 判断边界，存图片序列化字节也没问题 |
| 减少重分配 | 空间预分配（小于 1MB 翻倍，大于 1MB 每次 +1MB）+ 惰性释放 |

`flags` 按字符串长度选不同大小的头（sdshdr5/8/16/32/64），短字符串头开销最小——这也是后面「key 不超过 44 字节」建议的伏笔。

## 二、Dict：渐进式 rehash

Hash 表是 Redis 所有结构的骨架（KV 本身就是一个全局 Dict）。扩容时如果一次搬迁几千万条目，服务直接卡死——Redis 的解法是**渐进式 rehash**：

```
扩容触发 → 同时持有 ht[0]（旧表）和 ht[1]（新表，2 倍大小）
        → 后续每次增删改查顺带搬迁 ht[0] 的一个桶
        → 定时任务也会搬迁若干桶，直到 ht[0] 清空
```

期间读写规则：读查两张表，写只写 ht[1]。**代价是内存短期双倍**，这解释了为什么大 Dict 扩容期间内存监控会突然抬升。

## 三、SkipList：为什么 ZSet 用跳表不用红黑树

跳表 = 多层有序链表，每个节点以随机层数出现（每层晋升概率 25%，最高 64 层）：

```
L3:  head -----------------------------> 56 ─→ NULL
L2:  head ----------> 23 ──────────────> 56 ─→ NULL
L1:  head -> 7 -> 23 -> 31 -> 42 -> 56 -> 89 ─→ NULL
```

查找从最高层出发逐层下沉，平均 O(log N)。选它而非红黑树的理由（面试标准答案）：

1. **范围查询天然友好**：ZSet 的 `ZRANGE/ZRANGEBYSCORE` 是高频操作，跳表定位到起点后沿底层链表顺序走即可；红黑树要中序遍历，实现复杂得多。
2. **实现简单**：插入删除只需调整前后指针，不像红黑树要旋转+变色。
3. **范围聚合容易**：span 字段直接支撑 `ZRANK`（求排名）。

## 四、紧凑结构：ZipList / QuickList / ListPack

小数据量时，哈希表和跳表太浪费，Redis 用紧凑的连续内存结构：

- **ZipList**：一块连续内存，`<zlbytes><zltail><zllen><entry>...<zlend>`，每个 entry 记录前驱长度以支持反向遍历。省内存但**级联更新**：中间插入导致 prevlen 字段连锁扩展，最坏 O(N²)。
- **QuickList**：List 的实际实现 = ZipList 组成的双向链表（7.0 后节点改为 ListPack）。平衡了内存紧凑与插入效率，`list-max-listpack-size` 控制每个节点的长度。
- **ListPack**：7.0 用于替代 ZipList，entry 只记自身长度，彻底消除级联更新。

**编码转换阈值**（Hash 为例，`hash-max-listpack-entries/value`）：元素少且值短时用 ListPack，超限转 Hashtable。这就是「小对象更省内存」的根源。

## 五、RedisObject：type 与 encoding 的二维世界

所有值都是 RedisObject：`type`（对用户的五种结构）+ `encoding`（底层实现）+ `ptr`。常用对照：

| type | 小数据编码 | 大数据编码 | 分界 |
|---|---|---|---|
| String | int / embstr | raw | 整数用 int；≤44 字节用 embstr（RedisObject 与 SDS 一次分配连续内存）；更长转 raw |
| Hash | ListPack | Hashtable | `hash-max-listpack-entries` 默认 128 |
| List | ListPack(QuickList 节点) | QuickList | `list-max-listpack-size` |
| Set | IntSet / ListPack | Hashtable | 全整数且 ≤512 用 IntSet |
| ZSet | ListPack | SkipList + Dict 双结构 | `zset-max-listpack-entries` 默认 128 |

ZSet 大数据编码是**双结构**：SkipList 按序查范围，Dict 按 member 查 score，`ZSCORE` 才能到 O(1)。多一份索引多一份内存——命令选型时心里要有这本账。

## 六、网络模型：单线程为什么扛得住 10 万 QPS

```
客户端 ──连接──> [epoll 事件循环]
                   │ 就绪事件 → 命令执行（单线程，无锁）
                   │              │
                   └ 响应写回 <───┘
```

快的四个来源，缺一不可：

1. **纯内存操作**：没有磁盘 IO，读写都是纳秒/微秒级。
2. **单线程无锁**：没有上下文切换和死锁问题，实现简单到不容易慢。
3. **IO 多路复用（epoll）**：单线程监听成千上万连接，谁就绪处理谁，不空等。
4. **高效编码与协议**：RESP 协议文本简单解析快，底层结构对命令路径做了极致优化。

**Redis 6.0 的多线程只用于读写网络数据和协议解析**（`io-threads`），命令执行仍是单线程——既把网络 IO 这个新瓶颈交给多核，又不引入命令执行的锁竞争。答「单线程」时能补上这句，就超出多数候选人了。

**单线程的反面**：任何一条慢命令（`KEYS *`、大集合全量运算、`SAVE`）都会阻塞所有请求。这是所有运维红线的根源（见[最佳实践](/database/redis/best-practices)）。

## 七、过期删除与内存淘汰

两套机制，别混淆：

**过期删除**（key 到了 TTL 怎么删）：
- 惰性删除：访问时检查，过期即删——冷数据会占着内存不放。
- 定期删除：周期性随机抽一批设置了过期的 key 检查清理。
- 两者配合，仍挡不住「大量写入且不访问」，于是需要内存淘汰。

**内存淘汰**（内存到 `maxmemory` 后删谁，8 种策略）：

| 策略 | 淘汰范围 |
|---|---|
| noeviction（默认） | 不淘汰，写报错 |
| allkeys-lru / volatile-lru | 全部 key / 仅带 TTL 的 key，淘汰最近最少使用 |
| allkeys-lfu / volatile-lfu | 同上范围，按访问频率（4.0+） |
| allkeys-random / volatile-random | 随机 |

**缓存场景的标准配置是 `allkeys-lru` 或 `allkeys-lfu`**（视访问分布而定）；`volatile-*` 系列只对设了 TTL 的 key 生效，没设 TTL 的 key 永不淘汰——混用时容易误判。

## 八、面试问答

**Q: Redis 为什么快？**
内存操作、单线程无锁、epoll 多路复用、为每个结构选了最优编码。反方向补充：它慢下来也容易——一条慢命令就够，所以单线程模型的运维纪律比多线程数据库更严。

**Q: ZSet 为什么用跳表不用红黑树/ B+ 树？**
范围查询走底层链表 O(1) 接续、实现无旋转、span 直接支撑排名运算。B+ 树是为磁盘页设计（多叉降低树高），内存场景没有意义。

**Q: 渐进式 rehash 期间怎么保证数据不丢？**
读操作先查 ht[0] 再查 ht[1]；写操作只写 ht[1]（会先把对应的桶搬过去）。搬迁由日常操作和定时任务分摊，任何时刻两张表数据并集是完整的。

**Q: 一个 key 刚好过期但没被删除，读到了旧值怎么办？**
不会。惰性删除在访问路径上：读之前先检查 TTL，过期即删并返回空。真正要注意的是主从结构下**从库不主动删过期 key**，等主库同步 DEL——主从延迟窗口内从库可能读到已过期数据。
