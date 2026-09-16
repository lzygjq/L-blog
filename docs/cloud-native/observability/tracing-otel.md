---
date: 2026-09-16
title: 链路追踪与 OpenTelemetry：一次请求怎么被串起来
sidebar: 链路追踪与 OTel
order: 3
desc: trace 与 span 的树形模型、W3C traceparent 跨进程传播与四类断点、头部采样与尾部采样的取舍、OpenTelemetry 标准与实现的分界及 Java 各信号成熟度、Jaeger/Tempo/Zipkin/SkyWalking 的后端选型与许可差异，以及 Spring Boot 3 的桥接方式
---

# 链路追踪与 OpenTelemetry：一次请求怎么被串起来

日志能告诉你"这次请求报了什么错"，但回答不了"这次请求在哪个服务上耗了 800ms"。要回答后者，你需要**把散落在十几个服务里的执行记录，重新拼成一棵树**——这就是链路追踪。

它的数据模型简单到一句话能说完，但工程上的难点全部集中在**拼接**上：

> **链路的难点不在埋点，而在"上下文能不能穿过所有边界"。**
>
> 一次请求经过网关、服务、消息队列、线程池、异步任务、外部回调——**任何一个环节没把 trace 上下文传下去，整条链就在那里断成两段**。断掉的链路不会报错，它只是**变成两棵孤立的树**，而你在排查时看到的是"这个服务没有下游"这种误导性结论。
>
> 埋点 SDK 帮你解决了"怎么记录 span"，**但断点要你自己找**。

## 一、模型：一棵树，节点是 span {#model}

```
Trace: 8f3a…（贯穿整次请求）
├── Span: API Gateway            [12ms]
├── Span: Order Service          [45ms]
│   ├── Span: MySQL 查询          [8ms]
│   └── Span: 调用 Inventory 服务  [22ms]  ← 瓶颈在这
│       └── Span: Inventory Service [20ms]
└── Span: 响应返回
```

四个必须分清的概念：

| 概念 | 含义 | 关键点 |
|---|---|---|
| **Trace** | 一次完整请求的调用树 | 由入口生成，全局唯一 |
| **Span** | 树上的一个节点（一次操作） | 有 `spanId` 与 `parentSpanId`，**父子关系才是链路的本质** |
| **Context** | 当前 span 的传播载体（含 traceId、spanId、采样标记） | **能跨进程传递的是它，不是 span 本身** |
| **Baggage** | 随上下文一路携带的业务键值 | 便利但危险，见下节 |

**为什么"父子关系"是本质？** 因为真正有用的信息不是"这次请求经过了多少服务"，而是"**时间被花在了树的哪一支上**"。一个扁平的服务列表做不到这件事——按耗时排序最多告诉你"MySQL 慢"，但告诉不了你"是哪个接口的哪一次查询慢"。

> **Baggage 慎用**：它会**随每一次下游调用透传**，所以体积会被放大到"扇出数 × 每次调用"。往里塞用户 ID、租户 ID 还算合理，塞业务对象就是给自己埋了一个"链路越深流量越大"的坑。**要传业务数据，用请求参数，不要用 Baggage。**

## 二、跨进程传播：四个经典断点 {#propagation}

**标准是 W3C `traceparent`**（老系统里还常见 B3、Jaeger 两种头）。它把 `traceId`、`parentSpanId`、采样标记编码成一个 HTTP 头，上游写、下游读并据此创建子 span。

```
traceparent: 00-8f3a2c1e9b7d4f6a8c3e5b2d1a9f7c40-00f067aa0ba902b7-01
              │  └────────── trace-id（32 hex）──────────┘ └─ span-id ─┘ │
              └ 版本                                                       └ 采样标记
```

**链路能否连成一条，取决于"所有经过的组件是否都透传了头部"**。四个最常见的断点：

| 断点 | 为什么会断 | 怎么补 |
|---|---|---|
| **网关 / 反向代理** | 只转发业务头，丢弃未知头（或改写） | 配置透传；主流网关（Nginx/Spring Cloud Gateway/Envoy）都支持 |
| **消息队列** | 生产与消费是**两个独立调用**，没有 HTTP 头可传 | 把上下文**写进消息属性/header**，消费端读取后续接；**MQ 是链路里最容易被忽略的断点** |
| **线程池 / `@Async` / 手动 `new Thread`** | 上下文存在 **ThreadLocal** 里，换线程就丢 | 用包装过的线程池（`TaskDecorator`）、或显式传递 Context |
| **响应式 / 协程** | 同一线程会交替执行多个请求，ThreadLocal 语义失效 | 用 Context 的显式传播（Reactor 有 `contextWrite`、Kotlin 协程有扩展） |

