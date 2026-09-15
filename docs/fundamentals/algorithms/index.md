---
date: 2026-09-15
title: 算法与数据结构 · 导览
---

# 算法与数据结构 · 导览

网络把数据送到了机器、操作系统接住了它，**算法决定这台机器把它算得多快、用多少内存**。

这一域的组织方式和前两域都不一样。网络**以分层为纲**（静态管道）、操作系统**以进程加资源为纲**（调度者视角），而算法与数据结构面对的是**一个"问题"的自由市场**——没有天然的分层，也没有唯一的视角。所以这一域的组织原则是：**按"从量到算"的认知顺序推进**——

> **先用复杂度这把尺子（量）→ 再看数据怎么组织（存）→ 然后看怎么排（整理）→ 最后看怎么建模（算）→ 以及数据大到装不下时怎么办（规模化）。**

## 一、问题场景：为什么"看得懂题解、写不出题" {#why}

算法这一域最典型的困境不是"没学过"，而是**"学过的知识无法在遇到新问题时被调用"**。以下每个现象，背后缺的都是这一域里某一块认知：

| 常见困境 | 根因（缺的是哪一块） |
|---|---|
| 面试题看一眼就有思路，但说不清复杂度、也说不出有没有更优解 | 缺**复杂度这把尺子**，无法在多个方案间做定量比较 |
| 会背"数组查找 `O(1)`、链表增删 `O(1)`"，但选型时还是凭感觉 | 不知道**抽象复杂度会漏算硬件代价**（缓存局部性、内存分配） |
| 知道 `HashMap` 快，但说不出"它为什么不能做范围查询" | 缺**哈希与树的边界认知**——哈希用放弃顺序换 `O(1)` |
| 遇到"依赖解析""循环依赖"问题时想不到这是图问题 | **认不出问题里的图**（顶点与边没被识别出来） |
| 面试要求手写排序，写出来是对的但说不出"为什么 Java 用两套算法" | 缺**工程实现与教科书算法的差别**认知（前提条件、稳定性、分派策略） |
| DP 题看题解能懂，自己写不出来 | 缺**"状态定义"的训练**——DP 的难点从来不在代码 |
| 遇到"40 亿个整数找重复"这类题，第一反应是"开个 HashSet" | 缺**空间预算意识**：允许误差与否，内存需求差几个数量级 |

**共同的答案是同一批基础能力**：定量地比较方案、认识每种结构的前提与代价、能识别问题形态、对空间有预算概念。**这些能力不在任何框架的文档里——它们是"框架为什么这样设计"的底层依据。**

## 二、这一域的骨架 {#structure}

七篇按"认知顺序"排成一条链，**每一篇都在回答上一篇留下的问题**：

```text
                     ┌────────────────────────────────────────────────┐
                     │  ⑦ 海量数据处理 —— 数据装不下时怎么办            │
                     │     位图 / 布隆过滤器 / TopK / 外排序 / 哈希分桶   │
                     └───────────────────────▲────────────────────────┘
                                             │ 数据再大，也是同一批结构
                     ┌───────────────────────┴────────────────────────┐
                     │  ⑥ 动态规划与算法思想                            │
                     │     五步法 / 贪心-分治-DP 分界 / 五个模型 / 回溯   │
                     └───────────────────────▲────────────────────────┘
                                             │ 有了结构，还要有"怎么算"的策略
┌────────────────────────────────────────────┴──────────────────────────────────┐
│  ① 复杂度分析      用同一把尺子衡量一切                                          │
│     大 O · 均摊 · 主定理 · 空间 · 隐藏代价                                       │
└────────────────────────────────────────────┬──────────────────────────────────┘
                                             │ 尺子有了，开始量东西
      ┌──────────────────────┬───────────────┴──────────────┬──────────────────┐
      ▼                      ▼                              ▼                  ▼
 ② 线性结构            ③ 树与索引结构                   ④ 图            ⑤ 排序
 数组/链表/栈/队列      BST/AVL/红黑树/堆/Trie/并查集   BFS/DFS/拓扑    八大排序
 哈希表/字符串KMP       「在动态增删下维持有序」        最短路/MST      TimSort/双轴快排
 「用连续内存换 O(1)」  + Trie 与前缀、并查集与连通性   「认出问题
                                                       里的图」
      └──────────────────────┴──────────────────────────────┴──────────────────┘
                                             │
                        ─────────────────────────────────────────
                        共同落点：每一次选择都要能说出「前提」与「代价」
```

