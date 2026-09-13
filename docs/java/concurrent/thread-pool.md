---
date: 2026-09-13
title: 线程池
sidebar: 线程池
order: 5
---

# 线程池

线程是操作系统里**最贵的资源之一**：创建一个线程要向内核申请、分配约 1MB 的栈空间；销毁时要回收。如果每个任务都 `new Thread()`，那么「创建 + 销毁」的开销很可能比任务本身还大——而且线程数量完全失控，一波动高峰就能把机器压垮。

线程池解决的就是这三件事：**复用线程、控制并发数量、提供排队与拒绝机制**。

## 一、为什么要用线程池 {#why-pool}

| 收益 | 说明 |
|---|---|
| **降低资源消耗** | 线程复用，避免频繁创建 / 销毁。创建线程要陷入内核、分配栈内存，成本远高于一次普通方法调用 |
| **提高响应速度** | 任务到达时线程已经就绪，省掉了创建线程的等待时间 |
| **可管理、可控制** | 能限制最大并发数、给任务排队、在过载时按策略拒绝，避免无限堆积把系统拖死 |
| **可监控** | 能拿到活跃线程数、队列积压、完成任务数，这是线上排障的重要观测点 |

## 二、七个核心参数 {#core-params}

`ThreadPoolExecutor` 的构造方法有七个参数，**必须能逐个说出含义**：

```java
public ThreadPoolExecutor(
        int corePoolSize,                      // ① 核心线程数
        int maximumPoolSize,                   // ② 最大线程数
        long keepAliveTime,                    // ③ 救急线程的空闲存活时间
        TimeUnit unit,                         // ④ 时间单位
        BlockingQueue<Runnable> workQueue,     // ⑤ 任务队列
        ThreadFactory threadFactory,           // ⑥ 线程工厂
        RejectedExecutionHandler handler) { }  // ⑦ 拒绝策略
```

| # | 参数 | 要点 |
|---|---|---|
| ① | `corePoolSize` | **常驻线程数**，即使空闲也默认保留（除非开了 `allowCoreThreadTimeOut`） |
| ② | `maximumPoolSize` | 核心 + **救急线程**的上限，只有在**队列满了**之后才会创建 |
| ③ | `keepAliveTime` | 救急线程空闲多久被回收；开了 `allowCoreThreadTimeOut(true)` 后对核心线程也生效 |
| ④ | `unit` | ③ 的时间单位 |
| ⑤ | `workQueue` | 等待执行的任务队列，**必须用有界队列**（见下文） |
| ⑥ | `threadFactory` | 自定义线程创建方式，**最重要的一点是给线程起名**（否则排障时全是 `pool-1-thread-3` 根本看不出业务） |
| ⑦ | `handler` | 队列满且线程数达上限时的兜底策略 |

## 三、执行原理 {#pool-flow}

这是线程池面试的**第一必问题**。四个判断依次进行：

```text
提交一个任务 execute(task)
        │
        ▼
① 当前线程数 < corePoolSize ？
      是 ──▶ 直接创建【核心线程】执行任务
      否
        │
        ▼
② 尝试把任务放进【队列】── 成功？ ── 是 ──▶ 排队等着，由空闲线程来取
      否（队列满了）                          ★ 注意：这一步在创建救急线程之前
        │
        ▼
③ 当前线程数 < maximumPoolSize ？
      是 ──▶ 创建【救急线程】执行任务
      否
        │
        ▼
④ 执行【拒绝策略】
```

**最容易答错的一点**：很多人以为「核心线程满了就创建新线程」，实际顺序是**「核心线程 → 队列 → 救急线程 → 拒绝」**——**只有队列满了，才会去创建非核心线程**。这也解释了一个常见困惑：为什么把 `maximumPoolSize` 设得很大却感觉没用？因为队列没满，救急线程根本不会被创建。

由此还能推出一个实用结论：**如果希望「并发优先」而不是「排队优先」，就该用小容量队列**（例如 `SynchronousQueue`），让任务一多就立刻扩线程。

## 四、四种拒绝策略 {#reject-policy}

`RejectedExecutionHandler` 有四个现成实现：

