---
order: 6
date: 2026-09-16
title: JDK 命令行排查
desc: 五件套的分工与开销对比、jps 看不到进程的三种原因、jstat 十列含义与 GC 原因判读（GCT 健康线）、jstack 线程栈的六种形态与三次采样法、jmap 四模式取舍与大堆转储的现实问题、jcmd 与 jinfo 的动态改参救火、一张完整的排查路径决策树
---

# JDK 命令行排查：五件套的输出怎么读

> 上一篇：[调优与线上排查](/java/jvm/tuning)　|　导览：[Java 虚拟机](/java/jvm/)

[调优与线上排查](/java/jvm/tuning) 给过一张工具速查表——那一张解决「**用哪个**」；这一篇解决「**输出怎么读**」。

> **和 [Linux 排查实战](/fundamentals/os/linux-tools) 的分工**：那篇从**机器**角度看（进程在不在、CPU/IO/内存哪类资源饱和）；本篇从 **JVM 内部**看（GC 在干什么、线程卡在哪一行、堆里是谁）。**顺序是先外后内**——先用 Linux 工具确认是这个进程的问题，再进来用 JDK 工具定位到代码。

**先把结论放前面**：

1. **会敲命令不值钱，会读输出才值钱。** `jstack` 一次输出几百行——能从里面指出「这是锁竞争不是死锁」「这是等数据库不是死循环」才叫会排查。
2. **`RUNNABLE` 不等于在烧 CPU。** `socketRead0` 的线程状态也是 `RUNNABLE`，它其实在等网络。**这是新手判读的第一大坑**（见 [§4.5](#stack-external)）。
3. **单次快照几乎没有诊断价值。** 快照是横截面，「正好路过」和「长期卡住」长得一模一样。**间隔 3~5 秒连拍三次，看栈有没有变。**
4. **`jstat -gcutil` 的 `E`/`O`/`M` 是百分比，不是字节。** 要绝对值得用 `-gc`。

> 下文的所有输出样本以 **JDK 8 / JDK 17 + G1** 为例。不同版本的行格式略有差异，列的含义不变。

## 一、五件套的分工与开销 {#division}

先分清各自回答什么问题，以及**能不能在生产上随手跑**——这一步选错，后面全白干。

| 工具 | 回答什么问题 | 开销 | 生产可用性 |
|---|---|---|---|
| `jps` | 进程在哪、PID 多少 | 读共享内存 | ✅ 随意用 |
| `jstat` | GC 在干什么、频率多高、占多少时间 | 读共享内存 | ✅ **建议长期采样** |
| `jstack` | 线程此刻在干什么 | 一次 STW（毫秒级） | ✅ 常用，但别高频刷 |
| `jmap -heap` / `-histo` | 堆里有哪类对象、各占多少 | `-histo` 短 STW | ⚠️ `-histo` 可接受 |
| `jmap -histo:live` / `-dump` | 活对象、全量堆转储 | **Full GC / 长 STW** | ❌ **必须评估**（见 [§5](#jmap)） |
| `jcmd` | 上面全部 + 堆外内存、JFR | 视子命令 | ✅ 优先入口 |
| `jinfo` | 运行时参数是什么、能否改 | 极轻 | ✅ 随意用 |

**一句话记忆**：**先 `jstat` 分岔（是不是 GC），再 `jstack` 定位（线程卡在哪），`jmap` 是最后手段（堆里是谁）。**

## 二、jps：先找到进程 {#jps}

```bash
jps -l        # PID + 主类全名 / jar 路径  ← 最常用
jps -lvm      # 再加 JVM 参数（-v）与 main 参数（-m）
jps -q        # 只输出 PID，便于管道
```

**两个容易踩的点**：

- `jps -v` 给的是 **JVM 参数**，`-jar` 后面的 **main 参数要 `-m`**。查"服务到底用了哪个 profile"要用 `-m`。
- `jps` 默认**只列同一用户的进程**。看不到时的三种原因：① 进程属于别的用户（`sudo -u <owner> jps` 或直接用 root）；② 在容器里（PID namespace 隔离，得 `docker exec` / `kubectl exec` 进容器看）；③ JVM 启动时加了 `-XX:-UsePerfData`，或镜像是被裁剪过的 JRE。

**兜底手段**：`ps -ef | grep java` 一定看得到（代价是要自己过滤掉 grep 自身），`jcmd` 不带参数的效果等同 `jps`。

## 三、jstat：先判断「是不是 GC 的锅」 {#jstat}

**这是整个排查流程的分岔点。** 线上 CPU 高、接口变慢、内存上涨——**先花 10 秒看一眼 GC**，能挡掉相当一部分无效排查。

```bash
jstat -gcutil <pid> 1000 10      # 每秒一行，共 10 行
```

```text
  S0     S1     E      O      M     CCS    YGC     YGCT    FGC    FGCT     GCT
  0.00  96.88  21.34  78.42  95.14  92.87     12    0.180     2    0.150    0.330
```

### 3.1 十列分别是什么 {#jstat-columns}

| 列 | 含义 | 单位 |
|---|---|---|
| `S0` / `S1` | 两个 Survivor 区的**使用率** | % |
| `E` | **Eden 区使用率** | % |
| `O` | **老年代使用率** | % |
| `M` | **元空间使用率** | % |
| `CCS` | 压缩类空间使用率（开启压缩指针时才有） | % |
| `YGC` / `YGCT` | 新生代 GC **次数** / 累计**耗时** | 次 / 秒 |
| `FGC` / `FGCT` | Full GC **次数** / 累计**耗时** | 次 / 秒 |
| `GCT` | 总 GC 耗时（= `YGCT` + `FGCT`） | 秒 |

> **最常见的误读**：把 `E` 当成"Eden 用了多少 MB"。它是**百分比**。想要绝对值（KB）用 `jstat -gc <pid> 1000`，那一组列是 `S0C/S0U/EC/EU/OC/OU...`（`C` = capacity，`U` = used）。

### 3.2 判读三招 {#jstat-read}

| 观察 | 结论 | 动作 |
|---|---|---|
| **`FGC` 在涨，但 `O` 每次都降不下来** | 老年代确实回收不掉 → **泄漏确诊**（或堆就是不够） | 转堆转储分析，见[堆转储与 MAT 分析](/java/jvm/heap-dump-analysis) |
| **`YGC` 涨得飞快（几秒一次）、`YGCT` 占比高** | 新生代太小，或**分配速率太高**（短命大对象多） | 先查是不是有大对象/大集合的频繁创建，再考虑调新生代 |
| **`GCT` 占总运行时间的比例高** | 直接指向"CPU 高"的真凶 | **5% 是健康线，超过 10% 是明确的调优信号** |

**第三招最容易被忽略**：`GCT` 是**累计值**，要除以进程运行时长（`uptime` 或两次采样相减）才得到占比。很多人看到 `GCT=330` 秒就慌了，其实进程已经跑了 10 小时——占比不到 1%。

### 3.3 `-gccause`：找到「为什么触发」 {#gccause}

比 `-gcutil` 多两列，**这两列在排查时经常一击命中**：

```bash
jstat -gccause <pid> 1000
# LGCC = 上一次 GC 的原因，GCC = 当前 GC 的原因
```

| 原因 | 含义 | 处置 |
|---|---|---|
| `Allocation Failure` | 分配空间不足（**最常见，正常**） | 无需动作 |
| `Metadata GC Threshold` | 元空间达到阈值被触发 | 查动态类生成（反射 / CGLIB / 脚本引擎），调大 `MetaspaceSize` |
| `Heap Inspection` | **有人跑了 `jmap -histo:live` 或 `GC.class_histogram`** | 知道就行了——**排查时最尴尬的一种**：找不到 Full GC 的原因，结果是自己上一轮命令造成的 |
| `System.gc()` | 代码或框架显式调用 | 查 RMI / JMX / 中间件；加 `-XX:+ExplicitGCInvokesConcurrent` 让显式 GC 走并发 |
| `Ergonomics` | JVM 自适应决策触发 | 通常伴随 GC 目标的调整，一般无需动作 |

### 3.4 其他常用子命令 {#jstat-others}

| 命令 | 看什么 |
|---|---|
| `jstat -gc <pid> 1000` | **各分区容量与使用量（KB）**——要绝对值时用它 |
| `jstat -gccapacity <pid>` | 各分区的容量与上限（判断"能不能涨"） |
| `jstat -class <pid> 1000` | 已加载/卸载类数、类加载耗时（类加载泄漏的入口） |
| `jstat -compiler <pid>` | JIT 编译的统计（**怀疑"代码没被编译、一直在解释执行"时看**） |
| `jstat -t <pid> ...` | 前置一列时间戳 |

**采样纪律**：一定要给次数（或自己 Ctrl-C）。`jstat -gcutil <pid> 100` 这种间隔会输出巨量内容，反而淹没信号。

## 四、jstack：读线程栈的六种形态 {#jstack}

`jstack` 的价值不在"能不能拿到栈"，而在**能不能从栈里读出结论**。先记住四个开关：

| 参数 | 作用 | 何时用 |
|---|---|---|
| `-l` | 额外打印 **ownable synchronizers** | **找 `ReentrantLock` / AQS 类锁的持有者必须加**（不加就看不到它们的锁信息） |
| `-F` | 进程无响应时强制转储（直接对目标发信号） | `jstack` 卡住不动时；**会让目标短暂挂起，慎用** |
| `-m` | 混合栈（Java 帧 + native 帧） | 需要看 native 层调用时 |
| `-e` | 扩展信息（JDK 14+） | 需要更多上下文时 |

### 4.1 形态一：死锁——不用人眼看环 {#stack-deadlock}

**JVM 会自己检测并打印出来。** 直接搜关键词即可：

```text
Found one Java-level deadlock:
=============================
"pool-1-thread-2":
  waiting to lock monitor 0x00007f8a4c0063a8 (object 0x000000076b0a8b40, a java.lang.Object),
  which is held by "pool-1-thread-1"
"pool-1-thread-1":
  waiting to lock monitor 0x00007f8a4c004e08 (object 0x000000076b0a8b30, a java.lang.Object),
  which is held by "pool-1-thread-2"

Found 1 deadlock.
```

**判据**：输出末尾出现 `Found N deadlock.`。**没有这一行就不是死锁**——不要靠"看到两个线程互相等"来脑补，那种环在几百行栈里看错是常事。

> 死锁检测覆盖**对象监视器**与 **ownable synchronizer**，后者需要 `-l`。所以排查疑似死锁时，`jstack -l` 是正确姿势。

### 4.2 形态二：锁竞争——找「持有者」而不是「等待者」 {#stack-lock}

```text
"http-nio-8080-exec-23" #187 daemon prio=5 os_prio=0 tid=0x00007f8a3c1c2000 nid=0x3f2b waiting for monitor entry [0x00007f8a1d5ed000]
   java.lang.Thread.State: BLOCKED (on object monitor)
	at com.demo.OrderService.calcTotal(OrderService.java:88)
	- waiting to lock <0x000000076b0a8b40> (a com.demo.PriceCache)
	at com.demo.OrderController.submit(OrderController.java:42)
```

**判据**：**大量线程处于 `BLOCKED (on object monitor)`，且 `waiting to lock` 指向同一个地址。**

**下一步才是关键**：拿这个地址回栈里搜 `locked <0x000000076b0a8b40>`——**找到持有者，看它在干什么**。持有者往往不是"算得慢"，而是**它在锁里做了一次远程调用或一次慢查询**。这才是根因。

> **必须区分 `BLOCKED` 与 `WAITING`**：`BLOCKED` 是**抢不到锁**（synchronized 入口）；`WAITING (parking)` + `- parking to wait for <...>` 是**在等条件/队列**。两者长得像，成因和处置完全不同——把等待队列当成锁竞争，会去优化一个根本不存在的锁。

### 4.3 形态三：线程池的「空闲」与「打满」 {#stack-pool}

```text
"pool-1-thread-3" #24 prio=5 os_prio=0 tid=0x00007f8a3c1a8000 nid=0x3d10 waiting on condition [0x00007f8a1dee0000]
   java.lang.Thread.State: WAITING (parking)
	at sun.misc.Unsafe.park(Native Method)
	- parking to wait for  <0x000000076b0c0e20> (a java.util.concurrent.locks.AbstractQueuedSynchronizer$ConditionObject)
	at java.util.concurrent.LinkedBlockingQueue.take(LinkedBlockingQueue.java:442)
	at java.util.concurrent.ThreadPoolExecutor.getTask(ThreadPoolExecutor.java:1074)
```

**这段栈是「空闲的池线程在等任务」，完全正常。** 一个线程池即使什么都不干，也会有 `corePoolSize` 个这样的线程在 `take` 上挂着。

**真正的问题形态是另外两种**，从栈上要分开看：

| 现象 | 栈的特征 | 说明 |
|---|---|---|
| **调用方在等任务结果** | Tomcat worker 停在 `FutureTask.get` / `CompletableFuture.join` | 池里的任务出不来 → 要么任务慢、要么池子被占满 |
| **提交任务被阻塞** | 提交线程停在 `LinkedBlockingQueue.put` | **有界队列满了**，说明消费速率长期跟不上 |
| **空闲**（本次要排除的） | 池线程停在 `ThreadPoolExecutor.getTask` → `take` | 正常，不是问题 |

**操作口径**：先数一遍"停在 `getTask` 的线程数"，这些是**空闲**的，直接从嫌疑名单里划掉；剩下的才逐个看。**不要一上来就说"线程池打满了"——多数情况只是看到了那批本该空闲的线程。**

### 4.4 形态四：死循环 / 热点计算 {#stack-loop}

```text
"pool-1-thread-1" #21 prio=5 os_prio=0 tid=0x00007f8a3c28f000 nid=0x3c2a runnable [0x00007f8a1e2e0000]
   java.lang.Thread.State: RUNNABLE
	at com.demo.BigCalc.hash(BigCalc.java:57)
	at com.demo.BigCalc.loop(BigCalc.java:41)
```

**判据：必须"多次采样都停在同一行"。** 单次看到 `RUNNABLE` 只能说明"此刻在执行"，正常服务里 `RUNNABLE` 线程一直都有。把它和"CPU 高"联系在一起，需要两点证据：**这个线程的 nid 与 `top -H -p` 里的高 CPU 线程对上 + 三次采样栈顶不变**。

### 4.5 形态五：等外部资源——最容易被误读的一种 {#stack-external}

```text
"http-nio-8080-exec-7" #98 daemon prio=5 os_prio=0 tid=0x00007f8a3c1d6000 nid=0x3e15 runnable [0x00007f8a1d7e0000]
   java.lang.Thread.State: RUNNABLE
	at java.net.SocketInputStream.socketRead0(Native Method)
	at java.net.SocketInputStream.read(SocketInputStream.java:171)
	...
	at com.mysql.jdbc.MysqlIO.readFully(MysqlIO.java:2981)
```

**线程状态是 `RUNNABLE`，但它其实在等网络 IO。** 这是 JDK 的实现细节——native 的阻塞读不改变线程状态。

**判据**：栈顶出现 `socketRead0` / `socketWrite0` / `FileDispatcherImpl.read0` 这类 native IO → **不是 CPU 问题**，是下游慢或连接池不够。而且**从栈里的包名能直接看出是哪个下游**（`MysqlIO` 是数据库、`HttpClient` 是 HTTP 依赖、`Jedis` 是 Redis）。

**这一类数量多时，方向应该从"优化本服务代码"转成"查下游 + 查连接池配置"。** 在栈里被误判成 CPU 密集，是排查走偏的常见原因。

### 4.6 形态六：正常空闲 {#stack-idle}

`Unsafe.park`（没有 holder）、`EPollArrayDriver.epollWait`（NIO selector 等待）、`Thread.sleep`、`Object.wait`（有明确的等待对象）。这些不是问题，**但它们会淹没真正的异常线程——所以要练的是"快速跳过"的扫读能力**。

**四句判读口诀**：

- `RUNNABLE` → 看**栈顶是 native IO 还是业务代码**；
- `BLOCKED` → 找**锁地址的持有者**；
- `WAITING` / `TIMED_WAITING` → 看**它在等谁**（`parking to wait for` 后面的对象）；
- 拿不准 → **别急着下结论，连拍三次**。

### 4.7 三次采样法 {#three-samples}

```bash
for i in 1 2 3; do jstack -l <pid> > /tmp/stack-$i.txt; sleep 5; done
```

把三份按**线程名**（或 `nid`）对齐：

| 观察 | 结论 |
|---|---|
| 三次都在**同一行** | 真卡住 / 真死循环 |
| 栈在变，但每次都在**同一类操作**上 | 高频但不阻塞（如一直在做同一件事） |
| 三次各不相同、位置分散 | **正常执行**，往别处找原因 |

**只想看某一个可疑线程时**（省时做法）：

```bash
jstack <pid> | grep -A 30 "nid=0x3f2b"
```

**`jstack` 用不了的四类原因**：① 不同用户（换同一用户或 root）；② 容器里（`kubectl exec` 进容器，且**镜像里要有 JDK 而不是精简 JRE**）；③ 进程完全无响应（加 `-F`）；④ 报 `Unable to open socket file`（多为 `/tmp` 权限问题或进程已停止）。

## 五、jmap：堆的四种看法与各自代价 {#jmap}

**先看代价再选命令**——这一节的核心就是"知道每一条命令要付什么"。

| 模式 | 命令 | STW | 触发 GC | 输出 |
|---|---|---|---|---|
| 堆概况 | `jmap -heap <pid>` | 极短 | 否 | 各分区容量/使用、GC 算法 |
| 对象直方图 | `jmap -histo <pid>` | 短 | **否**（含未回收的垃圾对象） | 按类的实例数/字节数排序 |
| 直方图（活对象） | `jmap -histo:live <pid>` | **长** | **是，Full GC** | 只统计存活对象 |
| 全量转储 | `jmap -dump:format=b,file=heap.hprof <pid>` | **长** | 否 | 整个堆（含垃圾） |
| 活对象转储 | `jmap -dump:live,format=b,file=heap.hprof <pid>` | **很长** | **是** | 只含存活对象，文件更小 |

### 5.1 不带 `live` 反而更有用 {#histo-trick}

`-histo` 不带 `live` 时**不会触发 GC**，所以它会同时统计到"已经没人引用、只是还没回收"的对象。很多人觉得这是缺点——**其实这是生产上最实用的定位手段**：

```bash
jmap -histo <pid> | head -30      # 第一次
# 等 1~2 分钟
jmap -histo <pid> | head -30      # 第二次，对比
```

**对比两次的实例数，看哪个类在稳定增长**——增长最快的那个，就是泄漏的对象类型。全程没有 STW 长停顿，这是它在生产上优于 `-histo:live` 的地方。

### 5.2 大堆转储的现实问题 {#dump-reality}

`jmap -dump` 在小堆上很舒服，堆一大就变成另一个故事：

| 问题 | 现实影响 | 应对 |
|---|---|---|
| **文件大小 ≈ 堆使用量** | 8G 堆 → 8G 文件；传输和打开都麻烦 | `gzip` 后通常能到 1/5~1/10；`-dump:live` 能缩小但停顿更长 |
| **STW 时长随堆规模上升** | 8G 堆可能几十秒不可用 | **优先靠 `-XX:+HeapDumpOnOutOfMemoryError` 让 JVM 在 OOM 时自己导**（那一刻服务本来已经不可用） |
| **写入速度受磁盘影响** | dump 到网络盘比本地盘慢一个量级 | **一定 dump 到本地盘**，事后再压缩搬运 |
| **容器里文件随容器消失** | 转储完还没来得及下载，Pod 被重建就没了 | 挂载卷 / 先 `docker cp` 出来 |

**结论**：`jmap -dump` 是"**兜底手段**"而不是第一选择。生产上的正解是**提前配好自动转储**（配置见[调优与线上排查](/java/jvm/tuning)），出问题时从指定目录把文件取走。

> `jmap -heap` 在 **JDK 8 和 JDK 9+ 的输出格式差别明显**（JDK 9+ 简洁得多，直接给 G1 的 region 视图）。网上大量教程是 JDK 8 时代的输出，对照时不要以为命令错了。

## 六、jcmd 与 jinfo：统一入口与动态改参 {#jcmd}

### 6.1 为什么 JDK 9+ 推荐 jcmd {#why-jcmd}

`jcmd` 是**一个入口覆盖上面全部能力**，还多出几项独有的诊断命令。最大的好处是**不用背命令**：

```bash
jcmd                                 # 列出所有 Java 进程（等价 jps）
jcmd <pid> help                      # 列出这个 JVM 支持的全部诊断命令
```

常用子命令：

| 命令 | 等价于 / 作用 |
|---|---|
| `jcmd <pid> Thread.print -l` | `jstack -l` |
| `jcmd <pid> GC.class_histogram` | `jmap -histo`（**注意：会触发 Full GC，等价 `-histo:live`**） |
| `jcmd <pid> GC.heap_dump /path/h.hprof` | `jmap -dump` |
| `jcmd <pid> GC.heap_info` | **当前各分区实际占用**（比 `jmap -heap` 更简洁） |
| `jcmd <pid> VM.flags` | 运行时全部 JVM 参数 |
| `jcmd <pid> VM.command_line` | 启动命令行（**查"这个服务到底怎么起的"**） |
| `jcmd <pid> VM.system_properties` | 系统属性（配置项生效与来源） |
| `jcmd <pid> VM.metaspace` | 元空间详情（JDK 11+，按类加载器维度） |
| `jcmd <pid> VM.native_memory summary` | **堆外内存**（见下） |
| `jcmd <pid> JFR.start / JFR.dump` | 飞行记录（见[火焰图与性能剖析](/java/jvm/profiling)） |

`VM.command_line` 值得特别记——**线上配置不生效、参数和预期不一致时，第一件事是确认进程真实的启动命令**，而不是去翻配置文件（配置可能被环境变量、`JAVA_OPTS`、Dockerfile 的 `ENTRYPOINT` 覆盖）。

### 6.2 `VM.native_memory`：堆外内存的杀手锏 {#native-memory}

**典型场景：`-Xmx4g` 的进程 RSS 涨到 7G 甚至被 OOMKilled，但堆看起来很正常。** 这时候 Heap Dump 完全没用——问题不在堆里。

```bash
# 必须启动时开启（有开销，约 5%~10%）
java -XX:NativeMemoryTracking=summary -jar app.jar
```

```bash
jcmd <pid> VM.native_memory summary scale=MB    # 分类占用总览
jcmd <pid> VM.native_memory baseline            # 打一个基线
# ……等一段时间，复现问题……
jcmd <pid> VM.native_memory summary.diff        # 看增量 ← 定位的关键
```

输出按区域分类：**Java Heap / Class / Thread / Code / GC / Compiler / Internal / Symbol / Arena Chunk / Metadata** 等。**`baseline` + `summary.diff` 的组合是核心用法**——哪一类在涨，就知道是元空间、线程栈、Code Cache 还是直接内存的问题。

> 具体的堆外有哪些区域、每块大概多大，见[虚拟内存与内存管理](/fundamentals/os/memory#java-mapping)（JVM 堆 ≠ 进程内存那一节）。
>
> **判断顺序**：堆在涨 → 走堆转储；**堆稳定但 RSS 涨 → 才轮到 `native_memory`**。反过来用会白折腾。

### 6.3 jinfo：动态改参数的救火用法 {#jinfo}

```bash
jinfo -flags <pid>              # 全部参数及来源
jinfo -sysprops <pid>           # 系统属性
jinfo -flag ThreadStackSize <pid>   # 单个参数
```

**最有价值的是"动态修改"**——只有被标记为 `manageable` 的参数能改。查哪些能改：

```bash
java -XX:+PrintFlagsFinal -version | grep manageable
```

**典型救火场景**：服务没配 OOM 自动转储，而此时已经观察到老年代持续上涨（`FGC` 在涨、`O` 降不下来），眼看要 OOM：

```bash
jinfo -flag +HeapDumpOnOutOfMemoryError <pid>     # 动态开启
```

**下次 OOM 就有现场了，不用重启。** 这类"不重启也能改"的参数不多，但关键时刻能救回一次故障复盘的全部证据。

## 七、把路径串起来：一张决策树 {#decision-tree}

```text
服务异常
│
├─ CPU 高（top 确认是这个进程）
│   ├─ ① 先看 GC：jstat -gcutil 看 FGC / GCT 是否在涨
│   │      ├─ 在涨 → 转「内存涨」分支（GC 线程在烧 CPU）
│   │      └─ 不涨 → ② top -H -p 找线程 → printf "%x" 转十六进制
│   │                  └─ jstack 对 nid：
│   │                      ├─ 业务代码固定 → 死循环/热点算法
│   │                      └─ socketRead0  → 其实是等下游，转「接口慢」
│   └─ 没有明确嫌疑 → 采样火焰图（见火焰图与性能剖析）
│
├─ 内存涨
│   ├─ jstat -gcutil：O 在 FGC 后不降 → 堆内泄漏
│   │      └─ jmap -histo 两次对比找增长类 → jmap -dump → MAT 分析
│   └─ 堆稳定但 RSS 涨 → 堆外
│          └─ jcmd VM.native_memory baseline + summary.diff
│
├─ 接口慢但 CPU 不高（最常见也最容易查错方向）
│   └─ jstack 三次采样，看线程集中在哪：
│       ├─ socketRead0 / socketWrite0 → 下游慢 或 连接池不够
│       ├─ BLOCKED + 同一锁地址       → 锁竞争，找持有者
│       ├─ FutureTask.get             → 池内任务出不来 / 池被打满
│       └─ 都不明显                   → off-CPU 视角，见火焰图篇
│
└─ 进程无响应 / 卡死
    ├─ jstack -F -l（强制拿栈）
    ├─ grep -i deadlock 看有无死锁
    └─ jstat 看 GCT 是否接近 100%（GC 活锁：一直在回收但收不动）
```

**这张树里最重要的两个分岔**：**① 先看 GC（能不能排除掉一大类"CPU 高"）；② `RUNNABLE` 要看栈顶是 native IO 还是业务代码（决定"优化代码"还是"查下游"）。**

## 八、面试问答 {#interview}

| # | 高频问法 | 一句话答案 | 出处 |
|---|---|---|---|
| 1 | "线上 CPU 飙高怎么排查？" | `top` 找进程 → **先 `jstat` 排除 GC** → `top -H -p` 找线程 → 转十六进制 → `jstack` 对 `nid` 定位代码行；没嫌疑就上火焰图 | [决策树](#decision-tree) |
| 2 | "`jstat` 的 `E`、`O`、`M` 是什么？" | Eden、老年代、元空间的**使用率百分比**；要绝对值得用 `jstat -gc` | [十列含义](#jstat-columns) |
| 3 | "怎么从 `jstat` 判断内存泄漏？" | **`FGC` 持续增长而老年代占用 `O` 每次 Full GC 后都降不下来**——这是确诊信号 | [判读三招](#jstat-read) |
| 4 | "GC 占用多少算正常？" | `GCT` / 运行时长：**5% 是健康线，超过 10% 是明确的调优信号**；注意 `GCT` 是累计值 | [判读三招](#jstat-read) |
| 5 | "线上出现 Full GC 但找不到原因？" | 用 `jstat -gccause` 看原因：`Heap Inspection` 说明是有人跑了 `jmap -histo:live`，`System.gc()` 说明有显式调用 | [GC 原因](#gccause) |
| 6 | "怎么排查死锁？" | `jstack -l <pid>`，**JVM 会自己检测并打印 `Found N deadlock`**，不用人眼看环；`-l` 才能覆盖 AQS 类锁 | [死锁](#stack-deadlock) |
| 7 | "`BLOCKED` 和 `WAITING` 有什么区别？" | `BLOCKED` 是抢不到锁（synchronized 入口）；`WAITING (parking)` 是等条件/队列——**处置方式完全不同** | [锁竞争](#stack-lock) |
| 8 | "发现大量线程 `BLOCKED` 下一步做什么？" | 拿 `waiting to lock` 的地址去找 `locked <同地址>` 的持有者，**看持有者卡在哪**（往往它在锁里做了远程调用） | [锁竞争](#stack-lock) |
| 9 | "线程状态是 `RUNNABLE`，就是它在烧 CPU 吗？" | **不是。** `socketRead0` 的线程也是 `RUNNABLE`，实际在等网络——要结合 `top -H -p` 的 CPU 占用一起看 | [等外部资源](#stack-external) |
| 10 | "看到一堆 `ThreadPoolExecutor.getTask` 的线程，是线程池打满了吗？" | **不是，那是空闲线程在等任务**，属于正常现象；真正的问题形态是调用方卡在 `Future.get` 或提交方卡在 `put` | [线程池](#stack-pool) |
| 11 | "为什么单次 `jstack` 不够？" | 快照是横截面，分不清「正好路过」和「长期卡住」；**间隔 3~5 秒连拍三次，看栈是否在同一行** | [三次采样法](#three-samples) |
| 12 | "`jmap -histo` 和 `jmap -histo:live` 怎么选？" | `-histo:live` **会触发 Full GC**；生产上更常用**两次 `-histo` 对比增长**来定位泄漏类，避免长停顿 | [不带 live 反而更有用](#histo-trick) |
| 13 | "`jmap -dump` 生产上能随便用吗？" | 不能。文件大小≈堆大小、STW 随堆规模上升、dump 到网络盘会极慢；**正解是提前配 `HeapDumpOnOutOfMemoryError` 自动留现场** | [大堆转储的现实问题](#dump-reality) |
| 14 | "堆正常但 RSS 一直涨怎么办？" | 是堆外问题，用 `-XX:NativeMemoryTracking=summary` + `jcmd VM.native_memory baseline` / `summary.diff` 看**哪一类区域在涨** | [VM.native_memory](#native-memory) |
| 15 | "线上参数改错了要重启吗？" | 标了 `manageable` 的可以 `jinfo -flag` 动态改（如 `HeapDumpOnOutOfMemoryError`）；其余必须重启 | [jinfo](#jinfo) |
| 16 | "`jcmd` 比 `jstack`/`jmap` 好在哪？" | 一个入口覆盖全部能力、`jcmd <pid> help` 可自省命令表，还多出 `VM.native_memory`、`VM.metaspace`、JFR 等独有能力 | [为什么推荐 jcmd](#why-jcmd) |

> **本篇是实操四篇的第 1 篇。** 拿到 dump 之后怎么分析见[堆转储与 MAT 分析](/java/jvm/heap-dump-analysis)；不重启的在线诊断见 [Arthas 在线诊断](/java/jvm/online-diagnostics)；采样视角的性能剖析见[火焰图与性能剖析](/java/jvm/profiling)。工具速查与调优参数见[调优与线上排查](/java/jvm/tuning)，机器层面的排查见 [Linux 排查实战](/fundamentals/os/linux-tools)。
