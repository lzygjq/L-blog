---
order: 3
date: 2026-09-14
title: 集群与 ISR 高可用
desc: Broker 集群与分区副本、Leader/Follower 角色、ISR 动态维护与选主规则、HW/LEO/Leader Epoch 概念
---

# 集群与 ISR 高可用

## 一、问题场景

Kafka 的高可用要回答一个具体问题：**Leader 所在的 Broker 宕机了，消息会不会丢？服务会不会断？**

答案取决于一个动态集合——**ISR（In-Sync Replicas，同步副本集合）**。

**结论先行**：Kafka 的高可用由**三层**构成——**Broker 集群**（节点冗余）、**分区多副本**（数据冗余，Leader 读写 + Follower 同步）、**ISR 机制**（决定谁能当选新 Leader）。核心规则是：**选主只从 ISR 中选**，配合 `unclean.leader.election.enable=false`，实现"**宁可分区不可用，也不丢数据**"。

## 二、第一层：Broker 集群

```
        ┌──────────────── Kafka Cluster ────────────────┐
        │                                              │
   ┌────▼────┐      ┌─────────┐      ┌─────────┐       │
   │ Broker1 │◀────▶│ Broker2 │◀────▶│ Broker3 │       │
   │         │      │         │      │         │       │
   │ 控制器   │      │         │      │         │       │
   └─────────┘      └─────────┘      └─────────┘       │
        │                                              │
        └── 元数据管理：ZooKeeper（旧）/ KRaft（3.x+）────┘
```

| 要点 | 说明 |
|---|---|
| **节点冗余** | 一个 Kafka 集群由多个 Broker 组成，**某个 Broker 宕机不影响其他 Broker 继续服务** |
| **元数据管理** | ZooKeeper 负责（旧架构）；**Kafka 3.x 起可用 KRaft 模式去掉 ZooKeeper** |
| **Controller** | 集群中有一个 Broker 被选为 Controller，负责**分区 Leader 选举、副本分配**等管理操作 |
| **单节点能力** | 集群本身只解决"节点活着"的问题，**数据不丢靠的是下一层的副本机制** |

