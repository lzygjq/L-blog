---
order: 8
date: 2026-09-13
sidebar: 注解速查
title: 注解速查与辨析
desc: Spring / Spring MVC / Spring Boot 三层注解分类整理，附易混注解对比与候选注入优先级
---

# 注解速查与辨析

## 一、怎么记才不是死记硬背

Spring 生态的注解有上百个，平铺着背既记不住也没用。**按"注解在解决什么问题"分类，记忆量会立刻降下来**——因为它们绝大多数都能归到五件事上：

```
① 把自己交给容器       @Component / @Service / @Bean / @Controller
② 向容器要依赖         @Autowired / @Qualifier / @Resource / @Value
③ 告诉容器怎么给       @Scope / @Lazy / @Primary
④ 配置与条件装配       @Configuration / @ConditionalOnXxx / @ConfigurationProperties
⑤ 声明式行为           @Transactional / @Async / @Cacheable / @Aspect（靠 AOP 生效）
```

**记住分类的收益**：面试问到不认识的注解，也能通过"它属于哪一类"推断作用。比如看到 `@ConditionalOnMissingBean`，判断属于④条件装配，就知道它是在控制"什么时候注册这个 Bean"。

## 二、把对象交给容器

| 注解 | 作用 | 为什么需要它 |
|---|---|---|
| **`@Component`** | 通用组件标记，被组件扫描发现后注册为 Bean | 最基础的"注册"手段 |
| **`@Controller`** | `@Component` 的语义化特化 | 标记 Web 层；让 `DispatcherServlet` 知道它是 Handler 来源 |
| **`@Service`** | `@Component` 的语义化特化 | 标记业务层，**纯语义**，功能上与 `@Component` 无差别 |
| **`@Repository`** | `@Component` 的语义化特化 | 标记持久层，**额外能力：把持久层异常翻译为 `DataAccessException`** |
| **`@RestController`** | `@Controller` + `@ResponseBody` | 声明"整个类的方法都返回数据而非视图" |
| **`@Bean`** | 标在**方法**上，返回值注册为 Bean | 注册**第三方类**（无法改源码加 `@Component`）或需手工构造的对象 |
| **`@Import`** | 导入配置类 / `ImportSelector` / `ImportBeanDefinitionRegistrar` | 框架作者用它把"不该被扫到的类"装配进来（`@EnableXxx` 的底层机制） |
| **`@ComponentScan`** | 指定扫描的包路径 | 默认只扫启动类所在包及子包，跨模块时需显式声明 |

**四个"语义化特化"注解的功能差异极小**——`@Service` 与 `@Component` 在容器看来完全等价。它们存在的意义是**分层语义**：让代码自解释，也让 AOP 切点可以用 `@within(org.springframework.stereotype.Service)` 精确匹配某一层。**`@Repository` 是唯一有额外功能的**（异常翻译）。

### `@Component` vs `@Bean`——最高频的对比题

| 维度 | `@Component` | `@Bean` |
|---|---|---|
| 标注位置 | **类**上 | **方法**上（通常在 `@Configuration` 类中） |
| 生效方式 | 组件扫描发现 | 方法被调用时返回对象 |
| 适用对象 | **自己写的类** | **第三方类**、需要复杂构造逻辑的对象 |
| Bean 名称 | 类名首字母小写（可指定 `value`） | **方法名** |
| 能否条件化 | 需配合 `@Conditional`（作用在类上，粒度粗） | 可精确控制（方法级、可读参数、可写逻辑） |

**判断标准**：类是自己写的、能被扫描到 → 用 `@Component`；类是第三方的（如 `RedisTemplate`、`DataSource`）、或创建过程需要条件判断和复杂装配 → 用 `@Bean`。

## 三、向容器要依赖

