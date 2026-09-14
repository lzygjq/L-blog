---
order: 4
date: 2026-09-14
title: 网关与限流
desc: 网关的三大概念与过滤器执行顺序、Zuul 到 Gateway 的模型变化，以及从 Nginx 到应用层的四层限流与漏桶、令牌桶的区别
---

# 网关与限流

## 一、为什么必须有一个统一入口 {#why-gateway}

如果把所有服务直接暴露给客户端，会出现四个问题，而且每一个都要在**每个服务里重复实现一遍**：

| 问题 | 没有网关时 | 有网关后 |
|---|---|---|
| 鉴权 | 每个服务都要解析 token、校验权限 | 网关统一校验，**下游服务可以直接信任内部调用** |
| 跨域 | 每个服务都要配 CORS | 网关统一处理 |
| 限流 | 每个服务各自实现，规则散落 | 网关按统一维度限流 |
| 地址暴露 | 客户端要知道每个服务的域名 | 客户端只认识网关一个地址 |

**网关的职责边界要说清**：路由转发、鉴权、限流、熔断、协议转换、日志埋点、灰度分流。

> **网关里不该做的事**：业务逻辑、数据库查询、调用下游服务拼数据。原因是下面这条——**Gateway 是响应式的，跑在极少的线程上；一旦在里面写了阻塞代码（JDBC 查询、`Thread.sleep`、同步 HTTP 调用），就会把整个网关的线程卡死**，影响的是全站所有请求。这是新手最容易犯、后果最严重的错误。

**和 Nginx 的分工**（常被追问）：两者都做转发，但定位不同——

| | Nginx | 业务网关（Gateway） |
|---|---|---|
| 层次 | 四层 / 七层，靠配置文件 | 七层，靠代码 + 配置 |
| 擅长 | 静态资源、TLS 卸载、超高并发转发 | **业务感知**：按用户、按租户、按接口的动态路由与限流 |
| 改动代价 | 改配置 + reload | 改规则即刻生效（配合配置中心） |
| 关系 | 通常 Nginx 在最外层做入口和 TLS，**再用它把流量转给 Gateway** | 在 Nginx 之后，做业务级治理 |

## 二、三个核心概念 {#three-concepts}

Spring Cloud Gateway 的全部配置都围绕三个词：

