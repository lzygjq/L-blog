---
date: 2026-09-15
title: Linux 排查实战
order: 5
---

# Linux 排查实战

> 上一篇：[文件系统与文件描述符](/fundamentals/os/filesystem)　|　导览：[操作系统](/fundamentals/os/)

前四篇讲的是机制，这一篇把它们变成**可执行的动作**。

> **和 [网络排查实战](/fundamentals/network/troubleshoot) 的分工**：那篇负责"数据有没有到机器、路上丢没丢"；本篇负责"**到了机器之后，卡在哪**"。排查顺序是先外后内：网络层确认可达、再进来看资源。

**先把结论放前面**：

1. **排查的第一步不是敲命令，而是分类**。"慢"至少有四种成因：**CPU 不够、IO 在等、内存有压力、句柄/连接耗尽**。选错方向，敲再多命令也是浪费。
2. **`load average` 高不等于 CPU 忙**（它含 D 状态），**`iowait` 高也不一定等于磁盘瓶颈**（虚拟化与多核下有统计偏差）。**"高"这个字本身没有意义，要看是哪种资源在饱和。**
3. **判断"饱和"最准的现代指标是 PSI**（`/proc/pressure/`）：它直接告诉你**有多少任务因为资源不够而在等、等了多久**——而不是"资源用了多少"。**CPU 用量 60% 但 PSI 很高，说明确实有人在排队。**
4. **别在没定位前调参数**。`-Xmx`、线程数、连接池、`dirty_ratio` 都是**结果**，不是**手段**。先拿到"瓶颈在哪"的证据，再决定动哪个。

## 一、问题场景：四个方向，先分类 {#why-tools}

线上说"服务变慢了"，你打开终端，第一件事应该是问：**它慢在等什么？** 四种可能性几乎覆盖了绝大多数情况：

| 方向 | 典型现象 | 第一眼该看 |
|---|---|---|
| **CPU 不够** | `us`/`sy` 高、非自愿上下文切换高、load 高且 CPU 也高 | `top`（按 `1` 展开每核）、`pidstat`、`perf top` |
| **IO 在等** | `wa` 高、load 高但 CPU 空、D 状态进程多 | `iostat -x`、`iotop`、`pidstat -d`、`ps -eo state` |
| **内存有压力** | `available` 低、`maj_flt` 涨、`si/so` 非 0、OOMKilled | `free -h`、`vmstat`、cgroup 的 `memory.stat`、`smaps_rollup` |
| **句柄/连接耗尽** | `Too many open files`、新连接建不上 | `ulimit -n`、`lsof -p`、`/proc/<pid>/fd` |

**先从"资源四象限"入手，再往下钻具体进程**，这是最高效的路径：

```text
   ① 系统级：是机器整体的问题，还是单个进程的问题？
        top / vmstat / free / iostat -x / ss -s / /proc/pressure/*
              │
              ▼
   ② 进程级：锁定进程 → 它的哪个线程/哪段代码？
        pidstat -u -r -d -w -t -p <pid> / top -H -p <pid> / perf top -p <pid>
              │
              ▼
   ③ 代码级：是哪一行？
        perf record -g + 火焰图 / async-profiler（Java）/ strace -c
```

> **一条纪律：先看"谁在等"，再看"谁在忙"。** 忙的人不一定有问题（它可能只是在干活），**等的人一定有问题**——因为它被某个资源堵住了。这是下面 PSI 与 D 状态之所以重要的原因。

## 二、方法论：USE 与 PSI {#method}

### 2.1 USE：三个词覆盖全部资源 {#use}

**USE 方法**（Brendan Gregg 提出）对每一种资源都问三个问题：

| 维度 | 含义 | 例子 |
|---|---|---|
| **U**tilization（使用率） | 资源有多少时间在忙 | CPU 使用率、磁盘 `%util` |
| **S**aturation（饱和度） | 有多少工作在**排队等**它 | CPU 运行队列长度、磁盘队列深度 `aqu-sz`、**PSI** |
| **E**rrors（错误） | 有没有出错 | `dmesg`、网卡丢包、`nstat` 重传计数 |

