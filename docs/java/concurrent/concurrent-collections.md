---
date: 2026-09-13
title: 并发容器
sidebar: 并发容器
order: 6
---

# 并发容器

前面几篇讲的都是「怎么让代码并发安全」，这一篇讲的是**已经替你做好并发安全的现成容器**——尤其是 `ConcurrentHashMap`，它是并发场景下的「默认选择」，几乎是必问项。

## 一、`HashMap` 为什么不能并发用 {#hashmap-unsafe}

`HashMap` 从设计上就**没有任何并发保护**，多线程使用会出现两类问题：

**JDK 1.7：扩容时可能形成环形链表（死循环）**

1.7 的 `HashMap` 在扩容迁移链表时用的是**头插法**，且迁移过程本身不是原子的：

```text
原链表：A → B → null
线程 T1 准备迁移，读到了 A（下一个是 B）后被挂起
线程 T2 完成迁移，链表变成 B → A → null
线程 T1 恢复，按手里的旧引用继续头插：
   把 A 插到新表头，A.next = B
   把 B 插到新表头，B.next = A        ← 环出现了：A ⇄ B
此后任何一次 get() 走到这个桶，就是死循环，CPU 直接跑满
```

**JDK 1.8：虽然改成了尾插法（不会成环），但依然会丢数据**

```java
if ((p = tab[i = (n - 1) & hash]) == null)
    tab[i] = newNode(hash, key, value, null);      // 两个线程同时判断为空 → 后者覆盖前者，一个值凭空消失
```

再加上 `size++` 不是原子操作，多线程下计数也会错。所以结论很简单：**`HashMap` 只能单线程用**。

## 二、`Hashtable` 和 `synchronizedMap` 为什么也不推荐 {#map-compare}

老代码里常见 `Hashtable` 或 `Collections.synchronizedMap()`，它们确实线程安全，但都是**「一把大锁锁全表」**：

| 方案 | 线程安全做法 | 问题 |
|---|---|---|
| `Hashtable` | 所有方法加 `synchronized`（锁 `this`） | 任何读写都互斥，并发度 = 1，性能差 |
| `Collections.synchronizedMap()` | 用 `mutex` 包装所有方法 | 同上，且**遍历时仍需自己加锁**（否则 `ConcurrentModificationException`） |
| `ConcurrentHashMap` | 分段 / 细粒度锁 + CAS | 并发度高、读操作基本无锁 |

「并发度 = 1」的意思很直白：100 个线程要读 100 个不同的 key，`Hashtable` 也会让它们**排队**——这在读多写少的缓存场景里是灾难。

## 三、`ConcurrentHashMap` 1.7：Segment 分段锁 {#chm-17}

1.7 的思路是**把大锁拆成小锁**：

```text
ConcurrentHashMap
 └── Segment[]（默认 16 个，可用 concurrencyLevel 指定）
      └── 每个 Segment 内部 = 一把 ReentrantLock + 一个 HashEntry 数组
           └── HashEntry（链表）
```

- **结构**：`Segment` 数组 + 每个 `Segment` 里一个 `HashEntry` 数组（数组 + 链表）。
- **锁**：每个 `Segment` 是一把 `ReentrantLock`，修改时只锁**自己所在的那个 Segment**。
- **并发度**：等于 `Segment` 的数量（默认 16），也就是最多 16 个线程可以同时写不同 Segment。
- **定位**：先算 key 落在哪个 `Segment`，再在 `Segment` 内部算桶下标——**两次哈希**。
- **`size()`**：先不加锁试算两次，两次结果相同就返回；不同则把所有 Segment 锁起来重算（`modCount` 变化判断）。

比 `Hashtable` 好很多，但仍有明显缺陷：**并发度被 Segment 数量锁死**（16 个段就只能 16 路并发），而且内存里有一层 `Segment` 的额外开销。

## 四、`ConcurrentHashMap` 1.8：CAS + `synchronized` 锁首节点 {#chm-18}

1.8 把 `Segment` 直接去掉，结构与 `HashMap` 对齐（数组 + 链表 + 红黑树），改用**更细粒度的锁**：

| 操作 | 并发保护方式 |
|---|---|
| **桶为空时写入** | 用 **CAS** 直接写入首节点（无锁） |
| **桶非空时写入** | 用 **`synchronized` 锁住该桶的首节点**，再遍历链表 / 红黑树 |
| **统计元素个数** | `baseCount` + `CounterCell[]` 分段计数（类似 `LongAdder`） |
| **扩容** | 多线程**协助扩容** |

为什么能这么改：