| 策略 | 行为 | 适用 |
|---|---|---|
| `AbortPolicy` | **默认**，直接抛 `RejectedExecutionException` | 希望明确知道任务被拒（能配合上游重试或告警） |
| `CallerRunsPolicy` | **让提交任务的线程自己执行**这个任务 | 不想丢任务、且能接受「上游被拖慢形成天然背压」 |
| `DiscardOldestPolicy` | 丢掉队列里**最老**的任务，再提交当前任务 | 只关心最新数据的场景（如实时状态上报） |
| `DiscardPolicy` | **静默丢弃**当前任务，不做任何事 | 几乎不推荐——任务悄悄消失，排查起来极痛苦 |

`CallerRunsPolicy` 值得单说：它把任务「退回」给调用者，于是调用者线程被占用、短时间内没法继续提交新任务——这形成了一种**自动的背压（back pressure）**。在「宁可慢也不丢」的场景里，它是四个里最稳妥的选择。

## 五、阻塞队列怎么选 {#blocking-queue}

| 队列 | 结构 | 是否有界 | 特点 |
|---|---|---|---|
| `ArrayBlockingQueue` | 数组 | **强制有界** | FIFO，一把锁，容量必须在构造时指定 |
| `LinkedBlockingQueue` | 链表 | 可选（**默认 `Integer.MAX_VALUE`**） | 两把锁（头尾分离），并发性能更好；默认无界是**最大隐患** |
| `SynchronousQueue` | 不存储元素 | 容量 0 | 每个 `put` 必须等一个 `take`，**没有线程在等就直接创建线程** |
| `PriorityBlockingQueue` | 堆 | 无界 | 按优先级出队 |
| `DelayQueue` | 延迟堆 | 无界 | 元素到期才能出队，适合定时任务 |
| `LinkedTransferQueue` | 链表 | 无界 | 多了 `transfer()`：生产者亲自把元素交给消费者 |
| `LinkedBlockingDeque` | 双向链表 | 可选 | 支持两端操作，可用于工作窃取 |

两条实践经验：

1. **生产环境优先 `ArrayBlockingQueue`**（容量明确、强制有界）。用 `LinkedBlockingQueue` 一定要**显式传容量**，否则就是给内存埋雷。
2. **`SynchronousQueue` 适合「任务提交频率高、每个任务都很短」**的场景——它让线程池尽量多地创建线程来消化任务，但线程数会逼近 `maximumPoolSize`，必须配合合理的上限。

## 六、`Executors` 提供的四种线程池 {#executors}

`Executors` 是个工具类，预置了四种常见配置，方便快速使用：

| 工厂方法 | 核心 / 最大 | 队列 | 特点与适用 |
|---|---|---|---|
| `newFixedThreadPool(n)` | `n` / `n` | `LinkedBlockingQueue`（**无界**） | 固定线程数，适合任务量已知的耗时任务 |
| `newSingleThreadExecutor()` | `1` / `1` | `LinkedBlockingQueue`（**无界**） | 单线程串行执行，天然保证顺序 |
| `newCachedThreadPool()` | `0` / `Integer.MAX_VALUE` | `SynchronousQueue` | 线程按需创建、空闲 60 秒回收，适合短任务高并发 |
| `newScheduledThreadPool(n)` | `n` / `Integer.MAX_VALUE` | `DelayedWorkQueue` | 支持定时 / 周期任务 |

## 七、为什么不建议用 `Executors` {#why-not-executors}

上面那张表里加粗的地方就是答案——**它们要么队列无界，要么线程数无界**：

| 线程池 | 隐患 | 后果 |
|---|---|---|
| `newFixedThreadPool` / `newSingleThreadExecutor` | 队列是 `LinkedBlockingQueue`，**默认容量 `Integer.MAX_VALUE`** | 任务处理速度跟不上提交速度时，任务无限堆积 → **OOM** |
| `newCachedThreadPool` / `newScheduledThreadPool` | `maximumPoolSize` 是 `Integer.MAX_VALUE` | 短时间大量任务 → 创建海量线程 → **OOM / 线程耗尽** |

《阿里巴巴 Java 开发手册》明确要求：**线程池不允许使用 `Executors` 去创建，而应通过 `ThreadPoolExecutor` 的方式**，理由正是让使用者清楚每个参数的含义、避免无界带来的风险。

