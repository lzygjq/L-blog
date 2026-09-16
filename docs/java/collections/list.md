---
date: 2026-09-13
title: List：数组、ArrayList 与链表
sidebar: List 集合
order: 2
desc: ArrayList 的源码分析路径（扩容与 modCount）、数组与 List 互转的坑、ArrayList 与 LinkedList 的横向对比与真实选型
---

# List：数组、ArrayList 与链表

`List` 是日常用得最多的集合接口。它下面两个实现——`ArrayList` 和 `LinkedList`——恰好分别建立在上一节讲的**数组**和**双向链表**底座上，所以「`ArrayList` 和 `LinkedList` 的区别」这道题，本质是「数组和链表的区别」。

这一节的重点是 **`ArrayList` 的源码与扩容链路**：把「初始容量 10、扩容 1.5 倍」从结论变成能顺着源码讲出来的过程。

## 一、ArrayList 的源码分析路径

读一个集合的源码，固定从三个地方入手：

```java
List<Integer> list = new ArrayList<Integer>();
list.add(1);
```

| 分析维度 | 要看什么 |
|---|---|
| 成员变量 | 容量相关的常量、存储元素的数组、元素个数 |
| 构造函数 | 不同构造方式下的初始状态 |
| 关键方法 | `add` 以及它触发的扩容链路 |

以下源码均基于 **JDK 1.8**。

### 成员变量

```java
/** 默认初始的容量 */
private static final int DEFAULT_CAPACITY = 10;

/** 用于空实例的共享空数组实例 */
private static final Object[] EMPTY_ELEMENTDATA = {};

/** 用于默认大小的空实例的共享空数组实例。
 *  将其与 EMPTY_ELEMENTDATA 区分开来，以了解添加第一个元素时要膨胀多少 */
private static final Object[] DEFAULTCAPACITY_EMPTY_ELEMENTDATA = {};

/** 存储 ArrayList 元素的数组缓冲区。ArrayList 的容量就是这个数组的长度。
 *  当添加第一个元素时，任何 elementData == DEFAULTCAPACITY_EMPTY_ELEMENTDATA
 *  的空 ArrayList 都将扩展为 DEFAULT_CAPACITY */
transient Object[] elementData;

/** ArrayList 的大小（它包含的元素数量） */
private int size;
```

这里有个容易讲错的细节：**为什么要有两个空数组常量？**

- `EMPTY_ELEMENTDATA`：`new ArrayList(0)` 用，容量就是 0；
- `DEFAULTCAPACITY_EMPTY_ELEMENTDATA`：`new ArrayList()` 用，它是「**等着被膨胀到 10**」的标记。

正因为两者是不同的对象引用，`add` 时才可以用 `==` 判断出「这是默认构造出来的、第一次添加」，从而膨胀到 10；而 `new ArrayList(0)` 不会。

### 构造与容量

```java
/** 带初始化容量的构造函数 */
public ArrayList(int initialCapacity) {
    if (initialCapacity > 0) {
        this.elementData = new Object[initialCapacity];
    } else if (initialCapacity == 0) {
        this.elementData = EMPTY_ELEMENTDATA;
    } else {
        throw new IllegalArgumentException("Illegal Capacity: " + initialCapacity);
    }
}

/** 无参构造函数：默认创建空集合 */
public ArrayList() {
    this.elementData = DEFAULTCAPACITY_EMPTY_ELEMENTDATA;
}

/** 将 collection 对象转换成数组，然后将数组的地址赋给 elementData */
public ArrayList(Collection<? extends E> c) {
    Object[] a = c.toArray();
    if ((size = a.length) != 0) {
        if (c.getClass() == ArrayList.class) {
            elementData = a;
        } else {
            elementData = Arrays.copyOf(a, size, Object[].class);
        }
    } else {
        elementData = EMPTY_ELEMENTDATA;
    }
}
```

> **高频考点：`ArrayList list = new ArrayList(10)` 中的 list 扩容几次？**
>
> **参考回答：0 次。** 该语句只是声明并实例化了一个 `ArrayList`，指定容量为 10，**整个过程没有发生扩容**——`new Object[10]` 一步就把数组建好了。

