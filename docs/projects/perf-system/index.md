---
date: 2026-09-16
title: 大型集团绩效系统 导览
desc: 面向六万人规模组织的绩效系统技术复盘：外部权威源带来的同步约束、硬截止时间下的填报洪峰、审批链的实时性与可达性、结算期的报表查询压力，以及四篇专题构成的完整设计链路
---

# 大型集团绩效系统 导览

> **口径说明**：本文与下属专题是**架构设计记录**，其中数值为**设计目标与容量估算**，非生产实测数据。可验证产出（ADR / 压测报告 / 架构图）的模板与写法见 [产出工具](/projects/toolkit/)；全文已做脱敏处理，不含任何企业标识、真实人员数据与内部代号。

## 一、这是一个什么样的系统 {#what}

面向大型集团（约 6 万人规模）的**绩效管理系统**：一个考核周期里，员工填目标与自评，上级逐级评分，经过多级审批与校准，最终形成个人的绩效结果与全集团的分析报表。它日常要做的事可以概括为**定目标、填报、审批、算分、出报表**。

| 模块 | 业务内容 | 架构上真正的难点 |
|---|---|---|
| **组织与考核单元** | 组织树、汇报线、考核单元与考核关系 | **数据来自外部 HR 系统**，且口径必须按周期**冻结** |
| **目标与指标** | 目标制定、权重分配、指标库 | 权重与口径的**约束校验**、模板的版本管理 |
| **填报与自评** | 周期填报、提交、修改重提 | **硬截止时间下的峰值写入**、防重复提交 |
| **多级审批** | 逐级审批、会签/或签/加签/转签 | 流转**实时性**、消息**不丢不重**、状态机正确性 |
| **评分与校准** | 上级评分、强制分布、校准调整 | 并发修改的**口径一致**、调整留痕 |
| **报表与分析** | 完成率、分布、排名、同比、导出 | 结算期的**聚合查询压力**、预计算与口径统一 |
| **通知与待办** | 待办提醒、站内信、进度催促 | 推送通道选型、**离线兜底**、多端已读同步 |

### 1.1 六个业务特点，决定了六个架构约束 {#constraints}

这一节是整条设计链的起点——**架构不是从"用什么框架"开始的，是从"业务强加了什么约束"开始的**：

| 业务特点 | 强加的架构约束 |
|---|---|
| 组织架构由**外部 HR 系统**维护，且考核口径必须按周期冻结 | 同步必须**全量 + 增量双链路**（增量管快、全量管对）；数据要**带版本** |
| 填报有**硬截止时间**，全员集中在窗口期两端 | **不能拒绝请求**（预排队 + 异步落库）；容量必须按"高峰集中系数"推，不能按均值 |
| 审批链依赖"**下级先提交**"，且审批人经常不在电脑前 | 推送要实时，但可靠性必须靠**落库 + 拉取**；**推拉结合** |
| 结算期报表被**高频重复查询**，且要沿组织树逐级上卷 | 分析负载**必须外移**；**预计算**的价值在"省掉重复计算" |
| 封板前数据会变（驳回重填、权重调整） | **不能增量汇总**，必须全量重算 + 定义"可变窗口" |
| 数据涉及**个人评分**，与薪酬强相关 | 越权防护与脱敏边界必须**设计期确定**，不能靠上线前扫一遍 |

## 二、四篇专题：一条从"数据"到"呈现"的链路 {#tracks}

四个专题不是并列的四个难点，而是**同一条数据链路上的四段**——组织数据先进来，人往上填，填完往上审，审完汇总呈现。

