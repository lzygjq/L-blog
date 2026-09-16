---
order: 7
date: 2026-09-16
title: 堆转储与 MAT 分析
desc: 拿到 dump 的四种方式与各自代价、MAT 四个核心视图、shallow size 与 retained size 的本质区别、支配树为什么比引用图好用、引用链的正确读法与「泄漏还是缓存」三判据、五类经典泄漏的图谱特征（含 ThreadLocal 泄漏的准确机制）、OQL 与三个常见坑
---

# 堆转储与 MAT 分析：从"什么对象多"到"谁持有它"

> 上一篇：[JDK 命令行排查](/java/jvm/troubleshooting-cli)　|　导览：[Java 虚拟机](/java/jvm/)

命令行工具能告诉你"**堆在涨**"，但告诉不了你"**为什么涨**"。要回答后者，必须把某个时刻的堆**完整取下来**，在离线工具里把引用关系摊开看——这就是 dump 分析。

**先把结论放前面**：

1. **分析的起点不是"什么对象多"，而是"谁持有它"。** 排在最前面的类永远是 `String`、`char[]`、`HashMap$Node` 这些基础类型——**它们是被持有者，不是根因**。
2. **找泄漏看 Dominator Tree 按 retained size 排序，不要看 Histogram 按实例数排序。**（原因见 [§4](#dominator)）
3. **`retained size` 才是"杀掉它我能省多少内存"。** shallow size 是"它自己多重"，参考价值小得多。
4. **排查引用链必须排除软/弱/虚引用**，否则会被一堆框架与缓存的无害路径淹没。

> 输出样本为 Eclipse MAT；概念与视图名称在其他工具里一一对应。

## 一、三个入口：不同的问题看不同的东西 {#entry}

拿到 dump 之前先明确**要回答哪个问题**——这决定了你在 MAT 里主要看哪个视图。

| 你想知道 | 主要视图 | 典型场景 |
|---|---|---|
| **哪个对象在泄漏**（谁吃掉了内存） | **Dominator Tree** | 老年代持续上涨、Full GC 后不回落 |
| 哪类对象数量异常 | Histogram + 两次对比 | 想知道"某个类是不是越来越多" |
| **为什么它还在**（谁不肯放手） | Merge Shortest Paths to GC Roots | 已定位到可疑对象，要找持有者 |
| 这一"团"内存是什么业务数据 | OQL / 对象字段值 | 要看具体是哪个租户/哪个用户的数据 |

> **和 `jstat` 的分工**：`jstat` 只能告诉你是**老年代在涨**；它区分不了"泄漏"和"堆不够"。**判据在 dump 里**——如果大多数内存被少数几类业务对象以一种解释不清的方式持有，那是泄漏；如果分布均匀且都是正常业务对象，那只是堆偏小。

## 二、拿到 dump 的四种方式与取舍 {#get-dump}

| 方式 | 命令 / 配置 | 是否 STW | 何时用 |
|---|---|---|---|
| 主动转储（jmap） | `jmap -dump:format=b,file=h.hprof <pid>` | **长** | 已经观测到增长、需要在"还活着"时留证 |
| 主动转储（jcmd） | `jcmd <pid> GC.heap_dump /path/h.hprof` | **长** | 同上，入口更统一、不要额外工具 |
| **OOM 自动转储** | `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/data/dumps/` | OOM 时 | **生产首选**——那一刻服务本来已不可用，代价最低 |
| 事后补配 | `jinfo -flag +HeapDumpOnOutOfMemoryError <pid>` | 无 | **救火**：没配参数但已观察到要 OOM，动态补上 |

**四条实战纪律**：

1. **dump 到本地盘，不要 dump 到网络盘**——写入速度差一个量级，STW 时长会被放大好几倍。
2. **文件大小 ≈ 堆使用量**（不是 `-Xmx`）。8G 堆就是 8G 文件，传输前先 `gzip`（通常能压到 1/5~1/10）。
3. **容器里一定要挂出来**（卷 / 空目录），否则 Pod 一重建文件就随容器消失了；来不及挂就先 `docker cp` / `kubectl cp` 出来。
4. **`-dump:live` 会先做 Full GC**——文件更小、停顿更长；不带 `live` 则连"已经死掉但还没回收"的对象一起带上，**文件大但停顿中的 GC 次数少**。生产上通常优先选不带 `live`。

> **更好的做法**：不要等到要 dump 的时候才想这件事。**提前把自动转储配好**（配置项见[调优与线上排查](/java/jvm/tuning)），故障来临时证据自动就位。

## 三、MAT 的四个核心视图 {#views}

| 视图 | 维度 | 一句话用途 |
|---|---|---|
| **Histogram** | **类** | 每类有多少个实例、共占多少内存（含 shallow 与 retained） |
| **Dominator Tree** | **对象**（按支配关系组织） | **按 retained size 排序，找真正的内存大户** |
| **Top Consumers** | 类 / 包 / 类加载器 | 按类或包聚合，快速看"哪个模块占得多" |
| **Leak Suspects** | 自动报告 | 一键给出可疑点——**当线索用，不当结论用** |

**关于 Leak Suspects 的正确态度**：它是基于启发式规则生成的（"某个对象 retained size 特别大且引用链可疑"），**不是诊断**。它指出的方向值得看，但它报出的对象经常是**被无辜持有的数据容器**，不是根因。**能用它开路，不能拿它结案。**

## 四、支配树：为什么它比引用图好用 {#dominator}

这一节是 dump 分析的概念核心，理解了它，后面所有操作都是重复应用。

### 4.1 两个 size 的区别 {#two-sizes}

| 概念 | 定义 | 回答的问题 |
|---|---|---|
| **shallow size** | 对象**自身**占用的内存（对象头 + 字段），不含它引用的对象 | "它自己多重" |
| **retained size** | **它被回收后能真正释放的内存总量**（= 自己 + 只有通过它才能到达的所有对象） | **"杀掉它我能省多少"** |

**举例**：一个 `HashMap`，shallow size 可能只有几百字节（表头 + 数组引用），但它装着 100 万个 `OrderSnapshot`——**它的 retained size 是全部那 100 万个对象之和（可能是 1.2GB）**。

**结论：看内存问题永远看 retained size。** shallow size 只在"对象本身巨大"（比如一个超大数组）时才值得关注。

### 4.2 支配关系与支配树 {#dominator-tree}

**支配（dominator）的定义**：对象 X 支配对象 Y，当且仅当**从 GC Roots 出发到 Y 的每一条路径都必然经过 X**。

**支配树的三个性质**（这就是它好用的原因）：

1. 根是 GC Roots（虚拟节点），每个对象在树里**只出现一次**；
2. **retained size 恰好等于该节点在支配树中的子树之和**——所以不会有重复计算；
3. 一个对象如果有**多个持有者**（都能独立引用到它），那它在支配树里会挂在**最近的公共支配者**下面，**不算进任何一个持有者的 retained size**。

**第 3 条是反直觉但很关键的一条**：被共享的对象不是"谁的"，它是"共同的孩子"。所以**如果你在一个持有者下面没看到某个对象，不一定是没引用它，可能只是它被别人也引用着**——想确认引用关系要回到引用链（[§5](#ref-chain)）去看。

> **实操含义**：Dominator Tree 的顶几行就是"如果你要释放内存，先动谁"的答案。**先看这些，而不是去翻哪个类实例数最多。**

## 五、引用链怎么读 {#ref-chain}

从"数字"到"持有者"的标准操作：

### 5.1 标准四步 {#ref-steps}

1. 在 **Dominator Tree** 或 **Histogram** 里选中可疑对象；
2. 右键 → **Merge Shortest Paths to GC Roots** → **`exclude all phantom/soft/weak references`**；
3. 得到"从 GC Root 到该对象的路径"：**路径上第一个属于你自己代码的类，就是持有者**（前面那些 JDK / 框架类是"中转站"）；
4. 对着持有者问三个问题（下一节）。

> **第 2 步的排除项不是可选项。** GC Roots 里包含大量软引用、弱引用、虚引用——缓存框架、JDK 内部、连接池到处都在用。不排除就会得到一堆"无害路径"，把真正那条淹没掉。

### 5.2 「泄漏」还是「缓存太大」：三个判据 {#leak-or-cache}

定位到持有者之后，**不能直接判定为泄漏**。按这三条对照：

| 判据 | 泄漏的特征 | 只是"缓存太大"的特征 |
|---|---|---|
| 持有者的生命周期 | **单例 / 静态字段**（活到进程结束） | 有明确的失效机制 |
| 集合有没有上限或淘汰 | **无上限、无 TTL、无 LRU** | 有 `maximumSize` / TTL，只是设得偏大 |
| 里面的对象业务上还该不该在 | **早该过期**（几个月前的订单、已注销用户） | 都是活跃数据 |

**三条都指向"泄漏"，基本可以定性；有一条不符合，先按"容量配置问题"处理**——那要改的是上限与淘汰策略，不是引用关系。

## 六、五类经典泄漏的图谱特征 {#classic-leaks}

这一节是**可复用的经验**：每类泄漏在 MAT 里有相对固定的"长相"，认出来能省掉大量时间。

### 6.1 静态集合只增不减 {#static-collection}

```text
com.demo.CacheHolder                    1 instance, retained 1.2 GB
 └─ java.util.HashMap                   1,248,332 entries
     └─ com.demo.OrderSnapshot         1,248,320 instances
```

**特征**：**容器类实例数 = 1（单例），但 retained size 巨大，往下挂海量业务对象。**

这是最常见、也最容易改的一类。修法是加上限与淘汰（或换 `Caffeine` 之类的带淘汰的缓存），而不是"定时清空"。

### 6.2 ThreadLocal 未 remove {#threadlocal}

**特征**：MAT 里出现大量 `ThreadLocalMap$Entry`，且引用链上出现 `java.lang.Thread` → `threadLocals` 字段；线程本身是**池化**的（Tomcat worker / 线程池），所以它永远不会结束。

**这里要把机制讲准确**——面试也最爱问这一段：

```text
Thread (长期存活)
 └─ ThreadLocalMap
     └─ Entry[] table
         └─ Entry extends WeakReference<ThreadLocal<?>>
             ├─ key   → ThreadLocal 对象（弱引用）
             └─ value → 你的业务对象（强引用）← 泄漏的是它
```

| 事实 | 说明 |
|---|---|
| `Entry` 的 **key 是弱引用** | 所以 `ThreadLocal` 对象本身没有外部强引用时，`key` 会被回收变成 `null` |
| **value 是强引用** | key 没了，**value 仍然被 Entry 强引用着**——只要线程活着，它就永远不会被回收 |
| JDK 有启发式清理 | `get` / `set` 时会"顺便"扫一部分 `key == null` 的 entry 并清掉 value，**但不保证清干净** |
| **结论** | **泄漏的是 value，不是 key。** 所以"把 ThreadLocal 声明成 static"能延长 key 的寿命、减少空 key，但**根本解法始终是 `remove()`** |

**正确写法**（尤其在线程池里，线程会复用，ThreadLocal 不清理会被下一个任务读到脏值）：

```java
try {
    context.set(ctx);
    doSomething();
} finally {
    context.remove();          // 必须放在 finally，异常路径也要清
}
```

> 这里的"脏值"问题和内存泄漏是**两个独立的坑**：不 `remove` 既可能泄漏内存，也可能让复用的线程读到上一次请求的上下文——**后者更危险，而且更不容易发现**。

### 6.3 连接 / 流未关闭 {#unclosed}

**特征**：引用链上出现 `java.sql.Connection` 实例数远超连接池上限、大量 `ByteArrayOutputStream` + 巨大 `byte[]`、或者 `SocketInputStream` 挂在本不该存活的对象下。

**判据**：**"实例数超过池子上限"就是直接证据**——池的本质是复用，超出上限的实例一定是没还回去的。

### 6.4 监听器 / 回调未注销 {#listener}

**特征**：对象被框架的注册表持有（`ApplicationContext`、事件总线、`ListenerList`、各种 `Registry`）；且**同一个业务类出现多个实例**——每次注册都新建了一个对象并被容器长期持有。

**典型场景**：动态创建的对象注册了监听器，用完只置空了自己的引用，**没有从注册表里移除**。

### 6.5 类加载器泄漏 {#classloader-leak}

**特征**：**同一个类出现多个 `Class` 实例**（被不同 ClassLoader 加载），或者 `ClassLoader` 实例数异常多（正常只有个位数）。

**根因**：热部署、动态代理 / 字节码生成、脚本引擎（Groovy / JS）、应用重载。**它同时会造成 Metaspace 泄漏**——`jstat` 的 `M` 列持续上涨、`jstat -class` 的已加载类数只增不减。这个信号与堆内泄漏**互相验证**。

> 类加载器为什么"被引用着就回收不掉"（双亲委派与卸载条件）见[类加载机制](/java/jvm/classloading)。**判断入口**：`jcmd <pid> VM.metaspace` 能直接按类加载器维度看占用。

## 七、OQL 与其他选择 {#oql}

### 7.1 OQL：从"数字"到"具体数据" {#oql-syntax}

MAT 支持一段类 SQL 的查询语言，用途是**确认"这些对象到底是什么"**：

```sql
-- 找超长字符串（常见的大对象来源）
SELECT * FROM java.lang.String s WHERE s.value.length > 1000

-- 找某个业务类的全部实例
SELECT * FROM INSTANCEOF com.demo.OrderSnapshot

-- 从一个已知对象出发找它引用的对象
SELECT OBJECTS c.entries FROM com.demo.CacheHolder c
```

**最实用的一条**：`SELECT * FROM java.util.HashMap$Node` —— 直接看到"这个 Map 里装的 key 到底是什么"。**"3 万个订单快照"是抽象数字，"这 3 万个 key 全属于同一个租户"才是能定的根因。**

### 7.2 工具选择与三个坑 {#tools}

| 工具 | 适用 | 局限 |
|---|---|---|
| **Eclipse MAT** | 功能最全，能处理超大 dump（建索引） | 吃内存、需要匹配版本 |
| VisualVM | 轻量、引用图直观 | 大堆很吃力 |
| JProfiler / YourKit | 实时性强、能直接连进程 | 商用授权 |
| `jhat` | —— | **已在 JDK 9 移除，不要再找** |

**三个必须知道的坑**：

1. **MAT 自身需要大量内存**（要建索引，通常要 dump 大小的 1/2 以上），**打开大 dump 前先改 `MemoryAnalyzer.ini` 里的 `-Xmx`**，否则 MAT 自己先 OOM。
2. **版本要匹配**：高版本 JDK 生成的 dump 用低版本 MAT 可能打不开。**MAT 版本要 ≥ dump 的 JDK 版本。**
3. **MAT 默认会隐藏部分不可达对象**（`Preferences → Memory Analyzer` 里可调）。所以用不带 `live` 的 dump 时，**你以为看到的"全部对象"其实是过滤后的**——分析结论要记得这一点。

## 八、一份可执行的清单 {#checklist}

按顺序走，不跳步：

| # | 动作 | 目的 |
|---|---|---|
| 1 | 确认现象：`jstat -gcutil` 的 `O` 在 Full GC 后不降 | 先确认**确实是堆内、确实是泄漏**（否则该走 `native_memory`） |
| 2 | 优先取自动转储文件（或 `jmap -dump` 不带 live） | 拿到现场 |
| 3 | `gzip` 压缩后传回本地 | 传输与存档 |
| 4 | 调整 MAT 的 `-Xmx` 后打开 | 避免工具自身 OOM |
| 5 | 先看 **Dominator Tree** 前 10 行 | 找"内存大户" |
| 6 | 对大户做 **Merge Shortest Paths to GC Roots**（排除软/弱/虚） | 找持有者 |
| 7 | 用**三判据**区分泄漏与缓存过大 | 定性 |
| 8 | 必要时用 OQL 看具体数据 | 从数字到业务 |
| 9 | 回代码定位：静态集合 / ThreadLocal / 未关闭资源 / 监听器 / 类加载器 | 归因 |
| 10 | 修复后**复现验证**：同压力下再采一次，确认老年代回收后占用回落 | 闭环 |

**第 10 步不是形式**——"改完看起来好了"和"验证过好了"是两回事，尤其在并发与缓存相关的泄漏上。

## 九、面试问答 {#interview}

| # | 高频问法 | 一句话答案 | 出处 |
|---|---|---|---|
| 1 | "怎么判断是不是内存泄漏？" | **`jstat` 看 `FGC` 持续增长而老年代占用每次回收后都降不下来**；dump 里再确认是否被少数业务对象异常持有 | [三个入口](#entry) |
| 2 | "生产上什么时候导 dump？" | **优先靠 `-XX:+HeapDumpOnOutOfMemoryError` 自动留证**；主动 `jmap -dump` 会 STW，且文件≈堆大小、必须 dump 到本地盘 | [四种方式](#get-dump) |
| 3 | "`-dump:live` 和不带 `live` 有什么区别？" | `live` 先做一次 Full GC、只留活对象，**文件小但停顿长**；不带 `live` 连未回收的垃圾一起导，文件大但少一次 GC | [四种方式](#get-dump) |
| 4 | "shallow size 和 retained size 有什么区别？" | shallow 是对象自身占用；**retained 是"杀掉它后能释放的总量"**——等于它在支配树里的子树之和 | [两个 size](#two-sizes) |
| 5 | "为什么找泄漏要看 Dominator Tree 而不是 Histogram？" | Histogram 按实例数排序，排最前的永远是 `String` / `char[]` 这类**被持有者**；支配树按 retained size 排序才直指内存大户 | [支配树](#dominator-tree) |
| 6 | "什么是支配关系？" | **从 GC Roots 到 Y 的每条路径都必然经过 X**，则 X 支配 Y；支配树里每个对象只出现一次，所以 retained size 不会重复计算 | [支配树](#dominator-tree) |
| 7 | "查引用链为什么要排除软/弱/虚引用？" | GC Roots 里混着大量框架与缓存的弱引用路径，不排除会得到一堆无害路径，把真正的持有者淹掉 | [标准四步](#ref-steps) |
| 8 | "找到一个静态 Map 很大，就是泄漏吗？" | **不一定**，要用三判据：持有者是否单例、集合有无上限/淘汰、对象业务上是否早该过期；不全中就是"缓存太大" | [三判据](#leak-or-cache) |
| 9 | "ThreadLocal 为什么会内存泄漏？" | `Entry` 的 **key 是弱引用、value 是强引用**；key 被回收后 value 仍被 Entry 强引用，线程池线程不死它就一直活着——**泄漏的是 value** | [ThreadLocal](#threadlocal) |
| 10 | "ThreadLocal 用 static 修饰能解决泄漏吗？" | **不能算解决**。static 让 key 更难被回收、减少空 key，但只要线程活着 value 就一直被持有；**根本解法是 `finally` 里 `remove()`** | [ThreadLocal](#threadlocal) |
| 11 | "线程池里 ThreadLocal 不 remove 还有什么问题？" | 除了泄漏，还会让**复用的线程读到上一次请求的脏值**——这个问题比内存泄漏更隐蔽也更危险 | [ThreadLocal](#threadlocal) |
| 12 | "MAT 打开大 dump 报 OOM 怎么办？" | 调大 `MemoryAnalyzer.ini` 的 `-Xmx`（一般要 dump 大小的 1/2 以上）；并确认 MAT 版本 ≥ dump 的 JDK 版本 | [三个坑](#tools) |
| 13 | "怎么看 Map 里到底装了什么？" | 用 OQL，例如 `SELECT * FROM java.util.HashMap$Node`，能直接看到具体 key——把"3 万个对象"变成"都属于同一租户" | [OQL](#oql-syntax) |
| 14 | "MetaSpace 一直涨跟堆内泄漏有关系吗？" | 有关系：**类加载器泄漏**同时会造成 Metaspace 上涨与同名类多份 Class 实例，两个信号可以互相验证 | [类加载器泄漏](#classloader-leak) |

> **本篇是实操四篇的第 2 篇。** 前置的命令行工具与判读见 [JDK 命令行排查](/java/jvm/troubleshooting-cli)；不重启的在线诊断见 [Arthas 在线诊断](/java/jvm/online-diagnostics)；采样视角看"时间花在哪"见[火焰图与性能剖析](/java/jvm/profiling)。调优参数与 OOM 类型对照见[调优与线上排查](/java/jvm/tuning)。
