---
order: 0
date: 2026-09-16
title: PostgreSQL · 板块导览
desc: PostgreSQL 五篇的因果主线、与 MySQL 板块的分工、跨篇深水题与阅读路径
---

# PostgreSQL · 板块导览

PostgreSQL 是「数据存储」板块的**第三块**（前置两块是 [MySQL](/database/mysql/) 与 [Redis](/database/redis/)）。

它值得单独成篇的理由不是"功能多"，而是：**它在两个最底层的设计上选了与 MySQL 相反的路，而这些选择会一路渗透到运维、调优和高可用。** 面试里问到 PG，考的就是这条链你有没有走通。

## 一、一条因果主线 {#thread}

**记住一句话，五篇的大部分结论都能推出来：**

> **PG 把旧版本留在数据行里，而且清理它的是一份后台任务。**

```
   ① 多版本不挪走，留在表页里
        │
        ├──▶ 读不加锁（可见性靠快照比对）          ← 收益：读写不互斥
        │
        ├──▶ 旧版本必须有人清（VACUUM）            ← 代价①：膨胀
        │         │
        │         └──▶ 可见性映射也靠它维护
        │                （不维护 → Index Only Scan 白建）
        │
        ├──▶ 长事务顶住清理水位 → 全库一起胀        ← 代价②：影响面是全库
        │
        ├──▶ 事务 ID 只有 32 位 → 必须冻结          ← 代价③：回卷会停服
        │
        └──▶ UPDATE 写新行 + 每个索引都改           ← 代价④：写放大
```

**这条链的价值在于它能解释"为什么"而不是"是什么"**：

