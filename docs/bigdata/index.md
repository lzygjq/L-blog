---
date: 2026-09-15
title: 数据仓库 · 板块导览
desc: 数据从业务库到分析侧的完整链路——变更怎么同步出来、放进什么引擎算、冷数据归档到哪里、以及数据在仓内怎么分层组织
---

# 数据仓库 · 板块导览

这个板块回答一个连续的问题：**业务库里的数据，怎么变成能放心用的分析结果。**

它由五段组成，缺一段链路就是断的——前一段的输出是后一段的输入：

```
  业务 MySQL
  （在线事务）
       │
       │  ① 变更怎么同步出来
       ▼
  ┌──────────┐   binlog
  │  CDC     │───────────┐
  │ 变更捕获  │           │
  └──────────┘           │  ② 流上做什么加工（清洗 · 打宽 · 聚合）
                         ▼
                  ┌──────────────┐
                  │   Flink      │   时间语义 · 状态与一致性
                  │   流处理      │   SQL 与 Join · 背压调优
                  └──────┬───────┘
                         │  写入
                         ▼
                  ┌──────────────┐   分区过期   ┌──────────────┐
                  │   分析库      │────────────▶│  对象存储     │
                  │  列式 MPP     │  归档迁移    │  + 湖表       │
                  └──────────────┘              └──────────────┘
                         │
                         ▼
                数据在仓内怎么分层组织
                ODS → DWD → DWS → ADS（+ DIM）
```

**一条演进主线**：数据要先能被**拿到**（同步），再要能被**实时加工**（流处理），然后要能**算得快**（引擎），再要能**留得住且留得起**（归档），最后要能被**组织得不产生二义**（建模）。五篇的顺序就是这条线。

## 一、五篇的分工 {#modules}

| # | 篇目 | 解决的问题 | 最值得记的结论 |
|---|---|---|---|
| 1 | [Canal 数据同步](/bigdata/canal/) | 业务库的变更怎么准确、完整地送出来 | CDC 读的是数据库自己的变更日志；**语义是"至少一次"，幂等必须在写入侧做** |
| 2 | [Flink 流处理](/bigdata/flink/) | 变更出来之后，在流上怎么做清洗、打宽、聚合 | 流处理难在**时间不确定、状态要保命、结果要只算一次**；端到端一致取决于 sink |
| 3 | [Doris 数仓](/bigdata/doris/) | 分析负载用什么引擎承接、表怎么建 | 表模型是性能的分水岭；**存算分离下 Unique 模型的写入频率有硬约束** |
| 4 | [Lakehouse：Iceberg / MinIO / 冷热分层](/bigdata/lakehouse/) | 冷数据放哪儿、成本怎么降下来 | Lakehouse 没发明新存储，它把"表"**从存储层搬到了元数据层** |
| 5 | [数仓分层建模](/bigdata/warehouse-design/) | 数据怎么组织才不产生口径分叉 | 分层解决的是**协作与口径**问题，不是性能问题 |

## 二、与其他板块的交叉点 {#cross}

这一块的知识不是孤立的——几乎每一篇都踩在别的板块上：

| 交叉板块 | 交叉点 | 说明 |
|---|---|---|
| [数据存储](/database/) | binlog、事务、MVCC、主从 | CDC 的能力与限制全部继承自 MySQL 复制；索引与事务的理解决定了"哪些表适合同步" |
| [消息队列](/middleware/) | 削峰、多下游、可重放 | binlog 位点只能前进，**中间加 MQ 是必要而非优化** |
| [云原生](/cloud-native/) | 部署形态、弹性、可观测 | 分析组件与消费端都跑在编排层上；容量与延迟问题最终要靠可观测定位 |
| [项目实战](/projects/property-saas/data-warehouse/) | 落地案例 | 同一套链路在具体项目里的选型与否决理由、分层组织、迁移顺序 |

## 三、高频考点速查 {#faq}