| 注解 | 作用 |
|---|---|
| **`@Autowired`** | **按类型**注入；可标在构造器、Setter、字段上。`required = false` 允许找不到时留空 |
| **`@Qualifier`** | 配合 `@Autowired` **按名称**筛选，解决"同类型多个候选" |
| **`@Resource`** | JSR-250 标准注解，**默认按名称**注入，找不到再退化为按类型 |
| **`@Value`** | 注入配置值（`${...}` 占位符）或 SpEL 表达式（`#{...}`） |
| **`@Primary`** | 标在 Bean 定义上，同类型多候选时**默认优先选它** |
| **`@Lazy`** | 延迟初始化 / 在注入点注入代理以打破循环依赖 |

### 同类型多个候选时，Spring 怎么选

这是 `@Autowired` 最核心的追问。**优先级从高到低：**

```
① @Primary 标记的 Bean                      ← 显式声明的"默认选择"
      ↓ 没有 @Primary
② @Priority 数值最小的                       ← JSR-250 标准，少用
      ↓ 没有
③ @Qualifier 指定的名称                      ← 调用方显式筛选
      ↓ 没有
④ 字段名 / 参数名 与 Bean 名称匹配            ← 隐式约定，靠"名字对上了"
      ↓ 都没有
⑤ 抛 NoUniqueBeanDefinitionException        ← 必须显式指定，否则启动失败
```

**第 ④ 条容易被忽略但很实用**：`private UserDao userDao;` 会优先匹配名为 `userDao` 的 Bean。**但它也是隐患**——重命名字段就可能悄悄改变注入目标。生产代码建议**显式用 `@Qualifier`**，让意图清晰。

### `@Autowired` vs `@Resource`

| 维度 | `@Autowired` | `@Resource` |
|---|---|---|
| 来源 | Spring 自有 | **JSR-250 标准**（`jakarta.annotation`） |
| 匹配策略 | **先按类型** | **先按名称**，找不到再按类型 |
| 支持 `@Qualifier` | ✅ | ✅（但部分行为不一致） |
| 推荐度 | **官方推荐**（与 Spring 生态一致） | 需要"按名字"语义时可用 |

**实践中统一用 `@Autowired` 即可**——Spring 团队的立场是 `@Resource` 的"按名称优先"语义容易与类型注入混淆。**唯一需要 `@Resource` 的场景是框架无关性要求**（如代码要在非 Spring 容器中复用）。

### 构造器注入：唯一可以省掉 `@Autowired` 的写法

```java
@Service
public class OrderService {
    private final OrderDao orderDao;

    // ✓ 单构造器时 @Autowired 可省略（Spring 4.3+）
    public OrderService(OrderDao orderDao) { this.orderDao = orderDao; }
}
```

**为什么推荐构造器注入**（见 [IoC 与生命周期](/java/spring/spring-framework/ioc-container)）：依赖可 `final`、不存在半初始化状态、依赖关系显式、脱离容器可单测。**代价是无法解决构造器循环依赖**——但这通常说明设计有问题，暴露出来是好事。

## 四、告诉容器怎么给

| 注解 | 作用 | 注意 |
|---|---|---|
| **`@Scope`** | 指定作用域 | 默认 `singleton`；`prototype` 注入单例会失效，见 [作用域与线程安全](/java/spring/spring-framework/bean-scope) |
| **`@Lazy`** | 延迟创建 | 标在类上 = 该 Bean 懒加载；标在注入点 = 注入代理打破循环依赖 |
| **`@Primary`** | 候选优先 | 与 `@Qualifier` 是"全局默认"与"局部指定"的关系 |
| **`@DependsOn`** | 强制创建顺序 | 目标 Bean 必须先于当前 Bean 初始化（一般用不到，需要时通常说明设计有问题） |

## 五、配置类与条件装配

### `@Configuration` vs `@Component`——一个容易被低估的差异

两者都能注册 Bean 方法，但有一个**行为差异**：

```java
@Configuration                              // proxyBeanMethods = true（默认）
public class AppConfig {
    @Bean public A a() { return new A(); }
    @Bean public B b() { return new B(a()); }   // ✓ 返回的是容器中的同一个 A（CGLIB 拦截）
}
```

