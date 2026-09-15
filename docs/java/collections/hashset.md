---
order: 4
date: 2026-09-15
sidebar: HashSet 去重原理
title: HashSet 与去重原理
desc: 底层 HashMap 与哑对象 PRESENT、add 返回值从哪来、hashCode 与 equals 的契约、只重写一个会发生什么、可变元素为何 remove 不掉、容量预估算、五种去重方式选型、LinkedHashSet 与 TreeSet 的取舍
---

# HashSet 与去重原理

> `Set` 是 Java 集合里"最没有存在感"的一个：日常只用它做一件事——**去重**。但"去重"这两个字背后有两个高频追问：**为什么必须同时重写 `hashCode` 和 `equals`？** 以及 **"只重写一个"到底会坏在哪？**
>
> 这一篇的写法是：**先把 HashSet 拆到源码级（它其实没有自己的数据结构），再讲清契约，最后落到选型与坑。**

## 一、问题场景 {#why-hashset}

三个真实问题：

| 现象 | 根因方向 |
|---|---|
| 两个字段完全相同的对象，`set.size()` 却是 2 | `hashCode` / `equals` 没重写（或有其一只重写了一个） |
| 自定义对象放进 `HashSet` 后，用 `contains` 查不到、`remove` 删不掉 | 对象的哈希值变了，或有字段参与了 `equals` 但没参与 `hashCode` |
| 导入 10 万条数据去重很慢、GC 频繁 | 没预估容量，触发了十几次扩容与数组拷贝 |

三个问题的共同点是：**看起来在问 API，实际在问契约与底层结构**。

## 二、底层就是 HashMap {#structure}

### 2.1 一个哑对象撑起整个 Set {#preset-object}

```java
public class HashSet<E> extends AbstractSet<E> implements Set<E>, Cloneable, java.io.Serializable {

    private transient HashMap<E, Object> map;                    // 全部能力都来自它

    private static final Object PRESENT = new Object();          // 所有 key 共用的哑 value

    public HashSet()                { map = new HashMap<>(); }
    public HashSet(int initialCapacity) { map = new HashMap<>(initialCapacity); }

    public boolean add(E e)     { return map.put(e, PRESENT) == null; }
    public boolean remove(Object o) { return map.remove(o) == PRESENT; }
    public boolean contains(Object o) { return map.containsKey(o); }
    public Iterator<E> iterator() { return map.keySet().iterator(); }
}
```

**读完这段能直接推出四件事：**

| 结论 | 推导 |
|---|---|
| `HashSet` **没有自己的数据结构** | 它就是 `HashMap` 的 `keySet` 视图，value 是所有人共享的同一个 `PRESENT` |
| **不能有重复元素** | 因为 `HashMap` 的 key 唯一 |
| **不保证顺序** | 顺序由哈希桶的位置决定，与插入顺序无关 |
| **允许一个 `null`** | `HashMap` 允许一个 null key |

### 2.2 `add` 的返回值从哪来 {#add-return}

```java
public boolean add(E e) { return map.put(e, PRESENT) == null; }
```

**`HashMap.put` 返回的是"被覆盖的旧值"，没有旧值就返回 `null`。** 因为 value 永远是 `PRESENT`，所以：

| `put` 返回 | 含义 | `add` 返回 |
|---|---|---|
| `null` | 这个 key 原来不存在 | `true`（确实新增了） |
| `PRESENT` | 这个 key 原来已存在（更新了 value） | `false`（重复，未新增） |

**这是"用返回值判断是否重复"的实现基础**——不需要先 `contains` 再 `add`（那是两次查找，多一次哈希定位）。

**性能提示**：`map.put(e, PRESENT)` 在重复 key 时会发生"覆盖写入"，也就是**对已存在的 entry 做一次 value 赋值**（同一个 `PRESENT`）。这带来极小但真实的写开销，也是"先 `contains` 再 `add` 反而更慢"的原因（`contains` 需要完整查找一次，命中后还要再 put 一次）。

