---
order: 5
date: 2026-09-15
sidebar: Actuator 与可观测
title: Actuator 与生产可观测
desc: 端点全景与暴露策略、健康指示器与 liveness/readiness 的语义分界、Micrometer 指标与基数陷阱、自定义 Endpoint、启动耗时分析、安全加固、Spring Boot 4 的模块化与访问级别模型
---

# Actuator 与生产可观测

> 应用"能跑"和"能在生产里被运维"是两件事。前者靠业务代码，后者靠**可观测性**：出问题时，你能不能在不重启、不改代码、不登录机器翻日志的前提下，回答"它现在健康吗、慢在哪、刚才发生了什么"。
>
> Actuator 就是 Spring Boot 对这三个问题的默认答案。

## 一、问题场景 {#why-actuator}

一个微服务上线后，运维和研发最常问的四句话：

| 诉求 | 没有 Actuator 时的做法 | 代价 |
|---|---|---|
| **"这个实例能接流量吗？"** | 写一个 `/ping` 接口，永远返回 200 | 它无法反映真实状态：数据库连不上时它照样返回 200 |
| **"它为什么变慢了？"** | 登录机器 `jstack`、看日志 | 需要机器权限；容器环境常常没有 |
| **"把日志级别调成 DEBUG 看看"** | 改配置 → 重新打包 → 重新发版 | 一次排查要等一个发布周期 |
| **"这次发布的 JAR 里到底装了哪些依赖？"** | 翻 CI 记录、问构建的人 | 无法在运行期确认 |

**Actuator 的定位**：把「应用自身状态」变成一组**标准化的 HTTP 端点**（也支持 JMX）。它不产生业务价值，但它是"生产可用"的门槛——反过来，**暴露了不该暴露的端点，它会变成最大的安全事故来源**，所以本篇安全那一节的分量与功能讲解等同。

## 二、端点全景 {#endpoints}

### 2.1 默认暴露：比想象中保守 {#exposure}

| 通道 | 默认行为 |
|---|---|
| **HTTP** | **只暴露 `health`**（`info` 在早期版本默认暴露，现在也需显式配置） |
| **JMX** | **全部暴露**（JMX 天然受限于访问控制） |

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus     # 默认只有 health
        # exclude: env,heapdump                     # 或反过来用 exclude 兜底
  endpoint:
    health:
      show-details: when_authorized                 # 细节只给已认证用户
```

**推荐做法**：**显式白名单**，绝不用 `include: "*"`。`*` 的诱惑在于"演示时很方便"，但它一次性把 `env`、`heapdump`、`configprops`、`beans` 全部对外——这些都是**能直接读出密钥与内部结构**的端点。

### 2.2 端点按用途分组 {#endpoint-table}

| 分组 | 端点 | 说明 |
|---|---|---|
| **健康** | `health` | 应用与依赖的健康状态；支持分组（见第三节） |
| | `info` | 自定义构建/版本信息（配合 `git.properties`、`build-info`） |
| **指标** | `metrics` | 单个指标查询（Micrometer 聚合结果的原始视图） |
| | `prometheus` | Prometheus 抓取格式（**推荐给监控系统用这个**，而不是让监控去解析 `metrics`） |
| **诊断** | `threaddump` | 线程栈（相当于运行期 `jstack`） |
| | `heapdump` | **堆转储文件**（含明文密钥，高危） |
| | `logfile` | 返回日志文件尾部（需配 `logging.file.name`） |
| | `startup` | 启动耗时分解（需配 `BufferingApplicationStartup`） |
| | `conditions` | 自动配置的条件评估报告（结构化版 `--debug`） |
| **运行时调整** | `loggers` | 查看与**动态修改**日志级别 |
| | `caches` | 缓存统计与清空 |
| **结构透视** | `beans` / `mappings` / `configprops` / `env` / `scheduledtasks` | 容器内 Bean、URL 映射、配置属性、环境属性源、定时任务 |
| **运维动作** | `shutdown` | **默认关闭**；开启需谨慎 |
| **扩展** | `sbom` | 软件物料清单（依赖清单） |
| | `auditevents` / `httpexchanges` / `sessions` | 审计事件、HTTP 交换记录、会话 |

**读这张表的方法**：把端点分成**"看状态"与"看内部结构"**两类。第一类是生产常规需要（health / info / metrics / prometheus / loggers / threaddump），第二类是"排障时临时开、排完就关"（env / configprops / beans / heapdump）。

## 三、健康检查 {#health}

### 3.1 健康指示器的组合机制 {#health-indicators}

`health` 端点的结果**不是某个检查的结果，而是若干 `HealthIndicator` 的汇总**：

```text
/actuator/health
  ├── db          ← DataSourceHealthIndicator（自动装配）
  ├── redis       ← RedisHealthIndicator（类路径有 Redis 客户端时自动装配）
  ├── diskSpace   ← DiskSpaceHealthIndicator
  └── downstream  ← 你自定义的（实现 HealthIndicator 接口并注册为 Bean）
        ↓
   汇总规则：任一 DOWN → 整体 DOWN；任一 UNKNOWN → 整体 UNKNOWN（DOWN 优先）
