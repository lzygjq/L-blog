---
order: 6
date: 2026-09-15
sidebar: 内嵌容器与请求进入
title: 内嵌容器与请求进入
desc: 内嵌 Web 服务器的创建与启动时机、Tomcat 的 maxConnections/acceptCount/maxThreads 三者关系、请求从 TCP 到 DispatcherServlet 的链路、ServletContextInitializer、静态资源与错误处理、优雅停机、SSL bundle、虚拟线程的收益与新瓶颈
---

# 内嵌容器与请求进入

> **先划边界**：[Spring MVC 执行流程](/java/spring/spring-mvc/)讲的是**请求进入 `DispatcherServlet` 之后**怎么走；这一篇讲的是**在那之前**——Web 服务器是怎么被创建和启动的、TCP 连接怎么变成一个"请求"、以及容器层的几个参数为什么值得单独拿出来讲。
>
> 判据：**如果问题出在"请求还没进 Spring"，就属于本篇。**

## 一、问题场景 {#why-web-server}

四个问题，全都发生在请求进入 Spring 之前或之外：

| 现象 | 真正的原因 |
|---|---|
| 压测时 QPS 上不去，但 CPU 与线程数都不高 | 连接在**内核 accept 队列**里排队（`acceptCount` 满了），而工作线程还没忙起来 |
| 高峰期客户端报 `connect timeout`，服务端日志却什么都没有 | 连接**根本没建立**，请求没进到应用，日志自然没有 |
| 给 `Filter` 里 `@Autowired` 一个 Service，启动报注入失败 | `Filter` 由 Servlet 容器创建，生命周期**早于** Spring 容器就绪 |
| 排障时发现 404 / Filter 异常都没走 `@ControllerAdvice` | 容器级错误走的是 `/error` 转发，**不经过 `DispatcherServlet`** |

## 二、内嵌容器：容器是应用的一个对象 {#embedded-server}

### 2.1 不是"没有容器"，而是"容器归应用管" {#what-embedded}

传统方式与内嵌方式的差别不是"有没有容器"，而是**谁拥有容器的生命周期**：

```text
传统 WAR：
  外部 Tomcat 启动 ──▶ 加载 WAR ──▶ ServletContext ──▶ Spring 容器
  （容器是宿主，应用是插件；容器先存在）

内嵌（Spring Boot）：
  main() ──▶ Spring 容器初始化 ──▶ 创建 WebServer 对象 ──▶ 启动 ──▶ 对外服务
  （容器是应用创建的一个对象；Spring 先存在）
```

**由此推出两条重要结论**：

1. **Bean 全部初始化完成后，才开始监听端口。** 这就是"启动完成前不会接流量"的机制根源——不是靠约定，而是**顺序决定的**。
2. **配置方式从 `server.xml` 变成属性与 `*Customizer`**：要改容器行为，用 `server.tomcat.*` 属性，或用 `TomcatConnectorCustomizer` / `WebServerFactoryCustomizer<ConfigurableServletWebServerFactory>` 编程式定制。

### 2.2 容器在启动流程的哪一步创建 {#when-started}

| 阶段 | 发生了什么 |
|---|---|
| `ServletWebServerApplicationContext` 初始化 | 这个专门的容器子类负责"应用 + Web 服务器"的绑定 |
| `onRefresh()` | 调用 `createWebServer()`：按类路径选择 `ServletWebServerFactory`，**创建** `WebServer` 对象（此时端口还没真正绑定） |
| `finishRefresh()` | 生命周期处理器启动 `WebServerStartStopLifecycle` → **`WebServer.start()`**，端口开始监听 |
| `ApplicationReadyEvent` | 容器已就绪；`ReadinessState` 转为 `ACCEPTING_TRAFFIC` |

**这个顺序解释了三件常见困惑**：

