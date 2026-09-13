---
order: 2
date: 2026-09-14
title: 可靠性：confirm、持久化与 ack
desc: 生产者 confirm/return 回调、Broker 三者持久化、消费者 ack 三模式与 Spring Retry、重复消费三因与三种幂等方案
---

# 可靠性：confirm、持久化与 ack

## 一、问题场景

这是 RabbitMQ 面试**几乎每年必问**的一题。绝大多数人答成"开启持久化就不丢了"——**这句话连三分之一都没覆盖**。

消息从生产者到消费者要穿过**三条链路、三个进程**，每一段都有自己的丢法：

```
Producer ────①────▶ Exchange ──②──▶ Queue ────③────▶ Consumer
           网络抖动              路由失败          处理中宕机
           MQ 没收到             消息未入队        还没 ack
```

**结论先行**：**"不丢"必须按链路拆成三层保障**——① 生产者端 `publisher confirm`（`confirm` 回调 + `return` 回调）；② Broker 端**交换机 + 队列 + 消息三者持久化**；③ 消费者端**手动 ack** + 重试 + 兜底队列。**只答持久化，考官会认为你没做过生产**。

而"重复消费"是另一个维度的问题：**它无法根治**，只能在消费端做幂等。

## 二、第一层：生产者 → MQ

### `publisher confirm` 机制

RabbitMQ 提供**两个不同层次的回调**，很多人只知道第一个：

| 回调 | 触发时机 | 回答的问题 | 失败说明 |
|---|---|---|---|
| **`confirm` 回调** | Broker 确认消息**到达 Exchange** | 消息到交换机了吗？ | 交换机不存在、权限不足 |
| **`return` 回调** | 消息到 Exchange 但**没有路由到任何队列** | 消息进队列了吗？ | routing-key 不匹配任何 Binding |

```
生产者 ──publish──▶ Exchange
                      │
          confirm ────┘ ①  到交换机了吗？ → ConfirmCallback
                      │
                      ├─ 有匹配 Binding → 进队列 ✅
                      │
                      └─ 无匹配 Binding → 触发 return ② → ReturnCallback（需 mandatory=true）
```

**只开 confirm 不开 return 是不够的**——消息可能"成功到达交换机但没进任何队列"，此时 confirm 是成功的（`ack=true`），但消息已经被**静默丢弃**了。这是一个非常典型的盲区。

```java
// ① confirm 回调：是否到达交换机
rabbitTemplate.setConfirmCallback((correlationData, ack, cause) -> {
    if (!ack) {
        log.error("消息未到达交换机，id={}, 原因={}", correlationData.getId(), cause);
        // 落库 + 定时补偿重发
    }
});

// ② return 回调：是否路由到队列（必须设置 mandatory=true 才会触发）
rabbitTemplate.setReturnsCallback(returned ->
    log.error("消息路由失败：exchange={}, routingKey={}, replyText={}",
              returned.getExchange(), returned.getRoutingKey(), returned.getReplyText()));
rabbitTemplate.setMandatory(true);
```

> **`mandatory` 是前提**：只有 `mandatory=true` 时，无法路由的消息才会**退回给生产者**（触发 return）；否则 Broker 直接丢弃，生产者毫不知情。

### 失败之后怎么办：三种补偿策略

| 策略 | 做法 | 适用 |
|---|---|---|
| **记录日志** | 只记日志，人工排查 | 低价值消息，或消息量小 |
| **存 DB 定时重发**（面试推荐） | 消息落库（状态=待发送），定时任务扫描失败记录重发 | **高可靠要求**（订单、支付） |
| **即时重发** | 回调里立刻重试 N 次 | 网络瞬时抖动；但可能放大故障 |

**面试口径**：说"**记日志 + 落库定时重发**"最稳——它体现了"**消息最终一定会被处理**"的补偿思维，而不是"重试几次算了"。

## 三、第二层：Broker 自身（三个持久化缺一不可）

