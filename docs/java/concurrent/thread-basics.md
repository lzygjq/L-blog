---
date: 2026-09-13
title: 线程基础与线程间协作
sidebar: 线程基础
order: 1
desc: 进程与线程、并发与并行、四种创建线程的方式、run 与 start 的区别、Runnable 与 Callable、线程的六种状态、wait 与 notify 协作、sleep 与 wait 的差异、join、如何优雅停止一个线程
---

# 线程基础与线程间协作

并发的一切都从「线程」开始。这一篇解决的是**最基础但也最容易被问倒**的一批问题：线程到底是什么、怎么创建、跑起来之后处于什么状态、怎么让多个线程按顺序走、又怎么让它停下来。

## 一、进程与线程 {#process-vs-thread}

**进程**是程序的一次运行实例，是操作系统**分配资源**（内存、文件句柄、PID）的基本单位，进程之间彼此隔离——一个进程崩了，不会直接带走另一个。

**线程**是进程内部的执行单元，是 **CPU 调度**的基本单位。同一个进程里的线程**共享**进程的内存空间和资源（堆、方法区、打开的文件），但各自有一份私有的**栈**和**程序计数器**——这正好解释了为什么「栈是线程私有的，堆是共享的」，这条结论在 JVM 篇也会再出现一次。

| 维度 | 进程 | 线程 |
|---|---|---|
| 定位 | 资源分配的最小单位 | CPU 调度的最小单位 |
| 内存空间 | 独立，互相隔离 | 共享所属进程的内存 |
| 通信方式 | 管道 / 消息队列 / Socket / 共享内存，开销大 | 直接读写共享变量，开销小（但**要自己保证安全**） |
| 切换成本 | 高（要切换页表、刷新 TLB） | 低（同一地址空间，只需切换栈和寄存器） |
| 数量关系 | 一个进程可包含多个线程 | 一个线程只属于一个进程 |

一句话记忆：**进程管「资源」，线程管「执行」**。线程轻，所以并发首选线程；线程共享，所以并发才危险。

## 二、并发与并行 {#concurrency-vs-parallel}

这两个词中文只差一个字，但含义完全不同：

- **并发（Concurrent）**：**同一时间段内应对多件事**的能力。单核 CPU 也能并发——靠时间片轮转，线程 A 跑一会儿、切到线程 B，因为切换极快，看起来像同时在跑。
- **并行（Parallel）**：**同一时刻真正同时做多件事**。必须有多核 CPU，每个核跑一个线程。

打个比方：一个人边做饭边看孩子，是**轮流**做 → 并发；请了三个保姆各负责一件事 → 并行。

所以「单核能不能并发」的答案是**能**，「单核能不能并行」的答案是**不能**。并发是一种**程序结构**（把任务切成可交替执行的单元），并行是**硬件能力**。并发程序在多核上自然能得到并行加速。

## 三、线程的创建方式 {#create-thread}

常见的说法是「四种」，但要把它们分成两类看：前三者是在**构造线程本身**，第四种是**把任务交给别人管**。

```java
// ① 继承 Thread，重写 run()
class MyThread extends Thread {
    @Override
    public void run() {
        System.out.println("running in " + Thread.currentThread().getName());
    }
}
new MyThread().start();

// ② 实现 Runnable，交给 Thread（推荐：任务与线程解耦）
new Thread(() -> System.out.println("runnable task")).start();

// ③ 实现 Callable，配合 FutureTask 拿返回值
FutureTask<Integer> task = new FutureTask<>(() -> 1 + 1);
new Thread(task).start();
Integer result = task.get();      // 阻塞直到任务完成，也能拿到异常

// ④ 交给线程池（生产环境推荐）
ExecutorService pool = new ThreadPoolExecutor(
        4, 8, 60L, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(100),
        new ThreadPoolExecutor.CallerRunsPolicy());
pool.execute(() -> System.out.println("pooled task"));
```

**追问「本质上有几种」时怎么答**：创建线程的**唯一入口**是构造 `Thread` 对象并调用 `start()`，`Runnable` / `Callable` 只是「任务」的不同写法——`Thread` 构造器接收的就是一个 `Runnable`，`FutureTask` 本身也实现了 `Runnable`。所以真正该说清楚的是「任务怎么定义」和「线程谁来管」这两件事。

为什么生产环境推荐线程池：线程的创建与销毁都要陷入内核、分配栈内存（默认约 1MB），**频繁创建销毁的开销远大于任务本身**；线程池把线程复用起来，还顺带提供了排队、限流、拒绝和监控能力（详见[线程池](/java/concurrent/thread-pool)）。

