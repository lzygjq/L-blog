---
date: 2026-09-16
title: 监控与可观测 · 板块导览
sidebar: 监控与可观测
desc: 可观测性的主线是"能下钻到单次请求"、三支柱靠统一字段关联、五个分篇的地图与阅读顺序、与搜索/可用性/服务网格等板块的分工边界，以及 59 题面试索引
---

# 监控与可观测 · 板块导览

这个板块原先只有一页概览——四个支柱（Metrics / Logging / Tracing / 告警）各自压在几百字里，够回答"是什么"，不够回答"怎么配、会踩什么坑"。

现在拆成五篇：**先讲清指标与查询语义**（它最容易"看着对、算错了"），**再讲日志的成本结构与那条高基数陷阱**，**然后是链路的传播断点**，**接着把告警从"拍阈值"升级为"算预算"**，**最后收口到成本、许可与落地顺序**。

> **主线：能下钻到单次请求，才叫可观测。**
>
> 三个支柱的**关联字段是否统一**（`service` + `traceId` 全站一致），就是"可观测体系"与"三个各自独立的工具"的唯一分界线。
>
> 没有这层统一，你有的只是三个系统、三套时间戳，以及排查时必须人工对账的麻烦。

## 一、一条主线：从"告警响"到"定位到那一次请求" {#thread}

```
告警响（指标异常）
  → 看板确认范围（全局还是某接口？什么时候开始？）
  → 链路定位到具体一跳（哪个下游慢/挂）
  → 日志看那一次的入参、堆栈与下游原始报错
  → 修复 → 复盘 → 沉淀为告警或 SLO
```

**这条路径能不能走通，取决于三件事**：

| 环 | 依赖 | 缺失时的表现 |
|---|---|---|
| 告警响 | 指标算得对（类型、窗口、桶） | 图在跳，但告警没响；或天天响却没人管 |
| 能定位到"哪一跳" | 链路上下文穿过了所有边界 | 链路断成几棵孤树，得出"这个服务没有下游"的错误结论 |
| 能看到"那一次的细节" | 日志结构化 + `traceId` 进了 MDC | 只能靠时间戳和关键词猜，翻日志越翻越乱 |
| 长期不复发 | SLO / 错误预算 / 复盘闭环 | 同一个故障反复发生，每次都当"新问题"处理 |

**所以这个板块不是"工具手册"**——它讲的是这条路径上每一环**为什么会在真实环境里断掉**。

## 二、五篇地图 {#map}

| 篇 | 主题 | 一句话主线 | 关键落点 |
|---|---|---|---|
| [一、指标与 Prometheus](/cloud-native/observability/metrics-prometheus) | 数据模型 · 查询 · 看板 | **能不能算对，取决于类型选对、标签控住、窗口语义理解准** | 标签基数是头号杀手；Histogram vs Summary；`le="1"` 被规范化导致看板静默查空 |
| [二、日志管道](/cloud-native/observability/logging-pipeline) | 结构化 · 采集 · 存储路线 | **成本与价值由同一个东西决定：结构** | 全文索引 vs 标签索引；**Loki 想按 `traceId` 查却最不适合**；四步压成本 |
| [三、链路追踪与 OTel](/cloud-native/observability/tracing-otel) | 传播 · 采样 · 标准与后端 | **难点不在埋点，在上下文能不能穿过所有边界** | 四类断点（网关/MQ/线程池/响应式）；头部与尾部采样；OTel 的四层分工 |
| [四、SLO 与告警](/cloud-native/observability/slo-and-alerting) | 信号 · 预算 · 应急复盘 | **告警的合法性只有一条：响的时候有人知道该做什么** | 四个黄金信号；SLI/SLO/SLA 分界；多窗口燃烧率；十类反模式 |
| [五、成本、许可与落地](/cloud-native/observability/observability-selection) | 成本曲线 · 许可 · 顺序 | **不是"装了什么"，而是"愿意为多少信息付多少钱"** | 三条成本曲线；Apache-2.0 / AGPLv3 / SSPL 三档差异；六阶段落地顺序 |

## 三、三支柱：各自擅长什么、靠什么关联 {#three-pillars}

| 维度 | Metrics | Logging | Tracing |
|---|---|---|---|
| 回答 | **趋势与"是否异常"** | **"具体发生了什么"** | **"慢在哪一跳、谁调用了谁"** |
| 数据量 | 小（可长期留存） | **最大** | 中（与采样率成正比） |
| 成本曲线 | 近似平缓 | **最陡** | 与请求量线性 |
| 成本开关 | **标签基数** | 分级 → 采样 → 分层 | **采样率** |
| 典型工具 | Prometheus + Grafana | ELK / Loki | Jaeger / Tempo / SkyWalking |
| 主要失效点 | 基数爆炸、桶设计粗 | 无结构、量失控 | 上下文断、采样偏 |

