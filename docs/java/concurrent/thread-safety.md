---
date: 2026-09-13
title: 线程安全与内存可见性
sidebar: 线程安全与可见性
order: 2
desc: 从一段一定会出错的 i++ 代码讲起、并发三大特性、JMM 与 happens-before、volatile 的可见性与禁止重排、synchronized 的原理与锁升级、final 的内存语义与安全发布
---

# 线程安全与内存可见性

上一篇讲的是「线程长什么样」，这一篇回答**核心问题：为什么两个线程读写同一个变量会出错？** 搞清楚根源，才知道 `synchronized`、`volatile`、`CAS` 各自在治哪一种病——它们是三味不同的药，不能混着答。

## 一、先看一段一定会出错的代码 {#i-plus-plus}

```java
public class Counter {
    private int count = 0;

    public void increment() {
        count++;              // 看起来是一行，其实不是一步
    }

    public int get() { return count; }
}
```

两个线程各调用 `increment()` 一千次，最后 `get()` 的结果**几乎不可能是 2000**。原因在于 `count++` 在 CPU 层面是**三步**：

```text
① 读：把 count 从内存读到寄存器      （此时值 = 0）
② 改：寄存器里加 1                    （此时值 = 1）
③ 写：把结果写回内存                  （内存里变成 1）
```

如果线程 A 执行完 ② 还没写回，CPU 切给了线程 B，B 也读到 0、也算出 1、也写回 1——**A 的这次自增凭空消失了**。这类问题叫**竞态条件（Race Condition）**。

更麻烦的是，即使把 `count` 声明成 `volatile`，这个问题**依然存在**（后文会解释为什么）。所以先要把「并发出错」的三种可能拆开看。

## 二、并发三大特性 {#three-features}

所有并发 bug 最终都能归到这三条被破坏上：

| 特性 | 含义 | 被破坏的原因 | 怎么治 |
|---|---|---|---|
| **原子性** | 一个或多个操作要么全做、要么全不做，中间不可被打断 | 线程切换（时间片到期） | `synchronized`、`Lock`、原子类 |
| **可见性** | 一个线程改了共享变量，其他线程能**立刻看到** | CPU 缓存 + 编译器优化（变量被缓存在寄存器里） | `volatile`、`synchronized`、`Lock` |
| **有序性** | 代码的执行顺序符合预期 | 编译器和 CPU 的**指令重排序** | `volatile`、`happens-before` 规则 |

回到 `count++`：它**同时踩了原子性和可见性两条**。加 `synchronized` 能同时治两条（因为它既保证互斥、又在解锁时刷回主内存）；只加 `volatile` 只能治可见性，`++` 这个「读-改-写」组合依然会丢更新。

> **为什么会有这些破坏？** 本质是硬件为了快而做的三件事：CPU 有多级缓存（导致可见性问题）、编译器与 CPU 会乱序执行以填满流水线（导致有序性问题）、操作系统按时间片切线程（导致原子性问题）。Java 的并发工具，都是在**用软件手段把这些硬件优化带来的不确定性关掉**。

## 三、JMM：Java 内存模型 {#jmm}

JMM（Java Memory Model）是一份**规范**，它定义了多线程读写共享变量时，什么行为是允许的、什么是必须禁止的。它是所有并发关键字行为的「法条」。

它把内存抽象成两层：

```text
        ┌─────────────────────────────────────────┐
        │              主内存（Main Memory）        │
        │      所有线程共享，实例变量、静态变量存这里  │
        └────────────▲───────────────┬────────────┘
                     │ read/write    │
        ┌────────────┴───────┐  ┌────┴──────────────┐
        │  线程 A 的工作内存   │  │  线程 B 的工作内存  │
        │  （抽象概念：含 CPU  │  │  （本地缓存 + 寄存  │
        │   缓存与寄存器）     │  │   器的抽象）        │
        └────────────────────┘  └───────────────────┘

  线程不能直接读写主内存：必须 read 到工作内存 → use → assign → write 回主内存
```

注意「工作内存」不是某块真实的内存，而是 **CPU 缓存 + 寄存器 + 编译器优化的统称**。所谓「可见性问题」，就是「线程 A 改了主内存，线程 B 的工作内存里还是旧副本」。

