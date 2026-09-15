---
order: 5
date: 2026-09-15
sidebar: TreeSet 与有序集合
title: TreeSet 与有序集合
desc: 红黑树与 NavigableSet 的四组边界方法、Comparable 与 Comparator 的取舍、「比较器与 equals 不一致」这个最隐蔽的坑、范围视图的语义、与 PriorityQueue 的区别、排行榜的完整写法
---

# TreeSet 与有序集合

> `TreeSet` 的使用频率远低于 `HashSet`，但它藏着一个**比 `hashCode`/`equals` 更容易踩的坑**：它判定"重复"根本不看 `equals`，而是看 `compareTo` 是否返回 0。
>
> 理解这一点，才能解释"我明明只想按分数排序，为什么元素被吃掉了一半"这类事故。

## 一、问题场景 {#why-treeset}

一段看起来很正常的排行榜代码：

```java
// 按分数倒序排的排行榜
Set<Player> rank = new TreeSet<>(Comparator.comparingInt(Player::score).reversed());

rank.add(new Player("A", 100));
rank.add(new Player("B", 100));
rank.add(new Player("C", 90));

System.out.println(rank.size());     // 期望 3
```

**实际输出是 2。** 因为比较器只看了 `score`，`A` 和 `B` 的 `compare` 结果为 0，`TreeSet` 判定它们是**同一个元素**，第二个被直接丢弃。

**这个例子说明本页的核心结论**：**在 `TreeSet` 里，比较器不只是"排序规则"，它还兼任"去重规则"**。

## 二、结构：红黑树 + 一个"排序版的 Set" {#structure}

### 2.1 与 `HashSet` 的同构关系 {#red-black}

| | `HashSet` | `TreeSet` |
|---|---|---|
| 内部字段 | `HashMap<E, Object> map` | `NavigableMap<E, Object> m`（实际是 `TreeMap`） |
| 哑 value | `PRESENT` | `PRESENT`（同一个技巧） |
| 元素唯一性由什么决定 | `hashCode` + `equals` | **`compareTo` / `compare` 是否为 0** |
| 底层结构 | 数组 + 链表 / 红黑树 | **红黑树**（无数组，直接从树根开始） |
| 复杂度 | 平均 `O(1)`，最坏 `O(n)` | **稳定 `O(log n)`** |

**为什么用红黑树**：它用"最长路径不超过最短路径的两倍"这种**弱平衡**换来了更少的旋转次数——插入/删除的维护成本比严格平衡的 AVL 树低，而查找仍是 `O(log n)`。对"增删查混合"的通用容器，这是更划算的取舍（推导见[树与索引结构](/fundamentals/algorithms/tree)）。

**注意复杂度的差别**：`HashMap` 的 `O(1)` 是**平均**的（依赖哈希分布），`TreeSet` 的 `O(log n)` 是**最坏保证**。所以"`HashSet` 一定比 `TreeSet` 快"并不严格——哈希被恶意构造时（如哈希碰撞攻击），`HashSet` 会退化到 `O(n)` 甚至更差。

### 2.2 能力清单：`NavigableSet` 才是它存在的理由 {#navigable-set}

`TreeSet` 实现了 `NavigableSet`，这是它相对 `HashSet` 的**真正增量**——不只是"有序"，而是**有序带来的查询能力**：

```java
TreeSet<Integer> s = new TreeSet<>(List.of(10, 20, 30, 40));

s.first();            // 10        最小
s.last();             // 40        最大
s.lower(25);          // 20        < 25 的最大值（严格小于）
s.floor(25);          // 20        ≤ 25 的最大值
s.ceiling(25);        // 30        ≥ 25 的最小值
s.higher(25);         // 30        > 25 的最小值
s.lower(20);          // 10        ← lower 是严格的：等于不算
s.floor(20);          // 20        ← floor 包含等于

s.pollFirst();        // 弹出并返回最小元素
s.pollLast();         // 弹出并返回最大元素

s.descendingSet();    // 逆序视图
s.descendingIterator();

s.subSet(20, 40);              // [20, 40)  半开区间
s.subSet(20, true, 40, true);  // [20, 40]  显式控制开闭
s.headSet(30);                 // [10, 20]
s.tailSet(30);                 // [30, 40]
```

**`lower` / `floor` / `ceiling` / `higher` 四兄弟的记忆法**（`lower`/`higher` 是**严格**的，`floor`/`ceiling` **包含**等值）：

```text
          floor(e)   ceiling(e)
   ────●──────┴──────────┴──────●────
     lower(e)              higher(e)
       (严格小于)             (严格大于)
```

**这四个方法是"区间类需求"的标准解**：如"找出小于等于当前时间的最近一个价格档位"、"取第一个不小于阈值的范围分片"——用 `HashSet` 要全量扫描，用 `TreeSet` 是 `O(log n)`。

