---
date: 2026-09-13
title: AQS 与锁
sidebar: AQS 与锁
order: 4
---

# AQS 与锁

上一篇的 `synchronized` 足够解决大多数互斥问题，但它有三个硬伤：**不能中断、不能超时、只有一个等待队列（没法表达「等 A 条件」和「等 B 条件」）**。要解决这些，JDK 提供了 `java.util.concurrent.locks` 包下的锁。而这个包里几乎所有东西——`ReentrantLock`、`Semaphore`、`CountDownLatch`——都站在**同一个地基**上：AQS。

## 一、AQS 是什么 {#aqs}

**AQS（AbstractQueuedSynchronizer，抽象队列同步器）是一个「构建锁和同步器的框架」**，它把「怎么排队、怎么阻塞、怎么唤醒」这套又长又容易写错的逻辑抽出来一次做好，子类只需要回答一个问题：**「当前状态下，这次获取是成功还是失败？」**

它内部就两样东西：

```text
┌─────────────────────────── AQS ───────────────────────────┐
│                                                            │
│  1) volatile int state     ← 同步状态，含义由子类定义         │
│       0 = 空闲 / 资源充足    n > 0 = 已被占用 / 剩余 n 个     │
│                                                            │
│  2) FIFO 双向队列（CLH 变体）  ← 存放所有没抢到的线程          │
│                                                             │
│     head ⇄ Node ⇄ Node ⇄ Node ⇄ tail                        │
│              └ 每个 Node 记录：线程引用、等待状态、             │
│                前驱 / 后继指针、共享还是独占                   │
└────────────────────────────────────────────────────────────┘
```

一句话记忆：**`state` 决定「能不能进」，队列决定「进不去的人在哪等」。**

### 模板方法：AQS 定流程，子类定规则

AQS 用**模板方法模式**把可变部分留给子类。它自己实现了排队、`park` / `unpark`、状态维护，而把「尝试获取 / 尝试释放」暴露成 `protected` 方法：

| 需要子类实现 | 作用 |
|---|---|
| `tryAcquire(int)` | 独占方式尝试获取（如 `ReentrantLock`） |
| `tryRelease(int)` | 独占方式尝试释放 |
| `tryAcquireShared(int)` | 共享方式尝试获取（如 `Semaphore`、`CountDownLatch`） |
| `tryReleaseShared(int)` | 共享方式尝试释放 |
| `isHeldExclusively()` | 是否被当前线程独占（供 `Condition` 使用） |

这些方法默认实现是直接抛 `UnsupportedOperationException`——**子类按需要改写哪几个，就决定了它是「独占」还是「共享」同步器**。

### 独占 vs 共享

| 模式 | 含义 | 典型实现 |
|---|---|---|
| **独占（Exclusive）** | 同一时刻只能一个线程持有 | `ReentrantLock`、`ReentrantReadWriteLock` 的写锁 |
| **共享（Shared）** | 允许多个线程同时持有 | `Semaphore`、`CountDownLatch`、读锁 |

## 二、AQS 如何工作 {#aqs-internals}

以**独占模式**为例，一次 `lock()` 最精简的流程是这样：

```java
// AQS 提供给外部的入口（final，子类不能改）
public final void acquire(int arg) {
    if (!tryAcquire(arg) &&                                  // ① 先试一次，能成就直接返回
        acquireQueued(addWaiter(Node.EXCLUSIVE), arg))       // ② 不行就入队 + 阻塞
        selfInterrupt();
}
```

```text
线程调用 lock()
      │
      ▼
  尝试 CAS 修改 state（由子类 tryAcquire 实现）
      │
   ┌──┴──────────────┐
   │                 │
 成功              失败
   │                 │
 拿到锁，继续跑    把当前线程封装成 Node，接到队列尾部
                    │
                    ▼
              队列前驱是 head？ ── 是 ──▶ 再试一次 tryAcquire
                    │ 否                      │ 还失败
                    ▼                         ▼
              LockSupport.park() 阻塞 ◀───────┘
                    │
              前驱线程释放锁时 unpark 后继节点，被唤醒后重新竞争
```