- **锁粒度从「段」降到「桶」**——只要两个 key 不冲突（落在不同桶），写操作完全不互相影响，并发度理论上等于桶的数量。
- **为什么用 `synchronized` 而不是 `ReentrantLock`**：JDK 6 之后 `synchronized` 有了锁升级优化，性能不输；而且它是 JVM 内置的，**每个桶不需要额外维护一个锁对象**，内存更省（1.7 里每个 `Segment` 都要挂一把锁）。
- **为什么空桶可以直接 CAS**：往空桶里放节点只需要一次引用赋值，天然适合 CAS；桶里已有节点时要做「遍历 + 可能改链表结构」，是复合操作，才需要加锁。

## 五、`put` 的完整流程 {#chm-put}

1.8 的 `putVal` 精简版：

```text
put(key, value)
  │
  ▼
① 计算 hash（spread 扰动，与 HashMap 一致）
  │
  ▼
② table 为空？ ── 是 ──▶ 先 initTable()（CAS 设置 sizeCtl，保证只有一个线程初始化）
  │ 否
  ▼
③ 定位桶 i = (n - 1) & hash，桶为空？
  │
  ├─ 是 ──▶ CAS 写入首节点（casTabAt）    ← 无锁路径
  │
  └─ 否 ──▶ ④ 首节点 hash == MOVED(-1)？
              ├─ 是 ──▶ 说明正在扩容，当前线程【协助扩容】helpTransfer()
              │
              └─ 否 ──▶ ⑤ synchronized (首节点 f)
                          遍历链表 / 红黑树：
                            key 已存在 → 覆盖 value
                            key 不存在 → 尾插新节点
                          链表长度 ≥ 8 且数组长度 ≥ 64 → 转红黑树
  │
  ▼
⑥ addCount(1)：累加计数，并检查是否需要扩容（阈值 = n * 0.75）
```

几个值得强调的点：

- **`hash == MOVED`（-1）是扩容的「路标」**：某个桶迁移完成后，会在该位置放一个 `ForwardingNode`（hash 值为 `MOVED`），它的作用就是告诉其他线程「这个桶已经搬走了，请去新表找，顺便帮我把剩下的桶也搬了」。
- **链表长度 ≥ 8 且数组长度 ≥ 64 才树化**：数组还小的时候优先扩容而不是转红黑树（扩容能天然拆分冲突）。
- **覆盖已有 key 时不算新增**，`addCount` 不会加一。

## 六、扩容与计数 {#chm-resize}

### 多线程协助扩容

这是 `ConcurrentHashMap` 相比 `HashMap` 最有意思的设计：**扩容不是一个线程的活，而是一群线程一起搬**。

```text
① 触发扩容的线程把 sizeCtl 设为负数（标记「正在扩容」），并创建两倍大小的新表
② 每个参与的线程领取一段桶（stride 步长，按 CPU 核数计算），从后往前迁移
③ 每迁移完一个桶，就把旧表的该位置设为 ForwardingNode（hash = MOVED）
④ 其他线程 put 时若撞上 ForwardingNode，就调用 helpTransfer() 一起搬
⑤ 全部搬完后，table 指向新表，sizeCtl 恢复为新的扩容阈值
```

好处很实在：**扩容期间整体仍是可用的**（只有正在搬的桶需要等待），而且搬得越快，写操作被阻塞的时间越短。代价是扩容期间 `size()` 的结果更不准（本来也只是估计值）。

### 计数：`baseCount` + `CounterCell[]`

如果在高并发下用一个 `AtomicLong` 计元素个数，所有线程都会争抢同一个值、CAS 频繁失败——这正是 `LongAdder` 要解决的问题。`ConcurrentHashMap` 用了同一套思路：

```text
无竞争时        → 直接 CAS 改 baseCount
有竞争时        → 按线程散列到某个 CounterCell，各自累加
size() 读取时   → baseCount + Σ CounterCell[i]
```

所以 **`size()` / `mappingCount()` 返回的是「估计值」**——统计期间可能有线程正在写入。官方建议用 `mappingCount()`（返回 `long`，不会溢出）。需要精确数量时应改用 `forEach` 之类的遍历方式统计。

## 七、四种 Map 的横向对比 {#map-compare-table}

| | `HashMap` | `Hashtable` | `synchronizedMap` | `ConcurrentHashMap` |
|---|---|---|---|---|
| 线程安全 | ❌ | ✅ | ✅ | ✅ |
| 锁粒度 | — | 整个表 | 整个表 | 桶（1.8 锁首节点 + 空桶 CAS） |
| 并发度 | — | 1 | 1 | 高（理论≈桶数）；1.7 为 Segment 数 |
| 是否允许 `null` 键值 | 允许 | **都不允许** | 允许（取决于被包装的 Map） | **都不允许** |
| 遍历时是否需要额外加锁 | — | 需要 | **需要** | 不需要（弱一致迭代器） |
| 适用 | 单线程 / 局部变量 | 已过时 | 已过时 | 多线程共享 |

**关于「不允许 null」的原因**：并发场景下 `map.get(key)` 返回 `null` 有歧义——是「没有这个 key」还是「value 就是 null」？拿不到确切答案就没法做后续处理，所以 `ConcurrentHashMap` 干脆禁止 `null`。

