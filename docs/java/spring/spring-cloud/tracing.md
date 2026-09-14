---
order: 5
date: 2026-09-14
title: 链路追踪
desc: TraceId 如何把散落在多台机器上的日志串成一条链、Skywalking 的三层概念与无侵入探针，以及完整的排障流程
---

# 链路追踪

## 一、没有链路追踪时，排障是怎么做的 {#why}

一个下单请求经过 5 个服务，最后返回 500。现在要回答一个问题：**到底哪一步慢、哪一步错了**？

没有链路追踪，只能这样查：

```text
① 在 5 台机器上分别 grep 日志，按关键词（订单号）过滤
② 把 5 份日志按【时间】排序拼接
   · 机器时钟有偏差 → 顺序对不上
   · 有的服务没打订单号 → 找不到
③ 逐个服务看接口耗时，猜是哪一跳慢
```

这套流程的问题不是"能不能查"，而是**查一次要半小时，且完全依赖每个服务都恰好打了可关联的日志字段**。

链路追踪做的事就一件：**给一次请求分配一个全局唯一的 ID，并让它在跨服务调用时一路透传下去**。有了它，一条日志搜索就能捞出这次请求经过的每一跳。

## 二、核心概念 {#concepts}

| 概念 | 含义 |
|---|---|
| **Trace** | 一次完整请求的调用链，有唯一 `TraceId` |
| **Span** | 链路中的一个工作单元（一次 RPC、一次 DB 查询、一段方法执行），有 `SpanId` 和 `ParentSpanId` |
| **Context Propagation** | 把 TraceId / SpanId 通过**请求头**传给下游 |
| **Sampling** | 采样：不是每个请求都全量采集（否则开销和存储都扛不住） |

**用一张图看清 Span 的嵌套关系**：

```text
Trace: 7f3a9c2e...（一次用户请求，贯穿 4 个服务）

网关        ├─ Span A  [20ms]  ─────────────────────────────────────┐
              │                                                     │
订单服务       │    ├─ Span B  [18ms] ───────────────────────────┐   │
                │      │                                          │   │
库存服务         │      │   ├─ Span C [12ms] ──┐                   │   │
                   │      │    │                                    │   │
数据库              │      │    │   └─ Span D [10ms] ← 耗时在这里  │   │
                   │      │    └────────────────┘                   │   │
优惠券服务          │      └─ Span E [2ms]                        │   │
                  └───────────────────────────────────────────────┘   │
                                                                    └───┘

瀑布图一眼看出：Span B 占了 A 的 90%，其中 Span C 又占了 B 的 2/3
```

**跨服务传递靠请求头**，现代标准是 W3C Trace Context：

```text
traceparent: 00-7f3a9c2e1b4d5a6c8e9f0a1b2c3d4e5f-00f067aa0ba902b7-01
             ─┬ ─────────────── trace-id ────────────── ── span-id ── ─┬
              │                                                        │
          版本 00                                              采样标志 01
```

**为什么要用标准头而不是自定义头**：链路追踪的价值取决于**所有服务都用同一套约定**。如果 A 用 `X-Trace-Id`、B 用 `trace_id`，链路就在跨团队、跨中间件（网关、MQ）处断掉了。

**采样是必须的，不是可选的**：全量采集意味着每次调用都要额外写一条 span 数据。真实系统里 `TraceId` 的生成和透传开销很小，但**上报和存储开销很大**，所以生产环境通常按 1%~10% 采样。代价是"出问题的那个请求可能刚好没被采样"——所以实践中会给**异常请求强制采样**（错误率 100% 采集，正常请求低比例采集）。

## 三、Skywalking {#skywalking}

Apache Skywalking 是国内使用最广的 APM（Application Performance Monitoring）方案之一，特点是**无侵入 + 功能全 + 自带 UI**。

### 3.1 三个观测层次 {#skywalking-concepts}

这三个概念是它的数据模型基础，**面试常问它们的边界**：

| 概念 | 是什么 | 对应关系 |
|---|---|---|
| **Service（服务）** | 一组提供相同能力的逻辑单元 | 一个微服务 = 一个 Service |
| **Service Instance（实例）** | 服务的**一个运行中的进程 / 物理部署** | 一个 JVM 进程 = 一个 Instance |
| **Endpoint（端点）** | 具体的入口，如一个 HTTP 接口或一个 RPC 方法 | 一个接口 = 一个 Endpoint |

**为什么这个划分重要**：因为它们回答不同粒度的问题——

- **Service 粒度**：整体错误率、平均 RT —— 用于判断"哪个服务有问题"
- **Instance 粒度**：单台机器负载、是否某台异常 —— 用于判断"是不是只有一台有问题"（典型场景：发布时新旧版本混部，只有新实例报错）
- **Endpoint 粒度**：具体接口的慢请求分布 —— 用于判断"是这个服务的哪个接口慢"