早期规范用 **8 种原子操作**描述这套流程：`lock` / `unlock` / `read` / `load` / `use` / `assign` / `store` / `write`，并规定 `read` 与 `load`、`store` 与 `write` 必须成对出现。不过从 JDK 5（JSR-133）起，规范更强调用 **`happens-before` 规则**来描述可见性——面试里提到 8 种操作可以加分，但真正要能说清的是 `happens-before`。

### `happens-before`：判断「可见」的尺子 {#happens-before}

它的意思是：**如果 A happens-before B，那么 A 的执行结果对 B 一定可见，且 A 在 B 之前发生**。常用的几条：

| 规则 | 含义 |
|---|---|
| **程序顺序** | 同一个线程内，前面的操作 happens-before 后面的操作 |
| **监视器锁** | 对同一个锁的 `unlock` happens-before 后续的 `lock`（所以解锁前的修改，下一个拿到锁的线程一定看得到） |
| **`volatile` 变量** | 对 `volatile` 变量的写 happens-before 后续对它的读 |
| **线程启动** | 线程 A 调 `B.start()`，则 `start()` 之前的操作对 B 可见 |
| **线程终止** | B 中所有操作 happens-before A 从 `B.join()` 成功返回 |
| **中断** | `interrupt()` happens-before 被中断线程检测到中断事件 |
| **`final` 字段** | 构造函数里对 `final` 字段的写入 happens-before 别的线程读到该对象引用之后读这个字段（**前提：构造过程中 `this` 没有逸出**，详见第八节） |
| **传递性** | A happens-before B、B happens-before C，则 A happens-before C |

一句话：**`happens-before` 是「不需要额外同步就保证可见」的白名单**。不在白名单里的读写，就都可能有可见性问题。

## 四、`volatile`：可见性与禁止重排 {#volatile}

`volatile` 只有**两层**语义，但每一层都要能讲清原理。

### 语义一：保证可见性

```java
public class Flag {
    private volatile boolean stopped = false;

    public void stop()  { stopped = true; }      // 线程 A 写

    public void run() {
        while (!stopped) { /* 干活 */ }           // 线程 B 读，能立刻看到 A 的修改
    }
}
```

原理是**内存屏障**：写 `volatile` 变量时，在写指令后插入 **Store 屏障**，强制把工作内存里的修改刷回主内存；读 `volatile` 变量时，在读指令前插入 **Load 屏障**，强制从主内存重新读取最新值。

如果没有 `volatile`，JIT 编译器完全可能把 `stopped` 缓存在寄存器里，`while (!stopped)` 变成死循环——**它甚至不会去内存里再看一眼**。

### 语义二：禁止指令重排序

内存屏障同时挡住了**屏障两侧的指令互相穿越**，这就是「有序性」的保证。最经典的应用是**双重检查锁（DCL）单例**：

```java
public class Singleton {
    private static volatile Singleton instance;   // volatile 不能省

    public static Singleton getInstance() {
        if (instance == null) {                    // 第一次检查：避免每次都进同步块
            synchronized (Singleton.class) {
                if (instance == null) {             // 第二次检查：防止重复创建
                    instance = new Singleton();     // ← 这一行可能被重排
                }
            }
        }
        return instance;
    }
}
```

关键是 `new Singleton()` 并不是一步，而是三步：

```text
① 分配内存空间
② 初始化对象（执行构造方法、填充字段）
③ 把引用赋给 instance

正常顺序：① → ② → ③
重排之后：① → ③ → ②     ← 问题出在这里
```

重排后，`instance` 已经**指向了内存地址、不再为 null**，但对象内容还没初始化。此时另一个线程执行第一次检查，发现 `instance != null`，直接拿着一个**半成品对象**去用——典型的「构造函数逸出」。加上 `volatile` 后，屏障禁止了 ③ 提前，问题消失。

### 必须记住的第三点：不保证原子性

```java
private volatile int count = 0;
count++;      // 依然会丢更新！
```

