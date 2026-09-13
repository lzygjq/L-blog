---
order: 3
date: 2026-09-14
title: 死信队列与延迟队列
desc: 死信的三种产生情况与 DLX 绑定、TTL 只检查队头的坑、DelayExchange 插件方案、两种延迟队列实现的取舍
---

# 死信队列与延迟队列

## 一、问题场景

两个需求：

1. **订单 30 分钟未支付要自动取消**——需要一个"延迟 30 分钟才被消费"的消息；
2. **消费永远失败的消息不能丢也不能无限重投**——需要一个"兜底队列"。

**RabbitMQ 本身没有延迟队列功能**，但可以用它的**死信机制**拼出来。而这两件事恰好是同一个机制的两面：**死信队列既是"异常消息的收容所"，也是"实现延迟队列的零件"**。

**结论先行**：死信（Dead Letter）是**队列中无法被正常消费的消息**，产生原因有三种（消费者拒绝且不重入队 / 消息 TTL 过期 / 队列满被挤出）。把死信投递到指定交换机（DLX）就形成死信队列。**延迟队列有两种实现**：`DLX + TTL`（有"只检查队头"的坑）和 **`DelayExchange` 插件**（无坑、更灵活、生产首选）。

## 二、死信：三种产生情况

| # | 情况 | 细节 | 触发条件 |
|---|---|---|---|
| 1 | **消费者拒绝** | 消费者用 `basic.reject` 或 `basic.nack` 声明消费失败，且 **`requeue = false`**（不重新入队） | 关键是 `requeue=false`——`true` 会重新入队而不是变死信 |
| 2 | **消息过期（TTL）** | 消息的 TTL 到期仍无人消费 | 队列级或消息级 TTL 均可 |
| 3 | **队列满了** | 队列达到最大长度（`x-max-length`）或最大字节数，**最早的消息被挤出** | 需设置 `x-max-length` / `x-max-length-bytes`；注意是挤出**最早**的（FIFO） |

> **第 1 种是最常用的"兜底"手段**：消费失败时 `basicNack(tag, false, false)`，消息直接进死信队列，**不会无限重投**。这正是[可靠性篇](/middleware/rabbitmq/reliability)里"重试耗尽后投递到死信队列"的落地方式。

## 三、DLX：死信往哪里去

死信不会凭空消失，而是被投递到一个**指定的交换机**，这个交换机叫 **DLX（Dead Letter Exchange，死信交换机）**：

```
                    正常链路
Producer ──▶ Exchange ──▶  ┌──────────────┐
                           │  Queue A      │
                           │ x-dead-letter-│
                           │   exchange    │──┐
                           └──────────────┘  │
                                             │ 满足死信条件时
                                             │ （拒绝/TTL/队列满）
                                             ▼
                                    ┌─────────────────┐
                                    │ DLX（死信交换机） │
                                    └────────┬────────┘
                                             │ 按 routing-key 路由
                                             ▼
                                    ┌─────────────────┐
                                    │ 死信队列（DLQ）   │  ← 就是一个【普通队列】
                                    └─────────────────┘
                                             │
                                             ▼
                                     消费者（人工处理/补偿）
```

**关键认知**：**死信队列本身没有任何特殊性，它就是一个普通队列**——只是"接收的消息来源是其他队列的死信"而已。理解这一点，就不会把它神秘化。

### 两个绑定属性

| 属性 | 作用 | 不设的后果 |
|---|---|---|
| **`x-dead-letter-exchange`** | 指定死信投递到哪个交换机 | 消息**被直接丢弃** |
| **`x-dead-letter-routing-key`** | 指定死信的路由键 | 沿用**原消息的 routing-key**（可能导致路由到错误的队列） |

```java
@Bean
public Queue orderQueue() {
    return QueueBuilder.durable("order.queue")
            .withArgument("x-dead-letter-exchange", "dlx.exchange")     // 必设
            .withArgument("x-dead-letter-routing-key", "order.dead")    // 建议设
            .withArgument("x-message-ttl", 30 * 60 * 1000)              // 可选：队列级 TTL
            .build();
}

@Bean
public DirectExchange dlxExchange() {
    return new DirectExchange("dlx.exchange", true, false);
}

@Bean
public Queue orderDeadQueue() {
    return QueueBuilder.durable("order.dead.queue").build();
}

@Bean
public Binding dlxBinding() {
    return BindingBuilder.bind(orderDeadQueue()).to(dlxExchange()).with("order.dead");
}
```

> **为什么建议显式设 `x-dead-letter-routing-key`**：不设时死信会**沿用原 routing-key**，而原 routing-key 是按"正常 Exchange 的 Binding"设计的，在死信交换机上很可能**匹配不到任何 Binding**——结果消息依然被丢弃，**死信队列形同虚设**。这是一个很隐蔽的坑。

