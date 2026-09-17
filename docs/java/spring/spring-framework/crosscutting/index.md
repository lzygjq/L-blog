---
date: 2026-09-16
title: Spring 横切能力 · 板块导览
sidebar: 横切能力
desc: 缓存、异步、重试、校验、序列化五类注解能力，加上出站 HTTP 超时对齐；注解栈顺序、与相邻板块边界、版本现状，以及 72 题面试索引
---

# Spring 横切能力 · 板块导览

Spring 里有一类知识**不属于任何一块"机制"**，却是每个项目都要配、每个面试官都会追问的：**缓存、异步、重试、校验、序列化**，以及**出站调用的超时预算**。

前五个的共同点是——**加个注解或配个 Bean 就"应该"生效，而失效时都不报错**：

- `@Cacheable` 没生效 → 每次都查库，只是"慢了"
- `@Async` 没生效 → 方法变成同步执行，只是"响应慢了"
- `@Valid` 没生效 → 脏参数进了业务逻辑，可能到数据库才报错
- 序列化配错 → 接口返回了**错误的数据**，而不是报错

这块内容原先分散在[Spring 核心](/java/spring/spring-framework/)的机制篇里被零星提及——**导览页的主线二甚至明确列出了 `@Async`、`@Cacheable` 这两个"靠代理生效"的注解，但站内一直只有 `@Transactional` 有专篇**。本板块把这五个零覆盖或薄覆盖的缺口补齐，并补上出站 HTTP 的超时对齐——它不是注解失效，是**入站预算被出站花光**。

> **主线：前五个能力都是"加个注解就以为生效"；第六个是"出站超时以为配了"。**
>
> **理解前五个的关键不是记住注解，而是回答三个问题：这段逻辑有没有被执行（代理与条件）、它读写的状态是不是同一份（key / 事务 / Locale / 时区）、它和相邻能力谁先谁后（注解栈的顺序）。**
>
> **五篇注解的失效模式可以统一成一句话：注解的语义由代理决定，代理的边界由调用方式决定，而大多数生产事故都发生在"你以为走了代理"的那次自调用上。出站超时则是另一句话：内层必须短于外层，否则用户看到 504，日志里没有超时。**

## 一、一条主线：注解写上去 ≠ 行为生效 {#thread}

```
        ┌──────────────────────────────────────────────────┐
        │  一个业务方法上叠了几个注解，它们从外到内依次生效  │
        └──────────────────────────────────────────────────┘
                              │
   ┌──────────────┬───────────┼───────────┬──────────────┐
   ▼              ▼           ▼           ▼              ▼
缓存抽象       异步执行    重试与并发    校验与异常    序列化边界
@Cacheable     @Async      @Retryable    @Valid        @JsonXxx
   │              │           │           │              │
读缓存的时机    跑在哪个池   失败后重试   错误怎么报    类型怎么翻译
与事务的顺序    上下文传递   幂等前提     两条异常链    Long/时间/对象图
   │              │           │           │              │
   └──────────────┴───────────┴───────────┴──────────────┘
                              │
              ┌───────────────┴────────────────┐
              ▼                                ▼
      生效条件（代理 / public / 非自调用）   语义正确性（顺序 / 边界 / 契约）
              │                                │
        "注解没生效"类故障               "生效了但结果是错的"类故障
        （性能退化、静默同步）            （脏缓存、精度丢失、时间偏移）
```

**这张图想说明一件事**：这五篇的故障分成两大类，**排查手段完全不同**。

| 故障类别 | 典型表现 | 最快的判别手段 |
|---|---|---|
| **注解没生效** | 缓存不命中、异步变异步、校验不执行 | **在方法体第一行打日志**——不执行说明代理没走到 |
| **生效了但语义错** | 脏缓存、时间差 8 小时、ID 末位变 0 | **看原始响应体**（`curl` / Network）——原始就错则是序列化或顺序问题 |

**这个二分法是本板块最实用的一个工具**：它能在一分钟内把问题从"五个能力都怀疑一遍"收敛到"某一篇的某一节"。出站超时是第三类——**外层先失败、内层还在等**——判别手段是对网关超时与出站 `readTimeout`，不是看注解。

## 二、六篇地图 {#map}