MQ 宕机时，**内存里的消息会丢**。持久化要求三样东西**同时开启**：

| 对象 | 设置 | 不做的后果 |
|---|---|---|
| **交换机持久化** | `durable = true` | Broker 重启后交换机消失 → 消息无处可路由 |
| **队列持久化** | `durable = true` | 重启后队列消失 → **消息全丢** |
| **消息持久化** | `DeliveryMode.PERSISTENT` | 消息只在内存 → **重启即丢** |

```java
// 交换机持久化
new TopicExchange("order.exchange", true, false);   // durable=true

// 队列持久化
new Queue("order.queue", true);                     // durable=true

// 消息持久化
MessageProperties props = new MessageProperties();
props.setDeliveryMode(MessageDeliveryMode.PERSISTENT);  // 关键：默认是非持久的！
rabbitTemplate.send("order.exchange", "order.create", new Message(body, props));
```

> **两个容易忽略的细节**：
> 1. **消息默认是不持久的**（`DeliveryMode` 默认 `NON_PERSISTENT`）。开了队列持久化，消息照样会在重启时丢——**必须逐条设置**，或在 `RabbitTemplate` 上统一配置 `MessageProperties`。
> 2. **持久化有性能代价**：消息要写磁盘（受 `fsync` 影响），吞吐会下降。所以"持久化 + 惰性队列"和"高吞吐"是矛盾的——**明确哪些消息必须持久化，而不是全量开**。

## 四、第三层：MQ → 消费者

消费者"拿到消息但还没处理完就挂了"，消息就丢了。这靠**消费者确认机制（ack）**解决：

| ack 模式 | 行为 | 风险 |
|---|---|---|
| **`none`** | 关闭 ack——消息一发出就当作已消费 | ❌ **最容易丢**，消息发出即删 |
| **`auto`** | 无异常自动 ack；抛异常则 nack | ⚠️ 分不清"业务失败"和"代码 BUG"；且 ack 在方法返回前就已发出，**处理到一半宕机仍会丢** |
| **`manual`（推荐）** | 业务代码**显式** `basicAck` / `basicNack` | ✅ 处理完才确认，能精确控制 |

```yaml
spring:
  rabbitmq:
    listener:
      simple:
        acknowledge-mode: manual          # 手动 ack
        retry:
          enabled: true                   # 开启本地重试
          max-attempts: 3                 # 最多重试 3 次
          initial-interval: 1000          # 首次间隔 1s
          multiplier: 2                   # 退避倍数
```

```java
@RabbitListener(queues = "order.queue")
public void handle(OrderMessage msg, Channel channel,
                   @Header(AmqpHeaders.DELIVERY_TAG) long tag) throws IOException {
    try {
        orderService.process(msg);
        channel.basicAck(tag, false);            // ✅ 处理成功后确认
    } catch (BizException e) {
        channel.basicNack(tag, false, false);    // 业务失败：不重入队，投死信队列人工处理
    } catch (Exception e) {
        channel.basicNack(tag, false, true);     // 系统异常：重新入队（注意：可能死循环！）
    }
}
```

> **`basicNack(requeue=true)` 是个陷阱**：如果这条消息一定会让消费失败（如数据格式错误），重新入队会**无限循环重投**，把消费者打满。**标准做法是 `requeue=false` 让它进死信队列**（见[死信与延迟队列](/middleware/rabbitmq/dead-letter)），再配合 **Spring Retry** 做有限次本地重试。

### 一个完整的消费端可靠性配置

```
本地重试（Spring Retry，3 次，指数退避）
      │ 重试耗尽
      ▼
requeue = false → 投递到【异常交换机 / 死信交换机】
      │
      ▼
进入死信队列 → 人工处理 / 定时补偿 / 告警
```

**这条链路把"消息一定不会凭空消失"这件事兜住了**——哪怕消费永远失败，消息也躺在死信队列里，而不是消失。

## 五、重复消费：无法根治，只能幂等

### 为什么会重复

