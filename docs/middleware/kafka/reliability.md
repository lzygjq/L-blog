---
order: 1
date: 2026-09-14
title: 可靠性：acks、ISR 与 offset 提交
desc: 生产端 acks 三档与幂等生产者、Broker 端 min.insync.replicas 与 unclean 选举、消费端手动提交 offset
---

# 可靠性：acks、ISR 与 offset 提交

## 一、问题场景

Kafka 丢数据的三个位置和 RabbitMQ 一模一样，但**具体手段完全不同**：

```
Producer ────①────▶ Leader ──②──▶ ISR 副本 ────③────▶ Consumer
          网络抖动             Leader 宕机         自动提交 offset
          acks 没收到          Follower 没同步完    但业务还没处理完
```

**结论先行**：Kafka 的"不丢"由三组配置共同保证——**生产者端 `acks=all` + `retries` + 异步回调**；**Broker 端 `min.insync.replicas≥2` + `unclean.leader.election.enable=false`**；**消费者端关闭自动提交、改手动提交 offset**。其中**最容易被漏掉、也最常被追问的是 `min.insync.replicas` 和 `unclean.leader.election` 这两个配置**——很多人答了 `acks=all` 就停了，而**单独设 `acks=all` 在某些情况下会退化成只等 Leader，等于白设**。

## 二、第一层：Producer → Broker

### 三层手段

| 手段 | 配置 | 作用 |
|---|---|---|
| **重试** | `retries=10`（或 `Integer.MAX_VALUE`） | 网络抖动导致的发送失败自动重试 |
| **确认级别** | **`acks=all`** | **所有 ISR 副本写入成功才算发送成功** |
| **异步发送带回调** | `producer.send(record, callback)` | 失败时拿到异常，记录日志/落库重发 |

### `acks` 三档（面试必答）

| `acks` | 含义 | 可靠性 | 吞吐 | 适用 |
|---|---|---|---|---|
| **`0`** | 发出去就不管，**不等任何确认** | ❌ 最差——Broker 没收到也不知道 | 最高 | 日志、监控等可丢场景 |
| **`1`** | **Leader 写入成功**即返回 | ⚠️ Leader 刚写就宕机、Follower 未同步 → **丢数据** | 高 | 一般业务 |
| **`all`（或 `-1`）** | **所有 ISR 副本**都写入成功才返回 | ✅ 最高 | 最低（等待最慢的 ISR） | **金融、订单等核心业务** |

```java
Properties props = new Properties();
props.put(ProducerConfig.ACKS_CONFIG, "all");
props.put(ProducerConfig.RETRIES_CONFIG, 10);
props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);      // 幂等生产者
props.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);

producer.send(new ProducerRecord<>("order", orderId, json), (metadata, exception) -> {
    if (exception != null) {
        log.error("发送失败，orderId={}", orderId, exception);
        // 落库 + 定时补偿重发
    }
});
```

> **`acks=all` 不等于"绝对不丢"**——它只保证"**在 ISR 范围内的副本都写成功了**"。如果 ISR 里只剩 Leader 一个（其他副本都掉线了），`acks=all` 就退化成 `acks=1`。**这就是必须配合 `min.insync.replicas` 的原因。**

### 幂等生产者（Kafka 0.11+，加分项）

**解决的是"重试导致的重复"**：开启重试后，如果 Broker 写成功但 ack 丢包，生产者会重发 → 消息重复。

```java
props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
// 开启后会强制：acks=all、retries>0、max.in.flight<=5
```

**原理**：Broker 给每个生产者分配 **PID（Producer ID）**，生产者给每条消息附加**单调递增的序列号（Sequence Number）**。Broker 端按 `<PID, 分区, 序列号>` 去重——**序列号重复的消息直接丢弃**。

| 能力 | 边界 |
|---|---|
| ✅ 保证**单生产者、单分区、单会话**内不重复 | 跨分区、跨生产者、跨会话不保证 |
| ⚠️ 需要 `acks=all` + `retries>0` | 是开启幂等的前提（否则配置报错） |
| ✅ 顺带保证**单分区内有序**（即使有重试） | 因为重复消息被丢弃，乱序窗口被消除 |

