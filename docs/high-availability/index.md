---
date: 2026-09-16
title: 高可用 · 板块导览
---

# 高可用 · 板块导览

先说清这个板块**不做什么**：

- 不重复**应用层的熔断、限流、降级实现**——那是 [服务容错](/java/spring/spring-cloud/resilience) 的内容；
- 不重复**容量与防护链路的落地视角**——见[容量测算与压测方案](/projects/property-saas/capacity-and-perf/#protection)；
- 不重复**单库高可用的两代演进**（主从 → 读写分离 → 自动切换）——见[架构演进地图](/projects/architecture-evolution/#v3)；
- 不重复**各中间件自身的高可用机制**（Redis 哨兵与集群、Kafka ISR、RabbitMQ 仲裁队列、MySQL 主从）——那是各技术板块的事。

这里讲的是**架构层的高可用**：怎么把"高可用"算成一个数、故障怎么被检测与转移、跨机房怎么选、以及怎么知道前面这些都真的有效。这些内容**与语言和框架无关**，所以它属于底座层。

## 一、一条主线：用冗余换故障概率，用自动化换恢复时间 {#thread}

回到[可用性的算式](/high-availability/availability-targets#mtbf-mttr)：`可用性 = MTBF / (MTBF + MTTR)`。这个式子只有两个自变量，所以高可用的全部工作也只有两条路线：

| 杠杆 | 作用在哪 | 手段 | 本板块 |
|---|---|---|---|
| **降低故障概率**（抬高 MTBF） | 让"坏事"更少发生 | 消除单点、跨故障域冗余、多机房 | [可用性目标](/high-availability/availability-targets) + [多机房架构](/high-availability/multi-datacenter) |
| **缩短恢复时间**（压低 MTTR） | 让"坏事"更快结束 | 检测、自动转移、幂等、演练 | [冗余与故障转移](/high-availability/redundancy-failover) + [混沌与演练](/high-availability/chaos-drills) |

左边的成本在**机器与架构**，右边的成本在**工程与流程**。而实务上——

> **右边的性价比通常更高。** 大多数团队一年遇到的故障次数有限，把恢复时间从 30 分钟压到 3 分钟就能抬一个数量级；而想把故障次数减半，往往要重构。

## 二、四篇地图 {#map}

| # | 篇 | 解决什么问题 | 一句话结论 |
|---|---|---|---|
| 1 | [可用性目标：把「高可用」变成一个可计算的数](/high-availability/availability-targets) | 定目标、算口径、找单点 | 可用性**上限由最弱依赖决定**；冗余只对**跨故障域**的独立故障有效 |
| 2 | [冗余与故障转移：难的是「怎么判断对方死了」](/high-availability/redundancy-failover) | 怎么检测、怎么切换、怎么收尾 | 难点不在"备机顶上"，而在**检测、隔离（fencing）、幂等**三件事 |
| 3 | [多机房架构：从主备到单元化](/high-availability/multi-datacenter) | 机房级容灾怎么选 | 难点只有一个：**数据怎么写**；跨城同步复制是**物理定律**决定的不可行 |
| 4 | [混沌工程与故障演练](/high-availability/chaos-drills) | 怎么知道上面都对 | **没演练过的预案等于没有预案**；演练生产"确定性"，不生产可用性 |

## 三、三条贯穿判据 {#criteria}

四篇的技术主题完全不同，但有三条判据反复出现——**它们可以直接当评审问题用**：

**① 「冗余跨故障域了吗？」**

并联公式有一个常被跳过的前提：**故障相互独立**。同一台机器上的两个实例、同一个 AZ 内的两个机房、同一个存储上的多副本，都不是冗余。

```text
不是冗余的情形          正确做法
同机多实例              跨节点
同 AZ 多机房            跨 AZ（同城双活）
同城双 AZ               跨地域（异地多活）
同一份配置推送          按实例/分组灰度
一次全量发布            【发布是最常见的自造故障域】→ 分批 + 可回滚
```

**② 「切换验证过吗？」**

这一条是本板块的"良知"：**没验证过的切换等于没有切换**。它不仅适用于多机房（备端从不承载流量），也适用于自动故障转移（探针配对了但客户端不重连）、备份恢复（备份是文件，恢复是流程）。

```text
口径上的诚实做法：
没演练过的降级路径  → 它的可用性应当记为 0
没切过的备机房      → 它的 RTO 应当记为"未知"
没恢复过的备份      → 它的 RPO 不成立
```

**③ 「代价算过吗？」**

三个代价问题，每个都有一堆"看起来免费其实很贵"的选项：

| 问题 | 关键数字 |
|---|---|
| 多一个 9 要付多少？ | 99.9% → 99.99% 是**架构复杂度**；99.99% → 99.999% 是**数量级成本 + 组织能力** |
| 跨城强一致要付多少？ | 每次写 + 一个跨城 RTT（30ms 量级），写密集业务不可行 |
| 多活要付多少？ | 备端 **100% 容量** + 数据冲突处理 + 发布与配置分单元后的人力 |

> **可操作的做法**：把上面三条判据写进架构评审的检查清单——**每条都要能拿出证据**（演练记录、切换日志、容量测算），而不是"设计上是这样"。

## 四、与其他板块的关系 {#relations}

| 板块 | 关系 |
|---|---|
| [服务容错](/java/spring/spring-cloud/resilience) | **应用层**：熔断、限流、降级的**实现**（Sentinel / Resilience4j）；本板块讲"这些手段在可用性公式里起什么作用"（降级 = **把串联变可选**） |
| [容量测算与压测方案](/projects/property-saas/capacity-and-perf/#protection) | **容量层**：五层防护链路的落地与压测方法；本板块讲"容量规划的目标是什么（RTO/接管能力）" |
| [架构演进地图](/projects/architecture-evolution/#v3) | **单库维度**的演进（主从 → 读写分离 → 自动切换）；本板块把它扩展到**机房维度** |
| [数据存储](/database/) | 各存储自身的 HA 机制（[Redis HA](/database/redis/ha-cluster)、[MySQL 复制](/database/mysql/replication)）；本板块讲**跨机房怎么把它们的 RPO/RTO 拼起来** |
| [消息队列](/middleware/) | [Kafka](/middleware/kafka/high-availability)、[RabbitMQ](/middleware/rabbitmq/high-availability) 的高可用与副本语义——**消息是跨单元最终一致的主要载体** |
| [分布式理论](/distributed/) | **理论层**：多数派、term/epoch（[共识协议](/distributed/consensus#quorum)）是仲裁与 fencing 的理论依据 |
| [云原生](/cloud-native/) | **基础设施层**：探针、优雅停机、HPA 的[幂等与探针细节](/cloud-native/kubernetes/)是故障转移的执行手段 |
| [监控与可观测](/cloud-native/observability/) | **前提层**：没有可观测就没有 MTTR 的"发现时间"，也没有混沌工程的稳态判定 |
| [发布与交付策略](/projects/property-saas/release-and-ops/) | **变更层**：分批发布、金丝雀、Runbook——**发布是最常见的自造故障域** |
| [面试专题](/interview/) | 检索层：跨板块连线题与题单索引 |

## 五、面试高频索引 {#interview}

| # | 主题 | 高频问法 | 出处 |
|---|---|---|---|
| 1 | 可用性的量级 | "99.99% 一年能停多久" | [几个 9](/high-availability/availability-targets#nines) |
| 2 | 口径陷阱 | "同一个 99.99% 为什么能算出不同结果" | [四种口径](/high-availability/availability-targets#caliber) |
| 3 | MTBF 与 MTTR | "提高可用性该从哪下手" | [两个杠杆](/high-availability/availability-targets#mtbf-mttr) |
| 4 | RTO 与 RPO | "两者分别由什么决定" | [RTO/RPO 分级](/high-availability/availability-targets#rto-rpo) |
| 5 | 串联与并联 | "为什么微服务化会降低可用性" | [可用性乘法](/high-availability/availability-targets#series-parallel) |
| 6 | 故障域与冗余 | "同机房部署两个实例算冗余吗" | [故障域](/high-availability/availability-targets#fault-domain) |
| 7 | 单点识别 | "单点不只是机器，还有哪几类" | [单点清单](/high-availability/availability-targets#single-point) |
| 8 | 目标怎么分 | "内部服务的 SLA 该定多高" | [预算拆解](/high-availability/availability-targets#budget) |
| 9 | 故障检测参数 | "判定延迟与误判怎么权衡" | [故障检测](/high-availability/redundancy-failover#detection) |
| 10 | 脑裂与仲裁 | "多数派仲裁为什么必要" | [仲裁三层](/high-availability/redundancy-failover#split-brain) |
| 11 | fencing | "只做仲裁为什么还会双写" | [fencing](/high-availability/redundancy-failover#split-brain) |
| 12 | 有状态服务转移 | "有状态服务切换为什么慢" | [无状态 vs 有状态](/high-availability/redundancy-failover#stateful) |
| 13 | 优雅停机 | "滚动发布为什么会丢请求" | [停机时序](/high-availability/redundancy-failover#graceful) |
| 14 | 探针设计 | "liveness 探依赖为什么会雪崩" | [三个探针](/high-availability/redundancy-failover#graceful) |
| 15 | 超时预算 | "各层超时应该怎么分配" | [超时预算](/high-availability/redundancy-failover#timeout-retry) |
| 16 | 重试风暴 | "重试为什么把局部故障放大" | [重试约束](/high-availability/redundancy-failover#timeout-retry) |
| 17 | 幂等三件套 | "为什么『先查再写』不算幂等" | [幂等](/high-availability/redundancy-failover#idempotent) |
| 18 | 自动 vs 人工切换 | "什么该自动、什么必须人工" | [切换触发方式](/high-availability/redundancy-failover#switch-modes) |
| 19 | 多机房演进 | "主备热备和同城双活的区别" | [六代拓扑](/high-availability/multi-datacenter#generations) |
| 20 | 跨城同步复制 | "异地多活为什么只能用异步" | [物理定律](/high-availability/multi-datacenter#physics) |
| 21 | 同城双活三问 | "上双活前要先回答哪三个问题" | [三个问题](/high-availability/multi-datacenter#same-city) |
| 22 | 双活的前提 | "备端按 50% 容量规划行不行" | [代价与决策](/high-availability/multi-datacenter#cost) |
| 23 | 单元化判据 | "什么情况下才能做单元化" | [单元化四步](/high-availability/multi-datacenter#units) |
| 24 | 双写冲突 | "冲突怎么解决、能不能不冲突" | [冲突解决](/high-availability/multi-datacenter#units) |
| 25 | DNS 切换 | "DNS 切换为什么不是秒级" | [流量调度](/high-availability/multi-datacenter#traffic) |
| 26 | 切流三态与回切 | "降级、摘除、切流的顺序" | [切流三态](/high-availability/multi-datacenter#traffic) |
| 27 | 混沌工程前提 | "没有可观测性能做混沌工程吗" | [前提条件](/high-availability/chaos-drills#prerequisites) |
| 28 | 实验设计六要素 | "怎么设计一个不会变成事故的实验" | [六要素](/high-availability/chaos-drills#experiment) |
| 29 | 演练反模式 | "为什么『切换成功』不等于演练成功" | [反模式](/high-availability/chaos-drills#antipatterns) |

> **本板块 4 篇正文 / 5 页。** 与 [服务容错](/java/spring/spring-cloud/resilience) 的分工是「架构层 vs 应用层实现」，与[容量测算与压测方案](/projects/property-saas/capacity-and-perf/)的分工是「目标与恢复 vs 容量与防护」，与[架构演进地图](/projects/architecture-evolution/)的分工是「机房维度 vs 单库维度」。各处交叉引用而不复制正文。