| 概念 | 是什么 | 一句话 |
|---|---|---|
| **Route（路由）** | 一条转发规则 | = `id` + `uri`（转发到哪）+ `predicates`（什么请求匹配）+ `filters`（转发前后做什么） |
| **Predicate（断言）** | 匹配条件 | 就是 Java 8 的 `Predicate`，输入是 `ServerWebExchange`（请求上下文），返回是否匹配 |
| **Filter（过滤器）** | 拦截并改写请求 / 响应 | 分**全局**（`GlobalFilter`，对所有路由生效）和**局部**（`GatewayFilter`，只对该路由生效） |

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: order-service                     # 路由 id，唯一即可
          uri: lb://order-service               # lb:// = 走负载均衡（见 负载均衡与远程调用 篇）
          predicates:
            - Path=/api/order/**                # 断言：路径匹配
            - Method=GET,POST                   # 断言：方法匹配
          filters:
            - StripPrefix=1                     # 滤器：去掉第一段路径（/api）
            - AddRequestHeader=X-From, gateway  # 滤器：加请求头
```

**常用断言与过滤器**（不用背全，知道有哪几类即可）：

| 类型 | 常用项 |
|---|---|
| Predicate | `Path`、`Method`、`Header`、`Query`、`Cookie`、`Host`、`RemoteAddr`、`Weight`（灰度权重）、`After` / `Before` / `Between`（按时间） |
| GatewayFilter | `StripPrefix`、`RewritePath`、`AddRequestHeader` / `AddResponseHeader`、`RequestRateLimiter`、`CircuitBreaker`、`Retry`、`RequestSize` |

**`Weight` 断言值得单独知道**：它可以按权重把流量分给两个 URI（90% 走老版本、10% 走新版本），这是**灰度发布**最轻量的实现方式，比引一整套灰度方案简单得多。

## 三、请求处理链路与过滤器顺序 {#filter-chain}

### 3.1 底层模型：响应式，不是 Servlet {#reactive}

| | Zuul 1 | Spring Cloud Gateway |
|---|---|---|
| 编程模型 | **Servlet，同步阻塞** | **WebFlux + Reactor Netty，异步非阻塞** |
| 线程模型 | 一个请求占一个线程 | **少量线程处理大量连接** |
| 高并发表现 | 并发高时线程耗尽 | 连接数上万也能撑住 |
| 现状 | **已随 Netflix 套件在 2020.0.0 移除** | 现役唯一官方网关 |

**这就是 Zuul 1 被淘汰的根本原因**：它一个请求占一个 Tomcat 线程，而网关是所有流量的必经之路，线程数成了硬上限（几百个）。Gateway 用 Netty 的少量线程 + 事件循环处理连接，天然适合网关这种"转发为主、计算很轻"的场景。

**代价是编程门槛更高**：任何阻塞操作都会拖累整个事件循环，所以在 Gateway 里写自定义过滤器必须用响应式 API（`Mono` / `Flux`），不能出现阻塞调用。这就是上一节"网关里不该做业务"的由来。

### 3.2 过滤器执行顺序 {#filter-order}

```text
请求 ──▶ ┌──────────────────────────────────────────────┐
         │  Filter A（order=1）                          │
         │   ┌──────────────────────────────────────┐   │
         │   │  Filter B（order=2）                  │   │
         │   │   ┌──────────────────────────────┐   │   │
         │   │   │  NettyRoutingFilter          │   │   │
         │   │   │  【真正转发到下游服务】        │   │   │
   下游响应◀───┼───┴──────────────────────────────┘   │   │
         │   │   Filter B 的后置逻辑                 │   │
         │   └──────────────────────────────────────┘   │
         │   Filter A 的后置逻辑                        │
         └──────────────────────────────────────────────┘
                                    │
                                    ▼
                              响应给客户端
```

两条规则：

1. **顺序由 `Ordered.getOrder()`（或 `@Order`）决定，数值越小越先执行**。
2. **它是一个"洋葱模型"**：先按 order 从小到大执行各过滤器的**前置**逻辑，走到真正的转发（`NettyRoutingFilter`）之后，再按**相反顺序**执行各过滤器的**后置**逻辑。

**为什么这个顺序很关键**：前置逻辑是"改写请求"（加请求头、改路径），后置逻辑是"改写响应"（加响应头、做统一包装、记耗时）。如果一个过滤器在前置阶段就 `getResponse().setComplete()` 直接返回（比如鉴权失败），链就不会再往下走——**很多"加了鉴权但请求还是打到了下游"的问题，都是没在这一步短路返回**。

```java
// 自定义全局过滤器：登录校验示例
@Component
public class AuthGlobalFilter implements GlobalFilter, Ordered {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String token = exchange.getRequest().getHeaders().getFirst("Authorization");
        if (token == null || !valid(token)) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            // 关键：直接结束，不再向下传递 —— 少了这句请求会照样打到下游
            return exchange.getResponse().setComplete();
        }
        // 校验通过：把用户信息放进请求头，透传给下游
        ServerHttpRequest mutated = exchange.getRequest().mutate()
                .header("X-User-Id", parseUserId(token))
                .build();
        return chain.filter(exchange.mutate().request(mutated).build());
    }

    @Override
    public int getOrder() {
        return -100;   // 数值小 → 尽量靠前执行
    }
}
```

## 四、路由配置要能动态刷新 {#dynamic-route}

默认把路由写在 `application.yml` 里，**改一条路由要重启网关**——网关是全部流量的入口，重启的代价很高。生产做法是从配置中心读：

```text
① 路由配置放进 Nacos（dataId 如 gateway-routes.yaml，格式为 JSON 的路由数组）
② 网关监听该配置，变更时发 RefreshRoutesEvent
③ RouteDefinitionWriter 重新写入路由定义 → 生效
```

这样新增一个服务、调整一条路由，在控制台改完秒级生效，不重启。

**这里有个值得注意的细节**：Nacos 里的路由配置要用 **JSON**，不是 YAML。原因是 Gateway 原生的 `RouteDefinition` 是一个复杂嵌套结构，YAML 在动态场景下解析和校验都不如 JSON 直接。

## 五、限流：分四层，每层手段不同 {#ratelimit}

### 5.1 为什么要分层 {#why-layers}

单点限流的两个问题：**限得太靠后会打垮自己**（请求已经进来了才拒绝，资源已经消耗了），**限得太靠前又不够精细**（不知道是哪个用户）。

```text
客户端
  │
  ▼
① Tomcat 容器层 ── maxConnections（最大连接数，最粗粒度）
  │                 acceptCount（等待队列长度）
  │                 maxThreads（最大工作线程数）
  ▼
② Nginx 层 ──────── limit_req_zone（漏桶：控制【请求速率】）
  │                 limit_conn（控制【并发连接数】，可按单 IP）
  ▼
③ 网关层 ────────── Gateway + RequestRateLimiter（令牌桶，基于 Redis）
  │                 可按 IP / 用户 / 路径 / 接口维度
  ▼
④ 应用层 ────────── 自定义拦截器 / Sentinel
                    最灵活：可按业务参数限流（如按商品 ID）
```

**为什么要四层都要**：每一层挡掉的流量，后面几层就不用处理了。第 ①② 层是**粗粒度兜底**（挡住超大流量，保护整个入口不被压垮），第 ③④ 层是**细粒度治理**（区分用户、接口，做业务级限流）。

### 5.2 网关限流的配置 {#gateway-ratelimit}

`RequestRateLimiter` 底层是 **Redis + Lua 脚本实现的令牌桶**，靠 Redis 保证多网关实例之间计数一致：

```yaml
filters:
  - name: RequestRateLimiter
    args:
      redis-rate-limiter.replenishRate: 100   # 每秒生成多少令牌（≈ 允许的稳态 QPS）
      redis-rate-limiter.burstCapacity: 200   # 桶容量（允许的瞬时突发上限）
      redis-rate-limiter.requestedTokens: 1   # 每个请求消耗几个令牌
      key-resolver: "#{@ipKeyResolver}"       # 按什么维度限流
```

```java
// 限流维度 → 这就是"精细控制"的实现点
@Bean
public KeyResolver ipKeyResolver() {
    return exchange -> Mono.just(
            exchange.getRequest().getRemoteAddress().getHostString());
}

// 换成按用户限流，只需换一个 KeyResolver
@Bean
public KeyResolver userKeyResolver() {
    return exchange -> Mono.just(
            exchange.getRequest().getHeaders().getFirst("X-User-Id"));
}
```

**`replenishRate` 与 `burstCapacity` 的关系是最容易被追问的点**：`replenishRate=100, burstCapacity=200` 的含义是——**长期平均 100 QPS，但允许瞬间冲到 200**（桶里攒了 200 个令牌）。如果把 `burstCapacity` 设成和 `replenishRate` 相同，就等于完全没有突发能力，变成了匀速通过。

### 5.3 漏桶与令牌桶 {#bucket-algorithms}

这是限流最常考的一道对比题，**核心差别只有一个：允不允许突发**。

| | 漏桶（Leaky Bucket） | 令牌桶（Token Bucket） |
|---|---|---|
| **模型** | 请求先入桶，桶**以固定速率漏水**（处理请求） | 以固定速率**往桶里放令牌**，请求拿到令牌才能被处理 |
| **输出速率** | **恒定**，绝对平滑 | 取决于桶里有没有存货，**可以突发** |
| **突发流量** | 超过速率的直接**排队或丢弃** | 桶里有令牌就**立刻放行**，直到令牌耗尽 |
| **桶的作用** | 缓冲请求 | 缓冲令牌 |
| **典型实现** | Nginx `limit_req_zone`；Sentinel 的"排队等待"效果 | Gateway `RequestRateLimiter`（Redis）；Guava `RateLimiter` |

**怎么选**：

- **要绝对平滑、保护脆弱的下游** → 漏桶。把参差不齐的流量整成匀速，下游压力可预测。
- **要允许正常突发、不误伤用户** → 令牌桶。用户刷新页面、点两次按钮带来的小突发不该被拒绝。

**一句话记忆**：漏桶限制的是"**流出去的速率**"，令牌桶限制的是"**长期平均速率**"。

### 5.4 限流之后要做什么 {#after-limit}

**限流本身不是目的，被限流的用户体验才是**。三个必须配套的动作：

1. **返回明确的状态码**：用 `429 Too Many Requests`，而不是 500 或超时——让调用方能区分"被限流"和"服务出错"。
2. **给出可读的提示 + `Retry-After` 响应头**：告诉客户端多久后重试，比让客户端盲目重试好。
3. **限流要记日志和告警**：限流规则配错（比如把稳态 QPS 配低了一个数量级）表现为"用户大量失败但服务本身是健康的"，**这种故障靠服务指标是发现不了的**，只能靠限流计数告警。

## 六、常见坑 {#pitfalls}

| 坑 | 现象 | 原因 |
|---|---|---|
| **在过滤器里写阻塞代码** | 网关整体卡死，全站超时 | Gateway 是响应式的，阻塞会占死事件循环线程 |
| **鉴权失败没 `setComplete()`** | 401 返回了，请求还是打到了下游 | 过滤器链没被短路，必须显式结束响应 |
| **`lb://` 写成 `http://`** | 直接连到某个固定实例，负载均衡失效 | `lb://` 才会走注册表与负载均衡 |
| **`StripPrefix` 位数写错** | 下游 404 | 去几段前缀要和网关路由的路径段数对齐（`/api/order/**` 要去 1 段） |
| **Redis 挂了导致限流全放行** | 突发流量直接把下游打垮 | 令牌桶依赖 Redis，要考虑 Redis 故障时的兜底策略 |
| **限流维度选错** | 正常用户被误限、恶意请求没被限 | 按 IP 限流在 NAT 出口下会误伤整栋楼；按用户限流需要先解析身份 |
| **限流阈值拍脑袋** | 平时正常，活动一开全被限 | 阈值要从**压测和实际峰值**来，留出余量 |
| **路由改配置要重启** | 发布窗口被迫拉长 | 路由应放配置中心 + 动态刷新 |

## 面试口径

- **网关的职责**：路由、鉴权、限流、熔断、协议转换、日志、灰度。**不该做业务逻辑和阻塞调用**。
- **与 Nginx 的关系**：互补而非替代——Nginx 在最外层做入口与 TLS，Gateway 在后做业务级治理（按用户 / 接口的动态路由与限流）。
- **三大概念**：Route（id + uri + predicates + filters）、Predicate（匹配条件，Java `Predicate`）、Filter（全局 `GlobalFilter` / 局部 `GatewayFilter`）。
- **过滤器顺序**：由 `Ordered` 决定，**数值越小越先执行**；整体是**洋葱模型**——前置按序、到 `NettyRoutingFilter` 转发、后置逆序。
- **Zuul 被淘汰的根因**：Servlet 阻塞式，一请求一线程，网关这种必经之路线程数就是天花板；Gateway 用 Netty 事件循环，少量线程扛大量连接，**代价是写过滤器必须响应式**。
- **限流四层**：Tomcat（连接数 / 线程数）→ Nginx（`limit_req` 漏桶 + `limit_conn` 并发）→ 网关（`RequestRateLimiter` 令牌桶，Redis + Lua）→ 应用层（拦截器 / Sentinel，最细粒度）。
- **漏桶 vs 令牌桶**：漏桶**输出恒定、不允许突发**（缓冲请求）；令牌桶**允许突发**（缓冲令牌）。漏桶限流速，令牌桶限长期均值。Nginx 是漏桶、Gateway 是令牌桶。
- **`replenishRate` vs `burstCapacity`**：前者是稳态 QPS（每秒放多少令牌），后者是允许的瞬时突发上限；两者相等就等于没有突发能力。
- **限流的配套**：返回 **429** + `Retry-After`，并且**必须对限流计数做告警**——阈值配错这类故障不会体现在服务健康指标上。