推荐的生产级写法是这样的：

```java
ThreadPoolExecutor executor = new ThreadPoolExecutor(
        8,                                        // 核心：先按经验值给
        16,                                       // 最大：留出应对突发峰值的余量
        60L, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(200),            // ★ 有界队列
        new ThreadFactory() {                     // ★ 给线程起名，便于排障
            private final AtomicInteger seq = new AtomicInteger(1);
            @Override
            public Thread newThread(Runnable r) {
                return new Thread(r, "order-notify-" + seq.getAndIncrement());
            }
        },
        new ThreadPoolExecutor.CallerRunsPolicy());// ★ 宁可慢也不丢
```

## 八、核心线程数怎么定 {#pool-size}

先记住结论，再说为什么：

| 任务类型 | 经验公式 | 理由 |
|---|---|---|
| **CPU 密集型**（计算、加解密、编解码） | **`N + 1`** | 线程在跑的时候占满 CPU，线程数超过核数只会增加上下文切换开销；多 1 个是为了在个别线程偶发缺页 / 暂停时补位 |
| **IO 密集型**（DB 读写、HTTP 调用、文件 IO） | **`2N`** 或 **`2N + 1`** | 线程大部分时间在**等 IO 不占 CPU**，多开一些线程才能把 CPU 喂饱 |

其中 `N = Runtime.getRuntime().availableProcessors()`（CPU 核数）。

> 这两条**很容易被记反**：是「CPU 密集型 → `N+1`、IO 密集型 → `2N`」，不是反过来。理解方式很简单——**CPU 密集怕的是切换，所以线程别多；IO 密集怕的是 CPU 闲，所以线程可以多。**

更精确一点的模型是把「等待」也算进去：

```text
最佳线程数 ≈ N × (1 + 平均等待时间 / 平均计算时间)

例如：核数 8，一次请求计算 20ms、等下游 80ms
     → 8 × (1 + 80/20) = 40 个线程左右
```

但**公式只是起点**，面试时一定要补上这句：**最终参数要靠压测确定**——在预发环境用 JMeter 逐步加压，观察 QPS、RT 与线程池指标（活跃线程数、队列长度），找到「队列不堆积、CPU 未打满」的平衡点；上线后再根据监控微调。把「公式 → 压测 → 监控调优」这条链路说出来，比只报一个数字可信得多。

## 九、线程池的状态与优雅关闭 {#pool-shutdown}

线程池内部用一个 `AtomicInteger ctl` **同时**存两样东西：**高 3 位是状态、低 29 位是线程数**（这样一个 CAS 就能同时改状态和数量）。五种状态：

| 状态 | 含义 | 会做什么 |
|---|---|---|
| `RUNNING` | 正常运行 | 接受新任务，也处理队列里的任务 |
| `SHUTDOWN` | 调用了 `shutdown()` | **不再接受新任务**，但会把队列里已有的任务执行完 |
| `STOP` | 调用了 `shutdownNow()` | 不接受新任务、**不处理队列任务**，并尝试中断正在执行的线程 |
| `TIDYING` | 所有任务已终止、线程数为 0 | 即将执行 `terminated()` 钩子 |
| `TERMINATED` | 完全终止 | 结束 |

```java
executor.shutdown();                       // 温和：停止接收，跑完队列里剩下的
executor.shutdownNow();                    // 强硬：中断正在跑的，返回队列里未执行的任务
executor.awaitTermination(30, TimeUnit.SECONDS);  // 等待收尾完成
```

选择建议：**业务关闭用 `shutdown()` + `awaitTermination()`**，保证在途任务不丢；`shutdownNow()` 只在需要快速停机时用，而且返回的未执行任务列表需要自己决定怎么处理。

> **一个运维常识**：线程池一定要在应用关闭时**主动关闭**（比如 Spring 里配 `destroyMethod`、或注册 `@PreDestroy`），否则容器重启时可能留下正在提交任务的线程，造成「日志里报 RejectedExecutionException」或任务丢失。

## 十、监控与动态调参 {#pool-monitor}

线程池提供了几个可以直接读的指标，是线上定位「为什么慢」的关键：

