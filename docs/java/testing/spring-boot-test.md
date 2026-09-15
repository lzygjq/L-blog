---
date: 2026-09-15
title: Spring Boot 测试与上下文
sidebar: 切片测试
order: 3
desc: 上下文启动成本与缓存机制、切片测试的选型判据、MockMvc、@MockBean 在 Boot 4.0 被移除后的写法、拆解一个真实的测试基类
---

# Spring Boot 测试与上下文

Spring Boot 的测试最容易走两个极端：**全部用 `@SpringBootTest`**（每个测试类启动一次完整容器，套件跑十分钟），或者**全部用 Mock 单测**（快是快了，但 SQL、事务、序列化、多租户这些真问题一个都没验证到）。

这一篇讲中间那条路：**按「要验证哪一层」来决定容器装多少东西**。

## 一、先理解慢在哪 {#cost}

`@SpringBootTest` 慢，不是因为「启动了一个 JVM」，而是它做了这些事：

1. **扫描类路径**做自动配置（`@ConditionalOnClass` 那一堆判断）
2. **建 Bean**：数据源、连接池、MyBatis、Redis、MQ、线程池、定时任务……
3. **跑初始化**：建连、加载映射文件、注册监听器
4. 如果 `webEnvironment` 是默认值，还要**起 Web 容器**

一次完整启动在中等规模项目上是 **3~10 秒**。听起来不多，但如果 200 个测试类各启动一次，就是几十分钟。

**所以第一个该建立的认知是：Spring 的测试上下文是会被缓存的**（下面第七节）。慢的根源不是「启动」，而是「**反复启动**」。

## 二、切片测试：只装你要验证的那一层 {#slices}

切片（slice）的官方定义很朴素：**一组预设的自动配置集合**。它的效果是——只把「这一层需要的东西」装进容器。

| 切片注解 | 装什么 | 不装什么 | 典型用途 |
|---|---|---|---|
| `@WebMvcTest` | Controller、`HandlerMapping`、消息转换器、校验器、过滤器 | Service、Repository、数据源 | 测路由、参数绑定、校验、状态码 |
| `@DataJpaTest` | JPA、实体、Repository、内嵌数据库 | Service、Web 层 | 测派生查询、关联映射、SQL 正确性 |
| `@MybatisPlusTest` | MyBatis-Plus、Mapper、内嵌库 | Service、Web 层 | MyBatis-Plus 生态里对应 `@DataJpaTest` 的位置 |
| `@JsonTest` | Jackson、序列化器 | 其余全部 | 测序列化格式（日期、枚举、脱敏） |
| `@RestClientTest` | `RestTemplate` / `RestClient` + Mock 服务器 | 其余全部 | 测对外调用与错误处理 |
| `@JdbcTest` | `JdbcTemplate`、数据源 | Service、Web | 测手写 SQL |

> **`@MybatisPlusTest` 不在 Spring Boot 里**，它是 MyBatis-Plus 自己提供的（`mybatis-plus-boot-starter-test`）。用 MyBatis-Plus 的项目必须知道它——否则会退化成「所有 DB 测试都上 `@SpringBootTest`」。

### 选型判据

```text
我要验证的是…
├─ HTTP 契约（路由 / 绑定 / 校验 / 状态码 / 序列化）
│    → @WebMvcTest（+ @MockitoBean 顶掉 Service）
├─ SQL 与映射（查询正确性 / 关联 / 字段类型）
│    → @DataJpaTest 或 @MybatisPlusTest
├─ 序列化格式（日期、枚举、脱敏、空值策略）
│    → @JsonTest
└─ 跨层协作（事务边界 / 多租户隔离 / 消息投递 / 缓存一致性）
     → @SpringBootTest（这里没得省，见第四篇）
```

**最后一行是本篇最重要的一句**：切片不是万能的，**跨层的东西切片测不出来**。

### 2.1 `webEnvironment` 的四个取值

`@SpringBootTest` 的 `webEnvironment` 决定了容器形态：