## 三、第二层：Broker → ISR 副本

**这是最容易被答漏的一层**。`acks=all` 只是生产者的"要求"，Broker 端必须**配合两个配置**才能真正兑现：

| 配置 | 作用 | 不配的后果 |
|---|---|---|
| **`min.insync.replicas ≥ 2`** | ISR 中副本数**少于该值时拒绝写入**（返回 `NOT_ENOUGH_REPLICAS`） | ISR 只剩 Leader 时 **`acks=all` 退化成 `acks=1`**——生产者以为"所有副本都确认了"，实际只有 1 个副本 |
| **`unclean.leader.election.enable = false`**（默认） | **禁止非 ISR 副本当选 Leader** | 数据落后的 Follower 当上 Leader → **已提交的消息凭空消失** |

```properties
# broker 端配置
min.insync.replicas=2
unclean.leader.election.enable=false
default.replication.factor=3
```

### 两个配置的配合逻辑

```
副本数 = 3，min.insync.replicas = 2

正常：node1(Leader) + node2 + node3 都在 ISR
      → acks=all 等 3 个副本确认 ✅

node3 掉线：ISR = {node1, node2}，2 ≥ min.insync.replicas(2)
      → 仍可写入，acks=all 等 2 个副本确认 ✅

node2 也掉线：ISR = {node1}，1 < 2
      → 【拒绝写入】，生产者收到 NOT_ENOUGH_REPLICAS ❌
      → 这就是我们要的：宁可写不进去，也不写一份随时会丢的数据
```

> **"宁可不可用，也不丢数据"** 是这一层的核心取舍。**想清楚这个逻辑，就理解了为什么这两个配置必须成对出现**：`acks=all` 说"我要所有副本确认"，`min.insync.replicas` 说"如果副本不够，那就根本不要写"。

**更严格的取值**：可以设 `min.insync.replicas = 副本数`（如 3 副本设 3），意味着必须全部在线才可写——可靠性最高，但**任何一个副本掉线就不可写**，可用性下降。这就是 **CAP 在 Kafka 里的具体体现**。

## 四、第三层：Broker → Consumer

**Kafka 的消费者最容易"丢数据"的方式不是消息丢了，而是 `offset` 提交太早**：

```
❌ 自动提交（默认 enable.auto.commit=true）
   poll() 拿到消息 → 【offset 已自动提交】→ 业务逻辑还在处理 → 进程挂了
   → 重启后从已提交的 offset 继续 → 【那批消息永远不会再被消费】= 丢消息
```

| 配置 | 说明 |
|---|---|
| **`enable.auto.commit=false`** | **关闭自动提交**（生产必须） |
| **手动提交 offset** | 业务处理**完成后**再提交 |

### 手动提交的两种方式

| 方式 | 写法 | 特点 |
|---|---|---|
| **同步提交** | `consumer.commitSync()` | 阻塞等待，可靠但**影响吞吐**；适合核心链路 |
| **异步提交** | `consumer.commitAsync(callback)` | 不阻塞，吞吐高，但**失败不会自动重试**（可能重复消费） |
| **组合（推荐）** | 正常循环用 `commitAsync`，`finally` 里用 `commitSync` | 兼顾吞吐与最终可靠 |

```java
consumer.subscribe(List.of("order"));
try {
    while (running) {
        ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(500));
        for (ConsumerRecord<String, String> r : records) {
            process(r);                                  // ① 先处理业务
        }
        consumer.commitAsync();                          // ② 再异步提交（吞吐好）
    }
} catch (Exception e) {
    log.error("消费异常", e);
} finally {
    try {
        consumer.commitSync();                           // ③ 退出前同步提交兜底
    } finally {
        consumer.close();
    }
}
```

