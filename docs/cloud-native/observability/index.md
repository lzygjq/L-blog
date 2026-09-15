---
date: 2026-09-15
title: 监控与可观测
sidebar: 监控与可观测
desc: 三支柱各回答什么问题、怎么靠 traceId 串起来，Prometheus 数据模型与常用 PromQL、Spring Boot 接入、日志结构化与链路采样，以及黄金信号与告警设计
---

# 监控与可观测

## 一、问题场景：监控与可观测差在哪 {#why-observability}

两者常被混用，但回答的是不同问题：

| | 监控（Monitoring） | 可观测（Observability） |
|---|---|---|
| 回答 | 「已知的问题发生了吗」 | 「没见过的问题，为什么会发生」 |
| 前提 | 你得**先猜到**要看什么指标 | 从外部输出**推断**内部状态，无需预先假设 |
| 手段 | 预定义指标 + 阈值告警 | 高基数的指标、日志、链路，可自由下钻 |
| 典型场景 | CPU 超 80% 告警 | "某接口 P99 突然翻倍，是哪个依赖、哪类请求" |

一次真实的排查路径，恰好用满三者：

```
告警响（指标异常） → 看板确认范围（整体还是某个接口？）
        → 日志找异常堆栈（发生了什么错）
        → 链路定位到具体依赖（哪个下游慢/挂）
```

所以目标不是"装一套监控工具"，而是**让这三步之间能互相跳转**——跳不过去，就变成在三个系统里靠时间戳人工对账。

## 二、三支柱：各自擅长什么 {#three-pillars}

| 维度 | Metrics | Logging | Tracing |
|---|---|---|---|
| 形态 | 数值时间序列 | 离散事件文本 | 带父子关系的调用链 |
| 回答 | **趋势与"是否异常"** | **"具体发生了什么"** | **"慢在哪一跳、谁调用了谁"** |
| 数据量 | 小（可降采样、长期留存） | **最大**（需采样/分级/定期清理） | 中（与采样率成正比） |
| 成本 | 低 | 高 | 中 |
| 基数压力 | 标签组合爆炸是主要风险 | 天然高 | 与请求量成正比 |
| 典型工具 | Prometheus + Grafana | ELK / Loki | Jaeger / Tempo / SkyWalking |

**三者靠一个标识串起来：`traceId`。**

| 关联方向 | 做法 |
|---|---|
| Trace → Log | 把 `traceId` / `spanId` 写进日志（MDC），日志系统按 traceId 检索 |
| Trace → Metrics | 打标签：服务名、接口、状态码、依赖名 |
| Metrics → Trace | 指标告警上挂 Example 查询，直接跳到慢请求样例 |

> 这就是"可观测"与"三个独立工具"的区别：**关联字段是否统一**。常见做法是全局约定 `service.name` + `traceId` 两个字段，所有信号都带上。

## 三、Metrics：Prometheus 的模型与查询 {#metrics}

### 3.1 数据模型 {#prometheus-model}

Prometheus 的基本单位是**时间序列**：`指标名{标签=值,…}`，例如

```
http_server_requests_seconds_count{uri="/order", method="POST", status="200", instance="10.2.3.4:8080"}
```

两个关键设计：

- **拉模式（scrape）**：Prometheus 主动按间隔抓取目标的 `/metrics`，配合服务发现自动感知实例增减。好处是"目标健康与否"本身就可知（抓不到即异常）。
- **标签基数（cardinality）是头号杀手**：把 `用户 ID`、`订单号`、完整 URL（含路径参数）当标签，会让时间序列数量爆炸，直接把 Prometheus 打挂。**标签只放"有限枚举"的维度**。

四种指标类型的选择，直接决定"能不能算分位数"：

| 类型 | 语义 | 能否跨实例聚合 | 典型用途 |
|---|---|---|---|
| **Counter** | 只增不减（重启归零） | ✅ | 请求数、错误数、处理字节数 |
| **Gauge** | 可增可减的瞬时值 | ✅（取当前值） | 内存占用、队列长度、线程数 |
| **Histogram** | 按桶（bucket）分段计数 | ✅ **可服务端聚合分位数** | 延迟分布（推荐） |
| **Summary** | 客户端直接算分位数 | ❌ **分位数不能相加** | 单实例内部分位数 |

