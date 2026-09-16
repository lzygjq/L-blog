---
date: 2026-09-13
title: Java 虚拟机 · 导览
desc: JVM 知识地图——原理线（运行时数据区、类加载、垃圾回收、收集器）与实操线（命令行五件套、堆转储与 MAT、Arthas、火焰图）共 9 篇，附高频面试索引
---

# Java 虚拟机 · 导览

JVM 是 Java 面试的「硬通货」：既考原理（内存模型、GC 算法），也考实操（调优参数、线上排查），而且这两层是同一套东西的两面——不理解分代模型就调不好参数，没做过 dump 分析就答不出内存泄漏排查。

本板块分两条线：**原理线**回答"为什么"，**实操线**回答"怎么办"。**面试被追问"具体怎么查"时，答的都在实操线**——而这一层正是"背过八股"和"真排查过"的分水岭。

## 一、原理线：JVM 怎么运行

| # | 主题 | 定位 | 状态 |
|---|---|---|---|
| 1 | [运行时数据区](/java/jvm/memory) | 程序计数器/栈/堆/方法区/直接内存，堆栈对比与栈溢出 | ✅ 已成篇 |
| 2 | [类加载机制](/java/jvm/classloading) | 四类加载器、双亲委派、装载七阶段、打破委派的场景 | ✅ 已成篇 |
| 3 | [垃圾回收](/java/jvm/gc) | 存活判定、四种引用、三大算法、分代回收与 GC 分类 | ✅ 已成篇 |
| 4 | [垃圾收集器](/java/jvm/collectors) | Serial → Parallel → CMS → G1 → ZGC / Shenandoah 的演进、版本时间线与选型 | ✅ 已成篇 |

## 二、实操线：线上问题怎么查

按「**覆盖面由窄到宽**」排序：命令行只能看单点，堆转储能看全量，在线诊断能看不重启，采样剖析能看一段时间。

| # | 主题 | 定位 | 状态 |
|---|---|---|---|
| 5 | [调优与线上排查](/java/jvm/tuning) | 参数速查、工具链总览、GC 日志配置与判读、内存泄漏/CPU 飙高的两个四步法、OOM 类型对照 | ✅ 已成篇 |
| 6 | [JDK 命令行排查](/java/jvm/troubleshooting-cli) | **五件套的输出怎么读**：jstat 十列与 GC 原因、jstack 线程栈六种形态与三次采样法、jmap 四模式取舍、jcmd 与动态改参、排查决策树 | ✅ 已成篇 |
| 7 | [堆转储与 MAT 分析](/java/jvm/heap-dump-analysis) | 从"什么对象多"到"**谁持有它**"：支配树与 retained size、引用链读法与三判据、五类经典泄漏图谱、OQL | ✅ 已成篇 |
| 8 | [Arthas 在线诊断](/java/jvm/online-diagnostics) | **不改代码、不重启**：Attach 原理与四个前提、命令谱系、`trace` 的开销纪律、`watch` 抓被吞的异常、生产四条安全边界 | ✅ 已成篇 |
| 9 | [火焰图与性能剖析](/java/jvm/profiling) | **时间花在哪一行**：读图六规则与三种误读、四类剖析（on-CPU / off-CPU / alloc / lock）、安全点偏差、async-profiler 与 JFR | ✅ 已成篇 |

**推荐顺序**：1 → 3 建立内存与回收的直觉；2 单独成块（类加载是独立机制）；4 是 3 的工程落地；5 给整条实操线的速查入口；6 → 7 → 8 → 9 依次推进。

> **和外部两处内容的分工**：[Linux 排查实战](/fundamentals/os/linux-tools) 从**机器**视角看（哪类资源饱和、进程在不在），本板块实操线从 **JVM 内部**看（GC、线程、对象、代码）；[容量测算与压测方案](/projects/property-saas/capacity-and-perf/) 管"施压与容量"，实操线管"施压之后查什么"。

## 三、面试高频索引 {#interview-index}

### 3.1 原理层（13 题）

1. 堆和栈的区别（[运行时数据区](/java/jvm/memory)）
2. 双亲委派模型是什么、为什么这么设计（[类加载](/java/jvm/classloading)）
3. 类装载的七个阶段（[类加载](/java/jvm/classloading)）
4. 如何判断对象可以回收（可达性分析 + GC Roots，[垃圾回收](/java/jvm/gc)）
5. 强软弱虚四种引用的区别与使用场景（[垃圾回收](/java/jvm/gc)）
6. 三种垃圾回收算法的对比（[垃圾回收](/java/jvm/gc)）
7. 分代回收流程与对象晋升（[垃圾回收](/java/jvm/gc)）
8. G1 的原理与三个阶段（[收集器](/java/jvm/collectors#g1)）
9. ZGC 为什么能做到停顿与堆大小无关、分代 ZGC 补上了什么（[收集器](/java/jvm/collectors#zgc-shenandoah)）
10. 哪些收集器还在、哪些已被移除（CMS 在 JDK14 移除、非分代 ZGC 在 JDK24 移除）（[收集器](/java/jvm/collectors)）
11. 常用调优参数（[调优与排查](/java/jvm/tuning)）
12. GC 日志怎么配、怎么看（`-Xlog:gc*` 与 `回收前->回收后(总堆)` 的判读）（[调优与排查](/java/jvm/tuning)）
13. 内存泄漏/OOM 排查、CPU 飙高排查（[调优与排查](/java/jvm/tuning)）

### 3.2 实操层（59 题，按篇分布）

| 篇 | 题量 | 覆盖什么 |
|---|---|---|
| [JDK 命令行排查](/java/jvm/troubleshooting-cli#interview) | 16 | CPU 飙高排查链路、jstat 列语义与判泄漏、GC 触发原因、死锁与锁竞争、`RUNNABLE` 的误读、线程池空闲与打满、三次采样、jmap 取舍、堆外内存、动态改参 |
| [堆转储与 MAT 分析](/java/jvm/heap-dump-analysis#interview) | 14 | shallow 与 retained、支配树、引用链排除项、泄漏还是缓存、ThreadLocal 的准确机制、OQL、MAT 三个坑 |
| [Arthas 在线诊断](/java/jvm/online-diagnostics#interview) | 16 | Attach 原理与前提、trace 的开销、watch 抓异常、四个命令选型、`thread -b`、`jad` 验证版本、`stop` 与 `shutdown`、容器场景 |
| [火焰图与性能剖析](/java/jvm/profiling#interview) | 13 | 读图六规则、on-CPU 与 off-CPU、安全点偏差、perf 盲区、采样与插桩、alloc 与 lock、JFR 选型 |

## 四、怎么用这个板块

每篇都按两层写：**原理层**（为什么、机制怎么跑）和**面试口径**（怎么在 60 秒内答清楚）。背口径之前先过原理层——面试官一追问就露馅的，永远是只背了结论的那部分。

实操线四篇的写法刻意"反速查"：**先给现象、再给判据、最后才是命令**。因为排查失败的原因极少是"不知道有这个命令"，绝大多数是**看到了输出却读错了结论**——比如把 `socketRead0` 的 `RUNNABLE` 当成 CPU 热点，把空闲的池线程当成"线程池打满"。
