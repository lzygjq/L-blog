---
date: 2026-09-15
title: 计算机基础 · 板块导览
desc: 计算机网络、操作系统、算法与数据结构——三门语言无关的底座。把「机器和网络到底怎么运转」讲清楚，其余所有板块的技术选型才有判断依据
---

# 计算机基础 · 板块导览

这个板块回答一个前置问题：**你写的代码，最终跑在什么样的机器和网络上。**

它和 Java、数据库、云原生那些板块不是并列关系，而是**支撑关系**——上面所有板块的"最佳实践"，往下追问到底都是这三门知识：

- 为什么 RPC 要设超时、为什么重试要有退避 → 要懂 TCP 的重传与拥塞控制
- 为什么连接池满了会拖垮整条链路、为什么线程数不能随便调大 → 要懂进程/线程调度与 IO 模型
- 为什么 `HashMap` 是 O(1) 而 `TreeMap` 是 O(log n)、为什么布隆过滤器能省 99% 内存 → 要懂数据结构与复杂度

**三门都是语言无关的**。这正是它们不该挂在「Java」板块下的原因——Java 只是调用这些机制的一种方式。

## 一、三大域的分工 {#modules}

| 域 | 目录 | 回答的问题 | 状态 |
|---|---|---|---|
| [计算机网络](/fundamentals/network/) | `network/` | 数据怎么从一台机器到另一台机器，中途会出什么错 | **5 篇已成篇** |
| [操作系统](/fundamentals/os/) | `os/` | 数据到了机器之后，进程怎么被调度、内存怎么被管理、IO 怎么被等待 | **5 篇已成篇** |
| 算法与数据结构 | `algorithms/` | 数据到了应用层，用什么结构存、用什么策略算，代价是多少 | 规划中 |

**三者的关系不是"三个独立学科"，是一条连续的流水线**——网络负责"送达"，操作系统负责"接住并交给进程"，算法负责"算得又快又省"。下一节用一条真实的请求把这条流水线走一遍。

## 二、一条请求的完整旅程 {#journey}

把三域串起来的看板。每一行都是一次"知识交接"，标注了它落在哪个域：

```text
  浏览器输入 https://example.com/api/order

  ① DNS 解析：域名 → IP                                   ← 网络
     hosts → 本地缓存 → 递归解析器 → 根 → 顶级域 → 权威
  ② TCP 三次握手：确认双方收发能力                          ← 网络
     SYN → SYN+ACK → ACK；内核维护半连接队列/全连接队列
  ③ TLS 握手：协商密钥，之后的应用数据全部加密              ← 网络
     TLS 1.3 只需一次往返；客户端随机数 + 服务端证书 + 密钥交换
  ④ 发送 HTTP 请求：应用层语义在这一层                       ← 网络
     请求行 / 头部 / 体；HTTP/2 起变成二进制帧
  ⑤ 封装：数据一路加上头部，最后变成以太帧发到网卡           ← 网络
     HTTP 报文 → TCP 段 → IP 包 → 以太帧；受 MTU 约束
───────────────── 数据离开本机，进入网络 ─────────────────
  ⑥ 服务端网卡收包：触发硬中断，内核协议栈逐层剥离头部        ← 操作系统
     数据从内核态缓冲区等进程来取
  ⑦ 进程被唤醒：epoll 报告可读，线程从就绪队列被调度         ← 操作系统
     五种 IO 模型、select/poll/epoll、零拷贝都发生在这里
  ⑧ 应用 read()：数据从内核缓冲区拷贝到用户态内存            ← 操作系统
  ⑨ 业务处理：解析请求、查表、排序、取 Top K                 ← 算法与数据结构
     哈希表 / 堆 / 红黑树 / 布隆过滤器决定了这一步的代价
  ⑩ 响应原路返回：序列化 → 发送 → 回程经过同样的封装与网络     ← 回到网络
```

**读者收益**：面试里追问"一次请求发生了什么"，能按这条链答下来的人，和只会背"三次握手"的人，是两个水平。这个板块就是把这条链每一环都讲透。

## 三、与其他板块的交叉点 {#cross}

