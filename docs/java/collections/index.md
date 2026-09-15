---
date: 2026-09-13
title: Java 集合 · 导览
---

# Java 集合 · 导览

Java 集合是**面试密度最高、也最容易「会用不会讲」**的一块：日常开发人人都在 `new ArrayList<>()`，但被追问「扩容几次」「为什么数组长度是 2 的次幂」「1.7 的死循环怎么来的」时，能不能讲到底层，是区分「用过」和「懂」的分水岭。

本板块按**「底层结构 → 具体容器 → 按场景选型」**三层组织：先把数组、链表、二叉树、红黑树、散列表这些底座讲清楚，再看 `ArrayList` / `HashMap` / `HashSet` 各自是怎么在底座上搭起来的，最后收敛到"这个需求该用哪个容器"。理解了底座，源码就不再是死记硬背。

## 一、整体体系 {#system}

| 顶层接口 | 常见实现 | 底层结构 | 有序性 | 线程安全 |
|---|---|---|---|---|
| `List` | `ArrayList` | 动态数组 | 按插入顺序 | 否 |
| `List` | `LinkedList` | 双向链表 | 按插入顺序 | 否 |
| `Map` | `HashMap` | 数组 + 链表 / 红黑树 | 无序 | 否 |
| `Map` | `LinkedHashMap` | `HashMap` + 双向链表 | 插入 / 访问顺序 | 否 |
| `Map` | `TreeMap` | 红黑树 | 键排序 | 否 |
| `Set` | `HashSet` | 内部就是 `HashMap` | 无序 | 否 |
| `Set` | `LinkedHashSet` | 内部就是 `LinkedHashMap` | 插入顺序 | 否 |
| `Set` | `TreeSet` | 红黑树 | 排序 | 否 |

一句话记忆：**`List` 管「第几个」，`Map` 管「是谁」，`Set` 管「有没有」。**

**三条横向记忆线**（把九个类压成三句话）：

| 线 | 规律 |
|---|---|
| **哈希线** | `HashSet` = `HashMap` 的 key；`LinkedHashSet` = `LinkedHashMap` 的 key。**Set 家族没有自己的数据结构** |
| **顺序线** | 无序 → `Hash *`；插入/访问序 → `LinkedHash *`；排序序 → `Tree *`。三种顺序对应三类需求 |
| **判重线** | 哈希家族靠 `hashCode` + `equals`；**树家族靠 `compare` 是否为 0**（这条差异是最隐蔽的坑） |

## 二、三条主线 {#threads}

```text
List 线：数组（连续内存、O(1) 随机访问）
          └─ ArrayList ── 扩容 1.5 倍、System.arraycopy
         链表（非连续、O(1) 增删头尾）
          └─ LinkedList ── 双向链表（也可当 Deque 用）

Map 线：二叉树 ─ 二叉搜索树 ─ 红黑树（自平衡，O(log n)）
                      散列表（数组 + 散列函数）─ 散列冲突 ─ 链表法 / 红黑树
                      └─ HashMap ── 扰动函数、(n-1)&hash、扩容拆分
                      └─ LinkedHashMap ── 加一条贯穿的双向链表 → 顺序 + 淘汰钩子
                      └─ TreeMap ── 红黑树 → 键有序 + 范围查询

Set 线：全部是"Map 的 key 视图"
          ├─ HashSet ← HashMap（PRESENT 哑对象）
          ├─ LinkedHashSet ← LinkedHashMap
          └─ TreeSet ← TreeMap（判重看 compare，不看 equals）
```

**三条线的共同点**：底层结构决定复杂度与顺序，而"顺序"往往是选型的第一判据——**先问"要不要顺序、要哪种顺序"，再问复杂度**。

## 三、本板块导航 {#navigation}

