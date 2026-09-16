---
date: 2026-09-16
title: 指标与 Prometheus：从数据模型到看板
sidebar: 指标与 Prometheus
order: 1
desc: 时间序列与标签基数、四种指标类型与直方图选型、原生直方图与 PromQL 的窗口语义、抓取与长期存储、Spring Boot 接入、升级到 3.x 的五个坑，以及看板该怎么设计
---

# 指标与 Prometheus：从数据模型到看板

指标是三个支柱里**最便宜**的一个——一条时间序列每秒记一个点，一年也才三千万个浮点数；而同样粒度的日志，一天就能写满磁盘。所以它承担了"**长期趋势与告警**"这个角色：能留得久、能快速聚合、能在几秒内回答"现在是不是不正常"。

但"便宜"也正是它的陷阱所在：**便宜的代价是分辨率低**——它只知道"打了多少点"，不知道"这一次请求发生了什么"。而决定这一点的，不是采集频率，是**数据模型**。

> **指标能不能算对，取决于三件事：指标类型选得对不对（分位数能不能跨实例合并）、标签基数控没控住（Prometheus 会不会被打挂）、查询语义理解得准不准（`rate` 的窗口边界落在哪）。**
>
> 这三件事都不在"装一套 Prometheus"的范围里，但**它们才是线上真出问题的位置**。

## 一、指标适合回答什么，在哪里失效 {#scope}

| 它擅长 | 它不擅长 |
|---|---|
| 趋势：QPS 是涨还是跌、延迟有没有变差 | 归因：这一跳为什么慢 |
| 聚合：按服务/接口/状态码分组看 | 单个请求的完整上下文 |
| 长期留存：降采样后可以留一两年 | 高基数维度（用户 ID、订单号） |
| 快速告警：秒级判定"是否异常" | 排查"没见过的问题"（那要靠链路与日志） |

所以报错"线上有个接口很慢"时，**指标的第一作用是划定范围**：是只有这个接口，还是整个服务？是所有实例，还是某一个？是刚发生，还是已经持续两小时？——**先缩小到"哪一跳"，再去问"为什么"**，这一步做不对，后面翻日志只会越翻越乱。

## 二、数据模型：时间序列与它的头号杀手 {#model}

Prometheus 的基本单位是**时间序列**，由「指标名 + 一组标签」唯一确定：

```
http_server_requests_seconds_count{uri="/order", method="POST", status="200", instance="10.2.3.4:8080"}
```

两个关键设计：

- **拉模式（scrape）**：Prometheus 主动按间隔抓目标的 `/metrics`，配合服务发现自动感知实例增减。好处是「目标是否健康」本身就可知——**抓不到就是异常**，不需要额外的存活检测。
- **标签基数（cardinality）是头号杀手**：把用户 ID、订单号、含路径参数的完整 URL 当标签，会让序列数量按乘积爆炸。一个 10 万用户 × 1 万个订单号的标签组合，理论上就是 10 亿条序列——Prometheus 会先 OOM，然后在重启时把磁盘也吃满。

> **判据：标签只放「有限枚举」的维度。** 服务名、接口模板（`/order/{id}` 而不是 `/order/12345`）、状态码、机房、版本——这些是可枚举的。**凡是"取值随业务量增长"的东西，一律不许进标签**，它该进日志或链路。

## 三、四种指标类型：分位数能不能合，取决于它 {#types}

| 类型 | 语义 | 能否跨实例聚合 | 典型用途 |
|---|---|---|---|
| **Counter** | 只增不减（进程重启归零） | ✅ | 请求数、错误数、处理字节数 |
| **Gauge** | 可增可减的瞬时值 | ✅（取当前值） | 内存占用、队列长度、线程数 |
| **Histogram** | 按桶（bucket）分段计数 | ✅ **可服务端聚合分位数** | 延迟分布（推荐） |
| **Summary** | 客户端直接算分位数 | ❌ **分位数不能相加** | 单实例内部分位数 |

