---
order: 8
date: 2026-09-15
sidebar: CompletableFuture 异步编排
title: CompletableFuture 异步编排
desc: Future 的四个不足、创建入口与 commonPool 的坑、方法族速查与 thenApply/thenCompose/thenCombine 的区别、回调究竟执行在哪个线程、异常处理三兄弟与 join/get 差异、超时控制、并行聚合实战、与虚拟线程和结构化并发的关系
---

# CompletableFuture 异步编排

> `Future` 是 Java 5 的产物，它只能回答一个问题："**结果好了吗？**"——想知道结果就必须阻塞等待，想组合两个任务就要自己写调度代码，想处理异常只能在 `get()` 外面 `catch`。
>
> `CompletableFuture`（Java 8）补上了"**怎么把这些等待组装起来**"这一层。本篇按「为什么需要它 → 怎么用 → 执行在哪个线程 → 异常与超时 → 和虚拟线程的关系」来讲——**其中"执行在哪个线程"是最多人答不上来、也是最容易出线上问题的一节。**

## 一、问题场景：`Future` 的四个不足 {#why-completable-future}

```java
// 传统 Future：三个下游并行调用
Future<User> fu = pool.submit(() -> userClient.get(uid));
Future<Order> fo = pool.submit(() -> orderClient.get(uid));
Future<Coupon> fc = pool.submit(() -> couponClient.get(uid));

User user = fu.get();        // ① 阻塞
Order order = fo.get();      // ② 即使 fo 先完成也得等 fu
Coupon c = fc.get();
return new Resp(user, order, c);
```

| `Future` 的不足 | 具体表现 |
|---|---|
| **不能主动完成** | 无法手动 `set` 结果（做 Mock、做适配层时很难受） |
| **不能回调** | 只能阻塞 `get`，没有"完成后通知我"的机制 |
| **不能组合** | 三个任务的依赖关系只能靠手写线程与队列来编排 |
| **异常处理弱** | 业务异常被包在 `ExecutionException` 里，只能在 `get` 处统一 `catch`，无法按阶段处理 |

`CompletableFuture` 的定位就是**"可组合的 Future"**：它实现了 `Future` 与 `CompletionStage`，把"完成后做什么"变成可以**声明式串联**的一串阶段。

## 二、创建：三个入口与线程池选择 {#create}

### 2.1 三个入口 {#factories}

```java
// ① 有返回值的异步任务
CompletableFuture<User> f1 = CompletableFuture.supplyAsync(() -> userClient.get(uid), pool);

// ② 无返回值的异步任务
CompletableFuture<Void> f2 = CompletableFuture.runAsync(() -> log.info("done"), pool);

// ③ 已经知道结果的（用于统一接口/测试）
CompletableFuture<User> f3 = CompletableFuture.completedFuture(user);
CompletableFuture<User> f4 = CompletableFuture.failedFuture(new IllegalStateException("x"));  // JDK 9+
```

### 2.2 `commonPool` 的坑：为什么必须传线程池 {#default-pool}

**不传 `Executor` 时，所有 `*Async` 方法都使用 `ForkJoinPool.commonPool()`**。它有四个问题：

| 问题 | 说明 |
|---|---|
| **并行度是"CPU 核数 - 1"** | 它按 **CPU 密集**任务设计；用来跑阻塞的 IO 调用会让并行度严重不足 |
| **全局共享** | 整个 JVM 共用（包括 `parallelStream`、其他库），**一个慢任务会拖累无关的业务** |
| **无法隔离与监控** | 没法按业务分池，也拿不到队列积压之类的指标 |
| **不能优雅关闭** | `commonPool` 由 JVM 管理，你无法等待它跑完 |

**结论**：**任何涉及 IO 的 `CompletableFuture` 都必须显式传线程池**——可以是业务线程池，也可以是虚拟线程执行器（见第七节）：

```java
Executor ioPool = Executors.newFixedThreadPool(32, r -> {
    Thread t = new Thread(r, "io-pool-");   // ① 命名，便于排查线程栈
    t.setDaemon(false);
    return t;
});
```

