---
date: 2026-09-15
title: 操作系统 · 导览
---

# 操作系统 · 导览

网络把数据送到了机器，**操作系统决定这台机器怎么接住它**。

这一域和「计算机网络」的组织方式刚好相反。网络那域**以分层为纲**——因为网络是个静态的管道，数据流过去就完了。操作系统不能这么组织，因为它的核心是**一个不断在做决定的调度者**：现在该让哪个进程上 CPU、这块内存该给谁、这个包该谁来收、这次写盘什么时候真正落盘。**决定谁来做、什么时候做、用哪份资源**——这才是操作系统的本体。

所以这一域的组织原则是：**以进程为一等公民，以它占用的资源为线索。** 先把「进程」这个抽象立住，再去看它手里的三样东西：CPU（调度）、内存（虚拟内存）、IO 与文件（fd 与页缓存）。

## 一、问题场景：为什么"看得见现象、说不清原因" {#why}

操作系统是唯一一门**平时感觉不到、出问题时又躲不掉**的知识。以下每个现象，背后缺的都是这一域里某一块认知：

| 常见困境 | 根因（缺的是哪一块） |
|---|---|
| 压测时 CPU 使用率只有 30%，但 RT 已经上万毫秒 | 分不清「CPU 忙」和「进程在等」——等待可能发生在 IO、锁、或被 cgroup 限流 |
| 线程池从 200 调到 800，吞吐不升反降 | 不知道上下文切换有成本，也不知道线程真正在等什么 |
| 容器 `memory limit` 给了 4G，Pod 还是被 OOMKilled | 不知道 JVM 堆不等于进程 RSS（还有堆外、元空间、线程栈、页缓存计入） |
| 代码里明明 `write` 成功了，断电后文件是空的 | 不知道 `write` 只是写进页缓存，**没落盘**；`fsync` 才保证持久化 |
| `Too many open files` | 不知道 socket、文件、管道**都占 fd**，也不知道 `ulimit -n` 是进程级限制 |
| `df` 显示磁盘满，`du` 加起来却对不上 | 不知道「被删除但仍被进程打开」的文件仍占空间 |
| 服务响应时快时慢，同一个接口 p99 抖动十倍 | 不知道 CPU 调度延迟、NUMA 跨节点访问、页缓存命中率都在影响延迟 |

**共同的答案是同一批底层机制**：调度怎么选下一个任务、内存怎么分配与回收、IO 怎么被等待、文件怎么被缓存。这也解释了为什么这些问题「查文档解决不了」——它们不在框架里。

## 二、进程的四个资源面 {#process-resources}

理解操作系统，先要理解**「进程」不是一段程序，而是一组资源的持有者**。内核给每个进程维护一个 `task_struct`，它挂着的就是下面这四样东西——**这四样，正好对应本域的四篇正文**：

```text
                        ┌──────────────────────────────────────────┐
                        │  进程 = 资源分配单位                        │
                        │  （内核视角：task_struct + 一组资源句柄）    │
                        └──────────────────────────────────────────┘
                                        │
     ┌──────────────┬───────────────────┼───────────────────┬──────────────┐
     ▼              ▼                   ▼                   ▼              ▼
  执行流         虚拟地址空间          打开文件表           信号/凭据      命名空间
  线程(TID)      内存资源              fd → inode          权限与通信     隔离视图
     │              │                   │
  调度单位       页表 + TLB           inode / 页缓存
     │              │                   │
     ▼              ▼                   ▼
 ① 进程与线程    ② 虚拟内存          ③ 文件与 IO
  谁上 CPU       内存怎么给          数据怎么进出
 切一次多少钱    缺页怎么办          怎么不白等
     └──────────────┴───────────────────┘
                    ▼
       ④ 工具与排查：把上面三块变成可读的数字
          （top / vmstat / pidstat / iostat / lsof / strace / perf）

  ───────────────────────────────────────────────────────────────────
  容器只是给这套东西套了一层「视图」：cgroup 限的是资源量，
  namespace 改的是「你能看见谁」——机制本身没有变。
```

**这张图的价值在于**：容器、K8s、JVM、Netty 这些上层名词，往下追问都会落到这四个面里的某一个。**并且它们没有替代这些机制，只是在使用它们**——`limits.cpu` 还是靠调度器实现，`requests.memory` 还是靠内存回收实现。所以这四篇读透了，云原生板块里那些"为什么"才有地基。

