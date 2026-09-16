---
date: 2026-09-16
title: 异步执行：@Async 的生效条件与线程池陷阱
sidebar: 异步执行
order: 2
desc: 异步执行：@Async 的生效条件、默认 SimpleAsyncTaskExecutor 的陷阱、ThreadPoolTaskExecutor 四个必设参数与拒绝策略、TaskDecorator 传递 MDC 与 SecurityContext、void 返回吞异常、与 @Transactional 的顺序、优雅关闭、虚拟线程的换与不换、异步代码测试
---

# 异步执行：@Async 的生效条件与线程池陷阱

`@Async` 看起来是"把方法扔到后台"这么简单。上线后最常见的三种事故是：**线程数暴涨到打满**（默认执行器每次都新建线程）、**日志里 traceId 断了**（ThreadLocal 没传过去）、**任务静默失败**（`void` 返回值把异常吃了）。

这三种事故有一个共同特征：**都不会在开发环境暴露**。本地 qps 低、单线程排查、异常会打到控制台——只有压到线上才现形。

> **主线：`@Async` 做的是"把这次调用挪到另一个线程执行"，它不会替你处理线程池、上下文和异常这三件事。**
>
> 这三件事恰好对应三个必须显式配置的点：**执行器**（否则线程数失控）、**TaskDecorator**（否则上下文断裂）、**AsyncUncaughtExceptionHandler**（否则异常静默）。
>
> **只加 `@EnableAsync` 和 `@Async` 就上生产，等于三件都没做。**

## 一、问题场景：三种"本地测不出来"的故障 {#why-async}

| 现象 | 根因 | 为什么本地测不出 |
|---|---|---|
| 并发一上来线程数飙升、内存告急 | 默认执行器**每次调用新建一个线程** | 本地 qps 低，线程还没堆积就结束了 |
| 日志里同一个请求的 traceId 断成两段 | 异步线程不继承 `ThreadLocal`（MDC） | 单次请求看不出"链路断开" |
| 接口"成功"了，但下游数据没生成 | `void` 返回的异步方法**异常被吞** | 异常不会传播到调用方，控制台也可能看不到 |

第三种最危险：**调用方拿到的是成功**，因为 `@Async` 方法在提交任务后就返回了；真正的失败发生在另一个线程里，而那个异常没有任何人接。

**先建立一个判断顺序**：异步出问题时，依次问三句——**"跑在哪个线程池上"**、**"上下文传过去了吗"**、**"失败了谁知道"**。

## 二、生效条件：与代理同一份规则 {#enable}

`@Async` 与 `@Transactional`、`@Cacheable` 完全共用一套代理机制，所以**失效条件也一模一样**：

| 条件 | 说明 |
|---|---|
| 必须 `@EnableAsync` | 缺少时注解被静默忽略，**方法同步执行** |
| 必须是 `public` 非 `final` 实例方法 | `private` / `static` / `final` 无法被代理覆盖 |
| **不能自调用** | 同类内部 `this.method()` 走原始对象，注解失效 |
| 必须由**外部 Bean** 调用 | 与上一条同源 |
| 需要能被代理（非 final 类） | CGLIB 无法继承 final 类 |

```java
@Service
public class ReportService {

    @Autowired private ReportService self;      // 注入自身代理

    public void generate(Long id) {
        self.doGenerate(id);                    // ✅ 走代理，异步
        // doGenerate(id);                      // ❌ 走原始对象，同步执行
    }

    @Async
    public void doGenerate(Long id) { ... }
}
```

注意**与 `@Transactional` 的一个差异**：`@Async` 的"失效"是**行为静默退化**（异步变同步），而不是报错。它不会像事务那样留下数据不一致，但会让接口响应时间突然翻倍——**这是一个容易被误判为"性能问题"的 bug**。

## 三、默认执行器：`SimpleAsyncTaskExecutor` 为什么不能上生产 {#default-executor}

只加 `@EnableAsync` 而不定义 `Executor` Bean 时，Spring 使用 `SimpleAsyncTaskExecutor`。它的定义就是"**每次提交都新建一个线程**"：

