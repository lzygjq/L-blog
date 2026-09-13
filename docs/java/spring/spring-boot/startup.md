---
order: 2
date: 2026-09-13
sidebar: 启动流程
title: Spring Boot 启动流程
desc: SpringApplication 构造推断、run() 十一个阶段、七种启动事件顺序、扩展点、启动耗时优化与失败分析
---

# Spring Boot 启动流程

## 一、从一个 `main` 方法说起

```java
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

一行 `SpringApplication.run()` 背后发生了非常多的事：**推断应用类型 → 准备好 `Environment`（配置文件在这里加载）→ 创建 `ApplicationContext` → 把主配置类注册进去 → 调用 IoC 容器的 `refresh()`（内嵌 Tomcat 在这里启动）→ 执行 `Runner` → 发布 `ApplicationReadyEvent`**。

理解这条链路有三个实际价值：

| 你遇到的疑惑 | 答案就在哪个阶段 |
|---|---|
| 配置文件的加载时机？为什么 `EnvironmentPostProcessor` 能改配置？ | `prepareEnvironment` |
| 内嵌 Tomcat 是什么时候起来的？ | `refreshContext` → `onRefresh` |
| 想在启动完成后跑一段初始化代码，该用哪个钩子？ | `Runner` 或 `ApplicationReadyEvent` |
| 启动报错为什么信息这么友好？ | `handleRunFailure` + `FailureAnalyzer` |

## 二、构造阶段：`new SpringApplication(...)`

`SpringApplication.run()` 是一个静态便捷方法，内部会先 `new SpringApplication(primarySources)`。构造函数做四件事：

```
① deduceApplicationType()         推断应用类型
        · 类路径有 DispatcherServlet        → SERVLET（Web 应用）
        · 只有 DispatcherHandler（WebFlux） → REACTIVE
        · 都没有                            → NONE（普通应用）
        │  结果决定后面创建哪种 ApplicationContext
        ▼
② setInitializers(...)            加载 ApplicationContextInitializer
        └ 从 META-INF/spring.factories 读取并实例化
        │
        ▼
③ setListeners(...)               加载 ApplicationListener
        └ 同样来自 spring.factories
        │
        ▼
④ deduceMainApplicationClass()    通过构造调用栈推断主类（仅用于日志）
```

**两个要点**：

- **应用类型是"猜"出来的**，依据是类路径上存在哪个 Dispatcher。这解释了一个经典问题：为什么引入了 `spring-boot-starter-web` 就会自动启动 Tomcat——因为类型被推断为 `SERVLET`。**想强制指定**可以用 `new SpringApplicationBuilder(...).web(WebApplicationType.NONE)`，或配置 `spring.main.web-application-type`。
- **构造阶段只是"准备清单"**，真正执行在 `run()`。`Initializer` 与 `Listener` 在这一步被加载但尚未调用。

## 三、`run()` 的完整流程

以下按执行顺序展开。**这是本篇的核心**，读懂这一段，启动相关的问题基本都能定位。

```
① 启动计时 + 注册关闭钩子
   Boot 3.0 起用 Startup 对象（此前是 StopWatch）；registerShutdownHook 默认为 true
        │
        ▼
② getRunListeners(args) → listeners.starting(...)
   加载 SpringApplicationRunListener（来自 spring.factories），
   发布 ApplicationStartingEvent ★最早的事件
        │
        ▼
③ prepareEnvironment(...)   ← 配置文件在这里被加载
   · 创建 ConfigurableEnvironment
   · 加载命令行参数、系统属性、环境变量
   · 触发 EnvironmentPostProcessor（Boot 2.4 起由 ConfigData API 驱动）
   · 发布 ApplicationEnvironmentPreparedEvent
   · 绑定 spring.main.* 配置到 SpringApplication 自身
        │
        ▼
④ printBanner(environment)      打印 Banner（可自定义 banner.txt）
        │
        ▼
⑤ createApplicationContext()
   按②推断的类型创建：
     SERVLET  → AnnotationConfigServletWebServerApplicationContext
     REACTIVE → AnnotationConfigReactiveWebServerApplicationContext
     NONE     → AnnotationConfigApplicationContext
        │
        ▼
