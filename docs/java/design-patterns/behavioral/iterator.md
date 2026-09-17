---
order: 8
date: 2026-09-11
---

# 迭代器模式（Iterator）

## 一、问题场景

集合的内部结构千差万别（数组、链表、树、哈希表、跳表），但使用方只想要一种统一的遍历方式：

```java
// 没有迭代器时，遍历方式取决于数据结构
for (int i = 0; i < arr.length; i++) { ... }           // 数组
Node n = head; while (n != null) { ... n = n.next; }    // 链表
// 树、图、哈希桶……每种都要暴露内部结构，客户端被迫理解集合实现
```

这带来两个问题：① **内部结构暴露**（客户端必须知道是数组还是链表）；② **遍历代码重复**（换个集合就要重写遍历）。

迭代器模式的解法：**把"遍历"这件事抽象成一个独立对象，客户端只通过 `hasNext()` / `next()` 访问元素，完全不关心底层结构。**

## 二、结构与角色

```
┌─────────────────┐         ┌──────────────────┐
│  «interface»    │         │   «interface»    │
│    Aggregate    │────────▶│     Iterator     │
│ + iterator()    │  创建   │ + hasNext()      │
└────────┬────────┘         │ + next()         │
         │ 实现             │ + remove()（可选）│
┌────────┴────────┐         └────────┬─────────┘
│ConcreteAggregate│                  │ 实现
│ - elements      │         ┌────────┴──────────┐
│ + iterator()    │────────▶│ ConcreteIterator  │
└─────────────────┘  持有   │ - cursor / index  │
                            └───────────────────┘
```

| 角色 | 职责 |
|---|---|
| **Iterator（抽象迭代器）** | 定义遍历接口：`hasNext()`、`next()`，可选 `remove()` |
| **ConcreteIterator** | 记录遍历位置（游标），实现前进与判界 |
| **Aggregate（抽象聚合）** | 定义创建迭代器的接口 |
| **ConcreteAggregate** | 返回一个绑定自身数据的迭代器实例 |

**核心原则：把"遍历状态"（当前走到哪）从集合中挪到迭代器里**，因此同一个集合可以同时有多个独立游标的迭代器（嵌套遍历不再冲突）。

## 三、代码实现

以自定义的"环形缓冲区"为例，展示如何让一个非标准结构支持 `for-each`：

```java
public class RingBuffer<E> implements Iterable<E> {
    private final Object[] elements;
    private int size;

    public RingBuffer(int capacity) { this.elements = new Object[capacity]; }

    public void add(E e) {
        if (size == elements.length) throw new IllegalStateException("缓冲已满");
        elements[size++] = e;
    }

    @Override
    @SuppressWarnings("unchecked")
    public Iterator<E> iterator() {
        return new Itr();                          // 内部类：可访问外部私有字段
    }

    /** 具体迭代器：用内部类实现，直接读 elements 与 size */
    private class Itr implements Iterator<E> {
        private int cursor = 0;                    // 遍历状态存在迭代器里

        @Override public boolean hasNext() { return cursor < size; }

        @Override @SuppressWarnings("unchecked")
        public E next() {
            if (cursor >= size) throw new NoSuchElementException();
            return (E) elements[cursor++];
        }
    }
}
```

支持 `for-each` 的关键是**实现 `Iterable` 接口**——`for (E e : buffer)` 会被编译器翻译成 `buffer.iterator()` 加循环调用 `hasNext()/next()`：

```java
RingBuffer<String> buffer = new RingBuffer<>(10);
buffer.add("a"); buffer.add("b");

for (String s : buffer) {          // 编译器展开为迭代器调用
    System.out.println(s);
}

// 同一集合可并发拥有多个游标，互不干扰
Iterator<String> it1 = buffer.iterator();
Iterator<String> it2 = buffer.iterator();
it1.next();                        // it1 走到 b
System.out.println(it2.next());    // it2 仍从 a 开始
```

### 为什么迭代器常用内部类实现

因为迭代器需要**频繁读取集合的私有状态**（元素数组、当前大小）。用内部类可以免去 getter 暴露、避免把内部字段改成 public，是封装与效率的平衡点——**JDK 的 `ArrayList.Itr`、`HashMap.HashIterator` 全部是内部类**。