## 三、编排：方法族与"执行在哪个线程" {#composition}

### 3.1 方法族速查 {#method-families}

| 类别 | 方法 | 说明 |
|---|---|---|
| **转换** | `thenApply(Function)` | 有入参有返回值（`map`） |
| | `thenAccept(Consumer)` | 有入参无返回值 |
| | `thenRun(Runnable)` | 无入参无返回值（纯"完成后做点什么"） |
| **串行组合** | `thenCompose(Function→CF)` | 后一步依赖前一步的**结果**（`flatMap`） |
| **并行合并** | `thenCombine(other, BiFunction)` | 两个**独立**任务都完成后合并结果 |
| | `thenAcceptBoth` / `runAfterBoth` | 同上，无返回值 / 无入参 |
| **聚合** | `allOf(CF...)` | 全部完成（返回 `CF<Void>`，**结果要自己收集**） |
| | `anyOf(CF...)` | 任一完成（返回 `CF<Object>`，**类型信息丢失**） |
| | `applyToEither` / `acceptEither` | 两个中先完成的那个参与后续 |
| **异常** | `exceptionally` / `handle` / `whenComplete` | 见第四节 |
| **超时** | `orTimeout` / `completeOnTimeout` | 见第五节 |
| **获取** | `join()` / `get()` | 见第四节 |
| **派生** | `thenApplyAsync(...)` 等 **Async 版本** | 强制提交到线程池（影响执行线程，见 3.3） |

### 3.2 `thenApply` / `thenCompose` / `thenCombine` 的区别 {#apply-vs-compose}

这三个是最容易混的：

| 方法 | 用途 | 类比 | 误用的后果 |
|---|---|---|---|
| `thenApply` | **同步转换**：把结果映射成另一个值 | `Stream.map` | 函数里返回 `CF<T>` 会得到 `CF<CF<T>>`（嵌套，类型就不对了） |
| `thenCompose` | **异步串行**：下一步依赖上一步的结果，且下一步本身是异步的 | `Stream.flatMap` | 用它串联**本可并行**的两个调用 → 串行化，RT 翻倍 |
| `thenCombine` | **并行合并**：两个独立任务都完成后合并 | 无直接类比 | 用它表达"有依赖关系"的调用 → 拿不到依赖方的结果 |

```java
// ✗ 嵌套：拿到的是 CompletableFuture<CompletableFuture<Order>>
CompletableFuture<CompletableFuture<Order>> bad =
    getUser(uid).thenApply(u -> getOrder(u.id()));

// ✓ 扁平化：CompletableFuture<Order>
CompletableFuture<Order> ok = getUser(uid).thenCompose(u -> getOrder(u.id()));

// ✓ 两个独立调用并行，再合并（RT ≈ max(t1, t2) 而不是之和）
CompletableFuture<Resp> resp = getUser(uid)
    .thenCombine(getCoupon(uid), Resp::new);
```

**判据一句话**：

> **"后一个调用需要前一个的结果吗？"** 需要 → `thenCompose`（串行）；不需要 → `thenCombine`（并行）。
> **"这个函数返回的是普通值还是 `CompletableFuture`？"** 普通值 → `thenApply`；`CompletableFuture` → `thenCompose`。

### 3.3 回调究竟执行在哪个线程 {#which-thread}

这是 `CompletableFuture` 最反直觉、也最必须掌握的一点。

```java
CompletableFuture<User> f = CompletableFuture.supplyAsync(() -> loadUser(), pool);
f.thenApply(u -> { /* 这个 lambda 跑在哪个线程？ */ });
```

**规则只有三条：**

| # | 规则 |
|---|---|
| ① | **不带 `Async` 的方法**：如果上一个阶段**刚刚由线程 T 完成**，那么回调**直接在 T 上执行**（不切换线程、不提交线程池） |
| ② | **带 `Async` 的方法**（`thenApplyAsync`）：提交到线程池执行（不传参则是 `commonPool`） |
| ③ | **如果前一阶段调用时已经完成**（如 `completedFuture`，或已经 `join` 过的 CF），则回调**在"调用 `thenApply` 的那个线程"上同步执行** |