⑥ prepareContext(...)
   · 把 Environment 设置进 context
   · 执行所有 ApplicationContextInitializer（扩展点）
   · 发布 ApplicationContextInitializedEvent
   · 注册主配置类（primarySources，即 @SpringBootApplication 那个类）
   · 发布 ApplicationContextPreparedEvent（仅内部使用）
   · 触发 BeanDefinitionLoader 加载配置（此时尚未实例化 Bean）
   · 发布 ApplicationPreparedEvent
        │
        ▼
⑦ refreshContext(context)   ← 调用 AbstractApplicationContext.refresh()
   十二步流程见 IoC 篇；与 Boot 相关的关键点：
     · 第 5 步执行 BeanFactoryPostProcessor（配置类解析在此）
     · 第 9 步 onRefresh() → 创建并启动内嵌 Web 服务器（Tomcat/Netty）★
     · 第 11 步实例化所有非懒加载单例（启动耗时主要来源）
     · 第 12 步发布 ContextRefreshedEvent
        │
        ▼
⑧ afterRefresh(...)            默认空实现，留给子类扩展
        │
        ▼
⑨ listeners.started(context, timeTaken)
   发布 ApplicationStartedEvent ★此时上下文已就绪，但 Runner 还没跑
        │
        ▼
⑩ callRunners(context, args)
   先执行所有 ApplicationRunner（参数是 ApplicationArguments），
   再执行所有 CommandLineRunner（参数是原始 String[]）；
   同类之间按 @Order 排序
        │
        ▼
⑪ listeners.ready(context, timeTaken)
   发布 ApplicationReadyEvent ★应用已完全就绪，可对外服务
```

**几个必须记住的结论：**

**① 配置文件加载在 `prepareEnvironment`（第 ③ 步），早于容器创建。** 这意味着配置的读取与 IoC 容器无关，也是 `EnvironmentPostProcessor` 能改写配置的原因。Boot 2.4 起加载逻辑由 **ConfigData API** 接管（替代了旧的 `ConfigFileApplicationListener`），引入了 `spring.config.import` 等能力。

**② 内嵌 Web 服务器在第 ⑦ 步的 `onRefresh()` 启动。** 这是"Web 服务器为什么比 Bean 初始化早"的答案——`onRefresh` 是 `refresh()` 的第 9 步，而 Bean 实例化在第 11 步。所以**端口占用这类错误会在 Bean 实例化之前就抛出来**。

**③ `started` 与 `ready` 的区别**：`started` 时容器已刷新但 `Runner` 还没执行；`ready` 时 `Runner` 也执行完了。如果初始化逻辑依赖 `Runner` 的产物，必须用 `ready` 对应的 `ApplicationReadyEvent`。

**④ `run()` 的返回值就是 `ApplicationContext`。** 所以 `SpringApplication.run()` 的返回对象可以直接 `getBean()`——这也是[容器体系](/java/spring/spring-framework/ioc/)里"业务一律用 `ApplicationContext`"的由来。

### 版本差异提示

| 变化点 | 旧版本 | 新版本 |
|---|---|---|
| 启动计时器 | `StopWatch` | Boot 3.0 起 `Startup`（区分 `started` / `ready` 两个时间点） |
| 启动完成事件 | `running(context)` | **Boot 2.6.0 起废弃，3.0.0 起移除**，改为 `ready(context, Duration)` |
| 启动已开始事件 | `started(context)` | 增加 `started(context, Duration)` 重载，可获取耗时 |
| 配置加载 | `ConfigFileApplicationListener` | **Boot 2.4 起** 改为 ConfigData API |
| 自动配置清单 | `spring.factories` | **Boot 2.7 起** 改为 `AutoConfiguration.imports`（见[自动配置原理](/java/spring/spring-boot/auto-configuration)） |

> `spring.factories` 在 Boot 3 中**并未取消**——`ApplicationContextInitializer`、`ApplicationListener`、`SpringApplicationRunListener`、`EnvironmentPostProcessor` 仍然通过它注册，只有**自动配置**那一项搬走了。这是很容易记混的一点。

## 四、七种启动事件（按顺序）

| # | 事件 | 触发时机 | 典型用途 |
|---|---|---|---|
| 1 | `ApplicationStartingEvent` | `run()` 刚开始，`Environment` 未就绪 | 极早期初始化（此时拿不到配置） |
| 2 | `ApplicationEnvironmentPreparedEvent` | `Environment` 就绪，容器未创建 | 读取配置、动态改配置 |
| 3 | `ApplicationContextInitializedEvent` | 容器已创建，`Initializer` 执行完 | 修改容器的 BeanFactory |
| 4 | `ApplicationPreparedEvent` | BeanDefinition 已加载，尚未 `refresh()` | 补充注册 BeanDefinition |
| 5 | `ApplicationStartedEvent` | 容器 `refresh()` 完成，`Runner` 未执行 | 统计启动耗时 |
| 6 | **`ApplicationReadyEvent`** | 全部就绪，可对外服务 | **启动后初始化（最常用）** |
| — | `ApplicationFailedEvent` | 启动抛异常时 | 失败告警、资源清理 |

**实践结论**：业务代码想"应用启动后做点事"，优先用 `ApplicationReadyEvent` 或 `ApplicationRunner`，**不要用 `@PostConstruct`**——后者在单个 Bean 初始化时执行，此时其它 Bean 可能还没就绪（甚至 Web 服务器都还没起来），顺序不可依赖。

```java
// ✓ 推荐：Runner 与 ApplicationReadyEvent，都是"全部就绪"之后
@Component
@Order(1)
public class WarmUpRunner implements ApplicationRunner {
    @Override
    public void run(ApplicationArguments args) {
        cacheService.warmUp();          // 此时所有 Bean 已可用，Web 服务器已启动
    }
}