### 3.1 同步侧 {#faq-cdc}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| CDC 和定时轮询的本质区别？ | 轮询看"最终状态"（看不见删除与字段级变更），CDC 读变更日志拿行级前后镜像 | [#why-cdc](/bigdata/canal/#why-cdc) |
| 为什么必须 `binlog_format = ROW`？ | STATEMENT/MIXED 拿不到"影响哪几行"；且 `binlog_row_image` 必须为 `FULL` | [#row-format](/bigdata/canal/#row-format) |
| 为什么用 GTID 而不是 file + position？ | 事务级唯一标识，与文件、偏移、主库身份无关，切主后可续读 | [#position](/bigdata/canal/#position) |
| Canal 的 `server_id` 为什么要唯一？ | 它伪装成从库，`server_id` 冲突会被 MySQL 断开连接 | [#dump-protocol](/bigdata/canal/#dump-protocol) |
| 为什么下游还要自己做幂等？ | CDC 是 At Least Once——位点在下游 ACK 后才推进，ACK 前宕机必然重放 | [#ha-semantics](/bigdata/canal/#ha-semantics) |
| 重复和乱序一起怎么处理？ | 主键 UPSERT + 单调的 sequence 列（防旧事件覆盖新值） | [#idempotency-order](/bigdata/canal/#idempotency-order) |
| 四种 CDC 方案怎么选？ | 已有多下游解耦→Debezium；国内中等规模→Canal；要连流计算→Flink CDC | [#compare](/bigdata/canal/#compare) |

### 3.2 流处理（Flink）{#faq-flink}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 水印是什么？能保证数据不丢吗？ | 一条**由你配置的进度声明**，不是事实；乱序超过假设时数据仍会迟到 | [#watermark-def](/bigdata/flink/time-and-watermark#watermark-def) |
| 夜里窗口几小时才输出一次？ | 空闲分区顶住了水印；`withIdleness` 是解法，值要大于真实静默间隔 | [#idleness](/bigdata/flink/time-and-watermark#idleness) |
| Flink 的 exactly-once 保证了什么？ | **状态的** exactly-once；端到端要 sink 幂等或事务配合 | [#three-parts](/bigdata/flink/state-and-checkpoint#three-parts) |
| 四种 Join 怎么选？ | 差别在"状态有没有下界"——有时间关联就用 Interval Join | [#join-compare](/bigdata/flink/sql-and-joins#join-compare) |
| 背压在某个算子上说明什么？ | 瓶颈在它的**下游**——顺着数据流往下找 | [#mechanism](/bigdata/flink/backpressure-and-tuning#mechanism) |
| 检查点一直超时怎么办？ | 先治背压（超时往往是它的症状），再考虑非对齐 / 增量 | [#checkpoint-tuning](/bigdata/flink/backpressure-and-tuning#checkpoint-tuning) |
| 全量同步 CDC 要停业务吗？ | 不用——增量快照按主键切块，无锁读 + 变更回填 | [#incremental](/bigdata/flink/cdc-to-lakehouse#incremental) |

### 3.3 引擎侧 {#faq-doris}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| FE 和 BE 分别做什么？ | FE 管元数据与查询规划（Paxos 高可用），BE 管存储与计算 | [#fe-be](/bigdata/doris/#fe-be) |
| 存算一体和存算分离怎么选？代价是什么？ | 数据量小/延迟敏感→一体；PB 级/有潮汐→分离，代价是 MOW 要走分布式表锁，单表导入频率受限 | [#shared-nothing-vs-storage](/bigdata/doris/#shared-nothing-vs-storage) |
| 三种表模型怎么选？ | 只追加→Duplicate；写入即聚合→Aggregate；有主键会变→Unique（MOW） | [#models](/bigdata/doris/#models) |
| 分区分桶怎么设计？ | 分区按时间（数据裁剪 + 生命周期），分桶取 JOIN/GROUP BY 维度、单桶控制在合理区间 | [#partition-bucket](/bigdata/doris/#partition-bucket) |
| 物化视图为什么必须配 `grace_period`？ | 不配则基表一有变化视图就失效，命中率趋近于零 | [#materialized-view](/bigdata/doris/#materialized-view) |
| 四条写入链路怎么分工？ | Stream Load 业务直推；Routine Load 消费流；Broker Load 批量回填；INSERT INTO SELECT 仓内加工 | [#ingest](/bigdata/doris/#ingest) |
| 为什么别用 `DELETE` 清历史？ | Duplicate/Aggregate 上的 `DELETE` 靠谓词累积，会拖慢后续所有查询——用 `TRUNCATE PARTITION` | [#query-update](/bigdata/doris/#query-update) |

### 3.4 归档侧 {#faq-lakehouse}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 有了 Parquet，为什么还要 Iceberg？ | 文件系统只有"文件"没有"表"：缺原子提交、隔离、Schema 载体、分区裁剪、统计、回滚 | [#why-lakehouse](/bigdata/lakehouse/#why-lakehouse) |
| Iceberg 的 ACID 怎么实现的？ | 一次原子的**元数据指针切换**；提交前崩溃只留无害孤儿文件，并发写靠乐观并发控制 | [#atomic-commit](/bigdata/lakehouse/#atomic-commit) |
| 格式 v2 / v3 的关键区别？ | v2 引入行级删除（MoR 可行）；v3 加删除向量、默认列值、行级血缘 | [#format-version](/bigdata/lakehouse/#format-version) |
| Catalog 怎么选？ | 单库自用→JDBC；多引擎共享→**REST Catalog**；既有 Hive 体系→HMS（但原子提交支持偏弱） | [#catalog](/bigdata/lakehouse/#catalog) |
| 为什么要对象存储而不是 HDFS？ | 无元数据集中瓶颈、加节点即扩容、S3 生态即插即用；代价是尾延迟更高 | [#why-minio](/bigdata/lakehouse/#why-minio) |
| 冷热分层分几层？ | 热（本地 SSD）/ 温（SSD+HDD）/ 冷（对象存储 + 湖表），按**访问特征**切 | [#three-tiers](/bigdata/lakehouse/#three-tiers) |
| TTL 迁移怎么保证不丢数据？ | **先写、再校验、最后删源**，按分区可重跑，留迁移台账 | [#ttl-migration](/bigdata/lakehouse/#ttl-migration) |

### 3.5 建模侧 {#faq-modeling}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 为什么要分层？ | 分层的收益是**协作与口径**，不是性能——让同一件事只算一次 | [#why-layered](/bigdata/warehouse-design/#why-layered) |
| 四层各解决什么？一层能省吗？ | ODS 留原始、DWD 统一清洗与粒度、DWS 预聚合、ADS 面向场景；去掉任一层都会在别处付出代价 | [#layers](/bigdata/warehouse-design/#layers) |
| 事实表有哪三种？ | 事务事实（一事件一行）、周期快照（无事件也记）、累积快照（一行走完流程，专为漏斗设计） | [#fact-tables](/bigdata/warehouse-design/#fact-tables) |
| SCD Type 2 和拉链表什么关系？ | Type 2 的物理实现就是拉链表；守住"区间不重叠不空洞"与"每日合并幂等" | [#scd](/bigdata/warehouse-design/#scd) |
| 原子指标和派生指标为什么分开？ | 原子指标少而稳定、派生指标多而组合；分开才能"改一处、全部跟着对" | [#metric-levels](/bigdata/warehouse-design/#metric-levels) |
| 实时数仓能替代离线吗？ | 不能，只能分工：实时做近似（大屏/监控），精确口径由离线产出，且必须配每日对账 | [#realtime-batch](/bigdata/warehouse-design/#realtime-batch) |

## 四、阅读建议 {#reading}

| 你的情况 | 建议路径 |
|---|---|
| 要建一条实时同步链路 | [Canal](/bigdata/canal/) → [Flink 流处理](/bigdata/flink/) → [数仓分层建模](/bigdata/warehouse-design/) → [Doris](/bigdata/doris/) |
| 作业跑不住 / 结果对不上账 | [Flink · 背压与调优](/bigdata/flink/backpressure-and-tuning) → [端到端三段论](/bigdata/flink/state-and-checkpoint#three-parts) |
| 选分析引擎 / 正在做技术选型 | [Doris](/bigdata/doris/) → [Lakehouse](/bigdata/lakehouse/) |
| 报表慢、业务库被压 | [数仓分层建模](/bigdata/warehouse-design/#why-layered) → [Doris](/bigdata/doris/#query-update) |
| 存储成本高、要归档历史 | [Lakehouse](/bigdata/lakehouse/) → [Doris 的表与分区](/bigdata/doris/#partition-bucket) |
| 想看完整落地案例 | [大数据架构方案 → 数仓落地](/projects/property-saas/data-warehouse/) |

> **一条通用纪律**：链条上的每一步都要能被**校验**。同步要对账、迁移要先验后删、指标要有单一出处——**没有校验环节的链路，出问题时无法判断归因**，这是"看起来在跑"与"可以放心用"之间的全部差别。