| 原因 | 过程 |
|---|---|
| **ack 丢失** | 消费者处理完了，发 ack 时网络抖动，MQ 没收到 → **MQ 认为没消费，重投** |
| **消费者宕机** | 处理到一半进程挂了，还没来得及 ack → **MQ 重投** |
| **Rebalance** | 消费者组变化（新成员加入/退出），offset 未及时提交 → **重复消费** |

**本质**：**网络不可靠，所以"确认"这件事本身可能失败**。MQ 只能用"没收到 ack 就重投"来保证不丢——这与"不重复"天然矛盾。

> **一个必须建立的心智模型**：MQ 的投递语义是 **at-least-once（至少一次）**，不是 exactly-once。所以**幂等是消费端的强制义务，不是可选优化**。

### 三种幂等方案

| 方案 | 实现 | 适用场景 | 代价 |
|---|---|---|---|
| **唯一 ID + 去重表** | 生产者给每条消息生成全局唯一 ID；消费者处理前查 DB 去重表，存在则跳过 | **对一致性要求最高**的场景（支付、账务） | 每消费一次多一次 DB 查询 + 写；需处理"去重表写入与业务操作同事务" |
| **Redis `setnx`** | `SET msg:{id} 1 NX EX 600`，设置成功才消费 | **高并发、轻量级**场景（最常用） | 依赖 Redis 可用性；key 过期后**失去幂等保护**（TTL 是幂等窗口） |
| **业务状态机** | 用业务自身状态判断，如"订单已支付"则忽略支付回调 | **有明确状态流转**的业务 | 只适用于幂等的自然业务；无边界的操作不适用 |

```java
// 方案二：Redis setnx（面试首推，轻量且并发友好）
@RabbitListener(queues = "order.queue")
public void handle(OrderMessage msg, Channel channel, ...) throws IOException {
    String key = "mq:idempotent:" + msg.getMsgId();
    Boolean first = redisTemplate.opsForValue().setIfAbsent(key, "1", Duration.ofMinutes(10));
    if (Boolean.FALSE.equals(first)) {
        channel.basicAck(tag, false);     // 已消费过 → 直接 ack 跳过
        return;
    }
    try {
        orderService.process(msg);
        channel.basicAck(tag, false);
    } catch (Exception e) {
        redisTemplate.delete(key);        // ⚠️ 业务失败要删掉标志，否则重试会被误判为"已消费"
        channel.basicNack(tag, false, true);
    }
}
```

> **上面代码里那行 `redisTemplate.delete(key)` 是面试的加分点**：很多人只说"setnx 成功才消费"，但没说**业务失败时必须把标志删掉**——否则重试时会被当作"已消费过"直接跳过，**消息被静默丢弃**，从"防重复"变成了"丢失"。**这才是这个方案真正的难点。**

### 怎么选

```
支付/账务等强一致场景         → 唯一ID + DB 去重表（可纳入同一事务）
高并发、允许最终一致          → Redis setnx（注意失败要删 key）
业务本身有状态机              → 业务状态判断（最优雅，零额外存储）
```

## 六、完整可靠性清单（可对照上线自查）

| 环节 | 配置项 | 说明 |
|---|---|---|
| 生产者 | `publisher-confirm-type: correlated` | 开启 confirm 回调 |
| 生产者 | `publisher-returns: true` + `template.mandatory: true` | 开启 return 回调 + 无法路由时退回 |
| 生产者 | 失败补偿：落库 + 定时重发 | 兜底，避免只记日志 |
| Broker | Exchange `durable=true` | 交换机持久化 |
| Broker | Queue `durable=true` | 队列持久化 |
| Broker | 消息 `DeliveryMode.PERSISTENT` | **单条消息持久化（默认关闭！）** |
| 消费者 | `acknowledge-mode: manual` | 手动 ack |
| 消费者 | `retry.enabled: true` + `max-attempts` | 有限次本地重试 |
| 消费者 | 重试耗尽 → `requeue=false` → 死信队列 | 兜底，消息不消失 |
| 消费者 | 幂等：Redis setnx / 去重表 | 防重复消费 |