```

自定义指示器就是实现一个接口：

```java
@Component
public class PaymentChannelHealthIndicator implements HealthIndicator {

    private final PaymentClient client;

    @Override
    public Health health() {
        try {
            Latency l = client.ping();
            return Health.up()
                .withDetail("latencyMs", l.millis())
                .withDetail("channel", l.channel())
                .build();
        } catch (Exception e) {
            return Health.down()
                .withDetail("reason", e.getClass().getSimpleName())   // 不要塞异常栈，可能含敏感信息
                .build();
        }
    }
}
```

**两个设计要点**：

1. **健康检查本身要有超时与降级**。如果指示器里调用下游且不设超时，`health` 端点会跟着一起挂住——**"检查健康的接口自己变慢"是最难排查的一类故障**。
2. **`withDetail` 里不放敏感信息**：它会出现在 `/actuator/health` 的响应里（取决于 `show-details` 配置），异常消息常含连接串与主机名。

### 3.2 liveness 与 readiness：语义完全不同 {#probes}

这是健康检查里最值得讲清楚的一点，也是"用了 K8s 却配错探针"导致事故的根源：

| 探针 | 语义 | 失败后果 | 该放什么 |
|---|---|---|---|
| **liveness（存活）** | "**进程本身是否还能正常工作**" | K8s **重启容器** | 只放自身状态：死锁、不可恢复的内部错误 |
| **readiness（就绪）** | "**现在能不能接流量**" | K8s **把实例从 Service 摘除**（不重启） | 可以放**外部依赖**：数据库、下游服务、需要预热的数据 |

**核心判据：外部依赖挂掉，绝不能让 liveness 失败。** 否则会出现"数据库抖动 → 全部实例 liveness 失败 → 被批量重启 → 重启期间依赖更不可用 → 更严重的抖动"这种**级联放大**。数据库不可用的正确反应是"**别给我流量**"（readiness 失败），不是"重启我"。

Spring Boot 用 `ApplicationAvailability` 暴露两个状态：

| 状态 | 取值 | 何时变化 |
|---|---|---|
| `LivenessState` | `CORRECT` / `BROKEN` | 应用内部不可恢复异常时置 BROKEN |
| `ReadinessState` | `ACCEPTING_TRAFFIC` / `REFUSING_TRAFFIC` | 启动过程中为 REFUSING；启动完成事件后转 ACCEPTING；**优雅停机开始时转回 REFUSING** |

**启动过程天然是 not ready**：应用在 `ApplicationReadyEvent` 之前不会接流量——这就是"滚动发布时新 Pod 不会带着半初始化的状态接请求"的机制。**优雅停机时同理**，所以"先置 readiness 为 REFUSING、等流量排空、再关闭"这条链两端都靠它（见[内嵌容器与请求进入](/java/spring/spring-boot/web-server#graceful-shutdown)）。

```yaml
management:
  endpoint:
    health:
      probes:
        enabled: true          # 暴露 /actuator/health/liveness 与 /readiness
  health:
    livenessstate:
      enabled: true
    readinessstate:
      enabled: true
