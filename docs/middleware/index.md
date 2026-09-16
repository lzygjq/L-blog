---
date: 2026-09-14
desc: 消息队列板块导览——可靠性/顺序性/幂等性三条主线、RabbitMQ 与 Kafka 与 RocketMQ 选型对比、26 题面试高频索引
---

# 消息队列 · 板块导览

消息中间件看起来是"把消息从 A 发到 B"，但面试真正考的是**在不可靠的网络和可能宕机的进程之间，怎么把一件事做对**。所有问题最终都收敛到三条主线：

| 主线 | 要回答的问题 | 落地手段 |
|---|---|---|
| **可靠性** | 消息会不会丢？ | 生产端确认 + Broker 持久化/多副本 + 消费端手动 ack |
| **顺序性** | 消息会不会乱序？ | 把需要有序的消息**路由到同一个有序单元**（队列 / 分区） |
| **幂等性** | 消息会不会重复？ | 重复**无法避免**，只能在消费端做幂等 |

> **这三条主线不是并列关系，而是互相牵制**：为了不丢要"确认后再消费"，就更容易重复；为了有序要"串行"，就牺牲吞吐；为了吞吐要"批量 + 异步"，就更容易丢。**面试的高分答法永远是"取舍"**，而不是"我全都要"。

## 一、板块结构 {#structure}

| 板块 | 定位 | 内容 | 状态 |
|---|---|---|---|
| [**RabbitMQ**](/middleware/rabbitmq/) | 传统消息队列、**业务解耦**首选 | Exchange 模型、可靠性投递、死信与延迟队列、集群高可用、消息堆积 | ✅ 5 篇已成篇 |
| [**Kafka**](/middleware/kafka/) | 分布式流平台、**高吞吐**首选 | 三层可靠性、顺序性、ISR 高可用、高性能六大设计、存储与清理 | ✅ 5 篇已成篇 |
| [**RocketMQ**](/middleware/rocketmq/) | 阿里出品、**事务消息/延迟消息**强项 | 5.x 计算存储分离、CommitLog 三层存储、事务消息与回查、顺序与延迟消息、幂等三方案 | ✅ 已成篇 |
| [**物联网 MQTT**](/middleware/mqtt/) | 设备接入协议、**不是传统 MQ** | QoS/会话/遗嘱/保留消息、EMQX Core-Replicant、主题设计与共享订阅、设备场景落地 | ✅ 已成篇 |

## 二、选型对比：RabbitMQ / Kafka / RocketMQ {#selection}

这是本板块最该背下来的一张表——面试问"你们为什么用 Kafka 不用 RabbitMQ"，答案就在这：

| 维度 | **RabbitMQ** | **Kafka** | **RocketMQ** |
|---|---|---|---|
| **模型** | Exchange + Queue + Binding（AMQP 0-9-1） | Topic + Partition（纯日志，无 Exchange 概念） | Topic + MessageQueue（类似 Partition） |
| **定位** | **消息队列**：业务解耦、任务分发 | **分布式流平台**：日志采集、流处理、事件溯源 | 消息队列 + 事务消息（电商场景） |
| **单机吞吐** | 万级（~1 万 QPS 量级） | **十万级**（~10 万+ QPS） | 十万级 |
| **消息延迟** | **微秒级**（push 推模式） | 毫秒级（pull 拉模式，靠批量） | 毫秒级 |
| **消息顺序** | 单队列内有序（多消费者会乱） | **单分区内有序** | 单队列内有序，支持**严格顺序消息**（`MessageGroup`） |
| **事务消息** | ❌ 不原生支持 | ❌（只有幂等生产者，不是分布式事务） | ✅ **原生支持**（半消息 + 回查） |
| **延迟消息** | ⚠️ 靠 TTL + 死信 / 延迟插件 | ❌ 需自建时间轮或外部方案 | ✅ **原生**；4.x 18 个固定级别，**5.x 时间轮任意精度** |
| **消息回溯** | ❌ 消费即删（除非用 stream 队列） | ✅ **按 offset 任意回溯** | ✅ 支持按时间回溯 |
| **堆积能力** | ⚠️ 差——堆积会撑内存（需惰性队列） | ✅ **强——堆积就是落盘**，天然支撑亿级 | ✅ 强（CommitLog 顺序写） |
| **消费模型** | push 为主（basic.consume） | **pull**（消费者主动拉） | pull（长轮询）；5.x 增加 **Pop**（适配 K8s 弹性伸缩） |
| **典型场景** | 业务解耦、订单异步处理、延迟任务 | 日志采集、埋点、流处理、大数据管道 | 电商交易、订单、事务消息 |

**一句话选型**：

```text
要"业务解耦 + 低延迟 + 灵活路由"     → RabbitMQ
要"高吞吐 + 可回溯 + 大数据生态"      → Kafka
要"事务消息 + 延迟消息 + 电商场景"    → RocketMQ
要"设备接入（弱网、海量连接、QoS）"    → MQTT（EMQX）
```