> **和 [网络排查](/fundamentals/network/troubleshoot) 的分工**：那篇解决"数据有没有到机器"，本篇解决"到了机器之后卡在哪"。`ping` 通、`telnet` 端口通，但接口就是慢——这时就该从网络排查切到本域的工具链。

## 三、5 篇的分工 {#modules}

| # | 篇目 | 解决的问题 | 最值得记的结论 |
|---|---|---|---|
| 1 | [进程、线程与调度](/fundamentals/os/process-thread) | 谁在 CPU 上跑、切换一次要多少钱 | **线程是调度单位，进程是资源单位**；上下文切换的成本不在"保存寄存器"，而在**缓存与 TLB 失效** |
| 2 | [虚拟内存与内存管理](/fundamentals/os/memory) | 内存怎么分配、不够时怎么办 | 每个进程看到的是**虚拟地址**；`free` 里的 `buff/cache` 不是"被占用"，**可回收内存 ≠ 可用内存** |
| 3 | [IO 模型与多路复用](/fundamentals/os/io-model) | 数据怎么进出、等待怎么避免 | 所有 IO 模型讨论的都是**两次等待**；`epoll` 快在**不用每次把 fd 集合拷进内核、不用线性遍历** |
| 4 | [文件系统与文件描述符](/fundamentals/os/filesystem) | 文件存在哪、`write` 之后数据在哪 | `write` 只到**页缓存**；`fd` 是进程级整数索引，`ulimit -n` 限制的是它 |
| 5 | [Linux 排查实战](/fundamentals/os/linux-tools) | 线上 CPU / 内存 / IO / fd 出问题怎么定位 | 先分**瓶颈类型**（CPU 密集 / IO 等待 / 内存压力 / 句柄耗尽），再选工具；**别在没定位前调参数** |

**阅读主线**：`process-thread`（建立"谁在跑"的模型）→ `memory`（它手里的内存怎么来的）→ `io-model`（它怎么等数据）→ `filesystem`（数据最终落在哪）→ `linux-tools`（把前四篇变成可执行的排查动作）。

## 四、使用场景与面试问答 {#interview}

### 4.1 按场景跳转

