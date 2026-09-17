---
date: 2026-09-16
title: 序列化与类型边界：Jackson 的七个坑
sidebar: 序列化边界
order: 5
desc: HttpMessageConverter 编解码链路、Spring 托管的 ObjectMapper、LocalDateTime 与时区的三处冲突、Long 精度丢失（JS 53 位边界）、循环引用与多态、FAIL_ON_UNKNOWN_PROPERTIES 的默认反转、四种定制手段、Jackson 3 包名迁移、ObjectMapper 复用
---

# 序列化与类型边界：Jackson 的七个坑

序列化的特点是：**它不产生编译错误，只在运行时静默地改变数据**。ID 从 `1234567890123456789` 变成 `1234567890123456800`、时间从 `14:00` 变成 `06:00`、两个实体互相引用导致栈溢出——这些都不是"接口报错"，而是**接口返回了错误的数据**，且往往到最后联调阶段才发现。

> **主线：序列化是"类型系统的一次跨语言翻译"，而 JSON 与 Java 的类型系统并不等价。**
>
> 三个不等价处对应三类经典事故：**长整型精度**（Java 有 int64，JSON 数字在 JS 里只有 float64）、**时间类型**（Java 有时区概念，JSON 只有字符串）、**对象图**（Java 有引用循环，JSON 是树）。
>
> 这三处都不是 bug，而是**模型差异的必然结果**——必须显式处理，不处理就由框架替你决定。

## 一、问题场景：三个"接口通了但数据不对"的事故 {#why-serialization}

| 事故 | 表现 | 根因 |
|---|---|---|
| **ID 末位变 0** | 前端拿到的 ID 与后端不一致，查不到数据 | Java `Long`（64位）→ JSON number → **JS `Number`（float64，安全整数只有 53 位）** |
| **时间差 8 小时** | 库里是 `14:00`，前端显示 `06:00` | `LocalDateTime` 无时区，序列化时被按某个时区解释，**而三处配置可能不一致** |
| **接口 500：StackOverflow** | 双向关联的实体序列化时无限递归 | JSON 是**树**，无法表达 Java 的**循环引用** |

三者的共同点是：**开发阶段不易发现**。ID 用例通常用短 ID（`1`、`2`），时间字段如果本地时区恰好等于目标时区看不出问题，双向关联要等真正取到两边数据才触发。

**先建立一个检查顺序**：接口"数据不对"时，先分清是**序列化问题**还是**业务问题**。最快的判别方式是看**原始响应体**（浏览器 Network / `curl`）——如果原始 JSON 就已经是错的，那就是序列化；如果原始 JSON 正确而前端显示错误，那是前端解析的问题。

## 二、编解码链路：谁在做序列化 {#converter}

一次请求的编解码由 `HttpMessageConverter` 负责，Spring MVC 预置了一批：

```
请求到达
   │
   ▼
@RequestMapping 匹配 ▶ 参数解析（HandlerMethodArgumentResolver）
   │                          │
   │                          ├─ @RequestBody ──▶ 选一个能读的 HttpMessageConverter
   │                          │                    （JSON → MappingJackson2HttpMessageConverter）
   │                          ▼
   │                    Handler 执行（返回对象）
   │                          │
   ▼                          ▼
响应写出 ◀── @ResponseBody ── 选一个能写的 HttpMessageConverter
                              （对象 → JSON）
```

关键点是：**选哪个转换器由"媒体类型 + 目标类型"决定**。所以"为什么我的自定义序列化器没生效"这类问题，第一个要确认的是**这个请求有没有走 JSON 转换器**（例如返回 `String` 时可能走 `StringHttpMessageConverter`，**不会被 Jackson 处理**）。

> **一个高频误解**：Controller 方法返回 `String` 时，如果有 `@RestController`，Spring 会用 `StringHttpMessageConverter` 而不是 Jackson——**因此 `spring.jackson.*` 的配置对它无效**。要让它走 Jackson，必须返回对象或 `ResponseEntity<String>` 并指定 JSON 媒体类型。

转换器的**顺序**可以调整（`configureMessageConverters` / `extendMessageConverters`），但**自定义时要注意别把默认的替换掉**：`configureMessageConverters` 是**覆盖**，`extendMessageConverters` 是**追加**。这是"加了自定义转换器之后 JSON 全挂了"的常见原因。

