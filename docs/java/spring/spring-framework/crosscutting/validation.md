---
date: 2026-09-16
title: 参数校验与统一异常：从两条异常链到 RFC 9457
sidebar: 校验与异常
order: 4
desc: 参数校验：@Valid 与 @Validated 的分工、分组校验、嵌套级联、方法级校验、两条异常链（MethodArgumentNotValidException vs ConstraintViolationException）、ProblemDetail 与 RFC 9457、@ControllerAdvice 匹配顺序、错误响应设计原则、七类校验失效
---

# 参数校验与统一异常：从两条异常链到 RFC 9457

校验这件事有个奇怪的现象：**它是每个项目都会做的事，却是最缺少统一约定的部分**。十个项目里有八种错误响应格式——`{"code":500,"msg":"参数错误"}`、`{"error":"invalid"}`、`{"success":false,"errors":[...]}`，客户端每接一个新接口就要写一套新的错误解析逻辑。

**更根本的问题是：校验失败的两条路径产生了两种不同的异常**，而大多数人只处理了其中一条——于是"JSON 参数的校验错误格式很规范，但路径参数的校验错误直接吐了 500"。

> **主线：参数校验的复杂度不在"怎么校验"，而在"错误怎么统一地报告出去"。**
>
> 注解本身很简单（`@NotNull`、`@Size`、`@Pattern`），难点在三处：**分组**（同一 DTO 在不同场景下规则不同）、**级联**（嵌套对象要显式声明才校验）、**统一**（两条异常链、多种错误来源，要收敛成一种响应）。
>
> 前两处决定"校验有没有真的执行"，第三处决定"失败时客户端看到什么"。

## 一、问题场景：两条异常链，一个响应体 {#why-validation}

同样的"参数不合法"，Spring 会抛出**两种完全不同的异常**：

| 参数来源 | 触发方式 | 抛出的异常 | 携带的信息 |
|---|---|---|---|
| **请求体**（JSON） | `@Valid @RequestBody` | `MethodArgumentNotValidException` | `BindingResult`：字段名、拒绝值、消息 |
| **路径/查询参数** | 类上 `@Validated` + 参数上约束注解 | `ConstraintViolationException` | `ConstraintViolation`：**属性路径**、约束元数据 |

两者**结构迥异**，无法用一个 `@ExceptionHandler` 处理。如果只处理了前者，后者的表现是**HTTP 500**——因为在 `@RestControllerAdvice` 里找不到匹配的处理器，它会被当成未捕获异常。

这正是"为什么统一异常处理总是漏掉一半"的原因。第七节给出统一两者的写法。

## 二、`@Valid` 与 `@Validated`：来源不同，能力不同 {#valid-vs-validated}

这两个注解经常被混用，但它们的**来源和职责**完全不同：

| | `@Valid` | `@Validated` |
|---|---|---|
| 出处 | **Jakarta Bean Validation 标准**（`jakarta.validation.Valid`） | **Spring 自己**（`org.springframework.validation.annotation.Validated`） |
| 指定分组 | ❌ **不支持** | ✅ `@Validated(Group.class)` |
| 加在**类**上 | ❌ 无意义 | ✅ **触发方法级校验** |
| 加在字段上触发级联 | ✅ | ✅（但标准做法用 `@Valid`） |
| 失败时的异常 | `MethodArgumentNotValidException` | 视位置而定（见下） |

**三条实用规则**：

**① 校验请求体，用 `@Valid`。** 这是最标准的写法，与框架无关：

```java
@PostMapping("/users")
public UserVO create(@Valid @RequestBody CreateUserRequest req) { ... }
```

**② 校验路径/查询参数，需要在类上加 `@Validated`。** 因为方法级校验需要一个"被 Spring 代理的 Bean"，而 `@Validated` 加在类上正是这个开关：

```java
@RestController
@Validated                                        // ← 加在类上，开启方法级校验
public class UserController {

    @GetMapping("/users/{id}")
    public UserVO get(@PathVariable @Min(1) Long id) { ... }   // 无 @Validated 时这个约束不生效
}
```

**③ 需要分组时，只能用 `@Validated`。** 这是它相对 `@Valid` 唯一的"超集"能力（见下一节）。

**一个常见的错误写法**是给请求体同时加两个注解，或者在被调用的 Service 方法上加 `@Valid` 却没在类上加 `@Validated`——**后者不会报错，只是约束被静默忽略**。

## 三、分组校验：同一 DTO，不同场景 {#groups}

典型场景：创建时 `id` 必须为空（由系统生成），更新时 `id` 必须非空。