**这张图的价值在于**：它把"七个独立话题"变成了**一条递进链**。

- 没有 ①的尺子，②③④⑤的对比就只能是背表格；
- ②③④ 是"数据的组织方式"，⑤ 是"把无序变有序"（**它同时是其他算法的预处理步骤**——二分要找有序、双指针要找有序、Kruskal 第一步就是排序）；
- ⑥ 是"没有现成结构可套时怎么建模"，**它把 ②③④ 的结构当作工具箱**；
- ⑦ 是"前提（内存装得下）不成立时怎么办"，**它是 ① 的"空间维度"在极限尺度上的展开**。

> **本篇与整个板块的关系**：板块导览的[「一条请求的完整旅程」](/fundamentals/#journey)第 ⑨ 步"业务处理：解析请求、查表、排序、取 Top K"就是这一域。**网络与操作系统负责让请求到达并被执行，算法决定执行得多快。**

## 三、7 篇的分工 {#modules}

| # | 篇目 | 解决的问题 | 最值得记的结论 |
|---|---|---|---|
| 1 | [复杂度分析](/fundamentals/algorithms/complexity) | 怎么定量比较两个方案 | **均摊 ≠ 平均**；`ArrayList` 尾部插入是均摊 `O(1)`、最坏 `O(n)`；`O` 只管趋势不管常数 |
| 2 | [线性结构](/fundamentals/algorithms/linear) | 最基础的组织方式与它们的代价 | **数组的优势有一半来自硬件**（缓存局部性）；**链表在真实硬件上经常比数组慢** |
| 3 | [树与索引结构](/fundamentals/algorithms/tree) | 既要动态增删又要有序怎么办 | **红黑树用"放松的平衡"换更少的旋转**（插入最多 2 次、删除最多 3 次）；**建堆是 `O(n)` 不是 `O(n log n)`** |
| 4 | [图](/fundamentals/algorithms/graph) | 依赖、路径、连通性怎么建模 | **BFS 求无权最短路、DFS 求连通与拓扑**；**Dijkstra 的正确性完全依赖非负权** |
| 5 | [排序](/fundamentals/algorithms/sorting) | 怎么把数据排成一列 | **比较排序的 `O(n log n)` 下界只约束"靠比较"**；Java 对基本类型用双轴快排、对象用 TimSort，**因为对象必须稳定** |
| 6 | [动态规划与算法思想](/fundamentals/algorithms/dp) | 没有现成结构可套时怎么建模 | **DP 的难关是定义状态**；**贪心正确性靠找反例与前提，不靠感觉** |
| 7 | [海量数据处理](/fundamentals/algorithms/high-volume) | 内存装不下怎么办 | **"能否接受误差"决定内存量级**（精确去重 GB 级 vs HyperLogLog 12 KB）；**分治的全部依据是"按哈希切"** |

**阅读主线**：`complexity`（拿到尺子）→ `linear`（最基础的结构）→ `tree`（有序的代价）→ `graph`（依赖与路径）→ `sorting`（整理）→ `dp`（建模）→ `high-volume`（规模化）。

**两条跳读路径**：

| 你的情况 | 建议路径 |
|---|---|
| **为了面试突击** | [板块导览的算法速查](/fundamentals/#faq-algorithms) → 按速查里的锚点回正文看推导 |
| **为了理解某次技术选型** | 直接去对应篇：选型 `HashMap` 去 [树 · 哈希的边界](/fundamentals/algorithms/tree#interview)、排序去 [排序 · JDK 实现](/fundamentals/algorithms/sorting#jdk-impl)、内存不够去 [海量数据](/fundamentals/algorithms/high-volume) |

## 四、使用场景与面试问答 {#interview}

### 4.1 按场景跳转

| 场景 | 直接去 |
|---|---|
| 判断一段代码会不会拖慢接口 | [复杂度 · 隐藏代价清单](/fundamentals/algorithms/complexity#pitfalls) |
| 选 `ArrayList` 还是 `LinkedList` / `HashMap` 还是 `TreeMap` | [线性结构 · 链表真的比数组快吗](/fundamentals/algorithms/linear#linked-vs-array) → [树 · 为什么需要树](/fundamentals/algorithms/tree#why-tree) |
| 实现 LRU 缓存 | [双向链表：给定结点 O(1)](/fundamentals/algorithms/linear#doubly-linked) |
| 实现 TopK / 热搜榜 | [堆的三个任务](/fundamentals/algorithms/tree#heap-uses) → [海量数据 · TopK](/fundamentals/algorithms/high-volume#topk) |
| 缓存穿透 / URL 去重 | [布隆过滤器](/fundamentals/algorithms/high-volume#bloom) |
| 排查循环依赖 / 决定启动顺序 | [拓扑排序的工程用途](/fundamentals/algorithms/graph#topo-in-production) |
| 内存放不下要排序 | [外排序](/fundamentals/algorithms/high-volume#external-sort) |
| 面试要求手写排序并解释 JDK 实现 | [排序 · Java 的 Arrays.sort](/fundamentals/algorithms/sorting#jdk-impl) |
| DP 题没有思路 | [DP 的五步法](/fundamentals/algorithms/dp#five-steps) → [贪心/分治/DP 的分界](/fundamentals/algorithms/dp#paradigms) |

### 4.2 概念级速查

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 均摊复杂度和平均复杂度是一回事吗？ | **不是**。均摊对**最坏操作序列**做算术（无需概率假设），平均对**输入分布**求期望 | [#amortized](/fundamentals/algorithms/complexity#amortized) |
| `O`、`Ω`、`Θ` 有什么区别？ | `O` 上界、`Ω` 下界、`Θ` 紧确界；**工程语境说 `O` 多半指 `Θ`** | [#notation](/fundamentals/algorithms/complexity#notation) |
| 数组为什么下标从 0 开始？ | 寻址公式 `base + i × size` **无需额外减法指令**，CPU 少一条指令 | [#zero-based](/fundamentals/algorithms/linear#zero-based) |
| 「数组比链表快」的真正原因？ | 不只是 `O(1)` 寻址，更是**缓存局部性**：一次缓存行加载带进相邻元素 | [#cache-locality](/fundamentals/algorithms/linear#cache-locality) |
| 频繁增删就该用链表吗？ | **不一定**。循环"遍历+尾部追加"时数组更快；链表的价值在**已持有结点引用 + 任意位置增删** | [#linked-vs-array](/fundamentals/algorithms/linear#linked-vs-array) |
| 环形缓冲区为什么容量取 2 的幂？ | 用 `index & (capacity-1)` 代替取模——**位与一个周期，除法几十个周期** | [#circular-buffer](/fundamentals/algorithms/linear#circular-buffer) |
| `HashMap` 树化阈值 8 是性能优化吗？ | **主要是防御性设计**——防止构造哈希冲突退化成 `O(n)`（哈希碰撞 DoS） | [#load-factor](/fundamentals/algorithms/linear#load-factor) |
| 红黑树五条性质推出什么？ | **最长路径 ≤ 2 × 最短路径**：红不能相邻 → 最长红黑交替；黑高相同 → 最短全黑 | [#rb-properties](/fundamentals/algorithms/tree#rb-properties) |
| 建堆是 `O(n)` 还是 `O(n log n)`？ | **自底向上建堆是 `O(n)`**：层数越深节点越多但下沉越浅，级数收敛于 `2n` | [#build-heap](/fundamentals/algorithms/tree#build-heap) |
| 并查集的复杂度是多少？ | 路径压缩 + 按秩合并后 **`O(α(n))` 均摊**，`α(n) < 5`，**可直接当 `O(1)`** | [#union-find](/fundamentals/algorithms/tree#union-find) |
| 为什么 Dijkstra 不能有负权？ | 它的正确性依赖"**已确定节点不会再有更短路径**"这个贪心假设，负权会推翻它 | [#dijkstra](/fundamentals/algorithms/graph#dijkstra) |
| 有向图怎么判环？ | **三色标记**：访问到"灰色"（当前路径上的祖先）即有环；单纯 `visited` 不够 | [#cycle-detection](/fundamentals/algorithms/graph#cycle-detection) |
| 比较排序的下界是多少？ | **`O(n log n)`**：`n!` 种排列需 `2^k ≥ n!`；**下界只约束"靠比较"的算法** | [#lower-bound](/fundamentals/algorithms/sorting#lower-bound) |
| Java 对基本类型和对象为什么用不同排序？ | **对象有身份、必须稳定**（TimSort）；基本类型值相等即不可区分，可用更快的双轴快排 | [#two-entries](/fundamentals/algorithms/sorting#two-entries) |
| 0-1 背包为什么容量要逆序？ | 逆序时 `dp[j-w]` 还是"上一轮"旧值 → **每件物品只用一次**；正序会变成完全背包 | [#knapsack-reverse](/fundamentals/algorithms/dp#knapsack-reverse) |
| "找零钱"为什么不能用贪心？ | 面额 `[1,3,4]` 凑 6：贪心 3 张、最优 2 张（`3+3`）——**局部最优损害了后续选择** | [#greedy-counterexamples](/fundamentals/algorithms/dp#greedy-counterexamples) |
| 位图和布隆过滤器怎么选？ | **值域可控且要精确 → 位图**（1 bit/值）；**值域不可控、允许假阳性 → 布隆过滤器**（约 10 bit/元素） | [#bitmap](/fundamentals/algorithms/high-volume#bitmap) |
| 布隆过滤器会漏判吗？ | **不会**（无假阴性），**只有假阳性**；所以语义是"可能包含 / 一定不包含" | [#bloom](/fundamentals/algorithms/high-volume#bloom) |
| TopK 为什么用小顶堆？ | **堆顶是 K 个候选里最小的**，新元素比堆顶大才替换；用大顶堆会把最大值挤出去 | [#topk](/fundamentals/algorithms/high-volume#topk) |
| 求中位数能像 TopK 那样分治吗？ | **不能**。各分片的中位数合成不出全局中位数——**"可否分治"是核心考点** | [#topk](/fundamentals/algorithms/high-volume#topk) |

## 五、阅读建议 {#reading}

| 你的情况 | 建议路径 |
|---|---|
| 从零建立算法认知 | [复杂度分析](/fundamentals/algorithms/complexity) → [线性结构](/fundamentals/algorithms/linear) → [树与索引结构](/fundamentals/algorithms/tree) |
| 已在刷题，但讲不清复杂度 | [复杂度分析](/fundamentals/algorithms/complexity)（把"均摊""隐藏代价"两节吃透） |
| 面试前突击 | [本篇 §4.2](#interview) → [板块导览的算法速查](/fundamentals/#faq-algorithms) → 回正文看推导 |
| 想理解 Java 集合的设计 | [线性结构](/fundamentals/algorithms/linear) → [树与索引结构](/fundamentals/algorithms/tree) → [Java 集合底层选型](/java/collections/data-structure) |
| 要处理大数据量 | [海量数据处理](/fundamentals/algorithms/high-volume) → [数据仓库板块](/bigdata/) |

> **下一篇**：[复杂度分析](/fundamentals/algorithms/complexity) —— 后面六篇里每一句"这个更快""那个更划算"，依据都在这一篇。
>
> **一条纪律**：这一域的结论必须能落到**一次具体的选择或一次具体的性能问题**上。说"均摊 `O(1)`"要能指出 `ArrayList` 的扩容代码；说"用布隆过滤器"要能说出误判率与空间预算。**只会背量级、指不出对应代码与前提的章节，是没写完的章节。**