| 场景 | 直接去 |
|---|---|
| 压测报告要解释「CPU 没跑满为什么不快」 | [上下文切换与调度](/fundamentals/os/process-thread#context-switch) → [排查：CPU 与负载](/fundamentals/os/linux-tools#case-cpu) |
| 线程池参数不知道怎么定 | [进程、线程与调度](/fundamentals/os/process-thread#scheduler) → [Java 线程池的核数怎么定](/java/concurrent/thread-pool#pool-size) |
| Pod 被 OOMKilled | [内存回收与 OOM](/fundamentals/os/memory#swap-oom) → [落到 Java：堆、堆外与容器 limit](/fundamentals/os/memory#java-mapping) |
| 网关 / RPC 要选 IO 模型 | [五种 IO 模型](/fundamentals/os/io-model#five-models) → [多路复用：epoll](/fundamentals/os/io-model#multiplexing) |
| 学 Kafka 为什么快 | [零拷贝](/fundamentals/os/io-model#zero-copy) → [Kafka 性能](/middleware/kafka/performance) |
| `df` 与 `du` 对不上、磁盘莫名满 | [空间为什么没释放](/fundamentals/os/filesystem#space) |
| 报 `Too many open files` | [文件描述符与 ulimit](/fundamentals/os/filesystem#fd) → [排查：句柄耗尽](/fundamentals/os/linux-tools#case-fd) |
| 线上服务变慢，先看什么 | [方法论：USE 与自顶向下](/fundamentals/os/linux-tools#method) |

### 4.2 概念级速查

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 进程和线程的本质区别是什么？ | **进程是资源分配单位（有独立地址空间），线程是调度单位（共享地址空间）**；Linux 内核里两者都是 `task_struct`，区别在是否共享 | [#process-vs-thread](/fundamentals/os/process-thread#process-vs-thread) |
| 线程切换一次要多少钱？ | 直接成本（保存/恢复寄存器）是**百纳秒级**；真正贵的是**切换后缓存与 TLB 变冷**，间接成本可达微秒级 | [#context-switch](/fundamentals/os/process-thread#context-switch) |
| CFS 还是 EEVDF？ | Linux 6.6 起 **EEVDF 取代 CFS**（6.12 完成转换）；从"最小虚拟运行时间"改为"**最早合格的虚拟截止时间**"，延迟敏感任务可以用 `sched_setattr` 请求更短时间片 | [#cfs-eevdf](/fundamentals/os/process-thread#cfs-eevdf) |
| 进程间通信有哪几种？ | 管道 / 消息队列 / 共享内存 / 信号量 / 信号（+ socket）；**共享内存最快（零拷贝）但要自己做同步** | [#ipc](/fundamentals/os/process-thread#ipc) |
| 虚拟内存到底解决了什么？ | 三件事：**隔离**（互不干扰）、**超卖**（合计可超物理内存）、**抽象**（程序不用关心物理布局） | [#why-virtual](/fundamentals/os/memory#why-virtual) |
| `free` 里 `buff/cache` 很高要不要清？ | 不要。它是**可回收的页缓存**，用 `available` 而不是 `free` 判断真实余量 | [#observe-metrics](/fundamentals/os/memory#observe-metrics) |
| `write` 成功了，数据在哪？ | 在**页缓存**（内存），没落盘。要持久化必须 `fsync`；`O_DIRECT` 绕过页缓存是另一条路 | [#dirty-writeback](/fundamentals/os/memory#dirty-writeback) |
| `select` / `poll` / `epoll` 差在哪？ | 前两者每次调用都要**把整个 fd 集合拷进内核并线性遍历**；`epoll` 把集合维护在内核（红黑树 + 就绪链表），**只返回就绪的 fd** | [#select-poll-epoll](/fundamentals/os/io-model#select-poll-epoll) |
| 水平触发和边缘触发怎么选？ | 默认用**水平触发**（没读完还会再通知）；边缘触发只通知一次状态变化，**必须一次读到 `EAGAIN`**，否则会丢事件 | [#et-lt](/fundamentals/os/io-model#et-lt) |
| 零拷贝是"不拷贝"吗？ | 不是。指的是**去掉 CPU 参与的拷贝**或**不让数据经过用户态**；`sendfile` 配合 SG-DMA 可做到 0 次 CPU 拷贝 | [#zero-copy](/fundamentals/os/io-model#zero-copy) |
| `epoll` 会被 `io_uring` 取代吗？ | 大部分网络服务**目前仍然是 `epoll` 更稳妥**；`io_uring` 的优势在**磁盘与网络统一的异步接口 + 批量提交**，且有内核版本与安全面（容器常默认禁用）的约束 | [#io-uring](/fundamentals/os/io-model#io-uring) |
| inode 是什么？和文件名什么关系？ | inode 是**文件的元数据与数据块索引**，文件名在**目录项**里，目录项指向 inode；所以可以有多个名字指向同一个 inode（硬链接） | [#inode](/fundamentals/os/filesystem#inode) |
| 硬链接和软链接的区别？ | 硬链接是**同一个 inode 的另一个名字**（不能跨文件系统、不能链目录）；软链接是**一个存了路径的文件**（可跨、可断） | [#hard-soft-link](/fundamentals/os/filesystem#hard-soft-link) |
| 删除文件后空间没释放？ | 进程还持有这个 fd，inode 引用计数不为 0。**要释放得先让进程关闭它**（`lsof \| grep deleted`） | [#space](/fundamentals/os/filesystem#space) |

## 五、阅读建议 {#reading}

| 你的情况 | 建议路径 |
|---|---|
| 从零建立系统认知 | [进程、线程与调度](/fundamentals/os/process-thread) → [虚拟内存](/fundamentals/os/memory) → [IO 模型](/fundamentals/os/io-model) |
| 面试前突击 | [本篇 §4.2](#interview) → [板块导览的操作系统速查](/fundamentals/#faq-os) → 回正文看推导 |
| 线上正在出问题 | 直接去 [Linux 排查实战](/fundamentals/os/linux-tools) |
| 只想搞懂"为什么 Kafka 快 / 为什么 Nginx 能扛" | [IO 模型](/fundamentals/os/io-model) → [零拷贝](/fundamentals/os/io-model#zero-copy) |

> **下一篇**：[进程、线程与调度](/fundamentals/os/process-thread) —— 先把这个"决定谁来跑"的主体立起来，后面三篇都是它的资源。
>
> **一条纪律**：这一域的结论必须能落到**一个可观测的数字**上。说"上下文切换贵"要能指出 `vmstat` 的 `cs` 列；说"内存不够"要能区分 `available`、`buff/cache` 和 RSS。**只会背机制、指不出对应指标的章节，是没写完的章节。**