```java
public interface Create {}          // 标记接口，无需任何方法
public interface Update {}

public class UserRequest {
    @Null(groups = Create.class, message = "创建时不能指定 id")
    @NotNull(groups = Update.class, message = "更新时必须指定 id")
    private Long id;

    @NotBlank(groups = {Create.class, Update.class})
    private String name;
}
```

```java
@PostMapping("/users")
public UserVO create(@Validated(Create.class) @RequestBody UserRequest req) { ... }

@PutMapping("/users")
public UserVO update(@Validated(Update.class) @RequestBody UserRequest req) { ... }
```

### 3.1 分组的两条"反直觉"规则 {#group-rules}

**规则一：约束不写 `groups` 时属于 `Default` 分组；一旦指定了某个分组，它就不再属于 `Default`。**

```java
@Validated(Create.class) @RequestBody UserRequest req
// 只会校验标记为 Create 的约束，Default 分组的约束不生效
```

所以如果 `name` 上只写了 `@NotBlank`（无 groups），上面的写法**不会校验 name**。这就是"加了分组之后一些校验突然失效"的原因。

**规则二：分组没有继承关系，但接口可以扩展。**

```java
public interface Create extends Default {}      // 让 Create 也包含 Default 的约束
```

这样 `@Validated(Create.class)` 会**同时**校验 `Create` 分组和 `Default` 分组的约束。这是"分组导致校验丢失"的标准解法。

**分组最容易被用坏的地方是"分组爆炸"**——为每个接口定义一个分组，最后 DTO 上挂满了注解。**如果分组超过 2~3 个，通常说明应该拆 DTO**，而不是继续加分组。

## 四、级联校验：嵌套对象不会自动校验 {#cascade}

**这是一个高频失效点**：外层对象加了 `@Valid`，但嵌套对象的字段没被校验。

```java
public class OrderRequest {
    @Valid                          // ← 必须显式加，否则 items 内部的约束不生效
    @NotEmpty
    private List<OrderItem> items;

    @Valid                          // ← 同上
    @NotNull
    private Address address;
}
```

| 写法 | 嵌套对象的约束 |
|---|---|
| `private List<OrderItem> items;` | ❌ **完全不校验** |
| `@NotNull private List<OrderItem> items;` | ❌ 只校验"不是 null"，**不校验元素内部** |
| `@Valid @NotNull private List<OrderItem> items;` | ✅ 校验每个元素 |
| `@Valid @NotEmpty private List<OrderItem> items;` | ✅ 校验非空 + 每个元素 |

**规则是：`@Valid` 的作用是"把校验往下传递一层"**，它必须写在**嵌套字段**上，而不是只写在外层参数上。外层 `@Valid @RequestBody` 只负责进入这个对象，能不能继续往下走取决于字段上有没有 `@Valid`。

**`List` 的校验还有一个细节**：`@Valid` 会逐元素校验，但**报错时的字段路径是 `items[0].quantity` 这种形式**——前端要能解析这种路径，或者需要做一次转换（见第九节）。

## 五、方法级校验：不只在 Controller 层 {#method-validation}

约束注解**不限于 Controller**。Service 层的公开方法参数同样可以加约束：

```java
@Service
@Validated                                       // ← 类上加，开启方法级校验
public class TransferService {

    @Transactional
    public void transfer(@NotNull @Positive BigDecimal amount, @NotNull String toAccount) {
        // 如果这个方法被"绕过 Controller"的地方调用（定时任务、MQ 消费、内部调用），
        // 校验依然生效——这是把校验下沉到 Service 的价值
    }
}
```

**方法级校验的两条边界**：

| 边界 | 说明 |
|---|---|
| **抛出的异常不同** | 抛 `ConstraintViolationException`，**不是** `MethodArgumentNotValidException`——这就是"两条异常链"的来源 |
| **不能用于自调用** | 与所有注解一样，**同类内部调用不走代理**，校验会失效 |

**第二条尤其要注意**：`@Validated` 加在类上之后，**这个方法所在的 Bean 被代理了**。如果内部代码用 `this.transfer(...)` 调用，校验不会执行。这是"Service 层校验没生效"的常见原因。

> **版本提示**：Spring Framework 6.1 起，框架对方法级校验提供了更直接的支持，部分场景不再需要显式声明 `MethodValidationPostProcessor`。但**"类上加 `@Validated`"这个前提没有变**——它是让方法级校验拦截器生效的开关。

## 六、两条异常链：必须分开处理 {#two-exception-chains}