排障时就是**从粗到细**：先看 Service 谁的 RT 高了 → 再看是不是某个 Instance → 最后定位到具体 Endpoint。

### 3.2 无侵入探针 {#skywalking-agent}

```bash
# 启动时挂一个 agent，业务代码零改动
java -javaagent:/path/skywalking-agent.jar \
     -Dskywalking.agent.service_name=order-service \
     -Dskywalking.collector.backend_service=127.0.0.1:11800 \
     -jar order-service.jar
```

原理是 **Java Agent + 字节码增强**：在类加载时改写字节码，把埋点逻辑织入到已有的方法里（HTTP 客户端、JDBC 驱动、Redis 客户端、MQ 客户端等都有现成的插件）。

**"无侵入"这个特点的实际价值**：

| | 无侵入（Java Agent） | 侵入式（代码埋点） |
|---|---|---|
| 业务代码改动 | **零改动** | 每个调用点都要手动埋点 |
| 接入成本 | 改启动参数 | 改代码 + 重新测试 |
| 覆盖完整性 | 框架层自动覆盖，**不易漏** | 靠人记得写，容易漏 |
| 定制能力 | 受插件支持范围限制 | 想埋哪埋哪 |

**注意 Skywalking 不是只有追踪**——它同时采指标：JVM（堆、GC、线程）、主机（CPU、内存、磁盘）、以及服务级的吞吐 / RT / 错误率。所以它是 APM（应用性能监控）而不只是 tracing。

### 3.3 与 Sleuth + Zipkin 的对比 {#compare}

| | Skywalking | Spring Cloud Sleuth + Zipkin |
|---|---|---|
| 接入方式 | **Java Agent，无侵入** | 引入依赖 + 代码埋点（较新版本可自动） |
| 数据能力 | 追踪 + 指标 + 拓扑 + 告警 | 以追踪为主 |
| 存储 | ES（生产推荐）/ MySQL / H2 / BanyanDB | ES / MySQL / 内存 |
| UI | 自带，功能完整 | Zipkin 较简单 |
| 语言支持 | Java / .NET / Go / Node 等多语言 agent | 以 Spring 生态为主 |
| 现状 | Apache 顶级项目，活跃 | Sleuth 自 Spring Cloud **2022.0 起由 Micrometer Tracing 接替** |

## 四、实际怎么用 {#usage}

链路追踪的价值分两块：**事后排障**和**事前发现**。很多人只想到前者，而后者——尤其是压测场景——回报更高。

### 4.1 事前：靠它发现问题 {#usage-proactive}

| 用途 | 具体做法 |
|---|---|
| **压测时的瓶颈定位** | 压测跑完打开拓扑图 / 端点列表，**一眼看出哪个服务或接口响应慢**，直接拿到优化清单，不用逐台机器看监控 |
| **日常健康巡检** | 定期看不健康的实例、异常率上升的接口，在用户投诉之前处理 |
| **服务依赖拓扑** | 自动生成调用关系图，**接手一个陌生系统时，这张图比读代码快得多**；也能发现"意外调用"（比如订单服务偷偷直连了库存的库） |
| **告警** | 配置规则：错误率超阈值、RT 超阈值、实例下线 → 短信 / 邮件 / webhook 通知到负责人，上线后第一时间知道出问题 |

**告警规则的设计要点**：告警要**绑定负责人**（谁能修就发给谁），否则报警会被全员忽略；阈值要留余量，避免告警疲劳——这也是运维里最常见的失败模式。

### 4.2 事后：标准排障流程 {#usage-diagnose}

```text
① 拿到线索：用户反馈"下单慢" / 告警"order-service RT 超阈值"
        │
        ▼
② 看服务级指标：order-service 的 RT 确实涨了 → 是它自己慢，还是被下游拖的？
        │
        ▼
③ 打开【服务拓扑】：order-service → inventory-service 这条边的 RT 同步上涨
        │
        ▼
④ 定位到 Endpoint：inventory-service 的 /stock/deduct 接口 RT 从 10ms 涨到 800ms
        │
        ▼
⑤ 抓一个慢 Trace 看瀑布图：
        · Span 顺序：扣减库存 → 写库存流水 → 发 MQ
        · 耗时集中在【写库存流水】这一个 Span
        │
        ▼
⑥ 定位根因：该 Span 对应的 SQL 没走索引 → 拿到具体 SQL 去优化
```

**关键在第 ⑤ 步的瀑布图**：它把"服务级指标异常"变成了"具体哪一行代码慢"。没有链路追踪，这一步只能靠猜。

## 五、和日志打通 {#mdc}

