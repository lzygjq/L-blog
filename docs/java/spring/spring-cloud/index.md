---
order: 0
date: 2026-09-14
title: Spring Cloud · 导览
desc: 组件 / 分布式理论 / 分布式能力三域划分，9 篇学习主线，以及 Ribbon、Hystrix、Zuul 的淘汰史与现役选型
---

# Spring Cloud · 导览

单体应用里，一次方法调用就是一次栈帧跳转——不会丢、不会超时、不会因为对端挂了而卡住。拆成微服务之后，这一跳变成了网络请求，于是凭空多出一整类问题：

- **谁在哪**——下游服务有几个实例、IP 是多少，谁来告诉调用方（注册中心）
- **挑哪个**——三个实例选一个，按什么规则选（负载均衡）
- **怎么调**——每次手写 HTTP 客户端太啰嗦，能不能像调本地方法一样（声明式远程调用）
- **垮了怎么办**——一个下游超时，会不会把上游线程池占满、一路往上崩（熔断与降级）
- **怎么进门**——外部流量从哪进、在哪做鉴权和限流（网关）
- **出问题怎么查**——一次请求穿过 6 个服务，日志散在 6 台机器上（链路追踪）
- **数据怎么一致**——一个业务动作写了 3 个库，第 3 个失败了前两个怎么办（分布式事务）

这个菜单就是按这条线组织的。

## 一、三个知识域 {#three-domains}

菜单名叫 Spring Cloud，但里面装着三个不同层次的东西，**先分清它属于哪一层**：

| 域 | 回答的问题 | 篇目 | 换个框架还成立吗 |
|---|---|---|---|
| **框架组件** | 用哪个组件、怎么配、原理是什么 | 注册中心 / 负载均衡与调用 / 服务保护 / 网关与限流 / 链路追踪 | 不成立——换 Dubbo、换 K8s Service 就换了 |
| **分布式理论** | 为什么要做取舍、取舍的根据是什么 | CAP 与 BASE | 成立 |
| **分布式能力** | 跨服务的通用难题怎么解 | 分布式事务 / 接口幂等 / 分布式任务调度 | 成立——框架只提供工具，问题本身不变 |

**为什么要这么分**：「Spring Cloud 有哪些组件」是记性问题，背过的人都会；真正拉开差距的是后两域——「你们为什么选 AP 不选 CP」「幂等为什么不用分布式锁」，这些不随框架变化，也更能看出你是否真的理解。

## 二、学习主线 {#mainline}

| # | 篇目 | 一句话 |
|---|---|---|
| 1 | [注册中心](/java/spring/spring-cloud/registry) | 服务注册、心跳续约、健康检查、AP/CP 切换 |
| 2 | [负载均衡与远程调用](/java/spring/spring-cloud/loadbalancer) | 客户端负载均衡的流程与策略、声明式 HTTP 调用 |
| 3 | [服务保护](/java/spring/spring-cloud/resilience) | 雪崩、降级、熔断三状态机 |
| 4 | [网关与限流](/java/spring/spring-cloud/gateway) | 统一入口、路由与过滤器链、三层限流 |
| 5 | [链路追踪](/java/spring/spring-cloud/tracing) | TraceId 透传、服务拓扑、告警 |
| 6 | [CAP 与 BASE](/java/spring/spring-cloud/cap-base) | 一致性、可用性、分区容错为什么只能三选二 |
| 7 | [分布式事务](/java/spring/spring-cloud/transaction) | Seata 四种模式（AT / TCC / Saga / XA）的取舍 |
| 8 | [接口幂等](/java/spring/spring-cloud/idempotency) | 重复点击、消息重投、超时重试怎么兜住 |
| 9 | [分布式任务调度](/java/spring/spring-cloud/scheduling) | 定时任务在多实例下怎么只跑一次、怎么分片并行 |