`volatile` 让每次读都能看到最新值，但 `count++` 的「读-改-写」三步之间仍可能被切走。**`volatile` 适合「一个线程写、多个线程读」的场景**（状态标记位、DCL 单例），一旦涉及「读-改-写」的复合操作，就得用 `synchronized` 或原子类。

## 五、`synchronized` 的原理 {#synchronized-principle}

`synchronized` 是 JVM 层面的**互斥锁**，它**同时保证原子性、可见性和有序性**——这是它比 `volatile` 更强的地方。

### 三种用法，锁的对象不同

```java
public class Demo {
    // ① 修饰实例方法：锁是当前实例 this
    public synchronized void m1() { }

    // ② 修饰静态方法：锁是当前类的 Class 对象（Demo.class）
    public static synchronized void m2() { }

    // ③ 修饰代码块：锁是括号里指定的对象
    public void m3() {
        synchronized (this) { }
    }
}
```

由此引出两个追问：

- **「两个线程分别访问同一个类的两个 `synchronized` 实例方法，会互斥吗？」** 只要锁的是**同一个对象**（`this` 相同）就互斥；如果是两个不同的实例，各锁各的，**不互斥**。而静态方法锁的是 `Class` 对象，全局唯一，所以两个线程调同一个静态同步方法一定互斥。
- **锁对象的选择有陷阱**：不要用 `String` 常量、不要用 `Integer` / `Long` 的缓存对象（`valueOf` 在 `-128~127` 会返回同一对象），也不要直接用 `null`（会 NPE）。锁对象应是**私有的、不可变的**引用。

### 底层：对象头 Mark Word 与 Monitor

每个 Java 对象在内存中都有一块**对象头**，其中的 **Mark Word** 记录了锁状态。`synchronized` 加锁的过程，本质上就是**修改 Mark Word**：

| 锁状态 | Mark Word 内容（64 位简化） | 标志位 |
|---|---|---|
| 无锁 | 哈希码 + 分代年龄 | `01` |
| 偏向锁 | 偏向线程 ID + epoch + 分代年龄 | `01` |
| 轻量级锁 | 指向**栈中锁记录**的指针 | `00` |
| 重量级锁 | 指向 **Monitor** 的指针 | `10` |
| GC 标记 | 空 | `11` |

当锁升级到**重量级锁**时，会关联一个 **Monitor**（JVM 用 C++ 实现的对象），它内部有三个关键结构：

```text
┌──────────────── Monitor ────────────────┐
│  Owner     ：当前持有锁的线程            │  ← 同一时刻只有一个
│  EntryList ：想拿锁但没拿到的线程（阻塞）  │  ← 对应线程状态 BLOCKED
│  WaitSet   ：调用了 wait() 的线程         │  ← 对应线程状态 WAITING
└─────────────────────────────────────────┘
```

这也解释了上一篇那个细节：**为什么只有 `synchronized` 会让线程进 `BLOCKED`**——因为 `BLOCKED` 描述的就是「在 `EntryList` 里排队等 monitor」这个状态。

## 六、锁升级：从偏向到重量 {#lock-upgrade}

JDK 1.6 为了优化 `synchronized` 的性能，引入了锁升级机制。**注意是「升级」而不是「一开始就上重量级」**：

```text
无锁
 │  第一个线程访问同步块
 ▼
偏向锁 ── 在 Mark Word 里记下线程 ID，之后该线程再进来只需比对 ID，不做任何同步
 │  出现第二个线程竞争
 ▼
轻量级锁 ── 用 CAS 把 Mark Word 指向自己栈里的锁记录，失败就自旋重试
 │  自旋仍失败（竞争激烈）或自旋次数超限
 ▼
重量级锁 ── 关联 Monitor，抢不到的线程直接挂起（涉及用户态 / 内核态切换）
```

| 锁 | 适用场景 | 代价 |
|---|---|---|
| 偏向锁 | **只有一个线程**反复进入同步块 | 几乎零开销（只比对线程 ID） |
| 轻量级锁 | 多线程**交替**执行、实际没有同时竞争 | CAS 自旋，消耗 CPU 但不阻塞 |
| 重量级锁 | 竞争激烈 | 线程挂起 / 唤醒涉及用户态与内核态切换，开销大 |

