---
date: 2026-09-15
title: 智慧物业 SaaS 导览
desc: 一个多租户物业管理 SaaS 的业务图景与技术难点：租户规模差异、强一致账单、硬件接入、峰值写入与分析负载外移，以及五篇专题构成的完整设计链路
---

# 智慧物业 SaaS 导览

> **口径说明**：本文与下属专题是**架构设计记录**，其中数值为**设计目标与容量估算**，非生产实测数据。可验证产出（ADR / 压测报告 / 架构图）的模板与写法见 [产出工具](/projects/toolkit/)；全文已做脱敏处理，不含任何企业标识与客户信息。

## 一、这是一个什么样的系统 {#what}

面向物业管理企业的**多租户 SaaS 平台**：物业公司作为租户入驻，在其下管理若干住宅/商业项目（小区），项目里再挂着楼栋、房屋、业主与住户。租户日常要用它完成几件事——**算钱、收钱、管人、管门、卖东西**。

| 模块 | 业务内容 | 架构上真正的难点 |
|---|---|---|
| **账单与缴费** | 物业费/水电费批量出账、在线支付、对公转账、退款、催缴 | 批量生成的**峰值写入**、金额的**强一致**、支付回调的**幂等** |
| **门禁与访客** | 人脸/卡/二维码/密码/远程开门，访客邀请码 | **硬件接入**的协议差异、**弱网离线降级**、开门记录的写量 |
| **社区电商** | 社区团购、到家服务、订单与履约 | 交易链路 + 库存扣减 + 履约状态机 |
| **基础配置** | 收费项、计费规则、组织与权限、房源台账 | **租户级配置的建模**与跨租户隔离 |
| **报表与分析** | 收缴率、欠费账龄、经营看板 | 分析负载**不能压在业务库上** |

### 1.1 六个业务特点，决定了六个架构约束 {#constraints}

这一节是整条设计链的起点——**架构不是从"用什么框架"开始的，是从"业务强加了什么约束"开始的**：

| 业务特点 | 强加的架构约束 |
|---|---|
| 租户数量多、**规模差异极大**（几个小区 vs 上千个项目） | 多租户隔离**不能一刀切**，必须能分档 |
| 账单要**按月批量生成**且金额不能错 | 批量任务 + 事务边界 + **幂等重跑**；金额用定点类型 |
| 门禁是**硬件 + 实时 + 弱网** | 设备接入要收敛协议；必须支持**离线可用** |
| 出账、催缴有**明显峰值**（月初） | 写入要能削峰；**定时任务必须防重复执行** |
| 报表要**多维下钻与长期留存** | 分析负载**外移**到独立引擎，业务库只留在线事务 |
| 多租户共享一套代码与部署 | 所有横切点（上下文、缓存、消息、文件）都要**带租户维度** |

## 二、五篇专题：一条自下而上的设计链 {#tracks}

五个专题不是并列的五个话题，而是**同一条链路的五个层次**——从"业务约束长什么样"到"怎么交付上线"。

| # | 专题 | 这一篇回答什么问题 | 层次 |
|---|---|---|---|
| 1 | [核心业务链路：账单、门禁与交易](/projects/property-saas/core-business/) | 三条关键链路各自被什么业务约束逼出了什么设计？数据模型与分片怎么定？ | **业务与数据** |
| 2 | [微服务 → K8s 云原生演进](/projects/property-saas/microservice-to-k8s/) | 拆完服务后的四类新问题怎么收敛？多租户怎么隔离？部署形态怎么迁移？ | **工程与部署** |
| 3 | [大数据架构方案 → 数仓落地](/projects/property-saas/data-warehouse/) | 分析负载怎么从业务库外移？同步链路与仓内分层怎么做？ | **数据链路** |
| 4 | [容量测算与压测方案](/projects/property-saas/capacity-and-perf/) | 容量怎么推而不是猜？五层防护各防什么？怎么用压测把估算变成结论？ | **容量与性能** |
| 5 | [发布、安全与运维](/projects/property-saas/release-and-ops/) | 怎么才敢频繁发版？数据库变更怎么不出事？信任边界与合规红线在哪？ | **交付与运行** |

