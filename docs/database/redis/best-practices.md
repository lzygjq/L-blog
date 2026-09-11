---
order: 8
date: 2026-09-12
title: 最佳实践：键值设计与运维清单
desc: 优雅 key 与 44 字节分界、BigKey 的发现与安全删除、批处理三档演进、服务端与集群配置红线
---

# 最佳实践：键值设计与运维清单

这一篇是上线前的 checklist。每条规则都不是教条——根源都在[底层原理](/database/redis/internals)里：单线程模型决定了「任何慢操作都是全局事故」，内存成本决定了「编码细节就是钱」。

## 一、优雅的 key 设计

约定格式：`业务名:数据名:id`，例如 `login:user:1001`。

三条规则与依据：

| 规则 | 依据 |
|---|---|
| 长度 ≤ 44 字节 | String 在 ≤44 字节时走 embstr 编码，RedisObject 与 SDS 一次分配连续内存；超了转 raw 两次分配（见[原理篇](/database/redis/internals)） |
| 不含特殊字符、统一小写 | key 本身占内存，且是排查问题时的「人机界面」，可读性即运维效率 |
| 业务前缀隔离 | 避免多业务共用实例时 key 冲突，也为后续按业务拆实例留路 |

## 二、BigKey：定义、危害、发现、处置

**定义**（综合判定）：String 值 > 10KB；集合类型元素 > 1000 个，或成员总量过大（如 Hash 1000 个 field 合计 100MB）。

**危害**，四条全部与单线程/内存模型挂钩：

| 危害 | 机理 |
|---|---|
| 网络阻塞 | 读一次 5MB 值，少量 QPS 就打满网卡 |
| 数据倾斜 | 分片集群中 BigKey 所在节点内存远超其他节点，扩容失去意义 |
| 命令阻塞 | HGETALL 大 Hash、大集合全量运算耗时，阻塞所有请求 |
| CPU 尖刺 | 大值的序列化/反序列化拖高 CPU，影响同机其他进程 |

**发现**：

```bash
redis-cli --bigkeys                 # 内置扫描，给每类 Top1（采样模式，生产可用）
SCAN + MEMORY USAGE / STRLEN / HLEN # 自写脚本精确统计（MEMORY USAGE 仅供精查，别全量跑）
```

**处置**：

1. **删除用 `UNLINK`**（异步，后台线程回收），不要 `DEL`——同步删除 BigKey 本身就是一次阻塞事故。
2. 大集合渐进清理：`SCAN` 分批 `HSCAN` 取出旧数据 + 批量删除。
3. 结构性拆分：大 Hash 按 field 哈希拆成多个小 Hash（`hash:{id % 100}`），从设计上消灭 BigKey。

## 三、恰当的数据类型：对象存法对比

同一个用户对象的三种存法：

| 存法 | 内存 | 部分更新 | 适用 |
|---|---|---|---|
| String + JSON | 最省（一个 key 一次编码） | 要整取整写，改一个字段也要读改写全量 | 整体读写、嵌套结构 |
| Hash | 略高 | `HSET user:1001 name x` 原地改，网络省 | 字段级读写频繁 |
| 每字段一个 String key | key 数爆炸，最差 | — | 不推荐 |

前提是对象足够小：Hash 在元素少时走 ListPack 编码，紧凑程度接近连续内存；一旦超 `hash-max-listpack-entries` 转 Hashtable，内存立刻上一个台阶——「Hash 存对象更省」只在 ListPack 区间成立，别背反了结论。

## 四、批处理：从循环到 Pipeline

客户端循环 1000 次 `SET` = 1000 次网络往返。三档优化：

```java
// 第一档：单命令批量（最优先）
redis.mset(map);

// 第二档：Pipeline（命令多/类型杂时）
List<Object> results = pipeline.syncAndReturnAll();  // 1000 条命令一次往返发出

// 第三档：Lua（批量 + 逻辑判断需原子时）
```

辨析三件容易混的事：

| | 原子性 | 能否穿插其他客户端命令 | 备注 |
|---|---|---|---|
| Pipeline | 否，只是攒包发送 | 能 | 纯网络优化，不等于事务 |
| MULTI/EXEC 事务 | 打包执行，但无回滚 | 不能 | 某条语法错误全队失败，运行时错误不回滚 |
| Lua 脚本 | 是（脚本级） | 不能 | 真正的原子复合操作，复杂逻辑首选 |

**集群注意**：Pipeline 在分片集群下要按节点分组拆包（smart client 通常已处理）；原生跨槽 MGET 不支持，需要 hash tag 或分组请求（见[集群](/database/redis/ha-cluster)）。

## 五、服务端与运维红线

**危险命令管控**：`KEYS`、`FLUSHALL`、`FLUSHDB`、`CONFIG` 等在生产通过 `rename-command` 改名或禁用。`KEYS *` 是单线程数据库里最典型的自残操作。

**内存与过期**：

- `maxmemory` 必须显式设置（留 10~20% 余量给 fork/COW 与缓冲区），策略用 `allkeys-lru`/`lfu`（缓存场景）。
- 所有缓存 key **必须带 TTL**，没有 TTL 的缓存等于慢性内存泄漏。

**慢诊断三件套**：

```bash
SLOWLOG GET 10          # 慢查询日志（按执行耗时记录，不是网络耗时）
LATENCY HISTORY event   # 延迟事件
INFO memory/stats       # 内存碎片率、命中率、主从偏移
```

**部署纪律**：Redis 不与大数据组件混部（内存型服务怕被吃内存）；开启 `appendfsync everysec` + 混合持久化；主从环境下 `repl-backlog-size` 按断线容忍时长规划。

## 六、面试问答

**Q: 线上发现内存涨得快，排查顺序？**
① `INFO memory` 看 used_memory 与碎片率；② `--bigkeys` 扫大 key；③ 抽查无 TTL 的 key（这是最常见根因）；④ 查淘汰策略与 maxmemory 配置是否矛盾；⑤ 大 Dict 扩容窗口的短暂翻倍属正常（渐进式 rehash）。

**Q: Pipeline 和事务的区别？为什么有了事务还要 Lua？**
Pipeline 是网络层攒包，不保证原子；Redis 事务只保证「打包执行」，不支持回滚且中间看不到结果做不了条件判断；Lua 在服务端原子执行且有逻辑能力，是「事务 + 条件」的正确解。

**Q: hash tag 用多了会怎样？**
相关 key 全落同一节点，分片形同虚设，出现内存与流量双倾斜。只在确实需要多 key 原子操作的小范围使用，并评估该组 key 的量级。
