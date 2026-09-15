---
date: 2026-09-15
title: 面试专题 · 板块导览
desc: 全站题单的检索层——不复制正文，只给「按层次 + 按轮次 + 按板块」三套入口，以及跨板块连线题的一句话答案
---

# 面试专题 · 板块导览

这个板块**不写新知识**。它的唯一职责是把散在各板块的题目串起来：**每条索引都指向正文锚点，答案在正文里**。

各板块导览页末尾都已经有纵向题单（合计 **340 题**，每题都带「一句话答案 + 正文锚点」）。既然有了那些题单，为什么还要这一页？

## 一、纵向题单解决不了的三件事 {#why}

| 问题 | 纵向题单为什么答不了 | 这一页怎么补 |
|---|---|---|
| **同一个概念横跨多个板块** | 「一致性」在 MySQL 讲事务、在 Redis 讲缓存、在 MQ 讲顺序与幂等、在 Spring Cloud 讲分布式事务——四篇各自都对，但没有人告诉你**它们是同一个问题的四种解法** | [跨板块连线题](#threads) |
| **面试是按轮次递进的** | 题单按知识域排（Java / 存储 / 中间件…），不按「一面问什么、二面问什么」排 | [按轮次的复习路径](#rounds) |
| **340 道全看一遍不现实** | 题单里记忆题与决策题混在一起，不知道哪道该背题面、哪道该背推导 | [四个层次](#layers)分优先级 + [自检清单](#checklist) |

**一句话定位**：各板块是**内容层**（把机制讲透），这一页是**检索层**（告诉你先看什么，以及同一件事在哪几处出现过）。

## 二、同一个问题的四个层次 {#layers}

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

## 三、按轮次的复习路径 {#rounds}

| 轮次 | 考察重点 | 建议入口（按顺序） |
|---|---|---|
| **基础面 / 一面** | 语言与数据结构基本功、SQL 与索引、能说清常用组件的行为 | [计算机基础 43 题](/fundamentals/#faq) → [Java 基础 39 题](/java/basics/#faq) → [集合 25 题](/java/collections/#faq) → [并发 41 题](/java/concurrent/#faq) → [MySQL 12 题](/database/mysql/#interview) |
| **二面 / 原理面** | JVM、并发进阶、框架原理、中间件可靠性——**追问「为什么」** | [JVM 13 题](/java/jvm/#interview-index) → [Spring 框架 22 题](/java/spring/spring-framework/#interview) → [Spring Boot 18 题](/java/spring/spring-boot/#faq) → [消息队列 26 题](/middleware/#interview) → [测试与质量 10 题](/java/testing/#interview) |
| **三面 / 架构面** | 分布式取舍、云原生落地、数据链路、**方案对比与代价** | [Spring Cloud 10 题](/java/spring/spring-cloud/#interview-index) → [云原生 16 题](/cloud-native/#interview-questions) → [数据仓库 27 题](/bigdata/#faq) → [Redis 13 题](/database/redis/#interview) |
| **项目面 / 交叉面** | 「你做过什么」——**看证据，不看形容词** | [项目实战](/projects/#interview)（导览）→ [架构师路线图](/projects/architect-roadmap/)（自检缺口）→ [可验证产出工具箱](/projects/toolkit/)（ADR / 压测报告 / 架构图） |
| **AI 方向岗** | 工程化的 AI 协作方式、Agent 与 MCP、框架选型 | [AI 应用 19 题](/ai/#faq) → [Agent 与 Harness](/ai/agent-harness/#interview) → [Spring AI](/ai/spring-ai/#interview) |
| **大前端相关岗** | 小程序双线程模型、`setData` 边界、登录支付时序 | [大前端 6 题](/frontend/#interview) |
| **场景设计题** | 「设计一个秒杀 / 短链 / 排行榜」——**没有标准答案，只有取舍** | [Redis 场景地图](/database/redis/scenarios) → [消息队列三条主线](/middleware/#three-threads) → [设计模式面试高频](/java/design-patterns/#interview) |

> **怎么用这张表**：不要按板块顺序从前往后看。先确认自己在面哪一轮，只打开对应那一行；一面的题答不利索时，不要跳去背三面的架构题。

## 四、跨板块连线题 {#threads}

这一页真正的增量在这里。**下面五组问题，每一组都横跨两个以上板块**——单看任何一个板块的题单，都拼不出完整答案。

### 4.1 一次请求的完整旅程 {#thread-request}

「一次请求经历了什么」是被问最多、也最容易答漏的一道题。它横跨四个板块：

| 环节 | 落在哪个板块 | 会被追问什么 |
|---|---|---|
| DNS → TCP → TLS → HTTP | [计算机基础 · 完整旅程](/fundamentals/#journey) | 为什么三次握手、HTTP/2 与 3 的队头阻塞不是一回事 |
| 收包、`epoll`、线程被唤醒 | [操作系统](/fundamentals/os/io-model) | `epoll` 为什么快、水平/边缘触发怎么选 |
| 线程池取任务、锁竞争 | [Java 并发](/java/concurrent/thread-pool) | 核心线程数怎么定、为什么不用 `Executors` |
| Spring 容器、AOP、事务边界 | [Spring 框架](/java/spring/spring-framework/#interview) | `@Transactional` 为什么失效、循环依赖三级缓存 |
| SQL 走索引、回表 | [MySQL](/database/mysql/index-structure) | 索引为什么用 B+ 树、什么时候索引失效 |
| 缓存命中或穿透 | [Redis](/database/redis/cache-patterns) | 一致性四档怎么选、布隆过滤器会不会漏判 |
| 跨服务调用与保护 | [Spring Cloud](/java/spring/spring-cloud/#interview-index) | 熔断降级、幂等、链路追踪 |
| 容器、探针、滚动更新 | [云原生](/cloud-native/kubernetes/#probes) | liveness 与 readiness 为什么分开、滚动更新怎么不中断 |

**答这道题的正确姿势**：不要一口气背完。挑一条「与自己项目有关的链路」讲深，其他环节点到为止——面试官问这道题，是在**找你熟悉的那一段**。

### 4.2 「一致性」的六种解法 {#thread-consistency}

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

### 4.3 「可靠性」的四道防线 {#thread-reliability}

「消息不丢」这类问题的标准答法是**按链路分段**，每段都要单独确认——漏一段，整条链路就不可靠：

| 防线 | 要防的丢失 | 手段 | 详见 |
|---|---|---|---|
| ① 生产端 | 消息没发出去 / 没确认 | 发送确认（confirm）、失败重试、本地消息表 | [RabbitMQ 可靠性](/middleware/rabbitmq/reliability) |
| ② Broker 存储 | 消息落在内存，宕机丢失 | 持久化、副本（ISR / Raft）、刷盘策略 | [Kafka 可靠性](/middleware/kafka/reliability)、[RocketMQ 存储](/middleware/rocketmq/#storage) |
| ③ 消费端 | 消费失败或异常退出 | 手动 ACK、消费重试、死信队列 | [RabbitMQ 死信](/middleware/rabbitmq/dead-letter) |
| ④ 补偿与对账 | 上面三道都漏掉的 | 定时对账、幂等重放、人工兜底 | [接口幂等](/java/spring/spring-cloud/idempotency) |

**同一套思路迁移到其他组件**：MySQL 靠 binlog + 主从复制，Redis 靠 RDB/AOF + 哨兵，K8s 靠副本数 + 探针。**「可靠性 = 每一段都单独确认」是通用方法论，不是 MQ 专属知识。**

### 4.4 「性能」的五个瓶颈面 {#thread-performance}

「系统慢怎么办」不要凭感觉猜，先定位是**哪一面**到顶：

| 瓶颈面 | 典型现象 | 深挖入口 |
|---|---|---|
| **CPU** | `load` 高、上下文切换频繁 | [Linux 排查 / CPU 飙高四步法](/java/jvm/tuning) |
| **内存** | RSS 超限、被 OOMKill、GC 频繁 | [JVM 内存与调优](/java/jvm/tuning)、[容器内 JVM](/cloud-native/docker/#jvm-in-container) |
| **IO** | 磁盘 util 100%、写延迟高 | [IO 模型与多路复用](/fundamentals/os/io-model)、[MySQL 慢查询](/database/mysql/diagnosis) |
| **网络** | 重传、连接排队、长连接不均 | [TCP 核心机制](/fundamentals/network/tcp)、[Service 负载均衡](/cloud-native/kubernetes/#service-ingress) |
| **存储** | 索引失效、全表扫、大分页 | [索引设计](/database/mysql/index-design) |

**先分类、再优化**：五面里只有一面是瓶颈，改错地方不仅无效，还会引入新问题（比如给内存瓶颈加线程数）。

### 4.5 「隔离」的四种粒度 {#thread-isolation}

从内核到业务，「隔离」在每一层都有不同实现——被问到「多租户怎么隔离」时，答出这个层次会明显加分：

| 粒度 | 隔离什么 | 机制 | 详见 |
|---|---|---|---|
| 进程 / 资源 | 内存、CPU、文件系统 | `namespace` + `cgroup` | [容器隔离的两半](/cloud-native/docker/#namespace-cgroup) |
| 请求 / 线程 | 慢调用拖垮整条链路 | 线程池隔离、信号量隔离（舱壁模式） | [服务保护](/java/spring/spring-cloud/resilience) |
| 事务 | 并发事务的可见性 | 四种隔离级别 + MVCC | [MVCC 与锁](/database/mysql/mvcc) |
| 数据 / 租户 | 租户之间互相看不到数据 | `tenant_id` 行级 / 独立 Schema / 独立库三级混合 | [多租户三级混合隔离](/projects/property-saas/microservice-to-k8s/#multi-tenant) |
| 网络 | 谁能访问谁 | NetworkPolicy、命名空间、Service 边界 | [K8s 多租户](/cloud-native/kubernetes/#multi-tenant) |

## 五、题单总索引 {#index}

各板块题单的入口。**点进去就是「问题 → 一句话答案 → 正文锚点」的三列表**，可直接当背诵清单：

| 板块 | 题量 | 题单入口 | 定位 |
|---|---|---|---|
| 计算机基础 | 43 | [高频考点速查](/fundamentals/#faq) | 网络 / OS / 算法三域的底座题，语言无关 |
| Java 基础 | 39 | [高频考点速查](/java/basics/#faq) | 对象契约、字符串、泛型反射、IO 与语言演进 |
| Java 集合 | 25 | [高频考点速查](/java/collections/#faq) | 底层数据结构与扩容机制 |
| Java 并发 | 41 | [高频考点速查](/java/concurrent/#faq) | 可见性、锁、JUC 工具类、线程池、并发容器 |
| Java 虚拟机 | 13 | [面试高频索引](/java/jvm/#interview-index) | 内存结构、GC、收集器、GC 日志、线上排查 |
| Spring 框架 | 22 | [面试高频问题](/java/spring/spring-framework/#interview) | 容器启动、Bean 生命周期、AOP、MyBatis |
| Spring Boot | 18 | [高频考点速查](/java/spring/spring-boot/#faq) | 自动配置、配置体系、Actuator、内嵌容器 |
| Spring Cloud | 10 | [面试索引](/java/spring/spring-cloud/#interview-index) | 注册发现、网关限流、熔断、分布式事务、幂等 |
| 设计模式 | 7 组辨析 | [面试高频](/java/design-patterns/#interview) | 只列最易混淆的边界（代理 vs 装饰、策略 vs 状态） |
| MySQL | 12 | [面试高频清单](/database/mysql/#interview) | 索引、事务、日志、MVCC、主从 |
| Redis | 13 | [面试高频](/database/redis/#interview) | 缓存三大问题、锁、持久化、集群 |
| 消息队列 | 26 | [面试高频清单](/middleware/#interview) | RabbitMQ / Kafka / RocketMQ / MQTT 横向对照 |
| 云原生 | 16 | [面试高频清单](/cloud-native/#interview-questions) | 容器原理、K8s 对象、发布策略、可观测 |
| 数据仓库 | 27 | [高频考点速查](/bigdata/#faq) | CDC 同步、Doris 表模型、湖仓、分层建模 |
| AI 应用 | 19 | [高频考点速查](/ai/#faq) | AI 协作模式、Agent 与 MCP、Spring AI 系 |
| 大前端 | 6 | [面试关注点](/frontend/#interview) | 小程序双线程、`setData`、登录支付时序 |
| 测试与质量 | 10 | [面试高频索引](/java/testing/#interview) | 测试分层判据、Mock 边界、切片、Testcontainers、覆盖率口径 |

**上表合计 340 题**（口径：只累加「题量」列的纯数字项；设计模式那一行的「7 组辨析」是**要点式辨析**、不是独立题目，不计入合计。同一板块内部的「汇总表 + 子题单」不重复计入；每题在正文里都有对应的推导过程）。

## 六、自检清单 {#checklist}

面试前逐条过一遍。**答不出「一句话」就是没过**——这些题的正确答辩长度就是一两句话，长篇大论反而是扣分项：

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

## 七、与相邻板块的边界 {#boundary}

| 相邻板块 | 它负责什么 | 本板块负责什么 |
|---|---|---|
| 各内容板块的导览页 | **纵向题单**：本领域的题与一句话答案 | **横向索引**：跨板块的连线题、轮次路径、四层难度分级 |
| [项目实战](/projects/) | **项目层答案**：难点背景、方案对比、落地实现、效果数据 | 只把项目题**指过去**，不代答（项目题必须用真实产出答） |
| [可验证产出工具箱](/projects/toolkit/) | **方法层**：ADR / 压测报告 / 架构图怎么产出 | 在[决策层](#layers)引用它——项目面看的是这三类证据 |
| [架构师路线图](/projects/architect-roadmap/) | **能力自检**：按阶段列出仍缺的知识块 | 本页只给题单入口，能力评估用路线图 |

> **本板块的取舍**：这里**不新写任何原理正文**。如果某道题的答案在正文里找不到推导过程，正确的做法是**回正文补**，而不是在此处补一段二手总结——一旦这里开始抄正文，它就会变成第二个真相源，两边会慢慢不准。