@Component
public class ReadyListener implements ApplicationListener<ApplicationReadyEvent> {
    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        // 同样在所有 Runner 执行完之后
    }
}
```

## 五、启动过程中的扩展点

| 扩展点 | 注册方式 | 介入时机 | 典型用途 |
|---|---|---|---|
| `EnvironmentPostProcessor` | `spring.factories` | `Environment` 就绪后、容器创建前 | 动态追加配置源（配置中心接入） |
| `ApplicationContextInitializer` | `spring.factories` / `addInitializers` | 容器创建后、BeanDefinition 加载前 | 编程式设置容器的属性 |
| `ApplicationListener` | `spring.factories` / `@Component` | 对应事件发布时 | 启动阶段埋点、预检 |
| `SpringApplicationRunListener` | `spring.factories` | 贯穿整个 `run()` 各阶段 | 框架级启动过程监控（如启动耗时上报） |
| `BeanFactoryPostProcessor` / `BeanPostProcessor` | `@Component` 等 | `refresh()` 内部 | 见 [Bean 生命周期](/java/spring/spring-framework/bean/) |
| `Banner` | `spring.factories` / `banner.txt` | `printBanner` | 自定义启动横幅 |
| `FailureAnalyzer` | `spring.factories` | 启动失败时 | 把异常转成可读的失败报告 |

**注册位置的坑**：`EnvironmentPostProcessor`、`ApplicationContextInitializer` 这类**在容器创建之前**就要用到的扩展点，**必须通过 `spring.factories` 注册**——因为此时还没有 `ApplicationContext`，`@Component` 根本不会被扫描到。

## 六、启动耗时优化

排查启动慢，先要拿到分段耗时。三种手段：

| 手段 | 用法 | 得到什么 |
|---|---|---|
| **启动日志** | `ApplicationStartedEvent` 中打点 | 总耗时；`Startup` 对象还能给出各步骤耗时 |
| **`--debug` / `debug: true`** | 启动开关 | 条件评估报告，看清哪些自动配置生效 |
| **Actuator 端点** | `/actuator/startup`（需配 `BufferingApplicationStartup`） | **每个 Bean 的创建耗时明细**，定位最慢的 Bean |

常用优化手段按收益排序：

| 手段 | 做法 | 代价 / 注意 |
|---|---|---|
| **延迟初始化** | `spring.main.lazy-initialization=true` | 效果最显著，但把问题推到运行期；**生产慎用**，可配合 `@Lazy(false)` 排除关键 Bean |
| **缩小组件扫描范围** | 启动类放最外层包，或用 `@ComponentScan` 限定 | 无副作用，应优先做 |
| **排除无用自动配置** | `@SpringBootApplication(exclude = ...)` 或 `spring.autoconfigure.exclude` | 需确认确实用不到 |
| **`@Configuration(proxyBeanMethods = false)`** | 关闭 CGLIB 代理 | 仅在 `@Bean` 方法之间不互相调用时可用 |
| **异步化启动期任务** | 把预热、远程调用移出启动流程 | 要处理"未就绪就被访问"的问题 |
| **AOT / 原生镜像** | Boot 3 + GraalVM native image | 启动从秒级降到毫秒级，但构建复杂、反射需配置 |

**一条经验**：**先测量再优化**。启动慢的常见根因是"某个 `@PostConstruct` 里有远程调用或大批量查询"，而不是 Bean 数量本身。用 `/actuator/startup` 定位到具体 Bean 再动手，比全局开延迟初始化安全得多。

## 七、启动失败怎么排查

`run()` 中任何异常都会被 `handleRunFailure` 捕获，它做三件事：**发布 `ApplicationFailedEvent` → 调用 `FailureAnalyzer` 生成可读报告 → 调用 `SpringApplication.exit()` 关闭上下文**。

这也是为什么 Spring Boot 的启动报错比纯 Spring 友好得多：

```
***************************
APPLICATION FAILED TO START
***************************