```java
// SimpleAsyncTaskExecutor 的核心行为（示意）
protected void doExecute(Runnable task, long timeout) {
    new Thread(task).start();        // 没有池，没有上限，没有复用
}
```

| 问题 | 后果 |
|---|---|
| 无上限 | 1000 个请求 → 1000 个线程，每个默认 1MB 栈 → 内存直接见底 |
| 不复用 | 创建/销毁线程的开销每次都要付 |
| 无队列 | 没有背压，请求直接变成线程 |
| **无优雅关闭** | 应用停机时在跑的任务直接被丢 |

**它唯一的适用场景是"每次调用都是长耗时、且调用频率极低"**（例如管理端手动触发的报表导出）。任何 QPS 不为零的路径都必须换成池化执行器。

> 顺带一提：**`@Scheduled` 的默认行为与 `@Async` 相反**——它默认用**单线程**调度，一个任务跑久了会阻塞后续任务。这个差异在[分布式任务调度](/java/spring/spring-cloud/scheduling)里讲。

## 四、线程池：四个必须显式决定的参数 {#thread-pool}

标准做法是实现 `AsyncConfigurer`（而不是零散定义 `Executor` Bean），因为前者能同时指定**执行器**和**异常处理器**：

```java
@Configuration
@EnableAsync
public class AsyncConfig implements AsyncConfigurer {

    @Override
    public Executor getAsyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(8);
        executor.setMaxPoolSize(32);
        executor.setQueueCapacity(200);                        // 关键：队列容量的语义
        executor.setKeepAliveSeconds(60);
        executor.setThreadNamePrefix("async-report-");         // 关键：排查时靠它认线程
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);    // 优雅关闭
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();
        return executor;
    }

    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return (ex, method, params) ->
                log.error("异步任务失败: {}", method.getName(), ex);   // 见第六节
    }
}
```

四个参数各自的"配错了会怎样"：

| 参数 | 配小了 | 配大了 |
|---|---|---|
| `corePoolSize` | 并发任务排队 | 空闲线程占内存 |
| `maxPoolSize` | 突发流量被拒 | 线程数失控 |
| `queueCapacity` | **容易触发拒绝策略** | **`maxPoolSize` 永不生效** |
| `keepAliveSeconds` | 线程频繁创建销毁 | 空闲线程长期占用 |

**`queueCapacity` 与 `maxPoolSize` 的关系是最容易搞错的一处**：`ThreadPoolExecutor` 的扩容顺序是"**核心线程满 → 入队 → 队列满 → 才扩容到 max**"。所以队列设得很大（如 `Integer.MAX_VALUE`）时，**`maxPoolSize` 永远不会被触发**——任务全在队列里排队，表现为"并发上不去"。

### 4.1 拒绝策略的选择 {#rejection}

| 策略 | 行为 | 适用 |
|---|---|---|
| `AbortPolicy`（默认） | 抛 `RejectedExecutionException` | 希望调用方感知失败（**异步场景下会被吞**，见第六节） |
| `CallerRunsPolicy` | **由提交任务的线程自己执行** | **最常用的兜底**：天然背压，但会拖慢调用方 |
| `DiscardPolicy` | 静默丢弃 | 几乎不用（静默丢数据） |
| `DiscardOldestPolicy` | 丢弃队列最老的 | 只在"新数据比旧数据更重要"时用 |

`CallerRunsPolicy` 之所以常被选为兜底，是因为它把**过载信号反馈给了上游**——提交线程变慢，上游自然限流。代价是**它会在调用方线程里执行任务**，如果任务是纯 CPU 密集的，会把 Web 线程也拖住。

### 4.2 多线程池：按"任务性质"隔离 {#multiple-pools}

**不要把所有异步任务塞进一个池**。报表导出（CPU + IO 混合、耗时长）和消息通知（IO、耗时短）放一起，导出把池占满时通知也跟着停。