| 取值 | 起 Web 容器 | 端口 | 适用 |
|---|---|---|---|
| `MOCK`（默认） | 起 Mock 环境（不清 Servlet 容器） | 无 | 配 `MockMvc` 测 Controller |
| `RANDOM_PORT` | 起真实容器 | 随机 | 需要真实网络栈（过滤器链、序列化、真实超时） |
| `DEFINED_PORT` | 起真实容器 | 配置的端口 | 少用——会和本地服务、CI 并发冲突 |
| `NONE` | 不起 | 无 | 只测 Service / 数据层，**最快** |

`NONE` 值得特别记住：**当测试完全不涉及 Web 层时，它是免费的加速**。很多项目习惯性用默认的 `MOCK`，白起了一堆 Web 组件。

## 三、MockMvc：不起容器的 HTTP 测试 {#mockmvc}

```java
@WebMvcTest(UserController.class)
class UserControllerTest {

    @Autowired MockMvc mockMvc;

    @MockitoBean                       // Boot 3.4+ 的写法，见第五节
    UserService userService;

    @Test
    void 用户不存在时返回404() throws Exception {
        when(userService.getUser(99L)).thenThrow(new ServiceException(USER_NOT_EXISTS));

        mockMvc.perform(get("/api/users/99"))
               .andExpect(status().isNotFound())
               .andExpect(jsonPath("$.code").value(USER_NOT_EXISTS))
               .andExpect(jsonPath("$.msg").isNotEmpty());
    }
}
```

`MockMvc` **不经过真实网络**——它直接调用 `DispatcherServlet`，所以：**快，但绕过了 Servlet 容器与部分过滤器**（比如基于真实连接的 `OncePerRequestFilter` 行为、CORS、压缩）。需要验证这些时，改用 `RANDOM_PORT` + 真实 HTTP 客户端。

### 3.1 该断言的四个层次

```java
mockMvc.perform(post("/api/orders")
        .contentType(MediaType.APPLICATION_JSON)
        .content(json))
    .andExpect(status().isOk())                      // ① 状态码
    .andExpect(header().string("X-Trace-Id", any(String.class)))  // ② 响应头
    .andExpect(jsonPath("$.data.id").isNumber())     // ③ 响应体结构
    .andExpect(jsonPath("$.data.status").value("FROZEN"));        // ④ 业务字段
```

**只断言状态码 == 没测契约**。客户端真正依赖的是响应体结构与字段类型，这也是回归时最容易静默变化的部分。

### 3.2 Boot 4.0 的一个陷阱：`@SpringBootTest` 不再自动配 MockMvc

在 Boot 3.x，`@SpringBootTest` + `webEnvironment=MOCK` 会顺手给你一个 `MockMvc`。**Boot 4.0 移除了这个隐式装配**，必须显式声明：

```java
@SpringBootTest
@AutoConfigureMockMvc        // ← 4.0 起不加这行，MockMvc 注入就是 null
class ApiIntegrationTest { }
```

`TestRestTemplate` / `WebClient` 同理——不再自动提供。而且官方建议把 `TestRestTemplate` 换为新出现的 **`RestTestClient`**（配 `@AutoConfigureRestTestClient`）。

## 四、`@MockBean` 已经不存在了 {#mockitobean}

这是升级到 Spring Boot 4.0 时**测试代码最大的破坏性变更**，也是中文资料里最容易过时的一处：

| 版本 | 状况 |
|---|---|
| Boot 3.3 及更早 | 用 `@MockBean` / `@SpyBean` |
| **Boot 3.4** | `@MockBean` / `@SpyBean` **标记弃用**（`forRemoval = true`） |
| **Boot 4.0** | **`@MockBean` / `@SpyBean` 被移除**，改用 `@MockitoBean` / `@MockitoSpyBean` |

替换本身是机械的：

```java
// Boot 3.3 及更早
@MockBean  UserService userService;
@SpyBean   OrderService orderService;

// Boot 3.4+
@MockitoBean     UserService userService;
@MockitoSpyBean  OrderService orderService;
```

### 4.1 但有一个不显眼的差异：不能用在 `@Configuration` 上

老写法允许把共享的 mock 集中到一个测试配置类里：

```java
// 老写法：在 @Configuration / @TestConfiguration 里声明共享 mock
@TestConfiguration
public class SharedMockConfig {
    @MockBean UserService userService;
    @MockBean OrderService orderService;
}
```

