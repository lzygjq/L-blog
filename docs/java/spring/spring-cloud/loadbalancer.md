---
order: 2
date: 2026-09-14
title: 负载均衡与远程调用
desc: 客户端负载均衡的完整流程与七种策略、自定义策略的作用域陷阱，以及 OpenFeign 的动态代理、超时重试与日志级别
---

# 负载均衡与远程调用

## 一、有了地址簿，还要解决"挑哪个" {#intro}

注册中心告诉调用方「库存服务有 3 个实例，地址分别是这些」。接下来每次调用都要从 3 个里挑一个——挑得好，流量均匀、机器不浪费；挑得差，一台被打满、另外两台闲着。这就是负载均衡。

**负载均衡有两个实现位置**，分清楚是理解后面所有内容的前提：

| | 客户端负载均衡 | 服务端负载均衡 |
|---|---|---|
| 决策在谁手里 | **调用方**（自己拿注册表、自己算该发给谁） | **中间层**（Nginx / LVS / K8s Service） |
| 调用方需要什么 | 需要注册表（所以要和注册中心打交道） | 只需要一个固定地址（如网关或 VIP） |
| 延迟 | 少一跳 | 多一跳（但可以忽略） |
| 代表 | Ribbon、Spring Cloud LoadBalancer | Nginx、K8s Service、F5 |
| 典型缺点 | 每种语言都要自己实现一套客户端 | 中间层成为需要高可用保障的单点 |

**注意这两者不是替代关系**：典型架构里，外部流量走**服务端**负载均衡（Nginx 或 K8s Ingress），服务之间的内部调用走**客户端**负载均衡。面试时说清"我用在哪一层"比只说组件名有价值得多。

## 二、Ribbon 的工作流程 {#ribbon-flow}

Ribbon 是客户端负载均衡的经典实现（**已在 Spring Cloud 2020.0.0 移除**，见下文第五节，但流程与策略仍是最常考的内容）：

```text
消费者发起调用  http://inventory-service/stock/1001
        │                     ▲
        │                     └── ① 这里写的是【服务名】，不是 IP
        ▼
② Ribbon 拦截：识别出这是服务名
        │
        ▼
③ 从【本地缓存的注册表】中取出 inventory-service 的实例列表
        │  （缓存来自注册中心，见 注册中心 篇）
        ▼
④ 按【负载均衡策略】选出一个实例  → 默认 ZoneAvoidanceRule
        │
        ▼
⑤ 把服务名替换成真实的 IP:Port
        │
        ▼
⑥ 发起 HTTP 请求
```

**第 ① 步是整个机制的入口**：`@LoadBalanced` 注解会给 `RestTemplate` 装一个拦截器，把「服务名」解析成「真实地址」。这也是为什么直接 `curl http://inventory-service/...` 会失败——这个名字只有在应用内部、被拦截器处理过才有意义。

## 三、七种负载均衡策略 {#ribbon-rules}

| 策略类 | 选择方式 | 适用场景 |
|---|---|---|
| `RoundRobinRule` | 简单轮询，按顺序一个接一个 | 各实例性能相同（**默认之外最常用**） |
| `RandomRule` | 随机选 | 实例性能差不多，想避免"总是同一台先被打" |
| `RetryRule` | 先按轮询选，失败则在超时时间内**重试选下一个** | 想用策略自带重试（现在更推荐在调用层做重试） |
| `WeightedResponseTimeRule` | 按**平均响应时间**加权，响应越快权重越高 | 机器配置不均（如新旧机器混部），让快的多分担 |
| `BestAvailableRule` | 过滤掉断路器打开的实例，选**并发请求数最低**的 | 实例负载差异明显时 |
| `AvailabilityFilteringRule` | 先过滤掉**连接失败过多次**和**并发过高**的实例，再轮询 | 想自动摘除"半死不活"的实例 |
| `ZoneAvoidanceRule` | **默认策略**：先按**区域（机房 / 可用区）**过滤，再对区内实例轮询 | 多机房部署，优先同机房调用以降低延迟 |

两个容易被话术稿漏掉的点：

- **`AvailabilityFilteringRule`**：它才是"自动摘除故障实例"的那一个，很多资料只列六种策略就把它漏了。
- **`ZoneAvoidanceRule` 的"按区域过滤"是有条件的**：它只在能拿到区域信息时才有区分效果。单机房部署下，它的实际行为退化成**区内轮询**，跟 `RoundRobinRule` 差不多——所以「我们用的是 ZoneAvoidance」这句话，如果系统只有一个机房，说服力有限。

## 四、自定义策略，以及一个必踩的坑 {#custom-rule}

两种做法：

```java
// 做法一：全局生效——放在主应用上下文里，所有服务都用它
@Configuration
public class GlobalLbConfig {
    @Bean
    public IRule ribbonRule() {
        return new RandomRule();
    }
}
```

```yaml
# 做法二：只为某个服务指定（局部生效，优先级更高）
inventory-service:
  ribbon:
    NFLoadBalancerRuleClassName: com.netflix.loadbalancer.RandomRule
```