```java
@Component                                  // 不生成 CGLIB 代理
public class BadConfig {
    @Bean public A a() { return new A(); }
    @Bean public B b() { return new B(a()); }   // ✗ 直接调方法 → 又 new 了一个 A！
}
```

`@Configuration` **默认会用 CGLIB 生成子类**，拦截 `@Bean` 方法的调用并转发给容器——因此 `a()` 在类内部被调用时返回的仍是**容器中的单例**。`@Component` 没有这层代理，内部调用就是普通方法调用，会**创建出多个实例**。

**实践建议**：需要 `@Bean` 方法之间互相调用时必须用 `@Configuration`；如果确定不会互相调用，可用 `@Configuration(proxyBeanMethods = false)` 关闭代理以**加快启动**（Spring Boot 内部的自动配置类全部这么做了）。

| 注解 | 作用 |
|---|---|
| **`@ConditionalOnClass`** | classpath 存在指定类才生效（Starter 自动配置的基础） |
| **`@ConditionalOnMissingBean`** | 容器中**不存在**该类型 Bean 才生效（**允许用户自定义覆盖默认配置**） |
| **`@ConditionalOnProperty`** | 配置项满足条件才生效（如 `feature.enabled=true`） |
| **`@ConditionalOnBean`** | 存在指定 Bean 才生效 |
| **`@ConfigurationProperties`** | 把配置批量绑定到 POJO（**推荐替代 `@Value`**） |
| **`@EnableConfigurationProperties`** | 让 `@ConfigurationProperties` 类被注册为 Bean |

**`@ConfigurationProperties` vs `@Value`**：

| 维度 | `@Value("${a.b}")` | `@ConfigurationProperties(prefix = "a")` |
|---|---|---|
| 绑定粒度 | 单个字段 | **整个 POJO 批量绑定** |
| 松散绑定 | ❌ 必须精确匹配 | ✅ `a-b-c` / `aBc` / `A_BC` 都能绑定 |
| 复杂类型 | 表达力有限 | ✅ List / Map / 嵌套对象 |
| 校验 | 需配合 `@Validated` 逐字段 | ✅ 配合 `@Validated` 直接校验 POJO |
| 适用 | 零散的一两个值 | **成组的配置（推荐）** |

## 六、Spring MVC 注解

| 注解 | 作用 |
|---|---|
| **`@RequestMapping`** | 路径映射，可限定 `method` / `consumes` / `produces` / `headers` |
| **`@GetMapping` / `@PostMapping`** 等 | `@RequestMapping` 的语义化简写，**自带 `method` 限定** |
| **`@PathVariable`** | 取 URL 路径模板变量（`/order/{id}`） |
| **`@RequestParam`** | 取查询串 / 表单参数 |
| **`@RequestBody`** | 取**请求体**并交给 `HttpMessageConverter` 反序列化（JSON → 对象） |
| **`@ResponseBody`** | 把返回值作为响应体序列化，**不经过视图解析** |
| **`@RequestHeader` / `@CookieValue`** | 取请求头 / Cookie |
| **`@RestControllerAdvice`** | `@ControllerAdvice` + `@ResponseBody`，全局异常/数据绑定处理 |
| **`@ExceptionHandler`** | 声明处理哪种异常 |
| **`@Valid` / `@Validated`** | 触发参数校验（Bean Validation） |

### 三组必考辨析

**① `@RequestParam` vs `@PathVariable`**

```java
@GetMapping("/orders/{id}")                                        // {id} 是路径的一部分
public Order get(@PathVariable Long id,                            // ← 取 /orders/123 中的 123
                 @RequestParam(required = false) String fields) {   // ← 取 ?fields=name
    ...
}
```

| 维度 | `@RequestParam` | `@PathVariable` |
|---|---|---|
| 数据来源 | 查询串 `?k=v` / 表单 | URL 路径模板 `{id}` |
| REST 语义 | 过滤、分页、排序等**条件** | **资源标识** |
| 可否省略 | 参数名一致时可省略注解 | **不可省略**（必须标注） |