```

对应的 K8s 配置要点：

```yaml
livenessProbe:
  httpGet: { path: /actuator/health/liveness, port: 8080 }
  initialDelaySeconds: 20        # 要给足启动时间，否则启动慢会被反复重启
  periodSeconds: 10
  failureThreshold: 3
readinessProbe:
  httpGet: { path: /actuator/health/readiness, port: 8080 }
  periodSeconds: 5               # 比 liveness 更频繁，流量切换要快
```

> **版本提示**：**Spring Boot 4.0 起这两个探针默认启用**（3.x 需手动 `probes.enabled: true`）。如果你的基础设施有严格的 Actuator 访问控制，升级后要确认新暴露的两个路径是否在允许列表里；不需要的话可以显式关闭。

### 3.3 健康分组：把"哪一部分"健康讲清楚 {#health-groups}

整体 DOWN 只说明"有问题"，不说明"哪部分有问题"。健康分组让不同消费者看到不同视图：

```yaml
management:
  endpoint:
    health:
      group:
        db:                       # 只看数据库相关
          include: db
        cache:                    # 只看缓存相关
          include: redis
        readiness:
          include: readinessState,db,redis       # 就绪 = 自身就绪 + 关键依赖
          show-details: always
```

于是 `GET /actuator/health/db` 只返回数据库状态。**实践价值**：给 K8s 的 readiness 探针指一个**只含关键依赖**的组（例如"没数据库不能服务，但缓存不可用可以降级直连"），这比把所有依赖都压进一个布尔值更贴近真实可用性。

### 3.4 `show-details`：信息量与泄露面的权衡 {#show-details}

| 取值 | 行为 | 适用 |
|---|---|---|
| `never`（默认） | 只返回 `{"status":"UP"}` | 公网可达的端口 |
| `when_authorized` | 已认证用户可见细节 | **推荐**：既能被内部工具读，又不泄露给匿名访问者 |
| `always` | 任何人都能看细节 | 仅内网、仅调试 |

`env` 与 `configprops` 也有对应的 `show-values`（默认 `never`），逻辑相同。

## 四、指标：Micrometer {#metrics}

### 4.1 它是"门面"，不是"监控系统" {#micrometer}

```text
你的应用 ──▶ Micrometer（门面 API）──▶ 具体实现（Prometheus / OTLP / CloudWatch / ...
                     ↑
          MeterRegistry 是编程入口
```

**这个分层的意义**：业务代码只依赖 `MeterRegistry`，换监控系统时改依赖即可，不用改埋点代码。这也是"为什么不该在业务代码里直接调某个监控厂商 SDK"的原因。

```java
@Service
public class OrderService {

    private final Counter created;
    private final Timer settleLatency;

    public OrderService(MeterRegistry registry) {
        this.created = Counter.builder("order.created")
            .description("创建的订单数")
            .register(registry);
        this.settleLatency = Timer.builder("order.settle")
            .publishPercentileHistogram()                 // 需要分位统计时开启
            .register(registry);
    }