## 三、`ObjectMapper`：用 Spring 托管的那个 {#objectmapper}

**`new ObjectMapper()` 和 Spring 容器里的那个不是同一个实例**，这是最基础也最常被忽略的一点。

Spring Boot 通过 `JacksonAutoConfiguration` 创建并托管一个 `ObjectMapper`（由 `Jackson2ObjectMapperBuilder` 构建），并把 `spring.jackson.*` 的属性应用上去。控制器里的序列化用的就是这一个。

```java
// ❌ 自己 new 一个：不读配置、不注册 Boot 自动发现的模块、时间格式与接口不一致
private final ObjectMapper mapper = new ObjectMapper();

// ✅ 注入 Spring 托管的那个
@Autowired private ObjectMapper objectMapper;
```

| 配置方式 | 作用范围 | 说明 |
|---|---|---|
| `spring.jackson.*` 属性 | 全局（Boot 托管实例） | 首选，声明式 |
| `@Bean Jackson2ObjectMapperBuilderCustomizer` | 全局 | 需要编程式微调时用 |
| `@JsonComponent` / 自定义 `Module` Bean | 全局 | **Boot 会自动注册所有 `Module` 类型的 Bean** |
| 注解（`@JsonFormat` 等） | 单个字段/类 | 局部覆盖 |
| `@Bean ObjectMapper` | **完全接管** | ⚠️ 会跳过 Boot 的自动配置，**需自己把 `spring.jackson.*` 的语义补齐** |

**最后一行是常见的坑**：自己定义 `ObjectMapper` Bean 会**让 Boot 的自动配置失效**（`@ConditionalOnMissingBean`），于是 Java 8 时间模块、默认的 `FAIL_ON_UNKNOWN_PROPERTIES=false` 等设置全部回退到 Jackson 原生默认值。

需要定制时的正确姿势是**不替换 Bean，而是加 `Customizer`**：

```java
@Bean
Jackson2ObjectMapperBuilderCustomizer jacksonCustomizer() {
    return builder -> builder
            .serializationInclusion(JsonInclude.Include.NON_NULL)
            .failOnUnknownProperties(false);
}
```

## 四、`LocalDateTime` 与时区：三处配置的冲突 {#datetime}

Java 8 时间类型在 JSON 里有两种表达：

| 模式 | 输出 | 由什么控制 |
|---|---|---|
| **时间戳数组**（Jackson 原生默认） | `[2026,9,16,14,0,0]` | `WRITE_DATES_AS_TIMESTAMPS` |
| **ISO-8601 字符串**（Boot 默认） | `"2026-09-16T14:00:00"` | `WRITE_DATES_AS_TIMESTAMPS=false` |

**Spring Boot 默认关闭了 `WRITE_DATES_AS_TIMESTAMPS`**，所以默认输出 ISO 字符串。这个默认值与 Jackson 原生不同，也是"为什么单独用 Jackson 和用 Boot 输出不一样"的原因。

**时区的冲突来自三个独立的地方**：

| 位置 | 作用 | 常见错误 |
|---|---|---|
| **JVM 时区**（`user.timezone` / 容器 `TZ`） | `LocalDateTime.now()` 的取值基准 | 容器默认 UTC，代码按本地时间理解 |
| **`spring.jackson.time-zone`** | **序列化 `Date` / `Instant` 时**的时区 | 未设置时用 JVM 时区 |
| **数据库连接时区** | JDBC 读写 `TIMESTAMP` 的解释 | 与 JVM 时区不一致导致"写入即偏移" |

**关键区分（面试高频）**：

- **`LocalDateTime` 没有时区信息**——它只是"墙上时间"。所以 `spring.jackson.time-zone` **对它不生效**（Spring Boot 2.6+ 起 `time-zone` 明确只影响有时区的类型）。
- **`Instant` / `ZonedDateTime` / `Date` 有时区语义**，序列化时会按配置的时区转换。
- **`OffsetDateTime` 保留了偏移量**，是跨时区系统中更安全的选择。

