---
date: 2026-09-17
title: L2 高级开发 · 能负责一块，并对线上问题给出根因
desc: 从「交付」到「负责」的七步阅读顺序——并发、JVM、数据原理、框架原理、消息、第二数据库与工程质量；第七步接上慢请求剧本、容器内 JVM 与扩展-收缩，另附 Agent 循环、跳过表、离场自检与原缺口已补齐后的读法
order: 2
---

# L2 高级开发 · 能负责一块，并对线上问题给出根因

> **口径说明**：这一页是[成长路线](/projects/architect-roadmap/)的第二级清单，回答的是「**在这一级，这些页读到哪就该停**」——不是「这些页属于这一级」。同一篇文章会在多个级别出现，只是每一级拿走的深度不同；级别是读者侧的属性，不是页面侧的（见[成长路线的第四节](/projects/architect-roadmap/#levels-as-relation)）。上一级见 [L1 开发](/projects/architect-roadmap/developer/)。

## 一、这一级的判据

L2 的分水岭不是「多学了几项技术」，而是**责任范围**变了：从「我交付一个模块」到「**我负责这一块，出事我说话**」。别人不再盯你的进度，而是等你的结论。

| 维度 | 进入这一级（应该已经会） | 走完这一级（应该能做到） |
|---|---|---|
| **交付** | 拿到需求自己拆步骤、自己交付 | 对一整块业务负责：排期、风险、上线、回滚，都由你判断 |
| **代码** | 能说清「为什么这样写」，能 review 出明显问题 | 能定这一块的边界与分层；并发与状态管理成为默认要考虑的事 |
| **数据** | 看得懂 `EXPLAIN`，能定位一个慢查询 | 能解释 SQL 在存储引擎里怎么走、事务与锁如何互相阻塞、主从延迟从哪来 |
| **问题** | 有固定前三步：指标 → 日志 → 线程栈 | 能从现象推到**根因**（内存泄漏 / 连接池打满 / 锁等待 / 慢 SQL 阻塞），并给出修复与验证 |
| **验证** | 能写别人可重复执行的测试 | 能设计质量门禁（覆盖哪些、放弃哪些），让回归自动跑 |

**如果你的差异不在「技术学得不够」**，那多半是这条链没闭合：现象 → 机制 → 根因 → 修复 → 验证。L1 要求你走完前三步就停，L2 要求你走完全链。下面七步里第一到第四步负责「机制」，第五到第七步负责「根因之外的系统视角」。

## 二、七步阅读顺序

顺序仍是**按依赖排的，不是按板块排的**。并发与 JVM 排在最前，因为后面所有「线上问题」的现场都在它们里面；消息排在框架之后，因为它是本级第一次真正碰到「跨进程」的构件。

### 第一步 · 并发：从「会用」到「能解释」

并发是 L2 的主战场。本级的要求不是「知道有这些工具」，而是**看到一段代码能指出它在哪一条性质上不安全**（可见性 / 原子性 / 有序性）。

| 页 | 本级怎么读 |
|---|---|
| [并发 · 导览](/java/concurrent/)、[三层结构](/java/concurrent/#system) | 先读这一节建立地图——本级要拿走的是前两层 |
| [线程基础与生命周期](/java/concurrent/thread-basics) | 全读——状态机、`interrupt` 的语义、`wait` / `sleep` 的真实差别 |
| [线程安全与可见性](/java/concurrent/thread-safety) | 全读——**本级第一重点**：`volatile` 解决什么、不解决什么，Happens-Before 是怎么给你保证的 |
| [线程池](/java/concurrent/thread-pool) | 全读——七参数、拒绝策略、队列选择，以及「线程池为什么会打死下游」 |
| [ThreadLocal](/java/concurrent/threadlocal) | 全读——内存泄漏那条引用链要能自己画出来；线程池下为什么要 `remove` |
| [AQS 与锁](/java/concurrent/aqs-locks) | 全读——`ReentrantLock` 与 `synchronized` 的差别要能逐条说；自己实现一个同步器留到面试前 |
| [CAS 与原子类](/java/concurrent/cas-atomics) | 全读——ABA 问题、自旋成本、`LongAdder` 为什么比 `AtomicLong` 快 |
| [并发容器](/java/concurrent/concurrent-collections) | 全读——`ConcurrentHashMap` 的扩容与分段思想，和 L1 的 `HashMap` 连起来 |
| [JUC 工具类](/java/concurrent/juc-tools) | 读 `CountDownLatch` / `Semaphore` / `CyclicBarrier` 三类，重点是「各自适合什么协作模式」；其余按需 |
| [CompletableFuture](/java/concurrent/completable-future) | 读到「能把串行的三段远程调用改成并行、并统一处理异常」为止；组合子太多，用到再查 |

### 第二步 · JVM：从「读懂线程栈」到「能下结论」

L1 只要求「会看」。L2 要求**看到堆内存曲线能说出下一步拿什么工具、拿到之后先看什么**。

| 页 | 本级怎么读 |
|---|---|
| [Java 虚拟机 · 导览](/java/jvm/) | 全读 |
| [运行时数据区](/java/jvm/memory) | 全读——重点是「哪些区域会 OOM、各自怎么触发」 |
| [类加载机制](/java/jvm/classloading) | 读到「双亲委派解决什么问题，以及三种打破它的真实场景」 |
| [垃圾回收算法](/java/jvm/gc) | 全读——标记 / 复制 / 整理的取舍，是理解 STW 的前提 |
| [垃圾收集器](/java/jvm/collectors) | 读到「G1 凭什么能预测停顿」；ZGC / Shenandoah 只记定位与代价 |
| [调优与线上排查](/java/jvm/tuning) | 全读——**本级第二重点**，也是面试高分区 |
| [堆转储与 MAT](/java/jvm/heap-dump-analysis) | 全读——**「会看 dump」是 L2 与 L1 的硬分界**：支配树、引用链、谁在持有 |
| [Arthas 在线诊断](/java/jvm/online-diagnostics) | 全读——不改代码问一个问题的能力，出事时最实用 |
| [火焰图与性能剖析](/java/jvm/profiling) | 读到「on-CPU 与 off-CPU 各自回答什么问题」；JFR 事件按需 |
| [JDK 命令行排查](/java/jvm/troubleshooting-cli) | 回读 [`#jmap`](/java/jvm/troubleshooting-cli#jmap) 与 [`#jcmd`](/java/jvm/troubleshooting-cli#jcmd) 两节——L1 只读了五件套分工与 `jstack` |

### 第三步 · 数据：从「会用」到「懂原理」

| 页 | 本级怎么读 |
|---|---|
| [日志体系 redo / undo / binlog](/database/mysql/log) | 全读——三者的分工与写入顺序，是后面一切的前提 |
| [MVCC 与锁](/database/mysql/mvcc) | 全读——**本级最硬的一篇**：Read View、快照读与当前读、间隙锁为什么存在 |
| [事务：ACID 与隔离级别](/database/mysql/transaction) | 回读——这次读到 MVCC 的实现层，而不只是「四种隔离级别防住了什么」 |
| [索引设计：原则、覆盖索引与失效](/database/mysql/index-design) | 回读——这次读「为什么必须守最左前缀」与「失效的每一种情形」 |
| [索引底层：B+ 树与聚簇索引](/database/mysql/index-structure) | 回读——这次读到页分裂与回表，"索引还能不能救这个查询"的判断从这来 |
| [主从复制](/database/mysql/replication) | 全读——延迟从哪来、读写分离会读到什么 |
| [Redis · 底层原理](/database/redis/internals) | 全读——单线程模型、渐进式 rehash、过期与淘汰策略 |
| [持久化与集群](/database/redis/ha-cluster) | 全读——RDB / AOF 取舍、主从与哨兵、集群的槽与重定向 |
| [分布式锁与消息队列](/database/redis/lock-and-mq) | 读到「锁的三个必须：互斥 / 防死锁 / 防误删」；Redlock 的争议留 L3 |
| [缓存模式：三大问题与一致性](/database/redis/cache-patterns) | 回读——这次读一致性四档怎么选，而不只是「三大问题各是什么」 |
| [多级缓存](/database/redis/multilevel-cache) | 全读——本级要能为「加一层本地缓存」说出它带来的新问题 |
| [最佳实践](/database/redis/best-practices)、[特殊数据类型](/database/redis/special-data-types)、[场景与选型](/database/redis/scenarios) | 按需在检索时查——本级不要求通读 |

### 第四步 · 框架原理：本级最厚的一步

L1 的框架停在「会用 + 知道容器管了什么」；L2 要求**能解释框架替你做的每一个决定**，因为线上问题的根因经常就藏在那些决定里。

| 页 | 本级怎么读 |
|---|---|
| [IoC 容器与依赖注入](/java/spring/spring-framework/ioc/) | 回读——这次读容器启动流程与 `refresh()` 的十二步 |
| [循环依赖与三级缓存](/java/spring/spring-framework/bean/circular-dependency) | 全读——「为什么字段注入能解决、构造注入不能」，是 L1 那半篇的正面回答 |
| [Bean 的线程安全](/java/spring/spring-framework/bean/thread-safety) | 全读——单例 Bean 里到底什么是共享状态 |
| [AOP 与代理机制](/java/spring/spring-framework/aop/) | 回读——这次读两种代理实现的差别，以及增强为什么会失效 |
| [声明式事务与传播行为](/java/spring/spring-framework/aop/transaction) | 回读——这次读传播行为矩阵与失效的全部情形，本级最容易出事故的一篇 |
| [自动配置原理](/java/spring/spring-boot/auto-configuration) | 回读——这次读到自定义 Starter 的三段式 |
| [自定义 Starter](/java/spring/spring-boot/starter) | 全读——「公司内部脚手架」级别的能力 |
| [启动流程](/java/spring/spring-boot/startup) | 全读——启动慢、启动就挂，都在这条链上 |
| [内嵌容器与请求进入](/java/spring/spring-boot/web-server) | 回读——这次读 Tomcat 三参数与线程模型，以及[虚拟线程](/java/spring/spring-boot/web-server#virtual-threads)：**能说清什么时候不该用**，不当成默认加速开关 |
| [MyBatis 执行流程与集成](/java/spring/spring-framework/mybatis/) | 回读——SQL 会话、一级 / 二级缓存、批处理的真实代价 |
| [缓存抽象](/java/spring/spring-framework/crosscutting/cache)、[异步执行](/java/spring/spring-framework/crosscutting/async)、[重试与并发限制](/java/spring/spring-framework/crosscutting/resilience) | 三篇全读——L1 跳过的正是这一组：它们决定「横切能力该由框架做，还是该自己做」 |
| [出站 HTTP：超时对齐与调用预算](/java/spring/spring-framework/crosscutting/outbound-http) | **全读**——出站超时必须短于入站剩余；HTTP 客户端池与 Hikari 是两套池。Feign / 负载均衡不读（留 L3） |
| [序列化与类型边界](/java/spring/spring-framework/crosscutting/json) | 按需回查——L1 只读了时间类型与 `Long` 精度两节 |

### 第五步 · 消息：本级第一次跨进程

这一级**不要求你会做分布式设计**（那是 L3），只要求你能回答三个问题：**消息会不会丢、会不会重、会不会乱序。**

| 页 | 本级怎么读 |
|---|---|
| [消息队列 · 导览](/middleware/)、[选型](/middleware/#selection)、[阅读顺序](/middleware/#reading-order) | 先读这三节——本站有三条线（Kafka / RabbitMQ / MQTT），本级**选一条读完，另一条只读核心模型与可靠性** |
| Kafka 主线：[存储](/middleware/kafka/storage) → [高可用](/middleware/kafka/high-availability) → [可靠性](/middleware/kafka/reliability) → [顺序](/middleware/kafka/ordering) → [性能](/middleware/kafka/performance) | 按序读完——分区与副本是理解后面一切的骨架 |
| RabbitMQ 主线：[核心模型](/middleware/rabbitmq/core-model) → [可靠性](/middleware/rabbitmq/reliability) → [积压处理](/middleware/rabbitmq/backlog) → [死信](/middleware/rabbitmq/dead-letter) → [高可用](/middleware/rabbitmq/high-availability) | 按序读完——重点在确认机制与投递语义 |
| [RocketMQ](/middleware/rocketmq/)、[MQTT](/middleware/mqtt/) | 按岗位方向读——IoT / 车联网方向看 MQTT，其余按需 |
| [RPC 与协议](/middleware/rpc/) | **本级跳过**——留 L3（本级还没有「跨团队选协议」的场景） |

**离开这一步的判据**：给你一段「下单成功后发消息扣库存」的伪代码，你能指出它可能丢在哪一步、重在哪一步、乱在哪一步。

### 第六步 · 第二数据库：知道选型的代价

本级不要求你精通第二种数据库，但要求你**知道它的边界在哪**——因为「该不该换」这个问题，L2 就要参与。

| 页 | 本级怎么读 |
|---|---|
| [PostgreSQL](/database/postgresql/)、[PostgreSQL vs MySQL](/database/postgresql/vs-mysql) | 读 `vs-mysql` 定选型判据——本站只要求你说清「各自适合什么、选它的代价是什么」 |
| [MongoDB](/database/mongodb/)、[NoSQL 选型](/database/mongodb/nosql-selection) | 读选型篇——文档模型的代价（弱事务、无 join、索引膨胀）比它的好处更重要 |
| [分库分表](/database/sharding/) | **只读前三分之一**：什么时候该分、分片键怎么选、分完之后失去什么；迁移与在线扩容留 L3 |

### 第七步 · 工程质量：让「负责」可持续

| 页 | 本级怎么读 |
|---|---|
| [覆盖率与质量门禁](/java/testing/quality-gates) | 全读——L1 跳过的那一篇：门禁不是「覆盖率越高越好」，而是「哪一类缺陷必须被拦住」 |
| [集成测试与真实依赖](/java/testing/integration-test) | 回读——这次读「用容器起真依赖」的那部分 |
| [CI/CD 与发布](/cloud-native/cicd/)、[流水线设计](/cloud-native/cicd/pipeline-design) | **只读流水线设计**——本级要求能改流水线、能解释「为什么构建慢」；灰度与蓝绿留 L3 |
| [Linux 排查实战](/fundamentals/os/linux-tools) | 回读——L1 只读了四个方向；这次把场景推演走完。**仍是先分类再动手，不调参碰运气** |
| [Docker · 容器内 JVM](/cloud-native/docker/#jvm-in-container) | 全读这一节——堆 ≠ RSS、OOMKill 与 `ExitOnOutOfMemoryError`。namespace / 多阶段构建仍留 L3 通读 |
| [回滚与数据库变更 · 扩展-收缩](/cloud-native/cicd/rollback-and-migration#expand-contract) | **只读这一节**——改表走 expand-contract，回填脚本能中途 kill 再重跑。发布策略全集留 L3 |
| [应用日志](/java/spring/spring-boot/logging#mdc) | 回读——这次读手工线程 / 线程池 / `@Async` 会丢 MDC。Loki / 成本 / ELK 仍不读 |
| [慢请求剧本](/cloud-native/observability/slow-request) | **全读决策树**——先范围后哪一跳；出站 / Hikari / 本进程是分支。**不读** SLI 怎么定、错误预算怎么向业务解释（仍在 SLO 篇，留 L3） |
| [故障复盘](/projects/toolkit/postmortem/) | 读 Why / What 与模板——根因查清之后用时间线写成机制改动。演练与混沌不读 |

### 本级附读 · Agent 循环

L1 停在闸门。本级要能解释「**模型相同，Harness 决定上限**」——线上一次 AI 调用挂住，你得知道循环为什么停不下来：

| 页 | 本级怎么读 |
|---|---|
| [Agent 循环](/ai/agent-harness/#agent-loop) | 全读——闭环、终止判据必须来自外部可验证信号 |
| [Harness 是什么](/ai/agent-harness/#what-is-harness) | 读到六个组成部分各自管什么 |
| 工具调用机制、MCP 规范、多 Agent | **本级跳过**——留 L3（本级还没有「把 LLM 接进主链路」的设计场景） |

## 三、本级明确跳过的内容

| 跳过的东西 | 留到 | 为什么可以跳 |
|---|---|---|
| 分布式一致性协议（Paxos / Raft）、协调服务 | L3 | 本级还碰不到「多个副本要就一个值达成一致」的场景 |
| Spring Cloud 全家桶、网关、注册中心 | L3 | 单体和模块化还没拆完，先不要引入服务治理 |
| RPC 与协议、序列化选型 | L3 | 同上——先有跨团队边界，再谈协议 |
| 高可用容灾、多机房、单元化 | L3 | 本级先保证「单机房不出事」 |
| 安全认证授权体系（OAuth2 / SSO / 等保） | L3 | 本级只需会接入现成的认证，不需要设计 |
| 可观测的**设计侧**（PromQL / SLO 定义 / 选型成本） | L3 | 使用侧（[应用日志](/java/spring/spring-boot/logging)、[慢请求剧本](/cloud-native/observability/slow-request)）本级必读；设计体系留 L3 |
| CI/CD 的灰度、蓝绿、GitOps | L3 | 本级先把「构建 → 测试 → 制品」这条链跑顺；expand-contract 已在第七步 |
| K8s / Helm / 服务网格 / Operator、Docker 通读 | L3 | 本级读容器内 JVM 就够；编排与镜像原理留 L3 |
| 数据仓库、Flink、ClickHouse、数仓分层 | L3 / 按需 | 属于数据侧另一条职业线，不是后端主线 |
| DDD 与架构风格对比 | L3 | 本级先把「这一块怎么划边界」做扎实 |
| 分库分表的迁移与在线扩容 | L3 | 本级只判断「要不要分」 |
| 剩余 18 种设计模式 | 面试前按需 | L2 的增量在原理与并发，不在模式数量 |
| MCP 规范、多 Agent、Spring AI | L3 | 本级只要 Agent 循环与终止判据 |

## 四、离场自检：六个问题

**这一级不是「读完某个页面」就算过。** 下面六个问题能否当场说清，决定了你是在「用工具」还是在「懂机制」：

| # | 问题 | 检验的是 |
|---|---|---|
| 1 | 这段代码在多线程下会出什么问题？——可见性、原子性、有序性分别被哪一行破坏？ | 第一步 |
| 2 | 线上堆内存缓慢上涨，OOM 之前你会先取哪两样东西？拿到 dump 之后第一眼看什么？ | 第二步 |
| 3 | 两个事务互相等待，你怎么确认是间隙锁而不是行锁？`Read View` 又在什么时候生成？ | 第三步 |
| 4 | `@Transactional` 里 catch 住了异常，为什么事务还是提交了？改成 `REQUIRES_NEW` 之后，为什么日志会出现「先写后滚」？ | 第四步 |
| 5 | 消息重复消费导致对账不平，你先查生产者重投还是先补消费者幂等？依据是什么？ | 第五步 |
| 6 | 单表 8000 万行、查询只剩主键条件——你判断「该分表」还是「该换数据模型」？依据是什么？ | 第六步 + 第三步 |

第 6 题是 L2 的门槛题：它同时考「分片的代价」（分片键选错之后，报表与事务会一起塌）与「索引还能不能救」（覆盖索引是否已经失效）。

## 五、本站已补齐的内容（原缺口）

| 原缺口 | 现在读 | 本级读到哪一层 |
|---|---|---|
| **连接池**（HikariCP 参数 / 连接泄漏 / 池大小推导） | [连接池：参数、池大小与超时对齐](/database/mysql/connection-pool) | **第四、五、六节必须读**——池大小由下游能力推导（而不是「越大越好」）、链路上五个超时的对齐方向、以及「池打满」的四种根因各对应哪种处理。第七节的 `maxLifetime` 与 `wait_timeout` 关系要能当场说清 |

这一项之所以是 L2 的缺口而不是 L1 的：**L1 只要会用默认配置，L2 要能解释「连接池打满」这条线上最常见的根因之一。**

## 六、关联阅读

| 你想干什么 | 去哪 |
|---|---|
| 回看 L1 的清单（本级的前置） | [L1 开发 · 能独立交付一个模块](/projects/architect-roadmap/developer/) |
| 往上走一级 | [L3 架构师 · 能设计系统，并为取舍负责](/projects/architect-roadmap/architect/) |
| 回到路线总览，看自己在哪一级 | [成长路线](/projects/architect-roadmap/) |
| 看「这些知识会被问到多深」 | [面试专题的四层次](/interview/#layers) 与[按轮次的复习路径](/interview/#rounds) |
| 看别人怎么把这些原理用在真实系统里 | [项目实战](/projects/)、[架构演进地图](/projects/architecture-evolution/#matrix) |
| 提前准备「拿什么证明我做过」 | [可验证产出工具箱](/projects/toolkit/)（立项三件套 + 出事之后的[故障复盘](/projects/toolkit/postmortem/)） |
| 看本级 AI 该读到哪一层 | [AI 应用 · 按四级读](/ai/#by-level) |
