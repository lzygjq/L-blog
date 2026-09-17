---
date: 2026-09-16
title: 分布式理论 · 板块导览
---

# 分布式理论 · 板块导览

先说清这个板块**不做什么**：它不重复 CAP 与 BASE 的取舍判据（[CAP 与 BASE](/java/spring/spring-cloud/cap-base) 已成篇），不讲分布式事务的具体方案（[分布式事务](/java/spring/spring-cloud/transaction) 已有专篇），也不写具体组件的安装部署。ZooKeeper / etcd 这类**协调服务**单独立了[分布式协调](/distributed/coordination/)子板块——但那里讲的同样是**机制与选型**，不涉及怎么装。

这里只做一件事：**把"多个节点如何表现得像一个"这件事，拆成三个可独立讲透的机制问题**——决策怎么统一、数据怎么摊开、身份怎么唯一。这三个问题是**与语言和框架无关**的，所以它属于底座层，不属于任何单一技术板块。子板块[分布式协调](/distributed/coordination/)再往前走一步：**把这三个机制打包成能用的服务之后，会多出什么问题**。

## 一、一条主线：物理上分散，逻辑上统一 {#thread}

分布式系统的全部工作，都可以概括成一句话：

> **在"物理上分散"的前提下，维持"逻辑上统一"的表象。**

这句话推下去，恰好就是三篇正文 + 一个子板块的主题：

| 要统一的什么 | 机制问题 | 本板块 |
|---|---|---|
| **状态的统一** | 多份副本要表现为一份数据 —— 靠什么保证它们不会各说各话？ | [共识协议](/distributed/consensus) |
| **位置的统一** | 多台机器要表现为一个存储 —— 数据放哪、扩容时动谁？ | [数据分布](/distributed/data-partition) |
| **身份的统一** | 多个节点要表现为一套编号 —— 谁发的 ID 都不会撞？ | [分布式 ID](/distributed/distributed-id) |
| **话语权的统一** | 多个进程要表现为一个决策者 —— 谁当主、谁的锁生效？ | [分布式协调](/distributed/coordination/)（子板块） |

**这三件事合起来解释了为什么"分布式"远比"多部署几台"复杂**：多部署几台只是获得了**物理上的冗余**，而上面这三层不解决，冗余就只是"多个会各自出错的地方"。

## 二、三篇地图与一个子板块 {#map}

| # | 篇 | 解决什么问题 | 一句话结论 |
|---|---|---|---|
| 1 | [共识协议：Paxos、Raft 与选主](/distributed/consensus) | 多副本怎么对"日志顺序"达成一致、脑裂为什么不可能 | 共识保证的是**日志顺序一致**（数据一致是推论）；一切安全性的来源是**多数派必有交集** |
| 2 | [一致性哈希与数据分布](/distributed/data-partition) | 数据怎么摊到多节点、扩容时代价多大 | 取模扩容要搬几乎全部数据，哈希环把它降到 **1/N**；**哈希槽**用显式映射把"迁移单位"变成可控项 |
| 3 | [分布式 ID 的生成方案](/distributed/distributed-id) | 全局唯一 ID 怎么生成才不出事 | 唯一性只是门槛；真正的难点是**趋势递增**（防页分裂）、**时钟回拨**（防重复）、**workerId 分配**、**前端精度丢失** |
| — | [分布式协调](/distributed/coordination/)（子板块，5 篇） | 把上面三者**服务化**之后：znode 与会话、ZAB、锁与 fencing、选型与集群治理 | 协调服务只存"**谁说了算**"、不存"发生了什么"；锁只能保证"**同一时刻一个人认为自己持有锁**"，**保证不了失去锁的人停手** |

## 三、三个反复出现的判据 {#criteria}

三篇的技术完全不同，但有三条判据贯穿始终——它们可以直接当评审问题用：

**① 「这个数据的读错了会怎样？」**

出自 CAP 的取舍逻辑，但它在本板块有更具体的用法：

```text
选主结果、配置、锁  → 读到旧的会出大问题 → 用共识协议（昂贵但正确）
服务列表、商品详情  → 读到旧的只是显示旧  → 用更轻的复制或最终一致
```

**这也是"Kafka 与 RocketMQ 都把元数据交给 Raft、业务数据却不用"的原因**——共识是昂贵的一致性，用在刀刃上就好。

**② 「代价在扩容时结算，还是在日常结算？」**

数据分布的核心张力。取模在日常零成本、扩容时几乎全量重排；一致性哈希在扩容时只动 1/N；哈希槽多了一张映射表要维护。**判断方案好坏，看的应该是"扩容时动多少数据"，而不是"平时看起来简不简单"。**

**③ 「失效是静默的，还是响亮的？」**

这是三篇里最实用的一条。**分布式系统的多数事故，都来自"静默失效"**：