| 交叉板块 | 交叉点 | 说明 |
|---|---|---|
| [Java 核心](/java/) | IO 模型、线程调度、集合底层 | [IO 与 NIO](/java/basics/io-nio) 讲 **Java 视角**（BIO/NIO/AIO 的 API、Buffer、Selector 用法）；「五种 IO 模型的内核机制、epoll 的数据结构、零拷贝」在 [IO 模型与多路复用](/fundamentals/os/io-model) |
| [Java 并发](/java/concurrent/) | 线程与调度 | 内核线程怎么被调度（[进程、线程与调度](/fundamentals/os/process-thread)）vs Java 线程池怎么配（[线程池](/java/concurrent/thread-pool)）；前者是后者参数的依据 |
| [存储与消息](/database/) | 连接、超时、重传 | 数据库连接池、MQ 长连接的行为，全部受 TCP 层影响 |
| [云原生](/cloud-native/) | Service / Ingress / CNI | K8s 板块讲「怎么在集群内实现服务发现与转发」；本板块讲「TCP/IP 本身怎么工作」 |
| [数据仓库](/bigdata/) | 海量数据处理 | TopK、布隆过滤器、位图、外排序这些算法在 `algorithms/`；它们在数仓与大数据场景里的用法在数据仓库板块 |
| [面试专题](/interview/) | 检索入口 | 面试专题是**检索层**（题单 + 索引），本板块是**内容层**。三域成篇后，面试专题只放指向正文锚点的链接，不复制正文 |

## 四、高频考点速查 {#faq}