> **KRaft 模式**：Kafka 2.8 引入、3.3 起生产可用，用内部的 Raft 协议取代 ZooKeeper 做元数据管理。好处是**少了 ZooKeeper 这一套组件**（部署运维简化）、元数据操作更快、支持更多分区（ZK 模式下分区数受 ZK 性能限制）。新项目建议直接用 KRaft。**为什么 ZK 会成为分区数的天花板，见[KRaft 的因果链](/distributed/coordination/coordination-selection#kraft-why)；Kafka 4.0 起 ZK 模式已被彻底移除。**

## 三、第二层：分区与副本

```
              Topic: order（partition=3, replication-factor=3）

   ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
   │   Partition 0       │  │   Partition 1       │  │   Partition 2       │
   │                     │  │                     │  │                     │
   │ Broker1: Leader  ◀──┼──┼─ 读写都走这里         │  │                     │
   │ Broker2: Follower   │  │ Broker2: Leader     │  │ Broker2: Follower   │
   │ Broker3: Follower   │  │ Broker3: Follower   │  │ Broker3: Leader     │
   └─────────────────────┘  └─────────────────────┘  └─────────────────────┘

   → 每个分区的 Leader 分散在不同 Broker 上（负载均衡）
   → 每个分区有 3 个副本，任何单个 Broker 宕机，其他分区仍有 Leader 在服务
```

### 副本的两种角色

| 角色 | 职责 | 关键点 |
|---|---|---|
| **Leader** | **所有读写都走 Leader** | 生产者写 → Leader；消费者读 → Leader。**不是"Follower 分担读"** |
| **Follower** | **只同步 Leader 的数据**，不对外提供服务 | 通过向 Leader 发送 fetch 请求（**和消费者一样是 pull 模式**）拉取消息 |

> **常见误解**：以为"Kafka 会从 Follower 读以分担压力"。**默认不会**——Kafka 的读写都在 Leader 上。早期有 `replica.high.watermark.checkpoint` 之类的话题和 Kafka 2.4+ 引入的 **Follower Fetching**（允许消费者从最近的 Follower 读，降低跨机房流量），但**默认关闭**，需要显式开启 `client.rack` 等配置。

### 副本数

| 副本数 | 容错能力 | 建议 |
|---|---|---|
| 1 | ❌ 无容错 | 只用于可丢数据（日志） |
| 2 | 容 1 个 | 一般不推荐（无法做滚动重启） |
| **3** | **容 1 个，可滚动重启** | ✅ **生产标准** |
| 5 | 容 2 个 | 极高可靠要求（跨机房） |

**为什么至少 3 个**：如果只有 2 副本，要做**滚动重启**（逐个重启 Broker）时，一旦一个副本下线，ISR 就只剩 1 个，**无法满足 `min.insync.replicas=2`，写入会被拒绝**。3 副本时停机一个仍剩 2 个，业务不中断。

## 四、第三层：ISR 机制（核心）

### 什么是 ISR

**ISR（In-Sync Replicas）= 与 Leader 保持同步的副本集合，包含 Leader 自己。**

```
副本集合（AR, Assigned Replicas）= 全部分配的副本 = {Broker1, Broker2, Broker3}

        ┌──────────────── ISR ────────────────┐
        │  Broker1(Leader)  Broker2  Broker3  │   ← 同步良好，在 ISR 里
        └─────────────────────────────────────┘
                     Broker4（落后太多，被踢出 ISR）
                     ↓
              ISR = {Broker1, Broker2, Broker3}
              AR  = {Broker1, Broker2, Broker3, Broker4}
```

### 进 / 出 ISR 的判定

| 动作 | 条件 |
|---|---|
| **保持在 ISR** | Follower 定期向 Leader 发 fetch 请求，且落后时间在 `replica.lag.time.max.ms`（默认 **30 秒**）之内 |
| **被踢出 ISR** | 超过 `replica.lag.time.max.ms` 没有追上 Leader（网络慢、Broker 卡顿、磁盘慢、进程挂掉） |
| **重新加入 ISR** | 追上 Leader 的 LEO（日志末端偏移）后自动回到 ISR |

> **注意**：判定依据是**时间**（`replica.lag.time.max.ms`）而不是消息条数。早期版本曾有 `replica.lag.max.messages`（按落后条数判定），后来被移除——因为**消息条数无法反映真实延迟**（比如突发写入时，正常的 Follower 也会瞬间"落后很多条"）。

### 副本分类与选主优先级

| 副本类型 | 同步方式 | 数据完整性 | 选主优先级 |
|---|---|---|---|
| **ISR 副本** | 与 Leader 保持同步（心跳 + 延迟在阈值内） | ✅ 数据最全 | **优先选为 Leader** |
| **普通副本（非 ISR）** | 异步同步，**数据可能落后** | ⚠️ 可能缺数据 | **仅当 ISR 全挂才考虑**（且默认禁止） |

### 选主规则

```
Leader 故障
    │
    ▼
① 从 ISR 列表中选一个副本（通常选数据最全的）
    │
    ├─ ISR 中有可用副本 → 选出新 Leader ✅ 不丢数据
    │
    └─ ISR 全部不可用
            │
            ├─ unclean.leader.election.enable = false（默认）
            │     → 【分区不可用】，返回 LEADER_NOT_AVAILABLE
            │     → 宁可服务中断，也不丢数据 ✅
            │
            └─ unclean.leader.election.enable = true
                  → 从非 ISR 副本中选一个（数据落后）
                  → 服务恢复，但【落后的那部分消息永久丢失】❌
```

**一句话**：**ISR 的语义就是"这些副本的数据和 Leader 一样全"，所以只有它们有资格当 Leader。**

## 五、三个偏移量概念（进阶，高频追问）

理解 ISR 和"什么算已提交"需要三个概念：

| 概念 | 全称 | 含义 |
|---|---|---|
| **LEO** | Log End Offset | 某个副本**日志末端**的下一个待写入位置。每个副本的 LEO 不同——Follower 的 LEO 通常落后于 Leader |
| **HW** | High Watermark（高水位） | **ISR 中所有副本的 LEO 的最小值**。消费者**只能消费到 HW 之前的消息** |
| **Leader Epoch** | — | Leader 的"任期编号"，每次换 Leader 递增，用于**避免副本截断时数据错乱** |

```
        Leader  LEO = 10  ──────────────────────────────▶
        Follower1 LEO = 8  ──────────────────────▶
        Follower2 LEO = 7  ───────────────▶

        HW = min(10, 8, 7) = 7
             │
             └─▶ 【消费者只能读到 offset < 7 的消息】
                 offset 7、8、9 虽然 Leader 有，但副本还没同步到
                 → 对消费者【不可见】，因为如果此刻 Leader 挂了，
                   新 Leader 最多只有到 7 的数据
```

**HW 的意义**：**它划定了"已提交（committed）"的边界**——只有被**所有 ISR 副本**复制的消息才能被消费。这样即使发生 Leader 切换，消费者也不会读到"新 Leader 上没有的消息"。

> **一个经典问题：HW 机制导致的"数据不一致"**。旧版本 Kafka 中，HW 的推进依赖 Follower 的 fetch 请求，存在一个窗口期——新 Leader 的 HW 可能比旧 Leader 小，导致**已经对消费者可见的消息在切换后又变不可见**。Kafka 0.11 引入 **Leader Epoch** 解决：每条消息带上 Leader 的任期号，Follower 恢复时按 Epoch 判断该截断到哪，**避免"截断掉本不该截断的数据"**。

## 六、完整高可用配置

| 层次 | 配置 | 建议值 |
|---|---|---|
| 集群 | `broker.id` / `listeners` | 每节点唯一 |
| 集群 | 元数据 | Kafka 3.x+ 用 **KRaft** 替代 ZooKeeper |
| 副本 | `default.replication.factor` | **3** |
| 副本 | `min.insync.replicas` | **2** |
| ISR | `replica.lag.time.max.ms` | 30000（默认） |
| 选主 | `unclean.leader.election.enable` | **false**（默认，核心业务必须） |
| 控制器 | `controlled.shutdown.enable` | true（优雅停机时先转移 Leader） |

## 七、面试问答

**Q1：Kafka 的高可用机制是什么？**

从三个层面讲。① **集群层**：一个 Kafka 集群由多个 Broker 组成，某个 Broker 宕机不影响其他 Broker 继续服务；集群中有一个 Broker 担任 **Controller**，负责分区 Leader 选举和副本分配（元数据在旧架构由 ZooKeeper 管理，**Kafka 3.x 之后可以用 KRaft 模式去掉 ZooKeeper**）。② **分区副本层**：每个 topic 有多个分区，**每个分区有多个副本分布在不同 Broker 上**；副本分两种角色——**Leader 负责所有读写**，**Follower 只同步 Leader 的数据**（通过向 Leader 发 fetch 请求拉取）；Leader 宕机时自动从 Follower 中选新 Leader。生产环境副本数建议 **3**。③ **ISR 层**：ISR 是**与 Leader 保持同步的副本集合**，落后超过 `replica.lag.time.max.ms`（默认 30 秒）的副本会被踢出 ISR。**选主只从 ISR 中选**，因为只有它们的数据和 Leader 一样全。配合 `unclean.leader.election.enable=false`，ISR 全部不可用时**宁可分区不可用，也不让数据不全的副本当 Leader**。

**Q2：ISR 是什么？副本什么时候会被踢出 ISR？**

**ISR（In-Sync Replicas）是与 Leader 保持同步的副本集合，包含 Leader 本身**。判定标准是**时间**而非消息条数：Follower 会定期向 Leader 发送 fetch 请求，如果它**落后 Leader 的时间超过 `replica.lag.time.max.ms`（默认 30 秒）**，就会被踢出 ISR；等它追上 Leader 的 LEO（日志末端偏移）后会自动重新加入。常见的落后原因有网络延迟、Broker 负载/GC 卡顿、磁盘 IO 慢、进程挂掉。**这里用时间而不是条数是有原因的**：早期版本曾有按落后条数判定的参数，但在突发大量写入时，正常的 Follower 也会瞬间"落后很多条"而被误踢出 ISR，所以改成了按时间判定。

**Q3：Leader 宕机后如何选举？会不会丢数据？**

**默认不会丢数据**。选举规则是**只从 ISR 列表中选**（通常选数据最全的那个），因为 ISR 中的副本数据都和原 Leader 一样全，所以新 Leader 不会有数据缺失。如果 **ISR 中的副本全部不可用**，则取决于 `unclean.leader.election.enable`：设为 **`false`（默认）**时，分区**直接不可用**（客户端收到 leader 不可用错误），**宁可服务中断也不丢数据**；设为 `true` 时，会从**非 ISR 的普通副本**中选一个当 Leader——服务恢复了，但那个副本落后的消息**永久丢失**。所以这是典型的**可用性 vs 一致性取舍**，核心业务必须设为 `false`。

**Q4：什么是 HW 和 LEO？**

**LEO（Log End Offset）** 是某个副本日志末端下一个待写入的位置，每个副本的 LEO 不同，Follower 的 LEO 通常落后于 Leader。**HW（High Watermark）是 ISR 中所有副本 LEO 的最小值**，它划定了"**已提交**"的边界——**消费者只能消费到 HW 之前的消息**。举例：Leader 的 LEO=10、两个 Follower 分别是 8 和 7，那么 HW = min(10,8,7) = 7，消费者只能读到 offset 小于 7 的消息；offset 7~9 虽然 Leader 已经有了，但对消费者不可见——因为如果此刻 Leader 挂掉，新 Leader 最多只有到 7 的数据，让消费者读到 8、9 的话，一旦切换就会出现"读到的消息消失了"的诡异问题。**HW 机制保证了消费者不会读到可能被回滚的数据。**

**Q5：为什么副本数建议至少 3 个？**

因为要支持**滚动重启**和满足 `min.insync.replicas`。如果只有 **2 个副本**，做滚动重启（逐个重启 Broker）时，一旦一个副本下线，ISR 就只剩 1 个，**不满足 `min.insync.replicas=2`，写入会被直接拒绝**——业务中断。而 **3 个副本**下停掉一个仍剩 2 个，业务不中断，可以安全地逐个重启。所以生产标准是 **3 副本 + `min.insync.replicas=2`**：既能容忍 1 个 Broker 故障，又能在故障期间保持可写。要求更高的场景（如跨机房）可以设 5 副本，容错 2 个。

**Q6：KRaft 是什么？和 ZooKeeper 什么关系？**

**KRaft（Kafka Raft）是 Kafka 用来替代 ZooKeeper 的元数据管理方案**。旧架构里 Kafka 把 broker 注册、topic 配置、分区 Leader 等元数据存在 **ZooKeeper** 中，需要额外部署和维护一套 ZK 集群；**Kafka 2.8 引入 KRaft、3.3 起生产可用**，用 Kafka 自己实现的 Raft 协议管理元数据。好处有三点：① **少一套组件**，部署运维简化；② 元数据操作更快（不用跨进程通信）；③ **支持更多分区**（ZK 模式下分区数量受 ZK 写入性能限制）。另外 KRaft 下的 **Controller 也可以做成多副本**（不再依赖 ZK 的选主），元数据层本身也有了高可用。新项目建议直接用 KRaft 模式。
