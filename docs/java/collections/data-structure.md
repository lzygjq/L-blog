---
date: 2026-09-13
title: Java 集合的底层选型
sidebar: 底层选型与复杂度
order: 1
---

# Java 集合的底层选型

集合框架的性能差异，根子上由**底层数据结构**决定。所以这一篇不讲数据结构本身（那属于语言无关的底座），只回答一个更实用的问题：**面对一个具体的需求，Java 里该选哪个集合、为什么。**

> **边界说明（重要）**：大 O 与均摊分析、数组与链表的内存布局与硬件代价、哈希表的冲突解决策略、树与堆的结构原理，都在计算机基础板块的 [算法与数据结构](/fundamentals/algorithms/) 里——**它们是语言无关的**。本篇只保留 **Java 实现层面的取舍与坑**，遇到原理会链回去，不再重复推导。

## 一、选型速查表 {#cheatsheet}

| 需求 | 选什么 | 关键理由 | 原理详见 |
|---|---|---|---|
| 按序存、频繁按下标访问 | **`ArrayList`** | 连续内存 + `O(1)` 随机访问 | [缓存局部性](/fundamentals/algorithms/linear#cache-locality) |
| 频繁在**已持有引用的位置**增删 | `LinkedList` | 双向链表，给定结点 `O(1)` 增删 | [给定结点 O(1)](/fundamentals/algorithms/linear#doubly-linked) |
| 键值查找、不要求顺序 | **`HashMap`** | 平均 `O(1)` | [哈希表](/fundamentals/algorithms/linear#hash-table) |
| 需要**有序遍历 / 范围查询** | **`TreeMap`** | 红黑树，`O(log n)` 且天然有序 | [为什么需要树](/fundamentals/algorithms/tree#why-tree) |
| 需要**按插入顺序**遍历 | `LinkedHashMap` | 哈希 + 双向链表 | [双向链表的用途](/fundamentals/algorithms/linear#doubly-linked) |
| 实现 **LRU** | `LinkedHashMap`（`accessOrder = true` + 重写 `removeEldestEntry`） | 链表按访问序维护，天然是"最近使用"顺序 | 同上 |
| **去重** | `HashSet` / `LinkedHashSet`（保序）/ `TreeSet`（排序） | 底层分别是 `HashMap` / `LinkedHashMap` / `TreeMap` | — |
| **栈 / 队列** | **`ArrayDeque`**（不要用 `Stack`） | `Stack` 继承 `Vector`，方法全是 `synchronized` | [栈与队列](/fundamentals/algorithms/linear#stack-queue) |
| **优先队列 / TopK** | `PriorityQueue` | 二叉堆，取极值 `O(log n)` | [堆](/fundamentals/algorithms/tree#heap) |

> **一句总纲**：**`List` 看"是随机访问多还是增删多"，`Map` 看"要不要顺序"，`Queue` 看"要不要按优先级"。**

## 二、复杂度速查：Java 实现视角 {#complexity}

同一套大 O 记号落到 Java 类上，必须把"平均"与"最坏"分栏——**这正是集合选型最容易踩空的地方**：

| 操作 | `ArrayList` | `LinkedList` | `HashMap` | `TreeMap` |
|---|---|---|---|---|
| 按下标访问 | **`O(1)`** | **`O(n)`** | — | — |
| 尾部插入 | 均摊 `O(1)`、**最坏 `O(n)`** | `O(1)` | — | — |
| 头部插入 | `O(n)` | `O(1)` | — | — |
| 按值查找 | `O(n)` | `O(n)` | 平均 `O(1)`、**最坏 `O(log n)`** | `O(log n)` |
| 有序遍历 | 需排序 | 需排序 | ❌ 无序 | **✅ 天然有序** |

**为什么要区分"平均"与"最坏"**：见 [复杂度分析 · 几个高频误判](/fundamentals/algorithms/complexity#pitfalls)——`HashMap` 的 `O(1)` 只在哈希分布均匀时成立。

## 三、数组：`ArrayList` 的底层 {#array}

`ArrayList` 就是一个**动态数组**：内部持有 `Object[] elementData`，靠连续内存支持按下标随机访问。

### 数组为什么下标从 0 开始

| 索引起始 | 寻址公式 | 代价 |
|---|---|---|
| 从 0 开始 | `a[i] = baseAddress + i * dataTypeSize` | 直接乘加，**无额外指令** |
| 从 1 开始 | `a[i] = baseAddress + (i - 1) * dataTypeSize` | 每次寻址**多一条减法指令** |

这不是"能不能"的问题，而是"**每条访问路径上多一条指令**"的取舍。

**这正是 `elementData[i]` 的全部真相**：`get(i)` 的 `O(1)` 不是 Java 的功劳，是**内存布局**给的。关于"为什么 `O(1)` 寻址还不足以解释数组为什么快"（缓存局部性），见 [算法与数据结构 · 缓存局部性](/fundamentals/algorithms/linear#cache-locality)。

### 数组的插入与删除

数组是一段连续内存，**为了保证连续性**，插入和删除后往往需要成片挪动元素：

| 位置 | 复杂度 | 原因 |
|---|---|---|
| 末尾 | **`O(1)`** | 不需要挪动 |
| 头部 / 中间 | **`O(n)`** | 平均要挪动一半元素 |

`ArrayList.add(index, e)` 与 `remove(index)` 内部都是 `System.arraycopy` 搬移——**这就是"频繁在头部增删应该换结构"的直接原因**。

### 扩容：为什么是 1.5 倍 {#arraylist-grow}

```java
// JDK 8 ArrayList#grow 的核心两行
int newCapacity = oldCapacity + (oldCapacity >> 1);       // 1.5 倍
elementData = Arrays.copyOf(elementData, newCapacity);    // 申请新数组 + 全量拷贝
```

| 事实 | 说明 |
|---|---|
| **初始容量** | `new ArrayList()` 内部是**空数组**；**首次 `add` 才初始化为容量 10**（懒加载） |
| **扩容倍数** | **1.5 倍**（`oldCapacity + (oldCapacity >> 1)`） |
| **单次扩容代价** | `Arrays.copyOf` → 申请新数组 + 全量拷贝，**最坏 `O(n)`** |
| **均摊代价** | **`O(1)`**——倍增策略让 n 次追加的总拷贝量收敛于 `O(n)` |

**为什么 1.5 倍而不是 2 倍**：两者都能保证均摊 `O(1)`，差别在**空间浪费与旧内存块能否被复用**——完整推导见 [复杂度分析 · 为什么是 1.5 倍](/fundamentals/algorithms/complexity#growth-factor)。

> **面试常被绕的一道题**：`new ArrayList(10)` 会扩容几次？
> **答案：0 次。** 它只是**指定容量 10 并直接分配好数组**，没有发生扩容。常被混淆的是**无参构造**的情形——那才是"首次 `add` 时初始化 10，之后每次 1.5 倍"。

## 四、链表：`LinkedList` 的底层 {#linked-list}

`LinkedList` 是**双向链表**：每个 `Node` 持有 `item`、`next`、`prev`。

### 单双向链表对比

| 维度 | 单向链表 | 双向链表 |
|---|---|---|
| 指针 | 只有 `next` | `next` + `prev` |
| 空间 | 省（少一个指针） | 费（多一个指针） |
| 遍历 | 只能单向 | 支持双向 |
| 查询 | 头 `O(1)`，其他 `O(n)` | 头尾 `O(1)`，其他 `O(n)` |
| 增删 | 头 `O(1)`，其他 `O(n)` | 头尾 `O(1)`，**给定结点 `O(1)`**，其他 `O(n)` |

**`LinkedList` 选双向链表，就是为了"给定结点 `O(1)` 增删"**——拿到结点引用后不需要再遍历找前驱。完整推导（含"这个性质如何让 `LinkedHashMap` 实现 LRU"）见 [算法与数据结构 · 双向链表](/fundamentals/algorithms/linear#doubly-linked)。

### `LinkedList` 的真实定位很尴尬 {#linkedlist-uses}

**结论先行**：`LinkedList` 在实际业务代码里用得极少。**原因不是复杂度，是硬件。**

| 对比 | `ArrayList` | `LinkedList` |
|---|---|---|
| 遍历（同 `O(n)`） | **快数倍到数十倍** | 每次 `next` 都可能缓存未命中 |
| 内存 | 数组紧凑 | 每个结点额外两个引用 + 对象头 |
| 尾部追加 | 均摊 `O(1)` | `O(1)`，但**每次都要分配结点**（GC 压力） |
| 头部增删 | `O(n)` | **`O(1)` 胜出**——这是它唯一真正占优的场景 |

**判据**（完整论证见 [算法与数据结构 · 链表真的比数组快吗](/fundamentals/algorithms/linear#linked-vs-array)）：

- 访问模式是"**遍历 + 尾部追加**"（绝大多数业务都是）→ **用 `ArrayList`**；
- 需要**频繁在头部或中间按引用增删**→ 才考虑 `LinkedList`；而如果只是要个双端队列，**`ArrayDeque` 通常更好**。

## 五、Java 集合里"看起来像 O(1)"的坑 {#java-traps}

| 代码 | 直觉判断 | 实际 | 为什么 |
|---|---|---|---|
| `list.get(i)` 在 `LinkedList` 上 | `O(1)` | **`O(n)`** | 链表**没有随机访问**；源码会判断 `i < size/2` 决定从前还是从后走，仍是最坏 `O(n/2)` |
| `list.contains(x)` | `O(1)` | **`O(n)`** | `ArrayList` 要遍历；要 `O(1)` 得用 `HashSet` |
| `map.get(k)` | `O(1)` | 平均 `O(1)`、**最坏 `O(log n)`** | 冲突集中到一个桶时先退化链表，树化后为 `O(log n)` |
| `Arrays.asList(arr)` | 新的 `List` | **共享原数组的视图** | 改一个另一个也变；且 `add`/`remove` 抛 `UnsupportedOperationException` |
| 循环里 `str += x` | `O(n)` | **`O(n²)`** | `String` 不可变，每次拼接都复制全部内容 |
| `new ArrayList<>(other)` | 独立副本 | **浅拷贝** | 元素对象仍是同一批引用 |

**这张表的方法论**：判断集合操作的复杂度时，先问一句"**这个方法内部是遍历、拷贝，还是只动了指针**"。

## 六、高频考点 {#faq}

| 问题 | 答案要点 |
|---|---|
| 数组下标为什么从 0 开始？ | 寻址公式 `base + i * size` 无需额外减法指令，**CPU 少一条指令**；[原理推导](/fundamentals/algorithms/linear#zero-based) |
| 数组插入删除的复杂度？ | 要挪动元素保证连续性：末尾 `O(1)`、头部/中间 `O(n)` |
| 单双向链表的区别？ | 双向多一个 `prev` 指针，**多耗空间换双向遍历与给定结点 `O(1)` 增删** |
| `ArrayList` 扩容几次？ | 无参构造首次 `add` 才初始化为 10，之后每次 **1.5 倍**，`Arrays.copyOf` 全量拷贝 |
| `new ArrayList(10)` 扩容几次？ | **0 次**——只是指定容量并分配数组，未发生扩容 |
| 为什么不用 `Stack`？ | 它继承 `Vector`，**所有方法 `synchronized`**；单线程场景用 `ArrayDeque` |
| `LinkedList` 什么时候才值得用？ | 只有"频繁在头部/中间按引用增删"占优；**遍历场景比 `ArrayList` 慢数倍** |
| `HashMap` 的 `O(1)` 前提是什么？ | 哈希分布均匀时是平均 `O(1)`；冲突集中时树化为 `O(log n)`——**这是防碰撞攻击的设计** |

---

> **下一篇**：[List 集合](/java/collections/list) —— 本篇讲"选型的依据"，下一篇进入 `ArrayList` 的源码实现细节：构造与容量、扩容过程、数组与 List 互转的坑。
>
> **一条纪律**：这一篇的所有结论都必须能落回**某个具体类的某段源码或某次实测差异**上。说"`ArrayList` 扩容 1.5 倍"要能指出 `grow()` 那一行；说"`LinkedList` 慢"要能说出缓存未命中。**只会背复杂度表格的章节，是没写完的章节。**
