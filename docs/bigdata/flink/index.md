---
date: 2026-09-16
title: Flink 流处理 · 导览
desc: 流处理的三大困难（时间不确定 / 状态要保命 / 结果要只算一次）、五篇的分工与因果主线、与原四段（同步·引擎·归档·建模）的衔接位置、五个方向的高频考点速查
---

# Flink 流处理 · 导览

这个板块回答一个问题：**数据在"到达即处理"的模式下，为什么不能像批处理那样简单地写。**

**一句话主线**：

> **流处理的全部复杂性，来自三件事——数据无界、到达乱序、系统会失败。** 五篇正文按这三件事展开，每一篇解决其中一件，并留下交给下一篇的问题。

```
   ① 时间不确定                ② 状态要保命                ③ 结果要只算一次
   ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
   │ 数据会晚到     │          │ 记着的东西    │          │ 失败重放后    │
   │ 用什么时间算？  │ ───────▶ │ 放在哪、     │ ───────▶ │ 外部系统会不会 │
   │ 什么时候算？    │          │ 挂了还在吗？  │          │ 看见两次？     │
   └──────────────┘          └──────────────┘          └──────────────┘
          │                        │                          │
          ▼                        ▼                          ▼
     水印与窗口                检查点与状态后端            三段论与两阶段提交
     （第 1 篇）                （第 2 篇）                  （第 2 篇后半）

          ┌────────────────────────────────────────────────┐
          │  写代码：SQL 与各类 Join（第 3 篇）              │
          │  跑得住：部署、背压与调优（第 4 篇）             │
          │  接两头：CDC 入湖入仓（第 5 篇）                 │
          └────────────────────────────────────────────────┘
```

**为什么三件事是"递进"而不是并列**：只有先确定了"什么时候算"（水印），才谈得上"算的时候记着什么"（状态）；只有状态能在故障后恢复到一致的点，才谈得上"结果对外只发生一次"。**跳过前两件去追求第三件，得到的只是配置上的自我安慰。**

## 一、五篇的分工 {#modules}

| # | 篇目 | 解决的问题 | 最值得记的结论 |
|---|---|---|---|
| 1 | [时间语义与水印](/bigdata/flink/time-and-watermark) | 数据乱序时，凭什么说"可以算了" | 水印不是"保证没有更早的数据"，而是**一条由你配置的进度声明**；它不丢数据，只是宣告"不再等待" |
| 2 | [状态、检查点与端到端一致](/bigdata/flink/state-and-checkpoint) | 记着的东西怎么保命、失败后算重了还是算漏了 | Flink 保证的是**状态**的 exactly-once；**端到端取决于 sink 能不能幂等或事务** |
| 3 | [Flink SQL 与各类 Join](/bigdata/flink/sql-and-joins) | 实际工作里怎么写 | 流入 = 表在变化；**四种 Join 的差别不在语法，在"状态有没有下界"** |
| 4 | [部署、背压与调优](/bigdata/flink/backpressure-and-tuning) | 逻辑对了，怎么让它稳定跑住 | **背压出现在哪个算子，瓶颈就在它的下游**——定位要顺着数据流往下找 |
| 5 | [Flink CDC 与入湖入仓](/bigdata/flink/cdc-to-lakehouse) | 数据怎么进来、怎么出去 | 增量快照**无锁**的前提是表有主键；**出口选表模型先问"下游支不支持 upsert"** |

## 二、与板块其余四段的衔接 {#cross}

Flink 补上的是**原来断掉的那一段**——在此之前，数据仓库板块里从"变更送出来"到"放进分析库"之间是空的。

```
   业务 MySQL
       │
       │  ① 变更怎么同步出来
       ▼
   Canal / Flink CDC ────────────────▶ [canal 篇] + [Flink 第 5 篇]
       │
       │  ② 流上做什么加工（★ 本板块补上的这一段）
       ▼
   时间语义 · 状态一致 · SQL 与 Join · 调优 ──▶ [Flink 第 1~4 篇]
       │
       │  ③ 写到哪
       ▼
   Doris（热） / Paimon·Iceberg（冷） ──▶ [doris 篇] + [lakehouse 篇]
       │
       │  ④ 数据怎么组织才不产生口径分叉
       ▼
   ODS → DWD → DWS → ADS（+ DIM） ──────▶ [warehouse-design 篇]
```