## 七、面试问答

**Q1：RabbitMQ 如何保证消息不丢失？**

要从**三个环节**分别保障。① **生产者到 MQ**：开启 `publisher confirm` 机制——消息到交换机返回 `confirm` 回调，到队列返回 `return` 回调（需 `mandatory=true`）；失败后记录日志、落库定时重发或即时重发。② **MQ 自身**：开启**持久化**，而且**交换机持久化、队列持久化、消息持久化三者缺一不可**（消息的 `DeliveryMode` 默认是非持久的，必须显式设为 `PERSISTENT`）。③ **MQ 到消费者**：用**手动 ack**，处理完再确认；处理失败用 **Spring Retry** 做有限次本地重试，重试耗尽后 `requeue=false` 投递到**异常交换机/死信队列**做人工处理。**关键是"消息即使永远处理不成功，也不会消失"**。

**Q2：`confirm` 回调和 `return` 回调有什么区别？**

它们**回答的是两个不同的问题**。`confirm` 回调回答"消息**到达交换机**了吗"——失败通常是交换机不存在或权限不足。`return` 回调回答"消息**路由到队列**了吗"——消息到了交换机但**没有匹配任何 Binding**，此时 `confirm` 是成功的（`ack=true`），但消息已被静默丢弃。所以**只开 confirm 是不够的**，还必须开 `publisher-returns` 并把 `mandatory` 设为 `true`，无法路由的消息才会退回给生产者。

**Q3：消息重复消费怎么解决？**

**先承认一个前提：重复无法避免。** 原因是网络不可靠——消费者处理完了但 ack 丢失、消费者处理中宕机、或消费者组 Rebalance 导致 offset 未及时提交，MQ 都会重投消息。所以 MQ 的投递语义是 **at-least-once**，**只能在消费端做幂等**。三种方案：① **唯一 ID + 去重表**——生产者给每条消息生成全局唯一 ID，消费者查 DB 去重表判断是否处理过，适合对一致性要求最高的场景；② **Redis `setnx`**——`SET msg:{id} 1 NX EX 600`，设置成功才消费，轻量且高并发友好，**最常用**；③ **业务状态机**——用业务自身状态判断（如订单已支付则忽略支付回调），最优雅但只适用于有状态流转的业务。**关键细节**：用 Redis 方案时，**业务处理失败必须删掉那个 key**，否则重试会被误判为"已消费"而直接跳过——那就从"防重复"变成了"丢消息"。

**Q4：为什么说"消费端必须做幂等"而不是让 MQ 保证不重复？**

因为**"不丢"和"不重"在分布式下天然矛盾**。MQ 要保证不丢，就必须在"没收到 ack"时重投；而"没收到 ack"有两种可能：消息真的没被处理，或者**消息处理完了但 ack 丢了**。MQ 无法区分这两者，只能选择重投——于是重复就不可避免。这就是 **at-least-once** 的由来。要做到 exactly-once 需要分布式事务或两阶段提交，代价和复杂度远超收益，所以业界标准做法是：**MQ 保证至少一次，业务端用幂等把它"降级"成恰好一次的语义**。

**Q5：`ack` 的三种模式怎么选？**

`none`——关闭确认，消息一发出就当作已消费，**最容易丢**；`auto`——无异常自动 ack、抛异常则 nack，但**ack 在方法返回前就发出了**，处理到一半宕机仍会丢，且分不清"业务失败"和"代码 BUG"；`manual`——业务代码显式调用 `basicAck` / `basicNack`，**处理完才确认**，能精确控制，**生产推荐**。手动 ack 时要注意：`basicNack(requeue=true)` 如果遇到"必然失败"的消息（如格式错误）会**无限循环重投**打满消费者，所以标准做法是 `requeue=false` 投递到死信队列，再配合 Spring Retry 做有限次本地重试。