**一条 Java 21 的补充**：`SortedSet`（含 `TreeSet`）从 Java 21 起也属于 `SequencedSet`，因此有 `getFirst()` / `getLast()` / `reversed()` 这些统一接口方法。但因为是"**排序决定顺序**"，`addFirst` / `addLast` 这类"按位置插入"的操作对有序集合**不适用**（会抛 `UnsupportedOperationException`）——只有 `LinkedHashSet` 那种"顺序可变"的集合才会实现它们。

## 三、排序规则：`Comparable` 还是 `Comparator` {#ordering}

| 方式 | 写法 | 特点 |
|---|---|---|
| **自然排序** | `new TreeSet<>()`，元素实现 `Comparable` | 顺序"内置"在元素类型里，全局唯一一种 |
| **外部比较器** | `new TreeSet<>(comparator)` | 同一个类型可以有**多种排序**（按分数、按时间…） |
| 都提供时 | — | **比较器优先**，自然排序被忽略 |
| 都不提供 | — | 运行期抛 `ClassCastException` |

**设计取舍**：

| 建议 | 理由 |
|---|---|
| **能用 `Comparator` 就不要继承 `Comparable`** | 排序是"使用场景"的属性，不是"数据类型"的内在属性；把它写进类里会限制未来复用 |
| **`Comparable` 的 `compareTo` 必须与 `equals` 一致** | 这是 `Comparable` 接口文档的**强烈建议**（强建议而非强制）。违反会导致"在 `TreeSet` 里和在 `HashSet` 里元素个数不同"这类诡异现象 |
| **比较器要用链式比较器保证全序** | `comparingInt(...).thenComparing(...)`，见下节 |

**一个必须检查的点**：`Comparator.comparingInt(Player::score).reversed()` 这类写法在**只按一个字段**比较时，会把"该字段相同"的所有元素视为同一个；正确做法是补上**兜底比较**（见下一节）。

## 四、核心陷阱：比较器与 `equals` 不一致 {#comparator-vs-equals}

这一节是本篇的重点。`Set` 接口的规范要求集合"不包含重复元素"，而在 `TreeSet` 里"重复"的判定权完全交给了比较逻辑：

```text
HashSet 判重：hashCode 定位 → equals 确认
TreeSet 判重：compare(a, b) == 0 就是同一个元素   ← 与 equals 无关
```

两种不一致的后果方向相反，**都可能造成数据错误**：

| 不一致的方向 | 场景 | 后果 |
|---|---|---|
| **`compare == 0` 但 `equals == false`** | 比较器只比部分字段（如只比 `score`） | **元素被静默吞掉**（"重复"，丢掉不存）—— 这就是开头的排行榜 bug |
| **`equals == true` 但 `compare != 0`** | `equals` 全字段比较，`compare` 只比 id | 可以插入**两份逻辑相等**的元素，**违反 `Set` 契约** |

**两个方向的共同修法：让比较逻辑成为"全序"**——为"主字段相同"的情况提供确定的兜底比较。

```java
// ✗ 只比 score：同分选手互相覆盖
Comparator.comparingInt(Player::score).reversed()

// ✓ 分数降序 → 同分按时间升序（先达成者在前）→ id 兜底保证全序
Comparator.comparingInt(Player::score).reversed()
          .thenComparing(Player::achievedAt)          // 同分比时间
          .thenComparing(Player::id)                  // 时间也相同则用唯一 id 兜底
```

**判据（值得背下来）**：

> 给 `TreeSet` 写比较器时，问自己一句：**"这个比较器会对两个不同的元素返回 0 吗？"**
> 会 → 它们会被当成同一个元素。若这不是你要的语义，就补兜底字段直到**只有真正同一个元素才返回 0**。

**顺带一个反向利用**：如果你确实想"**按某个维度去重**"（例如"每个用户只保留分数最高的一条"），那么"比较器只比用户 id、value 用 `TreeMap` 存分数"反而是正确设计——**关键是意识到这个语义，而不是碰巧得到它**。

## 五、范围视图：它返回的不是新集合 {#subview}

```java
TreeSet<Integer> s = new TreeSet<>(List.of(10, 20, 30, 40));
SortedSet<Integer> range = s.subSet(20, 40);     // [20, 40)

range.add(25);          // 会影响 s
System.out.println(s);  // [10, 20, 25, 30, 40]
range.add(50);          // ← 抛 IllegalArgumentException：超出了一次性设定的范围
```

