---
date: 2026-09-13
title: Java 并发 · 导览
---

# Java 并发 · 导览

并发是 Java 面试里**最难蒙的一块**：它不像集合那样「看一眼源码就能复述」，而是要求你把 **JVM 内存模型 → 硬件层面的指令重排 → JUC 的锁与工具** 这条链路串起来。很多人能背出「`volatile` 保证可见性、不保证原子性」，却答不上「那给 `i++` 加 `synchronized` 就能保证了吗」「为什么 `wait` 必须写在 `synchronized` 里」——这类追问才是分水岭。

本板块按 **「线程本身 → 并发安全 → JUC 工具」** 三层组织：先搞清楚线程是什么、状态怎么流转，再讲清楚「为什么会有并发问题」以及 `synchronized` / `volatile` / `final` / `CAS` 各自解决了其中哪一部分，最后落到每天都在用的线程池、同步工具、并发容器与异步编排。

## 一、整体体系 {#system}

先把这一块压成一张表，建立全局印象：

| 层次 | 要解决的问题 | 核心内容 | 本板块篇目 |
|---|---|---|---|
| **线程本身** | 我的代码在哪个线程跑、跑到哪一步了 | 进程 / 线程、创建方式、六种状态、`wait` / `notify`、中断 | [线程基础](/java/concurrent/thread-basics) |
| **并发安全** | 多线程同时读写同一份数据，为什么会错 | 三大特性、JMM、`volatile`、`synchronized` 与锁升级、`final` 语义与安全发布 | [线程安全与内存可见性](/java/concurrent/thread-safety) |
| **无锁方案** | 加锁太重，能不能不加锁也保证原子性 | CAS、ABA、原子类、`LongAdder` | [CAS 与原子类](/java/concurrent/cas-atomics) |
| **锁与同步器** | 需要更灵活的锁、需要排队与条件等待 | AQS、`ReentrantLock`、`Condition`、读写锁与乐观读、死锁 | [AQS 与锁](/java/concurrent/aqs-locks) |
| **同步工具** | 线程之间要互相等、要限流、要交换数据 | `CountDownLatch` / `CyclicBarrier` / `Semaphore` / `Exchanger` / `Phaser` 的语义差异与选型 | [JUC 工具类横向对比](/java/concurrent/juc-tools) |
| **线程池** | 线程不能随手 new，要复用、要可控 | 七大参数、执行流程、拒绝策略、参数怎么定 | [线程池](/java/concurrent/thread-pool) |
| **并发容器** | `HashMap` 多线程下会坏，需要一个安全的替代 | `ConcurrentHashMap`、`CopyOnWriteArrayList`、阻塞队列 | [并发容器](/java/concurrent/concurrent-collections) |
| **线程封闭** | 变量不想被共享，想「一人一份」 | `ThreadLocal`、内存泄漏、跨线程传递 | [ThreadLocal](/java/concurrent/threadlocal) |
| **异步编排** | 多个任务要并行发起、还要组合结果与处理异常 | `Future` 的不足、`CompletableFuture` 方法族、执行线程、超时与降级 | [CompletableFuture 异步编排](/java/concurrent/completable-future) |

## 二、三条主线 {#threads}

三条线是**递进**关系：先有「共享」，才有「安全」，最后才需要「工具」：

```text
主线一：线程本身
  进程 vs 线程 ── 创建方式（Thread / Runnable / Callable / 线程池）
                    └─ 六种状态 ── wait / notify / sleep / join ── 中断与优雅停止

主线二：并发安全（问题从哪来、怎么治）
  三大特性 ── 原子性 ──── synchronized / Lock / 原子类
              ├─ 可见性 ── volatile / synchronized
              └─ 有序性 ── volatile / happens-before
             └─ 底座：JMM（主内存 + 工作内存）与指令重排
                └─ JMM 的三个关键字：volatile / synchronized / final（+ 安全发布）

主线三：JUC 工具（JDK 提供了什么）
  AQS（volatile state + FIFO 队列，多数锁与同步器的地基）
    ├─ ReentrantLock / ReentrantReadWriteLock / StampedLock
    ├─ 线程池 ThreadPoolExecutor
    ├─ 并发容器 ConcurrentHashMap / CopyOnWriteArrayList / 阻塞队列
    └─ 异步编排 CompletableFuture（可组合的 Future，实现 CompletionStage）

  线程协作工具（★ 注意：不全是 AQS 实现）
    └─ CountDownLatch / CyclicBarrier / Semaphore / Exchanger / Phaser
       （CyclicBarrier 用 Lock + Condition 实现，Exchanger 用 CAS 自旋）
```