**由此推出四个实践结论：**

| 结论 | 说明 |
|---|---|
| **执行线程是不确定的** | 同一个方法在不同时序下可能跑在上一阶段的线程、调用线程、或线程池线程 —— **不能假设它在哪个线程** |
| **要"确定在某个池里执行"，必须用 `Async` 形式并显式传池** | 例如需要事务、需要特定 MDC / 上下文、需要线程池隔离时 |
| **要"少一次线程切换"，用非 `Async` 形式** | 若回调很轻（改字段、拼字符串），直接在前一个线程执行更省 |
| **`ThreadLocal` 会丢** | 回调常常不在原线程执行；跨线程传递上下文需要显式手段（见 [ThreadLocal](/java/concurrent/threadlocal)） |

**一个典型的翻车场景**：`CompletableFuture` 链里某一步依赖 `ThreadLocal` 里的租户/用户上下文（由拦截器在线程里设置的），结果在 `thenApplyAsync` 之后拿到的是 `null` —— 因为已经换了线程。**修法**：要么在进入异步链前把上下文**作为参数显式传递**（推荐），要么用能跨线程传递的上下文容器（如可继承的上下文载体、或专门的上下文传播工具）。

**还有一个容易忽略的陷阱**：**用非 `Async` 版本做阻塞操作会占住"上一个阶段的线程"**。

```java
// ✗ 这个阻塞调用会占住 pool 里的一个线程（甚至占住 commonPool 的线程）
supplyAsync(() -> remoteCall(), pool).thenApply(r -> heavyBlockingParse(r));
```

**判据**：**"回调里是否有阻塞/耗时操作？"** 有 → 用 `Async` 并指定池；没有（纯内存计算）→ 用非 `Async` 更划算。

## 四、异常处理三兄弟 {#exception}

### 4.1 `exceptionally` / `handle` / `whenComplete` {#three-handlers}

| 方法 | 何时执行 | 能否改结果 | 能否改类型 | 典型用途 |
|---|---|---|---|---|
| `exceptionally(Function<Throwable,T>)` | **仅异常时** | ✅ 提供兜底值 | ❌ 必须同类型 | 降级返回默认值 |
| `handle(BiFunction<T,Throwable,R>)` | **成功与异常都执行** | ✅ | ✅ 可换类型 | 统一出口：转成业务 `Result` |
| `whenComplete(BiConsumer<T,Throwable>)` | **成功与异常都执行** | ❌ **不能改**（返回值被忽略） | ❌ | 打日志、埋点、释放资源 |

```java
// ① 降级：失败就返回默认值（类型必须一致）
getUser(uid).exceptionally(ex -> {
    log.warn("user 服务降级: {}", ex.getMessage());
    return User.anonymous();
});

// ② 统一出口：成功与失败都转成同一个 Resp
getUser(uid).handle((u, ex) -> ex == null ? Resp.ok(u) : Resp.fail(ex));

// ③ 副作用：只记录，不影响结果
getUser(uid).whenComplete((u, ex) -> {
    if (ex != null) metrics.counter("user.fail").increment();
});
```

**异常传递语义（必须理解）**：

```text
getUser() 抛异常
   ↓
thenApply(...)   ← 被跳过（不执行）
thenApply(...)   ← 被跳过
   ↓
exceptionally(兜底)   ← 在这里被"恢复"成正常结果，链重新变成"成功"
   ↓
后续 thenApply 正常执行
```

**若整条链都没有恢复**（没有 `exceptionally` / `handle`），异常会一直保留到最终 `join()` / `get()` 时抛出。

**一个真实且隐蔽的坑**：**没人获取结果的异步链，异常会静默消失**。

```java
// ✗ 只发不取：失败时既没日志也没告警，问题被"吞掉"
CompletableFuture.runAsync(() -> pushNotification(orderId), pool);
```

**两种处理方式**：① 链上挂 `exceptionally` / `whenComplete` 收口；② 对"只发不取"的异步任务用 `ExecutorService#submit` 并保存返回的 `Future`（便于统一检查），或在链尾显式 `join`（并确保异常被记录）。