现在处理第一节留下的问题。完整的统一异常处理器需要**同时**捕获两类异常：

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** 请求体校验失败 —— 携带 BindingResult */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleBodyValidation(MethodArgumentNotValidException ex) {
        List<Map<String, Object>> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> Map.of(
                        "field", e.getField(),
                        "message", e.getDefaultMessage() == null ? "参数不合法" : e.getDefaultMessage(),
                        "rejectedValue", String.valueOf(e.getRejectedValue())))
                .toList();

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST, "请求体参数校验失败");
        problem.setTitle("Validation Failed");
        problem.setProperty("errors", errors);
        return problem;
    }

    /** 路径/查询参数校验失败 —— 携带 ConstraintViolation */
    @ExceptionHandler(ConstraintViolationException.class)
    public ProblemDetail handleParamValidation(ConstraintViolationException ex) {
        List<Map<String, Object>> errors = ex.getConstraintViolations().stream()
                .map(v -> Map.of(
                        // propertyPath 形如 "getUser.id" 或 "transfer.amount"，需从中取出字段名
                        "field", lastSegment(v.getPropertyPath().toString()),
                        "message", v.getMessage()))
                .toList();

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST, "请求参数校验失败");
        problem.setTitle("Validation Failed");
        problem.setProperty("errors", errors);
        return problem;
    }

    private String lastSegment(String path) {
        int dot = path.lastIndexOf('.');
        return dot < 0 ? path : path.substring(dot + 1);
    }
}
```

两类异常的**信息结构差异**是必须处理的：

| | `MethodArgumentNotValidException` | `ConstraintViolationException` |
|---|---|---|
| 取字段名 | `getFieldErrors()` → `getField()`（**直接是字段名**） | `getConstraintViolations()` → `getPropertyPath()`（**是方法路径，需截取**） |
| 拒绝值 | `getRejectedValue()` | `getInvalidValue()` |
| 消息 | `getDefaultMessage()` | `getMessage()` |

**`propertyPath` 的形态是个坑**：它取决于校验发生在哪个方法上——可能是 `getUser.id`、`transfer.amount`，也可能是 `arg0.id`（参数名丢失时）。所以**不要在前端做字符串匹配**，服务端应该统一截取成"纯字段名"再返回。

## 七、`ProblemDetail` 与 RFC 9457 {#problemdetail}

**Spring Framework 6 引入了 `ProblemDetail`**，它是 **RFC 7807（现为 RFC 9457）** 标准错误格式的 Java 映射：

```json
{
  "type": "https://api.example.com/problems/validation-error",
  "title": "Validation Failed",
  "status": 400,
  "detail": "请求体参数校验失败",
  "instance": "/api/users",
  "errors": [
    { "field": "email", "message": "邮箱格式不正确", "rejectedValue": "abc@" }
  ]
}
```

| 字段 | 必填 | 语义 | 设计要点 |
|---|---|---|---|
| `type` | ✅ | 标识**问题类别**的 URI | **客户端应该基于它分支**，不要匹配 `title` 字符串 |
| `title` | ✅ | 该类别的简短摘要 | 可本地化、可改写，**不适合做判断依据** |
| `status` | ✅ | HTTP 状态码 | 冗余但方便客户端 |
| `detail` | ❌ | 本次问题的具体说明 | —— |
| `instance` | ❌ | 本次问题的 URI | 便于日志关联 |
| 扩展成员 | ❌ | 如 `errors`、`orderId` | RFC 明确允许，**客户端应忽略不认识的成员** |

**三个关键设计点**：

**① 用 `type` 而不是 `title` 做分支。** `title` 是给人看的（会改措辞、会本地化），`type` 是给机器看的稳定标识。客户端写 `if (title === "验证失败")` 迟早会破。

**② 扩展成员是这个标准的精髓。** 标准只规定了 5 个通用字段，**业务上下文通过扩展成员承载**（余额不足时带上 `balance` 和 `required`），客户端不用再去解析 `detail` 里的自然语言。

**③ 响应媒体类型是 `application/problem+json`**，Spring 在返回 `ProblemDetail` 时会自动设置。

### 7.1 让框架异常也自动变成 `ProblemDetail` {#auto-problemdetail}

默认情况下，只有你自己 `return ProblemDetail` 或从 `@ExceptionHandler` 返回时才走这个格式。框架内部抛出的异常（如 404、405）需要一行配置开启：

```yaml
spring:
  mvc:
    problemdetails:
      enabled: true