> **注意：这里仍然可能"重复消费"**。因为"处理完业务"和"提交 offset"不是原子的——处理完了但提交前宕机，重启后仍会重放那批消息。**所以消费端幂等依然是必须的**（见下节）。

## 五、重复消费与幂等

### 为什么会重复

| 原因 | 过程 |
|---|---|
| **提交 offset 前宕机** | 业务处理完了，offset 还没提交 → 重启后重放 |
| **Rebalance** | 消费者组变化，分区重新分配，未提交的 offset 被重放 |
| **异步提交失败** | `commitAsync` 失败不重试，下次 poll 从旧 offset 继续 |
| **生产者重试** | 未开幂等生产者时，重试导致 Broker 端出现重复消息 |

**本质与 RabbitMQ 完全一致**：**at-least-once**。Kafka 的消费端也**必须做幂等**。

### 幂等方案

| 方案 | 实现 | 适用 |
|---|---|---|
| **唯一 ID + 去重表** | 生产者给消息打全局唯一 ID（或用 `topic-partition-offset` 三元组），消费者查库去重 | 强一致场景 |
| **Redis `setnx`** | `SET msg:{id} 1 NX EX 600` | 高并发、轻量（最常用） |
| **业务状态机** | 按业务状态判断（订单已支付则忽略回调） | 有状态流转的业务 |
| **Kafka 幂等生产者** | PID + 序列号，Broker 端去重 | **只管"生产到 Broker"这一段**，不管消费端 |

> **重要区分**：**幂等生产者 ≠ 消费端幂等**。前者只解决"生产者重试导致 Broker 多存了一条"，后者解决"同一批次被消费两次"。**两者是不同链路的问题，不能互相替代**——面试时把这一层分清是加分点。

### 一个实用的幂等键

消费端如果拿不到业务唯一 ID，可以用 **`topic + partition + offset`** 作为天然唯一键——因为**每条消息在 Kafka 内部的定位就是全局唯一的**：

```java
String idempotentKey = "mq:idem:" + record.topic() + ":" + record.partition() + ":" + record.offset();
```

## 六、完整配置清单

| 环节 | 配置 | 说明 |
|---|---|---|
| 生产者 | `acks=all` | 所有 ISR 副本确认 |
| 生产者 | `retries=10`（或很大） | 自动重试 |
| 生产者 | `enable.idempotence=true` | 幂等生产者，防重试导致重复 |
| 生产者 | `send(record, callback)` | 异步回调处理失败（落库+补偿） |
| Broker | `min.insync.replicas=2` | **防 `acks=all` 退化** |
| Broker | `unclean.leader.election.enable=false` | 禁止非 ISR 副本当 Leader |
| Broker | `replication.factor=3` | 副本数（配合上两项） |
| 消费者 | `enable.auto.commit=false` | **关闭自动提交** |
| 消费者 | 手动提交（`commitSync` + `commitAsync` 组合） | 处理完再提交 |
| 消费者 | 幂等：Redis setnx / 去重表 | 防重复消费 |

## 七、面试问答

**Q1：Kafka 如何保证消息不丢失？**

从三个环节保障。① **生产者到 Broker**：设置 `retries` 自动重试、**`acks=all`** 让所有 ISR 副本确认才算成功、异步发送带回调，失败时记录日志或落库定时重发；还可以开启**幂等生产者**（`enable.idempotence=true`）防止重试导致重复。② **Broker 自身**：`acks=all` 必须配合 **`min.insync.replicas ≥ 2`**——否则当 ISR 里只剩 Leader 时，`acks=all` 会**退化成 `acks=1`**，生产者以为所有副本都确认了，实际只有一份；同时设置 **`unclean.leader.election.enable=false`**，禁止非 ISR 中数据落后的副本当选 Leader，避免已提交的消息凭空消失。③ **Broker 到消费者**：**关闭自动提交**（`enable.auto.commit=false`），改成**手动提交 offset**，业务处理完再提交。**另外消费端也要做幂等**，因为"处理完"和"提交 offset"不是原子的，仍可能重复消费。