要特别纠正一个流传很广的说法：**「一旦发生竞争就升级为重量级锁」是不准确的**。正确的链路是「偏向 → 轻量级 → 重量级」，轻量级锁在竞争时会先**自旋**等待，只有自旋拿不到（或竞争过于激烈、自旋次数超限）才膨胀为重量级锁。因为大多数同步块执行时间极短，自旋往往几十个时钟周期就等到了锁——这比挂起 / 唤醒线程便宜得多。

> **补充一个常被忽略的现状**：**JDK 15 起，偏向锁默认被禁用**（JEP 374）。原因是**撤销**偏向锁需要等到安全点（Stop-The-World），在高并发场景下这笔开销经常比偏向锁省下的更多。所以现在问「偏向锁」，回答时要带上「已被默认关闭，锁升级实际上是轻量级 → 重量级」这个版本意识，会明显加分。

## 七、其他锁优化 {#lock-optimization}

除了锁升级，HotSpot 还有几种优化，面试问「`synchronized` 为什么没那么慢了」时可以一起答：

- **锁消除（Lock Elision）**：JIT 通过**逃逸分析**发现锁对象不可能被其他线程访问（比如方法内 `new` 出来的局部对象上的同步），就直接把锁去掉。典型例子是在方法里 `synchronized (new Object())` 或对局部 `StringBuffer` 的同步。
- **锁粗化（Lock Coarsening）**：如果一段代码里对同一个对象**反复加锁解锁**（例如循环体内 `synchronized`），JIT 会把锁的范围扩大到这个循环外面，减少同步次数。
- **自适应自旋（Adaptive Spinning）**：自旋次数不是固定的，JVM 会根据「同一个锁上最近自旋成功的概率」动态调整——之前经常成功就多转一会儿，经常失败就少转甚至直接升级。

## 八、`final` 的内存语义与安全发布 {#final-and-publication}

JMM 里有三个关键字：`volatile`、`synchronized`，以及`final`。前两个前面都讲了，`final` 却常被当成纯粹的语法糖（"表示不能再赋值"）——其实它**在 JMM 里是一份独立的可见性承诺**，也是 Java 里唯一一种「不用任何同步手段就能安全发布对象」的写法。

### 8.1 一个「看起来没问题」的例子

```java
public class Holder {
    private final int value;                    // final 字段
    public Holder(int v) { value = v; }
}

// 线程 A
shared = new Holder(42);        // 构造 + 赋给 shared

// 线程 B
if (shared != null) {
    int v = shared.value;       // 没有 final 时，这里可能读到 0
}
```

根因还是 `new` 不是一步（第四节讲 DCL 时那段）：

```text
① 分配内存（此时 value = 0）
② 执行构造方法（value = 42）
③ 把引用赋给 shared

指令重排后变成：① → ③ → ②
线程 B 在 ③ 之后、② 之前读到 shared → 看到对象了，但 value 还是 0
```

**如果 `value` 是 `final`，JMM 就禁止这种重排。** 这是 `final` 与普通字段最本质的差别——普通字段的初始化**没有任何可见性承诺**，只能靠同步手段兜底。

### 8.2 JMM 给 `final` 的两条重排序规则

| 规则 | 内容 | 挡住了什么 |
|---|---|---|
| **写 `final` 字段** | 构造函数内对 `final` 字段的写入，**不能重排到**「把该对象的引用赋值给一个引用变量」之后 | 别人不会读到「对象已可见、字段还没写」的半成品 |
| **读 `final` 字段** | 「初次读取对象引用」**不能重排到**「初次读取该对象的 `final` 字段」之后 | 拿到引用后第一次读 `final` 字段，读到的就是构造函数写入的值 |

两条规则合起来给出一个很有用的结论：

> **只要对象在构造过程中 `this` 没有逸出，任何线程拿到这个对象的引用后，不需要任何同步就能看到 `final` 字段的初始化值。**

这也正好解释了第四节 DCL 单例为什么必须给 `instance` 加 `volatile`：**`instance` 是 `static` 字段，不是 `final` 字段**，享受不到这条规则，只能靠 `volatile` 的内存屏障挡住「① → ③ → ②」那次重排。**同一个问题，两个字段修饰符给出两种解法——这是把 `volatile` 与 `final` 串起来讲的最佳切口。**