### add 与扩容链路

`add` 一共触发了四层调用，每一层只做一件事：

```java
public boolean add(E e) {
    ensureCapacityInternal(size + 1);   // 确保内部容量
    elementData[size++] = e;
    return true;
}

private void ensureCapacityInternal(int minCapacity) {
    ensureExplicitCapacity(calculateCapacity(elementData, minCapacity));
}

/** 计算容量 */
private static int calculateCapacity(Object[] elementData, int minCapacity) {
    if (elementData == DEFAULTCAPACITY_EMPTY_ELEMENTDATA) {
        return Math.max(DEFAULT_CAPACITY, minCapacity);   // DEFAULT_CAPACITY = 10
    }
    return minCapacity;
}

private void ensureExplicitCapacity(int minCapacity) {
    modCount++;
    // 如果大于 0，说明容量不够，需扩容
    if (minCapacity - elementData.length > 0) {
        grow(minCapacity);
    }
}

/** 扩容方法 */
private void grow(int minCapacity) {
    int oldCapacity = elementData.length;
    int newCapacity = oldCapacity + (oldCapacity >> 1);   // 增加原来容量的 1.5 倍
    if (newCapacity - minCapacity < 0) {
        newCapacity = minCapacity;
    }
    if (newCapacity - MAX_ARRAY_SIZE > 0) {
        newCapacity = hugeCapacity(minCapacity);
    }
    elementData = Arrays.copyOf(elementData, newCapacity);  // 数组拷贝
}
```

**逐次添加时发生了什么**

| 添加次数 | 过程 | 容量变化 |
|---|---|---|
| 第 1 次 | `elementData` 是 `DEFAULTCAPACITY_EMPTY_ELEMENTDATA` → `calculateCapacity` 返回 `max(10, 1) = 10` | 0 → **10** |
| 第 2~10 次 | `minCapacity ≤ 10`，不触发 `grow` | 保持 10 |
| 第 11 次 | `minCapacity = 11 > 10`，触发 `grow`：`10 + (10 >> 1) = 15` | 10 → **15** |
| 第 16 次 | `15 + (15 >> 1) = 22` | 15 → 22 |

关键点：

1. **`new ArrayList()` 的初始容量是 0**，不是 10——10 是「第一次添加时」才膨胀到的目标；
2. 扩容是**原来容量的 1.5 倍**（`oldCapacity + (oldCapacity >> 1)`）；
3. 每次扩容都要**新建数组并拷贝**（`Arrays.copyOf`），这是 `ArrayList` 的主要性能开销来源。已知数据量时**预先指定容量**（`new ArrayList<>(expectedSize)`）能避免反复扩容。

### ArrayList 底层实现原理

| 维度 | 结论 |
|---|---|
| 底层数据结构 | **动态数组**（`Object[] elementData`） |
| 初始容量 | 0；第一次添加数据时初始化为 **10** |
| 扩容逻辑 | 每次扩容为原来的 **1.5 倍**，且每次都需要**拷贝数组** |
| 添加逻辑 | ① 确保 `size + 1` 足够存下下一个数据；② 若已用长度 +1 大于当前数组长度，调用 `grow` 扩容；③ 把新元素放到 `size` 位置；④ 返回添加成功的布尔值 |

## 二、数组与 List 互转 {#数组与-list-互转}

| 方向 | 方式 |
|---|---|
| 数组 → List | `java.util.Arrays` 工具类的 `asList` 方法 |
| List → 数组 | `List` 的 `toArray` 方法（无参返回 `Object[]`；传入初始化长度的数组对象则返回该对象数组） |

```java
// 数组转 List
public static void testArray2List() {
    String[] strs = {"aaa", "bbb", "ccc"};
    List<String> list = Arrays.asList(strs);
    for (String s : list) {
        System.out.println(s);
    }
}

// List 转数组
public static void testList2Array() {
    List<String> list = new ArrayList<String>();
    list.add("aaa");
    list.add("bbb");
    list.add("ccc");
    String[] array = list.toArray(new String[list.size()]);
    for (String s : array) {
        System.out.println(s);
    }
}
```