### 4.2 `join` 与 `get` 的差异 {#join-vs-get}

| | `get()` | `join()` |
|---|---|---|
| 异常类型 | `ExecutionException`（**受检**） | `CompletionException`（**非受检**） |
| 真实异常 | 在 `getCause()` 里 | 在 `getCause()` 里 |
| 中断 | 抛 `InterruptedException` | **不抛**（不响应中断，会一直等） |
| 适用 | 需要处理中断语义的场合 | **在 lambda / 流式代码里**（不必写 try-catch） |

**注意"包装一层"这件事**：两个方法抛出的都不是**原始异常**，而是包装后的。所以捕获时通常要 `catch (CompletionException e) { Throwable real = e.getCause(); }`，否则按业务异常类型捕获会漏掉。

**另一条要记住的**：`join()` **不响应中断**——如果它等待的任务永远不完成，`join()` 会一直阻塞（这也是必须配超时控制的原因）。

## 五、超时控制 {#timeout}

```java
// ① 超时后以 TimeoutException 完成（链上会走异常分支）
getUser(uid).orTimeout(800, TimeUnit.MILLISECONDS);

// ② 超时后用默认值完成（链上继续走成功分支）
getUser(uid).completeOnTimeout(User.anonymous(), 800, TimeUnit.MILLISECONDS);
```

| 要点 | 说明 |
|---|---|
| **它们是"结果层面的超时"，不是"任务取消"** | 超时后 `CompletableFuture` 会立刻完成，但**底层那个正在执行的任务仍在继续跑**（不会自动中断） |
| **因此下游仍要设自己的超时** | HTTP 客户端、JDBC 的超时不能省——否则"超时返回了但连接还占着" |
| **`orTimeout` 适合"必须知道失败"** | 走异常分支，便于降级与告警 |
| **`completeOnTimeout` 适合"允许兜底"** | 走成功分支，适合"超时就返回空列表/默认值"这类语义 |

**两种超时的语义差别值得单独记**：`orTimeout` 是"**超时即失败**"，`completeOnTimeout` 是"**超时即降级为默认值**"。前者让问题暴露，后者让问题被掩盖——**按业务重要性选择，不要默认用后者**。

**组合使用超时与降级**的常见写法：

```java
CompletableFuture<User> f = getUser(uid)
    .orTimeout(800, TimeUnit.MILLISECONDS)
    .exceptionally(ex -> {                 // 超时、失败都走这里
        log.warn("getUser 降级, uid={}, cause={}", uid, ex.toString());
        return User.anonymous();
    });
```

## 六、并行聚合的实战写法 {#aggregation}

需求：**三个独立下游并行调用，各自可降级，整体有超时。**

```java
public Resp aggregate(String uid) {
    // ① 每个调用各带自己的超时与降级 —— 单个失败不影响整体
    CompletableFuture<User> fu = supplyAsync(() -> userClient.get(uid), ioPool)
        .orTimeout(800, MILLISECONDS)
        .exceptionally(ex -> { log.warn("user 降级", ex); return User.anonymous(); });

    CompletableFuture<Order> fo = supplyAsync(() -> orderClient.get(uid), ioPool)
        .orTimeout(800, MILLISECONDS)
        .exceptionally(ex -> { log.warn("order 降级", ex); return Order.empty(); });

    CompletableFuture<Coupon> fc = supplyAsync(() -> couponClient.get(uid), ioPool)
        .orTimeout(800, MILLISECONDS)
        .exceptionally(ex -> { log.warn("coupon 降级", ex); return Coupon.none(); });

    // ② allOf 等全部完成（返回 CF<Void>，结果需要自己从各子 CF 取）
    return CompletableFuture.allOf(fu, fo, fc)
        .thenApply(ignored -> new Resp(fu.join(), fo.join(), fc.join()))   // 这里 join 不会阻塞：都已完成
        .orTimeout(1000, MILLISECONDS)                                     // ③ 整体兜底超时
        .exceptionally(ex -> Resp.fail())                                  // ④ 整体兜底
        .join();
}
```

