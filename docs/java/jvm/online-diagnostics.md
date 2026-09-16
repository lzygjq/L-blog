---
order: 8
date: 2026-09-16
title: Arthas 在线诊断
desc: Attach 与字节码增强的原理、能 attach 的四个前提、按目的分组的命令谱系（看全局/看线程/看调用/看代码/看数据）、trace 的条件过滤与性能开销三条纪律、watch 抓被吞掉的异常、vmtool 免导 dump 看对象、stop 与 shutdown 的区别、生产使用的四条安全边界
---

# Arthas 在线诊断：不改代码、不重启地问一个问题

> 上一篇：[堆转储与 MAT 分析](/java/jvm/heap-dump-analysis)　|　导览：[Java 虚拟机](/java/jvm/)

`jstack` / `jmap` 能回答"**此刻的状态是什么**"，但回答不了"**刚才那次调用为什么慢**""**传进来的参数到底是多少**""**这个异常为什么被吞了**"。后者原本只能靠改代码加日志、发版、重启——**而问题往往重启后就复现不了**。

Arthas 的价值就一句话：**把"改代码 + 发版"才能拿到的信息，变成一条命令。**

**先把结论放前面**：

1. **它的原理是 JDK 的 Attach API + 字节码增强**——理解了这句，就理解了它为什么**必须同用户、且不能滥用**（[§2](#attach)）。
2. **`trace` 是有成本的命令。** 它让方法的**每一次调用**都走增强后的逻辑，**高频方法会被明显拖慢**——必须限次、用完停止（[§4.1](#trace)）。
3. **`watch` 最值钱的能力是抓「被吞掉的异常」**——在没有任何日志的地方凭空打印出异常对象（[§4.2](#watch)）。
4. **`stop` 和 `shutdown` 不是一回事。** 前者停止当前观测，后者关掉整个 Arthas 服务端——**在生产上敲错后者，等于把所有人的诊断通道关掉**（[§7](#safety)）。

## 一、先把"要问什么"想清楚 {#why}

| 传统手段 | 实际成本 |
|---|---|
| 加日志 → 发版 | 分钟到小时级；**而且重启后问题常常不复现** |
| 本地复现 | 生产的数据量、并发度、下游状态很难复刻 |
| 事后翻日志 | 缺的就是当时没打出来的那个变量 |
| `jstack` / `jmap` | 只有"状态快照"，方法级的入参与耗时要不到 |

**在线诊断要回答的问题通常只有三类**：① **这个方法慢在哪一步**；② **实际传进来/返回的是什么**；③ **这个异常为什么被吞了**。三类问题对应三个命令，其余的都是辅助。

## 二、原理：Attach 与字节码增强 {#attach}

```text
你的终端
   │  ① 通过 JDK Attach API 附加（com.sun.tools.attach.VirtualMachine）
   ▼
目标 JVM ── ② 动态加载一个 agent（jar）
   │
   └─ ③ agent 里用 Instrumentation API（retransformClasses）对指定类做字节码增强
          ↓
      该方法的每次调用都会经过增强后的代码 → 统计耗时 / 打印参数
```

**从这张图能直接推出四条使用前提**：

| 前提 | 说明 | 不满足的现象 |
|---|---|---|
| **同一用户**（或 root） | Attach 通道受进程权限约束 | 附加失败 / 权限错误 |
| 目标 JVM **未禁用 attach** | `-XX:+DisableAttachMechanism` 会让所有 attach 类工具失效（**部分安全加固会开**） | 所有诊断工具都连不上 |
| **本机 / 同 PID namespace** | 要能看到目标进程 | 找不到进程号 |
| 容器内可进入 | K8s 里得 `kubectl exec` 进去 | 无法定位进程 |

**两条重要推论**：

1. **它必须"贴到进程所在的机器上"**，不是远程调试——**这是它和 IDE 远程 debug 的本质区别**（后者靠 JVM 启动时开好的调试端口）。
2. **字节码增强是有持续成本的**：只要增强还在，method 的每次调用都要多走一遍逻辑。**这正是 `trace` / `watch` 必须限次并及时停止的根本原因**，不是"建议"，是机制决定的。

> 较新版本的 JDK 会对"动态加载 agent"给出提示或要求显式许可（默认收紧是长期方向）。看到这类提示属正常机制变化，不是工具异常。

## 三、命令谱系：按目的分五组 {#commands}

一个入口下有一百多条命令，**按"我要问什么"分组记，比按字母背有用**。

### 3.1 看全局 {#cmd-global}

| 命令 | 看什么 |
|---|---|
| `dashboard` | **一屏看全**：线程列表 + 内存分区 + GC + 运行时；`dashboard -n 1` 只输出一屏（**便于贴进工单**） |
| `jvm` | JVM 运行时信息（内存、GC、线程数、文件描述符等） |
| `memory` | 各内存分区的具体占用 |
| `sysprop` / `sysenv` | 系统属性 / 环境变量——**配置不生效时先查这里** |

`dashboard` 大致相当于把 `jstat` 的摘要与最忙线程列表压到一屏，**是"进现场第一步"最省事的命令**。

### 3.2 看线程 {#cmd-thread}

| 命令 | 用途 |
|---|---|
| `thread` | 列出全部线程（按 CPU 占用排序） |
| `thread -n 3` | **最忙的 3 个线程**——一条命令顶 `top -H -p` + `printf "%x"` + `jstack` 三步 |
| **`thread -b`** | **找出"阻塞了其他线程"的那个线程**——锁竞争的直接答案 |
| `thread -i 1000 -n 3` | 统计最近 1000ms 内最忙的线程（比瞬时快照更准） |
| `thread --state BLOCKED` | 按状态过滤 |
| `thread <id>` | 看指定线程的栈 |

**`thread -b` 是最值得单独记的一条**：它直接回答"**谁持有锁导致别人卡住**"。用 `jstack` 要手工做 `waiting to lock` 地址 → `locked` 地址的匹配，这里一条命令就给出来。

### 3.3 看调用 {#cmd-invoke}

| 命令 | 回答 | 相对开销 |
|---|---|---|
| `trace` | 这个方法**内部**哪一步慢 | **高** |
| `watch` | 传进来 / 返回 / 抛出的**是什么** | 中 |
| `monitor` | 调用了**多少次**、成功率、平均 RT | 中 |
| `stack` | **谁调用了**这个方法 | 中 |
| `tt` | 记录若干次调用的**上下文**，可事后回放 | 中 |

### 3.4 看代码与类 {#cmd-code}

| 命令 | 用途 |
|---|---|
| **`jad`** | **反编译，确认线上跑的到底是哪个版本** |
| `sc` / `sm` | 搜索类 / 搜索方法：看是否加载、由哪个 ClassLoader 加载 |
| `classloader` | 类加载器的统计与层次 |

**`jad` 的第一价值是排查"改了没生效"**：代码改了、版也发了，行为还是旧的 → `jad <全类名>` 看一眼线上实际加载的字节码。

**配合 `sc -d <类名>`** 输出里的 `classLoaderHash`：**当一个类被多个 ClassLoader 加载时**，后续命令要用 `-c <hash>` 指定操作哪一个，否则你看到的可能不是"正在跑"的那一份。

### 3.5 看数据与改行为 {#cmd-data}

| 命令 | 用途 | 风险 |
|---|---|---|
| `getstatic` | 读静态字段（**缓存有多大、配置生效成什么值**） | 低 |
| `vmtool` | **按类从堆里取实例**（见 [§5](#vmtool)） | 低 |
| `ognl` | 执行表达式（可调方法），能力强 | 中 |
| `profiler` | 启动采样，等价 async-profiler（见[火焰图与性能剖析](/java/jvm/profiling)） | 中 |
| `heapdump` | 导出堆（等价 `jmap -dump`） | **高（长 STW）** |
| `redefine` / `retransform` | 替换已加载类 / 重新增强 | **高** |

## 四、`trace` 与 `watch`：把两个最常用的用对 {#trace-watch}

### 4.1 `trace`：耗时归因 {#trace}

```bash
# 基础
trace com.demo.OrderService createOrder

# 只抓慢的 —— #cost 是内置的「本次调用耗时（ms）」变量
trace com.demo.OrderService createOrder '#cost > 100'

# 限制次数（关键，不加会一直增强并刷屏）
trace com.demo.OrderService createOrder -n 5

# 跳过 JDK 内部方法，只看业务链
trace com.demo.OrderService createOrder --skipJDKMethod true
```

**输出怎么读**（这一段是重点）：

```text
`---ts=2026-09-16 14:22:31;thread_name=http-nio-8080-exec-5;id=1a2b;is_daemon=true
    `---[312.45ms] com.demo.OrderService:createOrder()
        +---[2.11ms]  com.demo.OrderService:validate()     #23
        +---[298.72ms] com.demo.OrderDao:insert()          #45   ← 慢在这里
        `---[8.32ms]  com.demo.NotifyService:send()        #61
```

| 观察 | 结论 |
|---|---|
| **父方法耗时 ≈ 各子方法耗时之和** | 正常形态 |
| 某一行占比特别大 | **方向就是它**（上例是 `insert`，占 298ms） |
| 父方法远大于子方法之和 | **耗时在方法自身的代码里**（或落在没有进入 trace 的调用上） |

**性能开销与三条纪律**（这一条比命令本身重要）：

| # | 纪律 | 原因 |
|---|---|---|
| 1 | **必须加 `-n`** | 不加会持续增强并输出，对高频方法代价很大 |
| 2 | **用条件过滤（如 `#cost > 100`）而不是全量** | 只让慢调用"付出"增强成本，快调用直接放过 |
| 3 | **看完立刻 `stop`** | `stop` 停止当前正在观测的命令（**保留 Arthas 服务**），别留着不管 |

> **不要对基础工具类（`StringUtils` 之类每秒几万次的方法）做 trace。** 上线前用最少的信息量换答案，是这类工具的正确用法——**先进场抓一次样本，而不是开着等**。

### 4.2 `watch`：看数据与看异常 {#watch}

```bash
# 看入参、返回值、抛出的异常（-x 2 展开两层）
watch com.demo.OrderService createOrder '{params, returnObj, throwExp}' -x 2

# 只关心异常
watch com.demo.OrderService createOrder '{params, throwExp}' -e -x 2

# 条件过滤：只看某个用户的调用
watch com.demo.OrderService createOrder '{params[0]}' 'params[0].userId == 1001' -x 2
```

**四个观察点**：

| 表达式 | 内容 |
|---|---|
| `params` | 入参数组（`params[0]` 是第一个参数） |
| `returnObj` | 返回值 |
| `throwExp` | 抛出的异常对象 |
| `target` | 当前实例（**能读它的实例字段**，排查"对象状态不对"时用） |

**最佳应用场景：抓「被吞掉的异常」。** 代码里 `catch (Exception e) { log.error("下单失败"); }` —— 异常对象被吞了，堆栈没打，日志里只有一行无信息量的文案。用 `watch ... '{throwExp}' -e` **直接把异常对象打出来**，等于**在不改代码的前提下凭空造出日志**。这是 `watch` 在真实排查里出现频率最高的用途。

> `-x` 控制展开层级：默认 1 层，看嵌套对象要加到 2~3；层级太大会输出巨量内容。

## 五、`getstatic` 与 `vmtool`：不导 dump 也能看对象 {#vmtool}

### 5.1 `getstatic`：读静态字段 {#getstatic}

```bash
getstatic com.demo.Config MAX_CONCURRENCY      # 看某个配置常量
getstatic com.demo.CacheRegistry INSTANCE -x 2 # 看单例内部
```

**最实用的用途：确认配置最终生效的值。** 配置文件、环境变量、启动参数可能层层覆盖，**读静态字段拿到的是"代码实际看到的那个值"**，比翻配置文件可靠得多。

### 5.2 `vmtool`：按类从堆里捞对象 {#vmtool-usage}

```bash
# 捞实例
vmtool --action getInstances --className com.demo.LocalCache --limit 5 -x 2

# 直接在实例上求值（看缓存有多大）
vmtool --action getInstances --className com.demo.LocalCache \
       --express 'instances[0].map.size()'
```

**它的定位：怀疑某个缓存/容器太大时，不用导 dump 就能看到它的规模**。导一次 dump 要 STW、要传几个 G 的文件、要开 MAT；`vmtool` 几秒钟给出 `size()`。**排查顺序上，它应该排在 dump 之前。**

## 六、五个命令怎么选 {#selection}

| 命令 | 回答的问题 | 数据方向 | 开销 |
|---|---|---|---|
| `stack` | **谁调用了这个方法** | 往上（调用方） | 中 |
| `trace` | 方法**内部**哪一步慢 | 往下（被调方） | **高** |
| `watch` | 传入 / 返回 / 抛出的**是什么** | 值 | 中 |
| `monitor` | 调用**次数与成功率** | 统计 | 中 |
| `tt` | 每次调用的**上下文记录**（可回放） | 值 + 时序 | 中 |

**选型口诀**：**问「谁调我」用 `stack`；问「我慢在哪」用 `trace`；问「数据对不对」用 `watch`；问「调了多少次、失败多少」用 `monitor`；要「事后回放现场」用 `tt`。**

`tt`（TimeTunnel）值得单独提一句：`tt -t` 先把若干次调用记录下来，之后用 `tt -i <index>` 查看任意一次的完整上下文，甚至 `tt -p` 重放。**适合"故障已经过去了，但我想把它再演一遍"**。

## 七、生产使用的四条安全边界 {#safety}

| # | 边界 | 原因 |
|---|---|---|
| 1 | **只读命令优先** | `jad` / `sc` / `sm` / `getstatic` / `jvm` / `sysprop` / `thread` / `dashboard` 都是纯观测，无副作用 |
| 2 | **`trace` / `watch` 限次 + 及时 `stop`** | 字节码增强对**每一次调用**生效；忘记停止会持续拖慢线上 |
| 3 | **`redefine` 不在生产用** | 只能替换**方法体**（不能增删字段与方法），改错难回退，且完全脱离版本管理 |
| 4 | **分清 `stop` 与 `shutdown`** | 见下表——**误敲 `shutdown` 会把所有人的诊断通道一起关掉** |

**`stop` vs `shutdown`**（这一条经常被搞错）：

| 命令 | 作用 | 何时用 |
|---|---|---|
| `stop` | **停止当前正在执行/刷屏的命令**（如一个还在输出的 `trace`），Arthas 服务保留 | 观测够了，收手 |
| `shutdown` | **关闭整个 Arthas 服务端**（卸载增强、断开连接） | 整场诊断结束，确认没人再用时 |
| `exit` / `quit` | 只退出当前客户端会话 | 常规退出 |

**K8s / Docker 场景**：

| 场景 | 做法 |
|---|---|
| 本机 | `java -jar arthas-boot.jar`，交互选择进程号 |
| 服务器 | `as.sh --target-ip 0.0.0.0` 起服务端，其余机器连过来 |
| **容器 / K8s** | `kubectl exec -it <pod> -- /bin/sh` 进容器后运行；**目标必须是该 PID namespace 内可见的进程** |
| 镜像里没 JDK / 无写权限 | 把 arthas 挂载进容器，或用带 attach 能力的专用镜像 |

三条容器注意：① 镜像要有 shell 才进得去；② **镜像里的 Java 必须保留 attach 能力**（精简过的 runtime 镜像可能没有）；③ **用完退出，不要常驻**——Pod 一重建就没了，长期挂着增强也不干净。

## 八、面试问答 {#interview}

| # | 高频问法 | 一句话答案 | 出处 |
|---|---|---|---|
| 1 | "Arthas 的原理是什么？" | 通过 JDK 的 **Attach API** 附加到目标 JVM、动态加载 agent，再用 `Instrumentation` 做**字节码增强** | [原理](#attach) |
| 2 | "它能远程诊断吗？" | 不能远程附加，**必须能访问目标进程**（同用户、同主机或同一 PID namespace）；远程只是把客户端连到服务端，仍需在机器上先起服务 | [四个前提](#attach) |
| 3 | "为什么不能对高频方法用 `trace`？" | trace 让**每次调用**都走增强后的逻辑；高频方法会被明显拖慢——必须加 `-n` 限次、用条件过滤，并及时 `stop` | [trace](#trace) |
| 4 | "`trace` 输出里怎么判断瓶颈？" | **父方法耗时 ≈ 各子方法耗时之和**；占比特别大的那一行就是方向；父远大于子说明耗时在方法自身 | [trace](#trace) |
| 5 | "只想抓慢请求怎么做？" | `trace <类> <方法> '#cost > 100'` —— `#cost` 是内置的本次调用耗时变量 | [trace](#trace) |
| 6 | "异常被 catch 吞了、日志没打堆栈，怎么查？" | `watch <类> <方法> '{params, throwExp}' -e -x 2`，**在不改代码的前提下把异常对象打出来** | [watch](#watch) |
| 7 | "`trace` / `watch` / `stack` / `monitor` 怎么选？" | 慢在内部用 `trace`、看数据用 `watch`、找调用方用 `stack`、看频次与成功率用 `monitor` | [选型](#selection) |
| 8 | "怎么找「阻塞了别人」的那个线程？" | `thread -b`，直接给出谁持有锁导致其他线程卡住；等价于手工做 `waiting to lock` → `locked` 的地址匹配 | [看线程](#cmd-thread) |
| 9 | "`thread -n 3` 相当于什么？" | 一条命令顶 `top -H -p` + 十六进制转换 + `jstack` 三步，直接给出最忙线程的栈 | [看线程](#cmd-thread) |
| 10 | "改了代码也发了版，但行为没变，怎么确认？" | `jad <全类名>` 反编译线上实际加载的类；配合 `sc -d` 的 `classLoaderHash` 判断**是不是被别的 ClassLoader 加载了旧版本** | [看代码](#cmd-code) |
| 11 | "怎么确认某个配置最终生效的值？" | `getstatic <类> <字段>` 读静态字段，或 `sysprop` 看系统属性——比翻配置文件可靠，因为配置可能被多层覆盖 | [getstatic](#getstatic) |
| 12 | "不想导 dump，怎么知道某个缓存 Map 有多大？" | `vmtool --action getInstances --className xxx --express 'instances[0].map.size()'`——秒级给出规模 | [vmtool](#vmtool-usage) |
| 13 | "线上用 Arthas 要注意什么？" | ① 只读命令优先 ② `trace`/`watch` 限次并及时停止 ③ `redefine` 不用在生产 ④ **区分 `stop` 与 `shutdown`** | [安全边界](#safety) |
| 14 | "`stop` 和 `shutdown` 有什么区别？" | `stop` 停止当前正在观测的命令、**保留 Arthas 服务**；`shutdown` 关闭整个服务端并卸载增强 | [安全边界](#safety) |
| 15 | "`redefine` 有什么限制？" | 只能替换**方法体**，不能增删字段与方法；改了立即生效且难以回退——**生产禁用** | [安全边界](#safety) |
| 16 | "K8s 里怎么用 Arthas？" | `kubectl exec` 进容器后运行 arthas-boot 选进程；要求镜像有 shell 且有 attach 能力，用完退出不留驻 | [容器场景](#safety) |

> **本篇是实操四篇的第 3 篇。** 命令行工具与判读见 [JDK 命令行排查](/java/jvm/troubleshooting-cli)；堆转储分析见[堆转储与 MAT 分析](/java/jvm/heap-dump-analysis)；采样视角看耗时分布见[火焰图与性能剖析](/java/jvm/profiling)。
