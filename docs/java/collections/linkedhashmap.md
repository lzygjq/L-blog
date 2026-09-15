---
order: 6
date: 2026-09-15
sidebar: LinkedHashMap 与 LRU
title: LinkedHashMap 与 LRU
desc: 哈希表 + 贯穿双向链表的结构、插入序与访问序、三个回调钩子、removeEldestEntry 手写 LRU、accessOrder=true 的三个副作用、LRU 的扫描污染与生产级替代、Java 21 SequencedMap
---

# LinkedHashMap 与 LRU

> `LinkedHashMap` 是集合里"用最少代码实现最多功能"的代表：它在 `HashMap` 基础上只加了一条**贯穿全部节点的双向链表**和**三个回调钩子**，就同时获得了「顺序保证」与「可插拔的淘汰策略」。
>
> 而它最著名的用法——**用十几行代码实现 LRU 缓存**——恰好把"钩子方法"这个设计手法的价值讲得最清楚。

## 一、问题场景 {#why-linkedhashmap}

三个需求，`HashMap` 都满足不了：

| 需求 | 用 `HashMap` 的困境 |
|---|---|
| **遍历顺序要稳定**（例如生成有字段顺序要求的 JSON、按声明顺序路由） | 顺序由哈希桶决定，看起来是"随机序"，改容量就变 |
| **实现一个"最近最少使用"缓存** | 需要自己维护访问顺序 + 淘汰逻辑，等于重写一遍数据结构 |
| **遍历性能要好**（元素少但容量大） | `HashMap` 迭代要扫**整个 table**（含空桶），元素稀疏时大量时间是空转 |

`LinkedHashMap` 用一个设计同时解决了这三件事：**加一条双向链表，让"顺序"成为一个可以被复用和被覆盖的维度**。

## 二、结构：哈希表 + 一条贯穿的链表 {#structure}

### 2.1 节点多了两个指针 {#node-pointers}

```java
public class LinkedHashMap<K, V> extends HashMap<K, V> implements Map<K, V> {

    static class Entry<K, V> extends HashMap.Node<K, V> {
        Entry<K, V> before, after;          // ← 只在链表里用，哈希定位仍然靠 hash/next
    }

    transient LinkedHashMap.Entry<K, V> head, tail;   // 链表首尾
    final boolean accessOrder;                        // 关键开关：false=插入序，true=访问序
}
```

**关键理解：两套指针各管一件事。**

| 指针 | 归属 | 作用 |
|---|---|---|
| `hash` / `next` | 继承自 `HashMap.Node` | **哈希定位**与桶内链表（冲突链） |
| `before` / `after` | `LinkedHashMap.Entry` 新增 | **全局顺序**（一条把所有节点串起来的大链表） |
| `head` / `tail` | `LinkedHashMap` 字段 | 大链表的首尾，决定"谁是第一个/最后一个" |

因此**遍历走的是链表（`after`）而不是 table**。这带来一个容易被忽略的性能优势：

| 场景 | `HashMap` 迭代 | `LinkedHashMap` 迭代 |
|---|---|---|
| 16 个桶、3 个元素 | 要扫 16 个桶（13 个是 `null`） | 沿链表走 3 步 |
| 1 万个桶、3 个元素 | 要扫 1 万个桶 | 沿链表走 3 步 |

**结论**：**`LinkedHashMap` 的迭代是 `O(size)`，与容量无关；`HashMap` 的迭代是 `O(capacity)`。** 容量大而元素稀疏时，`LinkedHashMap` 的遍历反而明显更快——这也是它常被用来替代"大 `HashMap` 频繁遍历"的原因。

**代价**：每个 entry 多两个引用，内存开销略高；插入/删除要多维护链表指针（仍是 `O(1)`）。

### 2.2 两种顺序：插入序与访问序 {#ordering-mode}

```java
Map<String, Integer> insertOrder = new LinkedHashMap<>();                    // 默认 accessOrder = false
Map<String, Integer> accessOrder = new LinkedHashMap<>(16, 0.75f, true);     // accessOrder = true
```