**Q2：`acks` 有哪几个取值？分别什么含义？**

三档：**`0`**——消息发出即认为成功，**不等任何确认**，可靠性最差（Broker 没收到也不知道），吞吐最高；**`1`**——**Leader 写入成功**即返回，但如果 Leader 刚写完就宕机、Follower 还没来得及同步，**数据会丢**；**`all`（等价于 `-1`）**——**所有 ISR 副本都写入成功**才返回，可靠性最高，吞吐最低（要等最慢的 ISR 副本）。核心业务用 `acks=all`。**注意一个坑**：`acks=all` 并不绝对安全——如果 ISR 里只剩 Leader 一个副本，它就等价于 `acks=1`，所以必须配合 `min.insync.replicas≥2`。

**Q3：为什么 `acks=all` 还要配 `min.insync.replicas`？**

因为 **`acks=all` 的语义是"所有 ISR 副本确认"，而不是"所有副本确认"**。ISR 是一个**动态集合**——副本掉线或同步滞后就会被踢出 ISR。极端情况下 ISR 里只剩 Leader 一个，此时 `acks=all` 就退化为 `acks=1`：Leader 写完就返回成功，一旦 Leader 宕机，消息就丢了。`min.insync.replicas=2` 的作用是**给写入设一道门槛**：当 ISR 中的副本数少于 2 时，Broker 直接**拒绝写入**并返回 `NOT_ENOUGH_REPLICAS`。这样就把"宁可不可用，也不丢数据"这个取舍落实到了配置上。**这两个配置必须成对出现才有意义。**

**Q4：`unclean.leader.election.enable` 是干什么的？**

它控制**是否允许非 ISR 中的副本当选 Leader**，**默认 `false`（禁止）**。如果设为 `true`，当 ISR 中的副本全部不可用时，Kafka 会从**数据落后**的普通副本里选一个当 Leader——分区恢复了可用性，但**那些副本缺少的消息就永久丢失了**。设为 `false` 时，Kafka **宁可让分区不可用**（返回 leader 不可用错误），也不接受数据丢失。这是典型的**可用性 vs 一致性取舍**：核心业务必须设为 `false`。

**Q5：Kafka 会自动重复消费吗？怎么解决？**

会。原因是**"处理业务"和"提交 offset"不是原子操作**：如果业务处理完了但 offset 还没提交就宕机，重启后会从上次提交的 offset 重新消费；此外 Rebalance 导致分区重新分配、异步提交失败不回滚，都会造成重复。**本质是 at-least-once 语义，重复无法避免**。解决方式是在**消费端做幂等**：① **唯一 ID + 去重表**——生产者给消息打全局唯一 ID，或直接用 `topic+partition+offset` 作为天然唯一键（每条消息在 Kafka 内定位就是唯一的），消费前查库判断；② **Redis `setnx`**——`SET msg:{id} 1 NX EX 600`，设置成功才消费，轻量且高并发友好；③ **业务状态机**——按业务状态判断。要注意**幂等生产者 ≠ 消费端幂等**：幂等生产者（PID + 序列号）只解决"生产者重试导致 Broker 多存一条"，而消费端重复是另一段链路的问题，**两者不能互相替代**。

**Q6：`enable.auto.commit=true` 有什么风险？**

**会丢消息**。自动提交是**定时**（默认 5 秒 `auto.commit.interval.ms`）把当前 poll 到的位置提交上去，它**不关心你的业务逻辑有没有处理完**。所以会出现这种情况：`poll()` 拿到一批消息 → 自动提交已经把 offset 推进了 → 业务逻辑还在处理 → 进程宕机 → 重启后从已提交的 offset 继续，**那批没处理完的消息永远不会再被消费，等于丢失**。所以生产环境必须设 `enable.auto.commit=false`，改成**处理完成后手动提交**。手动提交时推荐"**正常循环用 `commitAsync`（吞吐好）+ `finally` 里用 `commitSync` 兜底**"的组合。
