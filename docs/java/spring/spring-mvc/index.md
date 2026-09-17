---
order: 7
date: 2026-09-13
sidebar: Spring MVC
title: Spring MVC 执行流程
desc: DispatcherServlet 九大组件、一次请求的完整链路、HandlerMapping 与 HandlerAdapter 为何分离、拦截器与过滤器对比
---

# Spring MVC 执行流程

## 一、问题场景

`Spring MVC` 的执行流程是 Web 方向面试的必问题。但很多人背下来的是**一张流程图**——知道 `DispatcherServlet` 之后要经过 `HandlerMapping`、`HandlerAdapter`，却说不出**为什么要拆这么多个组件**。

这正是本题的区分点：流程本身是"结果"，**组件拆分的动机才是"原因"**。搞懂动机，流程就不需要背了；只背流程，面试官问一句"为什么不让 `DispatcherServlet` 直接调 Controller"就会卡住。

## 二、从 Servlet 到 DispatcherServlet

先看不用框架时的写法（原生 Servlet）：

```java
// 每个 URL 都要写一个 Servlet，并在 web.xml 里手工注册映射
public class OrderServlet extends HttpServlet {
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) {
        String uri = req.getRequestURI();
        if ("/order/create".equals(uri)) {
            // 解析参数、业务处理、返回 JSON —— 全部耦合在一个方法里
        }
    }
}
```

问题很明确：**请求分发、参数解析、结果序列化这些与业务无关的逻辑，在每个 Servlet 里重复**。这和 [AOP](/java/spring/spring-framework/aop/) 篇描述的"横切逻辑散落各处"是同一类病症。

Spring MVC 的解法是引入**前端控制器（Front Controller）**：所有请求先经过一个统一的 `DispatcherServlet`，由它负责调度，业务代码只写 Controller 方法。

```
原生 Servlet：  请求 ──▶ 各管各的 Servlet ──▶ 业务逻辑
                          （分发/解析/序列化 重复 N 遍）

Spring MVC：    请求 ──▶ DispatcherServlet ──┬──▶ 分发（HandlerMapping）
                          （统一调度中枢）      ├──▶ 适配（HandlerAdapter）
                                              ├──▶ 解析（ArgumentResolver）
                                              └──▶ 序列化（MessageConverter）
                                                    ↓
                                              业务 Controller 只写业务
```

## 三、九大组件

`DispatcherServlet` 本身不干活，它把职责分给九大组件（初始化在 `initStrategies()` 中）：

| 组件 | 职责 | 典型实现 |
|---|---|---|
| **`HandlerMapping`** | 根据请求找到对应的 Handler | `RequestMappingHandlerMapping` |
| **`HandlerAdapter`** | 以统一方式调用不同类型的 Handler | `RequestMappingHandlerAdapter` |
| **`HandlerExceptionResolver`** | 处理 Handler 抛出的异常 | `ExceptionHandlerExceptionResolver`（配合 `@ControllerAdvice`） |
| **`HandlerMethodArgumentResolver`** | 把请求数据绑定到方法参数 | `RequestParamMethodArgumentResolver`、`RequestResponseBodyMethodProcessor` |
| **`HandlerMethodReturnValueHandler`** | 处理方法返回值 | `RequestResponseBodyMethodProcessor`、`ModelAndViewMethodReturnValueHandler` |
| **`ViewResolver`** | 把逻辑视图名解析为 `View` | `InternalResourceViewResolver` |
| **`HttpMessageConverter`** | 请求体/响应体与 Java 对象的转换 | `MappingJackson2HttpMessageConverter` |
| **`LocaleResolver`** | 国际化区域解析 | `AcceptHeaderLocaleResolver` |
| **`MultipartResolver`** | 文件上传解析 | `StandardServletMultipartResolver` |

**读这张表的方法**：前两个解决"**找谁处理**"和"**怎么处理**"，中间两个解决"**参数怎么进来、结果怎么出去**"，后五个解决"**周边的横切关注点**"（异常、国际化、上传）。

## 四、一次请求的完整流程

以**前后端分离**（REST API，当前主流）为例：