**为什么"使用率"经常骗人**：**一个 100% 使用的单核磁盘可能是健康的（它在满速干活），而一个 30% 使用的资源可能已经严重排队**（比如 8 核机上负载 30 的磁盘队列）。**饱和度才是决定延迟的那个量。**

### 2.2 PSI：直接度量"等待" {#psi}

**PSI（Pressure Stall Information，Linux 4.20+）**是目前判断饱和度最直接的指标——**它不告诉你资源用了多少，而是告诉你"有多少任务因为资源不足被卡住了、卡了多久"**：

```bash
cat /proc/pressure/cpu; cat /proc/pressure/memory; cat /proc/pressure/io

# some avg10=0.00 avg60=0.00 avg300=0.00 total=1234567
# full avg10=0.00 avg60=0.00 avg300=0.00 total=7654321
```

| 字段 | 含义 |
|---|---|
| **`some`** | **至少有一个**任务因为该资源而停顿的时间占比 |
| **`full`** | **所有**任务都被卡住的时间占比（只在 memory 与 io 上有意义；**CPU 是 `full` 恒为 0**，因为总有某个任务能跑） |
| `avg10/60/300` | 最近 10/60/300 秒的平均占比 |
| `total` | 累计微秒数 |

**读法与三个例子**：

| 观察 | 结论 |
|---|---|
| CPU `some` 很高 | 有任务在等 CPU，**真的不够分** → 减线程或加核 |
| **memory `full` 上升** | 所有任务都因为等内存而停过 → **已经在直接回收或快 OOM 了**，这是最危险的信号 |
| IO `some` 高但 `full` 低 | 部分任务在等 IO（通常是后台任务），业务可能没受影响 |
| **CPU 使用率不高、但 CPU `some` 高** | 典型的"被限流"或"线程都在等锁/等 IO，一有 CPU 就抢"——**这是只看使用率会漏掉的场景** |

**K8s 里 PSI 同样可用**（cgroup v2）：`/sys/fs/cgroup/<path>/cpu.pressure`、`memory.pressure`、`io.pressure`。**如果你想给 Pod 做"真实压力"的告警，PSI 比 CPU 使用率靠谱得多。**

### 2.3 `load average` 与 `iowait` 的两个陷阱 {#traps}

**陷阱一：load 含 D 状态**

```bash
uptime                       # load average: 12.50, 4.20, 1.80
ps -eo state,pid,cmd | awk '$1=="D"' | head     # 找出 D 状态进程
# D = 不可中断睡眠（典型是等磁盘 IO）
```