| 静默失效 | 为什么危险 | 本板块的对应 |
|---|---|---|
| 时钟回拨后**继续发号** | 不报错，只是 ID 开始重复 | [时钟回拨的五种处理策略](/distributed/distributed-id#clock-strategies) |
| 3 副本但写入只要 1 份确认 | 看着是高可用，实际挂两台就丢数据 | [多数派与容错能力](/distributed/consensus#quorum) |
| 槽迁移中把 ASK 当 MOVED | 不报错，读到空值 | [两种重定向](/distributed/data-partition#routing) |
| 主从切换后读到旧值 | 接口正常返回，只是数据是旧的 | 提交 ≠ 应用（[Raft 日志复制](/distributed/consensus#raft-subproblems)） |

> **可操作的做法**：给每一个"分布式机制"都补一条**可观测的失效信号**——时钟回拨率、`term` 变化速率、槽迁移进度、副本落后条数。**没有指标的分布式机制，等于没有机制。**

## 四、与其他板块的关系 {#relations}

| 板块 | 关系 |
|---|---|
| [CAP 与 BASE](/java/spring/spring-cloud/cap-base) | **取舍层**：CAP 回答"分区时选 C 还是 A"、BASE 回答"放弃 C 之后怎么办"、一致性谱系回答"强到弱排在哪"。**本板块回答"这些取舍怎么用机制实现"**——两者是"判据"与"手段"的关系 |
| [分布式协调](/distributed/coordination/)（本板块子板块） | **工程化层**：把本板块的机制打包成服务之后，多出来的是会话、Watcher、fencing、配额与磁盘——判据往下一层，问题就从"算法对不对"变成"**运维会不会翻车**" |
| [分布式事务](/java/spring/spring-cloud/transaction) | **应用层**：XA / AT / TCC / Saga 都是"把一致性方案落到业务事务"；本板块的共识协议是"更底层怎么做日志复制" |
| [消息队列](/middleware/) | **最密集的应用现场**：RabbitMQ 仲裁队列、Kafka KRaft、RocketMQ Controller 各取 Raft 的一部分用（见[落地对照](/distributed/consensus#practice)） |
| [数据存储](/database/) | Redis Cluster 用**哈希槽**、Sentinel 用**类 Raft 投票**；[分库分表](/database/sharding/) 讲落地，本板块讲**算法本身** |
| [数据仓库](/bigdata/) | Doris 的 FE 选主走类 Paxos 协议；元数据一致性同样是共识问题 |
| [架构路线](/projects/architecture-evolution/) | 分片、多副本这些演进动作的**理论依据**在本板块 |
| [面试专题](/interview/) | 检索层：跨板块连线题与题单索引 |

## 五、面试高频索引 {#interview}

| 主题 | 高频问法 | 出处 |
|---|---|---|
| 共识的定义 | "共识协议保证的是什么一致" | [复制状态机](/distributed/consensus#rsm) |
| 为什么奇数副本 | "3 副本和 4 副本的区别" | [多数派](/distributed/consensus#quorum) |
| Paxos | "Paxos 的两个阶段在干什么" | [两阶段](/distributed/consensus#paxos-phases) |
| Paxos 的不变式 | "为什么新提案必须继承已接受的值" | [核心不变式](/distributed/consensus#paxos-invariant) |
| Raft vs Paxos | "两者最大的差别是什么" | [Multi-Paxos 的定位](/distributed/consensus#paxos-multipaxos) |
| Raft 选举 | "随机超时为什么必要" | [三个子问题](/distributed/consensus#raft-subproblems) |
| Raft 安全约束 | "新 Leader 为什么要先提交一条空日志" | [两条安全约束](/distributed/consensus#raft-safety) |
| 脑裂 | "共识协议怎么杜绝脑裂" | [脑裂](/distributed/consensus#split-brain) |
| 一致性哈希 | "取模扩容为什么会出问题" | [哈希环](/distributed/data-partition#ring) |
| 虚拟节点 | "虚拟节点解决什么问题、不解决什么" | [虚拟节点](/distributed/data-partition#virtual-nodes) |
| 哈希槽 | "Redis 为什么用 16384 个槽" | [工程变体](/distributed/data-partition#variants) |
| MOVED 与 ASK | "为什么 ASK 不能更新映射表" | [两种重定向](/distributed/data-partition#routing) |
| 雪花结构 | "41 位时间戳能用多久" | [位分配](/distributed/distributed-id#snowflake) |
| 时钟回拨 | "时钟回拨怎么处理" | [五种策略](/distributed/distributed-id#clock-strategies) |
| workerId | "容器环境下 workerId 怎么分配" | [workerId 分配](/distributed/distributed-id#worker-id) |
| 前端精度 | "雪花 ID 传到前端为什么会错" | [精度陷阱](/distributed/distributed-id#js-precision) |
| 协调服务的边界 | "什么该交给 ZooKeeper" | [协调问题的边界](/distributed/coordination/what-coordination-solves#what) |
| 会话与临时节点 | "进程被 kill 了临时节点怎么没的" | [会话机制](/distributed/coordination/zookeeper-model#session) |
| ZK 的读是否线性一致 | "刚写完立刻读能读到吗" | [默认本地读](/distributed/coordination/zab-protocol#read-consistency) |
| 分布式锁的能力边界 | "锁保证不了什么" | [fencing token](/distributed/coordination/coordination-lock#fencing-why) |
| etcd 为什么突然只读 | "NOSPACE 怎么恢复" | [etcd 的配额](/distributed/coordination/coordination-selection#etcd-quota) |

> **本板块 8 篇正文 / 10 页**——其中[分布式协调](/distributed/coordination/)子板块 5 篇 / 6 页。与 [CAP 与 BASE](/java/spring/spring-cloud/cap-base) 的分工是「机制 vs 判据」，与 [分库分表](/database/sharding/) 的分工是「算法 vs 落地」，两边交叉引用而不复制正文。
