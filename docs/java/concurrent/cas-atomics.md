---
date: 2026-09-13
title: CAS 与原子类
sidebar: CAS 与原子类
order: 3
desc: CAS 的指令级基础、ABA 问题与它的解法、原子类家族的分工、LongAdder 如何把热点打散、无锁方案到底适用到哪一步
---

# CAS 与原子类

加锁能解决一切原子性问题，但代价是**线程要排队、要挂起**。如果冲突其实很稀疏——绝大多数时候根本没有第二个线程同时改这个变量——那把线程阻塞起来就太浪费了。于是 JDK 提供了另一条路线：**不加锁，靠 CAS 自旋来保证原子性**。`AtomicInteger`、`ConcurrentHashMap` 写空桶、AQS 修改 `state`，底层都是它。

## 一、CAS 是什么 {#cas}

CAS = **Compare And Swap**（比较并交换），一条 CPU 级别的原子指令。它有三个操作数：

| 符号 | 名称 | 含义 |
|---|---|---|
| `V` | 内存值 | 变量在内存中的当前值（线程每次操作前重新读一遍） |
| `A` | 预期值 | 线程认为它应该是多少（即刚才读到的旧值） |
| `B` | 新值 | 想改成多少 |

规则只有一句：**当且仅当 `V == A` 时，才把 `V` 改成 `B` 并返回成功；否则什么都不做，返回失败。**

用一句话概括它的思想：**「我认为现在是 A，如果确实还是 A，就改成 B；如果已经被别人改过了，我就作废重来。」**

```text
线程读到 count = 100  ──▶ 计算新值 101 ──▶ CAS(期望 100, 新值 101)
                                              │
                       ┌──────────────────────┴──────────────────────┐
                       │                                             │
              内存里还是 100  → 改成 101，返回 true          内存里已是 103（被别人改过）
                                                             → 什么都不做，返回 false
                                                             → 重新读取，再试一轮（自旋）
                       └─────────────────────────────────────────────┘
```

因为「比较」和「交换」在硬件上是一步完成的，所以**中间不可能被别的线程插进来**——这就是它能保证原子性的原因。

```java
// 手写一个 CAS 循环，理解它「失败就重试」的机制
public int incrementAndGet() {
    int old;
    do {
        old = get();                                   // ① 重新读最新值
    } while (old != compareAndSwap(old, old + 1));     // ② 失败了就再来一遍
    return old + 1;
}
```

### 底层靠什么实现

Java 层最终调用的是 `sun.misc.Unsafe` 的 `compareAndSwapInt`（`AtomicInteger` 内部持有 `Unsafe` 实例），它对应到 CPU 的一条带 **`lock` 前缀的 `cmpxchg` 指令**。这条 `lock` 前缀做了两件事：

1. **锁总线或锁缓存行**，保证同一时刻只有一个核能操作这块内存；
2. 同时充当**内存屏障**，把写缓冲刷回主内存，保证可见性。

所以 CAS 不只是原子，它天然还带了可见性——这也是 `AtomicInteger` 不需要再配 `volatile` 语义补充的原因（内部 `value` 本身是 `volatile` 的）。

### 为什么它是「乐观锁」

CAS 假设**冲突很少发生**，所以先直接改，改失败再重试——这是**乐观**的态度，属于**无锁（lock-free）**实现。
`synchronized` 假设**冲突一定会发生**，所以先把资源锁住、把别人挡在外面——这是**悲观**的态度，属于**阻塞**实现。

## 二、CAS 的三个坑 {#aba}

CAS 看起来很美好，但工程上必须知道它的三个短板：

### 坑一：ABA 问题（最经典）

CAS 只比较**值**，不知道这个值「中间经历过什么」。设想这样的时序：

```text
初始：ref = "A"
线程 T1：读到 A，准备 CAS 改成 C          ← T1 被挂起
线程 T2：把 A 改成 B
线程 T2：又把 B 改回 A                     ← 值看起来又变回 A 了
线程 T1：恢复执行，CAS 期望 A —— 成功！     ← 但中间其实「变过」
```