| 规则 | 说明 |
|---|---|
| **是视图，不是拷贝** | 对子集的修改直接反映到原集合，反之亦然 |
| **边界一次性设定** | 视图设定了上下界，插入越界元素会抛 `IllegalArgumentException` |
| **默认半开区间** | `subSet(from, to)` 是 `[from, to)`；要闭区间用四参重载 |
| **参数反向会抛异常** | `from > to` 时抛 `IllegalArgumentException`（不是返回空集） |
| **结构性修改会导致 `ConcurrentModificationException`** | 视图上迭代 + 原集合结构性修改 = fail-fast |

**这个"视图语义"与 `List.subList` 是同一族问题**（`ArrayList` 的 `subList` 也是视图，会引发内存泄漏与 `CME`）。**工程建议**：跨方法传递时用 `new TreeSet<>(s.subSet(...))` 显式拷贝，除非你确定需要联动。

**为什么它必须是视图**：`subSet` 要支持 `O(log n)` 的创建（否则每次都要拷贝，开销与区间大小成正比）。视图是"延迟求值"的必然结果——**能力与陷阱来自同一个设计决定**。

## 六、三方对照与选型 {#compare}

| 维度 | `HashSet` | `LinkedHashSet` | `TreeSet` |
|---|---|---|---|
| 顺序 | 无 | 插入顺序 | 排序顺序 |
| 单次操作 | 平均 `O(1)` | 平均 `O(1)` | `O(log n)` |
| 判重依据 | `hashCode` + `equals` | 同左 | **`compare` == 0** |
| 范围查询 | ❌ | ❌ | ✅ `floor` / `ceiling` / `subSet` 等 |
| 元素要求 | 实现 `hashCode` / `equals` | 同左 | **必须可比较** |
| `null` | 允许一个 | 允许一个 | 自然排序**不允许**（`compareTo` NPE）；给了能处理 `null` 的比较器才可以 |
| 内存 | 最低 | 略高 | 最高（树节点） |
| 并发替代 | `ConcurrentHashMap.newKeySet()` | 无直接对应 | **`ConcurrentSkipListSet`**（跳表实现，并发有序） |

**选型三问**：

1. **需要顺序吗？** 不需要 → `HashSet`；
2. **需要的是"插入顺序"还是"排序顺序"？** 插入顺序 → `LinkedHashSet`；排序顺序 → `TreeSet`；
3. **需要"找最近的边界值"吗？**（`floor` / `ceiling` / 范围切片）→ **只有 `TreeSet` 能高效做到**。

**注意**：如果需要"有序"但**只在遍历时才需要**，用 `LinkedHashSet` 或"最后 `TreeSet` 排一次"可能更划算——`TreeSet` 的每次插入都在付出 `O(log n)` 与树平衡的代价。

## 七、与 `PriorityQueue` 的区别 {#vs-priorityqueue}

两者都基于"有序结构"，但用途几乎不重叠：

| 维度 | `TreeSet` | `PriorityQueue` |
|---|---|---|
| 结构 | 红黑树（**全序**） | 二叉堆（**只保证堆顶最值**） |
| 遍历顺序 | **有序** | **无序** |
| 是否允许重复元素 | ❌ 不允许（`compare` 为 0 视为同一个） | ✅ **允许** |
| 支持任意元素查询 | ✅ `contains` / `floor` / `subSet` | ❌ `contains` 是 `O(n)` 线性扫描 |
| 取最值 | `first()` / `pollFirst()` | `peek()` / `poll()` |
| 典型用途 | 索引、区间查询、去重 + 有序 | 任务调度、TopK、合并有序流 |

**一句话判据**：**"我要按顺序访问所有元素" → `TreeSet`；"我只要不断取出最值" → `PriorityQueue`。**

**注意 `PriorityQueue` 遍历无序这一点经常被误解**：它的迭代器**不保证任何顺序**（内部数组是堆形态），要按序取出只能用 `poll()` 一个个弹（会破坏堆）。

## 八、常见坑 {#pitfalls}

| 坑 | 症状 | 修法 |
|---|---|---|
| **比较器只比部分字段** | 元素被静默吞掉 | 补兜底比较，保证全序 |
| **`Comparable` 与 `equals` 不一致** | 同一批元素在 `HashSet` 与 `TreeSet` 里个数不同 | 让 `compareTo` 的 0 与 `equals` 的 true 对齐 |
| **自然排序放 `null`** | `NullPointerException` | 用能处理 `null` 的比较器，或不允许 `null` |
| **元素不可比较** | `ClassCastException`（运行期才炸） | 显式提供 `Comparator` |
| **把 `subSet` 当拷贝用** | 改子集影响了原集合 / 抛 `IllegalArgumentException` | 跨方法传递时 `new TreeSet<>(...)` 拷贝 |
| **遍历时修改原集合** | `ConcurrentModificationException` | 用迭代器的 `remove()`，或收集后再改 |
| **用 `TreeSet` 做大规模去重** | 比 `HashSet` 慢一个量级 | 只去重就用 `HashSet` |
| **多线程共享 `TreeSet`** | 数据错乱 / 死循环 | `ConcurrentSkipListSet` 或加锁 |