| # | 专题 | 这一篇回答什么问题 | 链路位置 |
|---|---|---|---|
| 1 | [十万人组织架构同步](/projects/perf-system/org-sync-100k/) | 数据从外部权威源进来，怎么保证"快"又"对"？口径怎么冻住？ | **数据进来** |
| 2 | [高峰期并发填报](/projects/perf-system/peak-filling/) | 硬截止时间下的洪峰怎么接住？热点在插入侧还是更新侧？ | **数据写入** |
| 3 | [多级审批消息实时推送](/projects/perf-system/approval-push/) | 审批状态怎么流转？推送怎么做到实时又不丢不重？ | **状态流转** |
| 4 | [报表预计算](/projects/perf-system/report-precompute/) | 结算期的聚合压力怎么卸掉？预计算省的是计算还是重复计算？ | **数据呈现** |

### 2.1 一条时间线，四篇各管一段 {#timeline}

```text
周期开始            填报期                  结算期               日常
   │                  │                      │                   │
   ▼                  ▼                      ▼                   ▼
① 组织树同步 ──▶ ② 并发填报 ──▶ ③ 多级审批 ──▶ ④ 报表预计算 ──▶ 查询与导出
   │                  │                      │                   │
口径冻结           峰值写入              状态流转与推送       聚合与上卷
   │                  │                      │                   │
全量+增量            削峰+防重              状态机+推拉结合      分层+覆盖写
```

| 阶段 | 主要负荷 | 该阶段最大的风险 |
|---|---|---|
| 周期开始 | 组织数据同步 | 口径没冻住 → 审批流走错人 |
| 填报期 | 写（提交、修改） | 截止前洪峰把连接池吃光 |
| 结算期 | 算 + 查 | 数据还在变时开算 → 算出移动靶 |
| 日常 | 读 | 高频重复聚合把库打挂 |

**读这四篇建议按上表 1→4**，因为它对应的正是**一个周期的真实顺序**。**跳过第 1 篇直接看第 4 篇，会看不懂为什么报表结果必须带"组织树版本"**——那个版本来自第 1 篇的口径冻结。

