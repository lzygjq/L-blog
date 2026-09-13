---
order: 0
date: 2026-09-14
desc: RabbitMQ 知识地图、AMQP 模型速览、6 篇学习主线与 7 题面试索引
---

# RabbitMQ · 导览

RabbitMQ 是基于 **AMQP 0-9-1** 协议的传统消息队列，定位是**业务解耦与任务分发**：延迟低（微秒级）、路由灵活（Exchange 模型）、开箱即用的死信与延迟能力。它的短板也很明确——**吞吐是万级**，且**堆积会撑内存**。

本板块按「**先懂模型 → 再保可靠 → 补特有能力和运维**」组织。

## 一、AMQP 模型速览

理解 RabbitMQ 的一切，都从这张图开始：

```
                ┌──────────── Exchange（交换机）────────────┐
                │  只做路由，不存消息（除非绑定队列）           │
Producer ──────▶│                                          │
  │  发到       │  Direct / Fanout / Topic / Headers       │
  │  Exchange   └──────┬────────────┬────────────┬─────────┘
  │  带                                         │
routing-key          Binding（绑定）           Binding
                       │                        │
                  ┌────▼────┐              ┌────▼────┐
                  │ Queue A │              │ Queue B │  ← 真正存消息的地方
                  └────┬────┘              └────┬────┘
                       │                        │
                  Consumer 1               Consumer 2
```

**三个必须记住的点**：

1. **生产者永远不直接发给队列**，而是发给 Exchange，由 Exchange 按规则路由——这是 RabbitMQ 灵活性的来源。
2. **Exchange 本身不存消息**，消息存在 Queue 里；Binding 是"Exchange 和 Queue 之间的路由规则"。
3. **消息一旦被消费就删除**（无回溯能力）——这是与 [Kafka](/middleware/kafka/) 最本质的区别。

## 二、学习主线

| # | 主题 | 定位 | 状态 |
|---|---|---|---|
| 1 | [核心模型与交换机](/middleware/rabbitmq/core-model) | 懂模型：AMQP 链路、四种交换机类型与通配符 | ✅ 已成篇 |
| 2 | [可靠性：confirm、持久化与 ack](/middleware/rabbitmq/reliability) | **必问**：三层保障、重复消费与三种幂等方案 | ✅ 已成篇 |
| 3 | [死信队列与延迟队列](/middleware/rabbitmq/dead-letter) | 特有能力：死信三因、DLX+TTL、DelayExchange 插件 | ✅ 已成篇 |
| 4 | [集群与高可用](/middleware/rabbitmq/high-availability) | 能扛量：普通/镜像/仲裁队列的取舍 | ✅ 已成篇 |
| 5 | [消息堆积与惰性队列](/middleware/rabbitmq/backlog) | 运维：堆积的成因、三种解法与应急处置 | ✅ 已成篇 |

**推荐顺序**：1 打地基（不懂 Exchange 模型，后面的死信和延迟都是死记）→ **2 是面试主战场**（几乎每年必问"如何保证不丢"）→ 3 是 RabbitMQ 相对 Kafka 的**差异化能力**，也是最容易被追问的点 → 4、5 是生产运维必答。

## 三、先建立两个认知

**① "可靠性"要按链路拆，不要按特性背**

```
生产者 ──①──▶ Exchange ──②──▶ Queue ──③──▶ 消费者
  confirm      路由失败       持久化       ack
  回调          return 回调    （三者）     手动确认
```

三个环节各有各的丢法，也各有各的兜底。**面试只说"开持久化"是不及格的**——持久化只管第 ② 环。

**② "重复消费"无法根治，只能幂等**

RabbitMQ 的重投机制（ack 丢失、消费者宕机、Rebalance）决定了**重复是设计上允许的**。所以正确的心智模型是：**把"至少一次"当作既定前提，在消费端做幂等**，而不是试图让 MQ 保证"恰好一次"。

## 四、面试高频（7 题）

| # | 问题 | 篇目 |
|---|---|---|
| 1 | 如何保证消息不丢失？**（必问）** | [可靠性](/middleware/rabbitmq/reliability) |
| 2 | 消息重复消费怎么解决？ | [可靠性](/middleware/rabbitmq/reliability) |
| 3 | 消息堆积怎么解决？ | [消息堆积](/middleware/rabbitmq/backlog) |
| 4 | 死信队列是什么？什么情况消息会成为死信？ | [死信与延迟队列](/middleware/rabbitmq/dead-letter) |
| 5 | 如何实现延迟队列？ | [死信与延迟队列](/middleware/rabbitmq/dead-letter) |
| 6 | 高可用机制有哪些？ | [集群与高可用](/middleware/rabbitmq/high-availability) |
| 7 | 交换机有哪些类型？ | [核心模型与交换机](/middleware/rabbitmq/core-model) |

## 五、与 Kafka 的定位差异（选型一句话）

| 维度 | RabbitMQ | Kafka |
|---|---|---|
| 定位 | 消息队列（业务解耦） | 分布式流平台（日志/流处理） |
| 吞吐 | 万级 | **十万级** |
| 延迟 | **微秒级** | 毫秒级 |
| 回溯历史消息 | ❌ 消费即删 | ✅ 按 offset 回溯 |
| 堆积能力 | ⚠️ 弱（需惰性队列） | ✅ 强（堆积即落盘） |
| 延迟/死信 | ✅ **原生能力丰富** | ❌ 需自建 |

完整对比见[消息队列板块导览](/middleware/)。

> **环境说明**：本板块示例基于 RabbitMQ 3.12（Docker），涉及镜像队列的地方会同时给出 **3.8+ 推荐的仲裁队列**写法——**镜像队列已被官方标记为 deprecated，新项目不要再用**。
