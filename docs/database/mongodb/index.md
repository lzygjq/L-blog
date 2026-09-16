---
order: 0
date: 2026-09-16
title: MongoDB · 板块导览
desc: 文档模型五篇的因果主线、与关系型板块的分工、版本现状速查表与五组高频入口
---

# MongoDB · 板块导览

MongoDB 是「数据存储」板块的**第四块**（前三块是 [MySQL](/database/mysql/) / [Redis](/database/redis/) / [PostgreSQL](/database/postgresql/)）。

它和前三块的关系与前几块不同：**MySQL 与 PostgreSQL 是同一个数据形状的两套实现（替代关系），而 MongoDB 是另一种数据形状（分工关系）。** 所以问"MongoDB 和 MySQL 该选哪个"，正确的前提是**先回答"你的数据是关系形状还是文档形状"**——这个问题不回答，比哪家快都没有意义。

## 一、一条因果主线 {#thread}

**整篇板块只有一个起点：文档是原子单位。** 后面所有结论都能从它推出来：

```
   ① 文档是原子单位（含内嵌子文档与数组）
        │
        ├──▶ 单文档更新天然原子
        │       ├── 收益：80~90% 的场景根本不需要事务
        │       └── 反向判据：如果"几乎每个写都要开事务"，
        │                     那是模型建错了，不是该加事务
        │
        ├──▶ 建模目标改为「一起访问的数据放一起」
        │       ├── 收益：按 id 取一整个聚合只有一次查询，没有 JOIN
        │       └── 代价①：文档有 16MB 硬顶
        │                 └── 所以数组不能无界增长 —— 头号建模反模式
        │
        ├──▶ 集合之间没有外键、没有跨集合唯一约束
        │       └── 代价②：校验责任前移到应用（schema-on-read）
        │                 └── 形状漂移要靠 $jsonSchema + 版本字段兜住
        │
        ├──▶ 索引需要显式设计（ESR：等值 → 排序 → 范围）
        │       └── 因为"排序免费"的前提是：索引里的顺序 = 你要的顺序
        │
        └──▶ 扩展是两层，职责不要混：
                副本集 → 可用性 + 读扩展（**不增加写吞吐**）
                分片   → 容量 + 写吞吐（成败全在那个人为选定的分片键上）
```

**这条链的用途是回答"为什么"**：

| 现象 | 顺着链找到的答案 |
|---|---|
| 某个集合运行几个月后开始报文档过大 | 无界数组（代价①）|
| 每个写操作都要开事务 | 把该嵌入的数据拆成了多个集合（起点）|
| 同一个字段在库里出现了三种类型 | schema-on-read，没有闸门（代价②）|
| 查询很快但排序很慢、日志里出现 `usedDisk` | 索引顺序与排序顺序不一致（ESR 被破坏）|
| 分了 6 片，写入延迟和单机一样 | 分片键单调递增 → 所有新写落在同一个 chunk |
| 加了分片，查询反而更慢 | 主查询不带分片键 → 散射查询，延迟由最慢分片决定 |

## 二、五篇的分工 {#modules}

| # | 篇目 | 解决的问题 | 最值得记的结论 |
|---|---|---|---|
| 1 | [文档模型与模式设计](/database/mongodb/document-model) | 数据该怎么放、边界画在哪 | **schema 没有消失**，只是从"写入时校验"变成"读取时解释"；**16MB 是唯一不可协商的约束** |
| 2 | [索引与查询优化](/database/mongodb/index-and-query) | 怎么让查询走对索引 | **ESR**：等值在前、排序居中、范围在后；**范围一旦排在排序前面，排序就用不上索引** |
| 3 | [复制、一致性与事务](/database/mongodb/consistency-and-transactions) | 多节点下"写成功"和"读到什么"是什么意思 | 读偏好与读关注是**两个正交旋钮**；事务的代价在 **WiredTiger 缓存**，不在锁 |
| 4 | [分片集群与扩展](/database/mongodb/sharding) | 容量与写吞吐怎么扩 | 分片键四条判据里，**单调性与查询覆盖最容易打架**；散射查询加机器只会更慢 |
| 5 | [NoSQL 选型与边界](/database/mongodb/nosql-selection) | 什么时候该用、什么时候千万别用 | 六条否决理由；以及 **SSPL 的真实触发边界**（自用不触发，做成服务卖才触发） |

**阅读顺序建议**：**1 → 2 → 3 → 5 → 4**。先定模型（1），再让查询跑得快（2），然后理解多节点语义（3）——到这里已经能干活了。第 5 篇放后面是因为**它假设你已经知道前面在讲什么**，才能判断"哪些代价我付得起"。分片（4）排最后：它是最晚才会遇到、也最不该早做的决定。

> **如果只读一篇**：读第 1 篇。文档库的翻车绝大多数不是性能问题，而是**模型建错**——而模型错了之后，索引和分片都救不回来。

## 三、在「数据存储」板块里的位置 {#position}