> **四篇共享一条主线**：**每一篇的答案都不是"加一个组件"，而是"把两件互相冲突的目标拆开"**。
>
> | 冲突 | 拆法 | 在哪一篇 |
> |---|---|---|
> | 快 vs 对（同步） | 增量管快、全量管对 | [①](/projects/perf-system/org-sync-100k/#two-links) |
> | 接住 vs 不拒绝（填报） | 受理同步、落库异步 | [②](/projects/perf-system/peak-filling/#submit-flow) |
> | 实时 vs 可靠（推送） | 推送管时延、拉取管正确 | [③](/projects/perf-system/approval-push/#push-pull) |
> | 快 vs 准（报表） | 预计算管快、版本管准 | [④](/projects/perf-system/report-precompute/#version) |

## 三、技术栈总览 {#stack}

| 域 | 选型 | 为什么是它 |
|---|---|---|
| 语言与框架 | Java + Spring Boot / Spring Cloud | 生态成熟；横切能力（缓存/异步/重试/校验）有统一注解语义 |
| 注册与配置 | Nacos | 注册与配置一体，减少一个组件 |
| 网关 | Spring Cloud Gateway | 限流与鉴权可编程，支持动态规则下发 |
| 服务保护 | Sentinel | 规则可动态下发；与网关限流分层配合 |
| 关系库 | MySQL（主从） | 事务与生态；结果表也在它上面（结果集小，无需上 OLAP） |
| 缓存 | Redis | 热点拦截、幂等令牌、计数打散、结果缓存 |
| 消息 | RocketMQ / Kafka | 削峰与解耦；顺序消息用于审批事件按实例分区 |
| 实时推送 | WebSocket + 厂商推送 + 站内信兜底 | 前台实时、后台依赖系统通道、兜底靠落库 |
| 任务调度 | 分布式调度平台（分片 + 执行权互斥） | 防重复执行；大数据量任务分片广播 |
| 分析库 | Doris | 结果上的二次聚合与多维上卷 |
| 同步 | CDC / 增量事件 + 定时全量 | 双链路：增量管快、全量管对 |
| 可观测 | 指标 + 结构化日志 + 链路追踪 | 长连接数、队列深度、行锁等待都必须能看见 |

> 这张表里的每一行在站内都有对应正文：横切能力（缓存/异步/重试/校验）→ [Spring 横切能力](/java/spring/spring-framework/crosscutting/)；网关与保护 → [Spring Cloud](/java/spring/spring-cloud/)；消息与顺序性 → [消息队列](/middleware/)；缓存模式 → [数据存储](/database/)；分析与上卷 → [数据仓库](/bigdata/)；容器与滚动更新 → [云原生](/cloud-native/)；越权与脱敏 → [安全与合规](/security/)。

## 四、难点与设计的对应关系 {#difficulty-map}

把"业务难点 → 架构设计 → 具体写法"钉在一起，是这类项目最容易讲清楚的方式：

| 业务难点 | 架构设计 | 详见 |
|---|---|---|
| 组织数据来自外部系统，拿不到 binlog | 全量 + 增量双链路（选型被组织边界决定） | [组织同步 · 方案对比](/projects/perf-system/org-sync-100k/#four-ways) |
| 考核口径在周期内不能变 | 口径冻结 + 组织树版本列 | [组织同步 · 三条约束](/projects/perf-system/org-sync-100k/#constraints) |
| 树形结构的查询与写入模式冲突 | 邻接表 + 闭包表（读靠 JOIN、写只改一行） | [组织同步 · 树形存储](/projects/perf-system/org-sync-100k/#tree-models) |
| 全量同步期间不能读到"半棵树" | 影子表 + 一次原子切换 | [组织同步 · 影子表](/projects/perf-system/org-sync-100k/#shadow-table) |
| 增量事件的重复与乱序 | 单调版本号（一个条件同时解决两件事） | [组织同步 · 增量幂等](/projects/perf-system/org-sync-100k/#inc-idempotency) |
| 源端漏发却没人知道 | 三档对账 + "偶发补偿、系统报警"纪律 | [组织同步 · 对账](/projects/perf-system/org-sync-100k/#diff-handling) |
| 填报名单漏人、算错范围 | 环检测 / 孤儿 / 深度 / 父子矛盾的四项校验 | [组织同步 · 树形校验](/projects/perf-system/org-sync-100k/#tree-validation) |
| 截止时间不可协商，不能拒绝请求 | 受理同步 + 落库异步 + 状态可查 | [并发填报 · 提交链路](/projects/perf-system/peak-filling/#submit-flow) |
| 峰值是均值的几十倍 | 五步推导 + 高峰集中系数 + 分批放号 | [并发填报 · 流量预估](/projects/perf-system/peak-filling/#peak-factor) |
| 用户重复点击、弱网重发 | 令牌 / 唯一索引 / 状态机三重防线 | [并发填报 · 防重](/projects/perf-system/peak-filling/#three-layers) |
| 以为"打散主键"能提升写入 | 分清插入热点与更新热点（随机主键更慢） | [并发填报 · 写入热点](/projects/perf-system/peak-filling/#hotspot) |
| 行锁等待把连接池吃光 | 计数拆行 / 号段 / 条件更新 | [并发填报 · 打散手段](/projects/perf-system/peak-filling/#sharding-hotspot) |
| 轮询式刷新造成无效请求洪峰 | 推送削掉轮询 + 限流三维口径 | [并发填报 · 限流](/projects/perf-system/peak-filling/#ratelimit) |
| 审批要实时，但长连接会断 | 推送管时延、拉取管正确（推拉结合） | [审批推送 · 推拉结合](/projects/perf-system/approval-push/#push-pull) |
| 会签/或签/加签语义纠缠 | 两级状态机 + 实例状态由节点推导 | [审批推送 · 状态机](/projects/perf-system/approval-push/#state-machine) |
| "业务写库"与"消息发出"不能同事务 | 本地消息表（事务性发件箱） | [审批推送 · 本地消息表](/projects/perf-system/approval-push/#local-message-table) |
| 推送里带状态，丢一条就永久错 | 推送只传信号，状态永远靠拉取 | [审批推送 · 信号非状态](/projects/perf-system/approval-push/#push-signal-not-state) |
| 离线多天的客户端怎么补 | 补"状态"而不是补"过程" | [审批推送 · 离线补偿](/projects/perf-system/approval-push/#offline-compensation) |
| 报表被高频重复聚合 | 四档方案 + "省的是重复计算"判据 | [报表预计算 · 四档](/projects/perf-system/report-precompute/#four-tiers) |
| 维度组合无法穷举 | 按访问分布预计算 + 实时兜底 | [报表预计算 · 粒度爆炸](/projects/perf-system/report-precompute/#grain-explosion) |
| 报表口径各处不一致 | 结果表按展示形状设计（存派生值） | [报表预计算 · 结果表](/projects/perf-system/report-precompute/#wide-narrow) |
| 数据还在变就算，算出移动靶 | 可变窗口 + 全量重算优先 | [报表预计算 · 全量与增量](/projects/perf-system/report-precompute/#full-vs-inc) |
| 调度重跑导致数据翻倍 | 分区覆盖写（输出是输入的函数） | [报表预计算 · 幂等写](/projects/perf-system/report-precompute/#idempotent-write) |
| 预计算与实时算出的数不一致 | 指标定义只写一次（**尚未解掉**） | [报表预计算 · 设计目标](/projects/perf-system/report-precompute/#targets) |

## 五、阅读建议 {#reading}

| 你的关注点 | 建议路径 |
|---|---|
| 想看完整的数据链路 | [组织同步](/projects/perf-system/org-sync-100k/) → [并发填报](/projects/perf-system/peak-filling/) → [审批推送](/projects/perf-system/approval-push/) → [报表预计算](/projects/perf-system/report-precompute/) |
| 想先自己推再对照 | [闭卷模拟盘 · 绩效](/projects/toolkit/drill/perf-system)（先写） |
| 想看"数据量级"类难点怎么讲 | [组织同步 · 树形存储](/projects/perf-system/org-sync-100k/#tree-models) → [对账三档](/projects/perf-system/org-sync-100k/#three-checks) |
| 想看"流量洪峰"类难点怎么讲 | [并发填报 · 流量预估](/projects/perf-system/peak-filling/#peak-factor) → [写入热点](/projects/perf-system/peak-filling/#hotspot) |
| 想看"实时性 / 最终一致"类难点怎么讲 | [审批推送 · 推拉结合](/projects/perf-system/approval-push/#push-pull) → [本地消息表](/projects/perf-system/approval-push/#local-message-table) |
| 想看"查询性能"类难点怎么讲 | [报表预计算 · 四档方案](/projects/perf-system/report-precompute/#four-tiers) → [结果表设计](/projects/perf-system/report-precompute/#result-table) |
| 想看容量数字怎么从"猜"变"证" | [容量测算与压测方案](/projects/property-saas/capacity-and-perf/) → [压测报告（方法）](/projects/toolkit/perf-report/) |
| 想体会"两个案例的不同侧重" | [智慧物业 SaaS 导览](/projects/property-saas/)（架构演进与多租户）←→ 本板块（单点性能与一致性） |

> **写作约定**：案例层只讲"我们怎么用的"，方法层只讲"怎么用"——两者的分工见 [产出工具导览](/projects/toolkit/)。
>
> **四篇共同遵守一条纪律**：区分「设计目标」与「实测数据」。所有数值都标注了它是估算还是实测，并在每篇末尾单列「设计目标与尚未验证的部分」——**未验证项写出来不是方案不完整，而是边界声明**。
>
> **与姊妹案例的分工**：[智慧物业 SaaS](/projects/property-saas/) 侧重**架构演进与多租户**（从单体到微服务、从业务库到数仓、从手工发版到声明式编排）；本板块侧重**单点性能与一致性**（一个难点深挖到底：现象 → 假设 → 证据 → 结论）。同一个技术点在两边的讲法不同，**不是重复，是两种视角**。