**必踩的坑**：做法一的 Bean **一旦被主 `@ComponentScan` 扫到，就是对所有服务全局生效**。想让它只作用于某个服务，必须把配置类放到扫描路径**之外**，再用 `@RibbonClient(name = "inventory-service", configuration = InventoryLbConfig.class)` 显式绑定。

```java
// 正确姿势：配置类不能和启动类同包（否则被扫到 → 变成全局）
@RibbonClient(name = "inventory-service", configuration = InventoryLbConfig.class)
public class OrderApplication { }
```

**为什么会踩**：直觉上会以为「`@RibbonClient` 指定了就是局部的」，但 Spring 的父子上下文机制决定了——**只要 Bean 进了主上下文，它就是全局的**。这个坑其实是「Spring 容器作用域」知识的一个具体表现，面试里顺着讲能显出深度。

## 五、Ribbon 没了，现在用什么 {#loadbalancer}

**Ribbon 与 Hystrix、Zuul 一起在 Spring Cloud 2020.0.0 中被移除**，官方替代是 **Spring Cloud LoadBalancer**。它换了一套编程模型：

| | Ribbon | Spring Cloud LoadBalancer |
|---|---|---|
| 编程模型 | 阻塞式、线程绑定 | **响应式**（Reactor），不绑线程 |
| 策略接口 | `IRule` | `ReactorLoadBalancer` |
| 默认策略 | `ZoneAvoidanceRule` | **`RoundRobinLoadBalancer`**（轮询） |
| 自定义 | 定义 `IRule` Bean | 定义 `ReactorLoadBalancer<T>` Bean |
| 实例列表来源 | `ServerList` 系列接口 | `ServiceInstanceListSupplier`（**带缓存**） |

```java
// 换默认策略为随机
@Configuration
public class LbConfig {
    @Bean
    public ReactorLoadBalancer<ServiceInstance> randomLoadBalancer(
            Environment env, LoadBalancerClientFactory factory) {
        String name = env.getProperty(LoadBalancerClientFactory.PROPERTY_NAME);
        return new RandomLoadBalancer(
                factory.getLazyProvider(name, ServiceInstanceListSupplier.class), name);
    }
}
```

**一个容易答错的对比**：现代 LoadBalancer 默认是**轮询**，不再是 ZoneAvoidance。被问「默认策略是什么」时，先确认对方问的是 Ribbon 还是 LoadBalancer。

另外它默认给实例列表加了**缓存**（默认基于 Caffeine，`spring.cloud.loadbalancer.cache.ttl` 默认 35 秒）——这是为了别每次调用都去注册中心拉一次列表。代价与 Eureka 的缓存一样：**上下线有延迟**。

## 六、OpenFeign：让远程调用长得像本地方法 {#openfeign}

### 6.1 它解决什么 {#feign-why}

用 `RestTemplate` 调一次下游要写这么多：

```java
String url = "http://inventory-service/stock/" + skuId;
StockDTO dto = restTemplate.getForObject(url, StockDTO.class);
```

每个下游、每个接口都要重复这套模板代码。OpenFeign 的做法是**只写接口**，实现由框架生成：

```java
@FeignClient(name = "inventory-service", fallbackFactory = StockFallbackFactory.class)
public interface StockClient {

    @GetMapping("/stock/{skuId}")
    StockDTO getStock(@PathVariable("skuId") Long skuId);

    @PostMapping("/stock/deduct")
    Result<Void> deduct(@RequestBody DeductRequest request);
}

// 调用方：和调本地方法一模一样
StockDTO stock = stockClient.getStock(skuId);
```

### 6.2 底层是动态代理 {#feign-proxy}

```text
启动时：@EnableFeignClients 扫描所有 @FeignClient 接口
          └─▶ 为每个接口生成【JDK 动态代理】并注册成 Bean

调用时：stockClient.getStock(1001)
          └─▶ 代理拦截（MethodHandler）
                └─▶ 解析方法上的 @GetMapping 等注解 → 拼出请求模板
                      └─▶ 交给负载均衡器选实例（这就是它和 Ribbon / LoadBalancer 的连接点）
                            └─▶ 发 HTTP → 解码响应 → 返回对象
```

**理解了这条链，三个常见追问就都能答**：

1. **「Feign 和 Ribbon 什么关系？」**——Feign 负责「怎么拼请求」，Ribbon（现在是 LoadBalancer）负责「发给哪个实例」，两者是**上下层**关系，不是二选一。
2. **「为什么接口不用写实现类？」**——因为 `@FeignClient` 接口在启动时被扫描、生成了动态代理。
3. **「能不能在接口上写 `@RequestMapping` 类级别路径？」**——可以，最终路径 = 类级别前缀 + 方法级路径。

### 6.3 超时、重试、日志 {#feign-config}

