---
order: 5
date: 2026-09-13
title: 调优与线上排查
desc: 五类调优参数速查、命令行与可视化工具链、内存泄漏四步法、CPU 飙高四步法、常见 OOM 类型与转储配置
---

# 调优与线上排查

调优不是玄学，是「观测 → 定位 → 验证」的闭环。这一篇是实操题的答案库：参数怎么设、工具怎么用、两个经典四步法。

## 一、参数在哪里设置

| 部署形态 | 设置方式 |
|---|---|
| WAR 包（Tomcat） | 修改 `TOMCAT_HOME/bin/catalina.sh`，在 `JAVA_OPTS` 中追加参数 |
| JAR 包（Spring Boot） | 启动命令直接带参数：`java -Xms512m -Xmx1024m -jar app.jar` |
| Linux 后台运行 | `nohup java -Xms512m -Xmx1024m -jar app.jar --spring.profiles.active=prod &` |
| 容器环境（K8s） | 推荐用 `-XX:MaxRAMPercentage=70` 按容器限额的百分比设置，避免写死绝对值 |

**容器场景的坑（高频加分点）**：JDK8 早期版本不感知 cgroup 限额，会按宿主机内存算默认堆（可能远超容器 limit）导致被 OOMKilled；JDK10+ 已默认容器感知。容器里建议显式用 `MaxRAMPercentage` 而不是 `-Xmx硬编码`。

## 二、常用参数速查（五类）

| 类别 | 参数 | 说明 |
|---|---|---|
| 堆大小 | `-Xms` / `-Xmx` | 初始/最大堆。**建议设成相等**，避免运行期反复伸缩带来额外 GC 与开销 |
| 栈大小 | `-Xss` | 每线程栈，默认约 1M。**不是越小越好也不是越大越好**：并发高的服务适当调小换线程数，递归深的调大防溢出 |
| 新生代 | `-Xmn` 或 `-XX:NewRatio` | 新生代大小/比例（默认 NewRatio=2）。大流量短生命周期对象多的服务适当放大新生代 |
| 比例与阈值 | `-XX:SurvivorRatio=8`、`-XX:MaxTenuringThreshold=15`、`-XX:PretenureSizeThreshold` | Eden:Survivor 比例、晋升年龄、大对象直入老年代阈值 |
| 收集器 | `-XX:+UseG1GC`、`-XX:+UseParallelGC`、`-XX:MaxGCPauseMillis=200` | 收集器选择与停顿目标（G1） |
| 元空间 | `-XX:MaxMetaspaceSize`、`-XX:MetaspaceSize` | 防止类加载过多/动态代理膨胀导致元空间无限增长 |
| 转储 | `-XX:+HeapDumpOnOutOfMemoryError`、`-XX:HeapDumpPath=/data/dumps/` | **生产必加**，OOM 现场自动留证 |
| GC 日志 | `-XX:+PrintGCDetails`（JDK8）、`-Xlog:gc*:file=gc.log`（JDK9+） | 调优的依据，没有日志的调优都是猜 |

**一份可直接抄的起步配置**（4C8G 容器、低延迟 Web 服务）：

```bash
java -XX:MaxRAMPercentage=70 -XX:+UseG1GC -XX:MaxGCPauseMillis=200 \
     -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/data/dumps/ \
     -Xlog:gc*:file=/data/logs/gc.log:time,uptime:filecount=5,filesize=32M \
     -jar app.jar
```

## 三、工具链

### 命令行工具

| 工具 | 作用 | 常用命令 |
|---|---|---|
| `jps` | 查 Java 进程与 PID | `jps -l` |
| `jstat` | GC / 类加载统计（**轻量，生产可放心用**） | `jstat -gcutil <pid> 1000`（每秒一行） |
| `jstack` | 线程堆栈快照（死锁、CPU 飙高定位） | `jstack <pid> > stack.txt` |
| `jmap` | 堆信息与 dump | `jmap -heap <pid>`、`jmap -dump:format=b,file=heap.hprof <pid>` |
| `jinfo` | 查看/动态改参数 | `jinfo -flags <pid>` |
| `jcmd` | 综合入口（推荐，JDK9+） | `jcmd <pid> GC.heap_info` |

### 可视化与增强工具