**为什么 Summary 不能跨实例？** 因为它的分位数是**每个实例在本地算完再上报**的——实例 A 的 P99 是 120ms、实例 B 的 P99 是 90ms，你无法从这两个数推出"整体的 P99"。而 Histogram 上报的是**每个桶的累计计数**，这些计数是可加的：把所有实例的 `le=100ms` 桶加起来，再在服务端算分位，得到的才是真值。

> **选型结论：几乎总是 Histogram。** 唯一例外是"你只关心单实例、且要求极低开销"——但那种场景现在更应该考虑下面的原生直方图。

**桶边界的坑**：Histogram 的分位数是**桶内插值估算**，桶越粗误差越大。默认桶（`.005 .01 .025 .05 .1 .25 .5 1 2.5 5 10`）是为通用 Web 服务设计的，**未必贴合你的服务**——一个平均 3ms 的接口，默认桶在 5ms 以下只有 3 个边界，P99 会算得很虚。**桶要按业务延迟量级定**（如 10/25/50/100/250/500ms/1s）。

## 四、原生直方图：修掉"桶要人猜"这件事 {#native-histogram}

经典直方图的根本问题不是"桶选得粗"，而是**桶边界必须提前定死**：定宽了浪费存储，定窄了在关键区间丢精度，而**事后改边界会让已有看板和告警规则一起失效**（因为序列名里带着 `le` 值）。

**原生直方图（native histograms）**换了个思路：桶边界**按指数增长**，由 `schema` 参数控制分辨率，**一条序列替代原来的 N 条桶序列**，并支持乱序写入。

| | 经典直方图 | 原生直方图 |
|---|---|---|
| 桶边界 | 手工预设，序列名含 `le` | 指数增长，自动 |
| 序列数 | 每个桶一条（N+2 条） | **1 条** |
| 改精度 | 要重新设计桶 + 改看板 | 调 `schema` |
| 乱序写入 | 不支持（需 `out_of_order_time_window`） | 支持 |

**但必须交代现状（2026-09）**：

- 原生直方图到 **Prometheus v3.8（2025-11）才达到 stable**，此前长期是实验特性；
- 采集侧**仍需显式开启**，写法是每抓取作业加 `scrape_native_histograms: true`；
- 从 **v3.9 起，旧的 `--enable-feature=native-histograms` flag 已经无效**——如果你照着 3.0~3.5 期的博客配置，会发现开了没反应；
- **文本暴露格式与部分访问函数仍在设计中**，所以它更适合经由 Remote Write / OTLP 进入长期存储，而不是在 `/metrics` 文本端做端到端替换。

> **落地建议**：新项目可以开始用（收益是存储与精度），但**不要为了它把经典直方图全部迁走**——两者可以并存，且经典直方图不受任何影响。

## 五、PromQL：三个必须理解的细节 {#promql}

```text
# 接口 QPS（按 uri 分组）
sum by (uri) (rate(http_server_requests_seconds_count[5m]))

# P99 延迟：按 le 累加桶计数，再求分位
histogram_quantile(0.99,
  sum by (le, uri) (rate(http_server_requests_seconds_bucket[5m])))

# 错误率（5xx 占比）
sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
  / sum(rate(http_server_requests_seconds_count[5m]))
```

**细节一：Counter 必须配 `rate()`。** 原始值只增不减，看绝对值毫无信息量；`rate` 还会自动处理"进程重启导致计数归零"——它会识别出计数器回退并把区间内的增量修正过来。

**细节二：区间窗口至少要含 2 个采样点。** 经验值是 **≥ 4 倍抓取间隔**：抓取间隔 15s 时写 `[1m]` 只有 4 个点，边界抖动就会频繁出现空值或尖刺。这是"指标图上时不时断一格"的最常见原因。

**细节三（3.x 的行为变化，务必记住）：区间选择器从左闭右闭改成了左开右闭。** `metric[5m]` 在时刻 T 的取值，2.x 包含 `[T-5m, T]`（边界恰好对齐时可能有 6 个样本），3.x 只包含 `(T-5m, T]`（始终 5 个）。