**关联靠两个字段，全站统一**：

| 字段 | 作用 | 谁写入 |
|---|---|---|
| `service`（或 `service.name`） | 三条信号指向同一个服务 | 应用 + 采集端打标 |
| **`traceId`** | 从告警 → 慢请求 → 完整日志的钥匙 | 链路库自动写入 MDC + 作为指标标签 |

> **`traceId` 是关联字段，不是检索维度。** 把它当标签/索引键，在 Prometheus 表现为 OOM、在 Loki 表现为查询崩塌——**同一条判据的两种表现**：凡"取值随业务量增长"的东西，都不能当索引维度。

## 四、与其他板块的关系 {#relations}

| 板块 | 分工 | 边界 |
|---|---|---|
| [搜索与检索](/search/#thread)（5 篇） | **ES 引擎原理**：倒排索引、查询算分、分片、写入链路、ILM 生命周期 | 本板块的日志篇**只讲"日志怎么产生、怎么采、怎么关联"**，存储与检索机制一律回链到那边，不重复 |
| [可用性目标与口径](/high-availability/availability-targets#caliber) | **几个 9 的换算、RTO/RPO、错误预算的定义** | 本板块的 SLO 篇**只讲"SLO 如何驱动告警"**（燃烧率、多窗口），可用性目标的算法不重复 |
| [混沌与演练](/high-availability/chaos-drills) | 故障注入的方法与成熟度 | 演练**要验的是"告警响没响、runbook 准不准"**，这是与本板块的交叉点 |
| [K8s 探针](/cloud-native/kubernetes/#probes) | liveness / readiness 的语义 | Actuator 端点该交给哪种探针，在那边讲 |
| [服务网格](/cloud-native/service-mesh/#capabilities) | Sidecar 在流量层自动传播链路上下文 | **网格管进程间，管不了进程内**——线程池与异步任务是它的盲区 |
| [微服务治理](/java/spring/spring-cloud/resilience) · [RPC 可靠性](/middleware/rpc/rpc-reliability#tracing) | 超时、重试、熔断、优雅上下线 | 本板块的链路篇是**给这些行为提供证据**：重试了 3 次在指标上只表现为延迟升高，只有链路看得见是三次独立调用 |
| [分布式协调](/distributed/coordination/#thread) | 协调服务自身怎么选型与治理 | 那套服务的**指标与告警**同样适用本板块的判据 |

## 五、版本与许可现状 {#versions}

| 组件 | 现状（2026-09） | 需要注意 |
|---|---|---|
| **Prometheus** | **3.0（2024-11）** 是 2.0 以来首个大版本，**3.5 为 LTS** | 3.x 有**静默行为变化**（`le` 值规范化、区间左开右闭）；回退路径只到 v2.55 |
| 原生直方图 | **v3.8（2025-11）才 stable**，采集仍需 `scrape_native_histograms: true` | v3.9 起旧的 `--enable-feature=native-histograms` 已失效 |
| **OpenTelemetry** | CNCF 毕业；**Java 的 Traces/Metrics/Logs 均 Stable** | 跨语言别类比（JS/Python 的 Logs 仍 Development）；**`exporter-prometheus` 仍 alpha** |
| **Loki** | **v3.7.7（2026-08）**，3.6.x 并行维护，仅两条线 | **Promtail 已在 3.7 线被移除**（并入 Grafana Alloy）；`boltdb-shipper` 废弃、必须 `tsdb`+schema v13 |
| **Grafana / Loki / Tempo** | **AGPL-3.0**（2021-04 从 Apache 2.0 变更） | 自用无碍；**内嵌进对外服务需评估**，部分大厂禁用 AGPL |
| **Elasticsearch / Kibana** | **SSPL + Elastic License（非 OSI）**（2021-02 变更） | 对外提供检索服务受限制，**OpenSearch（Apache-2.0）** 是许可更安全的分支 |
| Prometheus / OTel / Jaeger / SkyWalking / Fluent Bit | **Apache-2.0** | 最宽松，可内嵌 |

## 六、面试高频索引（59 题） {#interview}

按"被问到的概率 × 答不好会暴露功底"排序，前 12 条：

| # | 问题 | 一句话答案 | 展开 |
|---|---|---|---|
| 1 | 监控与可观测差在哪？ | 监控回答"**已知问题发生了吗**"（预定义阈值）；可观测回答"**没见过的问题为什么发生**"（从输出推断内部状态） | [指标篇 Q1](/cloud-native/observability/metrics-prometheus#interview) |
| 2 | 三支柱靠什么关联？ | 统一字段 **`service` + `traceId`**；这是"可观测体系"与"三个独立工具"的唯一分界线 | [链路篇 Q12](/cloud-native/observability/tracing-otel#interview) |
| 3 | Histogram 为什么优于 Summary？ | **分位数能否跨实例合并**——Summary 的分位数是客户端各算各的，**不可相加** | [指标篇 Q3](/cloud-native/observability/metrics-prometheus#interview) |
| 4 | 什么会把 Prometheus 打挂？ | **标签基数爆炸**。判据：该维度取值是否随业务量增长 | [指标篇 Q5](/cloud-native/observability/metrics-prometheus#interview) |
| 5 | 链路在哪些地方会断？ | 四类：**网关/代理**（丢头）、**MQ**（无 HTTP 头）、**线程池/`@Async`**（ThreadLocal 丢）、**响应式/协程** | [链路篇 Q3](/cloud-native/observability/tracing-otel#interview) |
| 6 | 为什么不能把 `traceId` 当索引维度？ | 它**高基数**（每请求一个值）：Prometheus 会 OOM，Loki 会导致索引与查询崩塌 | [日志篇 Q6](/cloud-native/observability/logging-pipeline#interview) |
| 7 | SLI / SLO / SLA 怎么区分？ | **测出来的数 / 内部目标 / 对外承诺 + 赔偿**；顺序不可反，且 **SLA 必须比 SLO 宽松** | [告警篇 Q4](/cloud-native/observability/slo-and-alerting#interview) |
| 8 | 错误预算有什么用？ | 把告警从"是否超阈值"变成"**还能撑多久**"，并为"停止发布转稳定性"提供客观触发条件 | [告警篇 Q5](/cloud-native/observability/slo-and-alerting#interview) |
| 9 | 为什么燃烧率要双窗口？ | **长窗口管"值不值得管"，短窗口管"还在不在发生"**；只有一个都会出问题 | [告警篇 Q6](/cloud-native/observability/slo-and-alerting#interview) |
| 10 | 最危险的故障是哪类？ | **"指标消失"**——采集挂了表现为"没有异常"，靠 `up == 0` / `absent()` 兜底 | [告警篇 Q9](/cloud-native/observability/slo-and-alerting#interview) |
| 11 | 从 2.x 升到 3.x 最容易踩什么？ | 两处**静默**生效：**区间选择器改左开右闭**、**`le="1"` 被规范化为 `le="1.0"`** | [指标篇 Q9](/cloud-native/observability/metrics-prometheus#interview) |
| 12 | 可观测性该按什么顺序搭？ | **日志结构化 → 指标告警 → SLO → 链路 → 日志平台 → 成本治理**；**日志排第五**，因为它最贵且依赖前四层 | [成本篇 Q9](/cloud-native/observability/observability-selection#interview) |

> 五篇内容页共 **59 题**，上面只列了最该先背的 12 条；各篇末尾都有自己的完整题单。

## 七、边界与阅读建议 {#todo}

**本板块不覆盖**：

- **Elasticsearch 的引擎原理与运维**（倒排索引、算分、分片、ILM）→ 见[搜索与检索](/search/#thread)；
- **K8s 探针语义与滚动发布**→ 见[Kubernetes](/cloud-native/kubernetes/#probes)；
- **超时/重试/熔断的实现**→ 见[微服务治理](/java/spring/spring-cloud/resilience) 与 [RPC 可靠性](/middleware/rpc/rpc-reliability#timeout)；
- **几个 9 的换算与 RTO/RPO**→ 见[可用性目标](/high-availability/availability-targets#caliber)。

**阅读顺序按角色**：

| 你的处境 | 建议顺序 |
|---|---|
| 第一次系统接触 | 导览 → 指标 → 日志 → 链路 → SLO → 成本 |
| 要立刻配一套可用的 | [成本篇的六阶段](/cloud-native/observability/observability-selection#sequence) → 指标 → SLO |
| 面试准备 | 上面 12 条索引 → 各篇末尾题单 → 指标篇的升级坑 |
| 线上正在排查 | 指标篇[§1 范围判定](/cloud-native/observability/metrics-prometheus#scope) → 告警篇[§6 排查顺序](/cloud-native/observability/slo-and-alerting#incident) |