## 四、对比辨析

### 4.1 迭代器 vs 访问者

| 维度 | 迭代器 | 访问者 |
|---|---|---|
| 目的 | **遍历**元素 | 对元素**施加操作** |
| 是否关心元素类型 | 不关心（统一当 E 处理） | 关心（不同类型走不同 `visit` 重载） |
| 变化方向 | 集合结构变，遍历方式不变 | 数据结构稳定，操作频繁增加 |
| 是否支持新增操作 | 不涉及 | 核心能力 |

通常**配合使用**：先用迭代器遍历，再对每个元素 `accept(visitor)`。

### 4.2 迭代器 vs `for` 循环

| 维度 | 下标 `for` | 迭代器 |
|---|---|---|
| 适用结构 | 仅支持随机访问（数组、`List`） | 任意结构（链表、树、流） |
| 是否暴露内部结构 | 是 | 否 |
| 遍历时删除 | 元素前移，易漏/重复 | 通过 `iterator.remove()` 安全删除 |
| 并发修改检测 | 无 | 有（fail-fast） |

### 4.3 fail-fast vs fail-safe——必须掌握的面试点

| 类型 | 代表 | 机制 | 遍历时修改的后果 |
|---|---|---|---|
| **fail-fast** | `ArrayList`、`HashMap`（非并发） | 迭代器内部记录 `modCount`，每次 `next()` 检查是否与集合的 `modCount` 一致 | 抛 `ConcurrentModificationException` |
| **fail-safe** | `CopyOnWriteArrayList`、`ConcurrentHashMap` | 遍历的是**快照**（复制或弱一致视图） | 不抛异常，但**看不到最新数据** |

```java
List<String> list = new ArrayList<>(List.of("a", "b", "c"));
for (String s : list) {
    if (s.equals("b")) list.remove(s);       // ✗ ConcurrentModificationException
}
```

`ArrayList.Itr` 的检查逻辑（JDK 源码简化）：

```java
final void checkForComodification() {
    if (modCount != expectedModCount)
        throw new ConcurrentModificationException();
}
```

正确做法有三种：

```java
// ① 用迭代器自己的 remove（会同步 expectedModCount）
Iterator<String> it = list.iterator();
while (it.hasNext()) {
    if (it.next().equals("b")) it.remove();   // ✓
}

// ② removeIf（内部就是迭代器实现）
list.removeIf(s -> s.equals("b"));            // ✓

// ③ 普通 for 倒序删（避开索引前移问题）
for (int i = list.size() - 1; i >= 0; i--) {
    if (list.get(i).equals("b")) list.remove(i);   // ✓ 但仅适用于 List
}
```

## 五、源码剖析

上一节看的是**它与 `Iterable` 的分工**；本节看**迭代器在 JDK 里承担了多少你没想到的职责**。哪些框架用了它，速查表在下一节——这里要回答三个问题：**`ConcurrentModificationException` 到底是什么意思、为什么只有迭代器能安全删除、以及并行流和迭代器有什么关系。**

### 5.1 `ArrayList.Itr`：`ConcurrentModificationException` 与并发无关

```java
// 精简自 java.util.ArrayList.Itr
private class Itr implements Iterator<E> {
    int cursor;
    int lastRet = -1;
    int expectedModCount = modCount;        // ① 创建迭代器时，记下"当时的修改次数"

    public E next() {
        checkForComodification();
        int i = cursor;
        if (i >= size) throw new NoSuchElementException();
        Object[] elementData = ArrayList.this.elementData;
        if (i >= elementData.length) throw new ConcurrentModificationException();
        cursor = i + 1;
        return (E) elementData[lastRet = i];
    }

    final void checkForComodification() {
        if (modCount != expectedModCount)
            throw new ConcurrentModificationException();     // ② 在遍历前先比对
    }
}
```

**结构差异**：`modCount` 与 `expectedModCount` 这一对字段，是"遍历状态被封装进迭代器对象"才能成立的机制——**集合本身记录被结构修改的次数（`modCount`），迭代器在创建时快照一份（`expectedModCount`），每次取元素前比对**。不一致就抛异常。

