---
date: 2026-09-17
title: 连接池：参数、池大小与超时对齐
sidebar: 连接池
order: 9
desc: 连接的真实成本与池化的三重收益、HikariCP 七个核心参数的默认值与改动时机、池大小由下游能力决定的推导、链路上五个超时的对齐方向、连接泄漏与"池打满"的四种根因、maxLifetime 与 wait_timeout 的配合
---

# 连接池：参数、池大小与超时对齐

这一篇放在 MySQL 板块，是因为**连接池是应用与数据库之间的那道边界**——它的每一个参数都对应数据库侧的一个约束或一个超时。写应用的很少读它，写数据库的很少配它，**而"池打满"是线上最常见的故障之一**（在[五类"发布即故障"](/cloud-native/cicd/rollback-and-migration#release-incidents)里它占一席）。

正文里提到它的地方有几十处（`connectionTimeout`、`maxLifetime`、泄漏、容量测算……），却一直没有一篇把它讲完。这一篇补上。

> **主线：连接池的每个参数都对应一个超时或一个队列；线上事故几乎都来自"几个超时没有对齐"。**
>
> 三条具体的账：**连接要复用**（否则每次请求都在做 TCP + 认证）、**并发要限流**（否则应用会把数据库压死）、**等待要能被观测**（否则"慢"这件事无从定位）。

## 一、问题场景：一条连接到底贵在哪 {#why}

"直接用 `DriverManager.getConnection()` 不就行了"——在小流量下确实能跑，代价藏在三处：

| 成本 | 具体内容 | 量级 |
|---|---|---|
| **网络与协议** | TCP 三次握手（跨可用区还有额外 RTT） | 毫秒级，随网络质量波动 |
| **认证与授权** | MySQL 握手 + 认证插件计算（如 `caching_sha2_password`）+ 加载权限 | 明显高于 TCP 建连本身 |
| **服务端资源** | 每连接一个线程 + 会话缓冲（`thread_stack`、sort/join buffer 按需分配）+ 一个 fd | 空闲连接也占内存 |

**换算一下就清楚了**：假设一次查询本身只要 2ms，而建连要 15ms——**连接的开销是查询本身的 7 倍**。这就是池化的第一个收益：**省掉重复的建连**。

但它不是最重要的收益。三个收益按价值排序：

```
① 限流（最重要）：池大小 = 应用对数据库的并发上限
   —— 没有池，瞬时并发会变成对 DB 的并发，把 DB 压垮
② 复用：省掉建连成本（性能）
③ 可观测：池的 idle / active / pending 是"数据库压力"的直接指标
   —— 没有池，这个数字无处可测
```

> **第①条是连接池真正的价值**：它是一个**背压（backpressure）装置**。数据库最怕的不是慢查询，是"大量连接同时挤进来"——每个连接都占内存与 CPU，最后连"执行一条 `SELECT 1`"都排不上队。**池把"无限并发"变成了"排队"，而排队是可以被观察、被拒绝、被限流的。**
>
> 这与[发布时"连接池耗尽"](/cloud-native/cicd/rollback-and-migration#release-incidents)是同一件事的两面：**故障不是"连接不够用"，而是"连接不够用的时候没有人在等，而是在一起用力"。**

## 二、池化模型：借、用、还 {#model}

抛开实现差异，所有连接池都是同一个状态机：

```
                    ┌──────────────── 归还（正常关闭/异常关闭）
                    ▼
   ┌─────────┐  借出  ┌─────────┐  归还  ┌─────────┐
   │  idle   │ ─────▶ │ active  │ ─────▶ │  idle   │
   │ 空闲池  │        │  使用中  │        │  空闲池  │
   └─────────┘        └─────────┘        └─────────┘
        │                                     │
        │ 空闲超过 idleTimeout                 │ 存活超过 maxLifetime
        ▼                                     ▼
   ┌──────────────────────────────────────────────┐
   │              物理关闭（真正断开连接）           │
   └──────────────────────────────────────────────┘

特殊路径：
  借不到（active 已达 maximumPoolSize）→ 进入等待队列，最多等 connectionTimeout
  借到后连接已失效（被 DB 断连/网络中断）→ 淘汰并新建（或重试一次）
```

**三个关键状态量**是排查一切池问题的起点：

| 指标 | 含义 | 异常表现意味着 |
|---|---|---|
| `active` | 正在被业务持有 | 长期贴住 `maximumPoolSize` → 要么池太小，要么有泄漏/慢查询 |
| `idle` | 空闲可用 | 长期为 0 且 active 满 → 池确实不够 |
| `pending`（等待线程数） | **在排队要连接的线程** | **只要持续 > 0，就说明有请求在等——这是最该告警的指标** |

> **`pending` 被严重低估**：很多人只盯着"有没有报 `connectionTimeout`"，但**错误是在等待超时之后才出现的**。`pending > 0` 一旦持续存在，说明已经有请求在承担延迟——**此时还没报错，但用户已经在等了**。这是把"故障"变成"性能问题"就能发现的分界线。

## 三、HikariCP 的核心参数 {#hikari}

Spring Boot 2 起默认连接池就是 HikariCP，多数人从未改过任何一个参数——**默认值在中等流量下是合理的，但有几个必须按环境调整**。

| 参数 | 默认值 | 含义 | 什么时候必须改 |
|---|---|---|---|
| **`maximumPoolSize`** | **10** | 池上限 | **几乎总要改**：10 是 HikariCP 的保守默认，与核数、下游能力无关 |
| `minimumIdle` | = `maximumPoolSize` | 保底空闲连接数 | 通常**不要设**（见下）；设了会让 `idleTimeout` 生效 |
| **`connectionTimeout`** | **30s** | 借连接的最长等待 | 多数场景**太长**——等 30 秒意味着用户早已放弃，且线程被占住 |
| `idleTimeout` | 10min | 空闲连接被回收的时间 | **只在 `minimumIdle < maximumPoolSize` 时生效** |
| **`maxLifetime`** | **30min** | 连接的最大存活时间 | **必须小于 MySQL 的 `wait_timeout`**（见[第七节](#mysql-side)） |
| `keepaliveTime` | **0（禁用）** | 空闲连接的心跳保活间隔 | 中间有防火墙/负载均衡掐空闲连接时开启 |
| `validationTimeout` | 5s | 借出前的有效性检测超时 | `maxLifetime` 调小时同步调小 |
| `leakDetectionThreshold` | **0（禁用）** | 借出超过该时长未归还就打日志 | **排查泄漏时开**（建议 30s~60s），**生产长期开启有性能代价** |

### 3.1 三个最容易配错的

**① `minimumIdle` 默认等于 `maximumPoolSize`，这会让 `idleTimeout` 完全失效。**

HikariCP 的设计取向是"**固定大小的池**"——池建起来就保持在 `maximumPoolSize`，不做弹性伸缩。这样每次请求都是"立刻拿到热连接"，没有弹性伸缩带来的建连尖峰。代价是空闲时占着连接。

```
minimumIdle = maximumPoolSize (=10)   → 池长期保持 10 条，idleTimeout 不生效
minimumIdle = 5, maximumPoolSize = 20 → 空闲时回落到 5 条，idleTimeout 生效
```

**选哪个看数据库侧的连接总预算**：有 N 个应用实例，`N × maximumPoolSize` 必须小于 MySQL 的 `max_connections`（还要给运维、备份、DBA 留出空间）。**固定池在实例数多时会让总连接数很难压下来**，这时才需要设 `minimumIdle`。

**② `connectionTimeout` 的默认 30 秒，在 Web 场景通常过长。**

它决定的是"**借不到连接时等多久**"。等 30 秒的后果是：请求线程被占住 30 秒，上游的 HTTP 超时早就返回 504 了，而**这 30 秒里被占住的线程又加剧了整体拥塞**。常见做法是压到 **1~3 秒**：

```
原则：连接池的等待时间，应该短于调用方的超时时间
     —— 让"拿不到连接"以明确错误暴露，而不是变成"整个接口变慢"
```

**③ `leakDetectionThreshold` 开了要记得关。**

它按"借出时长"判断泄漏，机制是**每次借出/归还都要登记时间戳**，有额外开销；而且它会误报**合法的长事务**（一个跑了 90 秒的批处理会被判成泄漏）。**正确用法是"排查期间开启，定位后关闭"，并把发现的真实泄漏修掉。**

### 3.2 一个最小可用的配置

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 20          # 由下游能力推导，见第四节
      minimum-idle: 20               # 与 maximum 一致（固定池），让空闲连接保持热态
      connection-timeout: 3000       # 3s：拿不到就快速失败
      max-lifetime: 1200000          # 20min，必须 < MySQL wait_timeout
      keepalive-time: 300000         # 5min 心跳，防中间设备掐空闲连接
      validation-timeout: 3000
      leak-detection-threshold: 60000  # 仅在排查期开启
```

## 四、池大小怎么定 {#sizing}

这是连接池里最反直觉的一节：**"池越大越好"是错的，而且常常正好相反。**

### 4.1 两条已知的"公式"

**公式一（PostgreSQL 社区流传、HikariCP 文档引用）**：

```
connections = (core_count × 2) + effective_spindle_count

4 核机器 + 1 块盘 → 4×2 + 1 = 9 条
```

它的含义是：**数据库的并行执行能力受 CPU 与磁盘限制**，超过这个数量的连接只能排队（在数据库内部排，而不是在你的池里排）。SSD 时代 `effective_spindle_count` 通常按 1 计。

**公式二（排队论，Little's Law）——用于推导"够不够"**：

```
需要的并发数 = 目标 QPS × 单次请求平均耗时（秒）

目标 500 QPS，平均耗时 20ms → 500 × 0.02 = 10 条
```

**两条公式的差异本身就是重点**：公式二算的是"**要处理这些流量，需要多少并发**"；公式一算的是"**数据库能真正并行多少**"。**最终池大小取两者中较小的那个**——因为超出数据库并行能力的连接，只是把队列从"你的池"挪到"数据库的锁与调度器"上，**响应时间一样会涨，而且更难定位**。

### 4.2 为什么"加大池"经常让情况变糟

```
池从 10 加到 50 之后：
  · 数据库的活跃连接从 10 涨到 50
  · 每个连接都需要内存与 CPU 时间片 → 上下文切换增加
  · 原来在池里排队的请求，现在涌进数据库 → 锁等待与页竞争加剧
  · 单个查询变慢 → 持有连接时间变长 → 需要更多连接（正反馈）
  · 结果：吞吐量下降，P99 上升，而"池打满"依然发生
```

> **"池打满"的正确反应不是加池，而是先问"为什么每条连接被占用这么久"。** 三个方向：慢 SQL（见[慢查询定位](/database/mysql/diagnosis)）、事务里包了非数据库操作（调 RPC、发 MQ）、真正的连接泄漏。**加池只对"池确实小于数据库能提供的并行能力"这一种情况有效。**

### 4.3 别忘了乘实例数

```
总连接数 = 应用实例数 × maximumPoolSize

10 个 Pod × 20 = 200 条连接
MySQL max_connections 默认 151        ← 直接超了
```

**这是容器化之后最常见的配置事故**：本地开发时 `maximumPoolSize=20` 完全没问题，上了 K8s 起了 10 个副本，总连接数变成 200。**注意自动扩缩容会放大它**：HPA 从 4 个副本扩到 20 个，连接数也跟着乘 5。

**两个应对手段**：

| 手段 | 做法 | 代价 |
|---|---|---|
| **反推池大小** | `maximumPoolSize = max_connections × 0.8 / 最大实例数` | 单实例可用连接变少，扩容时要注意 |
| **引入数据库代理** | ProxySQL / 云数据库代理做连接池化，**应用还可以用短连接** | 多一跳、多一个组件；但连接数不再随实例数线性增长 |

> **一个常被忽略的约束**：MySQL 的连接数是**按用户**累计的（`max_user_connections` 可单独限制），且**每连接一个线程**——`max_connections` 开得很大不等于能扛住，反而可能因为线程数与内存耗尽而整机雪崩。**"不让人连进来"有时比"让人连进来但跑不动"更好**，这就是池化在做的取舍。

## 五、超时对齐：链路上有五个超时 {#timeouts}

这一节是整个专题里最能直接减少事故的部分。**一次数据库调用经过的超时，至少有五个，而它们必须按方向对齐**：

```
① 调用方（浏览器 / 上游服务）超时
        ↓
② 网关 / 反向代理超时
        ↓
③ 应用：连接池 connectionTimeout（借连接）+ 事务超时
        ↓
④ 应用：JDBC socketTimeout（读响应超时）
        ↓
⑤ 数据库：net_write_timeout / net_read_timeout / wait_timeout
```

**对齐原则：从外到内逐层变短不可能，逐层变长才有意义 —— 正确的方向是"内层必须短于外层"。**

什么意思？**内层的超时必须先生效**，这样内层能把"超时"这件事变成**有明确错误信息的返回**，而不是让外层先超时并返回一个笼统的 504。

```
✅ 正确：内层 < 外层
   浏览器 30s  >  网关 20s  >  连接池等待 5s + 查询 10s  >  socketTimeout 12s

❌ 错误：内层 > 外层
   网关 10s，socketTimeout 60s
   → 网关先在 10s 返回 504，而应用还在傻等 60s
   → 用户看到 504，日志里没有任何"超时"记录（因为应用没超时）
   → 故障定位时最难查的一类："503/504 但没有对应错误日志"
```

**逐项配置清单**：

| 层 | 配置 | 建议取值 | 说明 |
|---|---|---|---|
| 连接池等待 | `connectionTimeout` | 1~3s | **必须短于**上游超时，让"拿不到连接"快速暴露 |
| 事务 | `@Transactional(timeout = N)` | 按业务定 | 超时会回滚（注意：**它靠的是数据库侧的 `max_execution_time` 或驱动中断**） |
| JDBC 读 | `socketTimeout` | 比最长查询略大 | **默认 0 = 无限等待**——这是"接口挂住不返回"的常见原因 |
| JDBC 建连 | `connectTimeout` | 3~5s | 与 `socketTimeout` 是两个参数 |
| 数据库写 | `net_write_timeout` | 默认 60s | 服务端向客户端写数据超时 |
| 数据库读 | `net_read_timeout` | 默认 30s | 服务端等待客户端数据超时 |

```properties
# JDBC URL 里显式声明（以 MySQL Connector/J 为例）
jdbc:mysql://host:3306/db?connectTimeout=3000&socketTimeout=12000&useSSL=true&serverTimezone=Asia/Shanghai
```

> **`socketTimeout` 默认为 0（无限等待）是最容易被忽略的一处**：一个卡住的查询会让线程永远挂在那里——连接不会归还、线程不会释放，**表现就是"池慢慢被吃满"**。把它设成一个有限值（比如最长合理查询时间的 1.5 倍）是一行配置换一个故障模式的典型。

## 六、连接泄漏与"池打满"的四种根因 {#leaks}

### 6.1 泄漏长什么样

**连接泄漏 = 借出的连接没有被归还。**它是渐进式的：一条泄漏不起眼，一天漏几十条就会把池吃空。

| 症状 | 特征 |
|---|---|
| `active` 单调上升、`idle` 降到 0 | 与时间相关，重启应用后恢复 |
| 报 `connectionTimeout`（"等待连接超时"） | 从某时刻开始集中出现 |
| MySQL 侧 `Threads_connected` 持续上涨 | **即使业务量没变**——这是最有力的证据 |
| 重启后立刻变正常，过一段时间复发 | 泄漏还在（重启只是清空了池） |

**常见成因**（按出现频率）：

| 成因 | 具体形态 |
|---|---|
| **流/结果集未关** | `ResultSet` / `Statement` 未关闭。**虽然连接归还时通常会被清理，但某些驱动/场景下会持有连接** |
| **异常路径没走 `finally`** | 手工获取连接，成功时 `close()`，异常时直接抛出——**try-with-resources 就是为了消灭这个模式** |
| **事务里包了 RPC / MQ / 文件 IO** | 不是泄漏，但**连接被长时间占用**，效果一样 |
| **`@Transactional` 在自调用下失效** | 事务没生效，但连接仍被持有（见 [AOP 的失效场景](/java/spring/spring-framework/aop/)） |
| **异步线程里用了请求线程的 `DataSource` 且没归还** | 常见于手写线程池 + 手动取连接 |
| **连接池被两层嵌套包装** | 框架层取一次、业务层又取一次，其中一层没还 |

### 6.2 "池打满"的四种根因

**看到"连接池打满"，先分类再动手**——四类的处理方向完全不同：

| 根因 | 判断依据 | 处理方向 |
|---|---|---|
| **① 连接泄漏** | `active` 随时间单调上升，重启后归零并重新爬升 | 修代码（开 `leakDetectionThreshold` 定位） |
| **② 慢查询占住连接** | `active` 在业务高峰贴顶、`Threads_running` 也高 | 优化 SQL（见[慢查询定位](/database/mysql/diagnosis)）；**加池无效** |
| **③ 池确实太小** | `pending` 持续 > 0，但数据库侧 CPU、`Threads_running` 都不高 | 按[第四节](#sizing)推导后适度调大 |
| **④ 数据库侧连接被占满** | 应用报"连接超时"但 `Threads_connected` 已达 `max_connections` | 查是哪个应用/哪批连接占的（见下），必要时限流或加代理 |

**第 ④ 类的定位靠数据库侧，而不是应用侧**：

```sql
-- 当前连接按用户 / 来源主机聚合：是谁把连接占满了
SELECT user, host, COUNT(*) AS conns
FROM information_schema.processlist
GROUP BY user, host ORDER BY conns DESC;

-- 正在执行的（排除 Sleep）：真正在跑的语句
SELECT id, user, host, db, command, time, state, LEFT(info, 120) AS sql_head
FROM information_schema.processlist
WHERE command <> 'Sleep'
ORDER BY time DESC LIMIT 20;

-- 一个更有效的角度：Sleep 很久的连接 —— 多半来自"没归还"的应用
SELECT user, host, COUNT(*) AS sleeping
FROM information_schema.processlist
WHERE command = 'Sleep' AND time > 300
GROUP BY user, host ORDER BY sleeping DESC;
```

> **"大量长时间 Sleep 的连接"几乎可以确诊为应用侧问题**（池没归还、或者根本没有池）。**因为一个健康的池不会让连接在服务端睡几个小时**——它要么被复用、要么按 `maxLifetime` 主动淘汰。

## 七、与 MySQL 侧参数的配合 {#mysql-side}

**连接池的参数与 MySQL 的参数必须成对看**。最经典的一对是：

### 7.1 `maxLifetime` 与 `wait_timeout`

```
MySQL: wait_timeout = 28800（默认 8 小时）
应用: maxLifetime  = 1800000（默认 30 分钟）

→ 30 分钟就被应用主动淘汰重建，永远活不到 8 小时 ✅ 默认是安全的
```

**但反过来说就不安全了**：如果 `wait_timeout` 被调小（比如云数据库常设 300 秒），而 `maxLifetime` 保持 30 分钟：

```
MySQL 在 5 分钟时掐掉空闲连接
应用以为它还在（池里仍是 idle）
借出去 → 第一次使用报：Communications link failure / The last packet successfully
        received from the server was ... milliseconds ago
```

**这是"应用空闲一段时间后，第一个请求必失败"的经典成因**，而且它是**间歇性**的（只发生在被掐之后、连接被淘汰之前），最难排查的一种形态。

**规则：`maxLifetime` 必须显著小于 `wait_timeout`**（留出几秒余量即可，HikariCP 会自动加一点抖动，避免所有连接同时被淘汰）：

```yaml
# 云数据库 wait_timeout = 300s 时
hikari:
  max-lifetime: 240000      # 4 分钟 < 5 分钟
  keepalive-time: 120000    # 2 分钟心跳，进一步避免被判空闲
```

### 7.2 其他几对必须一起看的

| 参数对 | 关系 | 配错的后果 |
|---|---|---|
| `max_connections` vs `实例数 × maximumPoolSize` | 后者必须显著小于前者（留出运维与备份的连接） | "Too many connections" |
| `max_user_connections` | 按账号限制，容易与全局限制叠加 | 应用报错但 `Threads_connected` 看起来没满 |
| `wait_timeout` / `interactive_timeout` | 会话级变量，**超时会话的判定用哪个取决于连接类型** | 只改了一个，另一个仍生效 |
| `thread_cache_size` | 缓存空闲线程，减少频繁建连的线程创建开销 | 建连频繁时 CPU 抖动 |
| `net_write_timeout` | 服务端写响应超时 | 大结果集传输中断 |

**中间件的存在会改变这一切**：如果是通过 ProxySQL、云数据库代理（RDS Proxy 类）连接，**真正的 `wait_timeout` 可能来自代理而非 MySQL**——排查时不能只看 DB 参数，要看整条路径上谁可能先掐连接。这也是"配置漂移"的典型来源之一。

## 八、观测与压测 {#observe}

**连接池必须被监控，否则前面七节全部落空。** HikariCP 通过 Micrometer 暴露指标，Spring Boot Actuator 下默认可用：

| 指标 | 面板上的含义 | 该配的告警 |
|---|---|---|
| `hikaricp_connections_active` | 正在被使用 | > 80% 上限 持续 5 分钟 |
| `hikaricp_connections_idle` | 空闲可用 | 长期为 0 |
| `hikaricp_connections_pending` | **等待线程数** | **> 0 持续 1 分钟**（最高价值的一条） |
| `hikaricp_connections_timeout_total` | 借连接超时累计 | 任何非零增长都值得看 |
| `hikaricp_connections_acquire_seconds` | 借连接耗时分布 | P99 抬头即为信号 |
| `hikaricp_connections_usage_seconds` | 连接被持有的时长分布 | P99 增大 = 每条连接被占用更久 |

配上 MySQL 侧的两个（`Threads_connected` / `Threads_running`），**池内与池外就能对齐看**：

```
pending 高 + Threads_running 低  → 池太小（数据库还有余力）
pending 高 + Threads_running 高  → 慢查询占住连接（加池无用）
active 单调上升 + 重启归零        → 泄漏
active 满 + pending 为 0          → 刚好用满，还没到排队（临界，值得关注）
```

**压测时的判断**（配合[容量测算](/projects/property-saas/capacity-and-perf/)）：**逐步加压，盯住"吞吐量开始下降、而池 active 已贴顶"的那个拐点**。这个拐点就是数据库的实际并行能力——**它通常远小于"很多人以为的"连接数**，而池大小就应该定在它附近，而不是定在"压测里没报错的最大值"上。

> **最后一个容易忽略的观测点：启动阶段。** 应用启动时一次性把池填满（`minimumIdle` 较大时）会产生一个连接尖峰；如果多个实例同时重启（滚动发布、集群重启），**这个尖峰会撞上 `max_connections`**——发布时"连接被拒"的原因常在这里，而不是在流量上。它属于[发布清单](/cloud-native/cicd/rollback-and-migration#checklist)里该被检查的一项。

## 九、面试口径 {#interview}

| # | 问题 | 一句话答案 |
|---|---|---|
| 1 | 为什么需要连接池？ | 三个收益，按价值排序：**① 限流**——池大小就是应用对数据库的并发上限，把"无限并发"变成可观察、可拒绝的排队；**② 复用**——省掉 TCP 握手与认证（建连成本常是查询本身的数倍）；**③ 可观测**——`active`/`idle`/`pending` 是数据库压力的直接指标 |
| 2 | 连接池是不是越大越好？ | **不是，而且常常相反**。超过数据库并行能力的连接只是把队列从"你的池"挪到"数据库的锁与调度器"上：上下文切换增加、锁等待加剧、单查询变慢导致连接被占用更久，**吞吐下降而池依然打满**。**先问"为什么每条连接被占这么久"，再考虑加池** |
| 3 | 池大小怎么定？ | 两个角度取小值：**Little's Law**（`目标 QPS × 平均耗时`，算"处理这些流量要多少并发"）与**数据库并行能力**（`核数 × 2 + 有效磁盘数`，算"数据库能真正并行多少"）。**并且别忘了乘实例数**：`实例数 × maximumPoolSize` 必须小于 `max_connections` |
| 4 | HikariCP 有哪些关键参数？ | `maximumPoolSize`（默认 10，几乎总要改）、`connectionTimeout`（默认 30s，Web 场景通常压到 1~3s）、`maxLifetime`（默认 30min，**必须小于 MySQL `wait_timeout`**）、`idleTimeout`（**只在小池模式生效**）、`minimumIdle`（默认等于 maximum）、`keepaliveTime`（默认禁用）、`leakDetectionThreshold`（默认禁用，排查时开） |
| 5 | `minimumIdle` 设了为什么 `idleTimeout` 才生效？ | HikariCP 的设计取向是**固定大小的池**：`minimumIdle` 默认等于 `maximumPoolSize`，池长期保持满配，空闲连接不会被回收。**只有把 `minimumIdle` 调小于上限，`idleTimeout` 才有意义**。固定池的收益是"每次都是热连接"，代价是空闲时占着数据库连接 |
| 6 | `maxLifetime` 和 `wait_timeout` 什么关系？ | **`maxLifetime` 必须显著小于 `wait_timeout`**。否则 MySQL 会先掐掉空闲连接，而池仍以为它可用——借出去第一次使用就报 `Communications link failure`，表现为"**应用空闲一段时间后，第一个请求必失败**"，间歇出现、极难排查。云数据库 `wait_timeout` 常被调小，这处更容易踩 |
| 7 | 为什么连接池的等待时间要比接口超时短？ | 因为**内层超时必须先于外层生效**，才能把超时变成"有明确错误信息的返回"。若 `connectionTimeout` 比上游超时长，上游先返回 504，而应用还在等——**用户看到 504，日志里却没有超时记录**，这是最难定位的一类故障。正确方向：内层 < 外层（浏览器 > 网关 > 池等待 + 查询 > `socketTimeout`） |
| 8 | `socketTimeout` 默认值有什么风险？ | 默认为 **0（无限等待）**。一个卡住的查询会让线程永远挂住——连接不归还、线程不释放，**表现就是"池慢慢被吃满"**。把它设成有限值（最长合理查询时间的 1.5 倍左右）是一行配置换掉一个故障模式 |
| 9 | 怎么发现连接泄漏？ | 症状：`active` 单调上升、`idle` 归零、MySQL 侧 `Threads_connected` 上涨而业务量没变、**重启后恢复但过段时间复发**。定位：开 `leakDetectionThreshold`（排查期开，定位后关——有性能开销且会误报长事务）。修复方向：**try-with-resources**、消除异常路径中未关闭的连接 |
| 10 | "连接池打满"有哪些可能？ | 四种根因，处理方向完全不同：**① 泄漏**（active 单调上升、重启归零）；**② 慢查询占住连接**（`Threads_running` 也高，加池无效）；**③ 池确实太小**（`pending` 持续 > 0，但数据库侧 CPU/`Threads_running` 不高）；**④ 数据库侧连接被占满**（`Threads_connected` 已达 `max_connections`，要去 DB 侧按 user/host 聚合定位） |
| 11 | 怎么判断是应用问题还是数据库问题？ | 对齐看两个指标：**`pending` 高而 `Threads_running` 低 → 池太小**；**两者都高 → 慢查询占住连接**。再加一条很有效的 DB 侧查询：**`command='Sleep'` 且 `time` 很大的连接特别多**，几乎可以确诊为应用侧没归还（健康的池不会让连接在服务端睡几个小时） |
| 12 | 连接池该监控哪些指标？ | HikariCP 六个（通过 Micrometer）：`active` / `idle` / **`pending`** / `timeout_total` / `acquire_seconds` / `usage_seconds`，加 MySQL 侧 `Threads_connected` 与 `Threads_running`。**最该告警的是 `pending > 0` 持续存在**——此时还没报错，但请求已经在排队了，这是"性能问题"与"故障"之间的分界线 |
| 13 | 容器化之后连接池有什么特别要注意的？ | **实例数会放大总连接数**：`实例数 × maximumPoolSize`，且 **HPA 扩容会动态放大它**（4 → 20 副本就是 5 倍）。本地开发时 20 的池，上了 K8s 起 10 个 Pod 就是 200 条，直接超过 `max_connections` 默认的 151。对策：反推池大小，或引入数据库代理统一池化。**另外注意滚动发布时多实例同时填池会形成连接尖峰** |

> **这一篇在[成长路线](/projects/architect-roadmap/)里的位置**：属 [L2 高级开发](/projects/architect-roadmap/senior/)的缺口——L1 只要"会用默认配置"，**L2 要能解释"连接池打满"这条线上最常见的根因之一**，并且能把它讲成"超时对齐 + 背压"而不是"把池调大"。[L3 架构师](/projects/architect-roadmap/architect/)要处理的是**跨服务的连接预算与容量规划**（见[容量测算](/projects/property-saas/capacity-and-perf/)）。

> 回到：[MySQL · 导览](/database/mysql/)　|　相关：[慢查询定位与 SQL 优化](/database/mysql/diagnosis)　|　相关：[发布即故障：连接池与线程池耗尽](/cloud-native/cicd/rollback-and-migration#release-incidents)