> **最常见的误区**：把 Kafka 当"性能更好的 RabbitMQ"用。它不是——**Kafka 的消费是 pull 且不删消息**（靠时间/大小清理），所以能回溯；**RabbitMQ 是消费即删**，没有"重新消费历史消息"这个概念。选型时先问"**需不需要回溯**"，这一条往往直接决定选谁。

> **另一条更值得琢磨的观察**：为什么只有 RocketMQ 原生做了事务消息？因为它起家于**阿里的电商交易场景**——"下单要同时写库和发消息"是那里最高频的痛点。**中间件的特有能力都是被特定业务逼出来的**，记住这条比背特性表有用。

## 三、三条主线在三种 MQ 上的落点 {#three-threads}

同一个问题，各家给的答案不同——对比着记最牢：

| 主线 | RabbitMQ | Kafka | RocketMQ |
|---|---|---|---|
| **不丢（生产端）** | `publisher confirm`：confirm 回调（到交换机）+ return 回调（到队列） | `acks=all` + `retries` + 异步回调 | 同步发送 + 失败重试；事务消息保证"本地事务成功则消息可见" |
| **不丢（Broker）** | 交换机 + 队列 + 消息**三者都持久化** | `acks=all` + `min.insync.replicas≥2` + 关 `unclean.leader.election` | 同步刷盘 + 主从复制（Controller 模式做自动选主） |
| **不丢（消费端）** | **手动 ack**（处理完再确认）+ Spring Retry | **关自动提交**，手动提交 offset | 消费 ack；失败进重试队列/死信 |
| **有序** | 单队列 + 单消费者；或业务上串行 | **相同 key 路由到同一分区** | `MessageGroup`/HashKey 进同队列 + `ORDERLY` 消费 |
| **幂等** | 生产端全局唯一 ID + 消费端去重（Redis setnx / 去重表 / 状态机） | **同一套**（消费端幂等逻辑与 MQ 无关） | **同一套**（且推荐业务状态机方案） |
| **高可用** | 镜像队列 → **仲裁队列**（Raft） | **分区多副本 + ISR + Leader 选举** | 主从 → DLedger（已废弃）→ **Controller（Raft 选主 + 原生 CommitLog）** |
| **堆积** | ⚠️ 弱项——惰性队列（落磁盘）兜底 | ✅ 强项——**堆积就是顺序写在磁盘上** | ✅ 强项——CommitLog 顺序混写 |