由此可纠正一个极常见的误解：**`ConcurrentModificationException` 的"Concurrent"与多线程无关**。这段代码在**单线程**下必炸：

```java
for (String s : list) {
    if (s.startsWith("a")) list.remove(s);   // ← 抛 ConcurrentModificationException
}
```

因为 `list.remove()` 让 `modCount++`，而迭代器的 `expectedModCount` 还停在旧值。**异常的名字起得有误导性——它实际表达的是"集合在你迭代期间被改过"，不是"有人在并发改它"。** 而这也解释了为什么 `ConcurrentHashMap` 的迭代器**不会**抛这个异常：它是弱一致性的，不维护 `modCount`。

### 5.2 `HashIterator.remove()`：为什么迭代器自己删就安全

```java
// 精简自 java.util.HashMap.HashIterator
public void remove() {
    Node<K,V> p = current;
    if (p == null) throw new IllegalStateException();
    if (modCount != expectedModCount) throw new ConcurrentModificationException();
    current = null;
    K key = p.key;
    removeNode(hash(key), key, null, false, false);
    expectedModCount = modCount;              // ③ 关键：删完之后，把计数同步过来
}
```

**结构差异**：注意最后一行——**迭代器在删除之后，主动把 `expectedModCount` 更新成了新的 `modCount`**。也就是说，它删的确实是集合的元素（一样会改 `modCount`），但它**自己承担了"保持双方一致"的责任**。

`ArrayList.Itr.remove()` 是同样的写法：

```java
public void remove() {
    if (lastRet < 0) throw new IllegalStateException();
    checkForComodification();
    try {
        ArrayList.this.remove(lastRet);
        cursor = lastRet;                     // ④ 游标回退一格，避免跳过一个元素
        lastRet = -1;
        expectedModCount = modCount;          // ⑤ 同样在最后同步
    } catch (IndexOutOfBoundsException ex) {
        throw new ConcurrentModificationException();
    }
}
```

**这两段代码给出一条结论**：`Iterator.remove()` 的存在**不是"顺手提供的便利"，而是"安全删除的唯一途径"**。因为只有迭代器知道自己的 `cursor` 与 `lastRet`，也只有它能同时修正"集合的修改计数"与"自己的游标位置"。

这也解释了 Java 8 引入 `Collection.removeIf()` 的动机：**它把"遍历 + 判断 + 删除"封装成一个原子操作**，内部（对 `ArrayList`）用 `BitSet` 标记后统一删除，比"用迭代器逐个删"更快，也避免了使用者误用 `for-each` 删除。

**不懂会误判**：以为"`for-each` 删除报错、用 `Iterator` 删除就对了"只是因为"接口不同"。真实原因是**游标与计数的一致性只有迭代器自己维护得了**——理解这一点，才会明白为什么 `removeIf` 也必须是集合自己的方法。

### 5.3 `Spliterator`：迭代器在并行时代的续作

```java
// 精简自 java.util.ArrayList.ArrayListSpliterator
static final class ArrayListSpliterator<E> implements Spliterator<E> {
    private int index;        // 当前起始
    private int fence;        // 结束位置
    private int expectedModCount;

    public ArrayListSpliterator<E> trySplit() {
        int hi = getFence(), lo = index, mid = (lo + hi) >>> 1;      // ⑥ 折半切分
        return (lo >= mid) ? null :
            new ArrayListSpliterator<>(list, lo, index = mid, expectedModCount);
    }
}
```

**结构差异**：`Spliterator` 在 `Iterator` 的"逐个取"之上加了 `trySplit()` —— **把剩余元素一分为二，交给另一个线程处理**。这正是并行流（`list.parallelStream()`）能工作的前提。

这里有个值得注意的转变：**迭代器模式最初的收益是"隐藏集合的内部结构"**（调用方不需要知道底层是数组还是链表，统一用 `next()`）。而在并行时代，`Spliterator` 却要**利用对内部结构的了解**（`ArrayListSpliterator` 知道底层是数组，才能按下标折半切分）。

| 时代 | 迭代器的主要收益 | 做法 |
|---|---|---|
| 经典 GoF | **封装**：调用方不依赖集合结构 | 只暴露 `hasNext()` / `next()` |
| 并行流时代 | **切分**：支持把遍历任务拆分到多核 | 额外暴露 `trySplit()` / `estimateSize()` |