Description:

Web server failed to start. Port 8080 was already in use.

Action:

Identify and stop the process that's listening on port 8080 or configure
this application to listen on another port.
```

常见失败类型与定位方向：

| 报错特征 | 根因 | 定位 |
|---|---|---|
| `Port XXXX was already in use` | 端口占用（发生在 `onRefresh` 阶段） | 换端口 `server.port` 或杀掉占用进程 |
| `The dependencies of some of the beans ... form a cycle` | 循环依赖（Boot 2.6+ 默认禁止） | 见 [循环依赖](/java/spring/spring-framework/bean/circular-dependency) |
| `Parameter 0 of constructor ... required a bean of type ...` | 依赖找不到（未扫描到 / 未注册） | 检查包扫描范围、`@Component` / `@Bean` 是否遗漏 |
| `Failed to configure a DataSource` | 引了 JDBC 依赖却没配数据源 | 补配置或用 `exclude` 排除自动配置 |
| `No qualifying bean of type ... expected single matching bean but found N` | 同类型多候选 | 用 `@Primary` / `@Qualifier`，见 [IoC 容器](/java/spring/spring-framework/ioc/) |

**两个排查技巧**：

- **看 `FailureAnalyzer` 给出的 `Action` 段**——它通常直接告诉你怎么办，比堆栈有用得多。
- **`debug: true` 看条件评估报告**——"Bean 没生效 / 自动配置没起效"这类问题，`Negative matches` 里会写清是哪个 `@Conditional` 不满足（见 [自动配置原理](/java/spring/spring-boot/auto-configuration)）。

## 八、面试问答

**Q1：Spring Boot 的启动流程？**

`SpringApplication.run()` 分两大阶段。**构造阶段**：按类路径推断应用类型（`SERVLET` / `REACTIVE` / `NONE`），从 `spring.factories` 加载 `ApplicationContextInitializer` 与 `ApplicationListener`。**`run()` 阶段**：启动计时并注册关闭钩子 → 加载 `SpringApplicationRunListener` 并发布 `ApplicationStartingEvent` → `prepareEnvironment`（**配置文件在这里加载**）→ 打印 Banner → 按应用类型创建 `ApplicationContext` → `prepareContext`（设置 Environment、执行 Initializer、注册主配置类、加载 BeanDefinition）→ `refreshContext`（调用 `AbstractApplicationContext.refresh()`，**内嵌 Web 服务器在 `onRefresh` 启动**）→ 发布 `ApplicationStartedEvent` → 执行 `ApplicationRunner` 与 `CommandLineRunner` → 发布 `ApplicationReadyEvent`。任一环节抛异常都会走 `handleRunFailure`，由 `FailureAnalyzer` 生成可读报告。

**Q2：配置文件是在什么时候加载的？**

在 `prepareEnvironment` 阶段（`createApplicationContext` **之前**）。这个顺序很关键：**配置的读取与 IoC 容器无关**，所以 `EnvironmentPostProcessor` 能在容器创建前就改写配置源（配置中心就是靠这个接入的）。Spring Boot 2.4 起配置加载改由 **ConfigData API** 驱动，支持 `spring.config.import` 等能力，取代了旧的 `ConfigFileApplicationListener`。

**Q3：内嵌 Tomcat 是什么时候启动的？**

在 `refreshContext` → `AbstractApplicationContext.refresh()` 的**第 9 步 `onRefresh()`**。这一步在 Bean 实例化（第 11 步）**之前**——所以"端口被占用"这类错误会在 Bean 创建之前抛出，报错信息里也不会出现任何 Bean 相关的内容。这也是 Boot 相比纯 Spring 多出来的一个扩展点（`ServletWebServerApplicationContext` 覆写了 `onRefresh`）。

**Q4：`ApplicationRunner` 和 `CommandLineRunner` 有什么区别？什么时候执行？**

两者都在 **`ApplicationStartedEvent` 之后、`ApplicationReadyEvent` 之前**执行（`run()` 的第 ⑩ 步）。区别在参数类型：`ApplicationRunner.run(ApplicationArguments args)` 接收封装后的 `ApplicationArguments`（可以区分选项参数与非选项参数）；`CommandLineRunner.run(String... args)` 接收原始字符串数组。**同类之间有多个时按 `@Order` 排序，且所有 `ApplicationRunner` 都先于所有 `CommandLineRunner` 执行。** 需要"启动后做初始化"时优先用它们，而不是 `@PostConstruct`——后者在单个 Bean 初始化时执行，此时其它 Bean 甚至 Web 服务器可能都还没就绪。

**Q5：`started` 事件和 `ready` 事件有什么区别？**

`ApplicationStartedEvent`（对应 `SpringApplicationRunListener#started`）在**容器 `refresh()` 完成之后、`Runner` 执行之前**发布——此时 Bean 都装配好了，但业务上的启动初始化还没做。`ApplicationReadyEvent`（对应 `ready`）在**所有 `Runner` 执行完之后**发布，是"应用完全就绪、可以对外服务"的信号。**补充一个版本细节**：`SpringApplicationRunListener#running` 在 Boot 2.6.0 被标记废弃、3.0.0 正式移除，由 **`ready(context, Duration)`** 替代（顺带提供启动耗时）。

