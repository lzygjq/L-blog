---
order: 1
date: 2026-09-14
title: 核心模型与交换机
desc: AMQP 0-9-1 完整链路、四种交换机类型的路由规则与选型、Topic 通配符详解、默认交换机与死信前置概念
---

# 核心模型与交换机

## 一、问题场景

同一个 `routing-key`，发到 `Direct` 交换机只有一条队列收到，发到 `Fanout` 交换机却所有队列都收到，发到 `Topic` 又变成按模式匹配。

**"怎么发"由 Exchange 类型决定**——这是 RabbitMQ 最核心的设计，也是面试问"交换机有哪些类型"时真正想确认的东西。本文把 AMQP 0-9-1 的完整链路走一遍：**消息从生产者出发，经过 Exchange 与 Binding 的路由规则，落到某个 Queue**。

## 二、AMQP 0-9-1 的完整链路

```
Producer
   │  ① 建立 Connection（TCP）→ 在 Connection 上开 Channel（轻量虚拟连接）
   │  ② basicPublish(exchange, routingKey, props, body)
   ▼
┌──────────────────────────────────────────────────────────────┐
│  Broker（RabbitMQ 服务端）                                      │
│                                                              │
│   ┌───────── Exchange ─────────┐                             │
│   │  只负责路由，自身不存消息      │                             │
│   └───┬──────────┬──────────┬──┘                             │
│       │ Binding  │ Binding  │ Binding                        │
│       │ (含路由键)│          │                                 │
│   ┌───▼───┐  ┌───▼───┐  ┌───▼───┐                            │
│   │Queue A│  │Queue B│  │Queue C│   ← 消息真正存储的地方        │
│   └───┬───┘  └───────┘  └───────┘                            │
│       │                                                      │
└───────┼──────────────────────────────────────────────────────┘
        │  ③ basicConsume（push 推模式）或 basicGet（pull）
        ▼
     Consumer  ──④──▶ 处理完成 → basicAck 确认（手动 ack 时）
```

### 五个核心概念

| 概念 | 说明 | 容易混淆的点 |
|---|---|---|
| **Connection** | 生产者/消费者与 Broker 之间的 **TCP 连接** | 一个应用通常只开 1~2 个 Connection |
| **Channel** | Connection 上的**轻量虚拟连接**，所有操作都在 Channel 上 | **为什么要有它**：避免每条线程都开 TCP（TCP 三次握手 + 资源开销大），Channel 复用一个 TCP |
| **Exchange** | **交换机**，只做路由，**自身不存消息** | 关键认知：消息不存 Exchange 里 |
| **Queue** | **队列**，消息真正存储的地方 | 有长度限制和 TTL 概念，超限/TTL 到期会产生死信 |
| **Binding** | Exchange 与 Queue 之间的**绑定关系**（可带 routing-key 或 headers） | 没有 Binding，消息就路由不到任何队列 |

> **Channel 为什么必要**：一个 TCP 连接造价高（三次握手、内核缓冲区），而一个应用可能同时有几十个生产者/消费者线程。**Channel 是复用一个 TCP 之上的多路复用**——多线程各用一个 Channel 即可，**不要多个线程共用一个 Channel**（RabbitMQ 不保证 Channel 线程安全，共用一个 Channel 会导致帧交错，这是生产事故的常见来源）。

### VHost（虚拟主机）

```
Broker
 ├── VHost "/"          ← 逻辑隔离单元，类似 MySQL 的 database
 │     ├── Exchange / Queue / Binding
 ├── VHost "/dev"
 │     └── Exchange / Queue / Binding
```

VHost 是**权限与命名空间的隔离单位**：不同 VHost 里的同名队列互不干扰，权限也按 VHost 授予。多环境（dev/test/prod）或多租户场景靠它隔离。

## 三、四种交换机类型