## 三、本板块导航 {#navigation}

| 篇目 | 覆盖内容 | 关键问题 |
|---|---|---|
| [线程基础](/java/concurrent/thread-basics) | 进程 / 线程、并发 / 并行、四种创建方式、`run` vs `start`、六种状态、`wait` / `notify`、`sleep` vs `wait`、顺序执行、优雅停止 | 线程有哪些状态？`sleep` 和 `wait` 区别？怎么停一个线程？ |
| [线程安全与内存可见性](/java/concurrent/thread-safety) | 三大特性、JMM、`happens-before`、`volatile` 两层语义、`synchronized` 原理、锁升级与锁优化、**`final` 内存语义与安全发布** | 并发问题的根源是什么？`volatile` 怎么保证可见性？锁升级过程？`final` 在 JMM 里有什么保证？ |
| [CAS 与原子类](/java/concurrent/cas-atomics) | CAS 三要素与自旋、ABA 问题、`Unsafe`、原子类家族、`LongAdder`、乐观锁 vs 悲观锁 | CAS 是什么？ABA 怎么解决？`AtomicLong` 和 `LongAdder` 选哪个？ |
| [AQS 与锁](/java/concurrent/aqs-locks) | AQS 的 state 与队列、公平 / 非公平、`ReentrantLock` 加解锁、`Condition`、**读写锁与 `StampedLock` 乐观读**、`synchronized` vs `Lock`、死锁四条件与诊断 | AQS 原理？`ReentrantLock` 怎么实现可重入？读写锁怎么用？`StampedLock` 乐观读的原理？死锁怎么排查？ |
| [JUC 工具类横向对比](/java/concurrent/juc-tools) | `CountDownLatch` / `CyclicBarrier` / `Semaphore` / `Exchanger` / `Phaser` 的语义差异、AQS 归属、选型判据、10 条实战坑 | 这几个工具分别在等什么？`Latch` 和 `Barrier` 怎么选？`Semaphore` 和线程池有什么区别？ |
| [线程池](/java/concurrent/thread-pool) | 七大参数、执行流程、四种拒绝策略、阻塞队列族、`Executors` 的坑、核心线程数怎么定、状态与关闭、监控 | 线程池参数与执行原理？为什么不用 `Executors`？核心线程数怎么定？ |
| [并发容器](/java/concurrent/concurrent-collections) | `HashMap` 的并发问题、`ConcurrentHashMap` 1.7 vs 1.8、put 与扩容、`CopyOnWriteArrayList`、阻塞队列 | `ConcurrentHashMap` 怎么保证线程安全？1.7 和 1.8 有什么区别？ |
| [ThreadLocal](/java/concurrent/threadlocal) | 线程封闭、`ThreadLocalMap` 结构、为什么内存泄漏、正确用法、父子线程传递、典型应用 | `ThreadLocal` 原理？为什么会泄漏？线程池里要注意什么？ |
| [CompletableFuture 异步编排](/java/concurrent/completable-future) | `Future` 的四个不足、创建入口与 `commonPool` 的坑、方法族与 `thenApply`/`thenCompose`/`thenCombine` 区别、**回调执行在哪个线程**、异常处理三兄弟、`join` vs `get`、超时、并行聚合实战、与虚拟线程和结构化并发的关系 | `CompletableFuture` 的回调在执行哪个线程？`allOf` 有什么坑？有了虚拟线程还需要它吗？ |