**四个关键设计点：**

| # | 设计 | 理由 |
|---|---|---|
| ① | **每个子调用自带超时与降级** | 避免"一个慢下游拖垮整个响应"；降级让部分可用 |
| ② | **`allOf` 之后用 `join()` 取结果不会阻塞** | 因为此刻所有子任务已完成，`join` 立即返回（这也是 `allOf` 的标准用法） |
| ③ | **整体再设一层超时** | 覆盖"某个子任务连超时都没触发"的异常情况 |
| ④ | **整体兜底** | 保证接口永远返回结构化结果，而不是抛异常给上层 |

**必须知道的两个 `allOf` 特性：**

| 特性 | 说明 |
|---|---|
| **返回 `CF<Void>`** | 它只表示"都完成了"，**结果要自己从各子 CF 收集**（常用 `thenApply` + `join`） |
| **失败即短路，但不会取消其他任务** | 任一子任务失败，`allOf` 立即以异常完成；**其余任务仍在后台继续跑**（不会被自动取消） |

**第二条是 `allOf` 与结构化并发最本质的差别**：它没有"失败时取消兄弟任务"的语义，因此失败场景下会有"无人认领的后续动作"（继续消耗线程与连接）。**若需要严格的取消语义，要么自己实现（在 `exceptionally` 里 `cancel` 其他 CF，但注意 `cancel` 只对未开始的任务有效），要么用结构化并发（第七节）。**

## 七、与虚拟线程、结构化并发的关系 {#virtual-threads}

### 7.1 有了虚拟线程，还需要 `CompletableFuture` 吗 {#with-virtual-threads}

虚拟线程让**同步阻塞写法**也能获得高并发（见[内嵌容器与请求进入](/java/spring/spring-boot/web-server)），于是"并行调用三个下游"可以用更朴素的写法：

```java
// 虚拟线程 + 同步代码：可读性远好于回调链
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    Future<User> fu = executor.submit(() -> userClient.get(uid));
    Future<Order> fo = executor.submit(() -> orderClient.get(uid));
    return new Resp(fu.get(), fo.get());
}
```

| 维度 | `CompletableFuture` | 虚拟线程 + 同步代码 |
|---|---|---|
| **可读性** | 链式，回调嵌套后变差 | **好**（顺序写法） |
| **调试** | 栈被切碎，排错难 | **好**（栈完整） |
| **并发能力** | 依赖你给的线程池容量 | **好**（每任务一个虚拟线程） |
| **组合表达力** | **强**：超时、降级、任一完成、合并、触发式完成后回调 | 弱（要自己写） |
| **典型适用** | 需要结果组合 / 超时降级 / 事件回调的编排 | 简单的"并行发起、都等结果" |

**结论**：**虚拟线程替代的是"为了并发而用 `CompletableFuture`"这一动机，但没有替代它的编排能力。** 简单的并行聚合用虚拟线程更清晰；需要"超时 + 降级 + 多路合并 + 完成后触发"这类组合语义时，`CompletableFuture` 仍是直接的表达手段。

### 7.2 结构化并发：`CompletableFuture` 的"继承者"（仍是预览） {#structured-concurrency}

`StructuredTaskScope`（结构化并发）解决的是 `CompletableFuture` / `ExecutorService` 的一个结构性缺陷：**子任务可以活过它的"逻辑父任务"**——失败时其他任务继续跑、中断不传播、线程栈看不出任务层级。

| 维度 | `CompletableFuture` / `ExecutorService` | 结构化并发 |
|---|---|---|
| 子任务生命周期 | 不受父任务约束（可能泄漏） | **不可能活过作用域**（作用域关闭前必须终止） |
| 失败传播 | 需自己处理；`allOf` 失败**不取消**其他任务 | **任一失败自动取消兄弟任务** |
| 可观测性 | 栈被切碎，层级不可见 | 任务层级体现在调用结构上，栈可读 |
| 中断传播 | 不自动传播 | 传播到所有子任务 |