**② `@RequestBody` vs `@RequestParam`**

| 维度 | `@RequestBody` | `@RequestParam` |
|---|---|---|
| 数据位置 | 请求体（Body） | URL / 表单 |
| 内容类型 | `application/json` 等 | `application/x-www-form-urlencoded` |
| 处理者 | `HttpMessageConverter` | `ArgumentResolver` 直接取值 |
| 数量限制 | **一个方法只能一个** | 可多个 |

**忘了加 `@RequestBody` 是最常见的 400 / 字段全 null 来源**——此时 Spring 会走无注解的"属性绑定"路径，从请求参数里找字段，而 JSON body 里的内容根本不在请求参数中。

**③ `@Controller` vs `@RestController`**

```java
@Controller
public class A {
    @GetMapping("/a") public String a() { return "index"; }        // → 走 ViewResolver，渲染 index 视图
    @GetMapping("/b") @ResponseBody public String b() { return "hi"; }  // → 直接返回 "hi" 文本
}

@RestController                                                     // = @Controller + @ResponseBody
public class B {
    @GetMapping("/c") public Order c() { return order; }            // → JSON 序列化
}
```

**踩坑提醒**：用 `@Controller` 返回对象却忘了加 `@ResponseBody`，会得到一个 404（Spring 拿类名去当视图名找了）。**现在写 API 一律用 `@RestController`。**

## 七、声明式行为注解（靠 AOP 生效）

这一类注解有一个**共同前提**：**必须有代理，且必须通过代理调用**。它们失效的场景是同一批——见 [AOP 与代理机制](/java/spring/spring-framework/aop)。

| 注解 | 背后的拦截器 | 易错点 |
|---|---|---|
| `@Transactional` | `TransactionInterceptor` | 默认只回滚 `RuntimeException` / `Error`；同类自调用失效 |
| `@Async` | `AsyncExecutionInterceptor` | 事务上下文不跨线程；返回值需为 `void` / `Future` |
| `@Cacheable` / `@CacheEvict` | `CacheInterceptor` | 同类自调用失效；key 设计需谨慎 |
| `@Aspect` / `@Pointcut` / `@Before` / `@Around` | — | 同切面内顺序受版本影响；多切面靠 `@Order` |
| `@PreAuthorize` / `@PostAuthorize` | `AuthorizationManagerBeforeMethodInterceptor` | 需 `@EnableMethodSecurity` |
| `@Validated` | `MethodValidationInterceptor` | 标在类上才校验方法参数 |

**一句话记忆**：这些注解**全部是"声明"，不是"实现"**——真正干活的是代理链上对应的 `MethodInterceptor`。所以排查"注解不生效"时，第一件事永远是**确认调用是否经过了代理对象**。

## 八、`@SpringBootApplication` 拆解

这个复合注解是 Spring Boot 注解体系的入口，由三个注解构成：

```java
@SpringBootApplication
  ├── @SpringBootConfiguration     // 本质就是 @Configuration，声明这是一个配置类
  ├── @ComponentScan               // 扫描启动类所在包及子包
  └── @EnableAutoConfiguration     // 自动配置的总开关
        ├── @AutoConfigurationPackage    // 把启动类所在包登记为自动配置的基础包
        └── @Import(AutoConfigurationImportSelector.class)   // 导入自动配置类清单
```

**关键就是 `@Import(AutoConfigurationImportSelector.class)`**——它负责把 classpath 下所有 Starter 提供的自动配置类"批量导入"。完整链路见 [Spring Boot 自动配置原理](/java/spring/spring-boot/)。

**两个实用推论**：

- **启动类必须放在最外层包**，否则 `@ComponentScan` 扫不到子包里的组件（默认只扫启动类所在包及其子包）。
- **需要额外扫描其他包时**，用 `@ComponentScan(basePackages = ...)` 扩展，或 `@Import` 别人的配置类。

## 九、面试问答