- 为什么 `@PostConstruct` 里访问自己的接口会失败（那时端口还没起来）；
- 为什么启动期日志里"Tomcat started on port 8080"出现在一堆 Bean 初始化日志之后；
- 为什么 [Actuator](/java/spring/spring-boot/actuator#probes) 的 readiness 在启动阶段是 `REFUSING_TRAFFIC`。

### 2.3 换容器：改依赖即可 {#switch-container}

| 容器 | 默认线程模型 | 特点 |
|---|---|---|
| **Tomcat** | acceptor / poller / worker | Boot 默认；生态最成熟、资料最多 |
| **Jetty** | 同样基于 NIO 的线程池 | 更轻、长连接场景表现好（早期 WebSocket 场景常用） |
| **Undertow** | XNIO | 内存占用低、支持直接 NIO |

```xml
<!-- 换 Jetty：从 web starter 里排除 Tomcat，再引 Jetty -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
    <exclusions>
        <exclusion><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-tomcat</artifactId></exclusion>
    </exclusions>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-jetty</artifactId>
</dependency>
```

**选型判据**：默认 Tomcat 即可。除非有明确理由（如既有运维经验、特定压测结论），**换容器带来的收益通常小于"少有人踩过坑"带来的成本**。

## 三、Tomcat 的三个参数：必须一起看 {#tomcat-threads}

### 3.1 三个角色 {#acceptor-poller-worker}

```text
客户端 ──TCP 三次握手──▶ [内核 accept 队列] ──▶ Acceptor 线程 ──▶ Poller(IO 多路复用)
                            acceptCount 控制          拿走新连接         │
                                                                        ▼ 有数据可读
                                                              Worker 线程（执行业务）
                                                                   maxThreads 控制
```

| 角色 | 数量 | 职责 |
|---|---|---|
| **Acceptor** | 少量（默认 1） | 从内核队列取走已完成握手的连接，交给 Poller |
| **Poller** | 少量（默认按 CPU 数 ×2，上限 2） | 用多路复用监听 IO 事件，把"可读"的连接交给 Worker |
| **Worker** | `maxThreads` | **真正执行你的代码**（Filter → Servlet → Service） |

**关键理解**：真正的"业务并发上限"是 `maxThreads`；`Acceptor` / `Poller` 只负责搬运，不是瓶颈。

### 3.2 三个参数的关系 {#three-params}

| 参数 | 默认值 | 含义 | 满了会怎样 |
|---|---|---|---|
| `server.tomcat.max-connections` | 8192（NIO） | 容器**同时接纳**的连接总数（含空闲 keep-alive） | 拒绝新连接（关闭或排队） |
| `server.tomcat.accept-count` | 100 | **内核 accept 队列**长度（已握手、未被 Acceptor 取走） | 新连接**超时/被拒**（客户端感觉像"服务没起来"） |
| `server.tomcat.threads.max` | 200 | Worker 线程数 | 请求**排队等待线程**（响应变慢，但连接还在） |

**为什么 `max-connections`（8192）远大于 `max-threads`（200）是合理的**：一个 HTTP 连接建立后大部分时间是空闲的（keep-alive 等待下一个请求），它占用的是连接资源而不是线程。**用 `maxThreads` 去限制并发连接数是常见误解**——那会把"空闲长连接"误杀。

### 3.3 三种过载表现要分开 {#overload-symptoms}

| 表现 | 瓶颈位置 | 特征 |
|---|---|---|
| **响应变慢、服务端有日志** | Worker 线程不足 / 下游慢 | 请求已进应用；`maxThreads` 与下游耗时是排查方向 |
| **客户端 connect timeout、服务端无日志** | 内核 accept 队列满 | **请求从未进入应用**；要调 `accept-count` / `max-connections`，或先查为什么处理不过来 |
| **连接被立即重置** | 达到 `max-connections` | 容器主动拒绝 |

**排查次序**：先看**服务端有没有日志**。有日志 → 应用层问题；没日志 → 连接没进来，往容器/内核方向查。这一步能省掉大量无效排查。

## 四、请求从 TCP 到 DispatcherServlet {#request-path}

### 4.1 完整链路 {#full-path}

```text
① 内核：TCP 三次握手完成，连接进入 accept 队列
② Acceptor 取走连接 → Poller 注册 IO 事件
③ 数据到达 → Worker 线程被唤醒
④ Tomcat 解析 HTTP 报文 → 构造 HttpServletRequest / HttpServletResponse
⑤ 依次执行匹配的 Filter（容器层，由 Servlet 规范定义）
        · CharacterEncodingFilter（编码）
        · CorsFilter（跨域）
        · RequestContextFilter（请求上下文）
        · 你的 TraceId / 日志 MDC Filter
        · Spring Security 的 FilterChainProxy（本身也是一个 Filter）
⑥ ──▶ DispatcherServlet#service()  ←── 这里之后的内容见 Spring MVC 篇
```

**两个辨析点**：

- **Filter 的执行在 `DispatcherServlet` 之外**，所以它**看不到"要调用哪个 Controller 方法"**，也**拦不到未匹配的路径**（它其实拦得到——只要 URL 匹配了 Filter 的映射；但"是否命中 Handler 映射"它不知道）。这个区别在[拦截器 vs 过滤器](/java/spring/spring-mvc/)里有对照表。
- **异常传播方向相反**：Controller 里抛的异常由 `DispatcherServlet` 内部的 `HandlerExceptionResolver` 处理（`@ControllerAdvice` 在这里生效）；**Filter 里抛的异常已经出了 `DispatcherServlet`**，只能走容器错误页机制（见第六节）。

### 4.2 为什么 `Filter` 里 `@Autowired` 会失败 {#filter-autowired}

```java
@WebFilter(urlPatterns = "/*")                    // ✗ 由 Servlet 容器实例化，不是 Spring Bean
public class MyFilter implements Filter {
    @Autowired private OrderService orderService;  // 注入失败：这个对象的 new 不经过 Spring
}
```

**根因**：`@WebFilter` / `web.xml` / `ServletContext#addFilter` 三条路径都由**Servlet 容器**创建实例，而容器的创建时机**早于 Spring 容器完成 Bean 注册**——即使能拿到 `ApplicationContext`，那时 `OrderService` 也可能还没就绪。

**两种正确解法**：

| 解法 | 做法 | 适用 |
|---|---|---|
| **`FilterRegistrationBean`**（推荐） | 把 Filter 声明成 `@Bean`，用 `FilterRegistrationBean` 注册到容器 | 自定义 Filter；能正常 `@Autowired`、能设 `order`、能配 URL 模式 |
| **`DelegatingFilterProxy`** | 注册一个代理 Filter，把调用转发给 Spring 容器里的同名 Bean | 框架内部常用（Spring Security 的 `springSecurityFilterChain` 就是这么挂上去的） |

```java
@Bean
public FilterRegistrationBean<TraceIdFilter> traceIdFilter() {
    var reg = new FilterRegistrationBean<>(new TraceIdFilter());   // TraceIdFilter 由 Spring 创建
    reg.addUrlPatterns("/*");
    reg.setOrder(Ordered.HIGHEST_PRECEDENCE);                      // 越早越好：后面所有日志都能带上 TraceId
    return reg;
}
```

### 4.3 `ServletContextInitializer`：Boot 里的"web.xml 替代品" {#servlet-context-initializer}

Boot 不用 `web.xml`，那 Servlet / Filter / Listener 怎么注册？答案是 **`ServletContextInitializer`**——一组"在容器启动前回调、由 Spring 调用"的接口：

| 接口 | 注册什么 | 常用度 |
|---|---|---|
| `ServletRegistrationBean` | Servlet | 中（接第三方 Servlet 时用） |
| `FilterRegistrationBean` | Filter | **高** |
| `ServletListenerRegistrationBean` | Listener | 低 |
| `DispatcherServletRegistrationBean` | `DispatcherServlet` | 框架内部使用 |

**这条设计的意义**：把"注册 Web 组件"这个动作**从配置文件搬到 Java 代码**，于是注册时机、顺序、条件装配全部可以用 Spring 的手段控制（可以 `@ConditionalOnProperty` 决定某个 Filter 装不装）。

## 五、静态资源与欢迎页 {#static-resources}

| 规则 | 内容 |
|---|---|
| **默认位置** | `classpath:/META-INF/resources/`、`classpath:/resources/`、`classpath:/static/`、`classpath:/public/`（按顺序） |
| **默认映射** | `/**` |
| **处理器** | 由 `ResourceHttpRequestHandler` 处理（不是 Controller） |
| **欢迎页** | 上述位置里的 `index.html`，或模板引擎渲染的 `index` |
| **自定义位置** | `spring.web.resources.static-locations`（**注意是 `spring.web.resources`，不是 2.x 时代的 `spring.resources`**） |

**缓存配置**（前端静态资源变慢/不更新的常见争议点）：

```yaml
spring:
  web:
    resources:
      cache:
        cachecontrol:
          max-age: 365d              # 强缓存时长
          cache-public: true
        period: 0                    # 关闭 ETag/Last-Modified 之外的额外计算
```

**实践建议**：静态资源用**内容哈希文件名**（如 `app.3f2a1c.js`）+ 长缓存，比依赖 `Cache-Control: no-cache` 更有效——这也与前端的构建产物策略一致。

> **代理层提醒**：如果前面有 Nginx 等反向代理，"静态资源由谁返回"要明确。Boot 默认会自己处理，但生产环境通常交给代理/对象存储，此时应关闭或忽略应用内的静态资源映射，避免两套缓存策略打架。

## 六、错误处理：两条互不相通的路径 {#error-handling}

### 6.1 `/error` 转发机制 {#error-forward}

```text
路径 A（进入 DispatcherServlet 之后）
  Controller / Service 抛异常
     └─▶ DispatcherServlet 的 HandlerExceptionResolver
           ├─ @ExceptionHandler / @ControllerAdvice 命中 → 正常返回
           └─ 未命中 → 抛出 → 最终也转发到 /error

路径 B（在 DispatcherServlet 之外）
  Filter 抛异常 / 404 未匹配 / Servlet 层异常 / 响应未提交时的容器错误
     └─▶ Servlet 容器的错误页机制（ErrorPageRegistrar）
           └─▶ forward 到 /error（不经过 DispatcherServlet）
```

`/error` 由 `ErrorMvcAutoConfiguration` 注册的 `BasicErrorController` 处理，它会根据 `Accept` 头返回 **HTML 错误页**或 **JSON**：

```json
{
  "timestamp": "2026-09-15T10:00:00.000+00:00",
  "status": 500,
  "error": "Internal Server Error",
  "path": "/api/orders"
}
```

**字段的开关**（默认都很保守）：

| 属性 | 默认 | 说明 |
|---|---|---|
| `server.error.include-message` | `never` | 是否带上 `message` |
| `server.error.include-stacktrace` | `never` | 是否带上异常栈 |
| `server.error.include-binding-errors` | `never` | 是否带上校验错误明细 |
| `server.error.include-exception` | `never` | 是否带上异常类名 |

**为什么默认全 `never`**：这些字段会泄露内部实现（类名、SQL、文件路径），而错误响应恰好是**最容易被外部触发**的接口（随便构造一个非法请求就能看到）。**生产环境保持默认，或最多开 `message`。**

### 6.2 统一错误响应的正确做法 {#error-response}

| 目标 | 做法 |
|---|---|
| 业务异常统一成 `Result` 结构 | `@RestControllerAdvice` + `@ExceptionHandler`（覆盖路径 A） |
| **容器级错误也要统一格式** | 实现 `ErrorAttributes`（改写 `/error` 的输出结构）或自定义 `ErrorController` |
| 保证前端永远拿到 JSON | 让 `/error` 返回 JSON（或用 `ErrorAttributes` 定制），并确保请求的 `Accept` 头明确 |

**一个容易被忽略的坑**：前后端分离的应用里，浏览器发起的请求 `Accept` 头包含 `text/html`，于是 `/error` 返回**HTML 错误页**，前端解析 JSON 直接报错。解决办法是让前端请求显式带 `Accept: application/json`，或在 `ErrorAttributes`/自定义 `ErrorController` 里统一输出 JSON。

### 6.3 一个原则：错误响应不要暴露内部结构 {#no-stacktrace}

- 展示给用户的：**错误码 + 可读提示 + 追踪 ID**（TraceId 用于对日志）。
- 留在日志里的：异常栈、SQL、上游响应。

**追踪 ID 是这套设计的连接点**：响应里给 `traceId`，日志里带同一个 `traceId`，于是"用户报错 → 查日志"变成一次精确检索，而不是靠时间戳猜。这也是为什么 **TraceId 的注入要放在 Filter 的最前面**（见 4.2 的 `setOrder`）。

## 七、优雅停机 {#graceful-shutdown}

```yaml
server:
  shutdown: graceful                            # 默认 immediate
spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s             # 单个阶段的最长等待
```

| 阶段 | 行为 |
|---|---|
| **immediate**（默认） | 收到停机信号立即停止接受新连接，**在途请求被中断** |
| **graceful** | ① 停止接受新请求（并置 readiness 为 `REFUSING_TRAFFIC`）② 等待在途请求处理完 ③ 超时后强制关闭 ④ 依次销毁 Spring 容器 |

**它只解决了"HTTP 请求"这一段**。完整的优雅停机还需要：

| 组件 | 需要自己做的事 |
|---|---|
| **线程池任务** | `shutdown()` + 等待队列跑完（`awaitTermination`），别用 `shutdownNow()` |
| **消息消费者** | 先停止拉取新消息，等当前消息处理完再关闭（避免"消息已被取走但没处理完就退出"） |
| **定时任务** | 关闭调度器并等待正在执行的任务结束 |
| **注册中心** | 先**注销实例**再关流量，否则调用方还会继续发现你 |

**K8s 下的配合**（三个时间量的关系不能搞反）：

```yaml
terminationGracePeriodSeconds: 45       # ① 必须 > 停机总超时，否则被 SIGKILL
lifecycle:
  preStop:
    exec: { command: ["shutdown", "-s", "TERM"] }   # ② 给 endpoint 摘除留时间
```

```yaml
spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s     # ③ 应用侧最长等待
```

**顺序要求**：`terminationGracePeriodSeconds` > `preStop` 等待 + 应用停机超时。**判据**：K8s 摘除 endpoint 是异步的，如果应用一收到 SIGTERM 就立刻关闭，摘除还没生效，请求仍会被打到正在退出的实例上——这正是 `preStop` 里 `sleep` 的用途。

## 八、HTTPS、压缩与代理头 {#https-proxy}

### 8.1 SSL bundle：3.x 起的推荐方式 {#ssl-bundle}

```yaml
spring:
  ssl:
    bundle:
      pem:
        web:
          keystore:
            certificate: file:/etc/ssl/server.crt
            private-key: file:/etc/ssl/server.key
server:
  ssl:
    bundle: web                     # 引用上面的 bundle
```

**相比直接配 `server.ssl.key-store` 的好处**：① 支持 PEM 与 JKS 两种格式统一配置；② 可以配置证书**热重载**（`reload-on-update: true`，证书更新不必重启）；③ 同一份 bundle 可被 Web 服务与出站 HTTP 客户端（`RestClient` 等）复用。

### 8.2 压缩与 HTTP/2 {#compression-http2}

| 配置 | 说明 |
|---|---|
| `server.compression.enabled` | **默认关闭**（`false`）。若前面有 Nginx，通常在代理层压缩，应用侧保持关闭更简单 |
| `server.compression.mime-types` | 默认只压 `text/html`、`text/xml`、`text/plain`、`text/css`、`text/javascript`、`application/javascript`、`application/json` 等 |
| `server.compression.min-response-size` | 默认 2KB。**小响应压缩反而更慢** |
| `server.http2.enabled` | Tomcat 下需搭配 TLS（或显式 h2c 配置） |

**一个务实的判断**：**HTTP/2 真正的收益在"浏览器 ↔ 边缘节点/代理"这一段**（多路复用、头部压缩）。如果应用前面站着 Nginx，那么"代理 ↔ 应用"这一段用 HTTP/2 的收益很小，配置与排障成本却不低。**先确认收益落在哪一段，再决定要不要开。**

### 8.3 在反向代理后面拿到真实客户端信息 {#forward-headers}

Nginx 转发后，`request.getRemoteAddr()` 拿到的是**代理的 IP**，`request.getScheme()` 是 `http` 而不是 `https`——这会直接影响：日志里的客户端 IP、`redirect` 生成的 URL 协议、基于 IP 的限流与风控。

```yaml
server:
  forward-headers-strategy: framework     # 由 Spring 处理 X-Forwarded-* 头
```

| 取值 | 含义 |
|---|---|
| `none` | 不处理（默认） |
| `native` | 交给容器自身实现（如 Tomcat 的 RemoteIpValve） |
| **`framework`** | 由 Spring 的 `ForwardedHeaderFilter` 处理（**与容器无关，推荐**） |

**安全前提**：这些头**可被客户端伪造**。所以只有在**确信请求一定经过了可信代理**时才启用（通过"应用端口只对代理开放"来保证），否则攻击者可以伪造 `X-Forwarded-For` 绕过 IP 限制。

## 九、虚拟线程：收益与新的瓶颈 {#virtual-threads}

```yaml
spring:
  threads:
    virtual:
      enabled: true        # 一步把 Web 请求处理、@Async、@Scheduled 切到虚拟线程
```

开启后，Tomcat 的请求处理执行器被换成"每个任务一个虚拟线程"，因此 `maxThreads` 不再是并发的实际上限——**阻塞型代码（JDBC、HTTP 调用、文件 IO）能在不改造代码的前提下获得高得多的并发**。

**但收益有边界，且会引入新的瓶颈：**

| 事项 | 说明 |
|---|---|
| **CPU 密集型无收益** | 虚拟线程解决的是"线程在等 IO"的问题，不是"算得快" |
| **Pinning（载体线程被钉住）** | 虚拟线程在 `synchronized` 块内发生阻塞时无法卸载，会占住载体线程。JDK 24 起已大幅改进；旧版本下可用 `-Djdk.tracePinnedThreads=full` 诊断 |
| **数据库连接池成为新瓶颈** | 并发请求数可能从"几百"涨到"上万"，而连接池默认只有 10 个连接 → 大量请求**卡在等连接**，超时后批量失败。这是实践中**最常见**的翻车点 |
| **需要重新评估的配置** | 连接池 `maximumPoolSize`、下游限流阈值、超时时间（快速失败优于长时间排队） |

**连接池与虚拟线程的矛盾怎么理解**：连接数是**数据库侧的真实约束**（昂贵、有限），而虚拟线程提升的是**应用侧等待的能力**。两者不匹配时，多出来的并发只会变成"更多请求一起等"。**所以开启虚拟线程必须同步复核连接池容量与超时**，否则会把慢查询变成连接池耗尽。

> **与响应式的关系**：虚拟线程让"同步阻塞写法 + 高并发"成立，因此在常规请求/响应服务里，它可以替代响应式的主要理由。但在**流式与背压**（如 SSE 推送、大结果集流式处理）场景，响应式仍有不可替代的优势。

## 十、版本现状 {#version}

| 事实 | 说明 |
|---|---|
| **Spring Boot 4.0** | 2025-11-20 发布（Spring Framework 7.0），基线升到 **Jakarta EE 11 / Servlet 6.1**（对应内嵌 **Tomcat 11**） |
| **Spring Boot 3.5 已 EOL** | OSS 支持 2026-06-30 结束（最后补丁 3.5.16）；4.0.x 支持到 2026-12-31 |
| **属性前缀** | 静态资源相关是 `spring.web.resources.*`（2.x 时代是 `spring.resources.*`），迁移时留意 |
| **HTTP/2 与 HTTP/3** | HTTP/3（QUIC）在应用侧通常不由内嵌容器承担，而是由边缘/CDN 终止——见[HTTP 演进](/fundamentals/network/http) |

## 十一、使用场景与面试问答 {#interview}

**Q1：Spring Boot 的内嵌容器是什么？和传统部署有什么区别？**

内嵌容器意味着**应用自己创建并拥有 Web 服务器**：`ServletWebServerApplicationContext` 在 `onRefresh()` 阶段创建 `WebServer` 对象，在 `finishRefresh()` 阶段启动监听。区别不只是"不用装 Tomcat"，而是**生命周期方向反了**——传统是"容器先存在、应用装进去"，内嵌是"Spring 容器先就绪、再启动容器"。由此得到两条推论：Bean 全部初始化完成才开始接流量；容器行为从 `server.xml` 改成属性 + `*Customizer`。

**Q2：`maxConnections`、`acceptCount`、`maxThreads` 分别管什么？**

- `maxConnections`（默认 8192）：容器**接纳**的连接数上限，超出拒绝新连接；
- `acceptCount`（默认 100）：**内核 accept 队列**长度，这里是"已握手但还没被应用取走"的连接，满了会让客户端 **connect timeout**；
- `maxThreads`（默认 200）：**真正执行业务代码的工作线程**数，满了请求排队等线程。

**关键**：`maxConnections` 远大于 `maxThreads` 是正常的，因为 keep-alive 空闲连接不占线程。**用 `maxThreads` 去限制并发连接数是常见误解。**

**Q3：压测时 QPS 上不去，怎么判断卡在哪一层？**

**先看服务端有没有日志**：有日志说明请求进了应用，查 Worker 线程数与下游耗时；**没日志说明连接根本没进来**，查 `acceptCount` / `maxConnections`，或者查为什么应用处理不过来导致队列堆积。这个"有没有日志"的分岔能立刻把排查范围减半。

**Q4：为什么 `Filter` 里不能直接 `@Autowired`？怎么解决？**

因为 `Filter` 由 **Servlet 容器**创建（`@WebFilter` / `web.xml` / `addFilter`），实例化时机**早于 Spring 容器完成 Bean 注册**。两种解法：用 `FilterRegistrationBean` 把 Filter 声明成 `@Bean` 交给 Spring 创建（推荐，还能设 `order` 与 URL 模式）；或用 `DelegatingFilterProxy` 把调用转发给容器里的同名 Bean（Spring Security 采用这种方式）。

**Q5：`@ControllerAdvice` 能捕获所有异常吗？**

不能。它由 `DispatcherServlet` 内部的 `HandlerExceptionResolver` 调用，所以只能处理**进入 `DispatcherServlet` 之后**的异常。**Filter 抛的异常、404 未匹配、Servlet 容器层的错误**都已经在 `DispatcherServlet` 之外，会走 Servlet 容器的错误页机制 → **forward 到 `/error`**（由 `BasicErrorController` 处理）。要做到"全链路统一错误格式"，必须同时处理这两条路径（如实现 `ErrorAttributes`）。

**Q6：`server.shutdown=graceful` 就够了吗？**

不够。它只覆盖 **HTTP 请求**这一段（停止接收新请求 → 等在途请求完成 → 超时强制关闭），并且在停机开始时把 readiness 置为 `REFUSING_TRAFFIC`。完整的优雅停机还要处理：线程池任务收尾、**消息消费者先停拉取再等处理完**、定时任务等待、**注册中心先注销**。另外 K8s 下要保证 `terminationGracePeriodSeconds` **大于** 应用停机超时，并用 `preStop` 留出 endpoint 摘除的时间。

**Q7：开启虚拟线程后要注意什么？**

三点：① **收益只在 IO 密集场景**；② `synchronized` 阻塞可能钉住载体线程（Pinning），JDK 24 起已改进，旧版本可用 `-Djdk.tracePinnedThreads=full` 诊断；③ **连接池会成为新瓶颈**——并发请求数从"几百"涨到"上万"，而连接池仍只有十来个连接，结果是大量请求卡在等连接然后批量超时。所以开启后必须复核 `maximumPoolSize` 与超时设置。

**Q8：反向代理后面怎么拿到真实客户端 IP？**

配 `server.forward-headers-strategy=framework`，由 Spring 的 `ForwardedHeaderFilter` 处理 `X-Forwarded-For` / `X-Forwarded-Proto` 等头。**前提是必须确信流量经过了可信代理**（例如应用端口只对代理开放），因为这些头是**可伪造**的，暴露公网时会被用来绕过基于 IP 的限制。

---

> 相关篇目：[Spring MVC 执行流程](/java/spring/spring-mvc/)（进入 `DispatcherServlet` 之后）、[Actuator 与生产可观测](/java/spring/spring-boot/actuator)（readiness 探针与优雅停机的配合）、[配置体系](/java/spring/spring-boot/configuration)（`server.*` 属性的来源与覆盖）、[IO 模型与多路复用](/fundamentals/os/io-model)（acceptor / poller 背后的多路复用机制）。
