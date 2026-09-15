---
date: 2026-09-15
title: JUC 工具类横向对比
sidebar: JUC 工具类
order: 5
desc: CountDownLatch / CyclicBarrier / Semaphore / Exchanger / Phaser 五者的语义差异、选型判据与实战坑
---

# JUC 工具类横向对比

上一篇讲的是「怎么上锁」，这一篇讲**怎么让线程互相等**。`java.util.concurrent` 里有一组类专门干这件事：`CountDownLatch`、`CyclicBarrier`、`Semaphore`、`Exchanger`、`Phaser`。

它们共同点是都建立在 [AQS](/java/concurrent/aqs-locks#aqs) 之上（`state` 的含义各不相同），但**语义差别非常大**——面试里最常见的问法不是「这个类怎么用」，而是「**这个场景你选哪个**」。所以本篇不做纵向拆解，而是横向摆在一起比：谁在等谁、等的是什么、能不能复用、什么时候会卡死。

> 与上一篇的分工：[AQS 与锁](/java/concurrent/aqs-locks#aqs-family) 讲了每个工具**在 AQS 层面 `state` 代表什么**（地基）；本篇讲**语义、选型与实战坑**（怎么选、怎么不踩雷）。

## 一、先分清「谁在等谁」{#who-waits-for-whom}

五个工具看起来都是「让线程等一下」，但等一下的**对象**完全不同。这是区分它们的唯一有效维度：

```text
① 一个线程 等 多个线程完成          → CountDownLatch
   主线程等 10 个任务跑完再汇总

② 多个线程 互相等，到齐了才一起走    → CyclicBarrier
   10 个线程分阶段算，每阶段都要等所有人

③ 线程 等 一个「名额」（不等人）      → Semaphore
   最多 10 个请求同时打到下游

④ 两个线程 互相交换数据              → Exchanger
   A 填好的缓冲区给 B，B 的空缓冲区给 A

⑤ ②的加强版：参与者能动态增减、能分层 → Phaser
   多阶段任务，每个阶段的参与线程数不同
```

记住这张图，选型题就不会答错。下面逐个展开。

## 二、五个工具一张表看全 {#overview}

| 工具 | 一句话语义 | 计数方向 | 可否复用 | 谁在等 | 典型场景 |
|---|---|---|---|---|---|
| **`CountDownLatch`** | 一个线程等 N 件事都完成 | 减法（N → 0 放行） | ❌ 一次性 | 「主」等「从」 | 并行调下游后汇总、服务启动等依赖就绪 |
| **`CyclicBarrier`** | N 个线程互相等到齐 | 加法（0 → N 放行） | ✅ 可循环 | 互相等 | 多阶段并行计算、分片处理每轮对账 |
| **`Semaphore`** | 控制同时访问的**数量** | 许可（acquire 减 / release 加） | ✅ 长期复用 | 等「名额」 | 限流、资源池、并发上限 |
| **`Exchanger`** | 两个线程配对交换数据 | 配对（两个线程互换） | ✅ 可循环 | 等「对家」 | 双缓冲、遗传算法交叉 |
| **`Phaser`** | 可动态增减参与者、可分层 | 阶段 + 参与者计数 | ✅ 可循环 | 互相等（更灵活） | 多阶段且各阶段参与数不同 |

再补一个容易搞混的归属关系：

| 工具 | AQS 是否直接支持 |
|---|---|
| `CountDownLatch` | ✅ 共享模式（`state` = 剩余计数） |
| `Semaphore` | ✅ 共享模式（`state` = 剩余许可） |
| `CyclicBarrier` | ❌ **没有用 AQS**，内部用 `ReentrantLock` + `Condition` 自己实现 |
| `Exchanger` | ❌ 内部用 `Node` 数组 + CAS 自旋实现 |
| `Phaser` | ❌ 内部自行维护 `state`（用位运算拆分） |

**「`CyclicBarrier` 不是 AQS 实现的」是个很好的加分点**——它常被想当然地归进 AQS 家族，实际上是 `ReentrantLock` + `Condition` 的组合。

## 三、`CountDownLatch`：一次性关卡 {#countdown-latch}

语义：**一个（或多个）线程等另外 N 个线程把计数减到 0。**

```java
CountDownLatch latch = new CountDownLatch(3);      // 计数 = 3

for (int i = 0; i < 3; i++) {
    executor.submit(() -> {
        try {
            doWork();
        } finally {
            latch.countDown();                     // ★ 必须放 finally
        }
    });
}

latch.await();                                     // 主线程在此等待
System.out.println("三个任务都完成了");
```

三个 API 就够：`countDown()` 减一、`await()` 阻塞直到为 0、`await(timeout, unit)` 带超时。

### 实战写法：「同时发车」

比「等结果」更常见的是「让所有线程在同一起跑线上出发」——这需要**两个 Latch 各司其职**：

```java
CountDownLatch start = new CountDownLatch(1);      // 发令枪
CountDownLatch done  = new CountDownLatch(N);      // 完成信号

for (int i = 0; i < N; i++) {
    executor.submit(() -> {
        try {
            start.await();                          // 所有线程在这里等发令
            handle();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            done.countDown();
        }
    });
}

start.countDown();                                 // 砰！同时出发
done.await();                                      // 等全部跑完
```

这套写法在**压测**场景几乎是标配：不这样写，N 个线程会因为创建速度不同而「错峰开跑」，测出来的 QPS 偏低。

### 三个坑

| 坑 | 后果 | 正确做法 |
|---|---|---|
| `countDown()` 没放 `finally` | 中途抛异常 → 计数永远减不到 0 → **`await()` 永久阻塞** | 一律放 `finally` |
| 只用 `await()` 不带超时 | 上游出问题时整条链路挂死，排查时看不出是谁在等 | 生产代码用 `await(3, TimeUnit.SECONDS)` + 超时降级 |
| 指望它「重置后复用」 | 计数到 0 后再 `countDown()` 不会有任何效果，也没法回到初始值 | 需要复用请用 `CyclicBarrier` 或 `Phaser` |

最后一条要说得更准确：`countDown()` 里有个判断，**计数已经是 0 时直接返回、不会变成负数**，所以「多调用一次」不会出错，但也不会产生任何效果——**这个类天然就是一次性的，没有任何 API 能重置它**。

## 四、`CyclicBarrier`：可循环的集合点 {#cyclic-barrier}

语义：**N 个线程互相等，到齐了才一起继续**；到齐后自动重置，可以循环使用下一轮。

```java
// 第二个参数是「到齐后要执行的动作」，可省略
CyclicBarrier barrier = new CyclicBarrier(3, () -> System.out.println("一轮结束，进入下一轮"));

Runnable task = () -> {
    try {
        for (int phase = 0; phase < 5; phase++) {
            doPhaseWork(phase);
            int index = barrier.await();     // ← 返回值是「倒序索引」，见下
        }
    } catch (BrokenBarrierException | InterruptedException e) {
        Thread.currentThread().interrupt();
    }
};
```

### 与 `CountDownLatch` 的区别（必答）

| | `CountDownLatch` | `CyclicBarrier` |
|---|---|---|
| 计数方式 | **减法**：`countDown()` 减到 0 放行 | **加法**：`await()` 累计到 parties 放行 |
| 能否复用 | ❌ 一次性 | ✅ 自动重置，可循环 |
| 谁在等 | 通常是「主线程」等「工作线程们」 | 工作线程们**互相等** |
| 计数由谁改 | `countDown()` 可以由**任意线程**调用（甚至是别人） | 只能由参与者自己调用 `await()` |
| 底层实现 | AQS 共享模式 | `ReentrantLock` + `Condition` |

### 两个反直觉的细节

**① `await()` 的返回值是「倒序索引」**：返回 `parties - 1` 表示**第一个到达**，返回 `0` 表示**最后一个到达**。因为它的语义是「我到达时，还有几个没到」——剩余数为 0 的那个就是最后一个。

**② `barrierAction` 由「最后一个到达的线程」执行**，而且是在它自己的 `await()` 返回之前执行完。所以「到齐后由谁做汇总」这件事的答案是：**最后一个到的那个线程**（不是你指定的某个线程）。

### 最危险的两个坑

**坑一：参与者数 > 线程池大小 → 必然死锁。** 假设 `parties = 10`，但线程池只有 5 个线程：先到的 5 个线程全部阻塞在 `await()` 上占着池子，剩下 5 个任务永远排不到线程 → 栅栏永远等不齐。**这是生产事故级的坑**：单元测试用小线程池跑不出来，上线后才炸。

**坑二：一个线程异常退出，栅栏会被「打破」。** 如果某个参与者在 `await()` 前抛异常退出、或 `await` 超时/被中断，栅栏进入 **broken** 状态，其余等待线程统统抛 `BrokenBarrierException`。此时唯一的恢复手段是 `reset()`——它会唤醒所有等待线程并让它们抛 `BrokenBarrierException`，然后重新开始。**「打破」这个状态本身没法自动恢复**，所以生产代码应该捕获 `BrokenBarrierException` 并让整个批次作废重来，而不是装作没发生。

```java
try {
    barrier.await();
} catch (BrokenBarrierException e) {
    // 本批次已失效：清理中间结果，由上层决定重试或失败
} catch (TimeoutException e) {
    barrier.reset();          // 主动打破，让其他线程尽快退出
}
```

## 五、`Semaphore`：许可与限流 {#semaphore}

语义：**有 N 个许可，`acquire()` 拿走一个、`release()` 还回一个；拿不到就排队。**

它等的是**名额**，不是人——这是它和上面两个最本质的差别。

```java
private final Semaphore permits = new Semaphore(10);   // 最多 10 个并发

public void handle(Request req) {
    permits.acquire();                    // ← 写在 try 之外
    try {
        callDownstream(req);              // 下游最多被 10 个线程同时打
    } finally {
        permits.release();                // ← 必须放 finally
    }
}
```

三种典型用法：

| 用法 | 说明 |
|---|---|
| **限流** | 保护下游：本地限住并发数，比接入层限流更细（能按资源维度限） |
| **资源池** | 池大小 = 许可数，如「最多 20 个并发连接」 |
| **互斥** | `new Semaphore(1)` 也能做互斥，但**没必要**——直接 `synchronized` 更简单清晰 |

### 坑：`release()` 会把许可「放大」

`Semaphore` **没有「谁持有许可」的概念**，`release()` 只是无条件把计数加回去。所以下面这段代码会把限流悄悄改坏：

```java
// ❌ 错误：申请失败时也 release 了
if (!permits.tryAcquire()) {
    permits.release();            // 凭空多出一个许可！
    return;
}
```

一旦有一条路径「没 acquire 却 release」或多 release 了一次，许可总数就永久变大，**限流形同虚设且不会报错**——只会在压测时表现为「怎么下游被打爆了」。所以纪律是：**`acquire()` 和 `release()` 必须严格配对，且 `acquire` 在 `try` 之外、`release` 在 `finally` 里**（和 `Lock` 的写法完全一致）。

另外两个细节：

- 构造函数的 `fair` 参数默认 `false`；`true` 时按 FIFO 发放许可，能避免饥饿但吞吐下降。
- `tryAcquire(timeout)` 返回 `false` 时必须**当作失败处理**（降级 / 抛异常 / 快速失败），不能当成「拿到了」继续往下走。

### 它和线程池的区别（高频追问）

| | `Semaphore` | 线程池 `ThreadPoolExecutor` |
|---|---|---|
| 控制什么 | **并发执行的量** | **线程的数量与复用** |
| 是否创建线程 | 不创建（用的是调用方自己的线程） | 创建并复用线程 |
| 典型用途 | 调用下游前的并发刹车 | 异步执行任务、隔离资源 |

一句话：**线程池管「谁去干」，`Semaphore` 管「同时能有几个在干」。** 两者经常叠着用——线程池提交任务，任务内部再用 `Semaphore` 给下游限流。

## 六、`Exchanger`：两两交换 {#exchanger}

语义：**两个线程在同一个交换点配对，互相交换数据**。谁先到谁等，配对成功就各拿各的走人。

```java
Exchanger<List<Integer>> exchanger = new Exchanger<>();

// 生产者线程                             // 消费者线程
List<Integer> buffer = new ArrayList<>();  List<Integer> filled  = new ArrayList<>();
while (true) {                             while (true) {
    fill(buffer);                              filled = exchanger.exchange(filled);  // 空换满
    buffer = exchanger.exchange(buffer);        consume(filled);
}                                          }
```

典型场景是**双缓冲**：一个线程只管填、另一个只管取，交换动作本身天然完成了「移交 + 复位」，比用队列更省一次拷贝。

三个注意点：

- **只支持两个线程配对**，`exchange()` 是成对阻塞的；
- **奇数个线程会有一个永远等下去**（除了用带超时的 `exchange(v, timeout, unit)`）；
- 配对是「任意两个先到的」，不是「A 一定和 B 配」——所以**不要依赖「我换到的一定是某个特定线程的数据」**。

用的人少，但面试问「你还知道哪些 JUC 工具」时，能说清它的场景和「成对」这个约束，比只知道名字强得多。

## 七、`Phaser`：可分层、可动态增减的屏障 {#phaser}

`CyclicBarrier` 有两个做不到的事：**参与者数量固定**、**只有一级屏障**。`Phaser`（JDK 7 引入）就是来补这两个洞的。

三个核心概念：

| 概念 | 含义 |
|---|---|
| **phase（阶段）** | 从 0 开始的轮次号，每轮所有人到齐后 +1 |
| **party（参与者）** | 当前注册的参与者数量，**可以随时注册 / 注销** |
| **arrive / awaitAdvance** | 到达；等待某个阶段结束 |

```java
Phaser phaser = new Phaser(3);            // 初始 3 个参与者

// 每个工作线程
while (hasMoreWork()) {
    doWork();
    phaser.arriveAndAwaitAdvance();       // 到齐后一起进入下一阶段
}
phaser.arriveAndDeregister();             // 干完了，注销自己（人数 -1）

// 中途还可以动态加人
phaser.register();
```

两个 `CyclicBarrier` 做不到的能力：

1. **动态增减**：某线程干完自己的部分可以 `arriveAndDeregister()` 退出，新线程可以 `register()` 加入，栅栏不会因为「人数不对」而卡死；
2. **分层（Tiering）**：可以构造一棵 Phaser 树——多个子 Phaser 各自管一批线程，再把「子 Phaser 自己」注册到父 Phaser 上。用于「大任务分组分阶段同步」，比如分片计算 + 全局汇总。

**但不要为了用而用**：`Phaser` 的 API 比 `CyclicBarrier` 复杂得多（`arrive` / `arriveAndAwaitAdvance` / `arriveAndDeregister` / `awaitAdvance` / `awaitAdvanceInterruptibly` 五六个方法），分层能力在业务代码里几乎用不到。**参与者数量固定的循环栅栏，`CyclicBarrier` 就够了。**

## 八、选型判据 {#selection}

```text
需要让线程「等」吗？
│
├─ 等的是「事情/资源」，不是「人」
│   ├─ 等 N 件事都完成 ──────────▶ CountDownLatch（一次性）
│   └─ 等有「名额」可用 ──────────▶ Semaphore（可长期复用）
│
├─ 等的是「人」——大家到齐才继续
│   ├─ 参与者固定 + 要循环 ──────▶ CyclicBarrier
│   └─ 参与者会变 / 要分阶段 ────▶ Phaser
│
└─ 要「交换数据」 ────────────────▶ Exchanger
```

### 四组容易混淆的对比

| 对比 | 关键差别 |
|---|---|
| `CountDownLatch` vs `CyclicBarrier` | 减法 / 一次性 / 主等从 **vs** 加法 / 可循环 / 互相等 |
| `Semaphore` vs 线程池 | 限「并发数」不创建线程 **vs** 限「线程数」且复用线程 |
| `CyclicBarrier` vs `Phaser` | 人数固定、单级 **vs** 可增减、可分层（也更复杂） |
| `CountDownLatch` vs `CompletableFuture.allOf` | 见下 |

最后一条值得单独说，因为它是**版本演进带来的写法变化**：

```java
// JDK 8 之前的写法：等 3 个下游
CountDownLatch latch = new CountDownLatch(3);
// ...各自 submit，finally 里 countDown
latch.await();
List<Result> results = collectFromSomewhere();     // 结果还得自己攒

// JDK 8+ 的写法：直接组合，还自带异常传播与超时
CompletableFuture<Void> all = CompletableFuture.allOf(f1, f2, f3);
all.orTimeout(3, TimeUnit.SECONDS).join();
List<Result> results = Stream.of(f1, f2, f3).map(CompletableFuture::join).toList();
```

所以判断准则是：

> **「等若干个可表达的异步任务」优先用 `CompletableFuture`**（见 [CompletableFuture 异步编排](/java/concurrent/completable-future)）——它类型安全、异常能传播、还能挂超时；**`CountDownLatch` 更适合等「无法用 Future 表达的事件」**，比如等 MQ 消息到达、等其他进程写完文件、等外部信号。

## 九、坑汇总 {#pitfalls}

| # | 坑 | 会出什么事 | 对策 |
|---|---|---|---|
| 1 | `countDown()` / `release()` 没放 `finally` | 计数减不到 0、许可回不去 → **永久阻塞**或限流失效 | 一律 `finally` |
| 2 | 只写 `await()` / `acquire()` 不带超时 | 出问题时整条链路挂死 | 用带超时的重载 + 降级分支 |
| 3 | 指望 `CountDownLatch` 复用 | 计数到 0 后无法重置，`countDown` 也不再有效果 | 改用 `CyclicBarrier` / `Phaser` |
| 4 | `CyclicBarrier` 的 parties > 线程池线程数 | **必然死锁**（等待的线程占满池子） | parties 必须 ≤ 池大小；或改任务划分方式 |
| 5 | 参与者异常退出，栅栏 broken | 其余线程抛 `BrokenBarrierException`，批次作废 | 捕获后整批重试；必要时 `reset()` |
| 6 | `Semaphore` 的 acquire/release 不配对 | 许可被悄悄放大，**限流静默失效** | 严格配对；`acquire` 在 `try` 外 |
| 7 | 误以为 `CyclicBarrier` 基于 AQS | 面试答错归属 | 它是 `ReentrantLock` + `Condition` 实现的 |
| 8 | 误以为 `await()` 返回「第几个到达」 | 把「最后一个」当成「第一个」 | 返回值是**倒序**索引：`parties-1` 才是第一个到的 |
| 9 | 用 `Exchanger` 时线程数是奇数 | 有一个线程永远配对不上 | 用带超时的 `exchange` 或保证偶数 |
| 10 | 为了「显得高级」硬上 `Phaser` | API 复杂、行为难预测 | 固定人数的循环栅栏用 `CyclicBarrier` 即可 |

## 十、面试口径 {#interview}

- **`CountDownLatch`**：一个线程等 N 个线程完成。计数只能减、到 0 放行、**不能重置**（一次性）。典型用法是「接口并行调多个下游后汇总」和压测里的「双 Latch 同时发车」。踩坑点：`countDown()` 必须在 `finally`，`await()` 要带超时。
- **`CyclicBarrier`**：N 个线程互相等，到齐后一起继续，**可循环复用**。与 `CountDownLatch` 的差别是「加法 / 可复用 / 互相等」，而且它**不是 AQS 实现**，内部是 `ReentrantLock` + `Condition`。两个反直觉点：`await()` 返回的是**倒序索引**（`parties-1` = 第一个到达），`barrierAction` 由**最后一个到达的线程**执行。致命坑：parties 大于线程池线程数必然死锁。
- **`Semaphore`**：控制**并发访问数量**，等的是名额不是人。用于限流、资源池。要点：`release()` 没有「持有者」概念，acquire/release 不配对会让许可被放大、限流静默失效；与线程池的区别是「线程池管谁去干，Semaphore 管同时几个在干」。
- **`Exchanger`**：两两配对交换数据，典型场景是双缓冲；注意只能配对两个线程、奇数线程会有人一直等。
- **`Phaser`**：`CyclicBarrier` 的加强版——参与者可动态注册 / 注销、可分层（Phaser 树）。业务代码里固定人数的场景用 `CyclicBarrier` 就够。
- **选型一句话**：等事件用 `CountDownLatch`、等名额用 `Semaphore`、等人到齐用 `CyclicBarrier`（会变人用 `Phaser`）、换数据用 `Exchanger`；而「等若干异步任务」在 JDK 8 之后优先用 `CompletableFuture`，它比 `CountDownLatch` 多了类型安全、异常传播和超时能力。