| 类型 | 路由规则 | 典型用途 | 使用频率 |
|---|---|---|---|
| **`Direct`** | **精确匹配** `routing-key`，完全一致才路由 | 点对点定向投递，如按日志级别路由（`error` 只发给错误处理队列） | 高 |
| **`Fanout`** | **忽略** `routing-key`，广播到**所有绑定的队列** | 广播通知，如缓存更新通知所有节点、配置刷新 | 中高 |
| **`Topic`** | **模式匹配** `routing-key`，支持通配符 | 灵活路由，如 `order.*.pay`、`log.#` | **最高（最常用）** |
| **`Headers`** | 不看 `routing-key`，**按消息头属性匹配** | 需要按多个属性组合路由的少见场景 | **极低（性能差，基本不用）** |

### 四种类型的路由行为对比

假设 `routing-key = "order.create.pay"`：

| 交换机类型 | 绑定规则 | 是否路由 | 说明 |
|---|---|---|---|
| Direct | 队列绑定 key = `order.create.pay` | ✅ | 必须完全一致 |
| Direct | 队列绑定 key = `order.create` | ❌ | 精确匹配，不匹配前缀 |
| Topic | 队列绑定 `order.*.pay` | ✅ | `*` 匹配**一个**单词（`create`） |
| Topic | 队列绑定 `order.#` | ✅ | `#` 匹配**零个或多个**单词 |
| Topic | 队列绑定 `*.create.pay` | ✅ | 第一个词用 `*` 通配 |
| Fanout | 任意绑定（忽略 key） | ✅ | 所有绑定队列都收到 |
| Headers | 按 `x-match` + 头属性 | ⚠️ | 与 routing-key 无关 |

### Topic 的通配符详解

`routing-key` 用 `.` 分隔成若干**单词**，两个通配符：

| 通配符 | 含义 | 示例 |
|---|---|---|
| **`*`** | 匹配**恰好一个**单词 | `order.*` 匹配 `order.create`、`order.cancel`，**不匹配** `order.create.pay` |
| **`#`** | 匹配**零个或多个**单词 | `order.#` 匹配 `order`、`order.create`、`order.create.pay` |

**实际配置示例**（日志按级别+来源路由）：

| 队列 | 绑定 `#` 后的规则 | 收到的消息 |
|---|---|---|
| `queue.error` | `log.error.#` | 所有错误日志，不管来源 |
| `queue.order` | `log.*.order` | 所有来源里"来源=order"的日志 |
| `queue.all` | `log.#` | 全部日志（`#` 也能匹配零个词，所以 `log` 本身也匹配） |

> **一个易错点**：`#` 可以匹配**零个**单词，所以 `log.#` 能匹配 `log`（没有后续词）；而 `*` 必须匹配**恰好一个**，`log.*` **不能**匹配 `log`。这个差别在写路由规则时经常踩。

## 四、默认交换机与匿名路由

RabbitMQ 预置了一个名为**空字符串 `""`** 的 **Direct 交换机**（默认交换机）：

```
basicPublish("", "queueName", props, body)
              ↑ 空 exchange    ↑ routing-key 直接写队列名
  等价于：把消息直接投递到名为 queueName 的队列
```

**这就是"快速发到某个队列"的写法**——Routing Key 就是队列名，默认交换机按其精确匹配。日常开发推荐**显式声明自己的 Exchange**，因为它能表达"这类消息的路由意图"，而默认交换机绕过了模型（队列名硬编码在生产者里）。

## 五、交换机的声明与属性

```java
// Spring AMQP 声明一个 Topic 交换机
@Bean
public TopicExchange orderExchange() {
    return ExchangeBuilder.topicExchange("order.exchange")
            .durable(true)          // 持久化：Broker 重启后交换机仍在
            .build();
}

@Bean
public Queue orderPayQueue() {
    return QueueBuilder.durable("order.pay.queue")
            .withArgument("x-max-length", 100000)          // 队列最大长度，超限产生死信
            .withArgument("x-dead-letter-exchange", "dlx.exchange")  // 死信交换机
            .build();
}

@Bean
public Binding bindOrderPay() {
    return BindingBuilder.bind(orderPayQueue())
            .to(orderExchange())
            .with("order.*.pay");   // Topic 通配符绑定
}
```

**三个关键属性**（面试常问"持久化要开哪些"时用到）：