### 8.3 规则的前提：构造过程中 `this` 不能逸出

`final` 的承诺有个前置条件，也是面试追问的分水岭：**构造函数里不能把 `this` 暴露出去**。一旦逸出，别的线程可能在初始化还没完成时就拿到引用，此时连 `final` 字段都可能读到默认值。

```java
public class ThisEscape {

    private final int value;

    // ① 构造器里启动线程 —— 新线程可能拿着半成品 this 干活
    public ThisEscape(int v) {
        value = v;
        new Thread(() -> System.out.println(this.value)).start();   // ← 逸出
    }

    // ② 构造器里把 this 注册到外部容器（事件监听器最常见）
    public void registerTo(Registry registry) { }

    public ThisEscape(Registry registry) {
        this.value = 1;
        registry.register(this);                                    // ← 逸出
    }

    // ③ 构造器里调用可被子类覆写的方法
    public ThisEscape() {
        init();                                                     // ← 隐式逸出
    }
    protected void init() { }        // 子类覆写后可能读到尚未赋值的字段
}
```

第三种最隐蔽：构造器调用了一个「看起来无害」的 `init()`，但它是 `protected` 的，子类覆写后会在**父类字段还没赋值时**执行。

修法是**把「构造」和「发布」拆成两步**——构造函数只负责把对象建好，启动线程 / 注册监听器交给独立的 `start()` 或工厂方法：

```java
public final class Safe {
    private final int value;

    public Safe(int v) { value = v; }          // 构造器只赋值，不发布
    public void start() {                      // 发布动作单独一步
        new Thread(() -> System.out.println(value)).start();
    }
}
```

### 8.4 安全发布的四种方式

「发布（publish）」= 把一个对象的引用交给别的线程使用；「安全发布」= 保证别的线程看到的是**完整构造好**的对象。Java 里能安全发布的手段只有这四种：

| 方式 | 写法 | 原理 |
|---|---|---|
| **静态初始化器** | `static final Foo INSTANCE = new Foo();` | 类初始化由 JVM 保证对所有线程可见（JLS 的类初始化 happens-before 规则） |
| **`final` 字段** | 把对象存进某个类的 `final` 字段 | 8.2 的两条重排序规则 |
| **`volatile` / 原子引用** | `private volatile Foo ref;` | 内存屏障，见第四节 |
| **锁或并发容器** | 写进 `synchronized` 块 / `ConcurrentHashMap` / 阻塞队列 | 锁的 happens-before；并发容器内部自带同步 |

反过来说，**下面这些全是「不安全发布」**：引用赋给非 `volatile` 的 `public` 字段、塞进非同步的静态集合、从构造函数里把 `this` 交出去。它们不是「偶尔出错」，而是**在 x86 之外的平台、或在 JIT 做了激进的寄存器分配之后必然出错**——这也是「本地跑一万遍都没复现」的代码上线后偶发诡异 bug 的常见来源。

### 8.5 `final` ≠ 不可变

最容易被追问倒的一处：

```java
public class Cache {
    private final List<String> items = new ArrayList<>();   // final 只锁住「引用」

    public void add(String s) { items.add(s); }             // ← 内容照样能改
}
```

**`final` 保证的是「引用不可改」，不是「对象状态不可改」。** 真正的不可变类要同时满足四条：

1. 所有字段都是 `final`；
2. 字段类型要么是基本类型，要么指向不可变对象；
3. `this` 在构造过程中不逸出；
4. 对外提供集合时做**防御性拷贝**（`List.copyOf(...)`），而不是把内部引用直接返回。

顺带区分两个常被混为一谈的 API：

| 写法 | 是不是真不可变 |
|---|---|
| `Collections.unmodifiableList(list)` | ❌ 只是**视图包装**，原列表改了它跟着变，写入时才抛异常 |
| `List.of(...)` / `List.copyOf(...)` | ✅ 真不可变，且 `List.of` 连 `null` 都不接受 |