| | [MySQL](/database/mysql/) / [PostgreSQL](/database/postgresql/) | 本板块 |
|---|---|---|
| 关系 | **同一个数据形状的两套实现 → 替代关系**（同一时刻通常只选其一） | **另一种数据形状 → 分工关系**（可以并存于同一个系统） |
| 共同覆盖 | 索引、事务、MVCC、复制、锁 | **同一个问题，另一套答案**（原子单位、一致性旋钮、分片位置都变了） |
| 独有能力 | 外键与约束、JOIN 与复杂 SQL、成熟生态 | 文档模型、`$lookup`、多键/文本/地理/TTL/部分索引、原生分片 |
| 一致的判据 | 索引要能覆盖查询、分片是最后手段、长事务有害 | 同左 —— **这几条与引擎无关** |

[Redis](/database/redis/) 与[分库分表](/database/sharding/)的位置不变：前者是**挡在数据库前面的缓存与工具层**，后者是**单机容量的最后手段**（MongoDB 侧的原生替代是分片，两者判据相同，见[分片篇第六节](/database/mongodb/sharding#vs-sharding-middleware)）。

## 四、版本现状 {#versions}

**版本类事实必须现查**——下面这张表是 2026-09 的核对结果，改动前请重新确认：

| 事实 | 值 | 说明 |
|---|---|---|
| 当前 GA 主版本 | **8.0**（2024-10） | 官方支持至 **2029-10-31** |
| 8.0 最新补丁 | **8.0.32**（2026-09-11） | 长期维护中 |
| 更新的版本 | 8.3（2026-05）、8.2（2025-09） | **8.2 已于 2026-07-31 EOL** |
| Rapid Release 支持范围 | **仅 Atlas** | 自建（on-premises）不提供支持；从 8.2 起 minor release 的自建部署纳入支持 |
| 上一代版本 | 7.0（2023-08） | 支持至 2027-08-31 |
| 已 EOL | 6.0（2025-07-31）、5.0、4.4 及更早 | |
| 升级规则 | 先设 `featureCompatibilityVersion` | **只支持单版本降级**，不能跨版本降 |
| 默认写关注 | **`majority`**（**5.0 起**） | 不需要手配，但要"知道它已经是了" |
| 默认读关注 | 主节点 `local` / 从节点 `available` | 两边默认值不同，这本身是个坑 |
| 8.0 的写关注变化 | `majority` **在 oplog 写入后即确认**（不再等从节点 apply） | 同时从节点可并行 apply oplog |
| 多文档事务 | 4.0（副本集）/ 4.2（分片） | 快照隔离；**默认 60 秒自动中止** |
| 分片键可改 | **5.0 起**在线 `reshardCollection` | 8.0 新增 `unshardCollection`（改回未分片） |
| 许可 | **SSPL v1**（2018-10-16 起，至今未变） | OSI 未认可；**驱动为 Apache 2.0** |
| 已知漏洞 | **CVE-2025-14847**（MongoBleed，2025-12 披露） | **未认证越界读**；修复版本：8.2.3 / 8.0.17 / 7.0.28 / 6.0.27 / 5.0.32 / 4.4.30 |

> **两条最值得记住的**：① **默认写关注已经是 `majority`**（很多人还在手配，或者以为默认是 `w:1`）；② **Rapid Release 不支持自建**——看到"最新版是 8.3"就装到生产机上，是选错了版本线。

## 五、高频速查 {#faq}

### 5.1 建模侧 {#faq-model}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 文档库不用设计 schema？ | 不是——schema 从"写入时校验"变成"读取时解释"，形状漂移是主要债务 | [§2](/database/mongodb/document-model#schema-on-read) |
| 为什么大部分场景不需要事务？ | 单文档更新（含内嵌子文档与数组元素）本身原子；把一起改的数据放一个文档里就不需要事务 | [§1](/database/mongodb/document-model#thread) |
| 什么时候嵌入、什么时候引用？ | 看访问模式与更新模式；**一对少嵌入、一对多父引用、无界绝不进数组** | [§3](/database/mongodb/document-model#embed-or-reference) |
| `$lookup` 能当 JOIN 用吗？ | 能跑，但对左集合每个文档做一次索引查找；**前面没有 `$match` 就是全表上的嵌套循环** | [§3](/database/mongodb/document-model#embed-or-reference) |
| `_id` 为什么不该承载业务语义？ | 一是单调递增会造成分片热点，二是把内部标识变成不可变的外部契约 | [§4](/database/mongodb/document-model#anti-patterns) |

### 5.2 索引侧 {#faq-index}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 复合索引的字段顺序怎么定？ | **ESR**：等值 → 排序 → 范围；范围排在排序前面会让排序落到内存里 | [§2](/database/mongodb/index-and-query#esr) |
| 怎么判断索引好不好？ | 看 `totalKeysExamined` / `totalDocsExamined` / `nReturned` 是否同量级，以及 `winningPlan` 里**有没有 `SORT`** | [§3](/database/mongodb/index-and-query#explain) |
| 覆盖查询为什么没生效？ | 大概率是没排除 `_id`；另外**多键索引不能覆盖查询** | [§2.4](/database/mongodb/index-and-query#esr) |
| `$ne` / `$nin` / `$regex` 能靠索引加速吗？ | 它们是**范围操作符**，选择性通常极差，不该承担收窄作用 | [§4](/database/mongodb/index-and-query#in-operator) |
| 部分索引建了没用上？ | 查询条件必须与 `partialFilterExpression` 对齐，缺了就走不了 | [§5](/database/mongodb/index-and-query#index-types) |

### 5.3 一致性侧 {#faq-consistency}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| `w: majority` 和 `j: true` 是一回事吗？ | 不是：`w` 管几个节点确认，`j` 管是否落盘；**整机掉电只有 `j` 能救** | [§3](/database/mongodb/consistency-and-transactions#write-concern) |
| 读偏好和读关注的区别？ | 前者决定**从哪个节点读**，后者决定**读到什么状态**；两者正交 | [§4](/database/mongodb/consistency-and-transactions#read-concern) |
| 写完立刻读读不到怎么办？ | 用**因果一致性会话**（`afterClusterTime`），或读偏好设 `primary` | [§5](/database/mongodb/consistency-and-transactions#causal) |
| 长事务为什么拖慢整个实例？ | 事务持快照 → 之后的写版本都不能刷出 WiredTiger 缓存 → 缓存被顶满；**问题在缓存不在锁** | [§6](/database/mongodb/consistency-and-transactions#transactions) |
| 什么时候说明模型建错了？ | 当"几乎每个写都要开事务"时——该改模型，不是加事务 | [§6](/database/mongodb/consistency-and-transactions#transactions) |

### 5.4 分片侧 {#faq-sharding}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 分片键怎么选？ | 四条判据：基数、频率分布、**单调性**、**查询覆盖**；后两条最容易打架 | [§2](/database/mongodb/sharding#shard-key) |
| 为什么自增 ID / 时间戳做分片键是灾难？ | 新写永远落在"值最大"的 chunk，任何时刻写只打到一片 | [§2](/database/mongodb/sharding#shard-key) |
| 哈希分片的代价？ | 牺牲范围查询——相邻哈希值不在同一分片，按分片键的范围查询要广播 | [§2](/database/mongodb/sharding#shard-key) |
| 唯一索引为什么必须以分片键为前缀？ | 唯一性检查无法跨分片，只有放进前缀才能限制在分片内本地校验 | [§2](/database/mongodb/sharding#shard-key) |
| 散射查询为什么加机器也不快？ | 延迟由**最慢的分片**决定而不是平均值，分片越多越容易撞上慢分片 | [§4](/database/mongodb/sharding#targeted-vs-scatter) |

### 5.5 选型侧 {#faq-selection}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 什么时候不该选 MongoDB？ | 六条：多表 JOIN 常态 / 事务是核心 / 需跨集合强约束 / 需复杂 SQL / 动机是"不想设计 schema" / 许可红线 | [§3](/database/mongodb/nosql-selection#when-not) |
| 用 MongoDB 会不会被 SSPL 传染？ | 自用、内部使用、引用 Apache 2.0 驱动**都不触发**；触发的是把数据库做成服务卖 | [§4](/database/mongodb/nosql-selection#license) |
| PostgreSQL 的 JSONB 会取代文档库吗？ | 会让"数据其实规整"的场景不再需要它；但替代不了"聚合是一等公民 + 原生分片" | [§3](/database/mongodb/nosql-selection#when-not) |
| 8.0 提升 32% 吞吐，说明它更快吗？ | 不能——对照组是它的上一版，不是其他产品；**要进方案的数字必须自己压测** | [§2](/database/mongodb/nosql-selection#strengths) |

## 六、阅读建议 {#reading}

| 你的情况 | 建议路径 |
|---|---|
| 第一次接触文档数据库 | [文档模型](/database/mongodb/document-model) → [索引](/database/mongodb/index-and-query) → [NoSQL 选型](/database/mongodb/nosql-selection) |
| 已经在用，遇到性能问题 | [索引与查询优化](/database/mongodb/index-and-query)（先看 [explain 三数](/database/mongodb/index-and-query#explain)）→ 若已分片则看[散射查询判据](/database/mongodb/sharding#targeted-vs-scatter) |
| 准备做技术选型 | [NoSQL 选型](/database/mongodb/nosql-selection)（先过[六条否决理由](/database/mongodb/nosql-selection#when-not)）→ [文档模型](/database/mongodb/document-model) |
| 在准备面试 | 各篇末的面试问答（**合计 48 题**）→ [面试专题的跨板块连线题](/interview/#threads) |
| 要设计一个能扛量的集群 | [复制与一致性](/database/mongodb/consistency-and-transactions) → [分片集群](/database/mongodb/sharding) |

> **本板块与其他板块的分工**：这里讲**文档模型的机制与取舍**；[项目实战](/projects/)讲"在真实系统里怎么落地、付出了什么代价"；跨板块的横向问题（比如"一致性"在不同存储里的多种解法）在[面试专题](/interview/#threads)。**本板块不复制项目层的内容**——需要案例请走项目实战板块。