## 四、`run()` 与 `start()` 的区别 {#run-vs-start}

这是最经典的送分题，也是最能看出「是否真的理解线程」的题：

| | `start()` | `run()` |
|---|---|---|
| 本质 | `Thread` 的成员方法，通知 JVM **启动一个新线程** | 就是一个普通方法，`Runnable` 接口约定的任务体 |
| 执行线程 | 新线程（名字是 `Thread-0` 这种） | **当前调用它的线程** |
| 是否可重复调用 | 只能一次，第二次抛 `IllegalThreadStateException` | 可以调任意多次 |
| 是否并发 | 是 | 否，同步执行 |

```java
Thread t = new Thread(() -> System.out.println(Thread.currentThread().getName()));
t.run();     // 输出 main      —— 就是一次普通方法调用
t.start();   // 输出 Thread-0  —— 由 JVM 新建线程后回调 run()
```

**为什么 `start()` 只能调一次**：`start()` 内部会检查 `threadStatus`，只有状态为 `NEW`（0）才允许启动，并把状态改为 `RUNNABLE`。这是为了避免同一个 `Thread` 对象被启动两次——否则两个线程共用同一个栈和状态，语义就乱了。

## 五、`Runnable` 与 `Callable` 的区别 {#runnable-vs-callable}

| | `Runnable` | `Callable<V>` |
|---|---|---|
| 抽象方法 | `void run()` | `V call() throws Exception` |
| 返回值 | 无 | 有（泛型 `V`） |
| 异常 | 不能在 `run()` 上抛受检异常，只能在内部 `try-catch` 消化 | 允许抛出异常，由 `Future.get()` 再抛回调用方 |
| 配合使用 | `new Thread(runnable)`、`Executor.execute()` | `FutureTask`、`ExecutorService.submit()` |
| 引入版本 | JDK 1.0 | JDK 1.5（`java.util.concurrent`） |

关键差别是**异常与返回值**：`Runnable` 里线程抛出的异常如果没被捕获，只会在控制台打印堆栈、**调用方完全感知不到**；`Callable` 的异常会被 `Future` 捕获并保存，`get()` 时以 `ExecutionException` 的形式抛回主线程——这也是「异步任务失败了怎么让主流程知道」的标准答案。

## 六、线程的六种状态 {#thread-state}

`Thread.State` 是枚举，一共六个值：

| 状态 | 含义 | 怎么进入 | 怎么离开 |
|---|---|---|---|
| `NEW` | 已创建、未启动 | `new Thread()` | 调用 `start()` |
| `RUNNABLE` | 可运行（**含正在运行与等待 CPU**） | `start()` 之后 | 时间片耗尽 / 等待锁 / 等待唤醒 / 结束 |
| `BLOCKED` | 阻塞，等待进入 `synchronized` | 抢不到 monitor 锁 | 拿到锁 → `RUNNABLE` |
| `WAITING` | 无限期等待，**需要别人叫醒** | `wait()`、`join()`、`LockSupport.park()` | `notify()` / `notifyAll()` / 目标线程结束 / `unpark()` |
| `TIMED_WAITING` | 限时等待，**到点自己醒** | `sleep(t)`、`wait(t)`、`join(t)`、`parkNanos()` | 超时 / 被唤醒 |
| `TERMINATED` | 已终止 | `run()` 正常结束或抛异常 | 不可逆 |

状态流转图（这是面试最爱让你画的一张图）：

```text
                    start()                 抢到锁
  NEW ──────────────────▶ RUNNABLE ◀──────────────── BLOCKED
                             │  ▲                     ▲
                             │  │ notify()/notifyAll()│ 等 synchronized 锁
                             │  │                     │
                             │  ├──────────────▶ WAITING ── wait() / join() / park()
                             │  │                  │  ▲
                             │  │      超时或唤醒   │  │ sleep(t) / wait(t) / join(t)
                             │  └──── TIMED_WAITING ┘
                             │
                    run() 结束 │
                             ▼
                        TERMINATED
```

三个容易被追问的细节：