| 属性 | 作用 | 不设的后果 |
|---|---|---|
| **Exchange `durable=true`** | 交换机持久化 | Broker 重启后交换机消失 → 消息无法路由 |
| **Queue `durable=true`** | 队列持久化（元数据 + 消息存储） | 重启后队列消失，**消息全丢** |
| **消息 `DeliveryMode.PERSISTENT`** | 单条消息持久化 | 消息只存内存，**重启即丢** |

**三者必须同时开启**——少任何一个，重启后都可能导致消息丢失。详见 [可靠性：confirm、持久化与 ack](/middleware/rabbitmq/reliability)。

## 六、面试问答

**Q1：RabbitMQ 有哪几种交换机？分别适用什么场景？**

四种：① **`Fanout`（广播）**——忽略 `routing-key`，把消息发给**所有**绑定的队列，适合广播通知（缓存刷新、配置推送）；② **`Direct`（精确匹配）**——`routing-key` 完全一致才路由，适合点对点定向投递（如按日志级别路由到不同队列）；③ **`Topic`（模式匹配）**——支持通配符，`*` 匹配一个单词、`#` 匹配零个或多个单词，**最灵活也最常用**（如 `order.*.pay` 匹配订单各环节）；④ **`Headers`（消息头匹配）**——不看 `routing-key`，按消息头属性匹配，性能较差，**基本不用**。实践中广播用 Fanout、业务路由用 Topic。

**Q2：`*` 和 `#` 有什么区别？**

两者都用在 Topic 交换机的 `routing-key` 模式里，`routing-key` 用 `.` 分词。**`*` 匹配恰好一个单词**，`#` **匹配零个或多个单词**。所以 `order.*` 能匹配 `order.create`、`order.cancel`，但**不匹配** `order.create.pay`；而 `order.#` 可以匹配 `order`、`order.create`、`order.create.pay` 全部。**关键差异在"零个"**：`#` 允许零个单词，所以 `log.#` 也能匹配只有 `log` 一个词的 routing-key，而 `log.*` 不行。

**Q3：Exchange 会存消息吗？生产者为什么不能直接发给队列？**

**Exchange 自身不存消息**——它只负责按 Binding 规则把消息**路由**到 Queue，消息存在 Queue 里。如果不绑定任何队列（或没有匹配的 Binding），消息就会被丢弃（除非开了 `mandatory` + `return` 回调，见[可靠性篇](/middleware/rabbitmq/reliability)）。

生产者不直接发队列的原因：**多一层 Exchange 就多一层解耦**。生产者只关心"这个消息属于哪类"（用 routing-key 表达），不需要知道下游有几个队列、叫什么名字；新增一个下游消费者只需要加一个 Binding，**不用改生产者代码**。这是 RabbitMQ 比"直连队列"灵活的根本原因。

**Q4：Channel 是什么？为什么要用 Channel 而不是多开 Connection？**

**Connection 是 TCP 连接，Channel 是 Connection 上的轻量虚拟连接**，所有 AMQP 操作都在 Channel 上进行。用 Channel 的原因是**成本**：TCP 连接需要三次握手、维护内核缓冲区，如果每个生产者/消费者线程都开一个 TCP，连接数会非常多且开销大；而 Channel 建立在同一个 TCP 上，**多路复用、创建开销极小**，一个应用通常只开 1~2 个 Connection，每个线程用自己的 Channel。

**注意**：**Channel 不是线程安全的**，多个线程共用一个 Channel 会导致协议帧交错、收到 `UNEXPECTED_FRAME` 之类的错误——**每线程一个 Channel** 是标准做法。

**Q5：默认交换机是什么？**

RabbitMQ 预置了一个名字为空字符串 `""` 的 **Direct 交换机**。当 `basicPublish` 的第一个参数传空字符串时，消息会走这个默认交换机，而 **Routing Key 被当作队列名直接匹配**——所以 `basicPublish("", "myQueue", ...)` 等价于"直接投递到 `myQueue` 队列"，这是最简的发送方式。日常开发建议**显式声明自己的 Exchange**，因为默认交换机把队列名硬编码在生产者里，破坏了"生产者只关心路由键、不关心下游队列"的解耦意图。