| 类型 | 含时区？ | 序列化表现 | 建议 |
|---|---|---|---|
| `LocalDateTime` | ❌ | 原样输出，**时区配置不影响它** | 单时区系统（国内业务）够用 |
| `Instant` | ✅（UTC） | 按 `time-zone` 转换后输出 | 跨时区系统 |
| `OffsetDateTime` | ✅（带偏移） | 输出带 `+08:00` | **跨时区系统的首选** |
| `ZonedDateTime` | ✅（带区域） | 输出带区域名 | 需要夏令时逻辑时 |

**统一约定的实践**：国内业务（单时区）直接用 `LocalDateTime` + 全局格式配置即可；一旦涉及多时区或多地区部署，**必须改成 `Instant` 或 `OffsetDateTime`**，并显式配置 `spring.jackson.time-zone: Asia/Shanghai`。混用是事故的温床——`LocalDateTime` 在跨时区部署时会**静默地表达错误的时间**。

```yaml
spring:
  jackson:
    date-format: yyyy-MM-dd HH:mm:ss
    time-zone: Asia/Shanghai
    serialization:
      write-dates-as-timestamps: false
```

> **MySQL 侧的一个变化**：Connector/J 8.0.23 起 `serverTimezone` 参数被 `connectionTimeZone` 取代（旧参数仍可用但已废弃）。排查"时间偏移"时，建议同时确认 JVM 时区、容器时区、连接时区三者是否一致——**三者不一致时，`LocalDateTime` 的读写会出现方向相反的偏移**。

## 五、Long 精度：JavaScript 的 53 位边界 {#long-precision}

这是前后端联调**最高频**的一类问题，根因非常简单：

```
Java  long / Long      : 64 位整数，可表示到 9,223,372,036,854,775,807（19 位）
JSON  number           : 无类型区分，规范未限制精度
JS    Number (float64) : 安全整数上限 2^53 - 1 = 9,007,199,254,740,991（16 位）
```

**当数字超过 16 位时，JS 会静默丢失精度**：

```
后端返回 : 1234567890123456789
前端收到 : 1234567890123456800     ← 末位已经变了，且不报错
```

**哪些 ID 会超过 16 位**：Twitter Snowflake 算法生成的是 64 位 long（19 位十进制），**几乎所有自研 ID 生成器都基于它**。所以只要用了雪花 ID，这个问题**必然发生**。

### 5.1 三种解法 {#long-solutions}

| 方案 | 做法 | 评价 |
|---|---|---|
| **① 序列化成字符串** | `@JsonSerialize(using = ToStringSerializer.class)` | ✅ 最常用，局部可控 |
| ② 全局配置 Long → String | 注册 `SimpleModule`，对所有 `Long` 生效 | ⚠️ 影响面大，可能改变接口契约 |
| ③ 用字符串类型做 ID | DTO 里字段声明为 `String` | ✅ 契约最清晰，但需要转换 |

```java
public class OrderVO {
    @JsonSerialize(using = ToStringSerializer.class)
    private Long id;

    // 如果整个 DTO 都是这种处理，可以在类上统一声明
}
```

**全局方案的写法**（谨慎使用——它会把**所有** `Long` 都变成字符串，包括那些小于 16 位的字段，可能破坏已有接口契约）：

```java
@Bean
public Jackson2ObjectMapperBuilderCustomizer longToStringCustomizer() {
    return builder -> {
        SimpleModule module = new SimpleModule();
        module.addSerializer(Long.class, ToStringSerializer.instance);
        module.addSerializer(Long.TYPE, ToStringSerializer.instance);
        builder.modules(module);
    };
}
```

**反序列化要能接受字符串**——前端把 ID 当字符串传回来时，Jackson 默认**可以**把 `"123"` 转成 `Long`（`ALLOW_COERCION_OF_SCALARS` 默认开启），但**不能**把 `1234567890123456789` 这种超出 `Long` 范围的字面量正确解析。所以约定是：**ID 进出都用字符串**。

> **一个容易漏掉的连带问题**：`@PathVariable Long id` 接收 19 位数字**没有问题**（URL 是字符串，服务端解析），所以**问题只出现在响应序列化方向**。这也解释了为什么"新增接口返回 ID 前端存起来后再查详情会查不到"——存进去的就已经是错的 ID 了。