```

开启后，Spring MVC 的内建异常（找不到处理器、方法不支持、媒体类型不支持等）都会以 `application/problem+json` 返回。**它只影响框架异常，不影响你自己抛的业务异常**——业务异常仍需在 `@RestControllerAdvice` 里处理。

> **不要重复处理**：如果自定义的 `@RestControllerAdvice` 继承了 `ResponseEntityExceptionHandler`，你只需覆写需要改变行为的方法（如 `handleMethodArgumentNotValid`），其余框架异常的默认实现会走 `ProblemDetail`。

## 八、`@ControllerAdvice` 的匹配顺序 {#advice-order}

同一个异常如果有多个处理器能匹配，Spring 的选择规则是：

| 优先级 | 规则 | 示例 |
|---|---|---|
| 1 | **异常类型越具体越优先** | `NullPointerException` 优先于 `RuntimeException` |
| 2 | 多个 `@ControllerAdvice` 之间，用 **`@Order`** 决定 | `@Order(1)` 先于 `@Order(2)` |
| 3 | 同一个类内，**精确类型匹配优先于 `Exception.class`** | 兜底处理器放最后 |

**一个典型问题：兜底处理器把特定异常吃掉了。**

```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(Exception.class)                 // 兜底
    public ProblemDetail handleAll(Exception ex) { ... }
}
```

`Exception.class` 的处理器**优先级最低**（因为它是"最不具体"的），所以不会吃掉更具体的处理器。**但如果把业务异常包成了同一个类型**（例如所有业务异常都转成 `BusinessException`），那么具体的错误就分不出来了——`type` 字段永远是同一个值。

**实践建议**：业务异常按"客户端需要区别对待的粒度"分类（参数错、未找到、冲突、业务规则拒绝），而不是按代码模块分类。

## 九、错误响应的设计原则 {#response-design}

| 原则 | 做法 | 反面例子 |
|---|---|---|
| **不暴露内部结构** | 返回统一的 `detail` 文案 | 直接返回堆栈、类名、SQL 片段 |
| **字段级错误要给全** | 一次返回**所有**失败的字段 | 只返回第一个错误，客户端要反复提交 |
| **`type` 稳定、`title` 可变** | 客户端基于 `type` 分支 | 客户端匹配中文文案 |
| **区分"参数错"和"业务拒绝"** | 前者 400，后者 422 / 409 | 全都返回 400 或 500 |
| **携带可执行的上下文** | 余额不足带上 `balance` / `required` | 只给一句"操作失败" |

**第一行值得展开**：异常消息直接透传给客户端是**信息泄露**——`SQLIntegrityConstraintViolationException` 里往往带着表名、列名、唯一索引名。这与[错误响应不要暴露内部结构](/java/spring/spring-boot/web-server#no-stacktrace)是同一个原则：**对外文案与对内日志分离**。

```java
// ❌ 把异常消息直接透传
problem.setDetail(ex.getMessage());

// ✅ 对外给固定文案 + 错误码，对内打完整堆栈
problem.setDetail("订单状态不允许该操作");
problem.setProperty("type", "https://api.example.com/problems/invalid-order-state");
log.warn("订单状态非法 orderId={} status={}", orderId, status, ex);
```

**第四行的状态码分档**建议：

| 状态码 | 语义 | 例子 |
|---|---|---|
| 400 | **格式/语法错**（参数本身不合法） | 邮箱格式错、必填为空 |
| 401 / 403 | 认证 / 授权 | —— |
| 404 | 资源不存在 | —— |
| 409 | **状态冲突**（并发修改、重复提交） | 乐观锁失败、幂等键重复 |
| 422 | **语义错**（语法对但业务不认可） | 余额不足、库存不足 |
| 500 | 服务端错误（**要对用户隐藏细节**） | —— |

**400 与 422 的区分经常被忽略**，但客户端对两者的处理完全不同：400 说明"请求写错了"（重试无用），422 说明"请求合法但当前状态不允许"（可能提示用户补充信息）。全都返回 400 会让客户端无法区分这两类。

## 十、校验失效清单 {#failures}

| # | 现象 | 根因 | 解法 |
|---|---|---|---|
| 1 | 嵌套对象的约束不生效 | 字段上缺 `@Valid` | 在**嵌套字段**上加 `@Valid` |
| 2 | 加了分组后部分校验丢失 | 指定分组后 `Default` 分组不再生效 | 让分组接口 `extends Default` |
| 3 | 路径参数校验不生效 | 类上缺 `@Validated` | 类上加 `@Validated` |
| 4 | Service 层校验不生效 | 缺少类上的 `@Validated`，或**自调用** | 加注解；避免自调用 |
| 5 | 校验失败了但返回 500 | 只处理了 `MethodArgumentNotValidException` | **补上 `ConstraintViolationException`** |
| 6 | 集合元素没被校验 | `@Valid` 与 `@NotEmpty` 只写了后者 | 两者都写 |
| 7 | 校验在 Filter / 拦截器里不生效 | Filter 不在 Spring MVC 的校验链上 | 见[为什么 Filter 里 `@Autowired` 会失败](/java/spring/spring-boot/web-server#filter-autowired) |

**第 5 条是最高频的**——它不会在开发环境暴露，因为开发者通常只测 JSON 请求体这条路径，而路径/查询参数的问题要等前端联调时才出现。

**第 7 条容易被误判**：Filter 是 Servlet 规范的组件，**不在 Spring MVC 的 `HandlerMethod` 校验链条上**，因此 `@Valid` 对它无意义。需要在 Filter 里做校验时，应手动调用 `Validator`：

```java
@Autowired private Validator validator;      // 由 Boot 自动配置的 LocalValidatorFactoryBean