## 四、延迟队列方案一：DLX + TTL

**思路**：让消息先进入一个"只等不消费"的 TTL 队列，到期后自动变成死信投到死信队列，消费者从死信队列消费——**从发送到消费之间自然产生了延迟**。

| 组件 | 作用 |
|---|---|
| **TTL 队列** | 设置 `x-message-ttl`，消息存活时间到了变死信。**注意：这个队列不要挂消费者** |
| **DLX 死信交换机** | TTL 队列通过 `x-dead-letter-exchange` 绑定它 |
| **死信队列** | DLX 路由到它，**消费者从这里消费** = 延迟消费 |

```
Producer ──▶ ttl.exchange ──▶ ┌──────────────┐
                              │ ttl.queue     │  没有消费者！
                              │ TTL=30min     │  消息在这里"躺"满 30 分钟
                              │ dead-letter → │
                              └──────┬───────┘
                                     │ TTL 到期 → 变死信
                                     ▼
                              dlx.exchange ──▶ delay.queue ──▶ Consumer
                                                              （此时距发送已过 30 分钟）
```

### TTL 的两种设置方式

| 方式 | 写法 | 特点 |
|---|---|---|
| **队列级 TTL** | `x-message-ttl = 30000`（队列参数） | 队列里**所有消息统一过期时间**，简单 |
| **消息级 TTL** | 单条消息设 `expiration` 属性 | 更灵活，可为每条消息设不同延迟 |

### ⚠️ 消息级 TTL 的坑（面试高频）

**RabbitMQ 只检查队列头部的消息是否过期**：

```
队列（按入队顺序）：
  ┌─────────┬─────────┬─────────┐
  │ msg1    │ msg2    │ msg3    │
  │ TTL=30s │ TTL=10s │ TTL=10s │
  └─────────┴─────────┴─────────┘
     队头 ↑
     
  msg1 没过期 → 整个队列不做过期扫描 → msg2、msg3 即使 TTL 到了【也不会被移除成死信】
  必须等 msg1 过期并被消费后，才轮到 msg2 检查
```

**后果**：想用"消息级 TTL"实现"不同订单不同延迟时间"时，**先入队的消息会阻塞后入队的消息**，延迟时间严重不准。

| 方案 | 是否有队头阻塞问题 |
|---|---|
| 队列级 TTL（每个延迟时长一个队列） | ❌ 没有（同队列消息 TTL 一致） |
| 消息级 TTL（不同延迟混在一个队列） | ✅ **有**，这是它的致命缺陷 |
| DelayExchange 插件 | ❌ 没有 |

## 五、延迟队列方案二：DelayExchange 插件

安装官方插件 **`rabbitmq_delayed_message_exchange`**，它引入了一种新的交换机类型，由插件自己维护延迟逻辑：

```bash
# 1. 下载插件到 plugins 目录（版本要和 RabbitMQ 一致）
#    rabbitmq_delayed_message_exchange-3.12.0.ez
# 2. 启用
rabbitmq-plugins enable rabbitmq_delayed_message_exchange
```

```java
// 声明一个延迟交换机（类型为 x-delayed-message）
@Bean
public CustomExchange delayExchange() {
    Map<String, Object> args = new HashMap<>();
    args.put("x-delayed-type", "direct");        // 指定底层路由类型
    return new CustomExchange("delay.exchange", "x-delayed-message", true, false, args);
}

// 发送时通过 x-delay 头指定延迟毫秒数
MessageProperties props = new MessageProperties();
props.setHeader("x-delay", 30 * 60 * 1000);      // 延迟 30 分钟
rabbitTemplate.send("delay.exchange", "order.cancel",
                    new Message(body, props));
```

**工作原理**：消息到达延迟交换机后**不立即路由**，而是由插件**在内部保存**（延迟消息不会落到队列里，所以不占用队列长度、不参与队头检查），等到 `x-delay` 时间后再投递到目标队列。

### 两种方案对比

| 维度 | **DLX + TTL** | **DelayExchange 插件** |
|---|---|---|
| 是否需装插件 | ❌ 不需要 | ✅ 需要（且版本要匹配） |
| 不同延迟时间 | ⚠️ 需**每个延迟时长建一个 TTL 队列**（队列爆炸） | ✅ **一条消息一个延迟值**，灵活 |
| 消息级 TTL 队头阻塞 | ✅ **有**（致命） | ❌ 没有 |
| 延迟精度 | 受队头阻塞影响，**不准** | 较准 |
| 运维复杂度 | 队列数量随延迟档位增长 | 低（多装一个插件） |
| 推荐度 | 兜底/临时方案 | ✅ **生产首选** |