**新注解不允许这么做**——`@MockitoBean` 只能作为测试类的字段（或父类字段/组合注解）。共享 mock 要改成声明在测试类上：

```java
@SpringBootTest
@MockitoBean(types = {UserService.class, OrderService.class})
@MockitoBean(name = "printService", types = PrintService.class)
class ApplicationTests { }
```

如果多个测试类都要这套共享 mock，用**自定义组合注解**：

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@MockitoBean(types = {UserService.class, OrderService.class})
public @interface SharedMocks { }

// 使用
@SpringBootTest
@SharedMocks
class OrderApiTest { }
```

> 这个差异值得单独记住：**如果项目里有三十几个测试类分布在 `@TestConfiguration` 里声明 mock，Boot 4 升级时会一起编译失败**，而且报错信息不一定直观。

### 4.2 一个性能副作用

`@MockitoBean` 定义的 mock 集合会被算进**上下文缓存键**（见第七节）。所以：

- 不同测试类用了**不同的 mock 组合** → 各自开一个新上下文
- 想复用上下文 → **保持 mock 组合一致**，或者把公共 mock 提到父类

这是「为什么加了 mock 之后测试变慢了」的常见答案。

## 五、拆解一个真实的测试基类 {#basedb}

前面讲的都是「标准做法」，实际项目里更常见的形态是**自建测试基类**。这里完整拆解一个真实的实现（yudao 框架的 `BaseDbUnitTest`），因为它的每一行都对应一个踩过的坑。

```java
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.NONE,      // ① 不起 Web 容器
    classes = BaseDbUnitTest.Application.class                // ② 只装指定的配置
)
@ActiveProfiles("unit-test")                                  // ③ 专用测试配置
@Sql(scripts = "/sql/clean.sql",
     executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)   // ④ 每个方法后清库
public class BaseDbUnitTest {

    @Import({
        // DB
        YudaoDataSourceAutoConfiguration.class,
        DataSourceAutoConfiguration.class,
        DataSourceTransactionManagerAutoConfiguration.class,
        DruidDataSourceAutoConfigure.class,
        SqlInitializationTestConfiguration.class,              // ⑤ 自建的 SQL 初始化
        // MyBatis
        YudaoMybatisAutoConfiguration.class,
        MybatisPlusAutoConfiguration.class,
        MybatisPlusJoinAutoConfiguration.class
    })
    public static class Application { }
}
```

逐条看它的设计意图：

| # | 手法 | 为什么 |
|---|---|---|
| ① | `webEnvironment = NONE` | 纯数据层测试，Web 容器是纯浪费 |
| ② | 用 `classes` 指向一个空壳内部类 | **这是「手写切片」**：只 `@Import` 数据层配置，不扫全工程 |
| ③ | `@ActiveProfiles("unit-test")` | 用 `application-unit-test.yml` 指向 H2 与内嵌 Redis |
| ④ | `@Sql` + `AFTER_TEST_METHOD` | 保证测试之间数据不串 |
| ⑤ | 自建 SQL 初始化配置 | 见下面这条注解里的故事 |

### 5.1 第五条背后的坑（值得单独看）

那个自建配置类的注释直接写明了原因：

> 为什么不使用 Spring 自带的 `DataSourceInitializationConfiguration`？因为单元测试会把 `spring.main.lazy-initialization` 设为 `true` 开启延迟加载，此时它不会初始化。

也就是说：**为了加快测试启动开了懒加载，结果把框架自带的 SQL 初始化一起懒掉了**——建表脚本没执行，测试当然全挂。解法是复制一份配置并标上 `@Lazy(false)` 强制提前执行。

这是一个非常有代表性的坑：**性能优化手段与框架隐式行为冲突时，报错信息通常不会指向真正的原因。**

### 5.2 基类里写下的设计取舍

这个基类的注释里还有一句更值钱的话：

> 对于 Service 层的单元测试，我们针对自己模块的 Mapper 走的是 H2 内存数据库，针对别的模块的 Service 走的是 Mock 方法。

这句话把「**一半真、一半假**」的策略讲清楚了，也正是第四篇要展开的取舍：

- **自己模块的 Mapper 用真库**——因为 SQL、字段、多租户条件必须真跑
- **别的模块的 Service 用 Mock**——因为那是另一个模块的职责，测它就是把别人的测试抄一遍

比「全 Mock」和「全真库」都更实际。

## 六、事务与数据管理 {#data}

### 6.1 `@Transactional` 回滚：方便，但有代价

```java
@SpringBootTest
@Transactional          // 每个测试方法后自动回滚
class UserServiceTest { }
```

它确实省事，但有两个副作用：

1. **测试里的事务永远不真正提交**——依赖「提交后触发」的机制（事务同步回调、`AFTER_COMMIT` 事件监听、触发器）测不出来
2. **生产上会因为「非事务执行」出错的地方，测试里看不出来**——比如在只读事务里做写操作

所以：**验收性、集成性的测试不要靠 `@Transactional` 回滚**，用 `@Sql` 显式清理更诚实。

### 6.2 `@Sql` 的正确用法

```java
// 类级：每个方法前后各跑一次
@Sql(scripts = "/sql/schema.sql", executionPhase = BEFORE_TEST_METHOD)
@Sql(scripts = "/sql/clean.sql",  executionPhase = AFTER_TEST_METHOD)