| # | 篇目 | 回答的核心问题 | 最高频的坑 |
|---|---|---|---|
| 1 | [缓存抽象](/java/spring/spring-framework/crosscutting/cache) | 缓存在哪、key 怎么生成、注解为什么不生效 | **`@CachePut` 写在事务里 → 回滚后留脏缓存** |
| 2 | [异步执行](/java/spring/spring-framework/crosscutting/async) | 任务跑在哪个线程池、上下文怎么传、异常去哪了 | **默认执行器每次新建线程**；`void` 返回到吞掉异常 |
| 3 | [重试与并发限制](/java/spring/spring-framework/crosscutting/resilience) | 什么该重试、重试几次、退避怎么算 | **重试了非幂等操作**；`@Transactional` 在外导致重试无效 |
| 4 | [校验与异常](/java/spring/spring-framework/crosscutting/validation) | 校验在哪一层、失败怎么统一报出去 | **两条异常链只处理一条** → 路径参数报 500 |
| 5 | [序列化边界](/java/spring/spring-framework/crosscutting/json) | 类型怎么翻译、时间按哪个时区、ID 怎么不失真 | **`Long` 超出 JS 安全整数**；`LocalDateTime` 被按时区解释 |
| 6 | [出站 HTTP](/java/spring/spring-framework/crosscutting/outbound-http) | 出站超时怎么短于入站预算、重试会不会把预算吃光 | **网关 504 但应用没有超时日志**；HTTP 池与 Hikari 调错 |

**五篇的共同结构**（也是它们的价值所在）：

```
问题场景（这类故障长什么样）
   ▼
生效条件（什么情况下它"看起来生效其实没生效"）
   ▼
配置方式（怎么配才对，以及配错的表现）
   ▼
失效清单（把所有"不生效"的成因列成一张表）
   ▼
面试口径（12 题，可背的短句）
```

**第五篇（序列化）与另外四篇略有不同**：它没有"代理"这一层——序列化不依赖 AOP 拦截。但把它放在这里的原因是**同一个主线**：它同样是"配了就应该生效、失效时静默返回错数据"的横切能力，而且它的故障排查手段（看原始响应体）与另外四篇形成互补。

**第六篇（出站 HTTP）也没有代理**：它接在重试篇的「总时长必须小于上游超时」之后，落到客户端的 connect/read/借连接等待，以及和 Hikari 那套入站池的分工。服务发现与 Feign 不在本篇。

## 三、注解栈：同一个方法上的顺序问题 {#annotation-stack}

**这是本板块最值得单独记住的一节。** 一个真实的 Service 方法常常同时挂着三四个注解，而**它们的相对顺序决定了整体行为**：

```java
@Async                                  // ① 最外层：先提交到线程池
@Retryable(maxAttempts = 3)             // ② 再考虑重试
@Cacheable(value = "users", key = "#id")// ③ 再查缓存
@Transactional                          // ④ 最内层：真正干活时开事务
public UserVO get(Long id) { ... }
```