| 模式 | 迭代顺序 | 说明 |
|---|---|---|
| `accessOrder = false`（**默认**） | **插入顺序** | 重复 `put` 已存在的 key **不会**改变它的位置 |
| `accessOrder = true` | **访问顺序** | **每次 `get` / `put` 命中都会把该条目移到链表尾部**（最新访问的在最后） |

**"访问序"这个模式本身就是为 LRU 准备的**：链表头部是"最久没被访问的"，尾部是"刚被访问的"，于是淘汰只需要删头节点。

**一个容易忽略的细节**：`accessOrder = true` 时，**重复 `put` 一个已存在的 key 也会更新访问顺序**（因为走的是同一条"访问"回调），而不只是 `get`。

### 2.3 三个回调钩子 {#hooks}

`HashMap` 在关键路径上预留了三个空实现，`LinkedHashMap` 覆盖它们来维护链表：

```java
// HashMap 中预留的扩展点（空实现）
void afterNodeAccess(Node<K,V> p) { }
void afterNodeInsertion(boolean evict) { }
void afterNodeRemoval(Node<K,V> p) { }
```

| 钩子 | 触发时机 | `LinkedHashMap` 的实现 |
|---|---|---|
| `afterNodeAccess` | **访问**已存在的节点后 | `accessOrder` 为 true 时，把该节点移到链表**尾部** |
| `afterNodeInsertion` | **插入**新节点后 | 调用 `removeEldestEntry(head)`，返回 `true` 就**删掉头节点** |
| `afterNodeRemoval` | **删除**节点后 | 把它从链表中摘除 |

**这正是"模板方法模式"的一个教科书实例**：父类把"什么时候需要通知"固定下来，子类只实现"通知后做什么"。你不需要改 `HashMap` 的哈希逻辑，就能插入一套全新的顺序与淘汰策略。

> 一个细节：`afterNodeInsertion(boolean evict)` 的 `evict` 参数在部分内部路径（如反序列化）中为 `false`，**那些路径不会触发淘汰**——所以不要假设"放进这个 Map 的任何元素都会被容量约束"。

## 三、手写 LRU：`removeEldestEntry` 钩子 {#lru}

### 3.1 一个方法就是全部淘汰逻辑 {#remove-eldest}

```java
protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
    return false;        // 默认：永不淘汰
}
```

它的返回值语义是——**"要不要把最老的这条淘汰掉"**。所以"容量上限"这个需求就变成了一行判断：

```java
return size() > capacity;
```

### 3.2 完整实现 {#lru-impl}

```java
public class LruCache<K, V> extends LinkedHashMap<K, V> {

    private final int capacity;

    public LruCache(int capacity) {
        super(capacity, 0.75f, true);          // ① accessOrder = true 才能是 LRU
        this.capacity = capacity;
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        return size() > capacity;              // ② 超出容量就淘汰链表头部（最久未访问）
    }
}

// 使用
LruCache<String, byte[]> cache = new LruCache<>(100);
cache.put("a", data);
cache.get("a");                                // ← 命中后 "a" 被移到链表尾部，不再是最老
```

**三行关键代码的分工**：

| 位置 | 作用 |
|---|---|
| `super(capacity, 0.75f, true)` | 开启**访问序**——决定"谁是最老的" |
| `size() > capacity` | 决定"什么时候淘汰" |
| （不需要写） | "淘汰谁"由 `afterNodeInsertion` 自动完成：删链表头 |

**这就是"用钩子而不是改源码"的价值**：整个 LRU 策略只用了 3 行，而哈希定位、扩容、链表维护全部复用父类。

### 3.3 `accessOrder = true` 的三个副作用 {#access-order-side-effects}

这三点是"为什么 LRU 缓存不能随手就上"的核心，也是本篇最容易被考的地方：