### 4.1 计算机网络 {#faq-network}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 为什么网络要分层？ | 每层只解决一类问题、只依赖下层接口；换掉一层不影响其它层（换 WiFi 不用改 HTTP） | [#why-layers](/fundamentals/network/tcp-ip#why-layers) |
| 为什么 TCP 握手是三次不是两次？ | 两次无法让**服务端**确认自己的发送能力和客户端的接收能力；还会让历史失效连接被误建 | [#handshake](/fundamentals/network/tcp#handshake) |
| 为什么挥手是四次？ | TCP 是全双工，一方发完不代表另一方也发完；FIN 只关闭单向 | [#teardown](/fundamentals/network/tcp#teardown) |
| TIME_WAIT 过多要不要处理？ | 先分清是**主动关闭方多**还是**短连接多**；`CLOSE_WAIT` 堆积才是真 bug（代码没关连接） | [#teardown](/fundamentals/network/tcp#teardown) |
| 粘包是 TCP 的缺陷吗？ | 不是。TCP 是**字节流**，本来就不保证消息边界；切分是应用层的责任 | [#sticky-packet](/fundamentals/network/tcp#sticky-packet) |
| 流量控制和拥塞控制有什么区别？ | 流量控制管**接收方**来不及收（怕撑爆对端），拥塞控制管**网络**来不及送（怕压垮链路） | [#congestion](/fundamentals/network/tcp#congestion) |
| HTTP/1.1 的队头阻塞和 HTTP/2 的队头阻塞是一回事吗？ | 不是。1.1 是**请求在应用层排队**；2 解决了它，但裸 TCP 上丢一个包仍会阻塞所有流 | [#http11](/fundamentals/network/http#http11) |
| HTTP/3 为什么建在 UDP 上？ | 要绕开 TCP 的内核实现与队头阻塞，把可靠传输、有序交付**下沉到用户态按流实现** | [#http3](/fundamentals/network/http#http3) |
| 服务端推送（Server Push）现在还能用吗？ | 基本不能。Chrome 106 起默认移除、Firefox 132 也移除；用 `103 Early Hints` 与 `rel=preload` 替代 | [#http2](/fundamentals/network/http#http2) |
| 一次请求从输入网址到看到页面经历了什么？ | DNS → TCP → TLS → HTTP → 封装；服务端侧还要经过收包、唤醒、调度、拷贝 | [#journey](#journey) |
| 网络不通怎么排查？ | 按层自下而上：地址 → 路由 → 端口 → 应用 → 证书 → 性能，每一步都有对应工具 | [#layers-path](/fundamentals/network/troubleshoot#layers-path) |

> **算法与数据结构一组速查，在该域正文成篇后补入本节。**

### 4.2 操作系统 {#faq-os}

| 问题 | 一句话答案 | 详见 |
|---|---|---|
| 进程和线程的本质区别？ | **进程是资源分配单位（独立地址空间），线程是调度单位（共享地址空间）**；Linux 内核里都是 `task_struct`，区别只在 `clone()` 的 `CLONE_*` 标志 | [#process-vs-thread](/fundamentals/os/process-thread#process-vs-thread) |
| 上下文切换贵在哪？ | 直接成本（存寄存器）是百纳秒级；**真正贵的是切换后缓存与 TLB 变冷**。用 `pidstat -w` 分自愿（在等 IO/锁）与非自愿（被抢占） | [#context-switch](/fundamentals/os/process-thread#context-switch) |
| CFS 和 EEVDF 是什么关系？ | Linux **6.6 起 EEVDF 取代 CFS**（6.12 完成转换）：从"最小虚拟运行时间"改为"**最早合格的虚拟截止时间**"，并能用 `sched_setattr` 请求更短时间片。**CFS 时代的调参经验已作废** | [#cfs-eevdf](/fundamentals/os/process-thread#cfs-eevdf) |
| `load` 高但 CPU 空闲，怎么回事？ | load 把 **D 状态（不可中断睡眠）**也计入——典型是在等磁盘 IO。`ps -eo state,pid,cmd \| awk '$1=="D"'` 找出来 | [#load-avg](/fundamentals/os/process-thread#load-avg) |
| `free` 里 `buff/cache` 很高要不要清？ | 不要。它是**可回收的页缓存**；**只看 `available`**（新版 `free` 的 `used = total − available`） | [#free-columns](/fundamentals/os/memory#free-columns) |
| `write` 成功了数据在哪？ | 在**页缓存**（内存），没落盘。持久化要 `fsync`/`fdatasync`。`dirty_ratio` 超限会让写入者被迫同步回写 | [#dirty-writeback](/fundamentals/os/memory#dirty-writeback) |
| 为什么 Java 进程 RSS 比 `-Xmx` 大？ | 堆外还有**元空间、线程栈（`-Xss`×线程数）、直接内存、Code Cache、GC 结构**。`-Xmx` 一般取 limit 的 60%~75% | [#java-mapping](/fundamentals/os/memory#java-mapping) |
| `epoll` 为什么快？ | `select`/`poll` 每次调用都要**把整个 fd 集合拷进内核 + 线性遍历**；`epoll` 用红黑树存 fd、回调维护就绪链表，**只返回就绪的** | [#select-poll-epoll](/fundamentals/os/io-model#select-poll-epoll) |
| 水平触发和边缘触发怎么选？ | 默认用**水平触发**（没读完还会通知）；边缘触发只通知一次，**必须一次读到 `EAGAIN`**，否则丢事件 | [#et-lt](/fundamentals/os/io-model#et-lt) |
| `epoll` 会被 `io_uring` 取代吗？ | 主流网络服务**目前仍以 `epoll` 为正确默认**；`io_uring` 优势在磁盘+网络统一异步与批量提交，但受内核版本、安全面（容器常默认屏蔽）约束 | [#epoll-vs-uring](/fundamentals/os/io-model#epoll-vs-uring) |
| 删除文件后空间没释放？ | 进程还持有那个 fd，inode 引用计数不为 0。用 `lsof +L1` 查，让应用重新打开文件或清空该 fd | [#space](/fundamentals/os/filesystem#space) |
| 报 `Too many open files` 怎么办？ | 先 `cat /proc/<pid>/limits` 看**进程真实限制**（不是 `ulimit -n`）；区分"泄漏"（单调上升）与"不足"（贴着限制）。注意 **systemd 服务要在 unit 里设 `LimitNOFILE`** | [#fd](/fundamentals/os/filesystem#fd) |
| 线上慢，第一步看什么？ | 先分类：CPU / IO / 内存 / 句柄。用 **PSI**（`/proc/pressure/*`）判饱和度，比使用率准 | [#method](/fundamentals/os/linux-tools#method) |

## 五、阅读建议 {#reading}

| 你的情况 | 建议路径 |
|---|---|
| 想先把"一次请求"讲圆 | [网络分层与封装](/fundamentals/network/tcp-ip) → [TCP 核心机制](/fundamentals/network/tcp) → [HTTP 演进](/fundamentals/network/http) |
| 想搞懂"机器这一侧" | [进程、线程与调度](/fundamentals/os/process-thread) → [虚拟内存与内存管理](/fundamentals/os/memory) → [IO 模型与多路复用](/fundamentals/os/io-model) |
| 线上出问题、要立刻定位 | [网络排查实战](/fundamentals/network/troubleshoot)（数据到没到）→ [Linux 排查实战](/fundamentals/os/linux-tools)（到了之后卡在哪） |
| 要调 JVM 参数 / 解释容器 OOM | [虚拟内存与内存管理](/fundamentals/os/memory) → [落到 Java](/fundamentals/os/memory#java-mapping) |
| 做技术选型（HTTP/2 还是 3、要不要上 QUIC） | [HTTP 演进](/fundamentals/network/http#compare) → [DNS 与 CDN](/fundamentals/network/dns-cdn) |
| 面试前突击 | [高频考点速查](#faq)（背"问→答→详见"，再回正文看推导） |

> **一条通用纪律**：这个板块的每一篇都要能回答**"所以呢"**——知识本身不是目的，它的价值在于能解释某个工程决策。TCP 的 `TIME_WAIT` 讲完必须落到"为什么高并发短连接服务端要 `tcp_tw_reuse`"，拥塞控制讲完必须落到"为什么 RPC 要有超时和退避"。**只有机制、没有落点的章节，是没写完的章节。**