| 顺序 | 结论 | 违反的后果 |
|---|---|---|
| `@Async` 必须**在最外** | 内层时会因**自调用**失效 | 异步变异步，接口 RT 突然变长 |
| `@Retryable` 必须在 `@Transactional` **之外** | 每次重试开**新事务** | 事务已被标记 `rollback-only`，重试成功也提交失败 |
| `@Cacheable` 与 `@Transactional` 的相对位置 | 关键不在内外，而在**写入发生在提交前还是提交后** | `@CachePut` 在事务内 → 回滚后**脏缓存**（见[缓存与事务的顺序](/java/spring/spring-framework/crosscutting/cache#with-transaction)） |

**三条规律背后的同一句话**：**注解的顺序不是"写法风格"，而是"执行顺序的声明"**。当两个注解的语义互相影响时（异步与线程、重试与事务、缓存与事务），顺序错了不会报错，只会**安静地做错事**。

**最稳妥的工程约定是"拆开"而不是排序**：

```java
public void submit(Long id) {              // 外层：只负责编排（异步、重试）
    self.doSubmit(id);                     // 走代理
}

@Transactional
public void doSubmit(Long id) { ... }      // 内层：只负责业务与事务边界
```

拆成两个方法（或两个 Bean）之后，每个注解的作用范围都是显式的，**不再依赖"谁在外层"这种隐式知识**。

## 四、与相邻板块的分工 {#boundary}

本板块刻意**只讲"Spring 怎么用、什么情况下不生效"**，不讲这些能力本身的原理与策略——那是相邻板块的职责。交叉引用、不重复展开：

| 相邻板块 | 它负责什么 | 本板块引用它 |
|---|---|---|
| [Spring 核心](/java/spring/spring-framework/) | 代理机制、Bean 生命周期、事务传播行为——**"为什么注解会失效"的底层机制** | 五篇的失效清单全部建立在这套机制上，尤其见[AOP 与代理机制](/java/spring/spring-framework/aop/) |
| [Spring MVC](/java/spring/spring-mvc/) | 请求分发、参数绑定、`HttpMessageConverter` 的**位置** | [校验与异常](/java/spring/spring-framework/crosscutting/validation)依赖参数绑定链路的结论 |
| [Spring Boot](/java/spring/spring-boot/) | 自动配置、内嵌容器、**虚拟线程**、优雅停机 | [异步执行](/java/spring/spring-framework/crosscutting/async)引用[虚拟线程](/java/spring/spring-boot/web-server#virtual-threads)与[优雅停机](/java/spring/spring-boot/web-server#graceful-shutdown) |
| [Spring Cloud](/java/spring/spring-cloud/) | **服务级**容错：熔断、限流、隔离、分布式调度 | [重试与并发限制](/java/spring/spring-framework/crosscutting/resilience)讲**方法级**，服务级见[服务保护](/java/spring/spring-cloud/resilience)；打到哪一台见[负载均衡](/java/spring/spring-cloud/loadbalancer)，打过去等多久见[出站 HTTP](/java/spring/spring-framework/crosscutting/outbound-http) |
| [连接池](/database/mysql/connection-pool#timeouts) | 入站路径上 Hikari 的五个超时 | [出站 HTTP](/java/spring/spring-framework/crosscutting/outbound-http#pools)是另一套池；对齐原则相同 |
| [Redis 板块](/database/redis/) | **缓存策略**：穿透/击穿/雪崩、一致性四档、多级缓存架构 | [缓存抽象](/java/spring/spring-framework/crosscutting/cache)只讲注解与顺序，策略见[缓存模式](/database/redis/cache-patterns) |
| [安全板块](/security/) | 认证授权、`@PreAuthorize`、OAuth2 | `SecurityContext` 在异步线程的传递见[异步执行·上下文传递](/java/spring/spring-framework/crosscutting/async#context) |
| [测试板块](/java/testing/) | 切片测试、`@MockitoBean`、上下文缓存 | 异步与校验的测试写法引用 [Spring Boot 测试](/java/testing/spring-boot-test) |

**"分工"这条线在本板块特别重要**，因为缓存、异步、重试、校验这四个词**在别的板块里也有**——只是视角不同：

| 同一个词 | 在相邻板块 | 在本板块 |
|---|---|---|
| 缓存 | Redis 的数据结构与一致性策略 | `CacheManager` 选型、注解的失效条件 |
| 重试 | 服务级熔断与限流（跨实例协调） | 方法级重试、幂等前提、退避参数 |
| 异步 | 虚拟线程的原理与 Pinning | `@Async` 的线程池、上下文、异常 |
| 校验 | ——（站内首次系统覆盖） | 两条异常链、分组、RFC 9457 |

## 五、版本与现状 {#version}

**这张表是本板块所有"现在应该怎么写"的依据**，也是与站内其他页面保持一致的口径：

| 事实 | 说明 |
|---|---|
| **Spring Boot 4.0 / Framework 7.0** | 4.0.0 于 **2025-11-20** GA（基线为 Framework 7.0）；4.1.0 于 **2026-06-10**（4.x 首个功能更新） |
| **3.5 线已 EOL** | OSS 支持 **2026-06-30** 结束；**4.0.x 支持到 2026-12-31**——升级窗口已不宽裕 |
| **Jakarta EE 11 基线** | Servlet 6.1（Tomcat 11）、JPA 3.2、**Bean Validation 3.1**（Hibernate Validator 9） |
| **重试内建** | Framework 7 把**方法级重试与并发限制**移入 `spring-core`（`@Retryable` / `@ConcurrencyLimit`），不再需要 `spring-retry` / Resilience4j |
| **Jackson 3 成为默认** | 根包名 **`com.fasterxml.jackson` → `tools.jackson`**；Jackson 2 以 deprecated 形式保留，计划在 Framework 7.2 移除 |
| **RFC 9457** | 取代 RFC 7807（2023），字段结构不变；`ProblemDetail` 是 Framework 6 起的实现 |
| **JSpecify 取代 JSR-305** | `org.springframework.lang.Nullable` 等已废弃，改用 `org.jspecify.annotations.*` |
| **`@MockBean` 已移除** | Boot 3.4 起改为 `@MockitoBean`，见[测试板块](/java/testing/spring-boot-test#mockitobean) |
| **多 `TaskDecorator` 支持** | Boot 4 通过 `CompositeTaskDecorator` 组合多个装饰器，此前自定义装饰器会被第三方组件覆盖 |

**两条与写法直接相关的推论**：

**① 关于重试**：如果你在维护一个 Boot 3.x 项目，仍要用 `spring-retry`；如果是新项目（Boot 4.x），**优先用内建的 `@Retryable`**，但要注意注解属性名以所用版本的 API 为准。

**② 关于序列化**：Jackson 3 的迁移成本主要在 **import 路径**。降低风险的做法是**不手写 `ObjectMapper`**、始终注入容器实例——这样迁移只改配置，业务代码不动。

> **与站内其他页面的口径一致性**：Boot 版本与 EOL 时点引用自[内嵌容器与请求进入 · 版本现状](/java/spring/spring-boot/web-server#version)；虚拟线程的配置与边界同页[第九节](/java/spring/spring-boot/web-server#virtual-threads)。两处如与本文不一致，以那两处为准（它们随版本更新维护）。

## 六、面试索引：72 题 {#interview}

前五篇各 12 题，出站 HTTP 12 题。**注解类问题几乎都能追溯到"代理 + 生命周期 + 顺序"**——回答时先定位到阶段或顺序，再展开细节。超时类问题先问「内外层谁先失败」。

| 篇目 | 题数 | 索引 | 高频前三 |
|---|---|---|---|
| 缓存抽象 | 12 | [缓存抽象 · 面试口径](/java/spring/spring-framework/crosscutting/cache#interview) | 注解失效的条件、与事务的顺序、`sync` 的边界 |
| 异步执行 | 12 | [异步执行 · 面试口径](/java/spring/spring-framework/crosscutting/async#interview) | 默认执行器的陷阱、上下文传递、`void` 吞异常 |
| 重试与并发限制 | 12 | [重试与并发限制 · 面试口径](/java/spring/spring-framework/crosscutting/resilience#interview) | 重试的四个前提、与事务的顺序、幂等 |
| 校验与异常 | 12 | [校验与异常 · 面试口径](/java/spring/spring-framework/crosscutting/validation#interview) | `@Valid` vs `@Validated`、两条异常链、RFC 9457 |
| 序列化边界 | 12 | [序列化边界 · 面试口径](/java/spring/spring-framework/crosscutting/json#interview) | `Long` 精度、时间与时区、Jackson 3 迁移 |
| 出站 HTTP | 12 | [出站 HTTP · 面试口径](/java/spring/spring-framework/crosscutting/outbound-http#interview) | 内外层超时方向、两套连接池、重试预算 |

**跨篇的四个必答题**（面试官常把它们合在一起问）：

1. **"说说 Spring 里哪些注解失效的原因是一样的？"** —— 答：`@Transactional`、`@Async`、`@Cacheable`、`@PreAuthorize` **全部靠代理**，所以自调用、`private`/`final`、缺开关注解是同一份清单。
2. **"同一个方法上 `@Async` 和 `@Transactional` 谁在外？"** —— 答：`@Async` 在外是常见写法（新线程开事务）；**反过来 `@Async` 会因自调用失效**。推荐拆成两个 Bean。
3. **"`@Cacheable` 和事务一起用时要注意什么？"** —— 答：不是内外问题，而是**缓存的写发生在事务提交之前**，回滚会留下永久脏缓存。优先用 `@CacheEvict`，或用 `afterCommit` 回调。
4. **"接口返回的 ID 和数据库里的不一样，怎么回事？"** —— 答：`Long` → JSON number → JS `Number`（float64，安全整数 16 位）**精度丢失**。序列化成字符串解决。

## 七、阅读顺序 {#reading-order}

```
① 缓存抽象 ────────────▶ 最贴近日常开发，先建立"注解失效清单"的思维
        │
        ▼
② 异步执行 ────────────▶ 线程池与上下文，生产事故密度最高的一篇
        │
        ▼
③ 重试与并发限制 ──────▶ 异步的后续：失败了怎么办、并发怎么限
        │
        ▼
④ 校验与异常 ──────────▶ 入口的另一半：数据进来时不合法怎么办
        │
        ▼
⑤ 序列化边界 ──────────▶ 收口：数据出去时类型怎么不失真
        │
        ▼
⑥ 出站 HTTP 超时 ───────▶ 另一条线：入站预算怎么花在出站与重试上
```

**顺序不是必须的**——六篇彼此可独立跳读。**如果按顺序读，会明显感觉到 ①→②→③ 是一条线**（都是"方法的执行行为"），④→⑤ 是另一条线（都是"请求进出的边界行为"），⑥ 挂在 ③ 后面（同一笔超时预算）。

**建议的前置知识**：至少读过[AOP 与代理机制](/java/spring/spring-framework/aop/)，理解"代理替换的是 Bean 的最终形态"。**没有这个前提，前五篇的失效清单会变成需要死记的条目**——有了它，所有失效原因都是同一句话的不同表现。第六篇的前置是[连接池 · 超时对齐](/database/mysql/connection-pool#timeouts)里「内层必须短于外层」那一句。

> 回到：[Spring · 导览](/java/spring/spring-framework/)　|　相关：[Spring 生态 · 导览](/java/spring/)