```
① 浏览器发起 HTTP 请求
        │
        ▼
② DispatcherServlet（前端控制器，本质是一个 Servlet）
        │   在它之前可能还有 Filter（编码、跨域、请求包装）
        ▼
③ HandlerMapping 根据 URL + 请求方式查找 Handler
        │   · RequestMappingHandlerMapping 遍历所有 @RequestMapping
        │   · 返回 HandlerExecutionChain = Handler + 拦截器列表
        ▼
④ DispatcherServlet 遍历拦截器，依次执行 preHandle()
        │   任一 preHandle 返回 false → 中断，不再往下
        ▼
⑤ HandlerAdapter 执行 Handler
        │   · 先由 ArgumentResolver 完成参数绑定
        │     （@RequestParam / @PathVariable / @RequestBody / 原生 Request）
        │   · 再反射调用 Controller 方法，执行业务逻辑
        ▼
⑥ 方法返回结果
        │
        ├─ 标注 @ResponseBody（或类上是 @RestController）
        │     ▼
        │  ReturnValueHandler 交给 HttpMessageConverter
        │  把返回值序列化为 JSON 写入响应体
        │     ★ 到此结束，不经过 ViewResolver
        │
        └─ 未标注（返回视图名 / ModelAndView）
              ▼
           ViewResolver 解析出 View 对象 → 渲染 → 写入响应
        │
        ▼
⑦ 倒序执行拦截器的 postHandle()
        │
        ▼
⑧ 倒序执行拦截器的 afterCompletion()（无论成功或异常都会执行）
        │
        ▼
⑨ 响应返回浏览器
```

**流程中三个必须理解的细节：**

**① 拦截器是"包"在 Handler 外面的。** `preHandle` 按注册顺序**正序**执行，`postHandle` 与 `afterCompletion` 按**逆序**执行——形成包裹结构，与 [AOP 通知](/java/spring/spring-framework/aop/) 的执行模型完全一致。

**② 有异常时的路径。** 如果 Handler 抛异常，`postHandle` **不会**执行（它只在成功时调用），而是交给 `HandlerExceptionResolver` 处理：`@ExceptionHandler` / `@ControllerAdvice` 在这里生效；无论是否处理成功，`afterCompletion` 都会执行（适合做资源清理、耗时统计）。

**③ `@ResponseBody` 直接短路了视图渲染。** 一旦走了 `HttpMessageConverter`，`ModelAndView` 与 `ViewResolver` 完全不参与。这就是"前后端分离后不再需要 `ViewResolver`"的准确含义——**不是 `ViewResolver` 被移除，而是这条分支不会被走到**。

### JSP 视图版的差异

只差第 ⑥ 步：

| 步骤 | 前后端分离版 | JSP 视图版（旧） |
|---|---|---|
| 返回值 | 对象 / `ResponseEntity` | 视图名（`String`）或 `ModelAndView` |
| 处理者 | `HttpMessageConverter` | `ViewResolver` → `View` |
| 响应内容 | JSON / XML | 渲染后的 HTML |
| 标注 | `@ResponseBody`（或 `@RestController`） | 无（或 `@Controller`） |