如果这个变量是一个**引用**（比如链表的头节点），中间被换掉再换回来，链表的内部结构可能已经完全变了，而 T1 却以为「一切照旧」——把节点塞回去就可能造成**数据丢失甚至链表损坏**。这就是 JDK 1.7 `ConcurrentHashMap` 扩容死循环的历史教训之一。

**解决办法是加一个「版本号」或「时间戳」**，让每次修改都改变版本，这样「改回去」也能被识别出来：

| 类 | 附加信息 | 适用场景 |
|---|---|---|
| `AtomicStampedReference<V>` | `int` 版本号（stamp） | 需要精确感知「改过几次」，如链表换头 |
| `AtomicMarkableReference<V>` | `boolean` 标记 | 只关心「改过没有」，如只要一个二值状态 |

```java
AtomicStampedReference<String> ref = new AtomicStampedReference<>("A", 0);
int[] stamp = new int[1];
String value = ref.get(stamp);                       // 同时读出值与版本号
ref.compareAndSet(value, "C", stamp[0], stamp[0] + 1);  // 值 + 版本号都要匹配才成功
```

**注意答题分寸**：ABA 问题在**只用 `AtomicInteger` 做计数**这类场景下其实无害（100 改回 100 无所谓），它真正危险的是**引用类型**被别的线程「换掉又换回」。答面试时点出这一点，比笼统地说「ABA 很危险」更显功力。

### 坑二：自旋消耗 CPU

如果竞争激烈，大量线程会不断重试、空转，白白烧 CPU。典型表现就是「`AtomicLong` 在高并发下反而变慢」——这时应该改用 **`LongAdder`**（见下文）。

另外，CAS 自旋对「**只有一个变量**」是可行的，但如果有多个变量要一起保证原子性，就没法用一次 CAS 搞定。可以封装成一个对象用 `AtomicReference` 整体替换，或者干脆回到 `synchronized`。

### 坑三：只能保证一个变量的原子性

`AtomicInteger a` 和 `AtomicInteger b` 各自原子，但「同时改 a 和 b」不是原子的。要整体原子，把两个值打包成一个不可变对象放进 `AtomicReference`（类似 CAS 版的不可变对象替换），或者直接用锁。

## 三、原子类家族 {#atomic-family}

`java.util.concurrent.atomic` 下的类按用途分五组：

| 分组 | 代表类 | 说明 |
|---|---|---|
| **基本类型** | `AtomicInteger`、`AtomicLong`、`AtomicBoolean` | 最常用，替代 `volatile int` + 复合操作 |
| **数组** | `AtomicIntegerArray`、`AtomicLongArray`、`AtomicReferenceArray` | 元素级别原子：`arr.getAndIncrement(i)` |
| **引用** | `AtomicReference`、`AtomicStampedReference`、`AtomicMarkableReference` | 对象引用的原子更新；后两个解决 ABA |
| **字段更新器** | `AtomicIntegerFieldUpdater`、`AtomicLongFieldUpdater`、`AtomicReferenceFieldUpdater` | 对一个已存在对象的某个 `volatile` 字段做原子更新，无需给字段套一层原子类 |
| **累加器（JDK 8）** | `LongAdder`、`DoubleAdder`、`LongAccumulator` | 高并发计数专用，牺牲「瞬时精度」换吞吐 |

其中 `AtomicInteger` 的常用 API 要能说出用途：

```java
AtomicInteger count = new AtomicInteger(0);
count.incrementAndGet();               // ++count
count.getAndIncrement();               // count++
count.addAndGet(10);                   // count += 10
count.compareAndSet(20, 30);           // CAS：是 20 就改成 30
count.updateAndGet(x -> x * 2);         // JDK 8：函数式更新，内部用 CAS 循环实现
```

## 四、`LongAdder`：把热点打散 {#longadder}

`AtomicLong` 的问题是**所有线程都在争抢同一个 `value`**，并发越高，CAS 失败的次数越多，自旋越浪费。

