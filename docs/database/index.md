---
date: 2026-09-14
desc: 数据存储板块导览——MySQL 与 Redis 两条主线、分库分表的位置与面试高频清单
---

# 数据存储 · 板块导览

数据存储板块以「**关系型数据库 + 内存缓存**」为主干，用一个统一的判断口径组织：**先问"数据放在哪、为什么放这里"，再问"怎么保证它在并发和故障下不出错"。**关系型这一支有**两条路线**——[MySQL](/database/mysql/) 与 [PostgreSQL](/database/postgresql/)，它们在最底层的两个设计上选了相反方向，**它们的对照本身就是一份选型能力**。

## 一、四块内容的分工

| 板块 | 定位 | 回答的核心问题 | 状态 |
|---|---|---|---|
| [**MySQL**](/database/mysql/) | 关系型数据库、**默认路线** | 数据怎么有序存放（索引）、并发怎么不出错（事务/MVCC）、量大了怎么办（复制/分片） | ✅ 8 篇已成篇 |
| [**PostgreSQL**](/database/postgresql/) | 关系型数据库的**另一条路线** | 与 MySQL 的根设计差异在哪、膨胀与回卷怎么防、什么查询用什么索引、复制与连接池怎么配 | ✅ 5 篇已成篇 |
| [**Redis**](/database/redis/) | 内存缓存、**性能与分布式工具** | 怎么把热数据挡在数据库前面、怎么实现分布式锁与轻量 MQ（含布隆过滤器、脑裂防护、淘汰策略、场景收口） | ✅ 9 篇已成篇 |
| [**分库分表**](/database/sharding/) | 单机容量的**最后手段** | 什么时候该分、按什么拆、拆完的四大代价怎么补 | ✅ 已成篇 |

**它们的关系**：

```
        请求
          │
          ▼
   ┌─────────────┐   命中（绝大多数）
   │   Redis     │──────────────────────▶ 返回
   └──────┬──────┘
          │ 未命中（穿透到数据库）
          ▼
   ┌─────────────┐   主库写入
   │   MySQL     │◀──── 写请求
   │  主从集群    │
   └──────┬──────┘
          │ ① 读写分离（从库扛读）  ② 单表超 1000 万
          ▼                        ▼
    从库 / 只读实例           ┌─────────────┐
                             │  分库分表    │
                             └─────────────┘
```

> PostgreSQL 与 MySQL 处在**同一层**（关系型主库），彼此是**替代关系**而非串联关系——同一时刻通常只需其中之一。选型判据见 [PostgreSQL · 与 MySQL 的差异](/database/postgresql/vs-mysql#selection)。

## 二、推荐阅读顺序

```
① MySQL 先读「索引」两篇（底层 + 设计）
        —— 这是 12 道高频题里 5 道的答案所在，也是"为什么慢"的通用解释
        │
        ├──▶ ② 慢查询定位与 SQL 优化     （把索引知识变成排查能力）
        │
        └──▶ ③ 事务 → 日志 → MVCC        （一条因果链：ACID 靠日志实现，隔离性靠 MVCC 和锁）
        │
        ├──▶ ④ 主从复制                  （读扩展与高可用）
        │
        ├──▶ ⑤ Redis                     （把热数据挡在前面）
        │
        ├──▶ ⑥ 分库分表                  （写扩展的最后手段）
        │
        └──▶ ⑦ PostgreSQL                （另一条关系型路线：先读「与 MySQL 的差异」，再读 VACUUM）
```

> **顺序不能跳的理由**：**不知道 B+ 树的排序方式，"最左前缀法则"就只能背**；不知道"实例化与可见性判断"，MVCC 的四条规则就是天书；不先做读写分离，直接上分库分表是过度设计。

## 三、两条主线之间的交叉点

| 交叉主题 | 在 MySQL 侧的关注点 | 在 Redis 侧的关注点 |
|---|---|---|
| **缓存与数据库一致性** | 更新时机、主从延迟下的读旧数据 | 先删缓存还是先更新库、延迟双删、Canal 兜底 |
| **分布式锁** | 行锁/间隙锁的语义与死锁 | SETNX 三个坑、Redisson 看门狗 |
| **高可用** | 主从复制、半同步、GTID、MHA | 哨兵故障转移、分片集群 |
| **数据同步** | binlog 的格式与两阶段提交 | Canal 消费 binlog 做缓存/数仓同步 |

相关交叉内容：[多级缓存：亿级流量架构](/database/redis/multilevel-cache)、[Canal 数据同步](/bigdata/canal/)。

## 四、面试高频清单 {#interview}

| # | 问题 | 篇目 |
|---|---|---|
| 1 | 索引为什么用 B+ 树？聚簇索引和回表是什么？ | [MySQL · 索引底层](/database/mysql/index-structure) |
| 2 | 索引失效的场景有哪些？覆盖索引和超大分页怎么优化？ | [MySQL · 索引设计](/database/mysql/index-design) |
| 3 | 一个 SQL 执行很慢怎么分析？ | [MySQL · 慢查询定位](/database/mysql/diagnosis) |
| 4 | ACID 靠什么实现？RR 能解决幻读吗？ | [MySQL · 事务](/database/mysql/transaction) |
| 5 | undo log、redo log、binlog 的区别？ | [MySQL · 日志体系](/database/mysql/log) |
| 6 | MVCC 怎么实现的？RC 和 RR 差在哪？ | [MySQL · MVCC 与锁](/database/mysql/mvcc) |
| 7 | 主从复制原理？主从延迟怎么解决？ | [MySQL · 主从复制](/database/mysql/replication) |
| 8 | 缓存穿透、击穿、雪崩怎么解决？ | [Redis · 缓存模式](/database/redis/cache-patterns) |
| 9 | 分布式锁怎么实现？Redisson 的看门狗是干什么的？ | [Redis · 分布式锁与消息队列](/database/redis/lock-and-mq) |
| 10 | Redis 主从、哨兵、分片集群的区别？ | [Redis · 持久化、主从与集群](/database/redis/ha-cluster) |
| 11 | 分库分表的时机和策略？拆分后有哪些问题？ | [分库分表](/database/sharding/) |
| 12 | PostgreSQL 和 MySQL 的本质差异是什么？ | [PostgreSQL · 与 MySQL 的差异](/database/postgresql/vs-mysql) |
| 13 | PG 的表膨胀与事务 ID 回卷是怎么回事？ | [PostgreSQL · MVCC 与 VACUUM](/database/postgresql/mvcc-and-vacuum) |
| 14 | 什么查询该用什么索引类型？ | [PostgreSQL · 索引体系](/database/postgresql/index-and-types) |

消息与队列相关主题见[消息队列板块](/middleware/)。全文检索与日志检索见[搜索与检索板块](/search/)（Elasticsearch 5 篇）——**它与本板块同属「存储·消息·检索」这一个侧边栏，是"以检索为目的的存储"**。