1. **`RUNNABLE` 含义比名字宽**。Java 把「就绪」和「运行中」合并成 `RUNNABLE`；更反直觉的是，线程做**阻塞式 IO**（`read()` 网络数据）时在 JVM 眼里也是 `RUNNABLE`，因为没有对应状态可用。所以看到 `RUNNABLE` 不等于「正在占用 CPU」。
2. **`BLOCKED` 只服务于 `synchronized`**。用 `ReentrantLock` 抢不到锁时，线程是在队列里 `park` 住，状态是 `WAITING` / `TIMED_WAITING`，**不会进 `BLOCKED`**。这是「JUC 的锁与 `synchronized` 在实现上的差异」在状态上的体现。
3. **`TERMINATED` 之后无法复活**。一个 `Thread` 对象只能启动一次，想再跑只能新建对象——这正是线程池为什么要「复用线程」而不是「重启线程」的原因。

## 七、线程间协作：`wait` / `notify` / `notifyAll` {#wait-notify}

如果线程之间需要「我准备好之前你先等着」，光靠 `synchronized` 不够——`synchronized` 只能保证**互斥**，不能表达**等待条件**。`wait` / `notify` 就是干这个的，它们定义在 `Object` 上（因为任何对象都能当锁）。

标准写法是这样的，**两个细节必须记住**：

```java
synchronized (lock) {
    while (!condition) {      // ① 必须用 while，不能用 if
        lock.wait();          // ② wait 会释放锁，被唤醒后重新抢锁
    }
    // 条件成立，开始干活
}

synchronized (lock) {
    condition = true;         // 先改状态
    lock.notifyAll();         // 再唤醒（推荐 notifyAll）
}
```

- **为什么必须用 `while` 而不是 `if`**：因为存在**虚假唤醒（spurious wakeup）**——线程可能在没有 `notify` 的情况下被唤醒（操作系统允许这种行为），也可能被 `notifyAll` 唤醒后条件又被别的线程抢走了。用 `while` 重新检查条件，唤醒后不满足就继续等，才安全。
- **`notify` 和 `notifyAll` 怎么选**：`notify` 由 JVM 随机挑一个在该对象上等待的线程（不保证公平），如果挑中的线程条件不满足又恰好在 `while` 里继续等，而**其他有条件可跑的线程没被叫到**，就可能一起卡死；`notifyAll` 把所有等待者都唤醒，让它们自己去抢锁、各自检查条件。**除非你能证明「只可能有一个线程在等且它一定能跑」，否则一律用 `notifyAll`。**

再补一个高频追问：**`wait` / `notify` 为什么必须放在 `synchronized` 块里？** 因为它们操作的是**对象监视器上的等待队列**。如果不在持锁状态下调用，一是直接抛 `IllegalMonitorStateException`；二是即使不抛，也会出现「判断条件成立 → 还没来得及 wait → 另一个线程就 notify 了」的竞态，通知被丢掉、线程永远卡住。加锁保证了「检查条件 + 进入等待」是一个原子动作。

## 八、`sleep` 与 `wait` 的区别 {#sleep-vs-wait}

这是第七节的对照考点，四层差别里**第二层是重点**：

| 维度 | `Thread.sleep(ms)` | `Object.wait()` |
|---|---|---|
| 方法归属 | `Thread` 的**静态**方法 | `Object` 的**成员**方法 |
| **锁** | **不释放**锁（抱着锁睡） | **释放**锁（让别人能进来） |
| 唤醒方式 | 到点自动醒 | 需要 `notify` / `notifyAll`，或超时 |
| 使用前提 | 任何地方都能用 | 必须在 `synchronized` 块内，且对**同一个对象**调用 |
| 异常 | `InterruptedException` | `InterruptedException` |

共同点是**都会让出 CPU 进入等待、都能被 `interrupt()` 打断**。差别一句话：**`sleep` 是「我睡一会儿，锁我不放」；`wait` 是「我让出锁，等有人叫我」。**

常见追问「`wait(1000)` 和 `sleep(1000)` 一样吗」——时间到了都得重新抢锁，但在等待期间 `wait` 会释放锁，`sleep` 不会；另外 `wait(1000)` 可能被提前 `notify` 唤醒，`sleep(1000)` 只会被中断。

## 九、`join`：让线程按顺序执行 {#thread-order}

面试题「怎么让 T1、T2、T3 依次执行」的思路是：**在 T2 里等 T1 结束**。`join()` 的作用就是让**当前线程**阻塞，直到目标线程终止。

```java
Thread t1 = new Thread(() -> System.out.println("T1"));
Thread t2 = new Thread(() -> {
    try { t1.join(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    System.out.println("T2");
});
Thread t3 = new Thread(() -> {
    try { t2.join(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    System.out.println("T3");
});
t1.start(); t2.start(); t3.start();   // 三个可以同时启动，join 保证完成顺序
// 输出：T1 → T2 → T3
```