释放时反过来：

```java
public final boolean release(int arg) {
    if (tryRelease(arg)) {                  // 子类减 state，减到 0 才算真释放
        Node h = head;
        if (h != null && h.waitStatus != 0)
            unparkSuccessor(h);             // 唤醒队列里第一个还在等的线程
        return true;
    }
    return false;
}
```

两个值得记住的细节：

1. **入队后的线程不会一直睡**：它每次被唤醒都会**重新尝试获取**（而不是直接被交给锁），因为中间可能有新来的线程插队抢走了。这也是非公平锁吞吐更高的原因。
2. **阻塞用的是 `LockSupport.park()`**，它不是 `wait`——所以上一篇说「AQS 里等锁的线程状态是 `WAITING` / `TIMED_WAITING`，而不是 `BLOCKED`」，根子就在这里。

## 三、`ReentrantLock` 的实现 {#reentrantlock}

「可重入」的意思是：**同一个线程已经持有锁，再次进入同步区域时不需要重新排队，直接通过**。实现方式就是给 `state` 计数。

```java
// 非公平锁的 tryAcquire（简化）
final boolean nonfairTryAcquire(int acquires) {
    final Thread current = Thread.currentThread();
    int c = getState();
    if (c == 0) {                                        // 当前没人持有
        if (compareAndSetState(0, acquires)) {            // CAS 抢
            setExclusiveOwnerThread(current);
            return true;
        }
    } else if (current == getExclusiveOwnerThread()) {    // ★ 重入判断
        setState(c + acquires);                           // state 累加
        return true;
    }
    return false;
}
```

- **加锁**：`state` 从 `0` 改成 `1`；再次进入时 `1 → 2 → 3`。
- **解锁**：`state` 减一，**减到 0 才真正释放**并唤醒后继节点。
- 因此一个线程重入 N 次，就必须 `unlock()` N 次，否则会一直占着锁——这也是「`lock()` 必须写在 `try` 外面、`unlock()` 必须写在 `finally` 里」的原因：

```java
lock.lock();                 // ← 写在 try 之外：万一 lock() 抛异常，不该去 unlock
try {
    // 临界区
} finally {
    lock.unlock();           // ← 必须保证释放
}
```

## 四、公平锁与非公平锁 {#fair-nonfair}

`ReentrantLock` 默认**非公平**，构造时传 `true` 可得到公平锁：

```java
new ReentrantLock(true);     // 公平锁
new ReentrantLock();         // 非公平锁（默认）
```

两者的差别只在 `tryAcquire` 里**多不多一次「队列里有没有人在等」的判断**：

```java
// 公平锁：先问一句「我前面有没有人排队」
if (c == 0) {
    if (!hasQueuedPredecessors() && compareAndSetState(0, acquires)) { ... }
}
```

| | 公平锁 | 非公平锁 |
|---|---|---|
| 新线程 | 必须先看队列，有等待者就**乖乖排队** | **直接尝试抢**，抢不到才排队 |
| 吞吐量 | 低（线程切换更频繁） | **高**（刚释放的线程可能马上又抢到，减少唤醒开销） |
| 饥饿 | 不会 | 理论上可能，实践中很少 |

**为什么非公平反而更快**：线程 A 释放锁到唤醒线程 B 之间存在一段「空窗期」，非公平锁允许恰好在这个窗口来抢锁的线程 C 直接拿到锁，省掉一次挂起 / 唤醒；而公平锁严格排队，反而制造了更多的上下文切换。

## 五、`Condition`：多个等待队列 {#condition}

`synchronized` 只有一个 `wait` 队列，所以「生产者等队列非满」「消费者等队列非空」只能挤在同一队里，`notifyAll` 会把不该醒的也吵醒。