| 副作用 | 说明 | 后果 |
|---|---|---|
| **`get` 会修改结构** | 命中时把节点移到尾部，链表变了 | 迭代过程中 `get` 会抛 `ConcurrentModificationException` |
| **`get` 不是只读操作** | 它写链表指针 + 写 `modCount` | **多线程并发 `get` 就可能损坏链表**（不是"只读所以安全"） |
| **顺序不稳定** | 每次访问都在改顺序 | 不能依赖迭代顺序做"稳定输出" |

**第一条的写法陷阱**：

```java
// ✗ 遍历时 get：可能抛 ConcurrentModificationException
for (String key : cache.keySet()) {
    Object v = cache.get(key);          // 这个 get 会把 key 移到尾部 → 结构变化
}

// ✓ 遍历 entry（value 已在手，不必再 get）
for (Map.Entry<String, byte[]> e : cache.entrySet()) {
    use(e.getValue());
}
```

**第二条的生产含义**：`Collections.synchronizedMap(new LruCache<>(100))` 能保证单个方法原子，但**`get` 也会加锁**（因为它要改链表），竞争比普通 Map 高；而且"先 `get` 判断、再 `put`"这种复合操作仍需外部同步。**结论：`LinkedHashMap` 的 LRU 适合"单线程 / 低竞争"场景，高并发缓存应换实现（见第四节）。**

## 四、LRU 的局限与生产级替代 {#lru-limits}

### 4.1 LRU 的经典缺陷：顺序扫描污染 {#scan-pollution}

| 场景 | LRU 的行为 | 问题 |
|---|---|---|
| 热点数据稳定访问 + 偶尔一次全表扫描 | 扫描把**所有**缓存条目依次挤出去 | 扫描结束后**热点全没了**，缓存命中率骤降（**cache pollution**） |
| 访问模式是"一次性"的（如爬虫、批处理） | 这些数据占据缓存，挤掉真正会被复用的数据 | 缓存被"一次访问"的数据填满 |

**根因**：LRU 只用"**最近一次访问时间**"这一个信号，无法区分"偶尔来一次"和"反复会用"。

**这就是 TinyLFU / W-TinyLFU 出现的原因**：它引入一个**频率草图（frequency sketch）**来记录访问频次，只有"新来者的频次预期高于被淘汰者"时才替换——从而抵抗扫描污染。Java 生态里 **Caffeine** 用的就是 W-TinyLFU，并解决了"高并发下如何避免全局锁"的问题。

### 4.2 缓存实现的选型 {#cache-selection}

| 方案 | 适用 | 代价 |
|---|---|---|
| `LinkedHashMap` + `removeEldestEntry` | 单线程 / 低竞争、容量小、逻辑简单 | 无并发优化；LRU 语义；需自己处理过期 |
| **Caffeine** | **单机高并发缓存的默认选择** | 引入依赖；需要理解其 `maximumSize` / `expireAfter` / 淘汰监听 |
| Redis（`allkeys-lru` / `volatile-lru`） | 多实例共享、需要持久化 | **是"近似 LRU"**：抽样若干 key 择最久未用者淘汰，而非维护全局链表——为省内存与并发开销而做的取舍 |
| 自研（时间轮 + 分段锁） | 有非常特殊的需求 | 维护成本高，通常不值得 |

**判据**：单机用 Caffeine，共享用 Redis。**`LinkedHashMap` 的 LRU 更适合"讲清原理 + 应对小场景 / 面试"**，而不是生产级缓存的最优解。

## 五、顺序敏感的注意事项 {#order-sensitivity}

| 事项 | 说明 |
|---|---|
| **序列化保序** | `LinkedHashMap` 重写了序列化逻辑（自定义 `writeObject` / `readObject`），**顺序会被保留**；`HashMap` 的顺序在序列化前后都可能不同 |
| **JSON 字段顺序** | Jackson 等序列化库按 Map 的迭代顺序输出，因此用 `LinkedHashMap` 可以**控制 JSON 字段顺序**（对接有顺序要求的第三方接口时有用） |
| **别把它当"排序集合"** | 它保证的是"插入/访问顺序"，**不是按键排序**。要按键排序用 `TreeMap` |
| **配置化的顺序有语义** | 路由规则、拦截器链、字段映射这类"顺序即语义"的场景适合 `LinkedHashMap`；要显式声明顺序也可以考虑 `List<Pair>`（更直白） |