| 交叉板块 | 交叉点 | 说明 |
|---|---|---|
| [Canal 数据同步](/bigdata/canal/) | 变更捕获的选型与语义 | 两者的分工见 [Flink CDC vs Canal](/bigdata/flink/cdc-to-lakehouse#vs-canal)："变更要给多个下游消费吗"是判据 |
| [Doris 数仓](/bigdata/doris/) | 目标表模型与导入频率 | 上游是 CDC 就**必须是 Unique 模型**（[为什么](/bigdata/flink/cdc-to-lakehouse#sink-doris)）；存算分离下的导入频率约束回指 Doris 篇 |
| [Lakehouse](/bigdata/lakehouse/) | 原子提交、Paimon 与 Iceberg 的分工 | 写湖的一致性靠**元数据指针的原子切换**（[两条路径的对比](/bigdata/flink/cdc-to-lakehouse#two-paths)） |
| [数仓分层建模](/bigdata/warehouse-design/) | 实时与离线的分工 | 实时做近似、精确口径归离线，且必须配每日对账——**Flink 不改变这条分工** |
| [消息队列](/middleware/) | 从 Kafka 读的语义与偏移 | source 可重放是端到端一致的第一段前提 |
| [数据存储](/database/) | binlog、事务、隔离级别 | CDC 的能力与限制全部继承自源库的复制机制 |

## 三、高频考点速查 {#faq}

### 3.1 时间与水印 {#faq-time}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 水印是什么？能保证数据不丢吗？ | 它是一条**单调递增的进度断言**，不是事实；真实乱序超过假设时数据仍会迟到 | [#watermark-def](/bigdata/flink/time-and-watermark#watermark-def) |
| 事件时间 / 处理时间怎么选？ | 需要"可重放、可对账"就用事件时间；只看"当下状态"（监控类）才用处理时间 | [#time-semantics](/bigdata/flink/time-and-watermark#time-semantics) |
| 为什么多输入算子的水印取最小值？ | 最慢的那一路决定整体进度；取 max 会让慢通道的数据被当成迟到 | [#propagation](/bigdata/flink/time-and-watermark#propagation) |
| **作业夜里几小时才输出一次？** | 空闲分区把水印顶住了——`withIdleness` 是解法，但值要大于真实的静默间隔 | [#idleness](/bigdata/flink/time-and-watermark#idleness) |
| 滑动窗口为什么把状态撑爆？ | 每个元素属于 `size/slide` 个窗口；`size/slide > 10` 就该重新审视需求 | [#window-types](/bigdata/flink/time-and-watermark#window-types) |
| `allowedLateness` 和调大水印容忍度有什么区别？ | 前者只影响指定窗口且会**多次输出**（下游需 upsert）；后者推迟**所有**窗口的触发 | [#allowed-lateness](/bigdata/flink/time-and-watermark#allowed-lateness) |
| 迟到数据怎么定容忍度？ | **不能拍脑袋**——用侧输出流监控实际迟到量，再据此收紧 | [#late-data](/bigdata/flink/time-and-watermark#late-data) |

### 3.2 状态与一致性 {#faq-state}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| Flink 的 exactly-once 保证了什么？ | **状态的** exactly-once；端到端要 sink 幂等或事务配合 | [#three-parts](/bigdata/flink/state-and-checkpoint#three-parts) |
| 屏障对齐为什么必须等？ | 不等会让快照混入"快照之后"的数据 → 状态不一致；代价是延迟尖峰，背压下用**非对齐**绕开 | [#barrier-flow](/bigdata/flink/state-and-checkpoint#barrier-flow) |
| 两阶段提交 sink 的两个坑？ | `transaction.timeout.ms` 要大于"检查点间隔+恢复时间"；`transactionalIdPrefix` 必须固定（否则留僵尸事务） | [#sink-strategies](/bigdata/flink/state-and-checkpoint#sink-strategies) |
| 状态后端怎么选？ | 小状态用堆；大状态用 RocksDB；云原生大状态用 **ForSt**（远端 DFS，2.0 新增） | [#state-backend](/bigdata/flink/state-and-checkpoint#state-backend) |
| `ValueState<Map>` 和 `MapState` 差在哪？ | 前者每次读写都序列化**整个 Map**，后者是增量读写子键 | [#keyed-forms](/bigdata/flink/state-and-checkpoint#keyed-forms) |
| Checkpoint 与 Savepoint？ | 自动/周期/为恢复 vs 手动/全量/为变更；**1.x↔2.x 状态都不兼容** | [#checkpoint-vs-savepoint](/bigdata/flink/state-and-checkpoint#checkpoint-vs-savepoint) |
| 状态越来越大怎么办？ | 状态 TTL（注意默认惰性清理）→ 增量检查点 → 改设计；入口是 WebUI 的 state size 排名 | [#state-management](/bigdata/flink/state-and-checkpoint#state-management) |

### 3.3 SQL 与 Join {#faq-sql}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 为什么 `count(*)` 的结果流不是 append？ | 结果是**动态表**，值会被更新 → 输出是含 `-U`/`+U` 的 changelog | [#changelog](/bigdata/flink/sql-and-joins#changelog) |
| Regular Join 和 Interval Join 的本质区别？ | **状态有没有下界**——前者只增不减，后者按事件时间区间自动清理 | [#interval-join](/bigdata/flink/sql-and-joins#interval-join) |
| Lookup Join 和 Temporal Join 怎么选？ | 问"结果明天重跑还一样吗"——要一样就用事件时间 Temporal Join | [#temporal-join](/bigdata/flink/sql-and-joins#temporal-join) |
| 维表 Join 把 MySQL 打爆了怎么办？ | 缓存 → 异步 → 检查 missing-key 缓存 → 改架构（换 Redis 或转成流做时态表 Join） | [#lookup-join](/bigdata/flink/sql-and-joins#lookup-join) |
| `mini-batch` 是干什么的？ | 攒一批再读写状态，减少状态访问；代价是结果最多延迟 `allow-latency` | [#tuning-sql](/bigdata/flink/sql-and-joins#tuning-sql) |
| 窗口结果差了整整 8 小时？ | **先查时区**，不要查水印——"差整数小时"是时区问题的指纹 | [#tuning-sql](/bigdata/flink/sql-and-joins#tuning-sql) |
| SQL 和 DataStream 怎么分工？ | 声明式意图用 SQL；需要"维护自己的状态机"回 DataStream；可混用 | [#vs-datastream](/bigdata/flink/sql-and-joins#vs-datastream) |

### 3.4 部署与调优 {#faq-tuning}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 背压在某个算子上，说明什么问题？ | 瓶颈在它的**下游**——定位要顺着数据流往下找 | [#mechanism](/bigdata/flink/backpressure-and-tuning#mechanism) |
| 为什么用 credit 流控而不是 TCP 反压？ | TCP 反压会连 checkpoint barrier 与心跳一起堵住 → 作业假死 | [#credit](/bigdata/flink/backpressure-and-tuning#credit) |
| Kafka 积压持续增长怎么定位？ | 倾斜 → sink/lookup → GC/状态 → 最后才是并行度与网络缓冲；**先解决倾斜** | [#root-causes](/bigdata/flink/backpressure-and-tuning#root-causes) |
| `rebalance` 和加盐的区别？ | `rebalance` **破坏 key 分组**，只能用于与 key 无关的场景；按 key 聚合的倾斜必须加盐或两阶段 | [#skew](/bigdata/flink/backpressure-and-tuning#skew) |
| 检查点一直超时，调大 timeout 行吗？ | 不行——超时往往是**背压的症状**；顺序是治背压 → 非对齐 → 增量 → 放宽 interval | [#checkpoint-tuning](/bigdata/flink/backpressure-and-tuning#checkpoint-tuning) |
| 最该盯哪个指标？ | **Kafka `records-lag-max`**——它是唯一反映端到端延迟的指标 | [#monitoring](/bigdata/flink/backpressure-and-tuning#monitoring) |
| 并行度设多少？ | 下限看 source 分区数、上限看瓶颈算子可切分度；**大状态算子并行度太高反而有害** | [#parallelism-source](/bigdata/flink/backpressure-and-tuning#parallelism-source) |

### 3.5 CDC 与入湖入仓 {#faq-cdc}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 全量同步要停业务吗？ | **不用**——增量快照把表切块，每块"记位点 → 无锁读 → 变更回填" | [#incremental](/bigdata/flink/cdc-to-lakehouse#incremental) |
| Flink CDC 和 Canal 怎么选？ | 判据是"变更要不要给多个下游消费"——要就落一份 Kafka 解耦 | [#vs-canal](/bigdata/flink/cdc-to-lakehouse#vs-canal) |
| 写 Doris 为什么必须是 Unique 模型？ | CDC 的"更新"是 `-U`+`+U` 两条记录，Duplicate 模型下会留下两个金额 | [#sink-doris](/bigdata/flink/cdc-to-lakehouse#sink-doris) |
| 写 Doris 和写湖的一致性差别？ | Doris 靠 Stream Load 的两阶段提交；写湖靠**元数据指针的原子切换** | [#two-paths](/bigdata/flink/cdc-to-lakehouse#two-paths) |
| 整库同步最常踩的坑？ | 分库分表合并的主键冲突；以及对"顺序性"的预期过高（**只有单表单主键内有序**） | [#difficulties](/bigdata/flink/cdc-to-lakehouse#difficulties) |
| `server-time-zone` 为什么必须配？ | 不配按 UTC 解析 → 时间列整体差 8 小时（窗口结果跟着偏） | [#sql-connector](/bigdata/flink/cdc-to-lakehouse#sql-connector) |
| 2.0 的"流式湖仓"具体是什么？ | Flink + **Paimon** 的组合；物化表目前**只支持 Paimon**——这是真实的选型约束 | [#sink-lake](/bigdata/flink/cdc-to-lakehouse#sink-lake) |

## 四、版本现状（照抄网上配置前先看这里）{#version}

| 事实 | 影响 |
|---|---|
| **Flink 2.0.0 GA 于 2025-03-24**（2.2.1 稳定版 2026-05-15、2.3.0 2026-06-25） | 2.x 是**破坏性升级**，不是"换个 jar" |
| 配置文件 `flink-conf.yaml` → **`config.yaml`** | 老配置直接不被识别 |
| `DataSet` API、Scala `DataStream`/`DataSet`、`SourceFunction`/`SinkFunction`/`Sink V1` **被彻底移除** | 不是废弃是删除；存量作业要重写 |
| **per-job 部署模式移除**，改用 Application 模式 | 提交脚本要改 |
| 最低 Java 11，推荐 17 | —— |
| **1.x 与 2.x 状态不兼容** | 不能靠 savepoint 跨大版本恢复；升级窗口按"重写 + 回归"排 |
| **ForSt 状态后端**（状态远端化）+ 异步执行模型 | 云原生友好，但**仍标注实验性**，按灰度 + 可回滚落地 |
| **物化表**：`FRESHNESS` 声明新鲜度，流/批由系统选 | 生产可用，但**只支持 Paimon** |
| **Flink CDC 3.6.0 GA 于 2026-03-30** | 版本号与 Flink 自身是两条线，升级要分别确认 |

## 五、阅读建议 {#reading}

| 你的情况 | 建议路径 |
|---|---|
| 从零了解流处理 | [时间语义与水印](/bigdata/flink/time-and-watermark) → [状态与检查点](/bigdata/flink/state-and-checkpoint) |
| 面试突击 | [五个方向速查表](#faq) 逐条过，遇到答不上的点回正文补 |
| 作业跑不住、Kafka 积压 | [背压与调优](/bigdata/flink/backpressure-and-tuning) → 定位倾斜 → [检查点调优](/bigdata/flink/backpressure-and-tuning#checkpoint-tuning) |
| 结果重复 / 对不上账 | [端到端三段论](/bigdata/flink/state-and-checkpoint#three-parts) → [Sink 两条路径](/bigdata/flink/state-and-checkpoint#sink-strategies) |
| 要建一条 CDC 链路 | [CDC 与入湖入仓](/bigdata/flink/cdc-to-lakehouse) → [Canal 篇的选型对照](/bigdata/canal/#compare) |
| 正在做技术选型 | [版本现状](#version) → [SQL 与 DataStream 的分工](/bigdata/flink/sql-and-joins#vs-datastream) |

> **一条纪律**：链路上的每一步都要能被**校验**。背压要能定位、水印要能观测迟到量、检查点要能看见耗时、事务要能对账。**Flink 引入的不是"更快的链路"，而是"更多需要校验的环节"**——每一个环节都是"看起来在跑"与"可以放心用"之间的分界线。