```java
@Bean("reportExecutor")
public Executor reportExecutor() { ... }

@Bean("notifyExecutor")
public Executor notifyExecutor() { ... }

// 使用时显式指定
@Async("notifyExecutor")
public void sendNotice(Long userId) { ... }
```

**隔离的意义在于把故障半径收窄**：一个池被拖垮时，其他池不受影响。这与[服务保护](/java/spring/spring-cloud/resilience#sentinel-position)里"隔离"的思路一致——只是从进程内视角。

## 五、上下文传递：`ThreadLocal` 在异步线程里消失了 {#context}

这是异步最容易被忽视、也最难排查的一类问题。需要传递的上下文至少有四种：

| 上下文 | 载体 | 丢失后果 |
|---|---|---|
| MDC（traceId / userId） | `ThreadLocal` | **日志链路断裂**，无法按 traceId 串联 |
| `SecurityContext` | `ThreadLocal` | 异步方法里 `@PreAuthorize` 失效、拿不到当前用户 |
| `RequestContextHolder` | `ThreadLocal` | 异步方法里拿 `RequestAttributes` 返回 null |
| `TransactionSynchronizationManager` | `ThreadLocal` | **异步方法不在原事务里**（这通常是期望行为） |

关键在于：**提交任务的线程和执行任务的线程不是同一个**，而 `ThreadLocal` 是"线程私有"的。平台线程池下这个问题还有第二层——**线程复用导致上一个任务的残留值被下一个任务读到**（数据串号），这一点在 [Bean 作用域与线程安全](/java/spring/spring-framework/bean/thread-safety) 里已经讲过。

`TaskDecorator` 是官方给的解决方案：**在任务提交时捕获上下文，在执行时恢复**。

```java
public class ContextCopyingDecorator implements TaskDecorator {
    @Override
    public Runnable decorate(Runnable task) {
        Map<String, String> mdc = MDC.getCopyOfContextMap();          // 提交线程快照
        SecurityContext security = SecurityContextHolder.getContext();

        return () -> {
            try {
                if (mdc != null) MDC.setContextMap(mdc);
                SecurityContextHolder.setContext(security);
                task.run();
            } finally {
                MDC.clear();                                          // 必须清理
                SecurityContextHolder.clearContext();
            }
        };
    }
}
```

```java
executor.setTaskDecorator(new ContextCopyingDecorator());
```

三个要点：

**① `getCopyOfContextMap()` 是快照，不是引用。** 必须在**提交线程**里调用，否则拿到的是异步线程的空 Map。

**② `finally` 里必须清理。** 平台线程池的线程会被复用，不清理会把 A 请求的 traceId 带到 B 请求的日志里——**表现为"日志串号"，比丢失更难排查**。

**③ Spring Boot 4 支持多个 `TaskDecorator`**——通过 `CompositeTaskDecorator` 组合。此前只能注册一个 `TaskDecorator` Bean，多个来源（如链路追踪组件 + 自定义）会互相覆盖。这是个实用改动：**第三方组件（Micrometer Tracing、安全框架）也可能注册自己的装饰器，此前会覆盖应用自定义的那一个**。

> **与链路追踪的分工**：MDC 的字段规范、traceId 的生成与传播（W3C `traceparent`）、跨进程传递，属于链路追踪的话题，见[链路追踪：和日志打通](/java/spring/spring-cloud/tracing#mdc)。本篇只解决**同一个进程内、跨线程**这一段。

## 六、异常：`void` 返回值会把它吞掉 {#exception}

`@Async` 方法的异常处理**取决于返回类型**：

| 返回类型 | 异常去哪了 | 调用方能感知吗 |
|---|---|---|
| `void` | 交给 `AsyncUncaughtExceptionHandler` | **不能**（默认只打一行 WARN 日志） |
| `Future` / `CompletableFuture` | 封装进 Future，`get()` 时抛 `ExecutionException` | 能，**但必须调用 `get()`** |

```java
// ❌ 失败只知道"异步任务抛异常了"，不知道是哪个业务
@Async
public void syncOrder(Long orderId) { ... }

// ✅ 异常随 Future 返回，调用方可以决定怎么处理
@Async
public CompletableFuture<Void> syncOrder(Long orderId) {
    try {
        doSync(orderId);
        return CompletableFuture.completedFuture(null);
    } catch (Exception e) {
        log.error("同步订单失败 orderId={}", orderId, e);
        return CompletableFuture.failedFuture(e);
    }
}
```

**默认的 `AsyncUncaughtExceptionHandler` 只记录一条简短日志**（`SimpleAsyncUncaughtExceptionHandler` 打的是 ERROR 级，但**不包含参数的完整堆栈上下文**），而且**没有任何告警**。也就是说：一个后台任务连续失败一周，你可能完全不知道。

**因此生产上的标准配置是自定义 `AsyncUncaughtExceptionHandler`**，把它接到告警链路：

```java
@Override
public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
    return (ex, method, params) -> {
        log.error("异步任务异常 method={} params={}", method.getName(), Arrays.toString(params), ex);
        metrics.counter("async.failure", "method", method.getName()).increment();  // 接监控
    };
}
```

**`CompletableFuture` 也有一个陷阱**：`@Async` 方法返回 `CompletableFuture` 时，如果方法内部**自己吞了异常并返回一个正常结果**（或者忘了 `return`）——调用方 `get()` 拿到的是"成功"。**异步链路的异常必须显式向下传**，这一点与[重试与并发限制](/java/spring/spring-framework/crosscutting/resilience)里"重试的前提是异常能抛出来"是同一条约束。

## 七、与 `@Transactional` 的顺序 {#with-transaction}

同一个方法上同时有这两个注解时，**外层注解先生效**。所以：

```java
@Async
@Transactional
public void doWork() { ... }     // 先提交到线程池，再在新线程里开启事务
```

这个顺序是**大多数场景想要的**——但有一个致命例外：**`@Async` 在外层时，事务的提交时机不再受调用方控制**，调用方返回时任务可能还没开始执行。

更有问题的是**反过来的写法**：

```java
@Transactional
@Async                                  // ❌ @Async 在内层，几乎无效
public void doWork() { ... }
```

当 `@Async` 在 `@Transactional` 内层时，外层的代理先开启事务，然后**在内层调用 `@Async` 方法时走的是原始对象**（自调用），`@Async` 失效——方法是**同步执行**的。这是"两个注解都写了，只有事务生效"的典型场景。

| 写法 | 效果 | 建议 |
|---|---|---|
| `@Async` 在外 + `@Transactional` 在内 | 新线程里开事务，**完全异步** | ✅ 常见且正确 |
| `@Transactional` 在外 + `@Async` 在内 | 事务开启，但异步**失效**（自调用） | ❌ 同步执行，白写注解 |
| 拆成两个 Bean，各自一个注解 | 边界清晰 | ✅ **最推荐** |

**最推荐的模式是拆开**：外层方法只负责"提交任务"，内层方法（另一个 Bean）负责"开事务干活"。这样两个注解的作用范围都清楚，也不会互相干扰。

**还有一个必须注意的点**：**异步方法里读不到调用方事务里未提交的数据**。如果调用方在事务中插入了一条记录然后异步处理，异步线程用的是**另一个连接**——在 `READ COMMITTED` 下读不到那条未提交的记录。这是"异步任务说找不到数据"的经典原因，解法是**把提交点提前**（事务提交后再发异步任务）。

## 八、优雅关闭：正在跑的任务怎么办 {#shutdown}

应用停机时，线程池里的任务有两个去向：**被丢弃**或**被执行完**。默认是前者。

```java
executor.setWaitForTasksToCompleteOnShutdown(true);   // 等任务跑完
executor.setAwaitTerminationSeconds(30);              // 最多等 30 秒
```

两个参数配合的含义是：**停机时先不再接受新任务，给正在跑的任务最多 30 秒，超时就强制结束**。

**`awaitTerminationSeconds` 必须设**——只设第一个参数会让停机无限等待，一个卡住的任务就能拖住整个发布流程。这与 [K8s 优雅停机](/java/spring/spring-boot/web-server#graceful-shutdown)的 `terminationGracePeriodSeconds` 是**两个层次的超时**：

```
K8s: 发出 SIGTERM ──▶ terminationGracePeriodSeconds (如 30s) ──▶ SIGKILL
                              │
应用: Spring 容器关闭 ──▶ 等线程池任务 ──▶    awaitTerminationSeconds (如 25s)

两个超时必须对齐：应用的等待时间要 < K8s 的宽限期，否则等不到"跑完"就被 SIGKILL
```

## 九、虚拟线程：该换与不该换 {#virtual-threads}

Java 21 起，虚拟线程为"高并发阻塞"提供了另一条路。Spring Boot 3.2+ 一行配置即可切换：

```yaml
spring:
  threads:
    virtual:
      enabled: true        # Web 请求处理、@Async、@Scheduled 一起切到虚拟线程
```

**`@Async` 与虚拟线程的关系需要一个明确判断**：

| 任务性质 | 用什么 | 理由 |
|---|---|---|
| **IO 密集**（HTTP 调用、DB 查询、文件读写） | **虚拟线程**（`Executors.newVirtualThreadPerTaskExecutor()`） | 阻塞时自动卸载，不需要调池大小 |
| **CPU 密集**（计算、编解码、序列化） | **平台线程池**（固定大小 ≈ CPU 核数） | 虚拟线程解决的是"等待"，不是"算得快" |
| 需要**限流**的调用 | **平台线程池**（池大小即并发上限） | 虚拟线程无上限，失去天然的背压 |

**最后一行是最容易被忽略的**：传统线程池有一个副作用——**池大小天然就是并发上限**。换成虚拟线程后这个上限消失了，一个慢下游可能瞬间被大量虚拟线程同时打过去。**这也是 Spring Framework 7 新增 `@ConcurrencyLimit` 的原因**（见[重试与并发限制](/java/spring/spring-framework/crosscutting/resilience)）。

> **虚拟线程的完整边界**（Pinning、连接池成为新瓶颈、哪些配置需要重新评估）见[内嵌容器与请求进入 · 虚拟线程](/java/spring/spring-boot/web-server#virtual-threads)——本篇只讲它与 `@Async` 的搭配判据。

**用虚拟线程替换 `@Async` 的默认执行器**：

```java
@Override
public Executor getAsyncExecutor() {
    return Executors.newVirtualThreadPerTaskExecutor();     // 无需 corePoolSize 等参数
}
```

注意此时 `setTaskDecorator` 那套配置**不再适用**（没有 `ThreadPoolTaskExecutor` 可配），上下文传递需要另找位置（虚拟线程是每个任务新建，`ThreadLocal` 必然为空——**问题从"串数据"变成了纯"丢数据"**）。

## 十、测试异步代码 {#testing}

异步代码的测试有一个铁律：**不要用 `Thread.sleep()`**——它要么慢（等太久），要么不稳定（等太短）。

标准做法是用 Awaitility 做条件等待：

```java
@SpringBootTest
class NotifyServiceTest {

    @Autowired private NotifyService notifyService;
    @MockitoBean private EmailClient emailClient;      // Boot 3.4+/4.x：@MockBean 已被取代

    @Test
    void 注册后应发送欢迎邮件() {
        notifyService.register("a@b.com");

        await().atMost(Duration.ofSeconds(5))          // 最多等 5 秒，达成条件即返回
               .untilAsserted(() -> verify(emailClient).send(eq("a@b.com"), any()));
    }
}
```

> **两个版本变化**：`@MockBean` 在 Spring Boot 3.4 起被 `@MockitoBean` 取代（原有注解已移除），详见 [Spring Boot 测试 · @MockBean 已经不存在了](/java/testing/spring-boot-test#mockitobean)。**测试方法内不要依赖事务**——`@Transactional` 测试方法里提交的异步任务在**另一个线程**，看不到测试事务里的数据。

**测试异步还有一个前提**：测试类里的异步方法**必须走代理**（即注入 Bean 调用，而不是 `new` 出来）。若测试中直接 `new NotifyService()`，`@Async` 不会生效，测试会"通过"但什么都没验证到。

## 十一、面试口径 {#interview}

| # | 问题 | 一句话答案 |
|---|---|---|
| 1 | `@Async` 的原理？ | 与 `@Transactional` 共用**同一个代理机制**：调用被 `AsyncExecutionInterceptor` 拦截，把方法调用包装成任务提交给 `Executor`，**立即返回**。因此失效条件（自调用、非 `public`、缺 `@EnableAsync`）也完全相同 |
| 2 | 为什么 `@Async` 默认配置不能上生产？ | 默认执行器是 **`SimpleAsyncTaskExecutor`，每次提交新建一个线程**——无上限、不复用、无队列、无优雅关闭。QPS 不为零的路径必须换成 `ThreadPoolTaskExecutor` 或虚拟线程执行器 |
| 3 | 线程池的 `queueCapacity` 为什么要小心？ | `ThreadPoolExecutor` 的顺序是"**核心满 → 入队 → 队列满才扩到 max**"。队列设得过大（如无界队列）会让 **`maxPoolSize` 永远不生效**，表现为并发上不去 |
| 4 | 推荐哪个拒绝策略？ | `CallerRunsPolicy`——**由提交线程自己执行**，形成天然背压、不丢任务。代价是可能拖慢调用方。默认的 `AbortPolicy` 在异步场景下会抛到无人接收的地方 |
| 5 | 异步任务里为什么取不到 traceId？ | `MDC` 基于 `ThreadLocal`，**异步线程不是提交线程**，因此取不到。用 `TaskDecorator` 在**提交时** `getCopyOfContextMap()` 快照、在执行时 `setContextMap()` 恢复，并在 `finally` 里 `clear()`（线程池复用会串数据） |
| 6 | 除了 MDC 还有哪些上下文会丢？ | `SecurityContext`（`@PreAuthorize` 失效）、`RequestContextHolder`（拿不到 `RequestAttributes`）、`TransactionSynchronizationManager`（异步不在原事务）。前三个需要显式传递，最后一个通常是期望行为 |
| 7 | `void` 返回的异步方法抛异常会怎样？ | **被吞掉**，交给 `AsyncUncaughtExceptionHandler`；默认实现只打一条日志、**无告警**。生产上应自定义处理器，接入监控与告警 |
| 8 | `@Async` 和 `@Transactional` 谁在外层？ | **注解写在方法上时，外层先生效**。`@Async` 在外是常见写法（新线程开事务）。若 `@Transactional` 在外、`@Async` 在内，`@Async` 会因自调用**失效**——推荐拆成两个 Bean |
| 9 | 异步任务读不到刚才插入的数据？ | 异步线程用的是**另一个数据库连接**，看不到调用方事务里未提交的记录。解法是把异步提交放到**事务提交之后**（如 `afterCommit` 回调） |
| 10 | 停机时在跑的异步任务会丢吗？ | 默认会。需要 `setWaitForTasksToCompleteOnShutdown(true)` + `setAwaitTerminationSeconds(n)`。**`awaitTerminationSeconds` 必须设**，且要**小于 K8s 的 `terminationGracePeriodSeconds`**，否则等不到就被 SIGKILL |
| 11 | 什么情况下该换成虚拟线程？ | **IO 密集**任务（HTTP、DB、文件）——阻塞时自动卸载，无需调池大小。**CPU 密集**和**需要限流**的场景不该换：虚拟线程无上限，传统线程池的"池大小 = 并发上限"这一背压能力会消失 |
| 12 | 异步代码怎么写测试？ | 用 **Awaitility** 做条件等待（`await().atMost(...).untilAsserted(...)`），**不要 `Thread.sleep()`**。注意异步方法在测试里也必须走代理（注入 Bean 而非 `new`），且不能依赖测试事务内的数据 |

> 回到：[Spring 横切能力 · 导览](/java/spring/spring-framework/crosscutting/)　|　下一篇：[重试与并发限制](/java/spring/spring-framework/crosscutting/resilience)