### 转换之后，两边还会互相影响吗

这是这道题的**追问环节**，也是最容易答错的地方。

```java
// 改了原数组，List 受影响吗？
String[] strs = {"aaa", "bbb", "ccc"};
List<String> list = Arrays.asList(strs);
strs[1] = "ddd";         // list 会变成 aaa, ddd, ccc  →  受影响

// 改了 List，数组受影响吗？
List<String> list2 = new ArrayList<>();
list2.add("aaa");
list2.add("bbb");
String[] array = list2.toArray(new String[list2.size()]);
list2.add("ddd");        // array 仍然是 aaa, bbb      →  不受影响
```

| 场景 | 是否受影响 | 原因 |
|---|---|---|
| `Arrays.asList` 之后改**数组** | **受影响** | `Arrays.asList` 返回的是 `Arrays` 内部类 `ArrayList`，构造器只是把传入的数组**包装**了一下，最终指向**同一块内存地址** |
| `toArray` 之后改 **List** | **不受影响** | `toArray` 底层做了**数组拷贝**，与原 List 元素已无关系 |

一句话记忆：**`asList` 是「包装」（共享引用），`toArray` 是「拷贝」（各自独立）。**

> 引申：`Arrays.asList` 返回的是定长列表，`add` / `remove` 会抛 `UnsupportedOperationException`——要可变列表得再包一层 `new ArrayList<>(Arrays.asList(...))`。

## 三、ArrayList 与 LinkedList 对比 {#arraylist-与-linkedlist-对比}

从四个维度回答，条理最清楚。

### 1. 底层数据结构

- `ArrayList`：动态数组
- `LinkedList`：双向链表

### 2. 操作数据效率

| 操作 | ArrayList | LinkedList |
|---|---|---|
| 按下标查询 | `O(1)`（内存连续，用寻址公式） | 不支持下标查询 |
| 查找（未知索引） | `O(n)`，需遍历 | `O(n)`，也需遍历 |
| 头部/尾部增删 | 尾部 `O(1)`；其他位置要挪动数组 `O(n)` | 头尾 `O(1)`；其他位置需遍历链表 `O(n)` |

### 3. 内存空间占用

- `ArrayList`：底层是数组，**内存连续，更节省内存**（只是可能预留了多余容量）；
- `LinkedList`：每个结点除了数据还要存**两个指针**，**更占用内存**。

### 4. 线程安全

`ArrayList` 和 `LinkedList` **都不是线程安全的**。要保证线程安全有两条路：

1. **把集合限制在方法内用**——局部变量本身就是线程安全的；
2. **改用线程安全的包装**：

```java
List<Object> syncArrayList = Collections.synchronizedList(new ArrayList<>());
List<Object> syncLinkedList = Collections.synchronizedList(new LinkedList<>());
```

> 补充：并发场景下更常用的是 `CopyOnWriteArrayList`（读多写少）——写时复制，读操作完全无锁。

## 四、高频考点

| 问题 | 答案要点 |
|---|---|
| `ArrayList` 底层的实现原理？ | 动态数组；初始容量 0，首次 add 初始化为 10；扩容 1.5 倍且需拷贝数组 |
| `new ArrayList(10)` 扩容几次？ | 0 次，只是实例化并指定容量 10 |
| 如何实现数组和 List 之间的转换？ | 数组 → List 用 `Arrays.asList`；List → 数组用 `toArray` |
| `Arrays.asList` 后改数组，List 受影响吗？ | 受影响，内部类包装了同一数组，指向同一内存地址 |
| `toArray` 后改 List，数组受影响吗？ | 不受影响，底层做了数组拷贝 |
| `ArrayList` 和 `LinkedList` 的区别？ | ① 底层：动态数组 vs 双向链表；② 效率：随机访问 `O(1)` vs 不支持，头尾增删各有所长；③ 空间：数组省 vs 双指针费；④ 都非线程安全 |