**load 高而 CPU 空 → 直接去查 D 状态进程与 IO**，不要加 CPU（见 [load average 的陷阱](/fundamentals/os/process-thread#load-avg)）。

**陷阱二：`iowait` 高不一定代表磁盘是瓶颈**

| 情况 | 说明 |
|---|---|
| 多核机器上 `iowait` 的统计口径 | 它是"**CPU 空闲且同时有未完成的磁盘 IO**"的时间。**单核跑满时，即使 IO 很慢，`iowait` 也不会高**——因为 CPU 没空 |
| 虚拟化环境 | 宿主机对其他 VM 的服务时间会被算进来，`%util` 与 `iowait` 都可能失真 |
| 判断方法 | **别只看 `iowait`，要看 `iostat -x` 的 `await`（平均等待）与 `aqu-sz`（队列深度）**，并对照应用的延迟指标 |

## 三、工具链速查 {#toolchain}

### 3.1 系统级：一眼看全貌 {#system-level}

```bash
# 一屏看全：CPU / 内存 / swap / IO / 上下文切换 / 进程（r、b 两列最有用）
vmstat 1
#  r  = 可运行队列长度（> 核数说明 CPU 排队）
#  b  = 阻塞（不可中断睡眠）进程数 ← **IO 问题的第一信号**
#  si/so = 换入换出（持续非 0 = 在拿磁盘当内存）
#  us/sy/id/wa = 用户态 / 内核态 / 空闲 / IO 等待
#  cs = 上下文切换次数

# 每核使用率 + 各类中断
mpstat -P ALL 1
#  %irq（硬中断）/ %soft（软中断）高 → 网络收包或设备中断压力

# 磁盘吞吐、延迟、队列、利用率
iostat -xz 1
#  await     = 平均等待时间（含排队）← **延迟的直接指标**
#  aqu-sz    = 平均队列深度 ← **饱和度的直接指标**
#  %util     = 有请求在处理的时间占比（**不是"繁忙度"**，NVMe 上会误导）
#  r/s w/s   = 每秒读写次数；rkB/s wkB/s = 吞吐
#  %rrqm %wrqm = 被合并的请求比例（机械盘上越高越好）

# 全局压力（现代方法，优先级高于 load）
cat /proc/pressure/{cpu,memory,io}

# 内核报错、OOM、磁盘/网卡异常
dmesg -T | tail -50
```

### 3.2 进程级：锁到进程与线程 {#process-level}

```bash
# 综合：CPU / 内存 / IO / 上下文切换 / 线程，一把梭
pidstat -u -r -d -w -t -p <pid> 1

# 每个线程的 CPU（找"哪个线程在烧 CPU"）
top -H -p <pid>
pidstat -t -p <pid> 1

# 进程状态分布（找 D 状态）
ps -eo state,pid,ppid,etime,cmd | awk '$1=="D"'

# 系统调用层面：谁在反复调什么（-c 是统计模式，开销比逐行小）
strace -c -p <pid>          # 注意：strace 会显著拖慢目标进程，生产慎用；先短时间采样
strace -f -e trace=network -p <pid>

# 打开的文件与 fd
lsof -p <pid>
ls -l /proc/<pid>/fd | wc -l
```

### 3.3 内存：分清"哪一类" {#memory-tools}

```bash
free -h                     # **只看 available 列**
vmstat 1                    # si/so、maj_flt 相关
cat /proc/<pid>/status | grep -E "VmRSS|VmSwap|Threads"
cat /proc/<pid>/smaps_rollup   # Pss / Private_Dirty / Anonymous ← 比 RSS 更准
pmap -x <pid> | tail -1     # 内存段汇总
slabtop -s c                # 内核 slab 占用（内核态内存泄漏时用）
```

**Java 专门的工具链**（内存问题的第一现场）：

```bash
jcmd <pid> VM.native_memory summary     # 需启动时加 -XX:NativeMemoryTracking=summary
jcmd <pid> GC.heap_info                 # 堆使用情况
jmap -histo:live <pid> | head -20       # 活对象直方图（会触发 Full GC，慎用）
jstat -gcutil <pid> 1000                # GC 频率与各代占比
jstack -l <pid> > /tmp/stack.txt        # 线程栈（找死锁、找阻塞）
jcmd <pid> Thread.print -l              # 同上（推荐用 jcmd）
```

### 3.4 网络与句柄 {#net-tools}

```bash
ss -s                       # 汇总（比 netstat 快，netstat 读 /proc 逐行拼，连接上万时会拖慢机器）
ss -lntp                    # 监听端口 + 进程
ss -ant state time-wait | wc -l    # TIME_WAIT 数量
ss -tan | awk 'NR>1 {print $1}' | sort | uniq -c   # 各状态连接数分布

nstat -az                   # 协议栈计数器（重传、丢包）
cat /proc/sys/fs/file-nr    # 系统级 fd：已分配 / 未使用 / 上限
lsof +L1                    # 已删除但仍被打开的文件（见 [空间没释放](/fundamentals/os/filesystem#space)）
```

## 四、四个经典场景 {#cases}

### 4.1 场景一：CPU 高 {#case-cpu}

**第一步：分清用户态还是内核态。**

```text
   us 高 ──▶ 应用在自己算（死循环、正则回溯、序列化、加密、GC）
   sy 高 ──▶ 系统调用/内核路径（频繁 IO 小读写、锁竞争、【上下文切换过多】、
                                syscall 过多、软中断）
   si 高 ──▶ 网络软中断（收包量大）→ 见 [网络收包路径](/fundamentals/os/io-model#recv-path)
   wa 高 ──▶ 不是 CPU 问题，去 场景三
```

**第二步：锁定线程，再看代码。**

```bash
top -H -p <pid>                          # ① 找到烧 CPU 的线程 ID（十进制）
printf "%x\n" <tid>                      # ② 转十六进制
jstack <pid> | grep -A 20 "nid=0x<hex>"  # ③ 在栈里找到它 ← Java 经典三步
```

**第三步：没有明确嫌疑时，用火焰图。**

```bash
# on-CPU 火焰图：看 CPU 时间花在哪些调用栈上
perf record -F 99 -g -p <pid> -- sleep 30
perf script | stackcollapse-perf.pl | flamegraph.pl > cpu.svg

# Java 用 async-profiler（不依赖 perf 符号，且能看到 Java 栈）
./asprof -d 30 -e cpu -f cpu.html <pid>
```

**Java 场景下必查的一项**：**GC**。`jstat -gcutil <pid> 1000` 看 `FGC`（Full GC 次数）与 `GCT`（累计 GC 时间）。**"CPU 高"里有相当一部分其实是 GC 线程在拼命回收**——此时该动的是堆与 GC 参数，不是业务代码。

```bash
# 快速判断：连续采样 10 次，看 Full GC 次数是否在涨
jstat -gcutil <pid> 1000 10 | awk '{print $1, $7, $8, $NF}'
```

| CPU 高的常见成因 | 证据 | 方向 |
|---|---|---|
| 业务计算密集 / 死循环 | `us` 高、火焰图集中在某个方法 | 优化算法或降负载 |
| **GC 频繁 / Full GC** | `jstat` 的 `FGC` 增长、`GCT` 占比高 | 堆太小 / 泄漏 / 参数不当 |
| 锁竞争 | `sy` 高 + 线程大量 `BLOCKED`（`jstack` 可见） | 缩小锁粒度 / 无锁结构 |
| 系统调用过多 | `sy` 高 + `strace -c` 显示某 syscall 次数巨大 | 批量化、减少小 IO |
| 软中断（网络） | `si` 高、`ksoftirqd` 单核跑满 | 多队列网卡 / `SO_REUSEPORT` |
| **被 cgroup 限流** | CPU 使用率不高但 `cpu.stat` 的 `nr_throttled` > 0 | 提 limit（见 [CPU 限流](/fundamentals/os/process-thread#throttling)） |

### 4.2 场景二：内存持续上涨 {#case-memory}

**第一步：先确认是"涨到哪去了"，别急着说泄漏。**

| 现象 | 判断 |
|---|---|
| `available` 稳定、只有 `buff/cache` 涨 | **正常**，是页缓存在工作（[§6.1](/fundamentals/os/memory#free-columns)） |
| **RSS 单调上涨且不回落** | 疑似泄漏，继续往下查 |
| `maj_flt` 持续增长 + `si/so` 非 0 | 已在换页，内存真的不够 |
| cgroup `memory.events` 里 `oom_kill` 增长 | **已被内核杀过**，方向是"降总 RSS 或加 limit" |

**第二步：分清"堆内"还是"堆外"（Java 场景）。**

```text
   RSS 涨
     │
     ├─ 堆在涨（jcmd GC.heap_info / jstat 的 O 与 OU 列）→ **堆内**：
     │     └─ 对象泄漏 → jmap -histo:live 找增长最快的类 → 堆转储分析支配树
     │
     └─ 堆是稳的，RSS 还在涨 → **堆外**：
           ├─ 元空间（jstat -gc 看 MU/MC）：动态类生成过多（反射、CGLIB、脚本、热部署）
           ├─ 线程数（Threads 字段）：线程泄漏 ← **每个线程还有 1MB 栈**
           ├─ 直接内存（Netty、NIO、Kafka 客户端）
           ├─ Code Cache（JIT 生成的代码）
           └─ GC 结构 / JVM 自身
           → 用 jcmd VM.native_memory summary 直接看分布（**这是最有效的一步**）
```

**第三步：非 Java / 混合场景。** `pmap -x <pid> | sort -k3 -n | tail` 看哪些内存段在涨；`smaps_rollup` 看 `Private_Dirty`（真正独占的内存）；`slabtop` 查内核 slab。

### 4.3 场景三：IO 等待 {#case-io}

**触发信号**：`wa` 高、**`b`（阻塞进程数）> 0**、load 高而 CPU 空、D 状态进程多、应用日志里出现超时。

```bash
# ① 是哪个设备在慢？
iostat -xz 1
#   await 高 + aqu-sz 高 → 该设备确实饱和
#   await 高 + aqu-sz 低 → 少量请求就很慢（可能是单次 IO 大、或设备本身异常）

# ② 是哪个进程在读写？
iotop -oPa                 # -o 只显示有 IO 的，-P 按进程，-a 累计
pidstat -d 1               # 每个进程的读写速率
 
# ③ 是读还是写？是随机还是顺序？
#   顺序大 IO  → 通常是备份、日志回放、文件拷贝（影响可控）
#   随机小 IO  → 通常是数据库、索引更新（最容易打满磁盘）

# ④ 内存压力导致的 IO 也要考虑（换页 / 直接回收）
vmstat 1                   # si/so 非 0 → 是 swap 造成的 IO，不是业务 IO
grep -E "allocstall|pgscan_direct" /proc/vmstat
```

| 常见成因 | 证据 | 方向 |
|---|---|---|
| 数据库缓冲池不足，频繁读盘 | `iostat` 读多、`maj_flt` 涨 | 加内存 / 调 buffer pool |
| 大批量导入/备份 | `iostat` 写吞吐高、进程可定位 | 错峰 / 限流 |
| **内存不足触发直接回收与换页** | `si/so` 非 0、`allocstall` 增长 | **这不是 IO 问题，是内存问题** |
| 日志同步写（`fsync` 频繁） | 大量小写 + `await` 高 | 批量提交（见 [脏页回写](/fundamentals/os/memory#dirty-writeback)） |
| 磁盘本身故障/坏道 | `dmesg` 有 IO error、`await` 异常 | 换盘 |

> **一个关键分叉**：`wa` 高时必须先问"**这些 IO 是业务产生的，还是内存压力产生的？**"——`si/so` 非 0 就说明是后者，此时优化 SQL 没用，得加内存。

### 4.4 场景四：句柄/连接耗尽 {#case-fd}

**信号**：`Too many open files`、新连接建不上、日志里 `EMFILE`。

```bash
# ① 确认限制
ulimit -n                      # 当前 shell（对已运行进程无效）
cat /proc/<pid>/limits | grep "open files"    # **进程实际的软/硬限制**
# ② 确认用了多少
ls /proc/<pid>/fd | wc -l
lsof -p <pid> | wc -l
# ③ 看是什么类型
lsof -p <pid> | awk '{print $5}' | sort | uniq -c | sort -rn
# ④ 是否是"删了没释放"
lsof +L1
# ⑤ 系统级是否到顶
cat /proc/sys/fs/file-nr
```

| 成因 | 判断 | 方向 |
|---|---|---|
| 应用限制了（`ulimit -n` 太低） | `/proc/<pid>/limits` 与句柄总数接近 | 提高限制（**注意 systemd 服务的 `LimitNOFILE`**） |
| fd 泄漏 | 数量**单调上升不回落** | 查异常路径漏 `close`（见 [fd 泄漏](/fundamentals/os/filesystem#fd-leak)） |
| 连接池配置过小 + 并发过高 | 数量稳定在限制附近、伴随等待 | 调连接池 / 加实例 |
| 被删除文件占着 fd | `lsof +L1` 有输出 | 让应用重新打开文件 |
| 系统级上限 | `/proc/sys/fs/file-nr` 第一列接近第三列 | 调 `fs.file-max` |

## 五、对比辨析 {#compare}

| 对比 | 关键差异 | 记忆锚点 |
|---|---|---|
| 使用率 vs 饱和度 | 忙不忙 vs 有没有排队 | **决定延迟的是饱和度** |
| `load average` vs CPU 使用率 | 含 D 状态 vs 只算实际占用 | load 高 CPU 空 → 查 IO |
| `%util` vs `aqu-sz` | 有请求处理的时间占比 vs 队列深度 | **NVMe 上 `%util` 会骗人** |
| `iowait` vs 真实 IO 瓶颈 | 口径受核数与虚拟化影响 | 要对照 `await` |
| `RSS` vs `PSS` | 共享内存重复计算 vs 按份分摊 | 多进程共享时 RSS 虚高 |
| 堆内泄漏 vs 堆外泄漏 | `jmap -histo:live` 可见 vs 要看 `VM.native_memory` | **堆外常见：元空间、线程栈、直接内存** |
| 业务 IO vs 换页 IO | `si/so` 为 0 vs `si/so` 非 0 | **后者优化 SQL 没用，要加内存** |
| fd 泄漏 vs fd 不足 | 单调上升 vs 稳定在限制附近 | 前者改代码，后者调限制 |
| `strace` vs `perf` | 系统调用视角、开销大 vs 采样、开销小 | 生产优先用 perf / async-profiler |

## 六、使用场景与面试问答 {#interview}

- **线上变慢的排查顺序**：**先分类再选工具**——CPU 不够 / IO 在等 / 内存有压力 / 句柄耗尽。系统级用 `vmstat`、`top`、`iostat -xz`、`ss -s`、`/proc/pressure/*`；进程级用 `pidstat`、`top -H -p`；代码级用 `perf record` + 火焰图或 `async-profiler`。**准则是"先看谁在等，再看谁在忙"。**
- **USE 方法**：对每种资源问 **使用率（Utilization）、饱和度（Saturation）、错误（Errors）**。**关键认知：决定延迟的是饱和度不是使用率**——一个 30% 使用但队列很深的资源，比一个 100% 使用但有秩序的资源更糟。
- **PSI 是什么、为什么比使用率好**：`/proc/pressure/{cpu,memory,io}` 直接给出"**有多少任务因为资源不足而停顿、停了多久**"。`some` 表示至少有一个任务被卡，`full` 表示所有任务都被卡（**CPU 的 `full` 恒为 0**）。**典型用法：CPU 使用率不高但 CPU `some` 高 → 说明有排队（线程在抢或都在等别的资源），这是只看使用率会漏掉的场景**；`memory full` 上升则意味着已经在直接回收或逼近 OOM。K8s 里可用 cgroup v2 的 `cpu.pressure` 等做更真实的压力告警。
- **`load average` 高怎么查**：load 统计**可运行 + 不可中断睡眠（D）**的任务。**load 高而 CPU 使用率低 → 直接 `ps -eo state,pid,cmd | awk '$1=="D"'` 找 D 状态进程，去查 IO**（或 NFS 卡住之类）。此时加 CPU 完全无效。
- **`iowait` 高就是磁盘瓶颈吗**：**不一定**。`iowait` 表示"CPU 空闲且同时有未完成磁盘 IO"，**单核跑满时它反而不会高**；虚拟化环境下宿主机对其他 VM 的服务时间也会被算进来。**要结合 `iostat -x` 的 `await`（平均等待）与 `aqu-sz`（队列深度）判断**，并对照应用延迟。
- **`iostat` 里 `%util` 与 `await`、`aqu-sz` 怎么读**：`await` 是含排队的平均等待时间（**延迟的直接指标**）；`aqu-sz` 是平均队列深度（**饱和度的直接指标**）；**`%util` 是"设备有请求在处理的时间占比"，不是繁忙度——对能并行的 NVMe，`%util` 接近 100% 不代表饱和。**
- **CPU 高怎么定位到代码**：`us` 高是应用在算（含 GC），`sy` 高是内核路径（系统调用、锁竞争、上下文切换），`si` 高是网络软中断。**Java 三步：`top -H -p` 找线程 ID → 转十六进制 → `jstack | grep nid=0x…`**。没有明确嫌疑就用**火焰图**（`perf record -F 99 -g` + FlameGraph，或用 `async-profiler` 直接看 Java 栈）。**别忘了先看 GC**：`jstat -gcutil` 的 `FGC`/`GCT` 往往是"CPU 高"的真凶。
- **内存持续上涨怎么判断是不是泄漏**：先分清**缓存增长（`buff/cache`，正常）**与 **RSS 单调上涨（疑似泄漏）**。Java 场景分两步：**堆在涨**（`jcmd GC.heap_info` / `jstat`）→ 对象泄漏，用 `jmap -histo:live` + 堆转储；**堆稳定但 RSS 涨** → 堆外，查**元空间（动态类生成）、线程数（线程泄漏，每线程还有 1MB 栈）、直接内存、Code Cache**，最有效的工具是 **`-XX:NativeMemoryTracking=summary` + `jcmd VM.native_memory summary`**。
- **IO 等待高怎么查**：`iostat -xz` 定位设备（`await` + `aqu-sz`）、`iotop -oPa` / `pidstat -d` 定位进程、区分**顺序大 IO（备份/回放）**与**随机小 IO（数据库）**。**最关键的分叉是：`vmstat` 的 `si/so` 是否非 0——非 0 说明这些 IO 是换页/直接回收造成的，属于内存问题，优化 SQL 无效。**
- **句柄耗尽的排查**：`cat /proc/<pid>/limits` 看进程真实限制（**不是 `ulimit -n`**，那只对当前 shell 有效）、`ls /proc/<pid>/fd | wc -l` 看用量、`lsof -p` 按类型分布、`lsof +L1` 查已删除但仍被打开的文件、`/proc/sys/fs/file-nr` 看系统级。**区分"泄漏"（单调上升）与"不足"（稳定在限制附近）**，前者改代码、后者调限制——**注意 systemd 服务要在 unit 里设 `LimitNOFILE`**。
- **Java 应用排查该看哪一层**：本篇是**机器视角**——回答"是不是这个进程、哪类资源饱和"。**进了 JVM 内部**（GC 在干什么、线程卡在哪一行、堆里是谁在持有对象、时间花在哪个方法）要看 [Java 虚拟机 · 实操线](/java/jvm/)四篇：[JDK 命令行排查](/java/jvm/troubleshooting-cli)（jstat / jstack / jmap 的判读）、[堆转储与 MAT 分析](/java/jvm/heap-dump-analysis)、[Arthas 在线诊断](/java/jvm/online-diagnostics)、[火焰图与性能剖析](/java/jvm/profiling)（含 off-CPU 视角——**"CPU 不高但接口慢"就靠它**）。
- **生产上为什么慎用 `strace`**：它会让目标进程**每次系统调用都停下来等 tracer**，开销可能让性能下降数倍。**优先用 `perf`、`async-profiler` 这类采样工具**；必须用 `strace` 时用 `-c` 统计模式并**短时间采样**。
- **一条最重要的纪律**：**先定位、后调参**。`-Xmx`、线程数、连接池、`dirty_ratio`、`swappiness` 都是**对结论的响应**，不是排查手段。没有证据就调参数，只是把问题从"可诊断"变成"不可复现"。