**Q1：`@Component`、`@Service`、`@Repository`、`@Controller` 有什么区别？**

`@Service` 和 `@Controller` 是 `@Component` 的**语义化别名**，功能上完全等价（容器一视同仁），作用是表达分层语义、并让 AOP 切点可以按层匹配。`@Repository` 除语义外**还有实际功能：它会启用持久层异常翻译**，把 JDBC / JPA 的原生异常转成 Spring 统一的 `DataAccessException` 体系——这是它与其他三个的实质差异。

**Q2：`@Component` 和 `@Bean` 怎么选？**

`@Component` 标在**类**上，靠组件扫描生效，适用于**自己写的类**；`@Bean` 标在**方法**上，适用于**第三方类**（无法在源码上加注解）或**需要复杂构造逻辑、条件判断**的对象。另外 `@Bean` 的 Bean 名称是方法名，粒度更细、可条件化（配合 `@ConditionalOnXxx`），而 `@Component` 的条件只能作用在类级。

**Q3：同类型的多个 Bean，`@Autowired` 会注入哪个？**

按优先级：① `@Primary` 标记的；② `@Priority` 数值最小的；③ `@Qualifier` 显式指定的名称；④ 字段名/参数名与 Bean 名称匹配的；⑤ 都不满足则抛 `NoUniqueBeanDefinitionException`。**建议显式用 `@Qualifier`**——依赖字段名的隐式匹配一旦重命名就可能改变注入目标。

**Q4：`@Autowired` 和 `@Resource` 的区别？**

`@Autowired` 是 Spring 自有注解，**按类型注入**，可配合 `@Qualifier` 按名称筛选；`@Resource` 是 JSR-250 标准注解，**默认按名称注入**，找不到同名的再按类型兜底。实践中统一用 `@Autowired`（与 Spring 生态一致）；只有需要框架无关性时才选 `@Resource`。

**Q5：`@Configuration` 和 `@Component` 都能定义 `@Bean`，有区别吗？**

有实际差别。`@Configuration` **默认（`proxyBeanMethods = true`）会用 CGLIB 生成子类**，拦截类内部对 `@Bean` 方法的调用并转发给容器，因此 `b()` 里调用 `a()` 拿到的是**容器中的同一个单例**；`@Component` 没有这层代理，内部调用就是普通方法调用，会**重复创建实例**。所以需要 `@Bean` 方法互相调用时必须用 `@Configuration`；确定不互相调用时可用 `@Configuration(proxyBeanMethods = false)` 关闭代理加快启动。

**Q6：`@RequestParam` 和 `@PathVariable` 分别用在什么场景？**

`@PathVariable` 取 URL 路径模板中的变量（`/orders/{id}` 里的 `id`），对应**资源标识**；`@RequestParam` 取查询串或表单参数（`?status=1&page=2`），对应**过滤、分页、排序等条件**。两者的数据来源、解析器、REST 语义都不同——`@PathVariable` 不能省略注解，`@RequestParam` 在参数名一致时可省略。

**Q7：不加 `@RequestBody` 会有什么问题？**

Spring 会走无注解的**属性绑定**路径（`ServletModelAttributeMethodProcessor`），从**请求参数**中按字段名逐个 set，而不是解析请求体。当前端发送 JSON（`Content-Type: application/json`）时，请求参数里没有对应字段，结果是一个**字段全为 null 的对象**，或直接 400 错误。**规则：接收 JSON 请求体必须加 `@RequestBody`，且一个方法只能有一个。**

**Q8：`@ConfigurationProperties` 和 `@Value` 怎么选？**

零散的一两个配置值用 `@Value`；**成组的配置一律用 `@ConfigurationProperties`**。后者支持批量绑定到 POJO、支持松散绑定（`a-b-c` / `aBc` / `A_BC` 都能映射）、支持 List / Map / 嵌套对象等复杂类型，配合 `@Validated` 还能直接做配置校验。`@Value` 必须精确匹配键名，表达力也有限。