## 三、去重的契约：`hashCode` 与 `equals` {#hash-contract}

### 3.1 两个方法必须同时重写 {#must-both}

`HashMap` 定位元素是**两步**：

```text
① 算哈希 → 定位到桶：index = (n - 1) & hash(key)
② 在桶内（链表或红黑树）用 equals 逐个比较，找到"相等"的那个
```

**两步的分工决定了两个方法的分工**：

| 方法 | 负责 | 不重写的后果 |
|---|---|---|
| `hashCode()` | **定位到哪个桶**（粗筛） | 每个对象用 `Object` 的哈希（近似地址），"相等"的对象落到不同桶 |
| `equals()` | **桶内确认是否同一个**（细判） | 用 `Object` 的引用比较，即使落到同一个桶也不认为相等 |

### 3.2 只重写一个会发生什么 {#only-one}

这是本节的核心问题，答案是**两种情况都不去重**，但坏的方式不同：

| 情况 | 定位 | 判定 | 结果 |
|---|---|---|---|
| **只重写 `equals`** | `Object.hashCode()`（不同对象几乎总不同）→ **落到不同桶** | 根本不会走到 `equals` | ❌ 不去重（且 `contains` / `remove` 全失效） |
| **只重写 `hashCode`** | 可能落到同一个桶 | `Object.equals()` 引用比较 → 不相等 | ❌ 不去重（只是多了桶内比较的开销） |
| **两个都重写** | 落到同一个桶 | 字段比较相等 | ✅ 正确去重 |

**关键理解**：**"落到同一个桶"是能进行 `equals` 比较的前提**。只重写 `equals` 时，两个逻辑上相等的对象因为哈希不同，被分到了不同的桶里——`HashMap` 压根不会拿它们做比较。这就是"必须同时重写"的真正原因，而不只是一条记忆规则。

**一个反向的推论**：`hashCode` 相同但 `equals` 不等时，它们会**共存于同一个桶**（链化或树化），只是查询时桶内比较多一些。所以"哈希冲突"影响的是**性能**，"不该相等却相等"影响的是**正确性**。

### 3.3 契约的四条要求 {#why-same-hash}

来自 `Object` 的规范（这是面试最愿意深挖的地方）：

| 要求 | 说明 |
|---|---|
| **一致性** | 同一次运行内，只要参与 `equals` 的字段没变，`hashCode` 必须始终相同（**不要求跨进程/跨版本稳定**——所以不要把 `hashCode` 持久化到数据库） |
| **相等必同哈希** | `a.equals(b)` 为 true ⇒ 必须有 `a.hashCode() == b.hashCode()`（**必须**） |
| **不等可同哈希** | `equals` 不等时 `hashCode` **允许**相同（这就是哈希冲突，允许但影响性能） |
| **`equals` 自身的性质** | 自反、对称、传递、与 `null` 比较恒为 false |

**"不要求跨进程稳定"这条很实用**：所以不要用 `String.hashCode()` 的结果做数据分片键或落库标记——不同 JVM 版本/不同实现可能不同，而且 `String.hashCode` 的碰撞是可以被人为构造的（安全场景需换 `hash` 更强的算法）。

### 3.4 可变对象做元素：改完就找不到了 {#mutable-element}

```java
Set<Order> set = new HashSet<>();
Order o = new Order("A001", 100);
set.add(o);

o.setAmount(200);              // 改了参与 hashCode 的字段
set.contains(o);               // false ← 哈希变了，去了别的桶找
set.remove(o);                 // false ← 删不掉
set.add(o);                    // true  ← 又加进去一份，现在集合里有两个"同 id"元素
```

**这个问题的本质**：元素一旦进入 `HashSet`，它的 `hashCode` 就被**默认为不变**。改了字段，集合里那条记录仍然躺在**旧的桶位置**，但按新哈希去查会去**新的桶位置**找——于是同一条记录"看似消失了"，同时又可以再插一份。

**两个后果**：① 逻辑错误（去重失效）；② **内存泄漏**（无法 `remove` 的残留元素）。集合里出现了永远删不掉的条目。