- **JConsole**：基于 JMX 的 GUI，内存/线程/类加载监控，适合本地看趋势；
- **VisualVM**：功能更全——方法级 CPU 时间、对象分配堆栈、**加载离线 dump 分析**，内存泄漏排查的主力；
- **Arthas**（生产排查首选）：`dashboard` 看全局、`thread -n 3` 看最忙线程、`heapdump` 导堆、`trace/watch` 看方法耗时与入参出参，**attach 到线上进程无需重启**；
- **JFR/JMC**：低开销飞行记录仪，适合长时间采集线上问题。

## 四、内存泄漏排查四步法

**前提认知**：内存泄漏 = 对象不再使用但仍被 GC Roots 引用，堆占用持续上涨且 Full GC 后不回落。

```
第一步：拿到现场
  运行中：jmap -dump:format=b,file=heap.hprof <pid>
  崩溃后：靠提前配置 -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=...

第二步：加载分析
  VisualVM / MAT（Memory Analyzer）打开 dump

第三步：定位对象
  看「数量异常多 / 占用异常大」的对象 → 看它的 GC Roots 引用链（谁在持有它）
  MAT 的 Dominator Tree 和 Leak Suspects 报告直接给出嫌疑

第四步：回到代码修复
  常见根因：静态集合只增不减、ThreadLocal 未 remove、监听器/回调未注销、缓存无上限、连接/流未关闭
```

**关键提效点**：第三步不要只看「什么对象多」，要顺着**引用链**找到「谁持有它」——那才是泄漏源头。

## 五、CPU 飙高排查四步法

```
第一步：top 找到 CPU 最高的进程 PID
第二步：ps H -eo pid,tid,%cpu | grep <pid>    找到最高占用的线程 TID
第三步：printf "%x\n" <tid>                   转为十六进制
第四步：jstack <pid> | grep -A 20 <十六进制>   定位到具体代码行
```

**判读要点**（这才是能不能给出结论的地方）：

- 线程状态是 `RUNNABLE` 且堆栈固定在同一方法 → **死循环 / 大计算量**；
- 大量线程停在 `BLOCKED` → 锁竞争，配 `jstack` 找锁持有者；
- `GC task thread` 占满 CPU → **不是业务问题，是 GC 问题**，转内存泄漏排查（前一步法）；
- 频繁 `WAITING` 但 CPU 高 → 可能是线程数配置不当导致上下文切换风暴（`vmstat` 看 cs 列）。

Arthas 的 `thread -n 3` 一条命令即可完成前四步的信息采集。

## 六、常见 OOM 类型对照

| 错误信息 | 位置 | 常见原因 |
|---|---|---|
| `Java heap space` | 堆 | 内存泄漏、单次查询数据量过大、缓存无上限 |
| `GC overhead limit exceeded` | 堆 | GC 时间占比超 98% 且回收不到 2%，本质仍是堆不足 |
| `Metaspace` | 元空间 | 动态生成类过多（CGLIB/反射/热部署）、`MaxMetaspaceSize` 未限制 |
| `Direct buffer memory` | 直接内存 | NIO 分配未释放、`MaxDirectMemorySize` 太小 |
| `unable to create new native thread` | 系统 | 线程数超限（`-Xss` 过大或系统 `ulimit` 限制），**不是内存不足而是资源耗尽** |
| `requested array size exceeds VM limit` | 堆 | 数组长度超上限（代码 bug） |

面试时能按「错误信息 → 位置 → 原因」把这张表讲出来，比笼统说「调大堆内存」专业一个档次。

## 七、面试口径

> 「调优参数分几类：堆用 -Xms/-Xmx 建议设相等，栈用 -Xss 权衡线程数，还有新生代比例、晋升阈值、收集器选择和 GC 日志，生产必加 HeapDumpOnOutOfMemoryError 留现场。工具方面命令行用 jps、jstat、jstack、jmap、jcmd，可视化主用 VisualVM 和 MAT 分析 dump，线上排查首选 Arthas。内存泄漏四步：导 dump → 加载分析 → 找异常对象顺引用链定位持有者 → 回代码修复，常见根因是静态集合只增不减和 ThreadLocal 未清理。CPU 飙高四步：top 找进程 → ps 找线程 → 转十六进制 → jstack 定位代码行，注意区分死循环、锁竞争和 GC 线程占满三种情况。」