> **一条经验：链路一旦在某些场景"看起来正常、在另一些场景断"，先查线程池和 MQ。** 同步 HTTP 调用的传播通常是 SDK 自动做好的，而异步路径需要显式干预——**通了 90% 的链路比完全不通更难排查**，因为它会让你以为观测是完整的。

**服务网格能解决其中一部分**：Sidecar 在流量劫持层自动传播，**不改应用代码**，见[服务网格的能力边界](/cloud-native/service-mesh/#capabilities)。但它的盲区正是"应用内部的异步与线程池"——**网格管的是进程间，管不了进程内**。

## 三、采样：链路的成本开关 {#sampling}

链路数据量与请求量成正比，一个 5000 QPS 的服务全量采集一天能产生数十亿 span。**采样不是可选优化，是必选项**。

| 路线 | 何时决定 | 优点 | 缺点 |
|---|---|---|---|
| **头部采样** | 请求入口按比例（如 10%）决定 | 实现简单、开销低、**下游无需等待** | **出错的那次很可能没被采到** |
| **尾部采样** | 先在内存/缓冲里攒完整条链，按条件决定（如"有错误"或"耗时 > 1s"必须留） | 保留最有价值的链 | 需要中间缓冲组件、资源占用高、**要等整条链结束** |

**生产上的常见折中**：**头部低比例采样 + 对错误/慢请求强制采样**——在上下文里打一个"强制采样"标记向上游传播，下游看到标记后无条件记录。这样既控制了基线成本，又保证"有问题的请求一定留得下"。

**采样率怎么定？** 从成本倒推，而不是拍脑袋：

1. 算 100% 采集的日数据量（span 数 × 平均 span 大小）；
2. 定可接受的存储与带宽预算；
3. 两者相除得到比例。

**低流量系统直接 100% 反而更简单**——不必一开始就上尾部采样，它的运维成本（缓冲组件、超时、内存）往往超过收益。**判据：如果你的链路系统本身需要被监控，那可能采得太多了。**

## 四、OpenTelemetry：标准与实现的分界 {#otel}

OTel 是这个领域里最容易被误解的东西，因为"OpenTelemetry"同时指四件不同的事：

| 组成 | 是什么 | 谁实现 |
|---|---|---|
| **API** | 你在代码里调用的接口（`Tracer`、`Meter`） | 各语言 SDK |
| **SDK** | API 的默认实现（采样、批处理、导出） | 各语言仓库 |
| **OTLP** | 传输协议（gRPC / HTTP 上的 protobuf） | 任何后端都可以实现 |
| **Collector** | 独立的接收-处理-导出管道 | 可独立部署为 agent 或 gateway |

**为什么这个分层重要？** 因为**它把"埋点"和"存哪"解耦了**：应用只依赖 API 与 OTLP，后端可以随时从 Jaeger 换成 Tempo、换成商业 SaaS，**代码一行不改**。这是它相比"厂商 Agent"最大的价值，也是它成为 CNCF 毕业项目的直接原因。

**Java 侧的成熟度（2026-09 官方状态表）**：

| 信号 | Java SDK 状态 | 备注 |
|---|---|---|
| **Traces** | **Stable** | 生产可用 |
| **Metrics** | **Stable** | 生产可用 |
| **Logs** | **Stable** | 注意：**同一张表里 JS / Python 的 Logs 仍是 Development，Go 是 Beta** —— 跨语言项目要按各自语言的实际状态判断 |
| **Profiles** | Development | 尚未稳定 |

> **一个容易踩的细节**：`opentelemetry-exporter-prometheus` **仍是 alpha**（版本号带 `-alpha`）。所以"用 OTel SDK 直接往 Prometheus 推指标"不是推荐路径——**生产做法是走 OTLP 到 Collector，再由 Collector 导出**（或由 Prometheus 3.x 的原生 OTLP 接收端点收，见[指标篇](/cloud-native/observability/metrics-prometheus#upgrade-30)）。

**OTel 的"代价"也要说清**：它的语义约定（semantic conventions）**仍在演进**，属性名会有变更（例如 HTTP 相关属性在 1.2x 版本前后有过一轮改名）；跨大版本升级时**所有 artifact 必须同版本**（官方通过 BOM 强制同步）。所以引入 OTel 意味着接受一条**持续的小幅迁移成本**，换来的是不绑定厂商。

## 五、后端选型：谁存、谁看 {#backends}

**先分清责任**：**OTel 负责"怎么产生和上报"，后端负责"存与看"**。选型时先定埋点侧（OTel 基本是默认答案），后端是可替换的。

| 后端 | 定位 | 存储 | 许可 |
|---|---|---|---|
| **Jaeger** | CNCF 毕业，成熟、K8s 集成好 | 可配 ES / Cassandra / 对象存储 | **Apache-2.0** |
| **Grafana Tempo** | 规模化、**只需对象存储**（无索引基础设施） | 对象存储 | **AGPL-3.0** |
| **Zipkin** | 老牌、架构简单，适合小规模 | 内存 / ES / MySQL | **Apache-2.0** |
| **Apache SkyWalking** | **Java 生态最省事的一档**，自带拓扑与告警 | 自研 **BanyanDB**（也可接 ES） | **Apache-2.0** |

**SkyWalking 值得单独说**，因为它解决的是"**不想改代码**"这个真实约束：

- **Java Agent 字节码增强、零侵入**——挂上 `-javaagent` 就有链路，适合存量系统；
- 自带**服务拓扑图、告警、指标**，不是纯链路后端，而是"APM 平台"；
- 支持 10+ 语言 Agent，K8s 上还能走 **eBPF**（不碰应用代码直达内核层）；
- 官方称单集群可处理**千亿级**遥测数据点；
- 近两年还加了 **LLM 相关观测**（token 数、调用成本）与内置的 AI 助手。

**代价**是它相对"重"（组件多、有自己的存储），且**绑定它的数据模型**——一旦深度使用其告警与拓扑，迁移成本高于换一个纯链路后端。

> **选型建议**：
> **已在 Grafana 体系**（Prometheus + Loki）→ **Tempo**，一处 UI 打通三支柱；
> **存量 Java 系统、不想改代码** → **SkyWalking**（无侵入收益最大）；
> **要长期可迁移、要最小依赖** → **Jaeger**（Apache-2.0 + 对象存储）；
> **小规模、够用就行** → **Zipkin**。
>
> **许可提醒**：Tempo 是 AGPL-3.0，而 Jaeger / SkyWalking / Zipkin / OTel Collector 都是 Apache-2.0。要做"内嵌、二次分发"时，这个差别是决定性的（与 [Grafana/Loki 的 AGPLv3](/cloud-native/observability/logging-pipeline#two-architectures) 是同一类问题）。

## 六、Spring Boot 3 怎么接 {#spring-boot}

Spring Boot 3 的官方路线是 **Micrometer Tracing**，它本身是"**门面**"——底层可以选择桥接到 OTel 或 Brave：

```xml
<dependency>
  <groupId>io.micrometer</groupId>
  <artifactId>micrometer-tracing-bridge-otel</artifactId>
</dependency>
<dependency>
  <groupId>io.opentelemetry</groupId>
  <artifactId>opentelemetry-exporter-otlp</artifactId>
</dependency>
```

```yaml
management:
  tracing:
    sampling:
      probability: 0.1        # 头部采样 10%
  otlp:
    tracing:
      endpoint: http://otel-collector:4318/v1/traces
```

**这条路线的好处**：`traceId` / `spanId` **由 Micrometer Tracing 自动写入 MDC**，所以日志里带上它们不需要任何业务代码（见[日志篇](/cloud-native/observability/logging-pipeline#structured)）。**三支柱的关联就是在这里天然完成的**。

**"自动埋点"能覆盖多少？** 要清楚预期：

| 覆盖 | 内容 |
|---|---|
| **自动**（starter 自带） | HTTP 服务端与客户端（RestTemplate / WebClient / Feign）、数据库访问（JDBC）、消息（Kafka / RabbitMQ）、缓存 |
| **需手动** | 业务语义重要的内部步骤（"计算价格""校验库存"）、**手工线程池与异步任务**、第三方 SDK 调用 |
| **需注意** | 自动埋点的 span 数量可能远超预期——一个深调用链的数据库访问会产生大量 span，**这也是要采样的原因之一** |

> **与 RPC 层的对接**：跨服务的超时、重试、熔断这些"故障时的行为"已经在[微服务治理](/java/spring/spring-cloud/resilience)与 [RPC 的可靠性](/middleware/rpc/rpc-reliability#tracing)里讲过，**链路的作用是给它们提供证据**——"重试了 3 次"在指标上只表现为延迟升高，只有在链路上才看得见是三次独立的下游调用。

## 七、面试口径 {#interview}

| # | 问题 | 一句话答案 |
|---|---|---|
| 1 | Trace 和 Span 的关系？ | Trace 是一次请求的**树**，Span 是树上的**节点**（一次操作），靠 `parentSpanId` 表达父子关系。**父子关系才是链路的本质**——扁平的服务列表无法回答"时间花在树的哪一支" |
| 2 | 链路是怎么跨进程串起来的？ | **W3C `traceparent` 头**（把 traceId、parentSpanId、采样标记编码成一个头），上游写、下游读并创建子 span。这是标准，老系统里还常见 B3 / Jaeger 两种头 |
| 3 | 链路在哪些地方会断？ | 四类：**网关/代理**（丢未知头）、**消息队列**（没有 HTTP 头可传，要把上下文写进消息属性）、**线程池与 `@Async`**（上下文在 ThreadLocal 里，换线程即丢）、**响应式/协程**（线程会交替执行多个请求，ThreadLocal 语义失效） |
| 4 | 为什么说"链路通了 90% 更危险"？ | 因为**部分连通会让你误以为观测是完整的**：某些路径有链、某些没有，排查时会得出"这个服务没有下游"这类错误结论。所以宁可知道"这里没埋点"，也不要以为埋了 |
| 5 | 服务网格能自动解决链路问题吗？ | **只能解决进程间的部分**（Sidecar 在流量层自动传播、不改代码）。**进程内的异步与线程池是它的盲区**——网格管进程间，管不了进程内 |
| 6 | 头部采样和尾部采样怎么选？ | 头部**在入口决定**：简单、开销低，但**出错的那次可能没被采到**；尾部**攒完整条链再决定**：能留住错误与慢请求，但需要缓冲组件、资源开销高、要等链路结束。生产常用**头部低比例 + 错误/慢请求强制采样** |
| 7 | 采样率怎么定？ | 从成本倒推：算 100% 采集的日数据量 → 定可接受的存储与带宽 → 相除。**低流量系统直接 100% 反而更简单**；如果链路系统本身需要被监控，说明采得太多了 |
| 8 | OpenTelemetry 到底是什么？ | 四件事：**API**（代码里调的接口）、**SDK**（默认实现）、**OTLP**（传输协议）、**Collector**（独立的接收-处理-导出管道）。这个分层的价值是**把"埋点"和"存哪"解耦**——应用只依赖 API 与 OTLP，后端可随时更换而代码不改 |
| 9 | OTel 的 Java 支持到什么程度了？ | **Traces / Metrics / Logs 三个信号在 Java 都是 Stable**（但跨语言别类比：JS 与 Python 的 Logs 仍是 Development、Go 是 Beta、Profiles 全部未稳定）。**另一个坑：`exporter-prometheus` 仍是 alpha**，所以别用它直接推指标，走 OTLP |
| 10 | 引入 OTel 有什么隐性成本？ | **语义约定仍在演进**，属性名会有变更；跨大版本升级时**所有 artifact 必须同版本**（官方用 BOM 强制同步）。所以它是"用持续的小幅迁移成本，换不绑定厂商" |
| 11 | Jaeger / Tempo / SkyWalking 怎么选？ | **已在 Grafana 体系 → Tempo**（一处 UI 打通三支柱）；**存量 Java、不想改代码 → SkyWalking**（Java Agent 零侵入 + 自带拓扑告警）；**要最小依赖与长期可迁移 → Jaeger**；**够用就行 → Zipkin**。注意 **Tempo 是 AGPL-3.0，其余都是 Apache-2.0** |
| 12 | `traceId` 除了串链路还能干什么？ | **它是三个支柱的黏合剂**：写进日志（MDC）→ 可从链路跳到该次请求的全部日志；作为指标标签的关联键 → 从告警跳到慢请求样例。**但它不能当索引维度**（高基数），这条判据与[指标标签基数](/cloud-native/observability/metrics-prometheus#model)、[Loki 的标签模型](/cloud-native/observability/logging-pipeline#loki-paradox)是同一条 |
| 13 | Spring Boot 3 的接入方式？ | **Micrometer Tracing 做门面**，底层桥接 OTel（`micrometer-tracing-bridge-otel`）。好处是 **`traceId`/`spanId` 自动进 MDC**，三支柱的关联在这一步天然完成，业务代码零改动 |

> 上一篇：[日志管道](/cloud-native/observability/logging-pipeline)　|　下一篇：[SLO 与告警](/cloud-native/observability/slo-and-alerting)
