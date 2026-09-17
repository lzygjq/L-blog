---
date: 2026-09-17
title: L3 架构师 · 能设计系统，并为取舍负责
desc: 从「负责一块」到「设计一个系统」的六步阅读顺序——分布式地基、服务化与通信、数据架构、方法论、非功能三件套、工程效能与云原生；另附 AI 进不进主链路（含评测与降级）、跳过表、离场自检与本级真正的缺口
order: 3
---

# L3 架构师 · 能设计系统，并为取舍负责

> **口径说明**：这一页是[成长路线](/projects/architect-roadmap/)的第三级清单，回答的是「**在这一级，这些页读到哪就该停**」——不是「这些页属于这一级」。级别是读者侧的属性，不是页面侧的（见[成长路线的第四节](/projects/architect-roadmap/#levels-as-relation)）。上一级见 [L2 高级开发](/projects/architect-roadmap/senior/)。

## 一、这一级的判据

L3 的分水岭是**产出物变了**：从「一段能跑的代码」变成「**一个方案，以及方案的代价**」。L2 的产出要能被验证，L3 的产出要能被评审——而评审的第一问永远是「为什么不选另一个」。

| 维度 | 进入这一级（应该已经会） | 走完这一级（应该能做到） |
|---|---|---|
| **交付** | 对一整块业务负责，能定位并修复线上问题 | 交付一个**系统级设计**：边界、拓扑、数据流、容灾等级、成本 |
| **决策** | 能判断「这个方案行不行」 | 能同时给出 2–3 个方案，并说清每个**放弃了什么** |
| **数据** | 懂事务、锁、复制，能解释延迟从哪来 | 能定**数据架构**：分片键、读写分离、冷热分层、一致性档位 |
| **边界** | 知道系统由哪些服务组成 | 能定服务边界与通信方式，并知道边界划错的代价 |
| **风险** | 出事之后靠复盘发现问题 | 能**提前**把故障模式列出来（单点 / 级联 / 雪崩），并给出防线与演练方式 |

**如果上表右列你还做不到，差异通常不在「技术面不够宽」，而在两件事**：一是没有真正**推演**过一遍完整设计（第 5–6 步的容量与发布链最容易跳过），二是还停留在「选一个最好的」，没练过「**同时讲清三个，并给出淘汰理由**」。

## 二、六步阅读顺序

顺序按依赖排：**先立坐标系（分布式理论），再谈构件（服务与通信），然后是最重的数据架构，最后是方法论、非功能与工程效能**。方法论放在第四步而不是第一步，是因为它需要前面三步的具体问题当作素材——没有具体方案时读 DDD，只会记住名词。

### 第一步 · 分布式地基：先把坐标系立起来

| 页 | 本级怎么读 |
|---|---|
| [分布式理论 · 导览](/distributed/)、[三个层次](/distributed/#map)、[判据](/distributed/#criteria) | 先读这三节——把「取舍层 / 机制层 / 服务化层」分开，本级大部分争论都源于把三层混为一谈 |
| [CAP 与 BASE](/java/spring/spring-cloud/cap-base) | 全读——**本级第一判据**：CAP 不是「三选二」，而是「分区真的发生时你选什么」 |
| [共识协议](/distributed/consensus) | 全读——Raft 的选举与日志复制要能自己画出来；Paxos 读到「它解决什么问题」为止 |
| [数据分布](/distributed/data-partition) | 全读——一致性哈希、虚拟节点、再平衡的代价 |
| [分布式 ID](/distributed/distributed-id) | 全读——雪花算法的时钟回拨是必答题 |
| [分布式协调 · 导览](/distributed/coordination/)、[边界](/distributed/coordination/#map) | 读 `#map`——本级最常犯的错是**用 ZK 去解决其实不需要协调的问题** |
| [数据模型](/distributed/coordination/zookeeper-model)、[ZAB 协议](/distributed/coordination/zab-protocol) | 全读——能说清 ZAB 与 Raft 的差别就够 |
| [跨进程锁与 fencing](/distributed/coordination/coordination-lock) | 全读——fencing token 是「锁过期但持有者还活着」的唯一正解，本级高频追问点 |
| [选型与治理](/distributed/coordination/coordination-selection) | 全读——ZK / etcd / 注册中心各自适合什么 |

### 第二步 · 服务化与通信

| 页 | 本级怎么读 |
|---|---|
| [Spring Cloud · 导览](/java/spring/spring-cloud/)、[三大领域](/java/spring/spring-cloud/#three-domains)、[主线](/java/spring/spring-cloud/#mainline) | 读这两节——先看主线，不要从组件清单开始背 |
| [服务注册与发现](/java/spring/spring-cloud/registry)、[负载均衡](/java/spring/spring-cloud/loadbalancer)、[网关](/java/spring/spring-cloud/gateway) | 全读——这三篇决定服务之间的流量路径与边界 |
| [熔断、限流与降级](/java/spring/spring-cloud/resilience) | 全读——**本级第二重点**：区分「限流是保护自己」与「熔断是保护下游」 |
| [分布式事务](/java/spring/spring-cloud/transaction) | 全读——2PC / TCC / SAGA 各自放弃了什么，以及「能不用就不用」的判据 |
| [接口幂等](/java/spring/spring-cloud/idempotency) | 全读——幂等键放哪一层、去重窗口开多长 |
| [对账与补偿](/methodology/reconciliation) | 全读——幂等管同一请求，对账管做完之后两边是否还一致；**以谁为准先于补偿方向** |
| [分布式任务调度](/java/spring/spring-cloud/scheduling) | 读「集群任务怎么只跑一次」 |
| [链路追踪](/java/spring/spring-cloud/tracing) | 读 Trace / Span 怎么串起来；采集与存储端见第五步 |
| [RPC 与协议 · 导览](/middleware/rpc/)、[边界](/middleware/rpc/#map) | 读 `#map` |
| [序列化与 IDL](/middleware/rpc/serialization)、[协议与传输](/middleware/rpc/protocol-and-transport) | 全读——本级要能解释「内部调用为什么不该用 HTTP + JSON」，以及这么做的代价 |
| [Dubbo 机制](/middleware/rpc/dubbo-internals)、[可靠性治理](/middleware/rpc/rpc-reliability) | 重点读超时与重试——**重试放大会把下游打死**，这是本级最常被追问的一条 |

### 第三步 · 数据架构：本级最重的一步

L2 回答「这条 SQL 为什么慢」，L3 回答「**这些数据该放在几个地方、按什么切、允许不一致到什么程度**」。

| 页 | 本级怎么读 |
|---|---|
| [分库分表](/database/sharding/) | 全读——这次读到迁移方案与在线扩容（L2 只读了「要不要分」那三分之一） |
| [主从复制](/database/mysql/replication) | 回读——这次读延迟监控与读写分离的一致性代价 |
| [Redis 持久化与集群](/database/redis/ha-cluster) | 回读——这次读槽迁移与脑裂时的取舍 |
| [分布式锁与消息队列](/database/redis/lock-and-mq) | 回读——这次读 Redlock 的争议：本级要能说清「为什么它存疑但仍在用」 |
| [多级缓存](/database/redis/multilevel-cache) | 回读——这次读一致性档位怎么定、允许不一致的窗口多长 |
| [数据仓库 · 导览](/bigdata/)、[模块地图](/bigdata/#modules) | 读 `#modules`——本级不必会写 Flink，但要知道数仓分层与 OLAP 选型在整个数据流里的位置 |
| [数仓分层设计](/bigdata/warehouse-design/)、[OLAP 选型](/bigdata/clickhouse/olap-selection) | 全读——「MySQL 之外的那份数据放哪」是标准架构题 |
| [Canal](/bigdata/canal/)、[湖仓](/bigdata/lakehouse/) | 按需——只在业务真的要做数仓时读 |
| [搜索与检索 · 导览](/search/)、[分片与扩展](/search/sharding-and-scale) | 全读——倒排索引的代价与「什么时候该上 ES」 |
| [多租户方法](/methodology/multi-tenancy) | 全读——隔离是**分档不是是非**；横切点漏一个就串；升档前提是共享档已经按租户切开。案例数字以[三级混合](/projects/property-saas/microservice-to-k8s/#multi-tenant)为准 |

### 第四步 · 方法论：从「会做」到「说得清」

| 页 | 本级怎么读 |
|---|---|
| [方法论 · 导览](/methodology/)、[判据](/methodology/#criteria) | 先读 `#criteria`——**什么时候不该上 DDD**，比怎么上更重要 |
| [战略设计](/methodology/ddd-strategic) | 全读——限界上下文是服务边界的第一手依据 |
| [战术设计](/methodology/ddd-tactical)、[落地与反模式](/methodology/ddd-in-practice) | 读反模式那一篇——本级要能识别「为 DDD 而 DDD」 |
| [方案评审](/projects/toolkit/review/) | 全读——会前三件材料、会上四问、散会条件；建模 12 条仍用[落地清单](/methodology/ddd-in-practice#checklist)，两边都过才叫评审过了 |
| [架构风格对比](/methodology/architecture-styles) | 全读——单体 / 微服务 / 事件驱动各自的代价，是方案对比的词汇表 |
| [拆分粒度](/methodology/service-granularity) | 全读——**本级最实用的一篇**：拆过头比不拆更贵 |
| [事件驱动与 CQRS](/methodology/event-driven-cqrs) | 读到「什么时候值得引入事件」为止 |
| [架构演进地图](/projects/architecture-evolution/)、[五层 × 四档](/projects/architecture-evolution/#matrix) | 全读——它把「什么时候该升级架构」变成了可判定的信号，是本级少见的可复用工具 |

### 第五步 · 非功能三件套：高可用 / 安全 / 可观测

这一组是「**架构师与高级开发的第二道分界**」：L2 要求系统不出事，L3 要求**系统出事时你知道它会怎么坏、能坏多久、证据在哪**。

| 页 | 本级怎么读 |
|---|---|
| [高可用 · 导览](/high-availability/)、[判据](/high-availability/#criteria) | 读 `#criteria`——可用性目标从哪里来 |
| [可用性目标](/high-availability/availability-targets) | 全读——**离场自检第 5 题的答案来源** |
| [冗余与故障转移](/high-availability/redundancy-failover)、[多机房架构](/high-availability/multi-datacenter) | 全读——同城双活与异地多活各自放弃了什么 |
| [混沌与演练](/high-availability/chaos-drills) | 全读——本级要能回答「你怎么知道容灾真的有效」 |
| [安全与合规 · 导览](/security/)、[总览](/security/#map) | 读 `#map` 建立全貌 |
| [认证](/security/authentication)、[授权](/security/authorization)、[OAuth2](/security/oauth2) | 全读——本级要能**设计**一套「谁能访问什么」，而不是接入一个登录组件 |
| [攻击防护](/security/web-attack)、[加密与合规](/security/crypto-compliance) | 全读——加密与合规是 L4 的直接前置 |
| [可观测性 · 导览](/cloud-native/observability/)、[三大支柱](/cloud-native/observability/#three-pillars) | 读 `#three-pillars` |
| [指标与 PromQL](/cloud-native/observability/metrics-prometheus)、[日志管道](/cloud-native/observability/logging-pipeline)、[链路与 OTel](/cloud-native/observability/tracing-otel) | 全读——本级要能定「出问题时先看哪三个指标」 |
| [SLO 与告警](/cloud-native/observability/slo-and-alerting) | 全读——**本级第三重点**：SLI / SLO / 错误预算反推架构冗余度 |
| [可观测性选型](/cloud-native/observability/observability-selection) | 读成本与许可那一节——L4 的算账从这里开始 |
| [容量测算与压测方案](/projects/property-saas/capacity-and-perf/)、[六步推导链](/projects/property-saas/capacity-and-perf/#derivation) | 全读——**本站唯一把「容量怎么算」写成推导链的地方**，本级要能复述这六步；防护五层见 [`#protection`](/projects/property-saas/capacity-and-perf/#protection) |

### 第六步 · 工程效能与云原生

| 页 | 本级怎么读 |
|---|---|
| [CI/CD 与发布 · 导览](/cloud-native/cicd/)、[分层](/cloud-native/cicd/#layers) | 读 `#layers`——「从提交到上线」一共有几层 |
| [发布策略](/cloud-native/cicd/release-strategies)、[渐进式交付](/cloud-native/cicd/progressive-delivery) | 全读——蓝绿 / 金丝雀 / 灰度各自适用什么 |
| [回滚与数据迁移](/cloud-native/cicd/rollback-and-migration) | 全读——**本级最容易被忽略的一篇**：能回滚的不只是代码 |
| [云原生 · 导览](/cloud-native/)、[结构](/cloud-native/#structure) | 读 `#structure` |
| [Docker](/cloud-native/docker/)、[Kubernetes](/cloud-native/kubernetes/)、[Helm](/cloud-native/helm/) | 全读——本级要求能读部署编排、能定位「Pod 为什么起不来」，不必会做 Operator 开发 |
| [服务网格](/cloud-native/service-mesh/)、[CRD 与 Operator](/cloud-native/operator/) | 按需——只在多团队共用集群、或岗位方向是平台工程时读 |

### 本级附读 · AI 进不进主链路

L2 停在循环机制。本级要定的是取舍：**LLM 失败时业务怎么办、要不要进主链路、单点能力够不够还是必须编排。**

| 页 | 本级怎么读 |
|---|---|
| [Spring AI · 定位与边界](/ai/spring-ai/#positioning) | 读到「换厂商改配置、价值不是能调模型」——**要能回答：LLM 超时或幻觉时，业务降级成什么** |
| [Advisor](/ai/spring-ai/#advisors) 与 [RAG](/ai/spring-ai/#rag) | 读 Advisor 顺序即语义、RAG 必须做元数据过滤（跨租户泄露）；调优细节按需 |
| [Agent · 多 Agent](/ai/agent-harness/#multi-agent) | 全读——三条同时满足才值得上；否则是负债 |
| [Spring AI Alibaba · 何时用哪个](/ai/spring-ai-alibaba/#when-to-use) | 全读——原子能力 vs 编排，按这条判据选，不要两个都上 |
| [AI 治理 · 评测与人闸](/ai/governance/#eval) | 读评测、人闸、失败降级——**没有降级路径的主链路，等于把可用性交给模型 SLA**。四笔账的签字留给 L4 |
| 数字人实现、MCP 规范细节、ChatClient API | **按需**——岗位方向是 AI 产品再读；本级先定进不进主链路 |

## 三、本级明确跳过的内容

| 跳过的东西 | 留到 | 为什么可以跳 |
|---|---|---|
| 源码级细节（AQS 队列实现、Spring 容器十二步、`HashMap` 扩容） | 已完成，不再回读 | L3 的价值在取舍，不在背实现；但要**能听懂**下属的结论 |
| 单机性能调优（火焰图逐帧、GC 参数逐个试） | 按需 | 本级把调优交给压测与工具，而不是手工试参 |
| 具体中间件的部署与运维细节 | 按需 / SRE 视角 | 本级只需知道它的可用性与边界 |
| 大数据平台运维（Flink 算子调优、集群扩容、Doris 运维） | 按需 / 数据线 | 不是后端架构主线 |
| CRD / Operator 开发 | 按需 | 除非岗位方向就是平台工程 |
| 大前端与移动端 | 不做主线 | 架构师需要能对话，不需要能实现 |
| 语言与框架的新版本特性清单 | 按需 | 本级关注的是「换不换、为什么换」 |
| 面试题库式的八股速记 | 不适用 | 本级的问题没有标准答案，只有取舍理由 |
| Spring AI API 细节、数字人实现、MCP 规范 | 按需 | 本级先定「进不进主链路」；实现留给岗位方向是 AI 产品的人 |

## 四、离场自检：六个问题

**L3 的自检不是「答对」，而是「答得完整」**——每个问题都要能给出方案、代价、以及什么情况下会推翻自己的结论：

| # | 问题 | 检验的是 |
|---|---|---|
| 1 | 这套系统最坏情况下会怎么坏？单点、级联、雪崩三条链路各举一个现场。 | 第五步 |
| 2 | 这里为什么用消息队列而不是同步调用？如果 MQ 挂 30 分钟，业务怎么退？ | 第二步 + 第五步 |
| 3 | 分片键选错会怎样？给一条「一旦选了就不该再改」的判据。 | 第三步 |
| 4 | 从单体拆到微服务，你怎么定义「一个服务」？拆完运维成本涨在哪三处？ | 第四步 |
| 5 | 可用性从 99.9% 提到 99.99%，架构上要多付什么？错误预算怎么算？ | 第五步 |
| 6 | 一个跨 5 个服务的下单流程慢了，你怎么定位是「哪一跳」？ | 第二步 + 第五步 |

第 5 题是 L3 与 L2 的分界：**L2 回答「怎么修」，L3 回答「值不值得修、代价是什么」。** 附读的那一问同样适用这个分界：LLM 进主链路之前，先能说出失败时业务怎么办。

## 五、本站暂无的内容

L1 与 L2 的缺口是**内容缺口**（缺某一篇），L3 不是。这一级的页面已经基本铺满（见[成长路线的覆盖度一节](/projects/architect-roadmap/#coverage)），缺的是别的东西。**AI 也不是内容缺口**——[Spring AI](/ai/spring-ai/) 与 [Agent](/ai/agent-harness/) 已成篇，本级附读只是把「进不进主链路」挂上清单：

| 缺的是什么 | 替代方式 |
|---|---|
| **真实体量**——「在 200 个服务、每天 30 亿请求的系统里做过决策」的经验 | 用[智慧物业 SaaS](/projects/property-saas/)与[大型集团绩效系统](/projects/perf-system/)两个案例当模拟盘：先读[难点地图](/projects/property-saas/#difficulty-map)，**自己把设计重推一遍，再对照它的取舍** |
| **失败的复盘**——别人的方案是怎么错的 | 公开材料里少见完整复盘；本站[架构演进地图的个人路径](/projects/architecture-evolution/#my-path)是替代品，它把「什么时候不该升级」写成了触发信号 |
| **组织与流程**——评审机制、技术债管理、跨团队推动 | 属于 L4 的边界，见下一级 |

**这一节的结论是**：L3 能不能过，取决于你**有没有独立推演过一个完整系统**，而不是有没有读完某一页。这也是下面关联阅读里「案例即模拟盘」那条存在的理由。

## 六、关联阅读

| 你想干什么 | 去哪 |
|---|---|
| 回看 L2 的清单（本级的前置） | [L2 高级开发 · 能负责一块，并对线上问题给出根因](/projects/architect-roadmap/senior/) |
| 往上走一级 | [L4 CIO · 对一条业务线的技术结果负责](/projects/architect-roadmap/cio/) |
| 回到路线总览，看自己在哪一级 | [成长路线](/projects/architect-roadmap/) |
| 看「架构题会被追问到什么程度」 | [面试专题的四层次](/interview/#layers) 与[跨板块连线题](/interview/#threads) |
| 拿两个案例当模拟盘，自己重推一遍设计 | [项目实战](/projects/)、[架构演进地图](/projects/architecture-evolution/#matrix) |
| 把设计写成可评审的材料 | [可验证产出工具箱](/projects/toolkit/)：立项三件套 + [方案评审](/projects/toolkit/review/) + 运行期[故障复盘](/projects/toolkit/postmortem/) |
| 看本级 AI 该读到哪一层 | [AI 应用 · 按四级读](/ai/#by-level) |