> **选型结论**：绝大多数场景选 **Histogram**——因为它的分位数由桶计数在服务端算（`histogram_quantile`），多实例可以正确合并；Summary 的分位数是各实例各算的，5 个实例的 P99 无法合成全局 P99。桶的边界要按业务定（如 50ms/100ms/200ms/500ms/1s/2s），**默认桶未必贴合你的服务**。

### 3.2 常用 PromQL {#promql}

```promql
# 接口 QPS（按 uri 分组）
sum by (uri) (rate(http_server_requests_seconds_count[5m]))

# P99 延迟：按 le 累加桶计数，再求分位
histogram_quantile(0.99,
  sum by (le, uri) (rate(http_server_requests_seconds_bucket[5m])))

# 错误率（5xx 占比）
sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
  / sum(rate(http_server_requests_seconds_count[5m]))

# 实例存活（Grafana 里用，值为 0 表示抓不到）
up{job="order-service"}
```

三个必须理解的细节：

1. **Counter 要配 `rate()` 才有意义**——原始值只增不减，看绝对值毫无信息量；`rate` 还会自动处理"进程重启导致计数归零"的情况。
2. **区间窗口要够长**：至少包含 2 个采样点，经验上取 **≥ 4 倍抓取间隔**。抓取间隔 15s、窗口写 `[1m]` 会频繁出现空值。
3. **`histogram_quantile` 是"桶内插值估算"**，不是精确分位数——桶边界越粗，误差越大。这也是"P99 抖动"有时是桶设计问题的原因。

### 3.3 Spring Boot 接入 {#micrometer}

```xml
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
<dependency>
  <groupId>io.micrometer</groupId>
  <artifactId>micrometer-registry-prometheus</artifactId>
  <scope>runtime</scope>
</dependency>
```

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus   # 默认只暴露 health，别忘开
  endpoint:
    health:
      probes:
        enabled: true        # 暴露 /actuator/health/liveness 与 /readiness
      show-details: when-authorized
  metrics:
    tags:
      application: order-service   # 关键是打上服务名，便于跨实例聚合
    distribution:
      percentiles-histogram:
        http.server.requests: true # 让 HTTP 指标以 Histogram 形式导出
