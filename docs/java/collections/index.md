---
date: 2026-09-13
title: Java 集合 · 导览
---

# Java 集合 · 导览

Java 集合是**面试密度最高、也最容易「会用不会讲」**的一块：日常开发人人都在 `new ArrayList<>()`，但被追问「扩容几次」「为什么数组长度是 2 的次幂」「1.7 的死循环怎么来的」时，能不能讲到底层，是区分「用过」和「懂」的分水岭。

本板块按**「数据结构 → 具体容器」**两层组织：先把数组、链表、二叉树、红黑树、散列表这些底座讲清楚，再看 `ArrayList` / `LinkedList` / `HashMap` 各自是怎么在底座上搭起来的。理解了底座，源码就不再是死记硬背。

## 一、整体体系

| 顶层接口 | 常见实现 | 底层结构 | 有序性 | 线程安全 |
|---|---|---|---|---|
| `List` | `ArrayList` | 动态数组 | 按插入顺序 | 否 |
| `List` | `LinkedList` | 双向链表 | 按插入顺序 | 否 |
| `Map` | `HashMap` | 数组 + 链表 / 红黑树 | 无序 | 否 |
| `Map` | `LinkedHashMap` | `HashMap` + 双向链表 | 插入 / 访问顺序 | 否 |
| `Set` | `HashSet` | 内部就是 `HashMap` | 无序 | 否 |
| `Set` | `TreeSet` | 红黑树 | 排序 | 否 |

一句话记忆：**`List` 管「第几个」，`Map` 管「是谁」，`Set` 管「有没有」。**

## 二、两条主线

```text
List 线：数组（连续内存、O(1) 随机访问）
          └─ ArrayList ── 扩容 1.5 倍、System.arraycopy
         链表（非连续、O(1) 增删头尾）
          └─ LinkedList ── 双向链表

Map 线：二叉树 ─ 二叉搜索树 ─ 红黑树（自平衡，O(log n)）
                      散列表（数组 + 散列函数）─ 散列冲突 ─ 链表法 / 红黑树
                      └─ HashMap ── 扰动函数、(n-1)&hash、扩容拆分
```

## 三、本板块导航

| 篇目 | 覆盖内容 | 关键问题 |
|---|---|---|
| [Java 集合的底层选型](/java/collections/data-structure) | 选型速查表、四类集合的复杂度对照、`ArrayList` 扩容与 1.5 倍、`LinkedList` 的真实定位、"看起来像 O(1)"的坑 | 该选 `ArrayList` 还是 `LinkedList`？为什么扩容是 1.5 倍？ |
| [List 集合](/java/collections/list) | 数组原理、`ArrayList` 源码与扩容、数组 ↔ List 转换、`ArrayList` vs `LinkedList` | `ArrayList` 底层原理？`new ArrayList(10)` 扩容几次？转换后互相影响吗？ |
| [HashMap](/java/collections/hashmap) | 二叉树 / 红黑树 / 散列表、实现原理、put 流程、扩容、寻址算法、1.7 死循环 | `HashMap` 实现原理？put 流程？为什么长度是 2 的次幂？ |

## 四、高频考点速查

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