**版本现状（这是关键，别在生产直接上）**：

| 版本 | 状态 |
|---|---|
| JDK 21 | 首次预览（JEP 453） |
| JDK 22 / 23 / 24 | 继续预览（JEP 462 / 480 / 499） |
| **JDK 25** | **第五次预览**（JEP 505）：公开构造器改为静态工厂方法 `StructuredTaskScope.open(...)` |
| **JDK 26** | **第六次预览**（JEP 525）：只剩细节调整（如 `Joiner` 新增 `onTimeout()`） |
| 预计 **JDK 27** | 有望转正 |

**结论**：**API 形态已稳定，但仍需 `--enable-preview` 才能编译运行，不适合作为生产依赖**。面试里可以答"它解决什么问题、与 `CompletableFuture` 的语义差别"，但不要声称已经在生产使用。

## 八、常见坑 {#pitfalls}

| 坑 | 症状 | 修法 |
|---|---|---|
| **不传线程池** | IO 任务挤在 `commonPool`（并行度 = 核数-1），拖累全局 | 显式传业务池或虚拟线程执行器 |
| **用 `thenApply` 返回 `CF`** | 得到 `CF<CF<T>>`，类型嵌套 | 用 `thenCompose` |
| **该并行却用了 `thenCompose`** | RT 变成两者之和 | 独立调用用 `thenCombine` |
| **以为回调在"我指定的线程"** | 上下文丢失、事务失效、`ThreadLocal` 为 `null` | 明确用 `xxxAsync(..., executor)`；上下文显式传参 |
| **在非 `Async` 回调里做阻塞操作** | 占住上一阶段的线程 | 用 `Async` + 指定池 |
| **异步链没有终端处理** | 异常被静默吞掉，无日志无告警 | 挂 `exceptionally` / `whenComplete` 收口 |
| **`whenComplete` 想改结果** | 改了没生效（返回值被忽略） | 改结果用 `handle` / `exceptionally` |
| **`join()` 不响应中断** | 线程卡死无法通过中断退出 | 必须配 `orTimeout` / `completeOnTimeout` |
| **以为 `orTimeout` 会取消任务** | 下游连接仍被占用 | 下游客户端自身也要设超时 |
| **`allOf` 失败以为其他任务会取消** | 剩余任务继续跑，浪费资源 | 自己控制，或用结构化并发 |
| **`anyOf` 拿结果做类型转换** | `ClassCastException`（返回 `CF<Object>`） | 用 `applyToEither` 保留类型 |

## 九、使用场景与面试问答 {#interview}

**Q1：`CompletableFuture` 解决了 `Future` 的什么问题？**

四个方面：**不能主动完成**（无法手动设置结果）、**不能回调**（只能阻塞 `get`）、**不能组合**（多任务编排要自己写调度）、**异常处理弱**（业务异常被包装成 `ExecutionException`，只能统一 `catch`）。它实现了 `CompletionStage`，把"完成后做什么"变成可声明式串联的阶段。

**Q2：`thenApply`、`thenCompose`、`thenCombine` 有什么区别？**

- `thenApply`：**同步转换**（类比 `map`），函数返回普通值；若返回值是 `CompletableFuture` 会得到嵌套的 `CF<CF<T>>`；
- `thenCompose`：**串行依赖**（类比 `flatMap`），后一步依赖前一步的结果且本身异步；会自动扁平化；
- `thenCombine`：**并行合并**，两个**独立**任务都完成后合并结果。

**判据**：后一个调用依赖前一个结果 → `thenCompose`（串行）；不依赖 → `thenCombine`（并行，RT 从"之和"降为"最大值"）。

**Q3：`CompletableFuture` 的回调执行在哪个线程？**

三条规则：① **不带 `Async`**：若上一阶段刚由线程 T 完成，回调**直接在 T 上执行**；② **带 `Async`**：提交到线程池（不传参则 `commonPool`）；③ **若前一阶段在调用时已完成**（如 `completedFuture`），回调**在调用线程上同步执行**。