`Condition` 的解法是**一个锁可以挂多个条件队列**：

```java
ReentrantLock lock = new ReentrantLock();
Condition notFull  = lock.newCondition();
Condition notEmpty = lock.newCondition();

// 生产者的等待方式
lock.lock();
try {
    while (queue.size() == capacity) {
        notFull.await();          // 只在这里等「不满」
    }
    queue.add(item);
    notEmpty.signal();            // 只叫醒等「不空」的消费者
} finally {
    lock.unlock();
}
```

`await()` 与 `signal()` 的语义对应 `wait()` / `notify()`，但内部结构不同：

```text
await()  ：把线程挂到 Condition 自己的等待队列上，并完全释放锁
signal() ：把等待最久的节点从 Condition 队列搬到 AQS 的同步队列，等它自己重新抢锁
```

要注意 `await()` **同样必须写在 `while` 里**（防虚假唤醒、防条件被抢），这一点和 `wait` 完全一致。

## 六、`synchronized` 与 `Lock` 的对比 {#sync-vs-lock}

这是本节最常被问的一张表：

| 维度 | `synchronized` | `Lock`（`ReentrantLock`） |
|---|---|---|
| 层次 | 关键字，**JVM 层面**（C++ 实现） | 接口，**JDK 层面**（Java 实现） |
| 释放锁 | **自动**（退出同步块） | **手动** `unlock()`（必须放 `finally`） |
| 是否可中断 | 不可中断 | **可中断**：`lockInterruptibly()` |
| 是否可超时 | 不支持 | **支持**：`tryLock(long, TimeUnit)` |
| 公平性 | 只能非公平 | 可选公平 / 非公平 |
| 条件变量 | 一个（`wait` / `notify`） | **多个** `Condition` |
| 获取失败 | 阻塞直到拿到 | `tryLock()` 可**立即返回 false** |
| 性能 | 无竞争时极好（偏向 / 轻量级锁） | 竞争激烈、需要排队时表现更好 |

选择建议：**能用 `synchronized` 就用它**（更简单、不会忘记释放、JVM 一直在优化）；只有当需要「中断 / 超时 / 公平 / 多条件 / 尝试获取」这五样中的任何一个时，才换成 `ReentrantLock`。

## 七、AQS 家族 {#aqs-family}

理解了 AQS，这些工具就只是「`state` 的含义不同」而已：

| 工具 | `state` 的含义 | 典型用法 |
|---|---|---|
| `ReentrantLock` | 0 空闲；> 0 被持有（重入次数） | 互斥，替代 `synchronized` |
| `Semaphore` | 剩余**许可数** | 限流、限制并发访问数 |
| `CountDownLatch` | 还剩几个**倒计数** | 一个线程等多个线程完成 |
| `CyclicBarrier` | 已到达的**线程数** | 多线程分步执行，每步等到齐 |
| `ReentrantReadWriteLock` | 高 16 位读锁、低 16 位写锁 | 读多写少 |

```java
// Semaphore：最多 3 个线程同时访问
Semaphore semaphore = new Semaphore(3);
semaphore.acquire();          // 拿许可，拿不到就等（可通过 tryAcquire 立即返回）
try {
    // 最多 3 个线程在这里
} finally {
    semaphore.release();       // 务必释放，否则许可会被慢慢耗尽
}
```

**`CountDownLatch` 和 `CyclicBarrier` 的区别**（高频追问）：

| | `CountDownLatch` | `CyclicBarrier` |
|---|---|---|
| 计数方式 | 减法：`countDown()` 减到 0 放行 | 加法：`await()` 到齐数就放行 |
| 能否复用 | **不能**，一次性 | **能**，`reset()` 后可循环使用 |
| 谁在等 | 通常是「主线程」等「工作线程们」 | 工作线程们**互相等** |
| 典型场景 | 接口并行调 N 个下游，等全部返回再汇总 | 多阶段任务，每阶段要所有线程都完成才开始下一阶段 |

