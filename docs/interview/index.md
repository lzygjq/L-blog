---
date: 2026-09-17
title: 面试专题 · 板块导览
desc: 检索层——成长 L2→L3 下一轮先卡一包；1236 题是库存。不复制正文，答案在锚点
---

# 面试专题 · 板块导览

这个板块**不写新知识**。每条索引指向正文锚点，答案在正文里。

**可执行入口不是 1236 题。** 那是库存，会把人吓走，也没法用。本站读者处在[成长 L2](/projects/architect-roadmap/senior/)和[成长 L3](/projects/architect-roadmap/architect/)之间，下一轮通常是原理面往架构面走，外加项目面——只卡[下面这一包](#pack)。还在成长 L1，走[一面路径](#rounds)和[自检清单](#checklist)，不要从这包起跳。场景设计题当口头卷，不另开板块。

各板块导览或正文末尾仍有纵向题单（合计 1236 题）。题单解决不了的三件事见下一节；**先卡包，再按需进库存。**

## 一、成长 L2→L3 · 下一轮该卡 {#pack}

25 题 + 3 道口头场景。本周只这一包。

| 规则 | 怎么执行 |
|---|---|
| **先写后点** | 每题自己答一句，再打开对照。对照里没有标准答案，只有推导 |
| **层次不要跳** | 原理层答不出第二句，不要去判断层；判断层说不出代价，不要去决策层 |
| **决策层用证据** | 用自己的约束答。没有就去[层账](/projects/architecture-evolution/ledger/) / [闭卷模拟盘](/projects/toolkit/drill/) / [ADR](/projects/toolkit/adr/)。禁止编生产 TPS |
| **不要刷库存** | 这一包过了，再按[轮次](#rounds)从总索引里抽；不要从 1236 从头看 |

层次口径见[四个层次](#layers)。成长 L 是人的级别，和架构 L 不是同一把尺子。

### 1.1 原理层第二句（成长 L2 过关） {#pack-principle}

答得出定义不够。面试官一定会追第二句。过不了这一组，三面的架构题是空的。

| # | 该卡 | 第二句在问什么 | 对照 |
|---|---|---|---|
| 1 | `ThreadLocal` 内存泄漏 | 谁没被回收？线程池里为什么必须 `remove` | [泄漏链条](/java/concurrent/threadlocal#memory-leak) |
| 2 | 线程池「核心 → 队列 → 最大」 | 谁先谁后？为什么不用 `Executors` | [执行顺序](/java/concurrent/thread-pool#pool-flow) · [不用 Executors](/java/concurrent/thread-pool#why-not-executors) |
| 3 | `volatile` | 它保证可见性和有序，**不保证**复合操作原子 | [`volatile`](/java/concurrent/thread-safety#volatile) |
| 4 | 堆 dump | 支配树比引用图好用在哪？谁在持有 | [支配树](/java/jvm/heap-dump-analysis#dominator) |
| 5 | 容器里被 OOMKill | 堆设置和 cgroup 内存哪边先到 | [容器内 JVM](/cloud-native/docker/#jvm-in-container) |
| 6 | 连接池打满 | 四种根因各怎么处理；池大小由下游推，不是越大越好 | [池打满](/database/mysql/connection-pool#leaks) · [池大小](/database/mysql/connection-pool#sizing) |
| 7 | `@Transactional` 失效 | 共同根因是绕过代理；自调用 / 非 public / 受检异常只是同一件事的三种样子 | [失效清单](/java/spring/spring-framework/aop/transaction) |
| 8 | 缓存与库谁先写 | 为什么「先更新库再删缓存」；四档一致性各自放弃什么 | [一致性四档](/database/redis/cache-patterns#一致性四档) |

### 1.2 判断层（中高级分水岭） {#pack-judgment}

成长 L2 走完的标志：能说出**什么时候用、代价是什么**。说不出代价 = 还在背题。

| # | 该卡 | 判断卡在哪 | 对照 |
|---|---|---|---|
| 9 | 主从还是分片 | 主从买活下来和读；分片买装得下和写。加从库提升不了写吞吐 | [数据层两轴](/projects/architecture-evolution/data/#two-axes) |
| 10 | 哨兵还是 Cluster | 哨兵可跳；Cluster 可不到。不要用 Cluster 解决「懒得配哨兵」 | [缓存层两轴](/projects/architecture-evolution/cache/#two-axes) |
| 11 | 聚合还是微服务 | 聚合不是微服务；垂直拆分才第一次多个部署单元。多数项目的正确终点是模块化单体 | [应用 · 聚合](/projects/architecture-evolution/app/#modular) · [何时不该拆](/methodology/service-granularity#when-not) |
| 12 | 「消息不丢」 | 按链路分段，漏一段整条不可靠 | [可靠性四道防线](#thread-reliability) |
| 13 | 「一致性」这个词 | 单库 / 缓存 / 跨服务同步 / 异步 / 重复投递 / 集群期望，六种不是同一题 | [一致性六种解法](#thread-consistency) |
| 14 | 限流、熔断、降级 | 限流保护自己，熔断保护下游，不要混着说 | [三个概念](/java/spring/spring-cloud/resilience#three-concepts) |
| 15 | 出站超时与重试 | 出站必须短于入站剩余；重试缺一条前提都不能做 | [超时对齐](/java/spring/spring-framework/crosscutting/outbound-http#timeouts) · [重试三前提](/middleware/rpc/rpc-reliability#retry) |
| 16 | 分布式锁过期、持有者还活着 | fencing token 是补完正确性的那一刀；Redlock 的争议要能定位 | [fencing](/distributed/coordination/coordination-lock#fencing) · [Redlock](/distributed/coordination/coordination-lock#redlock) |
| 17 | CAP | 不是「三选二」，是分区真的发生时你选什么 | [「三选二」不严谨](/java/spring/spring-cloud/cap-base#misconception) |
| 18 | 要不要分库分表 | 考点是「什么时候不该分」。分片可永远不到 | [拆分时机](/database/sharding/) · [数据 · 分片](/projects/architecture-evolution/data/#shard) |

### 1.3 决策层（成长 L3 入口，用证据答） {#pack-decision}

这一组没有标准答案。面试官在听**约束、否决、尚未验证**。对照是证据页，不是题解。

| # | 该卡 | 证据在哪 | 对照 |
|---|---|---|---|
| 19 | 你们系统现在各层在哪一档 | 不要给总版本号。文件可以比库更早走 CDN | [层账](/projects/architecture-evolution/ledger/) · [个人路径](/projects/architecture-evolution/#my-path) |
| 20 | 组织主数据为什么不订 HR 的 binlog | 选型被组织边界决定，不是技术最优 | [ADR-002](/projects/toolkit/adr/adr-002-org-sync-dual-link)（先写[绩效卷](/projects/toolkit/drill/perf-system)） |
| 21 | 高峰填报怎么削峰 | 受理同步、落库异步；同步异步怎么切 | [ADR-003](/projects/toolkit/adr/adr-003-peak-fill-queue) |
| 22 | 审批消息为什么推拉结合 | 推送只传信号；最终一致与不丢不重 | [ADR-004](/projects/toolkit/adr/adr-004-push-pull) |
| 23 | 多租户为什么不是一刀切独立库 | 隔离是分档不是是非；横切漏一个就串 | [ADR-005](/projects/toolkit/adr/adr-005-tenant-isolation) · [分档](/methodology/multi-tenancy#tiers) |
| 24 | 分析查询为什么不进在线库、为什么不上 Hadoop | 分析外移；不上全家桶的否决理由 | [ADR-006](/projects/toolkit/adr/adr-006-warehouse-no-hadoop) |
| 25 | 跨服务一次请求慢了，怎么定位哪一跳 | L2 回答怎么修；L3 还要回答值不值得修 | [慢请求剧本](/cloud-native/observability/slow-request#tree) · [错误预算](/cloud-native/observability/slo-and-alerting#error-budget) |

写完 20–24 仍对不上，用[闭卷模拟盘](/projects/toolkit/drill/)整卷重推，不要回头翻案例正文找原句。

### 1.4 口头场景卷（不当题库） {#pack-oral}

「设计一个秒杀 / 短链 / 排行榜」没有标准答案。当口头卷：约束 → 至少三个备选 → 否决理由 → 哪些只是方案。写完再打开地图，不要先背骨架。

| 场景 | 写完再打开 |
|---|---|
| 秒杀 | [Redis 场景地图](/database/redis/scenarios#用法地图) · [锁与库存兜底](/database/redis/scenarios#项目叙事) |
| 短链 | [分布式 ID](/distributed/distributed-id) · [场景地图](/database/redis/scenarios#用法地图) |
| 排行榜 | [场景地图](/database/redis/scenarios#用法地图) · [特种类型](/database/redis/special-data-types) |

## 二、纵向题单解决不了的三件事 {#why}

| 问题 | 纵向题单为什么答不了 | 这一页怎么补 |
|---|---|---|
| **同一个概念横跨多个板块** | 「一致性」在 MySQL 讲事务、在 Redis 讲缓存、在 MQ 讲顺序与幂等、在 Spring Cloud 讲分布式事务——四篇各自都对，但没有人告诉你**它们是同一个问题的四种解法** | [跨板块连线题](#threads) |
| **面试是按轮次递进的** | 题单按知识域排（Java / 存储 / 中间件…），不按「一面问什么、二面问什么」排 | [按轮次的复习路径](#rounds) |
| **1236 道全看一遍不现实** | 题单里记忆题与决策题混在一起，不知道哪道该背题面、哪道该背推导 | [本周该卡](#pack)是可执行入口；[四个层次](#layers)分优先级；一面用[自检清单](#checklist) |

**一句话定位**：各板块是**内容层**（把机制讲透），这一页是**检索层**。可执行入口是[本周该卡](#pack)；1236 题和连线题是库存与横向索引。

## 三、同一个问题的四个层次 {#layers}

同一道题在不同轮次被问，期望的深度完全不同。**用错层次答题，比不会答更伤**——一面背架构，显得没落地；三面还在背定义，显得只会用。

| 层次 | 典型问法 | 答到这个层次说明 | 主要落在哪些板块 |
|---|---|---|---|
| **1 记忆层** | 「有哪几种」「参数是多少」「区别是什么」 | 及格线。答不出直接出局，但答对了不加分 | [Java 基础](/java/basics/#faq)、[集合](/java/collections/#faq)、[计算机基础](/fundamentals/#faq-network) |
| **2 原理层** | 「为什么这样设计」「底层怎么实现的」 | 区分「用过」和「懂」。**这是二面的主战场** | [JVM](/java/jvm/#interview-index)、[并发](/java/concurrent/#faq)、[Spring 框架](/java/spring/spring-framework/#interview)、[MySQL](/database/mysql/#interview) |
| **3 判断层** | 「什么时候用哪个」「代价是什么」 | 中高级的分水岭。答不出这一层，前面两层白答 | [消息队列](/middleware/#interview)、[Redis](/database/redis/#interview)、[Spring Cloud](/java/spring/spring-cloud/#interview-index)、[测试与质量](/java/testing/#interview) |
| **4 决策层** | 「你的项目为什么这么选」「不这样会怎样」 | 架构面与项目面的分。（本文档不做项目层答案——[项目实战](/projects/#interview)给可验证产出） | [项目实战](/projects/#interview)、[云原生](/cloud-native/#interview-questions)、[数据仓库](/bigdata/#faq) |

**同一道题的四个层次，示范一遍**（以「为什么用缓存」为例）：

```text
① 记忆层：因为数据库扛不住，缓存能挡掉大部分读请求。
② 原理层：缓存命中走内存，比磁盘快 3~4 个数量级；热点数据被重复读时收益最大。
③ 判断层：代价是一致性——「先更新库再删缓存」这个顺序是为了避免读到旧值；
          还要防穿透/击穿/雪崩，三种问题的组合方案不同。
④ 决策层：本项目读写比 9:1、单条数据可容忍秒级不一致，所以选 Cache-Aside +
          Canal 订阅 binlog 做最终一致，而不是强一致的读写锁方案；
          换成资金类场景，这个选择就是错的。
```

**复习顺序的纪律**：先过原理层再背口径。只背结论的人，被追问第二句就露馅——而面试官一定会追问第二句。

## 四、按轮次的复习路径 {#rounds}

| 轮次 | 考察重点 | 建议入口（按顺序） |
|---|---|---|
| **基础面 / 一面** | 语言与数据结构基本功、SQL 与索引、能说清常用组件的行为 | [计算机基础 43 题](/fundamentals/#faq) → [Java 基础 41 题](/java/basics/#faq) → [集合 25 题](/java/collections/#faq) → [并发 41 题](/java/concurrent/#faq) → [MySQL 13 题](/database/mysql/#interview) |
| **二面 / 原理面** | JVM、并发进阶、框架原理、中间件可靠性——**追问「为什么」** | 先过[该卡 · 原理层](#pack-principle)，不够再进：[JVM 13 题](/java/jvm/#interview-index) → [Spring 框架 22 题](/java/spring/spring-framework/#interview) → [横切能力 72 题](/java/spring/spring-framework/crosscutting/#interview) → [Spring Boot 21 题](/java/spring/spring-boot/#faq) → [消息队列 26 题](/middleware/#interview) → [测试与质量 10 题](/java/testing/#interview) |
| **三面 / 架构面** | 分布式取舍、云原生落地、数据链路、**方案对比与代价** | 先过[该卡 · 判断层](#pack-judgment)，不够再进：[Spring Cloud 10 题](/java/spring/spring-cloud/#interview-index) → [云原生 16 题](/cloud-native/#interview-questions) → [Redis 16 题](/database/redis/#interview) → [数据仓库 27 题](/bigdata/#faq) |
| **项目面 / 交叉面** | 「你做过什么」——**看证据，不看形容词** | [该卡 · 决策层](#pack-decision) → [层账](/projects/architecture-evolution/ledger/) → [闭卷模拟盘](/projects/toolkit/drill/) → [ADR](/projects/toolkit/adr/) → [项目实战](/projects/#interview) |
| **AI 方向岗** | 工程化的 AI 协作方式、Agent 与 MCP、框架选型、治理四笔账 | [AI 应用 23 题](/ai/#faq) → [Agent 与 Harness](/ai/agent-harness/#interview) → [Spring AI](/ai/spring-ai/#interview) → [AI 治理](/ai/governance/#interview) |
| **大前端相关岗** | 小程序双线程模型、`setData` 边界、登录支付时序 | [大前端 6 题](/frontend/#interview) |
| **场景设计题** | 「设计一个秒杀 / 短链 / 排行榜」——**没有标准答案，只有取舍** | [口头场景卷](#pack-oral) → [Redis 场景地图](/database/redis/scenarios) → [消息队列三条主线](/middleware/#three-threads) |

> **怎么用这张表**：成长 L2→L3 先卡[本周该卡](#pack)。其余行是库存入口。一面的题答不利索时，不要跳去背三面的架构题。

## 五、跨板块连线题 {#threads}

横向增量在这里。**下面五组问题，每一组都横跨两个以上板块**——单看任何一个板块的题单，都拼不出完整答案。本周先卡[上面那一包](#pack)；连线题用来把同一件事在不同层的解法串起来。

### 5.1 一次请求的完整旅程 {#thread-request}

「一次请求经历了什么」是被问最多、也最容易答漏的一道题。它横跨四个板块：

| 环节 | 落在哪个板块 | 会被追问什么 |
|---|---|---|
| DNS → TCP → TLS → HTTP | [计算机基础 · 完整旅程](/fundamentals/#journey) | 为什么三次握手、HTTP/2 与 3 的队头阻塞不是一回事 |
| 收包、`epoll`、线程被唤醒 | [操作系统](/fundamentals/os/io-model) | `epoll` 为什么快、水平/边缘触发怎么选 |
| 线程池取任务、锁竞争 | [Java 并发](/java/concurrent/thread-pool) | 核心线程数怎么定、为什么不用 `Executors` |
| Spring 容器、AOP、事务边界 | [Spring 框架](/java/spring/spring-framework/#interview) | `@Transactional` 为什么失效、循环依赖三级缓存 |
| SQL 走索引、回表 | [MySQL](/database/mysql/index-structure) | 索引为什么用 B+ 树、什么时候索引失效 |
| 缓存命中或穿透 | [Redis](/database/redis/cache-patterns) | 一致性四档怎么选、布隆过滤器会不会漏判 |
| 跨服务调用与保护 | [Spring Cloud](/java/spring/spring-cloud/#interview-index) · [出站 HTTP](/java/spring/spring-framework/crosscutting/outbound-http) | 熔断降级、幂等、链路追踪；**出站超时必须短于入站预算** |
| 一次慢请求怎么查 | [慢请求剧本](/cloud-native/observability/slow-request) | 先范围后哪一跳；不要把「经历了什么」的清单再背一遍 |
| 应用日志怎么跟上请求 | [应用日志](/java/spring/spring-boot/logging#mdc) | `traceId` 进 MDC，不要拼进 `message` |
| 容器、探针、滚动更新 | [云原生](/cloud-native/kubernetes/#probes) | liveness 与 readiness 为什么分开、滚动更新怎么不中断 |

**答这道题的正确姿势**：不要一口气背完。挑一条「与自己项目有关的链路」讲深，其他环节点到为止——面试官问这道题，是在**找你熟悉的那一段**。

### 5.2 「一致性」的六种解法 {#thread-consistency}

同一个词，在六个场景下是六个完全不同的问题：

| 一致性场景 | 要解决的问题 | 解法 | 详见 |
|---|---|---|---|
| 单库多表 | 一组写操作要么全成要么全败 | 本地事务（ACID） | [MySQL 事务](/database/mysql/transaction) |
| 缓存与数据库 | 写库之后缓存会不会读到旧值 | 先更新库再删缓存 + 延迟双删 / 订阅 binlog | [Redis 缓存模式](/database/redis/cache-patterns) |
| 跨服务同步写 | 两个服务的写不能放在同一个本地事务里 | Seata AT / TCC / Saga / XA 四种模式 | [Spring Cloud · 分布式事务](/java/spring/spring-cloud/transaction) |
| 跨服务异步写 | 上游发消息、下游必须处理成功 | 本地消息表、事务消息（半消息 + 回查） | [RocketMQ 事务消息](/middleware/rocketmq/#transaction) |
| 消息重复投递 | 至少一次投递语义下的重复消费 | 幂等（唯一索引 / 状态机 / 去重表） | [消息队列三条主线](/middleware/#three-threads) |
| 集群期望状态 | 实际状态偏离声明状态 | 控制器循环持续纠偏（而非一次性操作） | [K8s 编排](/cloud-native/kubernetes/#pod) |

**连线的关键认识**：这六行是**同一个矛盾在不同层级的表现**——只要「写」跨越了边界（跨表 / 跨进程 / 跨网络 / 跨节点），就必须引入额外的机制来补偿。**层级越高，代价越大**：本地事务靠数据库，跨服务事务要靠业务代码或中间件，代价是延迟与复杂度。

### 5.3 「可靠性」的四道防线 {#thread-reliability}

「消息不丢」这类问题的标准答法是**按链路分段**，每段都要单独确认——漏一段，整条链路就不可靠：

| 防线 | 要防的丢失 | 手段 | 详见 |
|---|---|---|---|
| ① 生产端 | 消息没发出去 / 没确认 | 发送确认（confirm）、失败重试、本地消息表 | [RabbitMQ 可靠性](/middleware/rabbitmq/reliability) |
| ② Broker 存储 | 消息落在内存，宕机丢失 | 持久化、副本（ISR / Raft）、刷盘策略 | [Kafka 可靠性](/middleware/kafka/reliability)、[RocketMQ 存储](/middleware/rocketmq/#storage) |
| ③ 消费端 | 消费失败或异常退出 | 手动 ACK、消费重试、死信队列 | [RabbitMQ 死信](/middleware/rabbitmq/dead-letter) |
| ④ 补偿与对账 | 上面三道都漏掉的 | 定时对账、幂等重放、人工兜底 | [对账与补偿](/methodology/reconciliation)（以谁为准、差账分类）；[接口幂等](/java/spring/spring-cloud/idempotency) |

**同一套思路迁移到其他组件**：MySQL 靠 binlog + 主从复制，Redis 靠 RDB/AOF + 哨兵，K8s 靠副本数 + 探针。**「可靠性 = 每一段都单独确认」是通用方法论，不是 MQ 专属知识。**

### 5.4 「性能」的五个瓶颈面 {#thread-performance}

「系统慢怎么办」不要凭感觉猜，先定位是**哪一面**到顶：

| 瓶颈面 | 典型现象 | 深挖入口 |
|---|---|---|
| **CPU** | `load` 高、上下文切换频繁 | [Linux 排查 / CPU 飙高四步法](/java/jvm/tuning) |
| **内存** | RSS 超限、被 OOMKill、GC 频繁 | [JVM 内存与调优](/java/jvm/tuning)、[容器内 JVM](/cloud-native/docker/#jvm-in-container) |
| **IO** | 磁盘 util 100%、写延迟高 | [IO 模型与多路复用](/fundamentals/os/io-model)、[MySQL 慢查询](/database/mysql/diagnosis) |
| **网络** | 重传、连接排队、长连接不均 | [TCP 核心机制](/fundamentals/network/tcp)、[Service 负载均衡](/cloud-native/kubernetes/#service-ingress) |
| **存储** | 索引失效、全表扫、大分页 | [索引设计](/database/mysql/index-design) |

**先分类、再优化**：五面里只有一面是瓶颈，改错地方不仅无效，还会引入新问题（比如给内存瓶颈加线程数）。线上怎么从告警走到「哪一跳」，用[慢请求剧本](/cloud-native/observability/slow-request)，不要从这张表直接跳进调参。

### 5.5 「隔离」的四种粒度 {#thread-isolation}

从内核到业务，「隔离」在每一层都有不同实现——被问到「多租户怎么隔离」时，答出这个层次会明显加分：

| 粒度 | 隔离什么 | 机制 | 详见 |
|---|---|---|---|
| 进程 / 资源 | 内存、CPU、文件系统 | `namespace` + `cgroup` | [容器隔离的两半](/cloud-native/docker/#namespace-cgroup) |
| 请求 / 线程 | 慢调用拖垮整条链路 | 线程池隔离、信号量隔离（舱壁模式） | [服务保护](/java/spring/spring-cloud/resilience) |
| 事务 | 并发事务的可见性 | 四种隔离级别 + MVCC | [MVCC 与锁](/database/mysql/mvcc) |
| 数据 / 租户 | 租户之间互相看不到数据 | `tenant_id` 行级 / 独立 Schema / 独立库三级混合 | [多租户方法](/methodology/multi-tenancy)；案例数字见[三级混合隔离](/projects/property-saas/microservice-to-k8s/#multi-tenant) |
| 网络 | 谁能访问谁 | NetworkPolicy、命名空间、Service 边界 | [K8s 多租户](/cloud-native/kubernetes/#multi-tenant) |

## 六、题单总索引（库存） {#index}

各板块题单的入口。**点进去就是「问题 → 一句话答案 → 正文锚点」的三列表**，当库存用：成长 L2→L3 先过[本周该卡](#pack)，不要从这里从头刷。

| 板块 | 题量 | 题单入口 | 定位 |
|---|---|---|---|
| 计算机基础 | 43 | [高频考点速查](/fundamentals/#faq) | 网络 / OS / 算法三域的底座题，语言无关 |
| Java 基础 | 41 | [高频考点速查](/java/basics/#faq) | 对象契约、字符串、泛型反射、IO 与语言演进、依赖管理与构建 |
| Java 集合 | 25 | [高频考点速查](/java/collections/#faq) | 底层数据结构与扩容机制 |
| Java 并发 | 41 | [高频考点速查](/java/concurrent/#faq) | 可见性、锁、JUC 工具类、线程池、并发容器 |
| Java 虚拟机 | 72 | [面试高频索引](/java/jvm/#interview-index) | 内存结构、GC、收集器、GC 日志；**实操四篇**：命令行五件套判读（jstat 十列 / 线程栈六形态 / 三次采样）、堆转储与 MAT 支配树、Arthas 在线诊断（trace / watch / vmtool）、火焰图四类剖析（on-CPU / off-CPU / alloc / lock）与 JFR |
| Spring 框架 | 22 | [面试高频问题](/java/spring/spring-framework/#interview) | 容器启动、Bean 生命周期、AOP、MyBatis |
| **Spring 横切能力** | 72 | [面试索引](/java/spring/spring-framework/crosscutting/#interview) | 缓存失效条件与脏缓存、异步默认执行器与上下文传递、方法级重试与幂等前提、两条异常链与 RFC 9457、`Long` 精度与 Jackson 3 迁移、出站超时与两套连接池 |
| Spring Boot | 21 | [高频考点速查](/java/spring/spring-boot/#faq) | 自动配置、配置体系、Actuator、内嵌容器、应用日志 |
| Spring Cloud | 10 | [面试索引](/java/spring/spring-cloud/#interview-index) | 注册发现、网关限流、熔断、分布式事务、幂等 |
| 设计模式 | 7 组辨析 | [面试高频](/java/design-patterns/#interview) | 只列最易混淆的边界（代理 vs 装饰、策略 vs 状态） |
| MySQL | 13 | [面试高频清单](/database/mysql/#interview) | 索引、事务、日志、MVCC、主从、连接池 |
| Redis | 16 | [面试高频](/database/redis/#interview) | 缓存三大问题与一致性三档、锁演进与看门狗失效边界、四种轻量队列、持久化与集群、容量口径 |
| PostgreSQL | 86 | [面试索引](/database/postgresql/#interview) | 两个根设计（版本存哪 / 索引存什么）、xmin 与快照三要素、VACUUM 三职责、长事务顶住清理水位、事务 ID 回卷、表级锁八模式与行锁记在元组头、锁队列 FIFO、SSI、GIN/GiST/BRIN 与部分索引、物理与逻辑复制、`synchronous_commit` 五档、`hot_standby_feedback` 取舍、PgBouncer 三模式、`work_mem` 与复制槽积压 |
| 消息队列 | 26 | [面试高频清单](/middleware/#interview) | RabbitMQ / Kafka / RocketMQ / MQTT 横向对照 |
| RPC 与协议 | 52 | [面试索引](/middleware/rpc/#interview-index) | 八条失效的本地调用假设、序列化五项指标与演进红线、协议头七要素与粘包拆包、Dubbo SPI 与集群容错、超时预算与重试三前提、优雅下线的四个时间差 |
| 搜索与检索 | 90 | [面试索引](/search/#interview) | 倒排索引与 FST 压缩、分词器三件套与中文分词、`text` 与 `keyword`、mapping 与 dynamic、refresh / flush / translog 与近实时、段合并、删除与更新的真相、query 与 filter 上下文、term / match / match_phrase、bool 四子句、BM25、分片对算分的干扰、doc_values 与 fielddata、聚合的近似性、分片与路由、深分页三方案、脑裂与选主、reindex 与别名、31GB 堆上限、ELK 栈与同步一致性 |
| 云原生 | 16 | [面试高频清单](/cloud-native/#interview-questions) | 容器原理、K8s 对象、Helm 与配置管理、服务网格、CRD 与 Operator |
| **CI/CD 与发布** | 72 | [面试索引](/cloud-native/cicd/#interview) | 提交粒度与可回退性（rebase 的 `ours`/`theirs` 反转、评审规模）、流水线节律与门禁、制品治理与 SBOM/签名/SLSA、四种发布策略与 `preStop` 双路径竞态、GitOps 与渐进式交付、扩展-收缩与发布检查清单；**外加研发效能五项指标、口径怎么定、七个团队原型、AI 的实测影响、质量成本四类** |
| **监控与可观测** | 69 | [面试索引](/cloud-native/observability/#interview) | 指标与 PromQL、日志管道与 Loki 高基数陷阱、链路传播与 OTel、SLO 与错误预算、慢请求决策树、成本与许可 |
| 数据仓库 | 27 | [高频考点速查](/bigdata/#faq) | CDC 同步、Doris 表模型、湖仓、分层建模 |
| Flink 流处理 | 34 | [面试索引](/bigdata/flink/#faq) | 水印与空闲分区、屏障对齐与端到端三段论、四种 Join 的状态代价、背压定位与倾斜、增量快照的无锁原理 |
| ClickHouse | 40 | [面试索引](/bigdata/clickhouse/#faq) | 不可变 part 推出的五条结论、稀疏索引与「排序键 / 主键」的分工、跳数索引与 PREWHERE、三条更新路径的代价、`internal_replication` 这个开关、先分负载再选引擎的五条判据 |
| MongoDB | 48 | [面试索引](/database/mongodb/#faq) | 文档是原子单位推出的五条结论、ESR 与 explain 三数、读偏好与读关注两个正交旋钮、长事务压 WiredTiger 缓存、分片键四条判据、SSPL 的真实触发边界 |
| AI 应用 | 23 | [高频考点速查](/ai/#faq) | AI 协作模式、Agent 与 MCP、Spring AI 系、治理四笔账 |
| 大前端 | 6 | [面试关注点](/frontend/#interview) | 小程序双线程、`setData`、登录支付时序 |
| 测试与质量 | 10 | [面试高频索引](/java/testing/#interview) | 测试分层判据、Mock 边界、切片、Testcontainers、覆盖率口径 |
| 方法论 | 119 | [面试索引](/methodology/#interview) | DDD 战略（边界/通用语言/上下文映射）与战术（值对象/聚合/领域事件/仓储/贫血与充血）、架构风格谱系（六边形/洋葱/整洁/COLA）、拆分粒度与康威定律、分布式单体、模块化单体、事件语义与发件箱、CQRS 与事件溯源、落地反模式与评审清单；**外加技术成本四层结构、六步成本链、单位经济学、云成本优化顺序、自建 vs 采购与退出成本、技术债量化**；**对账以谁为准与差账四类、多租户分档与横切传播** |
| 高可用 | 29 | [面试高频索引](/high-availability/#interview) | 几个 9 与 MTBF/MTTR、RTO/RPO 分级、故障域与单点、脑裂与 fencing、优雅停机与探针、超时预算与重试、幂等三件套、六代容灾拓扑、单元化与冲突解决、DNS 切换与切流、混沌工程前提与实验设计 |
| 分布式理论 | 24 | [面试高频索引](/distributed/#interview) | 共识与多数派、Paxos 两阶段与不变式、Raft 选举与两条安全约束、脑裂、一致性哈希与虚拟节点、哈希槽与 MOVED/ASK、雪花位分配、时钟回拨、workerId 分配、前端精度 |
| 分布式协调 | 51 | [面试索引](/distributed/coordination/#interview-index) | 协调服务的边界与六种原语、znode 与约 1MB 硬上限、会话与临时节点、Watcher 三个特性与羊群效应、zxid 的 epoch + 计数器、ZAB 与 Raft 的"两套机制 vs 一套"、TRUNC 的推理链、ZK 默认读非线性的后果、锁的能力边界与 fencing token、RedLock 的定位、etcd 的 2GiB 配额与 compaction/defrag 之别、KRaft 为什么去掉 ZK、Observer 与投票集合 |
| 安全与合规 | 38 | [面试高频索引](/security/#interview) | 会话与令牌、越权防护、OAuth2 与 PKCE、XSS/CSRF/注入、签名与重放、密码存储与脱敏；**外加等保定级与一个中心三重防护、数据出境三条路径与两个阈值、开源许可传染性与传递依赖、SBOM 与 CRA、审计留痕** |

**上表合计 1236 题，是库存不是产品**（口径：只累加「题量」列的纯数字项；设计模式那一行的「7 组辨析」是**要点式辨析**、不是独立题目，不计入合计。同一板块内部的「汇总表 + 子题单」不重复计入；每题在正文里都有对应的推导过程）。

## 七、自检清单 {#checklist}

一面的及格线。**答不出「一句话」就是没过**——这些题的正确答辩长度就是一两句话，长篇大论反而是扣分项。成长 L2→L3 的判断 / 决策题不在这张清单里，见[本周该卡](#pack)。

- [ ] 能用一句话说清「四次挥手为什么不是三次」，并说出 `CLOSE_WAIT` 堆积说明什么
- [ ] 能说清 `epoll` 与 `select` 的数据结构差异，以及边缘触发必须读到 `EAGAIN` 的原因
- [ ] 能说清 `HashMap` 容量为 2 的幂是为了一步什么运算
- [ ] 能说清 `ThreadLocal` 内存泄漏的真实链条（谁没被回收）
- [ ] 能说清线程池「核心线程数 + 队列 + 最大线程数」三者谁先谁后
- [ ] 能说清 `@Transactional` 的三种典型失效场景
- [ ] 能说清 Spring 三级缓存里第三级缓存在解决什么（不必背源码名）
- [ ] 能说清索引失效的至少五个具体场景
- [ ] 能说清缓存与数据库一致性为什么是「先更新库再删缓存」
- [ ] 能说清「消息不丢」的四段防线，并指出自己项目做全了哪几段
- [ ] 能说清限流三层的区别与漏桶 / 令牌桶的适用差异
- [ ] 能说清容器内 OOMKilled 与 JVM 堆设置的关系
- [ ] 能说清「一次请求经历了什么」并**只深入自己项目涉及的那一段**
- [ ] 能说清「哪些代码不该 Mock」的判据，并说出 Mock 数量过多意味着什么
- [ ] 能对任一技术选型说出**至少一个代价**（说不出代价 = 没做过选型）

**三条复习纪律**：

1. **先原理层，再背口径**。只背口径的答案经不起第二句追问。
2. **每题都要能落到「所以呢」**。机制本身不是答案，它能解释哪个工程决策才是答案。
3. **项目题必须带取舍**。说「我们用了 Redis」不加分，说「因为读写比和一致性容忍度，我们选了 Cache-Aside 而不是强一致方案」才加分。

## 八、与相邻板块的边界 {#boundary}

| 相邻板块 | 它负责什么 | 本板块负责什么 |
|---|---|---|
| 各内容板块的导览页 | **纵向题单**：本领域的题与一句话答案 | **可执行入口**是[本周该卡](#pack)；其余是横向索引（连线题、轮次、四层） |
| [项目实战](/projects/) | **项目层答案**：难点背景、方案对比、落地实现、效果数据 | 只把项目题**指过去**，不代答（项目题必须用真实产出答） |
| [可验证产出工具箱](/projects/toolkit/) | **方法层**：ADR / 压测报告 / 架构图 / 方案评审怎么产出 | 在[决策层](#layers)引用它——项目面看的是这几类证据 |
| [成长路线](/projects/architect-roadmap/) | **能力自检**：四级阶梯 + 每级「读到哪一层」+ [覆盖度](/projects/architect-roadmap/#coverage) | 成长 L2→L3 的可执行入口是[本周该卡](#pack)；能力评估仍用路线图 |

> **本板块的取舍**：这里**不新写任何原理正文**。如果某道题的答案在正文里找不到推导过程，正确的做法是**回正文补**，而不是在此处补一段二手总结——一旦这里开始抄正文，它就会变成第二个真相源，两边会慢慢不准。