Set<ConstraintViolation<T>> violations = validator.validate(target);
```

## 十一、面试口径 {#interview}

| # | 问题 | 一句话答案 |
|---|---|---|
| 1 | `@Valid` 和 `@Validated` 的区别？ | `@Valid` 是 **Jakarta Bean Validation 标准**注解，**不支持分组**；`@Validated` 是 **Spring 的**注解，支持 `value()` 指定分组、**并且可以加在类上开启方法级校验**。校验请求体用 `@Valid`，路径参数与分组场景用 `@Validated` |
| 2 | 为什么嵌套对象的校验不生效？ | `@Valid` 的作用是**把校验往下传递一层**，必须写在**嵌套字段**上。只在方法参数上写 `@Valid @RequestBody` 只能进入外层对象，字段上没有 `@Valid` 时嵌套对象的约束完全不执行 |
| 3 | 分组校验最容易踩的坑？ | **一旦约束指定了分组，它就不再属于 `Default` 分组**。所以 `@Validated(Create.class)` 会跳过所有没写 `groups` 的约束。解法是让自定义分组接口 `extends Default` |
| 4 | 校验失败会抛哪几种异常？ | 两条链：**请求体** `@Valid` → `MethodArgumentNotValidException`（带 `BindingResult`）；**路径/查询参数**或方法级校验 → `ConstraintViolationException`（带 `ConstraintViolation`）。**两者结构不同，必须分别处理**，否则漏掉的那类会变成 500 |
| 5 | 怎么让框架异常也返回 ProblemDetail 格式？ | 配置 `spring.mvc.problemdetails.enabled=true`。它只影响**框架内建异常**；业务异常仍需在 `@RestControllerAdvice` 中处理 |
| 6 | 什么是 RFC 9457？和 7807 什么关系？ | Problem Details for HTTP APIs 标准，**9457 在 2023 年取代了 7807**，字段结构不变。`ProblemDetail` 是 Spring Framework 6 起提供的实现，响应媒体类型为 `application/problem+json` |
| 7 | 客户端应该基于 `title` 还是 `type` 判断错误？ | **`type`**。`title` 是给人读的（会改措辞、会本地化），`type` 是稳定的机器标识。业务上下文用**扩展成员**承载，客户端必须忽略不认识的成员 |
| 8 | `@ExceptionHandler` 的匹配顺序？ | **异常类型越具体越优先**；多个 `@ControllerAdvice` 之间按 `@Order`。`Exception.class` 兜底处理器优先级最低，不会吃掉更具体的处理器 |
| 9 | 为什么"业务拒绝"不该返回 400？ | 400 表示**请求本身写错了**（重试无用），422/409 表示**请求合法但当前状态不允许**（如余额不足、乐观锁冲突）。客户端对两者的处理不同，全用 400 就丢失了这个区分 |
| 10 | 校验错误消息可以直接返回给客户端吗？ | **不能**。异常消息可能带表名、列名、类名甚至 SQL 片段。对外应给**固定文案 + 稳定的错误码**，完整堆栈只进日志——与"错误响应不暴露内部结构"同一条原则 |
| 11 | 方法级校验为什么有时不生效？ | 两个前提：**类上要有 `@Validated`**（否则没有校验拦截器），**调用不能是自调用**（`this.method()` 不走代理）。被定时任务、MQ 消费直接调用的 Service 方法尤其容易踩第二个 |
| 12 | 校验失败时应该返回第一个错误还是全部？ | **全部**。只返回第一条会让客户端"改一个、再提交、再报下一个"，联调成本成倍上升。字段级错误应聚合在扩展成员（如 `errors`）里一次返回 |

> 回到：[Spring 横切能力 · 导览](/java/spring/spring-framework/crosscutting/)　|　下一篇：[序列化与类型边界](/java/spring/spring-framework/crosscutting/json)