**这张表最值得记的一条横向结论**：**幂等性这一行，三家答案完全一样。** 因为消息重复是**分布式系统的固有属性**，不是某个 MQ 的缺陷——**中间件层面"恰好一次"的代价极高，应用层幂等才是正解**。MQTT 的 [QoS 1 重复问题](/middleware/mqtt/#protocol) 也是同一个道理。

## 四、推荐阅读顺序 {#reading-order}

```text
① 先读一个 MQ 的「可靠性」篇（RabbitMQ 或 Kafka 任选其一）
        —— 三条主线的骨架都在这，而且要按「生产端→Broker→消费端」三段去记
        │
        ├──▶ ② 顺序性        （理解"有序单元"这个概念：RabbitMQ 是队列，Kafka 是分区，RocketMQ 是 MessageQueue）
        │
        └──▶ ③ 高可用        （三家的答案完全不同：仲裁队列 vs ISR vs Controller）
                       │
                       ▼
                 ④ 各自的特有能力
                    RabbitMQ：死信/延迟队列、交换机模型、堆积
                    Kafka：高性能六大设计、存储与清理
                    RocketMQ：CommitLog 三层存储、事务消息、延迟消息
                    MQTT：QoS/会话/遗嘱、主题设计、设备接入
```

**不要一上来就读 Kafka 的高性能**——零拷贝、Page Cache 这些是"锦上添花"，而**可靠性、顺序性、幂等性才是必问**，且能答出取舍。

**RocketMQ 的读法要特别一点**：**先读它的存储（[CommitLog 三层](/middleware/rocketmq/#storage)），再读事务消息**。跳过存储直接背"半消息 + 回查"，记不牢也答不深——所有特有能力都是长在那套存储结构上的。

## 五、面试高频清单（26 题索引） {#interview}

**RabbitMQ**

| # | 问题 | 篇目 |
|---|---|---|
| 1 | RabbitMQ 如何保证消息不丢失？ | [可靠性](/middleware/rabbitmq/reliability) |
| 2 | 消息重复消费怎么解决？ | [可靠性](/middleware/rabbitmq/reliability) |
| 3 | 消息堆积怎么解决？ | [消息堆积](/middleware/rabbitmq/backlog) |
| 4 | 死信队列是什么？什么情况消息会成为死信？ | [死信与延迟队列](/middleware/rabbitmq/dead-letter) |
| 5 | 如何实现延迟队列？ | [死信与延迟队列](/middleware/rabbitmq/dead-letter) |
| 6 | 高可用机制有哪些？ | [集群与高可用](/middleware/rabbitmq/high-availability) |
| 7 | 交换机有哪些类型？ | [核心模型与交换机](/middleware/rabbitmq/core-model) |

**Kafka**

| # | 问题 | 篇目 |
|---|---|---|
| 8 | Kafka 如何保证消息不丢失？ | [可靠性](/middleware/kafka/reliability) |
| 9 | Kafka 如何保证消息顺序性？ | [顺序性](/middleware/kafka/ordering) |
| 10 | Kafka 高可用机制是什么？ | [集群与 ISR](/middleware/kafka/high-availability) |
| 11 | Kafka 为什么性能那么高？ | [高性能设计](/middleware/kafka/performance) |
| 12 | Kafka 数据存储机制是怎样的？ | [存储与清理](/middleware/kafka/storage) |
| 13 | Kafka 数据清理策略有哪些？ | [存储与清理](/middleware/kafka/storage) |

**RocketMQ**

| # | 问题 | 篇目 |
|---|---|---|
| 14 | RocketMQ 事务消息的流程？为什么要有半消息？ | [事务消息](/middleware/rocketmq/#transaction) |
| 15 | 事务消息的回查机制怎么工作？要注意什么？ | [事务消息](/middleware/rocketmq/#transaction) |
| 16 | RocketMQ 存储为什么能支撑高吞吐？ | [存储模型](/middleware/rocketmq/#storage) |
| 17 | 顺序消息怎么实现？全局有序为什么不用？ | [顺序消息](/middleware/rocketmq/#ordering) |
| 18 | RocketMQ 延迟消息和 RabbitMQ/Kafka 有什么区别？ | [延迟消息](/middleware/rocketmq/#delay) |
| 19 | 5.x 推荐的高可用方案是什么？ | [高可用](/middleware/rocketmq/#high-availability) |
| 20 | 事务消息能替代所有分布式事务方案吗？ | [事务消息](/middleware/rocketmq/#transaction) |

**物联网 MQTT**

| # | 问题 | 篇目 |
|---|---|---|
| 21 | MQTT 是消息队列吗？和 RabbitMQ/Kafka 的区别？ | [与消息队列的差异](/middleware/mqtt/#why-not-mq) |
| 22 | QoS 三级分别是什么？为什么 QoS 2 很少用？ | [协议核心](/middleware/mqtt/#protocol) |
| 23 | 设备离线期间的指令怎么办？ | [协议核心](/middleware/mqtt/#protocol) |
| 24 | 保留消息和遗嘱消息分别解决什么？ | [协议核心](/middleware/mqtt/#protocol) |
| 25 | EMQX 5.x 为什么能撑百万连接？ | [Broker 选型](/middleware/mqtt/#broker) |
| 26 | MQTT 集群安全的核心是什么？ | [认证与安全](/middleware/mqtt/#security) |

> **注意第 1 题和第 8 题几乎每年必问**，而且问法一样、答案结构也一样（三段式）。**背熟一个，另一个只需换细节**——这是本板块性价比最高的两题。**第 14 题（事务消息）是 RocketMQ 的必问题**，答不出"半消息为什么存在"就会被追问到底。

## 六、与其他板块的交界 {#boundary}

| 交界主题 | 在本板块的关注点 | 在别处的关注点 |
|---|---|---|
| 用 Redis 做轻量 MQ | 什么时候 Redis Stream 就够了、什么时候必须上专业 MQ | [Redis · 分布式锁与消息队列](/database/redis/lock-and-mq) |
| 数据同步管道 | Kafka 作为数仓入仓的缓冲层 | [Canal 数据同步](/bigdata/canal/)、[Doris 数仓](/bigdata/doris/) |
| 分布式事务 | RocketMQ 事务消息 vs Seata vs 本地消息表 | [分库分表](/database/sharding/)（跨库事务） |
| 缓存一致性 | 用 MQ 做缓存失效的异步补偿 | [Redis · 缓存模式](/database/redis/cache-patterns) |
| 消息轨迹与可观测 | 用轨迹排查"消息丢没丢" | [Actuator 与生产可观测](/java/spring/spring-boot/actuator)（指标与健康检查） |
| 设备接入与 K8s | MQTT 集群与后端消费的无状态化部署 | [Kubernetes](/cloud-native/kubernetes/)（弹性伸缩、滚动升级） |
| 全文检索与日志检索 | 消息队列**只负责搬运**，不做检索——需要"包含 + 相关性排序"时要另上检索引擎 | [搜索与检索](/search/)（Elasticsearch 5 篇）。**注：ELK 此前被列在本板块下，2026-09-16 已挪到该板块**（它既不是数据库也不是消息队列）；日志量大且不需相关性排序时，[Doris 倒排索引](/bigdata/doris/#indexes) 可替代 |