还有一个边界要清楚：`final` 是**编译期 + JMM 层面的承诺**，反射（`setAccessible(true)` + `Field.set`）仍能改掉它。所以「不可变」是给正常代码的约定，**不是安全边界**——别拿它当防护手段。

## 九、三件武器怎么选

| | `synchronized` | `volatile` | `Lock` / 原子类 |
|---|---|---|---|
| 原子性 | ✅ | ❌ | ✅ |
| 可见性 | ✅ | ✅ | ✅ |
| 有序性 | ✅ | ✅ | ✅ |
| 是否阻塞 | 是（可升级为挂起） | 否 | `Lock` 阻塞，原子类靠 CAS 自旋 |
| 适用场景 | 一般的临界区互斥 | 状态标记、一写多读、DCL | 需要超时 / 中断 / 公平 / 条件变量 |

选择顺序建议：**能用 `volatile` 解决就不加锁 → 需要互斥就优先 `synchronized`（JVM 优化好、代码简单、不会忘记释放）→ 需要超时、可中断、公平或条件队列时才用 `ReentrantLock`**。`ReentrantLock` 的细节见 [AQS 与锁](/java/concurrent/aqs-locks)。

注意 `final` 不在这张表里：它**既不提供互斥也不提供原子性**，提供的是「不用同步就能安全发布」。所以在真正需要「多个字段一起不可变」的场景（配置对象、DTO、状态快照），首选是把对象设计成**不可变 + `final` 字段**，而不是给每个读写都加锁——后者容易漏、也更容易在后续改动中被破坏。

## 面试口径

- **并发问题的根源**：三大特性被破坏——原子性（线程切换）、可见性（CPU 缓存）、有序性（指令重排）。
- **JMM**：抽象出主内存与工作内存，线程不能直接操作主内存；用 `happens-before` 规则定义哪些操作的可见性有保证。常用规则：程序顺序、监视器锁、`volatile`、线程启动、线程终止、传递性。
- **`volatile`**：保证可见性（内存屏障强制刷回 / 重读主内存）、禁止指令重排（屏障阻止穿越），**不保证原子性**；典型用法是状态标记位和 DCL 单例。
- **DCL 为什么加 `volatile`**：`new` 对象分「分配内存 / 初始化 / 赋引用」三步，不加 `volatile` 可能重排成「分配 → 赋引用 → 初始化」，导致别的线程拿到未初始化完成的对象。
- **`synchronized` 原理**：JVM 层面的互斥锁，锁的信息记录在对象头的 Mark Word 中，升级到重量级锁后关联 Monitor（`Owner` / `EntryList` / `WaitSet`），`EntryList` 对应线程的 `BLOCKED` 状态。
- **锁升级**：无锁 → 偏向锁 → 轻量级锁 → 重量级锁；竞争时先 CAS 自旋，自旋失败才膨胀为重量级锁；**JDK 15 起偏向锁默认禁用**。
- **其他优化**：锁消除（逃逸分析）、锁粗化（合并相邻同步块）、自适应自旋。
- **`final` 的内存语义**：JMM 有两条重排序规则——构造函数内写 `final` 字段**不能重排到**「把对象引用赋给一个引用变量」之后；「初次读对象引用」**不能重排到**「初次读该对象的 `final` 字段」之后。结论：**只要构造过程中 `this` 没逸出，其他线程无需同步就能看到 `final` 字段的初始化值**。这也是 DCL 单例里 `instance` 必须 `volatile` 的原因——它是 `static` 字段，不是 `final` 字段，享受不到这条规则。
- **安全发布**：只有四种方式——静态初始化器、`final` 字段、`volatile` / 原子引用、锁或并发容器。反面是不安全发布：赋给非 `volatile` 的 `public` 字段、塞进非同步静态集合、构造器里把 `this` 交出去（启动线程 / 注册监听器 / 调用可被覆写的方法）。
- **`final` ≠ 不可变**：`final` 只保证**引用**不可改，不保证对象状态不可改。不可变类还要满足「字段类型本身不可变 + `this` 不逸出 + 对外做防御性拷贝」。另外 `Collections.unmodifiableList` 只是视图包装，`List.of` / `List.copyOf` 才是真不可变。
