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

## 五、使用场景与面试问答

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