## 六、循环引用与多态 {#circular-polymorphism}

### 6.1 循环引用：JSON 是树，Java 是图 {#circular-reference}

```java
class Order { private List<OrderItem> items; }
class OrderItem { private Order order; }        // 反向引用 → 序列化时无限递归

// 结果：JsonMappingException: Infinite recursion (StackOverflowError)
```

三种解法，推荐度递增：

| 方案 | 做法 | 副作用 |
|---|---|---|
| `@JsonIgnore` | 在反向字段上忽略 | 该字段**两个方向都消失**（如果正反向都需要，不适用） |
| `@JsonManagedReference` + `@JsonBackReference` | 成对使用，标明父子 | 只能处理**一对**关系，多对多失效 |
| **DTO 转换（推荐）** | 不直接序列化实体，转成专门的 VO | **从根上消除**，还能顺便解决懒加载与安全字段暴露 |

**第三种是唯一"治本"的方案**——直接序列化 JPA/MyBatis 实体到接口，本质上是在**用数据库模型充当 API 契约**，循环引用只是这个问题的表象之一（还有懒加载触发、敏感字段泄露、字段改名即破坏契约）。

### 6.2 多态：序列化能反序列化不能 {#polymorphism}

Java 的多态在 JSON 里没有直接对应，需要类型信息：

```java
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(value = AlipayPayment.class, name = "alipay"),
    @JsonSubTypes.Type(value = WechatPayment.class, name = "wechat")
})
public interface Payment { }
```

**注意 `@JsonTypeInfo` 默认会写入类型字段到底层 JSON**（`property = "type"` 就是写进去的标记），这与 `GenericJackson2JsonRedisSerializer` 写 `@class` 是同一个思路——**代价是响应体多了一个前端不需要的字段，并且类型名与类结构绑定**。

**安全提醒**：开启多态反序列化（尤其是 `Id.CLASS`）存在**反序列化攻击面**——攻击者可通过构造 `type` 字段实例化任意类。生产上应使用 `Id.NAME` + 白名单的 `@JsonSubTypes`，**不要用 `Id.CLASS`**。

## 七、未知字段：Boot 的默认值被反转了 {#unknown-fields}

| 环境 | `FAIL_ON_UNKNOWN_PROPERTIES` 默认值 | 遇到未知字段时 |
|---|---|---|
| **Jackson 原生** | `true` | **抛 `UnrecognizedPropertyException`** |
| **Spring Boot 托管的实例** | **`false`** | 静默忽略 |

**Spring Boot 把这个默认值反转了**，理由是"API 演进时客户端多传字段不应该导致失败"。这是一个**兼容性优先**的取舍。

由此得到两个实践结论：

**① 升级 Spring Boot 大版本时，这类"默认值反转"要单独核对。** 它们不产生编译错误，只改变运行时行为。

**② 反向的影响是"拼错的字段被静默忽略"。** 客户端把 `userName` 写成 `username`，服务端不会报错，只是那个字段永远是 null：

```yaml
spring:
  jackson:
    deserialization:
      fail-on-unknown-properties: true      # 需要严格校验时显式打开
```

**打开它的场景**：内部服务之间的 API、需要强契约的写接口。**保持关闭的场景**：对外的公开 API（需要容忍客户端传多余字段）。

### 7.1 空值与空字符串 {#null-handling}

| 配置 | 效果 |
|---|---|
| `JsonInclude.Include.NON_NULL` | 字段为 null 时**不输出该字段** |
| `JsonInclude.Include.NON_EMPTY` | null、空字符串、空集合都不输出 |
| `JsonInclude.Include.ALWAYS`（默认） | 总是输出（`"field": null`） |

**`NON_NULL` 有一个副作用**：字段消失与字段为 null 在前端是**两种不同的判断**。如果前端代码写 `if (res.data.field === null)`，字段直接不出现时这个判断不会命中（变成 `undefined`）。**要么统一约定"不输出即 null"，要么保持输出 null**。

## 八、定制序列化：四种手段怎么选 {#customization}