### 2.1 三块地基，被五篇共同依赖 {#foundation}

```text
                  ① 数据模型          ② 公共框架层         ③ 租户维度
              谁的库 / 谁的表 /       幂等·缓存·消息·       上下文怎么贯穿
              分片键 / 归档策略        日志·异常·鉴权        每一次 IO
                    │                      │                    │
      ┌─────────────┴──────────────────────┴────────────────────┴─────────────┐
      ▼                        ▼                        ▼                     ▼
 核心业务链路             微服务 → K8s              数据链路            容量 / 发布
 （约束怎么落地）        （能力怎么收敛）          （负载怎么外移）      （怎么验证与交付）
```

**读这五篇的顺序建议按上表 1→5**，因为它对应的是一次真实的搭建顺序：先把业务约束翻译成数据模型，再收敛工程能力，然后处理数据增长，接着验证容量，最后才能谈发布节奏。**跳过第 1 篇直接看第 4 篇，会看不懂容量为什么要按场景拆口径**——因为那些场景全部来自业务链路。

## 三、技术栈总览 {#stack}

| 域 | 选型 | 为什么是它 |
|---|---|---|
| 语言与框架 | Java + Spring Boot / Spring Cloud Alibaba | 生态成熟、团队能力匹配、组件可替换 |
| 注册与配置 | Nacos | 注册与配置一体，减少一个组件 |
| 网关 | Spring Cloud Gateway | 与生态一致、限流与鉴权可编程 |
| 服务保护 | Sentinel | 与 Alibaba 生态配套，规则可动态下发 |
| 关系库 | MySQL（**一主多从 + 高可用切换**） | 事务与生态；高可用由独立组件负责，不指望应用层 |
| 分片 | ShardingSphere | 需要跨库拆分时用它，**不过早引入** |
| 缓存 | Redis（主从 + 哨兵） | 热点挡在前面、分布式锁、轻量队列 |
| 消息 | RocketMQ / Kafka | 业务解耦与削峰；同步链路用 Kafka 承接多下游 |
| 分析库 | Doris | MySQL 协议兼容、并发与多表 JOIN 好、部署简单 |
| 湖表与对象存储 | Iceberg + 对象存储 | 冷数据归档与长期留存，摆脱 HDFS |
| 同步 | CDC → 消息队列 → 数仓 | 读变更日志，不做轮询 |
| 部署 | Docker + Kubernetes | 声明式、可回滚、多环境一致 |
| 可观测 | Prometheus + 结构化日志 + 链路追踪 | 三支柱靠 traceId 串联 |

> 这张表里的每一行都在站内有对应正文：注册/网关/保护 → [Spring Cloud](/java/spring/spring-cloud/)；缓存与分片 → [数据存储](/database/)；消息 → [消息队列](/middleware/)；容器与编排 → [云原生](/cloud-native/)；分析链路 → [数据仓库](/bigdata/)。

## 四、难点与设计的对应关系 {#difficulty-map}

把"业务难点 → 架构设计 → 具体写法"钉在一起，是这类项目最容易讲清楚的方式：

