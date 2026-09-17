---
order: 7
date: 2026-09-17
sidebar: 应用日志约定
title: 应用日志：结构化、MDC 与级别
desc: 生产日志的最低约定——结构化字段、traceId 进 MDC、级别纪律、stdout 与脱敏；不讲 Loki/ELK，不讲成本曲线
---

# 应用日志：结构化、MDC 与级别

> **先划边界**：[日志管道](/cloud-native/observability/logging-pipeline)讲的是日志**离开进程之后**——采集、索引、Loki 高基数、账单。这一篇讲的是**还在进程里的那一段**：你打什么、字段叫什么、`traceId` 怎么跟上请求、级别怎么用。
>
> 判据：**别人拿着一次失败请求的 `traceId`，能不能在你的日志里定位到那一次。** 定位不到，后面的管道再贵也救不了。

Actuator 回答「它现在健康吗」；本篇回答「刚才那一次发生了什么」。动态改级别的操作入口在 [Actuator · loggers](/java/spring/spring-boot/actuator#loggers)，约定本身在这里。

## 一、问题场景：日志在，却找不到那一次 {#why}

三种现场，根因都不在「没打日志」：

| 现场 | 日志里实际有什么 | 真正缺的 |
|---|---|---|
| 值班把 `traceId` 丢进检索框，零命中 | `message` 里手写了 `"trace=abc... 下单失败"` | **`traceId` 不是独立字段**，管道无法按字段筛 |
| 同一秒内同一接口失败了 40 次 | 40 行几乎一样的 `"下单失败"` | 没有 `orderId` / 下游错误码，**分不清是哪一单、哪一跳** |
| 磁盘被打满，采集延迟 20 分钟 | 循环里每条记录一条 INFO | **级别与采样没纪律**，有用的那 3 行被噪音淹没 |

> **主线：应用日志的价值不在行数，在「按一次请求能收齐」。**
>
> 收齐靠三件事：**字段统一、上下文自动带上、级别按可行动性分级。** 三件里任何一件缺了，排查就会退回「按时间戳猜」。

## 二、最低字段约定 {#fields}

结构化的意思不是「输出长得像 JSON」，而是**字段名与语义全站统一**。最低限度：

| 字段 | 语义 | 反例 |
|---|---|---|
| `timestamp` | ISO 8601 **带时区** | `"09-17 12:00"`（本地时间、无法跨机对账） |
| `level` | 大写枚举：`ERROR` / `WARN` / `INFO` / `DEBUG` | `"err"`、`"严重"` |
| `service` | 与指标标签、链路 `service.name` **同一取值** | 日志写 `order-svc`、Prometheus 写 `order` |
| `traceId` | 贯穿整次请求 | 拼进 `message`：`"trace=... 失败"` |
| `spanId` | 当前这一跳 | 可缺，但有链路库时不要自己编 |
| `message` | 人类可读的**一件事** | 把堆栈、JSON 响应、用户手机号全塞进去 |
| `error.type` / `error.stack` | 异常类型与堆栈，**独立字段** | `log.error("失败: " + e)` 把栈抹成一行字符串 |

Boot 3.4 之后，控制台可以直接切结构化，不必先引 `logstash-logback-encoder`：

```properties
spring.application.name=order-service
logging.structured.format.console=ecs
```

`ecs` / `logstash` / `gelf` 三选一即可，**选了就全站统一**，不要每个服务一种。旧项目仍用 pattern 时，至少把关联字段打进 pattern——Boot 在引入 Micrometer Tracing 后会填 `logging.pattern.correlation`：

```
%d{ISO8601} %-5level [%X{traceId:-},%X{spanId:-}] %logger{36} - %msg%n
```

字段集合与「禁止把 `traceId` 当索引维度」的完整口径，见[日志管道 · 结构化](/cloud-native/observability/logging-pipeline#structured)。**本篇读到「字段进日志」为止；Loki / ELK / 成本不在这里。**

## 三、MDC：让上下文跟着请求走 {#mdc}

`traceId` 不该出现在业务代码的参数列表里。正确路径是：**链路库写入 MDC，日志框架从 MDC 读。**

```java
// 不要这样——下一次换追踪库，全站改
log.info("下单失败 traceId={}", tracer.currentTraceId());

// 业务日志只写业务事实；traceId 由 pattern / JSON encoder 自动带上
log.warn("下单失败 orderId={} reason={}", orderId, reason);
```

Spring Boot 3 的默认路线是 Micrometer Tracing：当前 span 进 MDC，业务代码零改动。三条会**静默丢上下文**的路径，L1 只要记住「会丢」，处理方式留给 L2：

| 断点 | 现象 | L1 怎么处理 | L2 去哪看 |
|---|---|---|---|
| `new Thread(...)` | 子线程日志没有 `traceId` | **不要手开线程**；用注入的执行器 | [链路传播](/cloud-native/observability/tracing-otel#propagation) |
| 线程池直接 `execute` | 任务跑到池里后 MDC 是空的 | 用 Boot 配好的 `@Async` / `TaskExecutor` | [异步 · 上下文](/java/spring/spring-framework/crosscutting/async#context) |
| `@Async` 未配 `TaskDecorator` | 异步方法的日志断链 | 本级先避免在请求线程里 `@Async` 打关键日志 | 同上 |

> **判据：一条请求的所有日志，`traceId` 必须相同。** 对不上，先查是不是跨了线程，再查是不是 Filter 比追踪 Filter 更靠前。

## 四、级别纪律 {#levels}

级别不是「这条重不重要」的主观感受，是**谁该在什么时候看到**：

| 级别 | 何时用 | 生产默认 |
|---|---|---|
| `ERROR` | **已经失败、需要人处理**（下单没落库、下游持续 5xx） | 开。每条都该能对应一个动作 |
| `WARN` | 降级成功、重试后成功、接近配额 | 开。高频 WARN 等于隐形 ERROR |
| `INFO` | 一次请求一条生命周期事件（「订单已创建」） | 开，但**禁止循环内 INFO** |
| `DEBUG` / `TRACE` | 入参、SQL、中间状态 | **关**。排查时用 `/actuator/loggers` 临时打开，完事还原成 `null` |

四条硬规则：

1. **高频循环里不打 INFO。** 一批 10 万行各打一条，比事故当天的有效日志还多。
2. **同一异常不要在每层都 `log.error`。** 最外层记一次带栈的 ERROR，内层要么往上抛，要么记 DEBUG。重复 ERROR 会让告警按行计数爆炸。
3. **成功路径不要打 ERROR。** 「库存不足」是业务拒绝，用 WARN 或 INFO + 明确 reason；否则值班会把正常拒单当故障。
4. **还原级别传 `configuredLevel: null`。** 传 `"INFO"` 会钉死该 logger，配置文件再改也不生效。操作见 [Actuator · loggers](/java/spring/spring-boot/actuator#loggers)。

## 五、stdout、脱敏、与「不该写进日志的」 {#hygiene}

| 约定 | 原因 |
|---|---|
| **写 stdout**，不写容器内文件 | 容器重启即丢；`kubectl logs` 也看不到文件 |
| **脱敏在落盘之前** | 身份证 / 手机号 / token / 银行卡一旦进存储，后面只是给已泄露的数据加访问控制 |
| **密码、Authorization、Cookie 永不入日志** | Filter 打请求头是最高频的事故源；白名单头，不要黑名单 |
| **大对象与完整响应体默认不打** | 一次把 200KB JSON 打进 INFO，采集与磁盘一起崩 |

入参要留证据时，打**业务主键 + 结果枚举**，不打整段 DTO：

```java
// 可以
log.info("创建订单完成 orderId={} amountFen={}", id, amountFen);

// 不行
log.info("创建订单 req={}", objectMapper.writeValueAsString(req));
```

## 六、与相邻页的分工 {#boundary}

| 页 | 它负责 | 本篇不讲 |
|---|---|---|
| [日志管道](/cloud-native/observability/logging-pipeline) | 采集、ELK vs Loki、高基数、成本 | 索引策略与账单 |
| [链路追踪](/cloud-native/observability/tracing-otel) | `traceId` 怎么穿过网关 / MQ / 线程池 | 传播实现 |
| [Actuator](/java/spring/spring-boot/actuator#loggers) | 运行时改级别、安全暴露 | 端点清单 |
| [慢请求剧本](/cloud-native/observability/slow-request) | 有了 `traceId` 之后怎么走决策树 | 排查顺序 |
| [异步执行](/java/spring/spring-framework/crosscutting/async) | MDC 跨线程怎么传 | 装饰器写法 |

## 七、面试口径 {#interview}

| # | 问题 | 一句话答案 |
|---|---|---|
| 1 | 应用日志最小该有哪些字段？ | `timestamp`（带时区）、`level`、`service`、`traceId`、`message`；异常进独立字段。`service` 与 `traceId` 必须和指标、链路同一套值 |
| 2 | 结构化是输出 JSON 吗？ | **不是。** 是字段名与语义全站统一。JSON 只是载体；每个服务一套字段名，聚合时还是正则 |
| 3 | `traceId` 该写在业务代码里吗？ | **不该。** 链路库写入 MDC，日志框架从 MDC 读。业务日志只写业务事实 |
| 4 | 为什么不能把 `traceId` 拼进 `message`？ | 管道按字段筛，不按字符串猜。拼进去等于这条关联键对检索不可见 |
| 5 | 日志该写到哪？ | **stdout。** 应用不管轮转与采集；写容器内文件会随重启丢失 |
| 6 | 生产默认开 DEBUG 可以吗？ | **不可以。** DEBUG 默认关；要看时用 `/actuator/loggers` 临时开，还原传 `null` |
| 7 | 循环里打 INFO 有什么问题？ | 一次批量就能把当天有效日志淹没，并拖垮采集。循环内最多 DEBUG，且默认关 |
| 8 | 脱敏放在哪一步？ | **落盘之前**（应用或采集处理阶段）。进存储再红线，已经泄露 |
| 9 | 同一异常为什么不要每层都 ERROR？ | 告警按行计数；层层 ERROR 把一次失败放大成 N 次事故。最外层一次带栈即可 |
| 10 | 手工线程为什么会丢 `traceId`？ | MDC 是线程局部的。`new Thread`、未装饰的线程池、未配装饰器的 `@Async` 都不会自动带过去 |

> 回到：[Spring Boot · 导览](/java/spring/spring-boot/)　|　相关：[日志管道 · 结构化](/cloud-native/observability/logging-pipeline#structured)　|　相关：[慢请求剧本](/cloud-native/observability/slow-request)
