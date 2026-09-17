---
date: 2026-09-13
title: Spring Boot · 导览
desc: 自动配置、Starter 工程化、启动流程、配置体系、Actuator、内嵌容器、应用日志七块的定位、依赖关系与推荐顺序
---

# Spring Boot · 导览

Spring Boot 解决的问题可以用一句话概括：**把"搭一个能跑的 Spring 应用"从配置工作变成依赖声明**。

它的能力全部建立在 Spring Framework 的 IoC 容器之上——**自动配置本质是"条件化的 Bean 注册"，启动流程本质是"按顺序驱动容器"**。其余几块都是这两条主线的延伸：Starter 是"把自动配置打包分发"的工程化，配置体系是"装配读取什么"，Actuator 与内嵌容器是"跑起来之后与跑起来之前"，应用日志是「刚才那一次」在进程内的约定。

## 一、七块内容与依赖关系 {#modules}

| # | 主题 | 回答的核心问题 | 依赖 |
|---|---|---|---|
| 1 | [自动配置原理](/java/spring/spring-boot/auto-configuration) | 为什么引个 starter 就能用？条件装配怎么裁决？ | [IoC 容器](/java/spring/spring-framework/ioc/) |
| 2 | [Starter 设计与自定义](/java/spring/spring-boot/starter) | 怎么把一套装配逻辑发布给别人用？怎么测试与排错？ | 自动配置 |
| 3 | [启动流程](/java/spring/spring-boot/startup) | 一行 `SpringApplication.run()` 背后发生了什么？ | IoC、Bean 生命周期 |
| 4 | [配置体系](/java/spring/spring-boot/configuration) | 配置从哪来、谁覆盖谁？改了为什么不生效？ | 启动流程 |
| 5 | [Actuator 与生产可观测](/java/spring/spring-boot/actuator) | 它现在健康吗、慢在哪、刚才发生了什么？ | 启动流程、配置体系 |
| 6 | [内嵌容器与请求进入](/java/spring/spring-boot/web-server) | Web 服务器什么时候起来？请求怎么进来？ | 启动流程、Actuator |
| 7 | [应用日志约定](/java/spring/spring-boot/logging) | 字段叫什么、`traceId` 怎么跟上请求、级别怎么用？ | Actuator（动态改级别） |

```text
                    ┌──────────────────────────────┐
                    │   Spring Framework：IoC 容器  │
                    └──────────────┬───────────────┘
                                   │
        ┌──────────────────────────┼───────────────────────────┐
        ▼                          ▼                           ▼
┌───────────────┐        ┌──────────────────┐        ┌──────────────────┐
│ ① 自动配置原理 │◀──────▶│ ② Starter 工程化  │        │ ③ 启动流程        │
│ （机制）       │  打包分发│ （怎么发布与测试） │        │ （按顺序驱动容器） │
└───────┬───────┘        └──────────────────┘        └────────┬─────────┘
        │ 读什么配置                                             │ 何时做
        ▼                                                      ▼
┌───────────────┐                                   ┌──────────────────┐
│ ④ 配置体系     │                                   │ ⑤ Actuator        │
│ （属性源与绑定）│                                   │ （生产可观测）     │
└───────┬───────┘                                   └────────┬─────────┘
        │                                                      │
        └──────────────────┬───────────────────────────────────┘
                           ▼
                  ┌──────────────────┐
                  │ ⑥ 内嵌容器与请求  │   ← Web 服务器何时起、请求如何进入
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ ⑦ 应用日志约定    │   ← 进程内字段 / MDC / 级别；管道在可观测板块
                  └──────────────────┘
```

**推荐顺序：① → ② → ③ → ④ → ⑤ → ⑥ → ⑦。** 前三块是"装配机制 + 分发方式 + 驱动时机"，构成理解 Boot 的最小闭环；后四块是"配置从哪来、上线看什么、请求怎么进、出事怎么按一次请求收齐日志"。⑦ 与 ⑤ 并列：Actuator 回答「现在健康吗」，日志回答「刚才那一次」。

## 二、一条贯穿的主线：约定优于配置 {#convention}