`LongAdder` 的思路是**分段累加**——把「一个计数器」拆成「一个基准值 + 一组 Cell」：

```text
                 ┌─────────────┐
   线程 A ──────▶ │    base     │   （无竞争时直接改 base）
                 └─────────────┘
                 ┌──────┬──────┬──────┐
   线程 B ──────▶ │Cell 0│Cell 1│Cell 2│   （有竞争时按线程散列到不同 Cell，
   线程 C ──────▶ └──────┴──────┴──────┘     各自 CAS 自己的 Cell，互不干扰）
                        │
   读取 sum() ──────────┴──▶ base + Σ Cell[i]
```

| | `AtomicLong` | `LongAdder` |
|---|---|---|
| 写（`increment`） | 所有线程抢一个值，竞争激烈时慢 | 分散到多个 Cell，**并发越高优势越大** |
| 读（`sum()`） | 直接读取，结果精确 | 需要汇总所有 Cell，**且只是估计值**（求和时可能有线程正在写） |
| 内存 | 小 | 更大（每个 Cell 都做了缓存行填充） |
| 适用 | 需要精确的即时值、读多写少 | 统计类高频计数（QPS、请求数），写完再读 |

> **为什么 Cell 会「填充」**：CPU 缓存以缓存行（通常 64 字节）为单位，两个 Cell 落在同一缓存行会互相失效，这叫**伪共享（false sharing）**。`LongAdder` 的 `Cell` 用了 `@Contended` 注解做**缓存行填充**，把不同 Cell 隔开到不同的缓存行里——这是「用空间换并发性能」的经典手法。

选型口诀：**要精确的即时值 → `AtomicLong`；高并发下只管累加、最后汇总 → `LongAdder`。**

## 五、无锁的边界

CAS 不是「比锁更好的锁」，它是**在特定场景下更划算**的方案：

| | CAS / 原子类 | `synchronized` / `Lock` |
|---|---|---|
| 冲突稀疏时 | 快（没有线程切换开销） | 相对慢（有加解锁、可能的挂起） |
| 冲突激烈时 | 慢（大量自旋空转，还可能活锁） | 反而更稳（排队挂起，不烧 CPU） |
| 代码复杂度 | 高（要处理失败重试、ABA） | 低（写好同步块即可） |
| 适用 | 计数器、状态标记、单点无锁更新 | 临界区较长、涉及多个变量、需要条件等待 |

这也解释了为什么 JDK 里的并发容器大多**混着用**：`ConcurrentHashMap` 写空桶用 CAS、写非空桶用 `synchronized`；AQS 改 `state` 用 CAS、排队等待用 `LockSupport.park`。**没有银弹，只有权衡。**

## 面试口径

- **CAS 是什么**：Compare And Swap，三个操作数「内存值 V / 预期值 A / 新值 B」；当且仅当 `V == A` 时把 `V` 改为 `B`，否则失败重试。它体现**乐观锁**思想，在无锁状态下保证原子性。
- **底层实现**：通过 `Unsafe` 调用 CPU 的 `cmpxchg` 指令并加 `lock` 前缀——既保证原子，也保证可见性（内存屏障）。
- **三大问题**：① **ABA**（值被改回，CAS 误判没人动过）——用 `AtomicStampedReference` 版本号或 `AtomicMarkableReference` 布尔标记解决，主要危害在**引用类型**；② **自旋耗 CPU**——高并发计数改用 `LongAdder`；③ **只能保证一个变量的原子性**——多变量需整体封装用 `AtomicReference` 或加锁。
- **`AtomicLong` vs `LongAdder`**：前者所有线程争抢同一个值；后者用 `base + Cell[]` 把热点分散到多个缓存行（`@Contended` 防伪共享），写吞吐更高，但 `sum()` 是汇总值、只是估计。
- **乐观锁 vs 悲观锁**：CAS 是乐观锁的代表（先改、失败重试），`synchronized` 是悲观锁的代表（先锁、再改）。