**所以执行线程是不确定的**——要保证在某池中执行（需要事务、上下文、MDC）就用 `xxxAsync(..., executor)`；要减少切换且回调很轻就用非 `Async` 版本。这也是异步链里 `ThreadLocal` 会丢的根本原因。

**Q4：为什么不建议使用默认的 `commonPool`？**

`ForkJoinPool.commonPool()` 的并行度是 **CPU 核数 - 1**，它是为 **CPU 密集**任务设计的；用来跑阻塞 IO 会导致并行度严重不足。更麻烦的是它**全 JVM 共享**（含 `parallelStream` 与其他库），一个慢任务会拖累无关业务，而且无法隔离、无法监控、不能优雅关闭。**涉及 IO 一律显式传线程池。**

**Q5：`exceptionally`、`handle`、`whenComplete` 怎么选？**

`exceptionally` **只在异常时**执行，用于提供**同类型**兜底值；`handle` **成功与异常都执行**，能同时拿到结果与异常，且**可以改变结果类型**（适合统一转成业务 `Result`）；`whenComplete` **都执行但不能改变结果**（返回值被忽略），适合打日志、埋点、释放资源。

**Q6：`get()` 和 `join()` 有什么区别？**

异常类型不同：`get()` 抛受检的 `ExecutionException`，`join()` 抛非受检的 `CompletionException`（真实异常都在 `getCause()` 里）。另外 `join()` **不响应中断**（`get()` 会抛 `InterruptedException`）。因此在 lambda 里用 `join()` 更省事，但**必须配超时控制**，否则可能永久阻塞。

**Q7：`allOf` 有什么需要注意的？**

两点：① 它返回 **`CF<Void>`**，只表示"都完成了"，**各子任务的结果要自己收集**（标准写法是 `allOf(...).thenApply(x -> new R(f1.join(), f2.join()))`，此时 `join` 不会阻塞因为都已完成）；② **任一子任务失败则 `allOf` 立即异常完成，但其余任务不会被取消**，会继续在后台跑完。**第 ② 点正是它与结构化并发最本质的差别**——需要严格的"失败即取消"语义时，`CompletableFuture` 给不了。

**Q8：`orTimeout` 会取消任务吗？**

不会。它只让**这个 `CompletableFuture` 的结果**变成超时失败，**底层正在执行的任务仍在继续**。所以下游调用（HTTP 客户端、JDBC）自身也必须设置超时，否则会出现"接口超时返回了，但连接还被占着"的资源泄漏。

**Q9：有了虚拟线程，还需要 `CompletableFuture` 吗？**

虚拟线程让"同步阻塞写法"也能获得高并发，因此**简单的"并行发起、都等结果"用虚拟线程 + 同步代码更清晰**（栈完整、易调试）。但 `CompletableFuture` 的**组合表达能力**仍是它不可替代的部分：超时、降级、任一完成、多路合并、完成后触发式回调。**结论：虚拟线程替代了"为了并发而用它"的动机，没有替代它的编排能力。**

**Q10：结构化并发（`StructuredTaskScope`）和 `CompletableFuture` 的关系？**

结构化并发解决的是"子任务可能活过逻辑父任务"这个结构性问题：子任务**不可能活过作用域**、**任一失败自动取消兄弟任务**、中断会传播、任务层级在栈上可见。它是 `CompletableFuture` / `ExecutorService` 在**生命周期与错误传播**上的补强。

**但要注意版本现状**：它从 JDK 21 起持续预览，**JDK 25 是第五次预览（JEP 505）、JDK 26 是第六次预览（JEP 525），预计 JDK 27 转正**——目前仍需 `--enable-preview`，**不适合作为生产依赖**。

---

> 相关篇目：[线程池](/java/concurrent/thread-pool)（异步任务的执行载体与参数设定）、[ThreadLocal](/java/concurrent/threadlocal)（为什么异步链会丢上下文）、[内嵌容器与请求进入](/java/spring/spring-boot/web-server)（虚拟线程在 Web 层的接入方式）、[进程、线程与调度](/fundamentals/os/process-thread)（虚拟线程与载体线程的关系）。