链路追踪的 UI 看的是聚合视图，但**具体某个请求的详细报错信息还是在日志里**。所以两者必须打通：**把 TraceId 打进日志**。

```java
// logback 的 pattern 里加 %X{traceId}
// <pattern>%d{HH:mm:ss.SSS} [%thread] %X{traceId} %-5level %logger{36} - %msg%n</pattern>

// 效果：日志文件里能直接看到 traceId，复制它去 Skywalking 搜就能定位整条链
// 14:23:01.442 [http-nio-8080-exec-3] 7f3a9c2e1b4d5a6c  ERROR c.e.OrderService - 扣减库存失败
```

**必踩的坑：跨线程 TraceId 丢失**。MDC 底层是 `ThreadLocal`，一旦把任务丢进线程池，新线程里取不到 MDC，日志里的 traceId 就成了空。

```java
// 解法一：给线程池加 TaskDecorator，提交任务时把 MDC 复制过去
executor.setTaskDecorator(runnable -> {
    Map<String, String> ctx = MDC.getCopyOfContextMap();
    return () -> {
        if (ctx != null) MDC.setContextMap(ctx);
        try { runnable.run(); } finally { MDC.clear(); }
    };
});

// 解法二：用 TransmittableThreadLocal（TTL）替代，配合 TtlExecutors 包装线程池
```

**这个问题在异步化程度高的系统里非常普遍**：`@Async`、`CompletableFuture`、自定义线程池、MQ 消费线程——只要跨了线程，TraceId 和用户上下文都会丢。它的危害不只是日志难看，**用户身份丢失还可能导致越权或鉴权失败**。

## 六、常见坑 {#pitfalls}

| 坑 | 现象 | 原因 |
|---|---|---|
| **异步线程 TraceId 为空** | 日志里搜不到链路 | MDC 是 `ThreadLocal`，跨线程未传递 → `TaskDecorator` / TTL |
| **用自定义头传 TraceId** | 跨服务、跨网关后链路断掉 | 应该用标准 W3C `traceparent`，否则中间件不认 |
| **采样率设成 100%** | 存储暴涨、采集开销影响业务 | 生产按比例采样 + **异常请求强制采集** |
| **只在部分服务挂 agent** | 链路到某个服务就断 | 链路完整性要求**链路上每个服务**都接入 |
| **告警没绑负责人** | 告警刷屏后无人处理 | 告警必须路由到能修的人，且阈值留余量 |
| **把追踪当唯一手段** | 只能看到"慢"，看不到"为什么慢" | 追踪定位到 Span 后，仍要靠日志 / SQL 慢查询 / 线程栈继续往下查 |
| **拓扑图里有意外调用** | 服务间耦合超出预期 | 往往能发现设计外的直连（如绕过网关直连 DB），是架构治理的好线索 |

## 面试口径

- **链路追踪解决什么**：给一次请求一个全局唯一的 `TraceId` 并**跨服务透传**，把散落在多台机器上的日志串成一条链；解决「一次请求跨 N 个服务，出问题定位不到哪一跳」。
- **四个概念**：`Trace`（完整链路）、`Span`（工作单元，含 `SpanId` / `ParentSpanId`）、`Context Propagation`（靠请求头传递）、`Sampling`（采样，生产必须开，异常强制采集）。
- **传递用什么头**：W3C Trace Context 的 `traceparent`（格式 `版本-traceId-spanId-标志`）。**用自定义头会导致跨中间件断链**。
- **Skywalking 三个层次**：**Service**（微服务）、**Service Instance**（一个 JVM 进程 / 物理机）、**Endpoint**（接口）。排障时**从粗到细**：Service 谁的 RT 高 → 是不是某个 Instance → 具体哪个 Endpoint。
- **Skywalking 为什么无侵入**：`-javaagent` + **Java Agent 字节码增强**，在类加载时织入埋点，业务代码零改动。它同时采**指标**（JVM / 主机 / 服务级），所以是 APM 而不只是 tracing。
- **实际用途**（答这题要给场景，不要只讲功能）：① **压测时一眼看出哪个服务 / 接口慢**，直接产出优化清单；② 日常监控 + **告警路由到负责人**，上线后第一时间发现问题；③ **服务拓扑图**，接手陌生系统或发现意外调用；④ 出问题时按「Service → Instance → Endpoint → 慢 Trace 瀑布图」逐层定位到具体 Span。
- **与日志的关系**：把 `TraceId` 打进日志（MDC），才能从日志跳回链路。**注意跨线程会丢**（`ThreadLocal`），要用 `TaskDecorator` 或 `TransmittableThreadLocal`。
- **别夸大它的能力**：追踪只能告诉你**哪一跳慢**，不能告诉你**为什么慢**——还要接着看 SQL、线程栈、日志。