```yaml
spring:
  cloud:
    openfeign:
      client:
        config:
          default:                      # default = 对所有客户端生效，也可写具体服务名
            connect-timeout: 2000       # 连接超时（毫秒）
            read-timeout: 5000          # 读取超时（毫秒）
            logger-level: basic
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| 连接超时 | 10 秒 | 建连阶段的超时 |
| 读取超时 | 60 秒 | **实际最常出问题的是这个**——下游慢一点就大批请求堆积 |
| 重试 | **不重试** | Feign 原生 `Retryer.NEVER_RETRY`；需要重试要显式配 `Retryer` |
| 日志级别 | `NONE` | 见下表 |

**日志级别必须两级都开**：

```java
@Bean
Logger.Level feignLoggerLevel() {
    return Logger.Level.FULL;
}
```

```yaml
logging:
  level:
    com.example.client.StockClient: debug   # ① 指定这个接口的日志级别为 debug
```

| 级别 | 记录内容 |
|---|---|
| `NONE` | 不记录（**默认**） |
| `BASIC` | 只记请求方法、URL、响应状态码、耗时 |
| `HEADERS` | BASIC + 请求 / 响应头 |
| `FULL` | HEADERS + **请求体和响应体**（排障用，生产别开——会打日志量爆炸，还可能泄露敏感字段） |

**只配 `Logger.Level` 不开 `logging.level`，是一点日志都看不到的**——这是 Feign 最常见的"配了没生效"。

### 6.4 传递上下文：RequestInterceptor {#feign-interceptor}

微服务里几乎所有请求都要带用户身份或链路标识，不能在每个方法上加参数：

```java
@Bean
public RequestInterceptor authInterceptor() {
    return template -> {
        // 从当前请求上下文取出 token / traceId，透传给下游
        String token = RequestContextHolder.getRequestAttributes() != null
                ? ((ServletRequestAttributes) RequestContextHolder.getRequestAttributes())
                    .getRequest().getHeader("Authorization")
                : null;
        if (token != null) {
            template.header("Authorization", token);
        }
    };
}
```

**注意 `RequestContextHolder` 的坑**：它基于 `ThreadLocal`，在**异步线程池里直接调用会拿到 null**（请求上下文没有传递过去）。所以「Feign 在异步线程里调用时 token 丢了」是必踩问题，解法是显式传递上下文或改用可继承的上下文容器。

## 七、常见坑 {#pitfalls}

| 坑 | 现象 | 原因 |
|---|---|---|
| **读取超时没配** | 某下游一慢，上游线程池被占满 | 默认 60 秒太长；必须按下游实际 RT 收紧 |
| **重试 + 非幂等接口** | 下游收到两条相同请求 | Feign 重试与业务重试叠加；**只对幂等接口开重试**（见 [接口幂等](/java/spring/spring-cloud/idempotency)） |
| **日志级别配了没输出** | 看不到请求日志 | 只配了 `Logger.Level`，漏了 `logging.level.<Client>: debug` |
| **`@FeignClient` 接口写在被扫描的包里但忘了 `@EnableFeignClients`** | 注入失败 / 空指针 | 需要显式开启扫描，或指定 `basePackages` |
| **异步线程里 token 丢失** | 下游返回未登录 | `RequestContextHolder` 是 `ThreadLocal`，跨线程不传递 |
| **服务名写错** | 报 `No instances available` | 服务名要和注册中心里的一致；大小写敏感 |
| **负载均衡缓存没刷新** | 新扩容的实例半天不接流量 | `ServiceInstanceListSupplier` 默认缓存 35 秒 |

## 面试口径

- **客户端 vs 服务端负载均衡**：客户端自己拿注册表算（Ribbon / LoadBalancer），服务端由中间层算（Nginx / K8s Service）。**实际架构里两层都有**——外部走服务端，内部调用走客户端。
- **Ribbon 流程五步**：写服务名 → 拦截器识别 → 从**本地缓存**取实例列表 → 按策略选一个 → 替换成真实 IP:Port 发请求。
- **七种策略**：轮询、随机、重试、响应时间加权、最低并发（BestAvailable）、可用性过滤（AvailabilityFiltering）、**默认 ZoneAvoidance**。**别漏 AvailabilityFiltering**。
- **自定义策略的作用域陷阱**：`IRule` Bean 放进主上下文就是**全局**；要局部必须把配置类挪出扫描路径 + `@RibbonClient` 指定。根因是 Spring 的父子上下文。
- **Ribbon 已在 Spring Cloud 2020.0.0 移除**，替代是 **Spring Cloud LoadBalancer**：响应式模型、接口换 `ReactorLoadBalancer`、**默认策略变成轮询**、实例列表带 35 秒缓存。
- **Feign 与负载均衡的关系**：Feign 拼请求、负载均衡选实例，上下层配合，不是替代关系。
- **Feign 默认不重试、默认 60 秒读超时**：这两个默认值在线上都不合适，必须显式调小/策略化。
- **日志要两级配置**：`Logger.Level` + `logging.level.<Client>: debug`，生产用 `BASIC`，`FULL` 只在排障时开。