```

| 端点 | 用途 | 注意 |
|---|---|---|
| `/actuator/health/liveness` | 交给 **livenessProbe** | 只反映进程自身（别查数据库，见 K8s 篇） |
| `/actuator/health/readiness` | 交给 **readinessProbe** | 可以包含"依赖是否就绪" |
| `/actuator/prometheus` | 抓取入口 | 生产环境**不要暴露到公网** |
| `/actuator/metrics/{name}` | 人工查单个指标 | 排查用 |

> **版本口径（2026-09）**：Spring Boot 3.3 起，`micrometer-registry-prometheus` 走的是 **Prometheus Java Client 1.x**，而原本 0.16.x 的实现被挪到 `micrometer-registry-prometheus-simpleclient`。升级时如果依赖名没换、又用了老客户端的配置项，指标会"注册成功但抓不到"——这类"看起来全都对"的问题，先查依赖坐标版本。

自定义指标只需注入 `MeterRegistry`，或直接用注解：

```java
@Timed(value = "order.create", description = "下单耗时", histogram = true)
public Order create(CreateOrderCmd cmd) { … }
```

## 四、Logging：从"打日志"到"可检索" {#logging}

| 层次 | 做法 | 解决的问题 |
|---|---|---|
| 格式 | **结构化（JSON）**，而不是拼接字符串 | 可被机器解析、字段可筛选 |
| 字段 | 统一字段：`timestamp` / `level` / `service` / `traceId` / `message` | **跨服务关联** |
| 输出 | 写到 **stdout**，由平台统一采集 | 容器哲学：应用不关心日志去哪 |
| 采集 | 节点级 agent（DaemonSet）→ 缓冲 → 存储 | 应用无需感知后端 |
| 存储与检索 | ELK（全文检索强、成本高）/ Loki（只索引标签、成本低） | 按需选择 |

三条实践要点：

- **日志要能回答"这一次请求发生了什么"**——所以 `traceId` 必须进日志（Logback pattern 里加 `%X{traceId:-}`，由 Micrometer Tracing 自动写入 MDC）。
- **日志分级要有纪律**：`INFO` 打关键业务流转，`DEBUG` 只用于排障且默认关闭；高频循环里打日志是把自己拖垮的最快方式。
- **日志量要控**：全量日志的成本通常高于指标与链路的总和。手段是采样（普通请求采样、错误全留）、异步 Appender、以及设置保留期。

## 五、Tracing：一次调用链怎么被串起来 {#tracing}

模型很简单：**一个 trace 是一棵树，节点是 span**。

```
Trace: 8f3a…（贯穿整次请求）
├── Span: API Gateway            [12ms]
├── Span: Order Service          [45ms]
│   ├── Span: MySQL 查询          [8ms]
│   └── Span: 调用 Inventory 服务  [22ms]  ← 瓶颈在这
│       └── Span: Inventory Service [20ms]
└── Span: 响应返回
```

**跨进程传播靠 HTTP Header**（W3C `traceparent` 标准）：上游把 trace 上下文塞进请求头，下游从中解析并创建子 span。所以链路能否连通，取决于"所有经过的组件是否都透传了头部"——网关、消息队列、线程池、异步任务都是常见的断点。

**采样**是成本控制的唯一手段，两条路线：

| 路线 | 何时决定 | 优点 | 缺点 |
|---|---|---|---|
| **头部采样** | 请求入口按比例（如 10%）决定 | 实现简单、开销低 | **出错的那次很可能没被采到** |
| **尾部采样** | 先在内存里攒完整条链，按条件决定（如"有错误"或"耗时 > 1s"必须留） | 保留有价值的链 | 需要中间缓冲组件、资源占用高 |

> 生产常见的折中：**头部低比例采样 + 对错误/慢请求强制采样 100%**（在上下文里打一个"强制采样"标记向上游传播）。

| 方案 | 定位 |
|---|---|
| **OpenTelemetry** | **标准 + SDK + 采集器**，与厂商无关；Spring Boot 3 的官方路线是 Micrometer Tracing 桥接 OTel |
| Jaeger / Tempo | 后端存储与查询 UI（Tempo 与 Grafana 生态一体） |
| Zipkin | 老牌、轻量，适合小规模 |
| SkyWalking | Apache 项目，**Java Agent 无侵入**接入，自带服务拓扑与告警 |

> 一句话区分：**OpenTelemetry 负责"怎么产生和上报"，Jaeger/Tempo 负责"存与看"**。选型时先定 OTel 埋点（避免厂商绑定），后端可替换。

## 六、告警设计：少而有效 {#alerting}

监控的产出不是"更多的看板"，而是**可信的告警**。先确定看什么——**四大黄金信号（Google SRE）**：

| 信号 | 含义 | 典型指标 |
|---|---|---|
| **延迟（Latency）** | 请求多慢 | P99 / P95，注意区分成功请求与失败请求的延迟 |
| **流量（Traffic）** | 系统负载 | QPS、并发连接数 |
| **错误（Errors）** | 失败比例 | 5xx 率、超时率、业务失败率 |
| **饱和度（Saturation）** | 资源有多满 | CPU/内存利用率、线程池队列、连接池占用 |

两条原则：

1. **告警要盯症状，不要盯原因**。「P99 超过 1s」直接对应用户受损；「CPU 超过 80%」只是可能原因——CPU 高但用户无感时不该叫醒人。
2. **告警必须有动作**。一条"响了但不知道要做什么"的告警，只会训练团队忽略所有告警（告警疲劳）。判断标准：**这条告警响的时候，值班的人第一反应是什么？答不出来就删掉。**

用 **SLO + 错误预算**把"阈值"换成"预算消耗速度"更科学：设"月度可用性 99.9%"，允许的失败额度就是 0.1%；当**燃烧速度**异常（比如 1 小时就烧掉 2% 的月预算）才告警。工程上常用**多窗口**配置：

| 长窗口 | 短窗口 | 燃烧率 | 动作 |
|---|---|---|---|
| 1 小时 | 5 分钟 | 14.4 | **立刻呼叫**（预算烧得太快） |
| 6 小时 | 30 分钟 | 6 | 呼叫 |
| 3 天 | 6 小时 | 1 | 建工单，不叫人 |

短窗口的作用是**确认"问题还在发生"**，避免长窗口把已经恢复的抖动一直算进告警里。

## 七、对比辨析 {#compare}

| 对比 | 差别 | 结论 |
|---|---|---|
| 监控 / 可观测 | 预定义阈值 / 自由下钻推断 | 都要，但先保证"能下钻到单次请求" |
| 指标 / 日志 / 链路 | 趋势 / 细节 / 关系 | 用 `traceId` 串起来才有意义 |
| **Histogram / Summary** | 服务端聚合 / 客户端本地 | **默认选 Histogram**（可跨实例算分位） |
| 头部采样 / 尾部采样 | 入口决定 / 攒完整链再决定 | 成本敏感用头部，问题导向用尾部 |
| 白盒 / 黑盒监控 | 应用内部指标 / 外部拨测 | 互补：拨测发现"整体不可用"，内部指标定位原因 |

## 八、使用场景与面试问答 {#interview}

**Q1：三支柱怎么关联？**
靠统一标识：链路生成 `traceId`，通过 MDC 注入日志、作为标签打到指标上。于是"指标告警 → 按标签跳到慢请求样例 → 用 traceId 拉出完整日志"形成闭环。没有这层关联，三个系统就只是三个孤立工具。

**Q2：线上某接口突然变慢，怎么排查？**
自上而下：① 看指标确认范围（只有这个接口，还是全站；什么时候开始）；② 看链路的 P99 落在哪个 span——是自己计算慢、还是某个下游/数据库慢；③ 看该依赖自身的指标（连接池等待、慢查询、下游 QPS 与延迟）；④ 看日志里的异常与 GC 停顿。**顺序很重要：先定位"哪一跳"，再看"那一跳为什么"**，否则容易上来就翻日志、越翻越乱。

**Q3：Histogram 和 Summary 怎么选？**
默认 Histogram。它的分位数在服务端由桶计数聚合（`histogram_quantile`），多实例结果可合并；Summary 的分位数是客户端各自算的，**分位数不可相加**，多实例无法得到全局值。选 Histogram 时要按业务设计桶边界，否则分位数误差会很大。

**Q4：采样率怎么定？**
从成本倒推：先算 100% 采样的日数据量，再定可接受的存储与带宽，得到比例；同时**对错误与慢请求强制采样**，保证最有价值的链一定被留下。低流量系统直接 100% 也可能无所谓，不必一开始就上尾部采样。

**Q5：什么样的告警算"好告警"？**
三个条件：指向**用户可感知的症状**（延迟/错误/饱和度）、**有明确处置动作**、**不易误报**。反面例子是"CPU > 80%""磁盘使用率 > 75%"这类无动作、无上下文、频繁自愈的阈值告警，它们会淹没真正重要的信号。

**Q6：日志量太大怎么办？**
四招依次做：① 统一结构化并**分级**（把打给开发看的调试信息降为 `DEBUG`、默认关闭）；② 采样——普通请求按比例、错误全留；③ 降低单条日志开销（异步 Appender、避免高频循环内打日志、避免打印大对象）；④ 存储分层——热数据保留短、冷数据压缩归档。**不要**先扩存储，那只会让成本跟着日志量一起涨。

> 回到板块入口：[云原生 · 板块导览](/cloud-native/)