| 篇目 | 覆盖内容 | 关键问题 |
|---|---|---|
| [Java 集合的底层选型](/java/collections/data-structure) | 选型速查表、四类集合的复杂度对照、`ArrayList` 扩容与 1.5 倍、`LinkedList` 的真实定位、"看起来像 O(1)"的坑 | 该选 `ArrayList` 还是 `LinkedList`？为什么扩容是 1.5 倍？ |
| [List 集合](/java/collections/list) | 数组原理、`ArrayList` 源码与扩容、数组 ↔ List 转换、`ArrayList` vs `LinkedList` | `ArrayList` 底层原理？`new ArrayList(10)` 扩容几次？转换后互相影响吗？ |
| [HashMap](/java/collections/hashmap) | 二叉树 / 红黑树 / 散列表、实现原理、put 流程、扩容、寻址算法、1.7 死循环 | `HashMap` 实现原理？put 流程？为什么长度是 2 的次幂？ |
| [HashSet 与去重原理](/java/collections/hashset) | 底层 `HashMap` 与哑对象 `PRESENT`、`add` 返回值来源、`hashCode`/`equals` 契约、只重写一个会怎样、可变元素陷阱、容量预估、五种去重方式选型 | 为什么必须同时重写 `hashCode` 和 `equals`？为什么 `remove` 删不掉？ |
| [TreeSet 与有序集合](/java/collections/treeset) | 红黑树 + `NavigableSet`、`floor`/`ceiling` 等四组边界方法、**比较器与 `equals` 不一致的坑**、范围视图语义、与 `PriorityQueue` 的区别 | `TreeSet` 判重看什么？为什么元素被"吃掉"了？ |
| [LinkedHashMap 与 LRU](/java/collections/linkedhashmap) | 哈希表 + 双向链表、插入序 vs 访问序、三个回调钩子、`removeEldestEntry` 手写 LRU、`get` 会改结构、扫描污染、Java 21 `SequencedMap` | 怎么用十几行实现 LRU？`accessOrder=true` 有什么副作用？ |

## 四、高频考点速查 {#faq}

按「问 → 答 → 详见」压缩成一张表，适合面试前快速扫一遍。