- 影响：`rate()` 与 `increase()` 的数值会**轻微变化**；
- 真正被咬到的是 **subquery**——它的求值时间戳天然与分辨率对齐，正好落在被排除的边界上；
- 还有一条同源的坑：**`le` 与 `quantile` 标签值在写入时被规范化成标准浮点形式**，`le="1"` 变成 `le="1.0"`。**任何硬编码了 `le="1"` 的看板或 recording rule 会静默查不到数据**——它不报错，只是图变空。

## 六、抓取、存储与长期方案 {#storage}

**抓取侧的三件事**：

- **Exporter** 是把"不可直接观测的东西"翻译成指标的地方：`node_exporter`（主机）、`mysqld_exporter`（数据库）、`blackbox_exporter`（拨测）。**Exporter 本身也是要监控的服务**——它挂了表现为"指标消失"，而不是"指标异常"，很容易被漏掉。
- **服务发现**决定了实例增减时要不要手工改配置。K8s 里用注解或 CRD 自动发现 Pod；虚拟机环境可以用文件或 Consul。
- **抓取间隔与超时**：默认 15s / 10s。抓取间隔决定了告警的**最小可感知时间**——间隔 60s 的作业，不可能在 30s 内发现故障。

**存储侧**：Prometheus 本地 TSDB 是为"最近几周"设计的，不是长期存储。要留几个月到几年，走 **Remote Write** 到远端（Thanos / Mimir / VictoriaMetrics / 各类云服务）。

**Remote Write 2.0**（3.0 引入，1.0 于 2023-04 定稿）的关键改进是 **string interning（字符串驻留）**：每个唯一字符串只在报文里存一次，后续用整数索引引用。官方基准给出的量级是**传输数据量减少约 60%、内存分配减少约 90%、CPU 使用减少约 70%**。它同时把 exemplars、metadata、原生直方图从"实现里已有、规范未收"变成正式定义。

> **一个必须知道的限制**：Remote Write 2.0 **无法强制 legacy 字符集校验**——它默认接受全部 UTF-8 名称。这是 3.0 那套 UTF-8 名称改造的一部分（见下节）。

