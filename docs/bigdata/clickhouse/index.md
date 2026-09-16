---
date: 2026-09-16
title: ClickHouse · 导览
desc: 一条根设计（part 写入后不可变）推出全部结论、五篇的分工、它在数据链路里的位置（与 Doris 并列而非串联）、版本现状速查表（结论时效性极强）、五个方向的高频考点
---

# ClickHouse · 导览

这个板块回答一个问题：**为什么一个"改一行都很费劲"的数据库，能在分析场景里跑到别人追不上。**

**一句话主线**：

> **数据写入后就不可变了，修改靠"写一份新的、后台再合并"。**

这句话是整个板块的源头，它推出全部结论：

```
        part 不可变（写入即只读）
                 │
   ┌─────────────┼──────────────┬────────────────┬──────────────────┐
   ▼             ▼              ▼                ▼                  ▼
 更新=重写     删除=打标记     去重发生在       写入必须攒批       JOIN 没有
 整个 part    （等合并才清）   合并时（最终一致） （每次 INSERT 一个  数据重分布
   │             │              │                part）           （右表进内存）
   ▼             ▼              ▼                ▼                  ▼
 更新慢      磁盘不立刻释放   查得到重复行      part 数量失控      大表关联易 OOM
```

**这条主线不是 ClickHouse 独有的**——[搜索与检索](/search/write-and-read) 里的 Elasticsearch 是同一套思路（段不可变），推出来的结论也一一对应：删除是标记、更新是"新增 + 标记旧"、清理靠后台合并、写入要攒批。**理解了一个，另一个就只需看差异。**

## 一、五篇的分工 {#modules}

| # | 篇目 | 解决的问题 | 最值得记的结论 |
|---|---|---|---|
| 1 | [存储引擎：MergeTree 与不可变 part](/bigdata/clickhouse/storage-engine) | 数据怎么组织、索引为什么只有 1/8192 密 | **排序键决定物理顺序，主键只决定索引**；两者不是一回事 |
| 2 | [查询执行与索引体系](/bigdata/clickhouse/query-and-index) | 一次查询为什么能快到那个量级、索引该怎么建 | **`GRANULES` 没变小的索引就是负资产**——建完必须 `EXPLAIN` 验证 |
| 3 | [更新、删除与写入](/bigdata/clickhouse/update-and-write) | 列存的"死穴"分别用哪条路径救 | 三条更新路径代价不同，**但没有一条能把它变成 OLTP** |
| 4 | [副本、分片与集群运维](/bigdata/clickhouse/cluster-and-replica) | 怎么横向扩、副本怎么同步 | **副本与分片解决两件不同的事**；`internal_replication` 必须为 `true` |
| 5 | [OLAP 引擎选型](/bigdata/clickhouse/olap-selection) | 和 Doris / StarRocks / 湖上引擎怎么选 | 选型的第一步是**分负载**，不是看功能表 |

五篇的顺序就是"**从一条根设计，到一个可以放在选型会上的结论**"。

## 二、它在数据链路里的位置 {#position}

**ClickHouse 与 [Doris](/bigdata/doris/) 处在同一层（分析引擎），是替代关系而非串联关系**——同一时刻通常只需其中之一。

```
  业务库 ──▶ CDC ──▶ 流处理（Flink）──▶ ┌─────────────────┐ ──▶ 归档（对象存储 + 湖表）
                                        │  分析引擎         │
                                        │  ├─ Doris        │ ← 主键更新 / 多表 JOIN 占优
                                        │  ├─ ClickHouse   │ ← 单表大扫描 / 纯追加占优
                                        │  └─ StarRocks    │ ← 两者能力之间，偏复杂分析
                                        └─────────────────┘
                                                  │
                                                  ▼
                                        ODS → DWD → DWS → ADS（+ DIM）
```

**两个容易忽略的点**：