**建议顺序**：1 → 5 是组件（自底向上：能发现 → 能调用 → 能保命 → 能进门 → 能排查），6 → 9 是能力（先有理论，再谈方案）。若时间有限，**6 → 9 的优先级高于 1 → 5**——组件可以照着文档配，理论答不上来是硬伤。

## 三、组件选型现状：现役 vs 已淘汰 {#component-status}

这张表值得单独记：**面试话术稿里常见的一批组件，早就不在 Spring Cloud 的发行列车上了**。答「用 Ribbon 做负载均衡」在今天会被追问「Ribbon 已经移除了你知道吗」。

| 能力 | 现役（推荐） | 已淘汰 / 停更 | 变化时间点 |
|---|---|---|---|
| **注册中心** | Nacos、Consul | Eureka（保留但已不推荐）、ZooKeeper | 2020 年 Netflix 套件清理 |
| **负载均衡** | Spring Cloud LoadBalancer | **Ribbon** | Spring Cloud 2020.0.0 移除 |
| **声明式调用** | OpenFeign | Feign 本体已归 OpenFeign 社区维护 | 归属变更，非废弃 |
| **熔断降级** | Sentinel、Resilience4j | **Hystrix** | Spring Cloud 2020.0.0 移除 |
| **网关** | Spring Cloud Gateway | **Zuul 1**（阻塞式）；Zuul 2 从未并入 | Spring Cloud 2020.0.0 移除 |
| **配置中心** | Nacos、Apollo、Spring Cloud Config | Archaius | Spring Cloud 2020.0.0 移除 |
| **链路追踪** | Skywalking、Micrometer Tracing + Zipkin | Spring Cloud Sleuth | 2022.0 起由 Micrometer Tracing 接替 |

> **一段可以直接用的口径**：Spring Cloud 2020.0.0 起，官方清理了 `spring-cloud-netflix` 除 Eureka 之外的全部模块——Ribbon、Hystrix、Zuul、Archaius、Turbine 都被移除，官方替代分别是 **Spring Cloud LoadBalancer、Resilience4j、Spring Cloud Gateway、Spring Cloud Config**。国内更常见的组合是 **Spring Cloud Alibaba**：Nacos 一个组件同时顶掉注册中心和配置中心，Sentinel 顶掉 Hystrix，再加 Seata 解决分布式事务。

**要记的是逻辑，不是组件名单**：Netflix 这几件套在 2018 年前后陆续进入维护状态（只修严重 bug、不加新功能），Spring 官方等了两年、确认替代品成熟后，在 2020 年的大版本里一次性删干净。所以「某组件停更」不等于「立刻不能用」，而是「新一轮选型不该再用它」。

## 四、面试索引 {#interview-index}

| 高频问题 | 去哪看 |
|---|---|
| 核心组件有哪些、各是什么职责 | 本篇第三节 + [注册中心](/java/spring/spring-cloud/registry) |
| Eureka 和 Nacos 的区别 | [注册中心](/java/spring/spring-cloud/registry) |
| 负载均衡策略有哪些、怎么自定义 | [负载均衡与远程调用](/java/spring/spring-cloud/loadbalancer) |
| 什么是服务雪崩 / 降级 / 熔断，断路器几个状态 | [服务保护](/java/spring/spring-cloud/resilience) |
| 限流有哪几层，漏桶和令牌桶的区别 | [网关与限流](/java/spring/spring-cloud/gateway) |
| 怎么定位一个跨服务的慢请求 | [链路追踪](/java/spring/spring-cloud/tracing) |
| CAP 是什么、你们的系统选哪个 | [CAP 与 BASE](/java/spring/spring-cloud/cap-base) |
| Seata 有哪几种模式、AT 的原理 | [分布式事务](/java/spring/spring-cloud/transaction) |
| 接口怎么保证幂等 | [接口幂等](/java/spring/spring-cloud/idempotency) |
| 定时任务在集群里怎么保证只跑一次 | [分布式任务调度](/java/spring/spring-cloud/scheduling) |