| 手段 | 粒度 | 适用 |
|---|---|---|
| 注解（`@JsonFormat` / `@JsonSerialize` / `@JsonIgnore`） | 字段/类 | **首选**，改动局部、可读 |
| `Module` Bean | 全局（按类型） | 第三方类型的统一处理（如 `LocalDateTime` 全局格式） |
| `@JsonComponent` | 全局 | 自定义序列化器/反序列化器的**注册方式**，Boot 自动发现 |
| `ObjectMapper` 替换 | 全局 | **不推荐**（会跳过 Boot 自动配置） |

```java
@JsonComponent                                     // Boot 自动注册，无需手动加 Module
public class MoneySerializer extends JsonSerializer<Money> {
    @Override
    public void serialize(Money value, JsonGenerator gen, SerializerProvider serializers)
            throws IOException {
        gen.writeString(value.toPlainString());     // 金额一律字符串，避免浮点误差
    }
}
```

**金额为什么用字符串**：`BigDecimal` 序列化成 JSON number 后，前端用 `Number` 解析会变成 float64（又是精度问题），并且 `0.1 + 0.2` 的浮点误差会在前端做计算时暴露。**金额的通用约定是"序列化为字符串，计算在后端做"**。

## 九、Jackson 3：包名迁移与默认变化 {#jackson3}

**Spring Framework 7 / Spring Boot 4 起，Jackson 3 成为默认的 JSON 处理器**，这是一次**包名级别**的变更：

| | Jackson 2 | Jackson 3 |
|---|---|---|
| **根包名** | `com.fasterxml.jackson.*` | **`tools.jackson.*`** |
| 推荐构建方式 | `new ObjectMapper()` | **`JsonMapper.builder()`** |
| 在 Boot 中的状态 | **以 deprecated 形式保留** | 默认 |
| 移除计划 | Spring Framework 7.2 计划移除 | —— |

**对应用代码的影响面**：

| 场景 | 影响 |
|---|---|
| 只用 `@JsonProperty`、`@JsonFormat` 等**注解** | 小——注解基本兼容，**但 import 路径变了** |
| 自定义 `JsonSerializer` / `JsonDeserializer` | **需要改 import 与部分 API 签名** |
| 直接 `new ObjectMapper()` 并做大量配置 | 大——建议改成 `JsonMapper.builder()` |
| 依赖里直接引了 Jackson 2 的坐标 | 需要确认传递依赖的版本，避免两套并存 |

**迁移时的检查顺序**：① 搜 `com.fasterxml.jackson` 的 import；② 检查自定义的 `Module` / `Serializer`；③ 确认没有手写 `ObjectMapper` Bean；④ 验证 `spring.jackson.*` 的配置仍然生效。