**历史包袱提示**：`@Controller` 与 `@RestController` 的差异正是在这里——前者默认走视图解析，后者把 `@ResponseBody` 作为类级默认值。混用会导致"方法返回对象却被当成视图名去找 JSP"这类 404 问题。详见下文[第八节的辨析](/java/spring/spring-mvc/#三组必考辨析)。

## 五、为什么 HandlerMapping 和 HandlerAdapter 要分开

这是本题最有价值的一问。**答案是：因为"找 Handler"和"调 Handler"是两个正交的维度。**

先看 Handler 有哪些写法——Spring MVC 支持多种 Controller 形态：

```java
// 形态一：注解式（当前主流）
@RestController
public class OrderController {
    @GetMapping("/order/{id}")
    public Order get(@PathVariable Long id) { ... }
}

// 形态二：实现 Controller 接口（早期写法）
public class LegacyController implements Controller {
    public ModelAndView handleRequest(HttpServletRequest req, HttpServletResponse resp) { ... }
}

// 形态三：HttpRequestHandler（常用于静态资源、二进制输出）
public class FileHandler implements HttpRequestHandler {
    public void handleRequest(HttpServletRequest req, HttpServletResponse resp) { ... }
}
```

于是出现两个独立的维度：

```
「怎么找到它」                          「怎么调用它」
  ├─ 按注解匹配 URL      → RequestMappingHandlerMapping   ├─ 反射+参数解析 → RequestMappingHandlerAdapter
  ├─ 按 Bean 名称匹配 URL → BeanNameUrlHandlerMapping      ├─ 调用 handleRequest → HttpRequestHandlerAdapter
  └─ 按固定路径          → SimpleUrlHandlerMapping        └─ 调用 handleRequest → SimpleControllerHandlerAdapter
```

**如果合并成一个组件，就要写 N×M 种组合；拆成两层策略，只需 N + M 个实现。** 这就是 `HandlerMapping` 与 `HandlerAdapter` 分离的全部理由——**策略模式的典型应用：把变化维度拆开，各自独立扩展。**

```java
// DispatcherServlet#doDispatch 的核心（简化）
protected void doDispatch(HttpServletRequest request, HttpServletResponse response) {
    HandlerExecutionChain mappedHandler = null;
    try {
        // ① 找：遍历所有 HandlerMapping，第一个返回非 null 的胜出（有序策略）
        mappedHandler = getHandler(processedRequest);
        if (mappedHandler == null) { noHandlerFound(response); return; }

        // ② 适配：为这个 Handler 找到能调用它的 HandlerAdapter
        HandlerAdapter ha = getHandlerAdapter(mappedHandler.getHandler());

        // ③ 拦截器前置
        if (!mappedHandler.applyPreHandle(processedRequest, response)) return;

        // ④ 调用（参数绑定 + 反射执行 + 返回值处理都在里面）
        ModelAndView mv = ha.handle(processedRequest, response, mappedHandler.getHandler());

        // ⑤ 拦截器后置
        mappedHandler.applyPostHandle(processedRequest, response, mv);
    } catch (Exception ex) {
        dispatchException = ex;                                  // 交给 HandlerExceptionResolver
    }
    processDispatchResult(processedRequest, response, mappedHandler, mv, dispatchException);
}
```

**顺带一个高频追问**：`getHandler()` 是**遍历所有 `HandlerMapping` 取第一个命中**，而 `HandlerMapping` 本身实现了 `Ordered`——所以自定义 `HandlerMapping` 时可以通过 `@Order` 控制优先级。默认的 `RequestMappingHandlerMapping` 优先级最高（`order = 0`）。

## 六、参数绑定是怎么完成的

Controller 方法的参数五花八门，靠的是 `HandlerMethodArgumentResolver` 责任链——**每个解析器声明"我支持哪种参数"，依次询问直到命中**：

| 参数写法 | 解析器 | 数据来源 |
|---|---|---|
| `@RequestParam String name` | `RequestParamMethodArgumentResolver` | URL 查询串 / 表单 |
| `@PathVariable Long id` | `PathVariableMethodArgumentResolver` | URL 路径模板 |
| `@RequestBody Order order` | `RequestResponseBodyMethodProcessor` | 请求体（经 `HttpMessageConverter` 反序列化） |
| `Order order`（无注解） | `ServletModelAttributeMethodProcessor` | 请求参数按属性名绑定 |
| `@RequestHeader` / `@CookieValue` | 对应的解析器 | 请求头 / Cookie |
| `HttpServletRequest` / `HttpServletResponse` | `ServletRequestMethodArgumentResolver` | 容器注入 |

**四个实用结论：**

**① `@RequestParam` 和 `@PathVariable` 的来源完全不同。** 前者取自查询串（`?name=x`）或表单，后者取自 URL 路径模板（`/order/{id}`）。REST 风格下资源标识用 `@PathVariable`，过滤条件用 `@RequestParam`。

**② 无注解的复杂对象走"属性绑定"而非 JSON 解析。** `public void save(Order order)` 是从**请求参数**按字段名逐个 set 进去的，不是从 JSON body 反序列化。要接收 JSON 必须加 `@RequestBody`——**这是最常见的 400 错误来源**（前端发 JSON、后端忘了加注解）。

**③ 同一个方法只能有一个 `@RequestBody`**，因为请求体是一个流，只能被读取一次。要接收多个对象就包一层 DTO。

**④ 绑定失败默认抛 400。** 可以用 `@ControllerAdvice` + `@ExceptionHandler(MethodArgumentNotValidException.class)` 统一改成业务错误码响应——这是统一异常处理的入口。

## 七、`@ResponseBody` 与 HttpMessageConverter

`HttpMessageConverter` 负责"Java 对象 ↔ HTTP 报文"的双向转换，选择依据有两组信息：

```
写响应：根据「返回值类型 + 请求的 Accept 头」选择
        返回值 Order          → application/json  → MappingJackson2HttpMessageConverter
        返回值 String         → text/plain        → StringHttpMessageConverter
        返回值 byte[]         → 二进制            → ByteArrayHttpMessageConverter

读请求：根据「参数类型 + 请求的 Content-Type」选择
        @RequestBody Order + Content-Type: application/json → Jackson 反序列化
        @RequestBody Order + Content-Type: application/xml  → Jaxb2 反序列化
```

**两个生产实践点：**

| 问题 | 原因 | 解决 |
|---|---|---|
| 返回中文乱码 | `StringHttpMessageConverter` 默认字符集被改 | 检查 `spring.http.encoding`，或用对象返回（JSON 天然 UTF-8） |
| 前端收到 406 | `Accept` 头与可用的转换器不匹配 | 确认请求头；`@RequestMapping(produces = ...)` 显式声明 |
| 返回 `null` 导致前端报错 | 直接返回对象时 `null` 会被当作"无内容" | 用 `ResponseEntity` 包装，或统一返回 `Result<T>` |

**工程建议：统一用 `ResponseEntity<Result<T>>` 或自定义 `Result<T>` 返回包装类**——既避免 `null` 语义歧义，又能统一携带错误码与提示信息。

## 八、Web 层注解速查

| 注解 | 作用 |
|---|---|
| **`@RequestMapping`** | 路径映射，可限定 `method` / `consumes` / `produces` / `headers` |
| **`@GetMapping` / `@PostMapping`** 等 | `@RequestMapping` 的语义化简写，**自带 `method` 限定** |
| **`@PathVariable`** | 取 URL 路径模板变量（`/order/{id}`） |
| **`@RequestParam`** | 取查询串 / 表单参数 |
| **`@RequestBody`** | 取**请求体**并交给 `HttpMessageConverter` 反序列化（JSON → 对象） |
| **`@ResponseBody`** | 把返回值作为响应体序列化，**不经过视图解析** |
| **`@RequestHeader` / `@CookieValue`** | 取请求头 / Cookie |
| **`@RestControllerAdvice`** | `@ControllerAdvice` + `@ResponseBody`，全局异常 / 数据绑定处理 |
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

**踩坑提醒**：用 `@Controller` 返回对象却忘了加 `@ResponseBody`，会得到一个 404（Spring 拿返回值去当视图名找了）。**现在写 API 一律用 `@RestController`。**

## 九、拦截器 vs 过滤器

这两个概念极易混淆，但**它们处于完全不同的层次**：

```
请求 ──▶ Filter（Servlet 规范）──▶ DispatcherServlet ──▶ Interceptor（Spring MVC）──▶ Controller
        · 容器管理                        │               · Spring 容器管理
        · 早于 Spring 介入                │               · 能拿到 Handler 与方法信息
        · 所有请求都过                    ▼               · 只对映射到 Handler 的请求生效
                                      HandlerMapping
```

| 维度 | `Filter` | `HandlerInterceptor` |
|---|---|---|
| **规范归属** | Servlet 规范（`javax/jakarta.servlet`） | Spring MVC 自有 |
| **管理容器** | Servlet 容器（Tomcat），**不由 Spring 管理** | Spring 容器（可用 `@Autowired` 注入 Bean） |
| **作用范围** | **所有请求**，含静态资源、未匹配的 URL | 只拦截**命中 Handler 映射**的请求 |
| **能否获知目标方法** | ❌ 只能拿到 URL | ✅ 能拿到 `HandlerMethod`，可读方法上的注解 |
| **执行时点** | 在 `DispatcherServlet` 前后 | 在 `DispatcherServlet` 内部、Handler 前后 |
| **典型用途** | 编码设置、跨域（CORS）、请求体包装、全链路 TraceId | 登录校验、权限注解、操作日志、接口耗时 |
| **注册方式** | `FilterRegistrationBean` / `@WebFilter` | `WebMvcConfigurer#addInterceptors` |

**选型判断**：

```
问：这个逻辑需要知道"要调用哪个 Controller 方法"吗？
  ├─ 需要（如读方法上的 @RequiresPermission）→ HandlerInterceptor
  └─ 不需要（如设置字符编码、记录 TraceId）    → Filter

问：需要拦截静态资源吗？
  ├─ 需要 → Filter（Interceptor 天然拦不到）
  └─ 不需要 → 都可以
```

**一个常见的坑**：在 `Interceptor` 里 `@Autowired` 一个 Service 是可行的（它由 Spring 管理），但在 `Filter` 里直接 `@Autowired` **会注入失败**（Filter 由 Tomcat 创建，早于 Spring 容器完成初始化）。需要时通过 `FilterRegistrationBean` 注册，或实现 `ApplicationContextAware` 手动取。

## 十、面试问答 {#interview}

**Q1：Spring MVC 的执行流程？**

请求到达 `DispatcherServlet`（前端控制器）→ `HandlerMapping` 根据 URL 找到 Handler，返回 `HandlerExecutionChain`（Handler + 拦截器链）→ 依次执行拦截器 `preHandle` → `HandlerAdapter` 适配执行 Handler（先由 `ArgumentResolver` 完成参数绑定，再反射调用 Controller 方法）→ 方法返回结果：若标注 `@ResponseBody`（或 `@RestController`），由 `HttpMessageConverter` 序列化为 JSON 写入响应体；否则由 `ViewResolver` 解析视图并渲染 → 逆序执行 `postHandle` 与 `afterCompletion` → 响应返回。

**补充说明**：异常会跳过 `postHandle`，交由 `HandlerExceptionResolver`（`@ControllerAdvice` 在这里生效）；`afterCompletion` 无论成功失败都会执行。

**Q2：为什么需要 HandlerMapping 和 HandlerAdapter 两个组件？**

因为**"找 Handler"和"调 Handler"是两个正交的变化维度**。Spring MVC 支持多种 Controller 写法（`@RequestMapping` 注解式、`Controller` 接口、`HttpRequestHandler`），查找方式和调用方式各自独立。若合并成一个组件，组合数是 N×M；拆成两层策略后只需 N + M 个实现。这是**策略模式**的典型应用——也让"自定义 Handler 类型"或"自定义路由规则"可以单独扩展，互不影响。

**Q3：拦截器和过滤器的区别？**

层次不同：`Filter` 属于 **Servlet 规范**，由 Servlet 容器（Tomcat）管理，在 `DispatcherServlet` 之外，拦截**所有**请求（含静态资源），只能拿到 URL；`HandlerInterceptor` 属于 **Spring MVC**，由 Spring 容器管理，在 `DispatcherServlet` 内部，只拦截**命中 Handler 映射**的请求，能拿到 `HandlerMethod`（因此可以读取方法上的注解）。

选型：需要读取目标方法信息（如权限注解）用拦截器；需要处理编码、跨域、TraceId 等与业务方法无关的事用过滤器。**注意 `Filter` 中无法直接 `@Autowired`**，因为它由容器创建、早于 Spring 初始化完成。

**Q4：`@ResponseBody` 做了什么？**

它告诉 `HandlerAdapter`：**方法的返回值就是响应体本身，不要当作视图名去解析**。具体执行者是 `HandlerMethodReturnValueHandler`，它把返回值交给选中的 `HttpMessageConverter`（JSON 场景是 `MappingJackson2HttpMessageConverter`）序列化后直接写入 `HttpServletResponse` 的输出流。因此这条分支**不会经过 `ModelAndView` 与 `ViewResolver`**——这就是"前后端分离后不需要 `ViewResolver`"的准确含义。

**Q5：`@RequestParam` 和 `@PathVariable` 有什么区别？**

数据来源不同：`@RequestParam` 从**查询串或表单参数**中取值（`/order?status=1`），`@PathVariable` 从 **URL 路径模板**中取值（`/order/{id}`）。REST 风格下，**资源标识用 `@PathVariable`**（`/orders/123`），**过滤/分页条件用 `@RequestParam`**（`/orders?status=1&page=2`）。两者都可以设 `required = false` 与默认值。

**Q6：接收 JSON 请求体为什么要加 `@RequestBody`？不加会怎样？**

不加 `@RequestBody` 时，Spring 会用**默认的数据绑定**（`ServletModelAttributeMethodProcessor`）——从请求参数中按字段名逐个 set，而不是解析请求体。如果前端发的是 JSON、`Content-Type: application/json`，请求参数里没有对应字段，最终得到一个**字段全为 null 的对象**（或直接 400），这是非常隐蔽的 bug。**规则：接收 JSON body 必须加 `@RequestBody`，且一个方法只能有一个。**

**Q7：`@ControllerAdvice` 是怎么生效的？**

它是 `HandlerExceptionResolver` 体系的入口。`DispatcherServlet` 捕获 Handler 抛出的异常后交给 `HandlerExceptionResolver` 处理链，其中 `ExceptionHandlerExceptionResolver` 会扫描所有 `@ControllerAdvice` 类中匹配异常类型的 `@ExceptionHandler` 方法并调用，把返回值按正常流程（走 `HttpMessageConverter`）写成响应。所以它能在**业务代码完全不感知**的情况下统一异常出口——这也是它与 [AOP](/java/spring/spring-framework/aop/) 的思路一致的地方：把横切逻辑从业务方法中抽走。

> **延伸**：[REST 接口设计：状态码、错误契约、分页与演进](/java/spring/spring-mvc/rest-api-design) —— 这一篇讲「一个请求怎么被处理」，那一篇讲「接口该长什么样」：资源建模与 HTTP 方法的幂等语义、4xx 与 5xx 的分界线、统一错误体与 `traceId`、游标分页、兼容性演进清单与幂等键。