// 方法级：只给特定测试准备特定数据
@Sql("/sql/user-vip.sql")
@Test
void vip用户打八折() { }
```

`AFTER_TEST_METHOD` 清理相对 `BEFORE` 更稳——**前一个测试留下的脏数据不会影响下一个**；用 `BEFORE` 清理时，最后一个测试的数据会残留到套件结束。

### 6.3 测试数据别硬编码到 SQL 里

大量测试需要「一个正常用户 + 一个 VIP 用户 + 一个禁用用户」。把建数据封装成工厂方法（或用一个测试专用的 `DataBuilder`），比每个测试类抄一份 SQL 更容易维护：

```java
User vip = userFactory.vip().withBalance(200).create();
```

> 数据准备代码的可维护性，往往决定了一个测试套件能活多久。

## 七、上下文缓存：为什么有的测试飞快、有的奇慢 {#context-cache}

Spring TestContext Framework 会用一张**上下文缓存**复用已经启动的容器。缓存键由这些因素共同决定：

| 参与缓存键的 | 例子 |
|---|---|
| 配置类 / locations | `classes = ...`、`@ContextConfiguration` |
| 激活的 profile | `@ActiveProfiles("unit-test")` |
| 属性源 | `@TestPropertySource`、`@DynamicPropertySource` |
| **上下文定制器** | **`@MockitoBean` / `@MockBean` 定义的 mock 集合**、`@AutoConfigureMockMvc` 等 |
| 初始化器 | `ContextCustomizer`、`ApplicationContextInitializer` |

**含义**：只要上面任一项不同，就是一个**新的上下文**（= 重新启动一次容器）。

### 7.1 常见「缓存失效」的写法

| 写法 | 后果 |
|---|---|
| 每个测试类声明不同的 `@MockitoBean` 组合 | 每个类一个新上下文 |
| 用 `@DirtiesContext` 收尾 | 主动标记上下文脏，后续测试重启 |
| `@TestPropertySource` 每个类写不同属性 | 各自新上下文 |
| `@MockBean`（旧）散落各处 | 同上，且组合越碎缓存命中率越低 |

**优化手段**：把公共 mock 提到父类 / 组合注解，保持组合一致；只在真正必要时用 `@DirtiesContext`。

### 7.2 观察缓存行为

```properties
# 让日志打出上下文缓存的使用情况
logging.level.org.springframework.test.context.cache=DEBUG
# 需要时调整缓存上限（默认 32）
-Dspring.test.context.cache.maxSize=32
```

当套件里上下文数量接近上限时，会出现**「最早的上下文被淘汰，后面的又需要它 → 反复重建」**的情况。这时现象是「没有任何改动，测试却越跑越慢」——值得排查。

## 八、常见坑 {#pitfalls}

1. **习惯性用 `@SpringBootTest` 默认配置**：不涉及 Web 时白起 Web 容器；能用切片时白装全量 Bean。
2. **升级到 Boot 4.0 后 `@MockBean` 编译失败**：改为 `@MockitoBean`；注意**不能用在 `@Configuration` 上**，共享 mock 要挪到测试类或组合注解。
3. **`@SpringBootTest` 里注入 `MockMvc` 得到 `null`**：Boot 4.0 起不再隐式装配，需加 `@AutoConfigureMockMvc`。
4. **Mock 组合不统一导致上下文暴增**：`@MockitoBean` 参与缓存键，碎片化会让测试套件变慢。
5. **只断言状态码**：HTTP 契约里最重要的响应体结构和字段类型没被验证。
6. **`@Transactional` 回滚掩盖了非事务问题**：涉及提交后回调、只读事务校验的路径测不出来。
7. **`@Sql` 只写 `BEFORE_TEST_METHOD`**：最后一个测试的残留数据会跨套件累积。
8. **`@DirtiesContext` 当清场万能药**：它让后续测试重启容器，通常有更好的解法（改数据清理方式）。
9. **切片测试中断言了切片外的东西**：比如 `@WebMvcTest` 里断言数据库状态——那个 Bean 根本不在容器里。
10. **测试类里用 `@MockitoBean` 顶掉一整层，却断言了那层的行为**：那是把「你要验证的东西」Mock 掉了。

## 九、面试口径 {#interview}

1. **Spring Boot 测试为什么慢？怎么优化？** 慢在**容器启动**而不是 JVM。优化三步：能用切片就切片（`@WebMvcTest` / `@DataJpaTest`）；不涉及 Web 就 `webEnvironment = NONE`；保持上下文缓存键一致（统一 profile、统一 mock 组合）以提高复用率。
2. **`@SpringBootTest` 和切片测试的本质区别？** 切片只装配「一层需要的自动配置」，`@SpringBootTest` 装配整个应用。所以切片快、但只适合验证层内行为；跨层的东西（事务边界、多租户隔离、消息投递）必须用 `@SpringBootTest`。
3. **`webEnvironment` 的四个值怎么选？** `MOCK`（默认，配 MockMvc）、`RANDOM_PORT`（真实容器，测过滤器链/序列化/超时）、`DEFINED_PORT`（少用，易冲突）、`NONE`（不起 Web，最快）。
4. **MockMvc 和真实 HTTP 请求的差别？** MockMvc 直接调 `DispatcherServlet`，绕过真实网络与 Servlet 容器，所以更快但会漏掉容器级行为（CORS、压缩、真实连接超时、部分过滤器的执行条件）。需要验证这些时用 `RANDOM_PORT`。
5. **`@MockBean` 和 `@MockitoBean` 什么关系？** `@MockBean` / `@SpyBean` 在 Boot 3.4 弃用、**Boot 4.0 移除**，对应替代是 `@MockitoBean` / `@MockitoSpyBean`。一个关键差异：新注解只能用于测试类字段，**不能用于 `@Configuration`**——共享 mock 要改成注解在测试类上或自定义组合注解。
6. **为什么加了 `@MockitoBean` 之后测试变慢了？** mock 定义参与上下文缓存键。不同测试类的 mock 组合不同 → 各自启动一个新上下文。统一组合（或提到父类）可以恢复缓存命中。
7. **`@Transactional` 回滚有什么问题？** 测试事务永不真正提交，所以依赖提交后回调的机制（事务同步、`AFTER_COMMIT` 事件、触发器）验证不到；同时会掩盖「生产非事务执行」才会出现的错误。集成性测试建议用 `@Sql` 显式清理。
8. **`@DirtiesContext` 什么时候用？** 只在「容器状态确实被污染且无法局部清理」时用（例如改动了 Bean 定义、缓存了不可重置的静态状态）。它是重手段——会让后续测试重新启动上下文。
9. **测试数据怎么准备比较好？** 用工厂/建造者方法封装常用组合（普通用户、VIP、禁用用户），而不是每个类抄一份 SQL；清理放 `AFTER_TEST_METHOD`，避免残留累积。
10. **怎么判断该不该用切片？** 问「我要验证的行为在哪一层」。只在 Controller 内（路由/绑定/校验/序列化）→ 切片；跨过层边界（事务、租户、缓存一致性）→ 只能全量启动。

> 下一篇处理切片测不到的那部分：**真依赖怎么起、怎么隔离、怎么压成本**——[集成测试与真实依赖](/java/testing/integration-test)。