## 七、Spring Boot 接入 {#micrometer}

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
| `/actuator/health/liveness` | 交给 **livenessProbe** | 只反映进程自身（**别查数据库**，见 [K8s 探针](/cloud-native/kubernetes/#probes)） |
| `/actuator/health/readiness` | 交给 **readinessProbe** | 可以包含"依赖是否就绪" |
| `/actuator/prometheus` | 抓取入口 | 生产环境**不要暴露到公网** |
| `/actuator/metrics/{name}` | 人工查单个指标 | 排查用 |

自定义指标只需注入 `MeterRegistry`，或直接用注解：

```java
@Timed(value = "order.create", description = "下单耗时", histogram = true)
public Order create(CreateOrderCmd cmd) { … }
```

> **版本口径（2026-09）**：Spring Boot 3.3 起，`micrometer-registry-prometheus` 走的是 **Prometheus Java Client 1.x**，原本基于 0.16.x 的实现被挪到 `micrometer-registry-prometheus-simpleclient`。升级时如果依赖名没换、又沿用了老客户端的配置项，会表现为"指标注册成功但抓不到"——**这类"看起来全都对"的问题，第一件事是查依赖坐标与版本**。

## 八、升级到 3.x：五个会静默出错的点 {#upgrade-30}

Prometheus 3.0 发布于 **2024-11**，是 2017 年 2.0 以来首个大版本（中间跨了 7 年、7500+ 次提交）；**3.5 被指定为该线的 LTS**，多数企业钉这个版本。

大版本的实际风险不在"新功能没用到"，而在**旧行为被改了却不报错**：

| 变化 | 表现 | 处置 |
|---|---|---|
| **区间选择器左开右闭** | `rate`/`increase` 数值轻微变化；subquery 被咬到 | 有精确断言的 `promtool test rules` 需重新定基线 |
| **`le` / `quantile` 值规范化** | 硬编码 `le="1"` 的看板与 recording rule **静默查空** | 全量搜 `le="1"` 改成 `le="1.0"`，或改用量化比较 |
| **7 个 feature flag 转正** | `--enable-feature=utf8-name` 等写法**变成未知参数**，启动可能失败 | 从启动参数里删掉这些 flag |
| **`holt_winters()` 更名** | 改为 `double_exponential_smoothing()`，且移到实验 flag 后 | 改用新名 + `--enable-feature=promql-experimental-functions` |
| **`--storage.tsdb.retention` 移除** | 仍传该参数时**容器直接起不来** | 改为 `--storage.tsdb.retention.time=30d` |

**还有两条与查询无关但同样致命**：

- **`scrape` 目标返回的 `Content-Type` 无效或缺失时直接失败**（2.x 会宽容处理），必要时用 `fallback_scrape_protocol` 兜底；
- **回退路径只有 v2.55**——TSDB 索引格式在 v2.55 就变了，**从 3.x 回退到更早的 2.x 不保证能读**。

> **升级顺序**：先把 `promtool` 升上去、在 CI 里重跑规则测试（这一步能提前抓住 `le` 与区间边界两类问题）→ 再升级一对 HA 副本里的**一个非关键实例**，与 2.x 那个对照看一天图 → 最后动剩余的。**动手前先对数据目录做快照**——因为回退不是随时都行。

**3.x 的收益也确实是实的**：原生 OTLP 接收（`--web.enable-otlp-receiver`，端点是 `/api/v1/otlp/v1/metrics`，**不再需要 Collector 中转**）、UTF-8 指标名（把 OTel 的 `http.server.request.duration` 这种带点的名字原样保留，而 2.x 会把它转成下划线）、以及内存与 CPU 的明显下降（`GOMAXPROCS`/`GOMEMLIMIT` 自动匹配容器限额）。**UTF-8 与 OTLP 接收是配套的两件事**：没有前者，OTel 的命名进 Prometheus 会被改得面目全非。

> 用 UTF-8 名称的序列，查询时要换成引号语法：`{"http.server.request.duration", job="api"}`。想维持旧行为可以配 `metric_name_validation_scheme: legacy`——**迁移期这个开关就是缓冲带**。

## 九、看板该怎么设计 {#dashboard}

指标采到了、查询会写了，最后一步是**让人在三秒内看懂**。这里最容易犯的错是"把能画的都画上"——一屏 20 个图，等于没有重点。

**先定看板要回答的问题，再决定画什么**：

| 看板 | 回答 | 常用方法 |
|---|---|---|
| **服务总览**（值班第一眼） | 现在好不好？有没有在烧错误预算？ | 四个信号（延迟/流量/错误/饱和度）+ 错误预算余量 |
| **资源看板** | 机器/容器够不够用？ | **USE**：使用率（Utilization）、饱和度（Saturation）、错误（Errors） |
| **服务细节**（排障用） | 哪一跳慢？哪类请求慢？ | **RED**：请求速率（Rate）、错误（Errors）、耗时（Duration） |

**五条实践**：

1. **变量（Variables）是看板可复用的前提**。把 `service` / `instance` / `uri` 做成下拉变量，一个看板覆盖所有服务，而不是每个服务一个 JSON。
2. **把"范围"放在最上面**。值班的人第一件事是判断"是全局还是局部"，所以全局聚合的图要在顶部，明细在下。
3. **图要有时间对比线**（如"上周同时段"）。没有基线时，人无法判断"P99 = 180ms 是好还是坏"。
4. **阈值用可视化的阈值线画出来**，不要只写在文档里——图上线一放，异常一眼可见。
5. **看板不是告警**。看板用于**人与系统交互时**的观察；告警必须有主动通知渠道。把"看板上的红条"当告警，等价于要求人 7×24 盯着屏幕。

> **Grafana 在这里的角色**：它是"查询与呈现层"，**不存数据**——数据源是 Prometheus / Loki / Tempo 等。这个定位意味着两件事：换后端不影响看板层；以及**Grafana 挂了不影响监控本身**（Prometheus 仍在抓取与告警）。**Grafana 的许可是 AGPLv3**（2021-04 从 Apache 2.0 变更），与 Prometheus 的 Apache-2.0 不同——企业在做"能不能内嵌、能不能二次分发"的判断时，这两者的边界不一样，许可细节见[选型篇](/cloud-native/observability/observability-selection)。

## 十、面试口径 {#interview}

| # | 问题 | 一句话答案 |
|---|---|---|
| 1 | 监控和可观测差在哪？ | 监控回答「**已知的问题发生了吗**」（预定义指标 + 阈值）；可观测回答「**没见过的问题为什么发生**」（从外部输出推断内部状态）。前者要求你先猜到看什么，后者不要求 |
| 2 | 三支柱靠什么串起来？ | 统一标识 **`traceId`**：链路生成 → 通过 MDC 注入日志 → 作为标签打到指标上；于是"指标告警 → 跳到慢请求样例 → 用 traceId 拉出完整日志"形成闭环 |
| 3 | 为什么 Histogram 优于 Summary？ | **分位数能否跨实例合并**。Histogram 上报桶计数（可加），服务端用 `histogram_quantile` 算；Summary 的分位数是各实例本地算的，**分位数不可相加**，多实例得不到全局值 |
| 4 | `histogram_quantile` 的结果精确吗？ | **不精确**，它是桶内插值估算，桶越粗误差越大。所谓"P99 抖动"有时是桶设计问题，不是服务问题 |
| 5 | 什么会把 Prometheus 打挂？ | **标签基数爆炸**：把用户 ID、订单号、含路径参数的完整 URL 放进标签，序列数按乘积增长。判据是"该维度取值是否随业务量增长"——是则一律不进标签 |
| 6 | Counter 为什么要配 `rate()`？ | 原始值只增不减，看绝对值无信息量；`rate` 把区间增量换算成每秒速率，**并自动处理进程重启导致的计数归零** |
| 7 | 区间窗口写多长？ | 至少含 2 个采样点，经验值 **≥ 4 倍抓取间隔**。间隔 15s 时写 `[1m]` 会频繁出现空值与尖刺 |
| 8 | 原生直方图解决了什么？ | 修掉"桶边界要人猜"：**指数桶自动增长 + 1 条序列替代 N 条 + 支持乱序写入**。现状是 **v3.8 才 stable，采集仍需 `scrape_native_histograms: true`**，且文本暴露格式仍在设计中 |
| 9 | 从 2.x 升到 3.x 最容易踩什么？ | 两处**静默**生效的：**区间选择器改左开右闭**（`rate` 数值微变、subquery 被咬）、**`le="1"` 被规范化为 `le="1.0"`**（硬编码看板静默查空）。另外 `--storage.tsdb.retention` 已移除，传了直接起不来 |
| 10 | 3.0 为什么引入 UTF-8 指标名？ | 为了**接住 OpenTelemetry 的命名**：OTel 语义约定用点分隔（`http.server.request.duration`），2.x 只能转成下划线，导致"SDK 端一个名、查询端另一个名"。3.0 起两者可以同名，配套开放了原生 OTLP 接收端点 |
| 11 | 抓不到指标算故障吗？ | **算，而且是最危险的一类**——它表现为"指标消失"而不是"指标异常"，告警规则通常只判阈值不判缺失。标准做法是补一条 `up{job="x"} == 0` 或 `absent()` 告警 |
| 12 | 看板设计最容易犯的错？ | "把能画的都画上"。应先定**这块看板回答什么问题**（总览用四个信号 / 资源用 USE / 排障用 RED），再决定画什么；并固定 top 放全局范围、加时间对比线、阈值画成线 |

> 上一篇：[监控与可观测 · 导览](/cloud-native/observability/)　|　下一篇：[日志管道](/cloud-native/observability/logging-pipeline)