## 八、死锁 {#deadlock}

**死锁**：两个或多个线程互相持有对方需要的锁，都在等对方先释放，于是永远等下去。

```java
Object lockA = new Object(), lockB = new Object();

// 线程 1                       // 线程 2
synchronized (lockA) {          synchronized (lockB) {
    synchronized (lockB) { }        synchronized (lockA) { }
}                               }
// 1 拿着 A 等 B，2 拿着 B 等 A —— 循环等待
```

### 四个必要条件

死锁**同时**满足下面四条才会发生，**破坏任意一条即可避免**：

| 条件 | 含义 | 怎么破坏 |
|---|---|---|
| **互斥** | 资源同一时刻只能被一个线程占用 | 很难破坏（锁的本质），一般不动这条 |
| **请求与保持** | 持有已有资源不放，同时去请求新资源 | 一次性申请全部资源 |
| **不可剥夺** | 已获得的资源不能被强行抢走，只能主动释放 | 用 `tryLock(timeout)`，超时自动放弃已持有的锁 |
| **循环等待** | 多个线程形成头尾相接的等待环 | **最常用**：约定所有线程按同一顺序加锁 |

工程上最实用的两条：**① 统一加锁顺序**（比如按对象 ID 排序后再加锁）；**② 用 `tryLock(timeout)` 替代无脑 `lock()`**，拿不到就退回去把已持有的锁释放掉，过会儿重试。

### 怎么诊断

| 工具 | 用法 | 说明 |
|---|---|---|
| `jps` | `jps` | 先找到 Java 进程 PID |
| `jstack` | `jstack <pid>` | **首选**：线程栈里会直接打印 `Found one Java-level deadlock` 并给出互相等待的线程与锁 |
| `jconsole` / `VisualVM` | 图形界面 → 线程面板 | 有「检测死锁」按钮，可视化查看持有关系 |
| Arthas | `thread -b` | 在线诊断，直接标出阻塞其他线程的「罪魁」 |

线上排查的实际路径通常是：**先 `jstack` 抓栈**——如果确认是死锁，报告里会明写；如果没死锁但线程大量堆积，就看是哪一类线程卡在同一个方法上（往往是在等 DB 连接或下游接口）。

## 面试口径

- **AQS 是什么**：`AbstractQueuedSynchronizer`，用 `volatile int state` 表示同步状态、用一个 FIFO 双向队列存放等待线程，用模板方法模式把 `tryAcquire` / `tryRelease` 留给子类。`ReentrantLock`、`Semaphore`、`CountDownLatch`、`ReentrantReadWriteLock` 都建立在它之上。
- **独占与共享**：独占同一时刻只允许一个线程（`ReentrantLock`）；共享允许多个线程同时持有（`Semaphore`、`CountDownLatch`），区别在于子类实现的是 `tryAcquire` 还是 `tryAcquireShared`。
- **`ReentrantLock` 如何可重入**：`state` 计数。同一线程再次获取时 `state + 1`，释放时 `state - 1`，减到 0 才真正释放并唤醒后继节点。
- **公平 / 非公平**：公平锁在 `tryAcquire` 里加 `hasQueuedPredecessors()`，必须先排队；非公平锁直接 CAS 抢。**非公平吞吐量更高**，因为减少了线程唤醒与切换。
- **`synchronized` vs `Lock`**：JVM 关键字 vs JDK 接口；自动释放 vs 手动 `unlock`；`Lock` 多出可中断、可超时、可公平、多 `Condition`、可立即返回的 `tryLock`。
- **死锁四条件**：互斥、请求与保持、不可剥夺、循环等待；破坏任意一条即可避免，最常用的是统一加锁顺序。
- **死锁诊断**：`jps` 找进程 → `jstack <pid>` 看「Found one Java-level deadlock」；图形化用 `jconsole` / `VisualVM`，在线用 `Arthas thread -b`。