## 九、使用场景与面试问答 {#interview}

**Q1：`TreeSet` 的底层是什么？**

`TreeMap`（红黑树），与 `HashSet`/`HashMap` 的关系完全同构：`TreeSet` 内部持有 `NavigableMap`，所有 key 共用同一个哑对象 `PRESENT` 作 value。差别在于**元素唯一性由 `compare` 是否返回 0 决定，而不是 `equals`**。

**Q2：`TreeSet` 判断重复用的是 `equals` 吗？**

**不是。** 它用 `compareTo`（或 `Comparator.compare`）是否为 0 判断"是不是同一个元素"。因此比较器只比较部分字段时，这些字段相同的元素会被当作重复而**被丢弃**——这是最隐蔽的一类数据丢失 bug。

**Q3：`Comparable` 和 `Comparator` 怎么选？**

优先用 `Comparator`：排序是**使用场景**的属性，不是数据类型的内在属性，用外部比较器可以让同一类型支持多种排序（按分数、按时间），也不必修改原始类。用 `Comparable` 时，其 `compareTo` **应与 `equals` 保持一致**，否则会出现"同一批元素在不同 `Set` 实现里个数不同"。

**Q4：`lower` / `floor` / `ceiling` / `higher` 有什么区别？**

`lower(e)` = 严格小于 e 的最大元素；`floor(e)` = 小于等于 e 的最大元素；`ceiling(e)` = 大于等于 e 的最小元素；`higher(e)` = 严格大于 e 的最小元素。**记忆：`floor`/`ceiling` 包含等值，`lower`/`higher` 不包含。** 这四个方法是区间类需求（找最近档位、找不小于阈值的分片）的高效解。

**Q5：`subSet` 返回的是新集合吗？**

不是，是**视图**。对它的修改会影响原集合，反之亦然；且视图的边界在创建时就固定了，插入越界元素会抛 `IllegalArgumentException`；默认是**半开区间** `[from, to)`。跨方法传递时建议显式 `new TreeSet<>(...)` 拷贝。这与 `List.subList` 是同一族设计。

**Q6：`TreeSet` 和 `PriorityQueue` 怎么选？**

`TreeSet` 是**全序**结构，遍历有序、支持 `contains` 与范围查询、**不允许重复元素**；`PriorityQueue` 是**堆**，只保证堆顶是最值、**遍历无序**、**允许重复**、除堆顶外的查询都是 `O(n)`。

判据：**要按顺序访问所有元素 → `TreeSet`；只反复取最值 → `PriorityQueue`。**

**Q7：`TreeSet` 为什么不允许 `null`？**

自然排序下，`add(null)` 会调用比较操作（`null.compareTo(...)` 或 `compareTo(null)`）而抛 `NullPointerException`。如果提供了能正确处理 `null` 的 `Comparator`（例如把 `null` 排在最后），则可以放入——所以"不允许 `null`"是**自然排序的限制，不是 `TreeSet` 本身的限制**。

**Q8：需要一个"并发且有序"的集合怎么办？**

用 **`ConcurrentSkipListSet`**：它基于**跳表**（多层索引链表）实现有序性，用 CAS 做并发控制，因此能提供并发下的有序访问与范围查询——红黑树的结构调整涉及多点修改，难以做到无锁并发，这是 `TreeSet` 没有并发版本、而跳表有（`ConcurrentSkipListMap/Set`、Redis 的有序集合也是跳表）的根本原因。

**Q9：用 `TreeSet` 实现排行榜要注意什么？**

三点：① **同分必须"再比下一个字段"**，否则同分选手会互相覆盖（比较器兼任去重规则）；② 分数会变化时要注意——**元素可变会让树的结构失效**（改分数后位置就错了），通常的做法是"先 `remove` 旧的、再 `add` 新的"，或干脆用 `TreeMap<Score, Set<Player>>` 这种"分数 → 选手集合"的结构；③ 分布式/多实例场景应交给 **Redis ZSet**（同样是跳表 + 分数排序），单机 `TreeSet` 不具备共享与持久化能力。

---

> 相关篇目：[HashSet 与去重原理](/java/collections/hashset)（哈希版去重与契约）、[HashMap 实现原理](/java/collections/hashmap)（`TreeMap` 的对照面）、[树与索引结构](/fundamentals/algorithms/tree)（红黑树与跳表的原理）、[并发容器](/java/concurrent/concurrent-collections)（并发集合全景）。