| 表面现象 | 背后的机制 | 详见 |
|---|---|---|
| 引了 starter 就自动有 `RedisTemplate` | `AutoConfiguration.imports` 清单 + `@ConditionalOnClass` | [自动配置](/java/spring/spring-boot/auto-configuration#starter-structure) |
| 我自定义的 Bean 能覆盖默认实现 | `@ConditionalOnMissingBean`（粒度要落在每个 `@Bean` 上） | [Starter 设计](/java/spring/spring-boot/starter#condition-granularity) |
| 换个数据库只改配置不改代码 | `@ConfigurationProperties` + 外部化配置优先级 | [配置体系](/java/spring/spring-boot/configuration#precedence) |
| 启动报错信息比原生 Spring 友好 | `FailureAnalyzer` | [启动流程](/java/spring/spring-boot/startup) |
| 启动慢可以量化定位 | `BufferingApplicationStartup` + `/actuator/startup` | [Actuator](/java/spring/spring-boot/actuator#startup-endpoint) |
| 滚动发布不会让新实例带半初始化状态接流量 | 容器在 Bean 就绪后才 `start()`；readiness 在启动前为 `REFUSING_TRAFFIC` | [内嵌容器](/java/spring/spring-boot/web-server#when-started) |

**这条主线的实用价值**：Boot 的所有"魔法"都是可解释、可干预的——每个默认行为背后都有一个 `@Conditional` 或一个扩展点，找到它就能改掉它。

## 三、按场景选择入口 {#paths}

| 你的情况 | 建议路径 |
|---|---|
| **第一次系统理解 Boot** | [自动配置](/java/spring/spring-boot/auto-configuration) → [启动流程](/java/spring/spring-boot/startup) → [配置体系](/java/spring/spring-boot/configuration) |
| **要做一个内部 starter** | [自动配置](/java/spring/spring-boot/auto-configuration) → [Starter 设计与自定义](/java/spring/spring-boot/starter)（含测试与坑表） |
| **"配置改了不生效"** | [配置体系](/java/spring/spring-boot/configuration#precedence) → 用 `/actuator/env` 验证来源 |
| **上线前做生产加固** | [Actuator](/java/spring/spring-boot/actuator#security) → [应用日志](/java/spring/spring-boot/logging) → [内嵌容器](/java/spring/spring-boot/web-server#graceful-shutdown)（优雅停机） |
| **压测 QPS 上不去 / 连接超时** | [内嵌容器](/java/spring/spring-boot/web-server#tomcat-threads)（三个参数的关系） |
| **别人拿 `traceId` 找不到那次请求** | [应用日志](/java/spring/spring-boot/logging#mdc) → [日志管道 · 结构化](/cloud-native/observability/logging-pipeline#structured) |
| **面试前突击** | [高频考点速查](#faq) → 回正文看推导 |

## 四、高频考点速查 {#faq}

| 高频问题 | 一句话答案 | 详见 |
|---|---|---|
| Spring Boot 自动配置的原理？ | `@SpringBootApplication` 内含 `@EnableAutoConfiguration`，通过 `AutoConfiguration.imports` 清单导入配置类，再由 `@Conditional` 家族裁决是否装配 | [自动配置](/java/spring/spring-boot/auto-configuration#starter-structure) |
| `@ConditionalOnMissingBean` 该加在哪？ | 加在**每个 `@Bean` 方法**上；加在类上会导致"用户覆盖一个 Bean，整个类的其它 Bean 全消失" | [Starter 设计](/java/spring/spring-boot/starter#condition-granularity) |
| starter 和 autoconfigure 为什么要拆两个模块？ | 职责分离与依赖隔离（只引 autoconfigure 就不必拉实现库），也让自动配置能独立测试；分发范围小可以不拆 | [Starter 设计](/java/spring/spring-boot/starter#two-modules) |
| 怎么测试一个自动配置？ | `ApplicationContextRunner` 指定类路径 / 属性 / 用户配置，断言 Bean 是否注册；覆盖"类缺失、正常、用户覆盖、开关关闭、属性非法"五种场景 | [Starter 设计](/java/spring/spring-boot/starter#testing) |
| 配置的优先级顺序？ | 配置文件整体在中下位：**环境变量 > 配置文件、命令行参数 > 环境变量**；后者覆盖前者 | [配置体系](/java/spring/spring-boot/configuration#full-list) |
| `spring.config.import` 谁优先？ | **被导入的优先于导入它的文件**（被当作"插在声明文档下方"的文档） | [配置体系](/java/spring/spring-boot/configuration#import-semantics) |
| K8s 里配置怎么传？ | 用 config tree：`spring.config.import=configtree:/etc/config/`；环境变量无法表达层级与大小写，密码也更容易泄露 | [配置体系](/java/spring/spring-boot/configuration#config-tree) |
| `@ConfigurationProperties` 和 `@Value` 怎么选？ | 一组相关配置用前者（类型安全 / 校验 / 元数据），单个简单值可用后者（唯一优势是 SpEL） | [配置体系](/java/spring/spring-boot/configuration#binding-compare) |
| liveness 与 readiness 有什么区别？ | liveness 失败**重启**，readiness 失败只**摘流量**；**外部依赖绝不能进 liveness**（否则级联重启） | [Actuator](/java/spring/spring-boot/actuator#probes) |
| 健康检查是怎么汇总的？ | 所有 `HealthIndicator` 聚合，任一 `DOWN` 即整体 `DOWN`；可按用途配健康分组 | [Actuator](/java/spring/spring-boot/actuator#health-indicators) |
| 指标基数问题指什么？ | 标签取值组合数决定时间序列数；给 userId / 原始 URL 打标签会爆炸，要用模板化 + `MeterFilter` 兜底 | [Actuator](/java/spring/spring-boot/actuator#cardinality) |
| 不重启怎么改日志级别？ | `POST /actuator/loggers/{name}`；**还原要传 `configuredLevel: null`**，传具体值会钉住配置 | [Actuator](/java/spring/spring-boot/actuator#loggers) |
| 应用日志最小该有哪些字段？ | `timestamp`（带时区）、`level`、`service`、`traceId`、`message`；异常进独立字段。`service` 与 `traceId` 必须和指标、链路同一套值 | [应用日志](/java/spring/spring-boot/logging#fields) |
| `traceId` 为什么不写在业务代码里？ | 链路库写入 MDC，日志框架从 MDC 读。拼进 `message` 等于关联键对检索不可见；手工线程会丢上下文 | [应用日志](/java/spring/spring-boot/logging#mdc) |
| 日志为什么写 stdout？ | 容器哲学：应用不管轮转与采集。写容器内文件会随重启丢失，且 `kubectl logs` 看不到 | [应用日志](/java/spring/spring-boot/logging#hygiene) |
| `maxConnections` / `acceptCount` / `maxThreads` 分别管什么？ | 接纳连接数 / 内核 accept 队列 / 工作线程数；连接进不来时服务端**没有日志** | [内嵌容器](/java/spring/spring-boot/web-server#three-params) |
| 为什么 `Filter` 里不能直接 `@Autowired`？ | `Filter` 由 Servlet 容器创建，时机早于 Spring 容器就绪；用 `FilterRegistrationBean` 注册 | [内嵌容器](/java/spring/spring-boot/web-server#filter-autowired) |
| `@ControllerAdvice` 能捕获所有异常吗？ | 不能：只覆盖进入 `DispatcherServlet` 之后的异常；Filter / 404 / 容器层错误走 `/error` 转发 | [内嵌容器](/java/spring/spring-boot/web-server#error-handling) |
| `server.shutdown=graceful` 够了吗？ | 只覆盖 HTTP 请求段；线程池、消息消费者、注册中心注销都要自己做，且 K8s 的 `terminationGracePeriodSeconds` 要大于停机超时 | [内嵌容器](/java/spring/spring-boot/web-server#graceful-shutdown) |
| 开虚拟线程要注意什么？ | 只在 IO 密集有收益；注意 pinning；**连接池会成为新瓶颈**，必须同步复核 `maximumPoolSize` 与超时 | [内嵌容器](/java/spring/spring-boot/web-server#virtual-threads) |
| Spring Boot 4 有哪些变化？ | 模块化（autoconfigure 与 Actuator 都拆了，有包名迁移）、Jackson 3、liveness/readiness 默认启用、Actuator 用 `access` 取代 `enabled`（默认 `read-only`） | [Actuator](/java/spring/spring-boot/actuator#boot4) |

## 五、与相邻板块的边界 {#boundary}

| 相邻内容 | 分工 |
|---|---|
| [Spring MVC 执行流程](/java/spring/spring-mvc/) | MVC 篇讲**进入 `DispatcherServlet` 之后**（九大组件、参数绑定、拦截器）；[内嵌容器](/java/spring/spring-boot/web-server)讲**在那之前**（容器启动、Tomcat 参数、Filter、`/error`） |
| [Spring Framework：IoC 与 Bean](/java/spring/spring-framework/) | 容器本身的能力（Bean 生命周期、循环依赖、AOP）属于 Framework；Boot 只做"条件化装配 + 驱动时机" |
| [云原生与 K8s](/cloud-native/) | 探针、优雅停机、配置挂载在两侧都有：**机制与参数**在 Boot 侧，**编排与部署策略**在云原生侧 |
| [线程池](/java/concurrent/thread-pool) | Boot 的 `@Async` / `TaskExecutor` 是"配置层"，线程池的原理与参数推导在 Java 并发板块 |
| [日志管道](/cloud-native/observability/logging-pipeline) | 本菜单的[应用日志](/java/spring/spring-boot/logging)管**进程内约定**（字段、MDC、级别）；管道管采集、索引、Loki 高基数与成本 |