| 现象 | 顺着链找到的答案 |
|---|---|
| 所有表同时开始膨胀 | 有个长事务把清理水位钉住了（代价②）|
| 建了覆盖索引还是慢 | 可见性映射没维护，`Heap Fetches` 不为 0 |
| `ALTER TABLE` 卡死整个业务 | 锁队列 FIFO——与这条链无关，属[锁与并发控制](/database/postgresql/concurrency#lock-queue)|
| 数据库突然拒绝新事务 | 事务 ID 快用完了（代价③）|
| 十亿行的表建索引要几百 GB | 该换 BRIN，不是该加机器 |

## 二、五篇的分工 {#modules}

| # | 篇目 | 解决的问题 | 最值得记的结论 |
|---|---|---|---|
| 1 | [与 MySQL 的差异：两个根设计](/database/postgresql/vs-mysql) | 为什么选它、它到底和 MySQL 差在哪 | **两个根设计**（版本存哪、索引存什么）能推出大部分差异清单 |
| 2 | [MVCC 与 VACUUM](/database/postgresql/mvcc-and-vacuum) | 为什么膨胀、长事务为何致命、回卷是什么 | **膨胀是性能问题，回卷是可用性问题**——后者不监控就会停服 |
| 3 | [锁与并发控制](/database/postgresql/concurrency) | 谁在挡谁、DDL 为什么能停表 | **锁队列是 FIFO**：一个排队中的 `ACCESS EXCLUSIVE` 能挡住后续所有读 |
| 4 | [索引体系与数据类型](/database/postgresql/index-and-types) | 什么查询该建什么索引 | **一种索引对一类语义**；BRIN 是十亿行时序表的性价比之王 |
| 5 | [复制、高可用与运维调优](/database/postgresql/replication-and-ops) | 高可用怎么做、为什么必须上连接池 | **物理复制回放是单进程**；没配 `synchronous_standby_names` 的 `on` 等于异步 |

**阅读顺序建议**：**1 → 2 → 4 → 3 → 5**。先建立"它和 MySQL 不同在哪"的框架（1），再理解最独特的机制面（2），接着落到日常最常用的索引（4），然后才是并发（3）与运维（5）。

> **如果只读一篇**：读第 2 篇。膨胀与回卷是 PG 最独特、也最容易造成事故的部分，**面试官用它区分"用过 PG"和"运维过 PG"**。

## 三、与 MySQL 板块的关系 {#vs-mysql-section}

这两个板块是**对照关系，不是重复关系**：

| | [MySQL 板块](/database/mysql/) | 本板块 |
|---|---|---|
| 讲什么 | **机制内部**：B+ 树怎么定位、ReadView 怎么判可见性、redo/undo/binlog 怎么配合 | **两个引擎的相反选择与后果**：旧版本放哪、索引存什么、清理谁来做 |
| 通用原理 | 最左前缀、覆盖索引、索引失效场景 —— **本板块不重复** | —— |
| 独有能力 | —— | GIN / BRIN / 部分索引 / SSI / `hot_standby_feedback` |
| 共同覆盖 | 索引、事务、MVCC、锁、复制 —— **同一个问题，两套答案** | 同左 |

**读法的建议**：先读 MySQL 的索引与事务两篇建立**通用模型**，再读本板块的 1、2 篇看**同样的目标如何用完全不同的方式实现**。这样两边都不容易混。

## 四、与其他板块的交叉点 {#cross}

| 交叉板块 | 交叉点 | 说明 |
|---|---|---|
| [MySQL](/database/mysql/) | 关系型引擎的两种实现 | 选型题的两侧答案，见[第三节](#vs-mysql-section) |
| [Redis](/database/redis/) | 缓存与数据库一致性 | PG 侧同样适用；缓存模式篇的结论与引擎无关 |
| [分库分表](/database/sharding/) | 单机容量的边界 | PG 侧的原生替代路径是**分区表 + BRIN**，不一定要中间件分片 |
| [数据仓库](/bigdata/) | CDC 同步 PG 变更 | PG 的逻辑解码（`pgoutput`）是 Debezium 读取 PG 变更的通道，与 [Canal 读 MySQL binlog](/bigdata/canal/) 对应 |
| [高可用](/high-availability/) | 脑裂、fencing、故障转移 | Patroni 的自动切换同样受["先隔离再提升"](/high-availability/redundancy-failover#split-brain)约束 |
| [云原生](/cloud-native/) | 有状态服务的部署 | StatefulSet + PG Operator；连接池是[云原生下的必需层](/database/postgresql/replication-and-ops#pool) |
| [搜索与检索](/search/) | 倒排索引思想 | PG 的 **GIN 就是数据库内的倒排索引**，与 [ES 的倒排索引](/search/inverted-index)同源，规模与场景不同 |

## 五、面试高频索引 {#interview}

### 5.1 各篇题单入口

| 篇目 | 题量 | 入口 |
|---|---|---|
| 与 MySQL 的差异 | 12 | [面试高频索引](/database/postgresql/vs-mysql#interview) |
| MVCC 与 VACUUM | 18 | [面试高频索引](/database/postgresql/mvcc-and-vacuum#interview) |
| 锁与并发控制 | 16 | [面试高频索引](/database/postgresql/concurrency#interview) |
| 索引体系与数据类型 | 18 | [面试高频索引](/database/postgresql/index-and-types#interview) |
| 复制、高可用与运维调优 | 22 | [面试高频索引](/database/postgresql/replication-and-ops#interview) |

**本板块合计 86 题**，每题都带「一句话答案 + 正文锚点」。

### 5.2 跨篇深水题（贯穿多篇，答不出就是链没走通）

| # | 问题 | 为什么这么问 | 答案要点 |
|---|---|---|---|
| 1 | 一张表突然开始膨胀，你的排查顺序是什么？ | 考"现象 → 根因"的链路 | 长事务顶水位 → 阈值没到 → cost_delay 太保守 → 被 DDL 锁挡 |
| 2 | 为什么说 PG 的"读不加锁"是有代价的？ | 考对 MVCC 取舍的理解 | 换来的是后台清理责任 + 膨胀 + 回卷 |
| 3 | `CREATE INDEX CONCURRENTLY` 在什么情况下反而更危险？ | 考工程判断力 | 失败留 INVALID 索引；高峰期与 VACUUM 抢锁；扫两遍表 |
| 4 | 为什么 PG 的 `VACUUM` 会影响**查询性能**（不只是空间）？ | 考对 VACUUM 第二职责的理解 | 可见性映射决定 Index Only Scan 能否生效 |
| 5 | 十亿行日志表，B-tree 还是 BRIN？怎么判断？ | 考带条件的决策能力 | 先看 `pg_stats.correlation`；接近 ±1 用 BRIN |
| 6 | 从库查询被取消，你会怎么改？ | 考取舍而非记参数 | `hot_standby_feedback` 或把长查询挪走；**说清代价** |
| 7 | 为什么"配了 `synchronous_commit = on`"不代表不丢数据？ | 考配置的完整语义 | 需要 `synchronous_standby_names` 才真正生效 |
| 8 | 你的 PG 为什么必须上连接池？ | 考进程模型的理解 | 一连接一进程；`max_connections` 是成本不是能力 |
| 9 | 一条 DDL 让整个业务停了 30 秒，怎么复盘？ | 考锁队列 FIFO 这条反直觉规则 | 排队中的 `ACCESS EXCLUSIVE` 挡住后续 SELECT；预防靠 `lock_timeout` |
| 10 | 选 PG 之前必须先回答什么？ | 考能否讲清代价 | 谁管 autovacuum / 谁监控回卷 |

> **本页与 [面试专题](/interview/) 的分工**：本页只给**本板块的题单入口 + 跨篇深水题**；跨板块的横向连线题在面试专题页。**各篇正文的题单不在此复制**——避免同一道题在两处维护、慢慢对不上。

## 六、一条通用纪律 {#discipline}

这个板块的五个结论，最终都指向同一件事：

> **PG 把一部分「数据库自己的责任」交给了使用者：清理是后台任务、连接要自己管、可见性映射要等人维护。**

所以评判一个人是否真的运维过 PG，不看他会背多少参数，而看**他的监控面板上有没有 `age(datfrozenxid)` 和复制槽积压量**——**这两个数不涨，才是 PG 最舒服的状态**。