`join()` 内部其实就是 `wait()`：调用 `t1.join()` 的线程会一直 `wait`，直到 `t1` 结束时 JVM 调用 `notifyAll()` 把它唤醒。

四种常见做法对比：

| 方式 | 适用场景 | 说明 |
|---|---|---|
| `join()` | 简单的一次性串行 | 最直观，但会把线程变成串行，失去并发意义 |
| 单线程线程池 `newSingleThreadExecutor()` | 提交一批任务且要按提交顺序执行 | 线程池天然串行，还带队列与异常处理 |
| `CompletableFuture.thenRun()` | 有依赖关系的异步流水线 | `A.thenRun(B)`，可读性好，编程式而非阻塞式 |
| `CountDownLatch` | 一个线程等多个线程都完成 | 更灵活，可等 N 个线程（见 [AQS 与锁](/java/concurrent/aqs-locks#aqs-family)） |

## 十、如何优雅地停止一个线程 {#stop-thread}

先说结论：**`Thread.stop()` 已废弃，永远不要用**。它会立刻释放该线程持有的所有锁，导致被这些锁保护的数据处于「改了一半」的状态——别人拿到锁后看到的是不一致的数据。而且这个异常抛在任意位置，业务代码根本没法收拾。

正确姿势是**「通知 + 线程自己决定何时退出」**，两种实现：

```java
// 方式一：volatile 标志位（适合任务是一段可控循环的场景）
public class Worker implements Runnable {
    private volatile boolean running = true;

    @Override
    public void run() {
        while (running) {
            doWork();
        }
    }

    public void shutdown() { running = false; }
}
```

```java
// 方式二：interrupt 中断（推荐，能打断 sleep/wait/join）
@Override
public void run() {
    while (!Thread.currentThread().isInterrupted()) {   // 检查标志位
        try {
            doWork();
        } catch (InterruptedException e) {
            // 被中断：要么退出，要么处理完再做决定
            Thread.currentThread().interrupt();          // 重新打上中断标记
            break;
        }
    }
}
```

三个必须知道的细节：

1. **`interrupt()` 不是「强制停止」**，它只是**设置中断标记**。线程正在 `sleep` / `wait` / `join` 时，会被唤醒并抛 `InterruptedException`（同时**清除**中断标记）；线程正常运行时，标记一直保留，靠 `isInterrupted()` 自己检查。
2. **`InterruptedException` 不要吞掉**。捕获后如果不想退出，必须调 `Thread.currentThread().interrupt()` 把标记恢复，否则外层再也感知不到中断请求——这是「为什么 catch 到打断异常后要重新设置标志位」的标准答案。
3. **`isInterrupted()` 与 `interrupted()` 的区别**：前者只看标记、不清除；后者是静态方法，**读取并清除**标记。用错会导致中断信号被悄悄吃掉。

## 面试口径

- **进程 vs 线程**：进程是资源分配的最小单位、有独立内存、切换要切页表；线程是 CPU 调度的最小单位、共享进程资源、切换成本低。
- **并发 vs 并行**：并发是同一时间段内轮流处理多件事，单核也能并发；并行是同一时刻真正同时执行，必须多核。
- **创建线程**：唯一入口是构造 `Thread` 并调 `start()`；`Runnable` / `Callable` 是任务的不同写法，区别在返回值和异常；生产环境用线程池。
- **`start()` vs `run()`**：`start()` 让 JVM 新建线程并回调 `run()`，一个线程对象只能调一次；直接调 `run()` 就是当前线程里的普通方法调用。
- **六种状态**：`NEW` / `RUNNABLE` / `BLOCKED` / `WAITING` / `TIMED_WAITING` / `TERMINATED`；`BLOCKED` 只对应 `synchronized` 抢锁，`ReentrantLock` 的等待表现为 `WAITING`；`RUNNABLE` 里可能正阻塞在 IO 上。
- **`sleep` vs `wait`**：`sleep` 是 `Thread` 的静态方法、不释放锁、到点自动醒；`wait` 是 `Object` 的成员方法、必须在 `synchronized` 内、调用后释放锁、要靠 `notify` 或超时唤醒。
- **`wait` 为什么要配 `while`**：防虚假唤醒，也防被唤醒后条件已被别的线程抢走。
- **停止线程**：用中断或 `volatile` 标志位，由线程自己退出；`stop()` 已废弃。