```java
executor.getPoolSize();              // 当前线程数
executor.getActiveCount();           // 正在执行任务的线程数（近似值）
executor.getQueue().size();          // 队列积压任务数   ← 最该盯的一个
executor.getCompletedTaskCount();    // 已完成任务总数
executor.getLargestPoolSize();       // 历史峰值线程数（用来判断 maximumPoolSize 是否合理）
```

更细的埋点可以继承 `ThreadPoolExecutor` 覆写三个钩子：`beforeExecute()`、`afterExecute()`、`terminated()`——这是统计任务耗时、采集异常的统一入口。

**参数可以在运行时改**：`setCorePoolSize()`、`setMaximumPoolSize()` 都是线程安全的，所以「不重启应用调整线程池」是可行的，很多配置中心就是这么做的。另外 `prestartAllCoreThreads()` 可以在启动时提前把核心线程建好（预热），避免第一波流量来时还要现场创建。

## 十一、项目中的使用场景 {#pool-scenario}

被问「你们项目哪里用了线程池」，不要只说「发通知」，给出**场景 + 参数 + 为什么**：

| 场景 | 做法 | 收益 |
|---|---|---|
| **异步通知** | 订单支付成功后，短信 / 推送 / 积分发放丢进线程池 | 主流程（支付结果返回）不被下游耗时拖慢 |
| **批量数据处理** | 定时任务把一批数据**分片**，多线程并行处理 | 处理时间从 `O(总时长)` 降到近似 `O(总时长 / 线程数)` |
| **接口聚合** | 一个接口要调多个下游服务，用线程池并行调用 + `CountDownLatch` 汇总 | 总耗时从「各下游之和」变成「最慢的那个」 |
| **异步日志** | 日志写入用独立线程池 | 磁盘 IO 抖动不影响业务接口 RT |

一段可以参考的表述：

> 订单支付成功后的通知链路，我们用了自定义的 `ThreadPoolExecutor`：核心 5、最大 20、`ArrayBlockingQueue` 容量 1000、线程工厂统一命名成 `order-notify-N`、拒绝策略用 `CallerRunsPolicy` 保证不丢消息。上线前用 JMeter 压测，观察到核心线程在峰值时会扩容到 20 左右，队列积压保持在两位数以内；同时把 `getActiveCount()`、`getQueue().size()` 打进了监控面板，超过阈值就告警。

这段话之所以有说服力，不在数字，而在**参数、队列、命名、拒统策略、压测、监控**六个要素都齐了——这正是面试官想听的「你真的在生产上踩过」。

## 面试口径

- **七个核心参数**：`corePoolSize`、`maximumPoolSize`、`keepAliveTime`、`unit`、`workQueue`、`threadFactory`、`handler`。
- **执行原理（四步）**：核心线程未满就新建核心线程 → 核心满了进**队列** → 队列满了才创建**救急线程** → 线程数达上限且队列满则执行**拒绝策略**。**注意顺序是「核心 → 队列 → 救急 → 拒绝」，队列满了才会扩线程。**
- **四种拒绝策略**：`AbortPolicy`（默认抛异常）、`CallerRunsPolicy`（调用者线程执行，天然背压）、`DiscardOldestPolicy`（丢最老的）、`DiscardPolicy`（静默丢弃）。
- **为什么不推荐 `Executors`**：`Fixed` / `Single` 用无界 `LinkedBlockingQueue`，任务堆积会 OOM；`Cached` / `Scheduled` 的 `maximumPoolSize` 是 `Integer.MAX_VALUE`，会无限创建线程。规范做法是用 `ThreadPoolExecutor` 手动指定有界队列与合理上限。
- **核心线程数怎么定**：CPU 密集型 ≈ `N+1`，IO 密集型 ≈ `2N`（或 `2N+1`），更精确的模型是 `N × (1 + 等待/计算)`；**最终必须靠压测与监控确认**。
- **`shutdown` 与 `shutdownNow`**：前者不再收新任务、但把队列跑完；后者不再收新任务、中断正在执行的线程并返回未执行的任务。
- **关键监控指标**：`getActiveCount()`、`getQueue().size()`（队列积压最能反映过载）、`getCompletedTaskCount()`；参数支持运行时调整。
