---
date: 2026-09-17
title: L1 开发 · 能独立交付一个模块
desc: 从「能改功能」到「能独立交付」的七步阅读顺序，每一步给出页清单与「读到哪一层就停」；第七步接上日志字段、Compose 与 Linux 分类，另附 AI 闸门、跳过表、离场自检与原缺口已补齐后的读法
order: 1
---

# L1 开发 · 能独立交付一个模块

> **口径说明**：这一页是[成长路线](/projects/architect-roadmap/)的起点清单。它回答的是「**在这一级，这些页读到哪就该停**」——不是「这些页属于这一级」。同一篇文章会在多个级别出现，只是每一级拿走的深度不同；级别是读者侧的属性，不是页面侧的（见[成长路线的第四节](/projects/architect-roadmap/#levels-as-relation)）。读完这一级，往上一级见 [L2 高级开发](/projects/architect-roadmap/senior/)。

## 一、这一级的判据

L1 的分水岭不是「会多少技术」，而是**交付方式**变了：从「有人告诉我做什么」到「我拿一个需求能自己做完」。

| 维度 | 进入这一级（应该已经会） | 走完这一级（应该能做到） |
|---|---|---|
| **交付** | 在别人搭好的框架里加接口、改页面、写 SQL | 拿到一个完整需求，自己拆步骤、自己判断边界情况、自己交付 |
| **代码** | 能读懂现有代码，模仿现有风格 | 能说清「为什么这样写」，能 review 出一个明显问题 |
| **数据** | 会写增删改查，会照着别人写的 SQL 改 | 知道哪些字段该建索引，看得懂 `EXPLAIN`，能定位一个慢查询 |
| **问题** | 出问题先问人、先重启 | 有固定的前三步：看指标 → 看日志（能用 `traceId` 找到那一次） → 看线程栈 |
| **验证** | 靠手工点一遍 | 能写出别人可重复执行的测试，能说明「什么没测」 |

**如果上表右列你还做不到，说明差异通常不在「学的技术不够」，而在两块以前从没被要求过的东西：测试与排查。** 这也是下面七步里第五、六、七步存在的理由——它们不是「进阶内容」，而是这一级的基础配置。

## 二、七步阅读顺序

顺序是**按依赖排的，不是按板块排的**。第六步的测试放在框架之后，是因为它要测的是框架；第七步的排查放在最后，是因为它要读的是前面所有东西的运行时状态。

### 第一步 · 地基速通（只挑 6 篇）

地基共 38 页（见[成长路线的第二节](/projects/architect-roadmap/#foundation)），这一级**只挑下面 6 篇**，其余 32 页留到 L2 或面试前按需。

| 页 | 本级怎么读 |
|---|---|
| [分层与封装](/fundamentals/network/tcp-ip) | 全读——这是理解「请求在路上经历了什么」的纲 |
| [TCP 核心机制](/fundamentals/network/tcp) | 全读——握手/挥手、重传、拥塞控制，排查超时的依据 |
| [HTTP 演进：1.1 → 2 → 3](/fundamentals/network/http) | 全读——但重点放在「1.1 卡在哪、2 和 3 各解决了什么」 |
| [进程、线程与调度](/fundamentals/os/process-thread) | 全读——进程与线程的区别、上下文切换的成本，是后面并发的根 |
| [复杂度分析](/fundamentals/algorithms/complexity) | 全读——面试必考，也是判断代码好坏的尺子 |
| [线性结构：数组、链表、栈、队列](/fundamentals/algorithms/linear) | 读「数组与链表的真实差别」那部分；栈与队列的应用场景可以跳过 |
| [计算机基础导览](/fundamentals/#reading) | 当索引看——遇到问题知道去哪一页翻 |

### 第二步 · 语言与集合

| 页 | 本级怎么读 |
|---|---|
| [Java 基础 · 导览](/java/basics/) 与 [高频考点速查](/java/basics/#faq) | 全读——先建立九篇的地图 |
| [面向对象与 Object 契约](/java/basics/oop-object) | 全读——`equals` / `hashCode` 契约是后面所有集合与缓存的前提 |
| [String 与包装类](/java/basics/string-wrapper) | 全读——常量池、不可变、包装类缓存，日常最容易踩 |
| [异常体系与 finally 的执行真相](/java/basics/exception) | 全读——尤其 `finally` 里的 `return` 会吞掉什么 |
| [泛型：类型擦除与 PECS](/java/basics/generics) | 读到「能从方法签名判断通配符该用哪个」为止；擦除带来的运行时限制留 L2 |
| [Java 8 核心特性](/java/basics/java8) | 读到「Lambda / Stream / Optional 会用」；Stream 的惰性求值与并行流的坑留 L2 |
| [集合 · 导览](/java/collections/) 与 [底层选型](/java/collections/data-structure) | 全读——选型的判断依据比背结论重要 |
| [HashMap 实现原理](/java/collections/hashmap) | 全读——哈希、扩容、树化；这也是后面并发容器的前置 |
| [List：数组、ArrayList 与链表](/java/collections/list) | 全读 |
| [HashSet 与去重原理](/java/collections/hashset) | 全读——它回答的是「为什么重写了 `equals` 却还是去不掉重」 |
| [Java 9~21 演进](/java/basics/java9-21)、[注解](/java/basics/annotation)、[反射](/java/basics/reflection)、[IO 与 NIO](/java/basics/io-nio)、[TreeSet](/java/collections/treeset)、[LinkedHashMap](/java/collections/linkedhashmap) | **本级跳过**——注解与反射是 L2 框架原理的前置，其余用到再查 |

### 第三步 · 设计原则与五个最常用模式

| 页 | 本级怎么读 |
|---|---|
| [设计原则与 UML](/java/design-patterns/principles/) | 全读——原则是判断「这段代码要不要重构」的依据，比模式更常用 |
| [单例](/java/design-patterns/creational/singleton) | 全读——顺带理解为什么 Spring 默认单例 Bean 要注意线程安全 |
| [工厂方法](/java/design-patterns/creational/factory) | 全读 |
| [代理](/java/design-patterns/structural/proxy) | 全读——它是 Spring AOP 的直接前置，不读会看不懂事务为什么失效 |
| [策略](/java/design-patterns/behavioral/strategy) | 全读——消掉 `if-else` 的主力 |
| [模板方法](/java/design-patterns/behavioral/template-method) | 全读——框架里到处都是它 |
| 其余 18 种模式 | **本级跳过**——L2 起按需，用[导览的面试高频](/java/design-patterns/#interview)做检索入口 |

### 第四步 · 数据：先会查、会改，再懂为什么

| 页 | 本级怎么读 |
|---|---|
| [MySQL · 导览](/database/mysql/) 与 [面试高频清单](/database/mysql/#interview) | 全读——八篇的执行顺序 |
| [存储引擎：InnoDB 与 MyISAM](/database/mysql/storage-engine) | 全读——薄，但是后面事务与锁的前提 |
| [索引底层：B+ 树与聚簇索引](/database/mysql/index-structure) | 全读——「为什么是 B+ 树」这个问题面试必问 |
| [索引设计：原则、覆盖索引与失效](/database/mysql/index-design) | 全读——本级最实用的一篇 |
| [事务：ACID 与隔离级别](/database/mysql/transaction) | 读到「四种隔离级别各自防住了什么」；MVCC 的实现原理留 L2 |
| [慢查询定位与 SQL 优化](/database/mysql/diagnosis) | 全读——「拿一个慢查询能定位」是这一级的硬指标 |
| [日志体系 redo / undo / binlog](/database/mysql/log)、[MVCC 与锁](/database/mysql/mvcc)、[主从复制](/database/mysql/replication) | **本级跳过**——留 L2 |
| [Redis · 五层能力模型](/database/redis/#layers) | 读这一节——先知道自己现在只需要第一层 |
| [基础篇：数据模型与命令体系](/database/redis/basics) | 全读 |
| [缓存模式：三大问题与一致性](/database/redis/cache-patterns) | 读到「穿透 / 击穿 / 雪崩各是什么、各自的防线是什么」；一致性四档怎么选留 L2/L3 |
| [分布式锁与消息队列](/database/redis/lock-and-mq)、[底层原理](/database/redis/internals)、[持久化与集群](/database/redis/ha-cluster)、[多级缓存](/database/redis/multilevel-cache) | **本级跳过**——留 L2 |
| [PostgreSQL](/database/postgresql/)、[MongoDB](/database/mongodb/)、[分库分表](/database/sharding/) | **本级跳过**——L2 再选一门第二数据库 |

### 第五步 · 框架：会用，并知道容器替你管了什么

这一步是本级最厚的一步，也是「读到哪一层」最要紧的一步——**同一个页面里，前半是 L1、后半是 L2**。

| 页 | 本级怎么读 |
|---|---|
| [Spring 生态 · 导览](/java/spring/) | 全读 |
| [IoC 容器与依赖注入](/java/spring/spring-framework/ioc/) | **读到「能用注解把对象装起来、知道容器管了什么」为止**——容器启动流程、`refresh()` 的十二步、循环依赖的三级缓存留给 L2 |
| [AOP 与代理机制](/java/spring/spring-framework/aop/) | 读到「代理是怎么生成的、为什么自调用会让增强失效」；两种代理实现的差别留 L2 |
| [声明式事务与传播行为](/java/spring/spring-framework/aop/transaction) | 全读——本级最容易出事的一篇 |
| [Spring Boot：六块内容与依赖关系](/java/spring/spring-boot/#modules) | 全读这一节，然后按场景选入口 |
| [外部化配置体系](/java/spring/spring-boot/configuration) | 全读——配置优先级会直接决定线上行为 |
| [自动配置原理](/java/spring/spring-boot/auto-configuration) | 读到「条件装配是怎么回事」；自定义 Starter 的三段式留 L2 |
| [内嵌容器与请求进入](/java/spring/spring-boot/web-server) | 读到「请求从 TCP 到 `DispatcherServlet` 的完整链路」；Tomcat 三参数、静态资源、虚拟线程留 L2 |
| [Spring MVC 执行流程](/java/spring/spring-mvc/) | 全读 |
| [MyBatis 执行流程与集成](/java/spring/spring-framework/mybatis/) | 读到「Mapper 的动态代理是怎么回事」 |
| [参数校验与统一异常](/java/spring/spring-framework/crosscutting/validation) | 全读——两条异常链必须都知道，否则路径参数校验会报 500 |
| [序列化与类型边界](/java/spring/spring-framework/crosscutting/json) | **必读** [`#datetime`](/java/spring/spring-framework/crosscutting/json#datetime) 与 [`#long-precision`](/java/spring/spring-framework/crosscutting/json#long-precision)——离场自检第 4 题的答案就在这两节；循环引用、多态、Jackson 3 留到用到再查 |
| [横切能力 · 导览](/java/spring/spring-framework/crosscutting/) | 读分工那一节，其余按需 |
| [缓存抽象](/java/spring/spring-framework/crosscutting/cache)、[异步执行](/java/spring/spring-framework/crosscutting/async)、[重试与并发限制](/java/spring/spring-framework/crosscutting/resilience) | **本级跳过**——留 L2 |
| [Spring Cloud](/java/spring/spring-cloud/) | **本级跳过**——留 L3 |
| [大前端（小程序 / uni-app）](/frontend/) | 按岗位方向选读——后端岗本级跳过 |

### 第六步 · 测试：从「没人要求」到「自己能证明」

这一块以前可能从没被要求过，但它是「独立交付」的技术底座——**没有测试的人，交付时只能靠手工点一遍，而手工点不完边界情况。**

| 页 | 本级怎么读 |
|---|---|
| [测试与质量 · 导览](/java/testing/) | 全读 |
| [测试基础与 JUnit](/java/testing/junit) | 全读 |
| [Mock 与替身技术](/java/testing/mockito) | 全读 |
| [Spring Boot 测试与上下文](/java/testing/spring-boot-test) | 全读 |
| [集成测试与真实依赖](/java/testing/integration-test) | 读到「什么该用真依赖、什么该用替身」——这条判据比写法重要 |
| [覆盖率与质量门禁](/java/testing/quality-gates) | **本级跳过**——属于工程效能，留 L2 |

### 第七步 · 排查入门：线上出事时的前三步

本级不要求「调优」，只要求**有固定的前三步，而不是先重启**。

| 页 | 本级怎么读 |
|---|---|
| [Java 虚拟机 · 导览](/java/jvm/) | 读导览，知道每一篇解决什么问题 |
| [JDK 命令行排查：五件套的分工与开销](/java/jvm/troubleshooting-cli#division) | **只读这一节，加上 jstack 的「六种形态」**——本级能读懂线程栈就够了 |
| [Actuator 与生产可观测](/java/spring/spring-boot/actuator) | 读到「哪些端点可以开、哪些绝不能在公网开」 |
| [Linux 排查实战 · 四个方向先分类](/fundamentals/os/linux-tools#why-tools) | **只读这一节**——先分 CPU / IO / 内存 / 句柄，再决定看线程栈还是看磁盘；工具链速查与场景推演留 L2 |
| [Docker · Compose](/cloud-native/docker/#compose) 与 [容器里 `localhost`](/cloud-native/docker/#network) | 能用 Compose 把依赖起起来，知道容器里的 `localhost` 不是宿主机——**别人按你的步骤能在本机复现，这一级才算交得出去**。namespace、多阶段构建、镜像瘦身不读 |
| [日志管道 · 结构化字段](/cloud-native/observability/logging-pipeline#structured) | **过渡读法**（应用日志专篇尚未成篇）：读到字段约定、`traceId` 进 MDC、禁止把 `traceId` 拼进 `message`。Loki / 成本 / ELK **不读** |
| [运行时数据区](/java/jvm/memory)、[垃圾回收](/java/jvm/gc)、[调优与线上排查](/java/jvm/tuning)、[堆转储与 MAT](/java/jvm/heap-dump-analysis)、[Arthas](/java/jvm/online-diagnostics)、[火焰图](/java/jvm/profiling) | **本级跳过**——留 L2 |

### 本级附读 · AI 闸门

日常已经在用 AI 写代码，但清单里以前没它。本级只要拿走「**什么能交、什么必须人把关**」，不学 Agent 内部机制：

| 页 | 本级怎么读 |
|---|---|
| [Vibe Coding · 五道闸门](/ai/vibe-coding/#five-gates) | 全读这一节——产物能被自动验证的才能放手 |
| [人的介入点](/ai/vibe-coding/#human-gates) | 读到「架构决策与资金 / 权限边界必须人把关」 |
| [上下文才是真瓶颈](/ai/vibe-coding/#context-files) | 读到「模型不知道你的约定，就会持续产出看起来对的代码」——本级写模块时就要把约定写进上下文 |
| 工具格局、Agent 循环、Spring AI | **本级跳过**——留 L2 / L3 |

## 三、本级明确跳过的内容

把上面各步的「跳过」汇总，避免误以为漏读了：

| 跳过的东西 | 留到 | 为什么可以跳 |
|---|---|---|
| IoC 容器启动流程、循环依赖三级缓存 | L2 | 本级只要「会用 + 知道容器管了什么」，原理在本级用不上 |
| 注解与反射原理、IO 与 NIO | L2 | 它们是 L2 框架原理与并发的直接前置 |
| JVM 内存/GC/调优、堆转储、Arthas、火焰图 | L2 | 本级只需要能读线程栈；调优要有量级才谈得上 |
| 并发全套（线程安全 / 线程池 / AQS / JUC） | L2 | 本级的高并发场景通常还轮不到自己设计 |
| MVCC、redo/undo/binlog、主从复制 | L2 | 本级只要会用事务与索引 |
| Redis 分布式锁、集群、多级缓存 | L2 / L3 | 本级先会正确使用缓存 |
| 剩余 18 种设计模式 | L2 起按需 | 先掌握出现频率最高的 5 种 |
| Spring Cloud、消息队列、分布式理论 | L3 | 单机能解决的问题不需要分布式 |
| 数据结构与算法（树/图/DP/海量数据） | 面试前按需 | 本级先把复杂度判断力拿到 |
| 覆盖率与质量门禁 | L2 | 它属于工程效能而非交付能力 |
| Docker 原理（namespace / 多阶段构建 / 瘦身）、K8s 与网格 | L2 / L3 | 本级只要 Compose 能起依赖 |
| 日志管道的 Loki / 成本 / ELK、PromQL、SLO 定义 | L3 | 本级只要字段约定与 `traceId` |
| AI 工具格局、Agent 循环、Spring AI | L2 / L3 | 本级只要闸门与上下文约定 |

## 四、离场自检：七个问题

**这一级不是「读完某个页面」就算过。** 下面七个问题，如果你能当场说清，说明这一级的知识已经连起来了；如果一个都答不上，回到对应步骤重读：

| # | 问题 | 检验的是 |
|---|---|---|
| 1 | 这段代码为什么会有并发问题？——共享状态在哪，用 `synchronized`、原子类，还是**干脆别共享**？ | 第二步 + 第七步 |
| 2 | 这个查询为什么慢？`EXPLAIN` 的 `type` 列说明什么，覆盖索引省掉了哪一步？ | 第四步 |
| 3 | 一个方法加了 `@Transactional` 却没回滚——可能的原因至少说三条 | 第五步 |
| 4 | 接口返回的时间比数据库里差 8 小时，你先查哪三处？ | 第五步 |
| 5 | 线上接口大面积超时，你的**前三步**是什么？别人拿着一次失败请求的 `traceId`，怎么在日志里找到它？ | 第七步 |
| 6 | 这个工具类该用静态方法，还是做成一个注入的 Bean？理由是什么？ | 第三步 + 第五步 |
| 7 | Compose 里下游依赖没起来时，你怎么在本机复现这个模块？容器里访问「本机上的库」该用什么地址？ | 第七步 |

第 6 题最容易被当成小事，但它同时考了设计原则（依赖倒置）与框架理解（谁管生命周期、可测试性从哪来）。第 7 题检验的是「别人能接手」——交得出去，前提是环境可复现。

## 五、本站已补齐的内容（原缺口）

以下三块**曾是 L1 的缺口**（清单见[成长路线的覆盖度一节](/projects/architect-roadmap/#coverage)），现已成篇。按「本级该读到哪一层」给出：

| 原缺口 | 现在读 | 本级读到哪一层 |
|---|---|---|
| **Git 与团队协作**（分支模型 / 代码评审 / 提交规范 / 冲突处理） | [Git 协作：分支模型、提交粒度与可追溯性](/cloud-native/cicd/git-collaboration) | **第二、三节必须读**（提交粒度决定回退的分辨率、提交信息要写动机）；第五节先记住一条：**rebase 时 `ours` 与 `theirs` 的含义和 merge 相反**。分支模型按团队现状读 |
| **依赖管理与构建**（Maven 依赖冲突 / 多模块 / 构建加速） | [依赖管理与构建：从「能打包」到「可复现」](/java/basics/dependency-build) | **第三、四节必须读**（Maven 与 Gradle 相反的调解规则 + `NoSuchMethodError` 的三步定位）；多模块与构建加速留到 L2 |
| **REST 接口设计**（状态码 / 分页 / 版本 / 错误契约） | [REST 接口设计：状态码、错误契约、分页与演进](/java/spring/spring-mvc/rest-api-design) | **第三、四节必须读**（4xx 与 5xx 的分界线决定监控看不看得到错误；错误契约决定调用方要不要为你的接口写特殊逻辑）；分页与版本演进留到 L2 |

## 六、关联阅读

| 你想干什么 | 去哪 |
|---|---|
| 往上走一级 | [L2 高级开发 · 能负责一块，并对线上问题给出根因](/projects/architect-roadmap/senior/) |
| 回到路线总览，看自己在哪一级 | [成长路线](/projects/architect-roadmap/) |
| 看「这些知识会被问到多深」 | [面试专题的四层次](/interview/#layers) 与[按轮次的复习路径](/interview/#rounds) |
| 看别人怎么把 L1 的东西用在一个真实系统里 | [项目实战](/projects/)、[架构演进地图](/projects/architecture-evolution/#matrix) |
| 提前准备「拿什么证明我做过」 | [可验证产出三件套](/projects/toolkit/) |
| 看本级 AI 该读到哪一层 | [AI 应用 · 按四级读](/ai/#by-level) |