**面试口径**：**"我们项目用的延迟插件方案"**——理由就是"消息级 TTL 有队头阻塞的坑、而队列级 TTL 要为每个延迟时长建一个队列，插件没这些问题"。

## 六、死信队列的其他用途

除了实现延迟，死信队列还有三类常见用途：

| 用途 | 说明 |
|---|---|
| **异常消息收容** | 消费永远失败的消息进死信队列，**不阻塞主队列**，人工介入或定时补偿 |
| **消费失败的降级** | 配合 Spring Retry：重试耗尽后 `requeue=false` → 死信队列 → 告警 |
| **消息滞留监控** | **死信队列长度是最好的告警指标**——它一旦增长，说明有消息在正常链路上无法被处理 |
| **延迟重试** | 死信队列 + TTL 可以实现"失败后延迟 5 分钟再重试"的阶梯重试 |

> **运维提醒**：死信队列**必须配监控告警**。很多团队配了死信队列却没人看，结果消息在里面躺了几个月——**"死信队列有堆积"就等价于"有业务消息没被处理"**。

## 七、面试问答

**Q1：死信队列是什么？什么情况下消息会成为死信？**

**死信（Dead Letter）是队列中无法被正常消费的消息**。三种情况：① **消费者拒绝**——用 `basic.reject` 或 `basic.nack` 声明消费失败，且 **`requeue=false`**（不重新入队）；② **消息过期**——消息的 TTL 到期仍无人消费；③ **队列满了**——队列达到最大长度或最大字节数，**最早的消息被挤出**。队列通过 `x-dead-letter-exchange` 属性绑定一个**死信交换机（DLX）**，死信会自动投递过去，再按 `x-dead-letter-routing-key` 路由到死信队列。**关键认知：死信队列本质上就是一个普通队列**，只是它接收的消息来源是其他队列的死信。

**Q2：如何实现延迟队列？**

RabbitMQ 本身没有延迟队列，有两种实现方式。**方案一：死信交换机 + TTL**——建一个 TTL 队列（**不挂消费者**），设 `x-message-ttl`，消息在这里躺够时间后过期变成死信，通过 `x-dead-letter-exchange` 投到死信交换机，再路由到死信队列，消费者从死信队列消费就实现了延迟。**但这个方案有个坑**：如果用**消息级 TTL**（为不同消息设不同延迟），RabbitMQ **只检查队头消息是否过期**——队头没过期时，后面已经过期的消息也不会被移成死信，导致延迟不准；如果改用队列级 TTL，就得为每个延迟时长单独建队列。**方案二：DelayExchange 延迟插件**——安装 `rabbitmq_delayed_message_exchange`，声明类型为 `x-delayed-message` 的交换机，发送时用 `x-delay` 头指定延迟毫秒数，插件内部维护延迟、到期自动投递。**它没有队头阻塞问题，也更灵活，我们项目用的是这个方案。**

**Q3：消息级 TTL 的那个"坑"具体是什么？**

**RabbitMQ 只扫描队列头部消息的过期情况**。假设队列里 msg1 的 TTL 是 30 秒、msg2 和 msg3 的 TTL 是 10 秒，且 msg1 在队头——那么即使 msg2、msg3 在 10 秒后已经过期，**只要 msg1 还在队列里没过期，整个队列就不会做过期处理**。必须等 msg1 过期（或被消费）之后，才轮到 msg2 被检查。所以用消息级 TTL 实现"每条消息不同延迟"时，**先入队的消息会阻塞后入队的消息**，延迟时间严重失真。解法是改用**队列级 TTL**（同队列消息延迟一致，为每个档位建一个队列）或直接用**延迟插件**。

**Q4：`x-dead-letter-routing-key` 不设会怎样？**

死信会**沿用原消息的 routing-key**。这看起来方便，但有个隐蔽问题：**原 routing-key 是按"正常 Exchange 的 Binding"设计的**，在死信交换机上很可能**匹配不到任何 Binding**。后果是死信到了 DLX 之后路由不到任何队列，**消息被静默丢弃**——你以为配了死信队列很安全，实际上死信队列里一条消息都没有。所以**建议显式设置 `x-dead-letter-routing-key`**，并在上线前验证死信确实落到了目标队列。

**Q5：死信队列和延迟队列是什么关系？**

**死信队列是"收容异常消息"的机制，延迟队列是它的一个应用**。因为"消息 TTL 到期 → 变死信 → 投到死信交换机"这条链路天然产生了延迟效果，所以可以用死信机制拼出延迟队列。但反过来，死信队列的用途不止延迟——它更主要的用途是**异常消息收容**（消费永远失败的消息不阻塞主队列，交人工处理）和**滞留监控**（死信队列长度是"有消息无法被处理"的最佳告警指标）。所以正确的理解是：**延迟队列只是死信机制的一个副产品**。