**关于「弱一致性迭代器」**：`ConcurrentHashMap` 的迭代器不会抛 `ConcurrentModificationException`，但它看到的是**创建迭代器那一刻之后的某个中间状态**，可能包含也可能不包含之后新增的元素。这是「不阻塞写」换来的代价，不算 bug。

## 八、`CopyOnWriteArrayList`：写时复制 {#cow}

`ArrayList` 同样不是线程安全的（并发 `add` 会丢数据、`size` 计数错乱、扩容时可能数组越界）。如果场景是**读多写极少**（例如监听器列表、本地缓存白名单），`CopyOnWriteArrayList` 是最合适的。

原理一句话：**写的时候不动原数组，而是复制一份新数组、改完再切换引用**。

```text
读：直接读 volatile 的 array 引用 —— 完全不加锁
写：加锁（ReentrantLock）→ 复制出新数组（长度 +1）→ 写入 → 把 array 指向新数组
```

| 优点 | 代价 |
|---|---|
| 读操作无锁，性能极高 | **每次写都要复制整个数组**，内存瞬时占用翻倍 |
| 读写不互斥（读旧的、写新的） | **写操作代价高**，写多场景完全不适用 |
| 迭代器绝不会抛 `ConcurrentModificationException` | 迭代期间只能看到**旧快照**，读不到最新数据（弱一致） |

所以适用场景有明确边界：**元素数量少、读远多于写**。反例是「把 `CopyOnWriteArrayList` 当队列用」——写频繁时会疯狂复制数组、GC 压力爆炸，那是 `BlockingQueue` 的活。

## 九、阻塞队列：并发容器的另一半 {#blocking-queues}

`BlockingQueue` 是「线程安全 + 阻塞语义」的队列：**队列空时取元素会阻塞，队列满时放元素会阻塞**——这正是生产者-消费者模型的天然载体，也是线程池的任务队列。

| 实现 | 结构 / 特点 | 典型用途 |
|---|---|---|
| `ArrayBlockingQueue` | 数组，**强制有界**，一把锁 | 线程池任务队列（推荐） |
| `LinkedBlockingQueue` | 链表，可选有界（**默认无界**），两把锁 | 固定 / 单线程池内部使用 |
| `SynchronousQueue` | 容量 0，必须有消费者接手 | 线程池缓存型配置 |
| `PriorityBlockingQueue` | 无界优先级堆 | 按优先级处理任务 |
| `DelayQueue` | 延迟到期才能取出 | 定时任务、订单超时关闭 |
| `LinkedTransferQueue` | 多了 `transfer()` 直接交接 | 手写高性能队列 |

三组高频 API 要能区分：

| 行为 | 抛异常 | 返回特殊值 | **阻塞** | **超时** |
|---|---|---|---|---|
| 入队 | `add(e)` | `offer(e)` → false | `put(e)` | `offer(e, t, unit)` |
| 出队 | `remove()` | `poll()` → null | `take()` | `poll(t, unit)` |
| 查看 | `element()` | `peek()` → null | — | — |

日常写业务用 `put` / `take`（能自动等待），需要快速失败时用 `offer` / `poll`。线程池参数里队列怎么选，见 [线程池](/java/concurrent/thread-pool#blocking-queue)。

## 面试口径

- **`HashMap` 为什么不安全**：1.7 并发扩容时头插法可能形成环形链表导致死循环；1.8 改了尾插法不会成环，但仍会因「同时判断为空」而**覆盖写、丢数据**，`size` 计数也不准。
- **`ConcurrentHashMap` 1.7 的实现**：`Segment`（默认 16）分段锁 + 每个 `Segment` 内一个 `HashEntry` 数组，每个 `Segment` 是一把 `ReentrantLock`；并发度等于 `Segment` 数量。
- **`ConcurrentHashMap` 1.8 的实现**：去掉 `Segment`，结构对齐 `HashMap`（数组 + 链表 + 红黑树）；**空桶用 CAS 写入，非空桶 `synchronized` 锁首节点**，锁粒度从「段」细化到「桶」；计数用 `baseCount + CounterCell[]`，扩容支持多线程协助（`ForwardingNode` 做路标）。
- **为什么 1.8 改用 `synchronized`**：JDK 6 后 `synchronized` 经过锁升级优化，性能足够；且不需要为每个桶额外维护锁对象，内存占用更小。
- **`size()` 为什么不准**：采用分段计数（类似 `LongAdder`），读取时汇总 `baseCount` 与各 `CounterCell`，期间可能有并发写入，所以只能返回估计值；推荐用 `mappingCount()`。
- **`CopyOnWriteArrayList` 的取舍**：读无锁、写复制整个数组；适合**读多写极少、元素少**（监听器、白名单），绝不适合写频繁或当队列用。