## 六、Java 21 起的 `SequencedMap` {#sequenced-map}

Java 21 引入了 `SequencedCollection` / `SequencedSet` / **`SequencedMap`** 三个接口，把"首 / 尾 / 逆序"这些原本散落在各实现类里的能力统一起来。`LinkedHashMap` 实现了 `SequencedMap`：

```java
SequencedMap<String, Integer> m = new LinkedHashMap<>();
m.putLast("b", 2);                 // 放到尾部（等价于 put）
m.putFirst("a", 1);                // ← 新能力：放到头部
m.firstEntry();                    // 最小的那端（这里是 "a"）
m.lastEntry();
m.pollFirstEntry();                // 取出并移除头部（可用来实现"按序消费"）
m.pollLastEntry();
m.reversed();                      // 逆序视图（视图！修改会互相影响）
```

**实践意义**：以前"把某个 key 移到最前"要自己 `remove` 再重建 Map，现在 `putFirst` 一行搞定；也让 `LinkedHashMap` 与 `ArrayDeque`、`List` 在"两端操作"这件事上有了统一 API。

**注意三点**：① `reversed()` 是**视图**不是拷贝；② `putFirst` 对**已存在的 key** 表现为"把它移到最前"（值也被覆盖）；③ 这些方法在 Java 21+ 才有，跨版本库仍需兼容判断。

## 七、常见坑 {#pitfalls}

| 坑 | 症状 | 修法 |
|---|---|---|
| **用 `accessOrder = true` 却并发 `get`** | 链表损坏、数据错乱、偶发死循环 | 单线程使用，或换 Caffeine / 加锁 |
| **遍历时 `get`** | `ConcurrentModificationException` | 遍历 `entrySet()` 直接取 value |
| **以为它是"按 key 排序"** | 顺序与预期不符 | 按 key 排序用 `TreeMap` |
| **`removeEldestEntry` 写成 `>=`** | 实际容量比预期少 1 | 语义是"超出则淘汰"，用 `size() > capacity` |
| **以为淘汰一定会发生** | 某些内部路径（如反序列化）以 `evict = false` 插入，不触发淘汰 | 不要假设任何入库路径都受容量约束 |
| **把 `subMap` / `reversed` 当拷贝** | 改视图影响了原 Map | 需要独立副本时显式 `new LinkedHashMap<>(view)` |
| **在大容量稀疏场景仍用 `HashMap` 做频繁遍历** | 迭代耗时与容量成正比 | 换 `LinkedHashMap`（迭代只与元素数有关） |
| **自己实现并发 LRU 却用 `synchronized` 包全部操作** | 吞吐低 | 用 Caffeine，或分段 + 近似策略 |

## 八、使用场景与面试问答 {#interview}

**Q1：`LinkedHashMap` 是怎么保证顺序的？**

在 `HashMap` 基础上为每个节点增加 `before` / `after` 两个引用，并用 `head` / `tail` 维护一条**贯穿所有节点的双向链表**。哈希定位仍走 `hash` / `next`（继承自 `HashMap.Node`），**顺序走这条全局链表**。因此迭代沿链表进行，复杂度是 `O(size)`——**与容量无关**（`HashMap` 的迭代是 `O(capacity)`，元素稀疏时更慢）。

**Q2：插入顺序和访问顺序怎么切换？**

构造时传第三个参数：`new LinkedHashMap<>(16, 0.75f, true)` 即为**访问序**（每次 `get` / 命中式 `put` 都把该条目移到链表尾部），默认 `false` 是**插入序**。注意重复 `put` 已存在的 key 在访问序下也会改变位置。

**Q3：怎么用 `LinkedHashMap` 实现 LRU？（手写代码）**