1. **两者可以分工，不是二选一**：高吞吐明细与单表分析交给 ClickHouse，面向 BI 的宽表与指标交给 Doris——这在生产中很常见（见[选型 · 推荐矩阵](/bigdata/clickhouse/olap-selection#matrix)）。
2. **它与 [搜索与检索](/search/) 是"相邻但不重叠"的两块**：ES 擅长"找得到 + 带条件聚合"，ClickHouse 擅长"列式大规模聚合"。**先问查询是"检索型"还是"分析型"**，再决定落在哪一侧——ES 的聚合是现算的，列式引擎是为聚合而生的。

## 三、版本现状（时效性极强，下选型结论前必看）{#versions}

**这个板块的很多结论会随版本变化而失效。** 下表是本板块写作时（2026-09）已核实的事实，**引用任何一条前先复核当前版本**：

| 事实 | 版本 / 时间 | 为什么要记住 |
|---|---|---|
| 版本号格式 | CalVer `年.月.补丁.构建号`（如 `26.8.2.7`） | 看到 `26.8.2.7` 要知道它是 2026 年 8 月线 |
| **当前 LTS** | **26.8（2026-08-27，支持至 2027-08-27）**；上一个 LTS 是 26.3（2026-03-26，支持至 2027-03-26） | 生产升级目标应选 LTS |
| **25.8 LTS 已到期** | 2026-08-29 | 还跑 25.8 的属于无支持状态 |
| **真正的 `UPDATE` / `DELETE`** | **25.7（2025-07）**，基于 patch parts | "ClickHouse 不能更新"这句话**不再完全成立** |
| 真 JSON 类型 GA | 25.3（2025-03） | 此前只能当 String 存 |
| 全文检索（列式倒排索引）GA | 26.2（2026-03） | 25.9 实验 → 25.12 beta |
| 向量索引（HNSW）GA | 25.8；QBit 类型 25.10 引入、26.2 GA | 向量检索已进主线 |
| **`async_insert` 默认开启** | **26.3** | **改变数据可见时机**，升级必须验证 |
| **插入去重默认开启** | **26.2** | **改变重复写入的行为** |
| 默认构建要求 **AVX2** | **26.6 起**（x86） | 老 CPU 部署前要确认指令集 |
| 升级兼容性 | **不能降级**（数据格式单向） | 升级走 LTS → LTS，别追月度稳定版 |
| JOIN 能力持续补齐 | runtime filter / 统计信息重排（26.2 默认启用）、IEJoin（26.8）；官方口径 22.4→26.4 TPC-H SF100 快约 26 倍 | **"JOIN 弱"这条结论在快速变化，回答带版本** |
| 惰性物化 / 查询条件缓存 | 25.4 / 25.3 起，均已默认开启 | 很多加速已经"默认就有" |

> **一条纪律**：本板块任何"性能对比"数字都只作为**量级参考**。真实收益取决于表结构、列宽、查询形态与硬件——**要写进方案的数字，必须自己压测**（见[压测报告](/projects/toolkit/perf-report/)）。

## 四、高频考点速查 {#faq}

### 4.1 存储与索引 {#faq-storage}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 为什么 ClickHouse 更新慢？ | 不原地改：改一行要动 N 个列文件，只能重写整个 part | [#why](/bigdata/clickhouse/storage-engine#why) |
| 索引为什么能只记 1/8192？ | 数据物理有序，落在两个标记之间的行必然落在对应键值区间内 | [#granularity](/bigdata/clickhouse/storage-engine#granularity) |
| `ORDER BY` 和 `PRIMARY KEY` 什么区别？ | 排序键定物理顺序，主键只定索引（必须是排序键的前缀） | [#order-by-vs-primary-key](/bigdata/clickhouse/storage-engine#order-by-vs-primary-key) |
| 为什么发一次 `INSERT` 就多一个 part？ | 每次写入生成一个不可变 part，积压到阈值就 `Too many parts` | [#insert-path](/bigdata/clickhouse/update-and-write#insert-path) |
| 分区为什么不能太细？ | 不同分区的 part 永不合并，分区过多 → 各自都是小 part | [#partition-key](/bigdata/clickhouse/storage-engine#partition-key) |

### 4.2 查询与关联 {#faq-query}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 向量化执行快在哪？ | 每 8192 行一次 SIMD 运算，消掉逐行的函数调用与分支预测开销 | [#what-is-vectorized](/bigdata/clickhouse/query-and-index#what-is-vectorized) |
| 跳数索引该给哪列建？ | 能进排序键的优先排序键；剩下按分布选 minmax / set / bloom_filter / ngrambf | [#skip-index-types](/bigdata/clickhouse/query-and-index#skip-index-types) |
| 怎么知道索引真的生效了？ | `EXPLAIN indexes = 1` 看 `Granules` 是否真的变小 | [#explain](/bigdata/clickhouse/query-and-index#explain) |
| `PREWHERE` 和 `WHERE` 差在哪？ | 先读窄的过滤列算出掩码，只对命中的行再读宽列 | [#prewhere](/bigdata/clickhouse/query-and-index#prewhere) |
| 物化视图为什么不是透明加速？ | 它是**插入触发器**：只处理新数据、只写自己的目标表，查询不会自动改写 | [#mv](/bigdata/clickhouse/query-and-index#mv) |
| 物化视图和投影怎么选？ | 要跨表/复杂变换 → 物化视图；只想让特定查询自动变快 → 投影 | [#mv-vs-projection](/bigdata/clickhouse/query-and-index#mv-vs-projection) |
| 为什么大表 JOIN 大表容易 OOM？ | 默认 `hash` 算法把**右表整体读进内存**，且每个节点各建一份 | [#join-algorithm](/bigdata/clickhouse/query-and-index#join-algorithm) |
| 为什么 ClickHouse 不适合高并发？ | 单查询默认吃满整机核数，并发查询之间是资源竞争 | [#what-is-vectorized](/bigdata/clickhouse/query-and-index#what-is-vectorized) |

### 4.3 更新与写入 {#faq-write}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| `ALTER … DELETE` 和 `DELETE FROM` 有什么区别？ | 前者重写 part（慢、立刻释放盘）；后者写掩码（秒级不可见、不省盘） | [#lightweight-delete](/bigdata/clickhouse/update-and-write#lightweight-delete) |
| 25.7 之后的"真更新"是什么？ | 基于 patch parts 写小 delta part，不必重写整个 part | [#patch-parts](/bigdata/clickhouse/update-and-write#patch-parts) |
| `ReplacingMergeTree` 的版本列怎么选？ | 必须单调、对同一主键唯一、非 NULL（推荐"业务时间 + 来源序号"） | [#version-column](/bigdata/clickhouse/update-and-write#version-column) |
| 为什么查了去重表还有重复行？ | 去重发生在合并时，是**最终一致**；要精确得 `FINAL` 或 `argMax` | [#final-cost](/bigdata/clickhouse/update-and-write#final-cost) |
| `wait_for_async_insert = 0` 有什么风险？ | 客户端不等落盘，**插入失败也拿不到反馈**（可能静默丢数） | [#async-insert](/bigdata/clickhouse/update-and-write#async-insert) |
| 插入去重能当幂等用吗？ | 不能：只在"批次内容完全一致"时有效，幂等必须靠主键语义 | [#dedup](/bigdata/clickhouse/update-and-write#dedup) |

### 4.4 集群与运维 {#faq-cluster}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 副本和分片分别解决什么？ | 副本解决可用性与读扩展；分片解决容量与写扩展（加副本不增写入） | [#replica-shard](/bigdata/clickhouse/cluster-and-replica#replica-shard) |
| 副本是主从复制吗？ | 不是：多副本可写，靠 Keeper 登记后各自主动拉取 | [#replication](/bigdata/clickhouse/cluster-and-replica#replication) |
| Keeper 挂了会怎样？ | 已有 part 仍可查，但副本同步停滞——**部分降级**，不是全站不可用 | [#keeper](/bigdata/clickhouse/cluster-and-replica#keeper) |
| `internal_replication` 该设什么？ | **`true`**：每分片只写一个副本，其余靠复制；设成 `false` 会出现重复数据 | [#internal-replication](/bigdata/clickhouse/cluster-and-replica#internal-replication) |
| 加分片会自动均衡吗？ | 不会。路由按分片键算，历史数据必须显式重分布 | [#scale](/bigdata/clickhouse/cluster-and-replica#scale) |
| 日常该盯哪几张系统表？ | `system.parts`（part 数）、`system.mutations`、`system.replicas`（延迟） | [#ops](/bigdata/clickhouse/cluster-and-replica#ops) |

### 4.5 选型 {#faq-selection}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 选型第一步做什么？ | **先把负载分成四类**（纯追加扫描 / 实时更新宽表 / 高并发查询 / 湖上联邦） | [#workload](/bigdata/clickhouse/olap-selection#workload) |
| 最重要的一条判据？ | 更新频率——问"更新后多久必须可见、能不能容忍重复" | [#c1-update](/bigdata/clickhouse/olap-selection#c1-update) |
| ClickHouse 和 Doris 怎么选？ | 纯追加+单表+低并发 → CH；有主键更新+多表 JOIN+并发 → Doris/StarRocks | [#criteria](/bigdata/clickhouse/olap-selection#criteria) |
| 什么情况不该选 ClickHouse？ | 只要出现"改一行、马上要看、还不能重复"，就该考虑别的引擎 | [#when-not](/bigdata/clickhouse/olap-selection#when-not) |

## 五、阅读建议 {#reading}

| 你的情况 | 建议路径 |
|---|---|
| 第一次了解 ClickHouse | [存储引擎](/bigdata/clickhouse/storage-engine#immutable-part) → [查询与索引](/bigdata/clickhouse/query-and-index) |
| 线上 part 数失控 / 查询变慢 | [写入链路](/bigdata/clickhouse/update-and-write#insert-path) → [运维清单](/bigdata/clickhouse/cluster-and-replica#ops) |
| 被问"为什么更新慢" | [不可变 part](/bigdata/clickhouse/storage-engine#why) → [三条更新路径](/bigdata/clickhouse/update-and-write#summary) |
| 正在做引擎选型 | [先分负载](/bigdata/clickhouse/olap-selection#workload) → [五个判据](/bigdata/clickhouse/olap-selection#criteria) → [否决式演练](/bigdata/clickhouse/olap-selection#case) |
| 要建集群 | [副本与分片](/bigdata/clickhouse/cluster-and-replica#replica-shard) → [扩容与重分布](/bigdata/clickhouse/cluster-and-replica#scale) |

> **一条通用纪律**：**这个板块的结论要连版本一起记。** ClickHouse 的迭代速度极快（月度发布），"能不能更新""JOIN 行不行""默认行为是什么"这类问题**每隔几个版本答案就会变**。所以本板块每篇都在关键处标注了版本——**写进方案的任何结论，落笔前先复核一次官方发布说明。**