**工程结论**：

- **`HashSet` 里的元素应当是不可变的**（或者至少：参与 `hashCode` / `equals` 的字段不可变）。
- 要用可变对象，就把**标识字段**（如 `id`）而非"全部字段"纳入 `hashCode` / `equals`。
- **典型翻车场景**：把 ORM 实体放进 `Set` 后修改业务字段，再 `remove`——删不掉。正确做法是 `Set<Long> ids` 或 `Set<EntityRef>` 这类**只含标识**的元素。

## 四、容量预估：去重的性能从哪来 {#capacity}

`HashSet` 的默认负载因子是 **0.75**（与 `HashMap` 一致）：元素数超过 `容量 × 0.75` 就**扩容到 2 倍**并重新散列。

| 构造方式 | 底层 HashMap 容量 | 说明 |
|---|---|---|
| `new HashSet<>()` | 懒初始化，首次 `add` 时分配 **16** | 最常用，也是扩容最多的一种 |
| `new HashSet<>(n)` | 提升到 ≥ n 的 **2 的幂** | 注意：传 100 得到的是 128，不是恰好 100 |
| `new HashSet<>(collection)` | `max((int)(size / 0.75f) + 1, 16)` | **JDK 源码就是按 0.75 反推容量的** |

**为什么要预估**：去重 10 万个元素，不预估容量时大约经历 `16 → 32 → … → 262144` 共 **14 次扩容**，每次都要重建哈希表并搬运全部元素（`O(n)` 级别的工作）。**这是"导入慢、GC 频繁"最常见的原因**。

**推荐写法**：

```java
int expected = 100_000;
Set<Long> seen = new HashSet<>((int) (expected / 0.75f) + 1);      // 预留，避免扩容
```

**顺带一个"想都不用想"的性能事实**：`HashSet` 的 `add` / `contains` / `remove` 平均是 `O(1)`，最坏是 `O(log n)`（桶内树化后）或 `O(n)`（极端哈希冲突）。对比：
- `ArrayList.contains` 是 `O(n)`（线性扫描）；
- 用 `List` 做去重（`if (!list.contains(x)) list.add(x)`）在 10 万量级上是 **`O(n²)`** —— 这类代码在数据量上来后是灾难。

## 五、五种去重方式的选型 {#alternatives}

| 方式 | 保留顺序 | 复杂度 | 适用与代价 |
|---|---|---|---|
| **`HashSet`** | ❌ | 平均 `O(n)` | **默认选择**，纯去重、不需要顺序 |
| **`LinkedHashSet`** | ✅ 插入序 | 平均 `O(n)` | 去重要保持顺序（如"按首次出现顺序输出"）；多维护一条双向链表 |
| **`TreeSet`** | ✅ 排序序 | `O(n log n)` | 去重后**必须有序**；要求元素可比较（详见 [TreeSet 与有序集合](/java/collections/treeset)） |
| **`Stream.distinct()`** | 实践上保留首次出现顺序 | 平均 `O(n)` | 链式写法最简洁；**内部用 `LinkedHashSet`** 记录已见元素，但**文档不保证顺序**，别把它当契约 |
| **数据库 / 外部去重** | 视实现 | 视实现 | 数据量大、已有持久层时更省内存（`DISTINCT`、`GROUP BY`、唯一索引） |

**两条实务提示**：

1. **`Collectors.toSet()` 不保证返回的具体类型**（当前实现是 `HashSet`，但规范只说"`Set`"）。要确定顺序就用 `Collectors.toCollection(LinkedHashSet::new)`；要确定类型就自己 `new`。
2. **`Collectors.toMap` 遇到重复 key 会抛 `IllegalStateException`**，而 `toSet` 直接去重。做"按 id 归并"时要显式给合并函数（`(a, b) -> a`），否则重复数据会变成运行时异常。