> **一个降低风险的做法**：不要在各处 `new ObjectMapper()`，而是**始终注入容器里的实例**。这样迁移时只需要改一处（配置），业务代码不动。这也是[第三节](#objectmapper)强调"用托管实例"的另一个理由。

## 十、性能：`ObjectMapper` 复用的边界 {#performance}

`ObjectMapper` **线程安全**（配置完成后），可以也应该被复用：

| 做法 | 评价 |
|---|---|
| 全局单例（Spring 托管） | ✅ 标准做法 |
| 每次 `new ObjectMapper()` | ❌ 代价极高——**初始化要扫描注解、构建序列化器缓存**，比一次序列化本身慢得多 |
| 复用 `ObjectWriter` / `ObjectReader` | ✅ 高频场景可减少查找开销 |
| 反复调用 `writeValueAsString` 生成大对象 | ⚠️ 每次都分配新 `String`，高频场景考虑流式输出 |

**"每次 new" 为什么代价大**：`ObjectMapper` 在首次序列化某个类型时，要**反射扫描注解、构建 `BeanSerializer` 并缓存**。这个缓存是实例级的——新实例意味着缓存全空，每次都要重建。

**一个常见的性能陷阱是在循环里 new**：

```java
for (Order o : orders) {
    String json = new ObjectMapper().writeValueAsString(o);    // ❌ 灾难
}
```

**另一个边界是流式输出**：返回超大集合时，`List<T>` 会被整体序列化到内存再写出。此时应改用 `StreamingResponseBody` 或直接写 `OutputStream`，避免一次分配巨大字符串。

## 十一、面试口径 {#interview}

| # | 问题 | 一句话答案 |
|---|---|---|
| 1 | 后端 `Long` 传到前端为什么精度会变？ | JS 的 `Number` 是 **float64，安全整数上限 2^53-1（16 位）**，而 Java `long` 是 64 位（19 位）。雪花 ID 必然超出，**末位被静默改掉且不报错**。解法是**序列化成字符串**（`@JsonSerialize(using = ToStringSerializer.class)`） |
| 2 | 为什么问题只出现在响应方向？ | `@PathVariable Long id` 接收的是 URL 字符串，服务端解析没问题；**精度只在"Java 数字 → JSON number → JS Number"这一步丢失**。所以"新增后拿 ID 再查详情查不到"的根因就在返回那一步 |
| 3 | `LocalDateTime` 和 `OffsetDateTime` 的区别？ | `LocalDateTime` **不含时区**，只是"墙上时间"，因此 `spring.jackson.time-zone` **对它不生效**；`OffsetDateTime` 带偏移量，跨时区系统中更安全。单时区业务用前者够，多时区**必须**用后者或 `Instant` |
| 4 | Boot 里时间默认序列化成什么？ | **ISO-8601 字符串**（Boot 关闭了 `WRITE_DATES_AS_TIMESTAMPS`），与 Jackson 原生默认（时间戳数组）**相反**。要自定义格式用 `spring.jackson.date-format` 或字段上的 `@JsonFormat` |
| 5 | 为什么用 `new ObjectMapper()` 会有问题？ | 两个问题：**读不到 `spring.jackson.*` 配置、不注册 Boot 自动发现的模块**（Java 8 时间、Kotlin 等），导致行为与接口不一致；性能上**每次 new 都会重建序列化器缓存**，在循环里 new 是灾难 |
| 6 | 自定义 `ObjectMapper` Bean 有什么风险？ | 它会**使 Boot 的自动配置失效**（`@ConditionalOnMissingBean`），`FAIL_ON_UNKNOWN_PROPERTIES=false`、时间模块等设置全部回退到 Jackson 原生默认。正确做法是加 `Jackson2ObjectMapperBuilderCustomizer` |
| 7 | `FAIL_ON_UNKNOWN_PROPERTIES` 在 Boot 里默认是什么？ | **`false`**（**与 Jackson 原生默认 `true` 相反**）。Boot 反转它是为了 API 兼容性，代价是**拼错的字段被静默忽略**。需要强契约时显式打开 |
| 8 | 循环引用怎么解决？ | 三种：`@JsonIgnore`（双向都消失）、`@JsonManagedReference`/`@JsonBackReference`（只能处理一对）、**转 DTO/VO（根治）**。直接序列化实体到接口，本质是用数据库模型当 API 契约，循环引用只是表象之一 |
| 9 | `@JsonTypeInfo` 有什么安全风险？ | 多态反序列化若用 `Id.CLASS`，攻击者可构造 `type` 字段**实例化任意类**。生产应用 `Id.NAME` + `@JsonSubTypes` 白名单，不要暴露类名 |
| 10 | 金额为什么建议序列化成字符串？ | JSON number 到前端会变成 float64，`0.1+0.2` 的误差会在前端计算时暴露。通用约定是**金额用字符串传输、计算留在后端** |
| 11 | Jackson 3 带来了什么迁移成本？ | **根包名从 `com.fasterxml.jackson` 改为 `tools.jackson`**，推荐用 `JsonMapper.builder()` 构建。注解基本兼容但 **import 全要改**，自定义 `Serializer`/`Module` 需要适配。Jackson 2 以 deprecated 形式保留，计划在 Spring Framework 7.2 移除 |
| 12 | 怎么降低序列化层的迁移与事故风险？ | **始终注入容器托管的 `ObjectMapper`，不要在各处 `new`**；把全局约定收敛到 `spring.jackson.*` 与 `Customizer`。这样时间格式、未知字段策略、Long 处理都只有一处定义，迁移时只改配置、业务代码不动 |

> 回到：[Spring 横切能力 · 导览](/java/spring/spring-framework/crosscutting/)　|　下一篇：[出站 HTTP 超时](/java/spring/spring-framework/crosscutting/outbound-http)