    public void settle(Order order) {
        created.increment();
        settleLatency.record(() -> doSettle(order));
    }
}
```

**开箱即用的指标值得先看一遍**：JVM（内存、GC、线程）、HTTP 服务端（`http.server.requests`，含 URI / 状态码 / 耗时）、连接池、缓存、Kafka 客户端等——**大部分"要监控什么"的问题，标准指标已经覆盖了**，自定义指标只用于业务语义（下单量、支付成功率）。

### 4.2 基数（cardinality）陷阱 {#cardinality}

这是把监控系统搞挂的头号原因：

| 反例 | 后果 |
|---|---|
| `tag("userId", userId)` | 每个用户一个时间序列 → 序列数爆炸 |
| `tag("uri", 原始URL)` | 含路径参数（`/orders/123`、`/orders/456`）→ 每条订单一个序列 |
| `tag("errorMsg", e.getMessage())` | 异常消息带变量 → 无界增长 |

**判断标准**：**标签的取值集合必须是"可枚举且有限"的**（状态码、接口名、集群名）。基数一高，监控后端的内存与查询成本会成倍上升。

**兜底手段**是 `MeterFilter`——不论业务代码怎么写，注册表层面强制收敛：

```java
@Bean
public MeterFilter denyHighCardinalityTags() {
    return MeterFilter.deny(id -> id.getTag("userId") != null);
}
```

**另一个实用手法**：把路径参数**模板化**。Spring Boot 的 `http.server.requests` 默认的 `uri` 标签用的是**映射模板**（`/orders/{id}`）而不是真实路径，这正是它敢给每个 URL 打标签的原因——自定义埋点时应当照做。

### 4.3 指标与探针的关系 {#metrics-vs-health}

| | health | metrics |
|---|---|---|
| 回答 | "现在能不能用"（布尔/枚举） | "过去一段时间表现如何"（数值序列） |
| 消费者 | 负载均衡、K8s 探针 | 监控告警、看板 |
| 典型用途 | 摘流、重启决策 | 容量规划、趋势、SLO |

**不要用 health 做告警**：它只有当前状态、没有历史，且每次访问都触发一次检查（有副作用）。**也不要让 K8s 探针指向 metrics**：那是数值聚合，不是布尔判断。

## 五、自定义端点 {#custom-endpoint}

当标准端点不够用时（例如"当前租户下的限流剩余额度"）：

```java
@Component
@Endpoint(id = "tenant-quota")                                // id 即 URL 片段：/actuator/tenant-quota
public class TenantQuotaEndpoint {

    private final QuotaService quotaService;

    @ReadOperation                                              // GET
    public QuotaView get(@Selector String tenantId) {           // @Selector → /tenant-quota/{tenantId}
        return QuotaView.of(quotaService.snapshot(tenantId));
    }

    @WriteOperation                                             // POST
    public void reset(@Selector String tenantId) {
        quotaService.reset(tenantId);
    }
}
```

四条实践要点：

| 要点 | 说明 |
|---|---|
| **`@Endpoint` 是通道无关的** | 同一个端点会同时暴露到 Web（若可用）与 JMX；要限定通道用 `@WebEndpoint` / `@JmxEndpoint` |
| **`@ReadOperation` 返回对象即可** | 序列化由 Actuator 处理；返回 `null` 表示 404，不是报错 |
| **写操作要做权限判断** | Actuator 端点默认不区分读写身份（除非接 Spring Security），`@WriteOperation` 等于可被调用的管理动作 |
| **输入要校验** | 端点参数来自 URL，和 Controller 一样需要防御非法输入 |

**要加 Web 专属行为**（如自定义响应头、更细的分页）时，再实现 `@EndpointWebExtension` 挂到同一个 `id` 上。**优先考虑 `@Endpoint`**，只有当 Web 与 JMX 需要不同语义时才用扩展。

## 六、启动耗时与运行时诊断 {#diagnostics}

### 6.1 `/actuator/startup`：把启动耗时拆到 Bean {#startup-endpoint}

```java
@SpringBootApplication
public class App {
    public static void main(String[] args) {
        new SpringApplicationBuilder(App.class)
            .applicationStartup(new BufferingApplicationStartup(2048))   // 抓取最近 2048 条启动步骤
            .run(args);
    }
}
```

之后访问 `/actuator/startup` 得到每个阶段与每个 Bean 的耗时明细，可以按耗时排序，**直接定位"启动慢"的元凶**。

**为什么它比看日志有用**：启动日志只给总时长，而这个端点给的是**结构化、可排序的分段**。实践中最常见的两个根因是：① 组件扫描范围过大（扫了无关的包）；② `@PostConstruct` / `InitializingBean` 里做了远程调用或大批量查询。

### 6.2 `/actuator/loggers`：不重启改日志级别 {#loggers}

```bash
# 查看某个 logger 的当前状态
curl -s localhost:8080/actuator/loggers/com.example.order