| 高频问题 | 一句话答案 | 详见 |
|---|---|---|
| 数组为什么下标从 0 开始？ | 寻址公式 `base + i * size` 直接用下标，从 1 开始要多一次减法指令 | [底层选型](/java/collections/data-structure#数组为什么下标从-0-开始)　|　[原理推导](/fundamentals/algorithms/linear#zero-based) |
| 数组插入删除为什么慢？ | 要保证内存连续，平均要挪动一半元素，O(n) | [底层选型](/java/collections/data-structure#数组的插入与删除)　|　[缓存与硬件代价](/fundamentals/algorithms/linear#cache-locality) |
| 单向链表和双向链表的区别？ | 双向多一个 `prev` 指针，多耗空间换取「给定节点 O(1) 增删」 | [底层选型](/java/collections/data-structure#单双向链表对比)　|　[原理推导](/fundamentals/algorithms/linear#doubly-linked) |
| `ArrayList` 底层实现原理？ | 动态数组；初始容量 0，首次 add 才初始化 10；扩容 1.5 倍且要数组拷贝 | [List 集合](/java/collections/list#arraylist-底层实现原理) |
| `new ArrayList(10)` 扩容几次？ | 0 次——只声明并实例化，指定容量 10，未扩容 | [List 集合](/java/collections/list#构造与容量) |
| 数组和 List 怎么互转？转换后互相影响吗？ | `Arrays.asList` 共享同一数组（会受影响）；`toArray` 是拷贝（不受影响） | [List 集合](/java/collections/list#数组与-list-互转) |
| `ArrayList` 和 `LinkedList` 的区别？ | 数组 vs 双向链表；随机访问 O(1) vs O(n)；内存一个省一个费；都非线程安全 | [List 集合](/java/collections/list#arraylist-与-linkedlist-对比) |
| `HashMap` 的实现原理？ | 数组 + 链表 / 红黑树；key 哈希定下标，冲突进链表，长度 > 8 且数组 ≥ 64 转红黑树 | [HashMap](/java/collections/hashmap#实现原理) |
| JDK 1.7 和 1.8 的 HashMap 区别？ | 1.7 数组 + 链表；1.8 数组 + 链表 + 红黑树，且扩容改尾插法 | [HashMap](/java/collections/hashmap#jdk-17-与-18-的差异) |
| HashMap 的 put 流程？ | 空表先 resize → 算下标 → 空位直插 / 否则覆盖、树插、链尾插 → size > 阈值再扩容 | [HashMap](/java/collections/hashmap#put-流程) |
| HashMap 的扩容机制？ | 首次初始化 16，之后每次 2 倍；`hash & oldCap` 为 0 留在原位，否则移到「原位 + oldCap」 | [HashMap](/java/collections/hashmap#扩容机制) |
| 为什么数组长度一定是 2 的次幂？ | 位运算 `(n-1) & hash` 代替取模更快；扩容时只需判断 `hash & oldCap` 即可定位新下标 | [HashMap](/java/collections/hashmap#为什么长度必须是-2-的次幂) |
| 1.7 的多线程死循环怎么产生的？ | 扩容时头插法颠倒链表 + 并发迁移，形成 `B → A → B` 环形 | [HashMap](/java/collections/hashmap#jdk-17-的多线程死循环) |
| **`HashSet` 的底层是什么？** | 就是 `HashMap`：value 是所有 key 共用的哑对象 `PRESENT`，`add` 即 `map.put(e, PRESENT)` | [HashSet](/java/collections/hashset#preset-object) |
| **为什么必须同时重写 `hashCode` 和 `equals`？** | 定位分两步：先靠 `hashCode` 进桶、再在桶内用 `equals` 确认；只重写一个都会**完全不去重** | [HashSet](/java/collections/hashset#only-one) |
| **对象被改字段后为什么 `remove` 不掉？** | 参与 `hashCode` 的字段变了 → 桶位置失效，按新哈希找不到；还会留下删不掉的残留（内存泄漏） | [HashSet](/java/collections/hashset#mutable-element) |
| **去重时 `HashSet`/`LinkedHashSet`/`TreeSet` 怎么选？** | 只去重 → `HashSet`；要保插入序 → `LinkedHashSet`；要排序/范围查询 → `TreeSet`（`O(log n)` 且元素须可比较） | [HashSet](/java/collections/hashset#selection) |
| **`TreeSet` 判断重复用 `equals` 吗？** | 不用——用 `compare` 是否为 0；所以**比较器只比部分字段时，元素会被静默吞掉** | [TreeSet](/java/collections/treeset#comparator-vs-equals) |
| **`lower`/`floor`/`ceiling`/`higher` 的区别？** | `floor`/`ceiling` 含等值（≤ / ≥），`lower`/`higher` 严格（< / >）；用法是"找最近的边界值" | [TreeSet](/java/collections/treeset#navigable-set) |
| **`subSet` 返回的是新集合吗？** | 不是，是**视图**：改动互相影响，边界创建时固定，默认半开区间 `[from, to)` | [TreeSet](/java/collections/treeset#subview) |
| **`TreeSet` 和 `PriorityQueue` 怎么选？** | 要按顺序访问所有元素 → `TreeSet`；只反复取最值（且允许重复）→ `PriorityQueue`（遍历无序） | [TreeSet](/java/collections/treeset#vs-priorityqueue) |
| **怎么用 `LinkedHashMap` 实现 LRU？** | 构造传 `accessOrder=true` + 覆盖 `removeEldestEntry` 返回 `size() > capacity`，三行搞定 | [LinkedHashMap](/java/collections/linkedhashmap#lru-impl) |
| **`accessOrder=true` 有什么副作用？** | `get` 会改结构：遍历中 `get` 抛 `CME`，多线程并发 `get` 也可能损坏链表，顺序也不再稳定 | [LinkedHashMap](/java/collections/linkedhashmap#access-order-side-effects) |
| **`LinkedHashMap` 为什么迭代比 `HashMap` 快？** | 它沿链表迭代（`O(size)`），而 `HashMap` 要扫整个 table（`O(capacity)`）——容量大元素少时差距明显 | [LinkedHashMap](/java/collections/linkedhashmap#node-pointers) |
| **生产级缓存为什么不用 `LinkedHashMap` 的 LRU？** | 并发能力差（读也要互斥）+ LRU 有**顺序扫描污染**；单机用 Caffeine（W-TinyLFU），共享用 Redis | [LinkedHashMap](/java/collections/linkedhashmap#lru-limits) |