**再往上一个量级**：元素到**千万/亿级**、且能接受"极小概率把不存在的判为存在"时，`HashSet` 的内存开销（每个元素一个 Node，几十字节起步）会成为瓶颈——这时该换成**布隆过滤器**或**位图**，原理见[海量数据处理](/fundamentals/algorithms/high-volume)。

## 六、与 `LinkedHashSet`、`TreeSet` 的三方对照 {#selection}

| 维度 | `HashSet` | `LinkedHashSet` | `TreeSet` |
|---|---|---|---|
| 底层 | `HashMap` | `LinkedHashMap`（哈希 + 双向链表） | `TreeMap`（红黑树） |
| 迭代顺序 | 无保证 | **插入顺序** | **排序顺序** |
| 单次操作复杂度 | 平均 `O(1)` | 平均 `O(1)` | `O(log n)` |
| 元素要求 | 正确实现 `hashCode` / `equals` | 同左 | **必须可比较**（`Comparable` 或给 `Comparator`） |
| 允许 `null` | 允许一个 | 允许一个 | 自然排序下**不允许**（`compareTo` 会 NPE）；给了 `Comparator` 则可以 |
| 内存 | 最低 | 略高（多两个指针/节点） | 较高（树节点 + 平衡信息） |
| 额外能力 | — | — | `NavigableSet`：`floor` / `ceiling` / `subSet` / `headSet` 等 |

**选型判据（三句话）**：

1. **只去重** → `HashSet`；
2. **去重且要记住"谁先来"** → `LinkedHashSet`（例如"按用户首次出现顺序输出标签"）；
3. **去重且要按顺序输出 / 需要范围查询** → `TreeSet`，并接受 `O(log n)` 与"元素必须可比较"的代价。

**并发场景**：`HashSet` 非线程安全。要并发去重，**优先用 `ConcurrentHashMap.newKeySet()`**（Java 8+，返回一个基于 `ConcurrentHashMap` 的 `Set` 视图，写操作分段/无锁化程度比 `Collections.synchronizedSet(new HashSet<>())` 好得多），细节见[并发容器](/java/concurrent/concurrent-collections)。

## 七、常见坑 {#pitfalls}

| 坑 | 症状 | 修法 |
|---|---|---|
| **自定义对象只重写 `equals`** | 完全不去重 | 两个一起重写（IDE / Lombok 生成） |
| **只重写 `hashCode`** | 不去重，还多一层桶内比较 | 同上 |
| **字段参与 `equals` 但没参与 `hashCode`** | 偶发不去重（哈希碰巧相同才正确） | 用同一组字段（IDE 默认就是这么做的） |
| **Lombok `@Data` 用在有继承关系的类上** | 子类 `equals` 只比子类字段 | 加 `@EqualsAndHashCode(callSuper = true)` |
| **可变对象做元素后改字段** | `remove` 删不掉、重复插入、内存泄漏 | 元素不可变，或只用标识字段 |
| **ORM 实体直接放进 `Set`** | 懒加载、循环引用、`hashCode` 依赖可变字段 | 用 `Set<Long>` 存 id，或只用主键参与 `equals`/`hashCode` |
| **忘记预估容量** | 大数据量导入慢、GC 频繁 | 按 `expected / 0.75 + 1` 预置容量 |
| **用 `List.contains` 做去重** | 数据量上来后变成 `O(n²)` | 换 `HashSet` |
| **期望 `Stream.distinct()` 保证顺序** | 换实现后顺序变了 | 需要顺序就显式 `toCollection(LinkedHashSet::new)` |
| **直接把 `HashSet` 当并发集合用** | 偶发死循环 / 数据错乱 | `ConcurrentHashMap.newKeySet()` |

## 八、使用场景与面试问答 {#interview}

**Q1：`HashSet` 的底层是什么？**

就是 `HashMap`：`HashSet` 内部持有一个 `HashMap<E, Object>`，所有 key 共用一个静态哑对象 `PRESENT` 作为 value；`add` 即 `map.put(e, PRESENT)`，`contains` 即 `map.containsKey`。因此它天然具备"元素唯一、无序、允许一个 null、非线程安全"这些性质——**这些性质全部继承自 `HashMap` 的 key 特性**。