```java
public class LruCache<K, V> extends LinkedHashMap<K, V> {
    private final int capacity;

    public LruCache(int capacity) {
        super(capacity, 0.75f, true);          // 访问序 → 链表头是最久未用的
        this.capacity = capacity;
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        return size() > capacity;              // 超出容量即淘汰头部
    }
}
```

**关键是三件事各由谁负责**：`accessOrder = true` 决定"谁最老"，`size() > capacity` 决定"何时淘汰"，`afterNodeInsertion` 负责"淘汰谁"（删链表头）。

**Q4：`removeEldestEntry` 为什么是钩子方法？**

`HashMap` 在插入后预留了空实现 `afterNodeInsertion(evict)`，`LinkedHashMap` 覆盖它并在其中回调 `removeEldestEntry`。**这是模板方法模式**：父类固定"何时通知"，子类只决定"通知后做什么"，因此使用者无需改动任何哈希逻辑就能插入一套淘汰策略。

**Q5：`accessOrder = true` 有什么副作用？**

三条：① **`get` 会修改结构**（移动链表节点），所以**遍历中 `get` 会抛 `ConcurrentModificationException`**；② **`get` 不是只读操作**，多线程并发 `get` 就可能损坏链表，**不能因为"只是读"就以为线程安全**；③ 迭代顺序随访问变化，不能当稳定顺序用。

**Q6：`LinkedHashMap` 的 LRU 用在生产有什么问题？**

两层原因：① **并发能力**——`get` 会改结构，加 `synchronized` 后连读都要互斥，吞吐上不去；② **算法本身**——纯 LRU 存在**顺序扫描污染**（一次全表扫描会把热点全部挤出），因为它只看"最近一次访问时间"、无法区分"偶尔来一次"和"反复会用"。

生产环境单机缓存用 **Caffeine**（W-TinyLFU，引入访问频次来抵抗扫描污染，并有并发优化），共享缓存用 **Redis**（其 `allkeys-lru` 是**近似 LRU**：抽样若干 key 择最久未用的淘汰，换取内存与并发上的收益）。

**Q7：`LinkedHashMap` 和 `TreeMap` 都是有序 Map，怎么选？**

顺序的来源不同：`LinkedHashMap` 是**插入 / 访问顺序**（`O(1)` 操作，支持 `putFirst` 这类位置操作）；`TreeMap` 是**按键排序顺序**（`O(log n)`，支持 `floorKey` / `subMap` 等范围查询、要求 key 可比较）。

**判据：要"记住谁先来"用 `LinkedHashMap`；要"按键有序 + 范围查询"用 `TreeMap`。**

**Q8：为什么有些场景用 `LinkedHashMap` 反而比 `HashMap` 快？**

因为**迭代成本模型不同**：`HashMap` 迭代要遍历整个 table（含空桶），`LinkedHashMap` 沿链表只走实际元素。当 **容量远大于元素数**而代码又频繁遍历时（例如一个大容量 Map 里只有几十个有效条目），`LinkedHashMap` 的遍历会快很多，而单次读写仍是 `O(1)`。

**Q9：Java 21 给 `LinkedHashMap` 加了什么能力？**

它现在实现了 **`SequencedMap`** 接口，获得 `putFirst` / `putLast` / `firstEntry` / `lastEntry` / `pollFirstEntry` / `pollLastEntry` / `reversed()` 等统一方法。以前"把某 key 移到最前"要 `remove` 后重建，现在 `putFirst` 即可。注意 `reversed()` 返回的是**视图**。

---

> 相关篇目：[HashMap 实现原理](/java/collections/hashmap)（父类结构与扩容）、[HashSet 与去重原理](/java/collections/hashset)（`LinkedHashSet` 复用同一套结构）、[TreeSet 与有序集合](/java/collections/treeset)（"按键有序"的另一条路线）、[并发容器](/java/concurrent/concurrent-collections)（并发 Map 与缓存容器的选型）。