# 运行时改成 DEBUG
curl -X POST localhost:8080/actuator/loggers/com.example.order \
     -H 'Content-Type: application/json' -d '{"configuredLevel":"DEBUG"}'

# 改回（传 null 恢复继承）
curl -X POST localhost:8080/actuator/loggers/com.example.order \
     -H 'Content-Type: application/json' -d '{"configuredLevel":null}'
```

**一个必须理解的字段区别**：

| 字段 | 含义 |
|---|---|
| `configuredLevel` | **本 logger 显式配置**的级别；为 `null` 表示"没配、继承上级" |
| `effectiveLevel` | **实际生效**的级别（逐级向上查找得到的结果） |

**"改回默认"要传 `null` 而不是传上级的级别值**——传具体值等于给它钉了一个显式配置，之后配置文件再改就不生效了。这个坑很隐蔽：排查完忘了还原，几周后发现日志级别"改不动"。

### 6.3 `/actuator/conditions`：为什么这个自动配置没生效 {#conditions-endpoint}

与 `--debug` 输出同一份信息的结构化版本，包含 `positiveMatches` 与 **`negativeMatches`**。排"引了依赖却没装配"类问题时，**先看 `negativeMatches`**——它会写明被哪个条件否掉的。

## 七、安全加固 {#security}

**Actuator 是"把内部状态开放出去"的功能，默认配置只能算"演示友好"，不是"生产就绪"。**

| 措施 | 做法 |
|---|---|
| **最小暴露** | 白名单只留 `health,info,prometheus`（+ 按需 `metrics`、`loggers`） |
| **独立管理端口** | `management.server.port=9090`，并把该端口只绑内网 IP / 只对运维网段开放 |
| **统一鉴权** | 用 Spring Security 保护 `/actuator/**`；用 `EndpointRequest.to(...)` 而不是硬编码路径（端点基路径变了策略依然有效） |
| **区分读写** | 只读身份可看 `health/metrics`，写操作（`loggers`、自定义 `@WriteOperation`）要求更高角色 |
| **默认可读而非全开** | Spring Boot 4 的访问级别模型默认是 `read-only`（见下节），写操作需显式放开 |
| **高危端点绝不暴露** | `heapdump`（堆快照含明文密钥）、`env`、`configprops`、`beans`、`shutdown` |
| **细节按需** | `show-details: when_authorized`、`show-values: never` |

```java
// Spring Security 中按端点而非路径授权（推荐）
http.authorizeHttpRequests(auth -> auth
    .requestMatchers(EndpointRequest.to("health", "info")).permitAll()
    .requestMatchers(EndpointRequest.toAnyEndpoint()).hasRole("OPS")
    .anyRequest().authenticated());
```

**一条容易被忽略的推论**：**不要依赖"脱敏"来防泄露。** `env` 与 `configprops` 会把 `password` 一类值显示成 `******`，但 `heapdump` 拿到的是**内存快照**——脱敏是在渲染层做的，堆里的原始字符串还在。**唯一可靠的做法是不暴露这些端点。**

## 八、版本现状：Spring Boot 4 的模块化与访问级别模型 {#boot4}

| 变化 | 说明 | 影响 |
|---|---|---|
| **Actuator 被拆成多个模块** | 原来集中在 `spring-boot-actuator-autoconfigure`，4.0 起拆细（健康相关单独成 `spring-boot-health`） | 依赖坐标与**包名**都变了 |
| **包名迁移** | 见下表 | **升级时最容易踩的一处**（编译期就能发现，属于良性错误） |
| **访问级别取代 `enabled`** | 4.0 起用 `management.endpoints.access.default`（`none` / `read-only` / `unrestricted`）+ 每端点 `access` 取代 `management.endpoint.<id>.enabled`（后者在 3.4 已弃用） | **默认 `read-only`**：自定义端点里的 `@WriteOperation` / `@DeleteOperation` 会**静默变成只读**并返回 405，必须显式授予 `unrestricted` |
| **liveness / readiness 默认启用** | 3.x 需手动开启 | 会多出两个可访问路径，需确认访问控制策略 |
| **新增原生镜像端点** | `native` 端点展示原生镜像构建信息 | 仅原生镜像场景 |

**包名迁移对照（已实测）**：

| 类型 | Spring Boot 3.x | Spring Boot 4.x |
|---|---|---|
| `HealthIndicator` / `Health` / `Status` | `org.springframework.boot.actuate.health` | `org.springframework.boot.health.contributor` |
| `HealthEndpoint` | `org.springframework.boot.actuate.health` | `org.springframework.boot.health.actuate.endpoint` |
| 端点安全适配 `EndpointRequest` | `...actuate.autoconfigure.security.servlet` | `...security.autoconfigure.actuate.web.servlet` |
| `MeterRegistryCustomizer` | `...actuate.autoconfigure.metrics` | `...micrometer.metrics.autoconfigure` |

> **一个真实的安全教训值得记住**：Spring Boot 4.0.0–4.0.5 存在一处 **Actuator 授权绕过**缺陷——当类路径里有 `spring-boot-actuator-autoconfigure` 但**缺少** `spring-boot-health` 模块、且应用未自定义 `SecurityFilterChain`（依赖默认配置）时，**默认安全过滤链不会生成 Actuator 路径的授权规则**，导致 `/actuator/env`、`/actuator/heapdump` 等端点可被**匿名访问**；已在 **4.0.6** 修复。
>
> 它的根因正是本节讲的模块化：**"默认安全"依赖了"某个模块一定在类路径上"这个隐含假设**。两条推论：① 及时跟进补丁版本；② **关键路径上不要依赖框架的默认安全配置**，显式声明自己的 `SecurityFilterChain`——这也符合"安全责任要落在自己代码里"的一般原则。

## 九、常见坑 {#pitfalls}

| 坑 | 症状 | 修法 |
|---|---|---|
| `include: "*"` | 密钥、堆转储对外可读 | 显式白名单 |
| 把外部依赖放进 liveness | 依赖抖动引发**批量重启** | 依赖只进 readiness |
| 健康指示器无超时 | `health` 端点被拖住（"检查健康的接口自己挂了"） | 设超时 + 降级 |
| 探针 `initialDelaySeconds` 太短 | 启动慢的实例被反复重启 | 按实际启动时间给足余量 |
| 用 `metrics` 端点做监控抓取 | 解析麻烦、指标不完整 | 用 `prometheus` 端点 |
| 指标 tag 打上用户 ID / 原始 URL | 时间序列爆炸、监控后端被拖垮 | 模板化 + `MeterFilter` 兜底 |
| 改日志级别后忘了还原 | 传了具体值而非 `null`，配置文件失效 | "还原"要传 `null` |
| 4.0 自定义端点的写操作返回 405 | `access` 默认为 `read-only` | 授予 `unrestricted` |
| 依赖 Actuator 的"脱敏" | `heapdump` 绕过脱敏 | 不暴露这些端点 |

## 十、使用场景与面试问答 {#interview}

**Q1：Actuator 的默认暴露策略是什么？**

HTTP 通道**默认只暴露 `health`**，JMX 通道默认全部暴露。生产环境应当用**显式白名单**（`health,info,prometheus` 等）而不是 `include: "*"`，并把管理端口独立出来（`management.server.port`）只绑内网。

**Q2：liveness 和 readiness 有什么区别？该放什么？**

liveness 回答"进程还能不能工作"，失败会被**重启**；readiness 回答"现在能不能接流量"，失败只是被**摘除流量**。

**判断准则：外部依赖（数据库、下游服务）绝不能进 liveness。** 否则依赖抖动会导致实例被批量重启，反过来加剧故障（级联放大）。依赖只应影响 readiness。Spring Boot 侧对应 `LivenessState` 与 `ReadinessState` 两个状态，后者在启动完成前与优雅停机开始时都是 `REFUSING_TRAFFIC`。

**Q3：健康检查是怎么汇总的？**

`/actuator/health` 是所有 `HealthIndicator` 的聚合：任一为 `DOWN` 整体即 `DOWN` 且 DOWN 优先于 UNKNOWN。可以按用途配**健康分组**（如 `readiness` 组只含关键依赖，让"没数据库不能服务、但缓存挂了可降级"这种真实可用性被准确表达）。

**Q4：Micrometer 和 Prometheus 是什么关系？**

Micrometer 是**门面 API**，Prometheus 是其中一种**实现**。业务代码只依赖 `MeterRegistry`，监控系统可替换。监控抓取应使用 `prometheus` 端点而不是 `metrics` 端点。

**Q5：什么是指标基数问题？怎么防？**

指标的时间序列数由**标签取值的组合数**决定。给 `userId`、原始 URL、异常消息打标签会让序列数无界增长，拖垮监控后端。**判据是"标签取值必须可枚举且有限"**；工程上把路径参数模板化（用 `/orders/{id}` 而不是真实路径），并在 `MeterFilter` 层面拒绝高基数标签兜底。

**Q6：怎么在不重启的情况下把日志级别调成 DEBUG？**

`POST /actuator/loggers/{loggerName}` 传 `{"configuredLevel":"DEBUG"}`。**注意 `configuredLevel` 与 `effectiveLevel` 的区别**：前者是"本 logger 显式配置的级别"（`null` 表示继承），后者是实际生效的级别。**还原时要传 `null`**，传具体值等于钉了一个显式配置，配置文件后续修改将不再生效。

**Q7：启动慢怎么定位？**

用 `BufferingApplicationStartup` 采集后访问 `/actuator/startup`，得到每个阶段与每个 Bean 的耗时并可排序。常见根因是组件扫描范围过大与 `@PostConstruct` 中的阻塞操作。另外 `/actuator/conditions` 的 `negativeMatches` 能解释"为什么某个自动配置没生效"。

**Q8：Actuator 有哪些安全风险？**

三类：① **内部结构泄露**（`env`、`configprops`、`beans`、`mappings`）；② **敏感数据泄露**（`heapdump` 是内存快照，**脱敏对堆无效**）；③ **管理动作被调用**（`shutdown`、自定义 `@WriteOperation`、`loggers` 被改成 TRACE 造成磁盘打满）。

防护：最小暴露 + 独立管理端口 + 统一鉴权（用 `EndpointRequest` 按端点授权）+ 保持 `access` 默认为 `read-only`。**更根本的一条**：不要依赖框架默认安全配置，显式声明 `SecurityFilterChain`。

**Q9：Spring Boot 4 对 Actuator 有什么影响？**

① 模块化拆分，包名迁移（`HealthIndicator` → `org.springframework.boot.health.contributor` 等）；② 用**访问级别**（`access`）取代 `enabled`，默认 `read-only`，**自定义端点的写操作会静默 405**；③ liveness / readiness 探针默认启用；④ 新增原生镜像端点。另外 4.0.0–4.0.5 曾有因模块缺失导致默认安全链不生成 Actuator 授权规则的漏洞（4.0.6 修复），提醒"默认安全不要当成保证"。

---

> 相关篇目：[启动流程](/java/spring/spring-boot/startup)（启动事件与耗时优化）、[配置体系](/java/spring/spring-boot/configuration)（`env` / `configprops` 端点与密钥处理）、[内嵌容器与请求进入](/java/spring/spring-boot/web-server)（优雅停机与 readiness 的配合）。