## 四、高频考点速查 {#faq}

按「问 → 答 → 详见」压缩成一张表，面试前扫一遍即可。

| 高频问题 | 一句话答案 | 详见 |
|---|---|---|
| 进程和线程的区别？ | 进程是资源分配的最小单位、有独立内存；线程是 CPU 调度的最小单位、共享进程资源、切换更轻 | [线程基础](/java/concurrent/thread-basics#process-vs-thread) |
| 并发和并行的区别？ | 并发是「轮流做」（时间片轮转），并行是「同时做」（多核真并行） | [线程基础](/java/concurrent/thread-basics#concurrency-vs-parallel) |
| 线程有哪几种创建方式？ | 本质只有一种——构造 `Thread` 并调 `start()`；`Runnable` / `Callable` 只是「任务」的不同写法，第四种是把任务交给线程池 | [线程基础](/java/concurrent/thread-basics#create-thread) |
| `run()` 和 `start()` 的区别？ | `start()` 才会新建线程并由 JVM 回调 `run()`，且只能调一次；直接调 `run()` 只是当前线程里的普通方法调用 | [线程基础](/java/concurrent/thread-basics#run-vs-start) |
| 线程有哪六种状态？ | `NEW` / `RUNNABLE` / `BLOCKED` / `WAITING` / `TIMED_WAITING` / `TERMINATED`；注意 `RUNNABLE` 包含了操作系统的「就绪 + 运行 + IO 等待」 | [线程基础](/java/concurrent/thread-basics#thread-state) |
| `sleep` 和 `wait` 的区别？ | 归属不同（`Thread` 静态方法 vs `Object` 成员方法）；**`wait` 会释放锁，`sleep` 不会**；`wait` 要靠 `notify` 或超时唤醒 | [线程基础](/java/concurrent/thread-basics#sleep-vs-wait) |
| 如何优雅地停止一个线程？ | 用 `interrupt()` 配合 `isInterrupted()` 检查，或 `volatile` 标志位；`stop()` 已废弃（会破坏数据一致性） | [线程基础](/java/concurrent/thread-basics#stop-thread) |
| 并发问题的根源是什么？ | 三大特性被破坏：原子性、可见性、有序性（本质是 CPU 缓存、指令重排、线程切换） | [线程安全](/java/concurrent/thread-safety#three-features) |
| `volatile` 的作用？ | 保证可见性 + 禁止指令重排（内存屏障），**不保证原子性**，所以 `i++` 依然会错 | [线程安全](/java/concurrent/thread-safety#volatile) |
| `synchronized` 的底层原理？ | 基于对象头 Mark Word + Monitor（`Owner` / `EntryList` / `WaitSet`），并支持锁升级 | [线程安全](/java/concurrent/thread-safety#synchronized-principle) |
| 锁升级的过程？ | 无锁 → 偏向锁 → 轻量级锁（CAS 自旋）→ 重量级锁；**不是一有竞争就重量级**，自旋成功不会升级 | [线程安全](/java/concurrent/thread-safety#lock-upgrade) |
| **`final` 在 JMM 里有什么保证？** | 两条重排序规则：构造器内写 `final` 字段**不能重排到「发布该对象引用」之后**；「初次读对象引用」不能重排到「初次读它的 `final` 字段」之后。结论：只要 `this` 不逸出，**无需同步就能看到 `final` 字段的初始化值** | [线程安全](/java/concurrent/thread-safety#final-and-publication) |
| **什么是「安全发布」？有几种方式？** | 让其他线程看到**完整构造好**的对象。只有四种：静态初始化器、`final` 字段、`volatile` / 原子引用、锁或并发容器 | [线程安全](/java/concurrent/thread-safety#final-and-publication) |
| **DCL 为什么必须加 `volatile`（而不是靠 `final`）？** | 因为 `instance` 是 `static` 字段不是 `final` 字段，享受不到 `final` 的重排序规则，只能靠 `volatile` 屏障挡住「分配 → 赋引用 → 初始化」这次重排 | [线程安全](/java/concurrent/thread-safety#final-and-publication) |
| CAS 是什么？有什么问题？ | 比较并交换（`V` / `A` / `B`），无锁保证原子性；问题是 ABA、自旋耗 CPU、只能保证一个变量 | [CAS 与原子类](/java/concurrent/cas-atomics#cas) |
| ABA 问题怎么解决？ | 用 `AtomicStampedReference` 加版本号，或 `AtomicMarkableReference` 加布尔标记 | [CAS 与原子类](/java/concurrent/cas-atomics#aba) |
| `AtomicLong` 和 `LongAdder` 的区别？ | 高并发下 `LongAdder` 用「分段累加」把热点分散到多个 Cell，写更快；读（`sum()`）需要汇总，略慢 | [CAS 与原子类](/java/concurrent/cas-atomics#longadder) |
| AQS 是什么？ | 用 `volatile int state` + FIFO 双向队列实现的同步器框架，`ReentrantLock` / `Semaphore` / `CountDownLatch` 都基于它 | [AQS 与锁](/java/concurrent/aqs-locks#aqs) |
| `ReentrantLock` 怎么实现可重入？ | `state` 计数：同一线程再次获取时 `state + 1`，释放时 `state - 1`，减到 0 才真正释放 | [AQS 与锁](/java/concurrent/aqs-locks#reentrantlock) |
| `synchronized` 和 `Lock` 的区别？ | 关键字 vs 接口；自动释放 vs 手动 `unlock`；`Lock` 支持可中断、可超时、公平锁、多个 `Condition` | [AQS 与锁](/java/concurrent/aqs-locks#sync-vs-lock) |
| **读写锁的原理？** | 把 AQS 的 `int state` 拆成**高 16 位读锁计数、低 16 位写锁重入数**（上限都是 65535），一次 CAS 管两把锁；**支持锁降级（写 → 读），不支持锁升级** | [AQS 与锁](/java/concurrent/aqs-locks#readwrite-lock) |
| **`StampedLock` 的乐观读是什么？** | `tryOptimisticRead()` 只领一个版本号、完全不加锁，读完用 `validate(stamp)` 校验期间有没有写过；**校验通过才建立 happens-before**。代价：不可重入、不支持 `Condition`、不实现 `Lock` | [AQS 与锁](/java/concurrent/aqs-locks#readwrite-lock) |
| 死锁的四个必要条件？ | 互斥、请求与保持、不可剥夺、循环等待；破坏任意一个即可避免（最常用：统一加锁顺序） | [AQS 与锁](/java/concurrent/aqs-locks#deadlock) |
| **`CountDownLatch` 和 `CyclicBarrier` 怎么选？** | 减法 / 一次性 / 「主等从」用 `CountDownLatch`；加法 / 可循环 / 「互相等」用 `CyclicBarrier`。**`CyclicBarrier` 不是 AQS 实现**（用 `ReentrantLock` + `Condition`） | [JUC 工具类](/java/concurrent/juc-tools#cyclic-barrier) |
| **`Semaphore` 和线程池的区别？** | 线程池管「谁去干」（创建并复用线程），`Semaphore` 管「同时几个在干」（限并发数，不创建线程） | [JUC 工具类](/java/concurrent/juc-tools#semaphore) |
| **`Phaser` 比 `CyclicBarrier` 强在哪？** | 参与者可动态 `register` / `arriveAndDeregister`，还支持分层（Phaser 树）；代价是 API 复杂得多 | [JUC 工具类](/java/concurrent/juc-tools#phaser) |
| 线程池的核心参数与执行原理？ | 7 个参数（核心 / 最大 / 空闲时间 / 单位 / 队列 / 工厂 / 拒绝策略）；执行顺序是「核心 → 队列 → 救急 → 拒绝」 | [线程池](/java/concurrent/thread-pool#pool-flow) |
| 为什么不建议用 `Executors` 创建线程池？ | 队列无界（`LinkedBlockingQueue`）或线程数无界（`Integer.MAX_VALUE`），任务堆积就 OOM；应用 `ThreadPoolExecutor` 手动指定有界参数 | [线程池](/java/concurrent/thread-pool#why-not-executors) |
| 核心线程数怎么定？ | CPU 密集型约 `N+1`，IO 密集型约 `2N`（或 `2N+1`）；公式只是起点，最终要靠压测 | [线程池](/java/concurrent/thread-pool#pool-size) |
| `ConcurrentHashMap` 怎么保证线程安全？ | 1.7 用 `Segment` 分段锁；1.8 改为「CAS 写空桶 + `synchronized` 锁首节点」，锁粒度更细 | [并发容器](/java/concurrent/concurrent-collections#chm-18) |
| `ThreadLocal` 为什么会内存泄漏？ | `Entry` 的 key 是弱引用（`ThreadLocal` 被回收后 key 变 null），value 是强引用且随线程存活；线程池复用线程时不 `remove` 就会堆积 | [ThreadLocal](/java/concurrent/threadlocal#memory-leak) |
| **`CompletableFuture` 比 `Future` 多了什么？** | 可主动完成、可链式回调、可组合（`thenCompose`/`thenCombine`/`allOf`）、可按阶段处理异常（实现了 `CompletionStage`） | [CompletableFuture](/java/concurrent/completable-future#why-completable-future) |
| **`thenApply` / `thenCompose` / `thenCombine` 的区别？** | `thenApply` 同步转换（返回 `CF` 会嵌套）、`thenCompose` 串行依赖（自动扁平化）、`thenCombine` 两个独立任务并行后合并 | [CompletableFuture](/java/concurrent/completable-future#apply-vs-compose) |
| **`CompletableFuture` 的回调在哪个线程执行？** | 不带 `Async` 时**跑在上一个阶段的完成线程上**（若上一阶段已完成，则跑在调用线程）；要固定线程池必须用 `xxxAsync(..., executor)` | [CompletableFuture](/java/concurrent/completable-future#which-thread) |
| **为什么不能使用默认的 `commonPool`？** | 并行度是「CPU 核数 - 1」、全 JVM 共享（含 `parallelStream`）、无法隔离监控与关闭；涉及 IO 必须传自己的池 | [CompletableFuture](/java/concurrent/completable-future#default-pool) |
| **`exceptionally` / `handle` / `whenComplete` 怎么选？** | 前者仅异常时执行（同类型兜底）；`handle` 两者都执行且**能改结果与类型**；`whenComplete` 两者都执行但**不能改结果** | [CompletableFuture](/java/concurrent/completable-future#three-handlers) |
| **`join()` 和 `get()` 的区别？** | `get` 抛受检的 `ExecutionException`，`join` 抛非受检的 `CompletionException`；且 **`join` 不响应中断** | [CompletableFuture](/java/concurrent/completable-future#join-vs-get) |
| **`allOf` 有什么坑？** | 返回 `CF<Void>`（结果要自己收）；**任一失败即短路，但其余任务不会被取消**——这正是与结构化并发最本质的差别 | [CompletableFuture](/java/concurrent/completable-future#aggregation) |
| **`orTimeout` 会取消任务吗？** | 不会，只让结果变成超时失败，底层任务仍在跑；因此下游客户端自身也必须设超时 | [CompletableFuture](/java/concurrent/completable-future#timeout) |
| **有了虚拟线程还需要 `CompletableFuture` 吗？** | 简单的"并行发起 + 都等结果"用虚拟线程更清晰；但超时/降级/多路合并/触发式回调这类**编排能力**仍是它的价值 | [CompletableFuture](/java/concurrent/completable-future#with-virtual-threads) |
| **结构化并发（`StructuredTaskScope`）现在能用吗？** | 还不能——JDK 25 第五次预览（JEP 505）、JDK 26 第六次预览（JEP 525），预计 JDK 27 转正，目前需 `--enable-preview` | [CompletableFuture](/java/concurrent/completable-future#structured-concurrency) |