**Q6：`ApplicationListener`、`ApplicationContextInitializer`、`EnvironmentPostProcessor` 该注册到哪里？**

看它们介入的时机：**`EnvironmentPostProcessor`** 在 `Environment` 就绪后、容器创建前执行（`prepareEnvironment` 阶段）；**`ApplicationContextInitializer`** 在容器创建后、BeanDefinition 加载前执行（`prepareContext` 阶段）。这两个都**早于容器准备完成**，此时 `@Component` 还不会被扫描，所以**必须通过 `META-INF/spring.factories` 注册**。而 `ApplicationListener` 既可以放 `spring.factories`（能收到极早期事件），也可以标 `@Component`（只能收到容器创建之后的事件）——**想监听 `ApplicationStartingEvent` 就只能用 `spring.factories`**。

**Q7：`spring.factories` 在 Spring Boot 3 里还有用吗？**

**有用，只是不再管自动配置了。** 自动配置的注册位置在 2.7 起迁移到 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`，Boot 3 已从 `spring.factories` 中移除该项；但 `ApplicationContextInitializer`、`ApplicationListener`、`SpringApplicationRunListener`、`EnvironmentPostProcessor`、`FailureAnalyzer` 等**仍然通过 `spring.factories` 注册**。**记法**：`.imports` 只管"自动配置类清单"，其余扩展点仍在 `spring.factories`。

**Q8：启动慢怎么优化？**

**先测量，再优化。** 拿到分段耗时的三种手段：启动日志中的 `ApplicationStartedEvent`（总耗时）、`debug: true`（条件评估报告）、`/actuator/startup` 端点配合 `BufferingApplicationStartup`（**可列出每个 Bean 的创建耗时，定位最慢的 Bean**）。常见优化手段按收益排序：① 缩小组件扫描范围（无副作用，优先做）；② 排查 `@PostConstruct` 中的阻塞操作（远程调用、大批量查询）——这是最常见的真实根因；③ 排除用不到的自动配置；④ `@Configuration(proxyBeanMethods = false)`；⑤ 延迟初始化 `spring.main.lazy-initialization=true`（效果最明显但把问题推到运行期，**生产慎用**）；⑥ Boot 3 的 AOT / 原生镜像。