也就是说，同一个模式在"并行"这个新压力下，**从"隐藏结构"走向了"声明结构特征"**（`Spliterator` 的 `characteristics()` 会告诉流框架"这个源是有序的 / 可随机访问的 / 元素不重复的"）。这类"模式因外部约束变化而反向演化"的现象，只有读源码才能看见。

**不懂会误判**：把 `Spliterator` 当成"迭代器的新名字"。它是**为切分而设计的**——`estimateSize()`、`characteristics()` 这些方法都服务于"怎么拆得更均衡"，与顺序遍历没有关系。

### 5.4 一句话收束

迭代器模式真正的价值不是"统一的遍历接口"，而是**把遍历状态从集合里搬到独立对象里**。这一步搬移带来了三个后果：**可以同时存在多个互不干扰的遍历**（状态不再共享）、**可以安全删除**（游标与计数能一起维护）、**可以并行切分**（每个分裂出的迭代器自带一段区间）。教科书写的是第一条，后两条才是它在 JDK 里长盛不衰的原因。

## 六、使用场景与面试问答

### JDK 与框架中的实例

| 位置 | 说明 |
|---|---|
| `Collection.iterator()` | 所有集合的统一遍历入口，`Iterable` 是 `for-each` 的基础 |
| `ResultSet` | 数据库游标的迭代器，`next()` 前移一行 |
| `Scanner` | `hasNextInt()` / `nextInt()` 就是 `hasNext` / `next` |
| MyBatis `Cursor<T>` | 流式查询结果，避免一次性加载全表 |
| Java Stream | 迭代器的**函数式进化形态**（惰性求值 + 内部迭代） |
| NIO `DirectoryStream` | 目录项遍历，`Files.newDirectoryStream()` |

### 面试问答

**Q1：`for-each` 支持哪些类型？**

实现了 `Iterable` 接口的类型（编译期检查），以及数组（编译器特化处理，不要求实现 `Iterable`）。对于 `Map`，本身不是 `Iterable`，必须通过 `map.entrySet()` / `keySet()` / `values()` 拿到 `Set`/`Collection` 再遍历。

**Q2：`ConcurrentModificationException` 是怎么产生的？为什么有时不抛？**

`ArrayList` 等非并发集合的迭代器在创建时把集合的 `modCount`（结构修改计数器）存为 `expectedModCount`，每次 `next()` 都校验两者是否相等。如果遍历过程中通过**集合自身**的方法增删元素，`modCount` 增加，校验失败即抛异常。

**"有时不抛"** 的原因是：如果删除后紧接着遍历结束（`hasNext()` 返回 false），就不会再执行 `next()`，校验也就不会触发——异常是"检测到"才抛，不是"必然"抛。所以**不能依赖它总是抛异常来发现 bug**，该用 `iterator.remove()` 就老老实实用。

**Q3：为什么 `iterator.remove()` 不会抛异常？**

因为它在删除元素后，会**同步更新 `expectedModCount = modCount`**，让校验重新对齐。源码：

```java
public void remove() {
    // ...
    ArrayList.this.remove(lastRet);
    cursor = lastRet;
    lastRet = -1;
    expectedModCount = modCount;     // ← 关键：重新对齐
}
```

**Q4：`CopyOnWriteArrayList` 为什么遍历时改不抛异常？**

它在迭代开始时**复制一份底层数组快照**，迭代器遍历的是快照。因此：① 不会抛 `ConcurrentModificationException`；② **看不到迭代开始后的新增/删除**（弱一致性）；③ 每次写操作都全量复制数组，**写多读少时性能极差**，只适合"读多写极少"（如监听器列表、配置项列表）。

**Q5：迭代器模式在现代 Java 里过时了吗？**

没有，它的**接口形态被 Stream 吸收了**。Stream 的 `iterator()` 方法能把任意流降级为迭代器；反过来，迭代器是"外部迭代"（客户端控制推进），Stream 是"内部迭代"（框架控制推进，可自动并行化）。**外部迭代灵活、内部迭代简洁且能并行**——两者互补，不是替代关系。写框架时用迭代器，写业务时用 Stream。