**Q2：`add` 怎么知道自己是否真的新增了元素？**

`map.put(e, PRESENT)` 返回的是被覆盖的旧值：返回 `null` 说明此前没有这个 key（新增成功，`add` 返回 `true`），返回 `PRESENT` 说明已存在（重复，`add` 返回 `false`）。所以判断重复**不需要先 `contains`**——那会多一次哈希定位。

**Q3：为什么必须同时重写 `hashCode` 和 `equals`？**

因为 `HashMap` 的定位是两步：**先用 `hashCode` 决定进哪个桶，再在桶内用 `equals` 确认是否相等**。"落在同一个桶"是能够进行 `equals` 比较的前提：

- **只重写 `equals`**：两个逻辑相等的对象哈希不同 → 被分到不同桶 → 永远不会互相比较 → 不去重；
- **只重写 `hashCode`**：可能同桶，但 `equals` 走 `Object` 的引用比较 → 仍不相等 → 不去重。

**Q4：`hashCode` 相同、`equals` 不同的两个对象能同时存在于 `HashSet` 吗？**

**能。** 它们共享一个桶（以链表或红黑树形式共存）。哈希冲突只影响性能，不影响正确性——这是"`equals` 不等时 `hashCode` 可以相同"这条契约的允许范围。

**Q5：对象放进 `HashSet` 后修改了字段会怎样？**

如果改的是参与 `hashCode` 的字段，该元素在集合中的**桶位置已经失效**：`contains` / `remove` 都会按新哈希去别的桶找，于是返回 `false`；而 `add` 又能成功插入一份新的——结果是**去重失效 + 删不掉的残留元素（内存泄漏）**。结论：**`HashSet` 的元素应不可变**，或只把标识字段纳入 `hashCode` / `equals`。

**Q6：`HashSet` 的初始容量怎么给？**

默认 16、负载因子 0.75，超过 `容量 × 0.75` 就翻倍扩容并重新散列。已知元素数量时按 **`(int) (expected / 0.75f) + 1`** 预置容量（`HashSet` 会自动提升到 2 的幂），可完全避免扩容开销——数据量大时这一步的收益非常明显。

**Q7：去重时 `HashSet`、`LinkedHashSet`、`TreeSet` 怎么选？**

只去重选 `HashSet`（`O(1)`）；去重且要保留**插入顺序**选 `LinkedHashSet`；去重且要**排序或范围查询**选 `TreeSet`（`O(log n)`，且元素必须可比较）。并发场景用 `ConcurrentHashMap.newKeySet()`。

**Q8：`Stream.distinct()` 和 `new HashSet<>(list)` 有什么区别？**

结果集合相同（都是去重），差别在**返回类型与顺序保证**：`Stream.distinct()` 是惰性流水线中的一个有状态中间操作，内部用 `LinkedHashSet` 记录已见元素，因此实践中保留首次出现顺序，但**规范不保证**；`new HashSet<>(list)` 得到的 `HashSet` 完全无序。需要确定的顺序就显式用 `LinkedHashSet`。

**Q9：`Set` 能用来做"已处理 ID"的幂等判重吗？**

可以，但要注意两点：① **它是单机的、内存态的**——多实例部署或重启后失效，必须落到外部存储（Redis / 数据库唯一索引）才具备真正的幂等语义；② **要考虑过期与容量上限**——无限增长的 `Set` 会把内存吃光，通常配合 TTL 或改用布隆过滤器（可接受极小误判时）。

---

> 相关篇目：[HashMap 实现原理](/java/collections/hashmap)（底层结构与扩容）、[TreeSet 与有序集合](/java/collections/treeset)（排序版的 `Set`）、[并发容器](/java/concurrent/concurrent-collections)（`ConcurrentHashMap.newKeySet()`）、[海量数据处理](/fundamentals/algorithms/high-volume)（布隆过滤器与位图）。