| 业务难点 | 架构设计 | 详见 |
|---|---|---|
| 批量出账的峰值写入 | 任务分片 + 幂等重跑 + 消息削峰 | [核心业务链路 · 出账](/projects/property-saas/core-business/#billing-flow) |
| 账单金额精度与并发修改 | 定点类型 + 条件更新 + 状态机 | [核心业务链路 · 正确性](/projects/property-saas/core-business/#billing-correctness) |
| 支付回调不能重复入账 | 业务唯一键 + 状态机 + 幂等表 | [接口幂等](/java/spring/spring-cloud/idempotency#solutions) |
| 门禁弱网离线仍要能开门 | 设备侧白名单 + 分层缓存 + 补传 | [核心业务链路 · 离线降级](/projects/property-saas/core-business/#offline) |
| 团购抢购库存不超卖 | 缓存预减库存 + 消息排队 + 幂等回补 | [核心业务链路 · 交易](/projects/property-saas/core-business/#commerce) |
| 租户规模差异极大 | 三级混合隔离 | [K8s 多租户隔离](/cloud-native/kubernetes/#multi-tenant) |
| 定时任务在多副本下重复执行 | 调度平台分片 + 执行权互斥 | [分布式任务调度](/java/spring/spring-cloud/scheduling#no-dup) |
| 容量该配多少没有依据 | 六步推导链 + 三档租户画像 | [容量测算 · 推导链](/projects/property-saas/capacity-and-perf/#derivation) |
| 高并发时雪崩而不是排队 | 五层防护链路 + 按语义降级 | [容量测算 · 防护链路](/projects/property-saas/capacity-and-perf/#protection) |
| 估算值缺少实测背书 | 混合场景压测 + 中间件同屏监控 | [压测方案](/projects/property-saas/capacity-and-perf/#pressure-test) |
| 报表查询压垮业务库 | 分析负载外移到 Doris | [Doris 数仓](/bigdata/doris/) |
| 业务库变更如何进数仓 | binlog → CDC → MQ → 数仓 | [Canal 数据同步](/bigdata/canal/) |
| 历史数据长期留存与成本 | 冷热分层 + 湖表归档 | [Lakehouse](/bigdata/lakehouse/#three-tiers) |
| 指标口径不统一 | 分层建模 + 一致性维度 | [数仓分层建模](/bigdata/warehouse-design/) |
| 数据库变更出事后回不去 | 扩展—迁移—收缩三步法 + 可回滚检查项 | [发布 · 数据库变更](/projects/property-saas/release-and-ops/#db-migration) |
| 敏感数据与合规红线 | 严格边界 + 切面层脱敏 + 分级分类 | [发布 · 合规边界](/projects/property-saas/release-and-ops/#compliance) |
| 故障时不知道该看哪 | 三层监控 + P0/P1 分级 + Runbook | [发布 · 监控告警](/projects/property-saas/release-and-ops/#monitoring) |
| 多级审批与通知 | 消息驱动 + 消费幂等 | [分布式事务](/java/spring/spring-cloud/transaction#mq-idempotent) |

## 五、阅读建议 {#reading}

| 你的关注点 | 建议路径 |
|---|---|
| 想看架构决策过程 | [产出工具 · ADR](/projects/toolkit/adr/) → 本板块五篇专题 |
| 想从业务起点看完整链路 | [核心业务链路](/projects/property-saas/core-business/) → [容量测算与压测](/projects/property-saas/capacity-and-perf/) → [发布、安全与运维](/projects/property-saas/release-and-ops/) |
| 想看多租户与云原生落地 | [Kubernetes 编排](/cloud-native/kubernetes/) → [微服务 → K8s](/projects/property-saas/microservice-to-k8s/) |
| 想看数据链路与数仓 | [Canal](/bigdata/canal/) → [Doris](/bigdata/doris/) → [Lakehouse](/bigdata/lakehouse/) → [数仓分层建模](/bigdata/warehouse-design/) → [数仓落地](/projects/property-saas/data-warehouse/) |
| 想看容量怎么论证 | [压测报告（方法）](/projects/toolkit/perf-report/) → [容量测算与压测方案（案例）](/projects/property-saas/capacity-and-perf/) |
| 想看怎么把方案变成可验证产出 | [产出工具导览](/projects/toolkit/)（ADR / 压测报告 / 架构图） |

> **写作约定**：案例层只讲"我们怎么用的"，方法层只讲"怎么用"——两者的分工见 [产出工具导览](/projects/toolkit/)。
>
> **五篇共同遵守一条纪律**：区分「设计目标」与「实测数据」。所有数值都标注了它是估算还是实测，并在每篇末尾单列「设计目标与尚未验证的部分」——**未验证项写出来不是方案不完整，而是边界声明**。
