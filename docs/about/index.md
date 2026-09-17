---
date: 2026-09-17
title: 关于本站
desc: 站点定位：领域轴用来查，成长路线与架构路线用来走；六板块是仓库
---

# 关于本站

L知识库是一个面向 Java 后端方向的技术知识站点，定位是**对抗碎片化学习**：把散落在笔记、文档与项目实践中的知识，按主线重新组织成可检索、可回顾、可长期维护的体系。**不是入门站。**

站点内容以工程视角为主——既讲清原理（为什么这样设计），也交代取舍（在什么约束下选择哪条路径），并尽量给出可验证的结论。

三条轴不要混：

| 轴 | 入口 | 尺子 |
|---|---|---|
| **领域**（用来查） | 顶部 6 个板块 | 这篇讲什么技术 |
| **深度**（用来走） | [成长路线](/projects/architect-roadmap/)，竖栏最上 | **成长 L1–L4**：人能交付什么 |
| **形态**（用来走） | [架构路线](/projects/architecture-evolution/)，竖栏第二条 | **架构 L1–L6**：系统各层在哪一档 |

不要把「成长 L2」和「架构 L2」读成同一个阶段。六板块是仓库，同一页会按成长级别被读到不同深度。

## 内容规划

两条路线的入口都在最右侧竖栏（成长在上、架构在下），**全站常驻**，不占顶部导航。顶部导航只放板块。

| 板块 / 主线 | 覆盖范围 |
|---|---|
| [**成长路线**](/projects/architect-roadmap/) | **深度轴**——成长 L1 开发 → 成长 L2 高级开发 → 成长 L3 架构师 → 成长 L4 CIO；38 页地基不占级别；每一级给清单与「读到哪一层就停」。AI 按四级切片，见[AI 应用 · 按四级读](/ai/#by-level) |
| [**架构路线**](/projects/architecture-evolution/) | **形态轴**——架构 L1 共址与拆机之后，架构 L2 应用 / 架构 L3 数据 / 架构 L4 缓存 / 架构 L5 文件 / 架构 L6 部署各走各的。档位与状态记在[层账](/projects/architecture-evolution/ledger/) |
| [计算机基础](/fundamentals/) | 计算机网络、操作系统、算法与数据结构 —— 语言无关的三大底座 |
| [语言与框架](/java/) | Java 语言基础、集合、并发与 JUC、JVM、设计模式、Spring 全家桶（IoC / Bean / AOP / MyBatis / 横切能力 / MVC / Boot / Cloud）、测试与质量；[大前端](/frontend/)（小程序双线程模型、uni-app 跨端机制、组件化与分包、发布与多端打包） |
| [数据与存储](/database/) | MySQL 索引与事务、PostgreSQL 的 MVCC / VACUUM / 索引类型、Redis 原理与高可用、MongoDB 文档模型与原生分片、分库分表；[搜索与检索](/search/)（Elasticsearch 倒排索引与分词、写入链路与近实时、查询 DSL 与相关性算分、分片与深分页、ELK 日志栈）；[数据仓库](/bigdata/)（Canal 同步、Flink 流处理、Doris 与 ClickHouse、Iceberg 冷热分层与建模） |
| [中间件与分布式](/middleware/) | RabbitMQ、Kafka、RocketMQ、物联网 MQTT，RPC 与协议（序列化与 IDL / 协议与传输 / Dubbo 机制 / 可靠性治理）；[分布式理论](/distributed/)（共识协议 Paxos / Raft 与选主、一致性哈希与数据分布、分布式 ID、协调服务 ZooKeeper 与 etcd） |
| [架构与云原生](/cloud-native/) | Docker、Kubernetes、Helm 与配置管理、服务网格、CRD 与 Operator、CI/CD 与发布（含研发效能度量）、监控与可观测；[架构方法论](/methodology/)（DDD 战略与战术、架构风格谱系、拆分粒度与部署形态、事件驱动与 CQRS、落地反模式、技术成本与 ROI、对账与补偿、多租户）；[高可用](/high-availability/)（可用性目标与度量、冗余与故障转移、多机房与单元化、混沌工程与故障演练）；[安全与合规](/security/)（认证与令牌、授权与越权、OAuth2 与 OIDC、Web 攻击防护、加密脱敏与合规边界、等保与数据出境与开源许可治理） |
| [实战与面试](/projects/) | [可验证产出工具箱](/projects/toolkit/)（闭卷模拟盘 + 立项三件套 + 方案评审 + 故障复盘）、绩效系统与智慧物业 SaaS 两个案例；[AI 应用](/ai/)；[面试专题](/interview/)（检索层：成长 L2→L3 先卡一包，1236 题是库存） |

## 阅读建议

- **体系化学习**：先看[成长路线](/projects/architect-roadmap/)确认自己在成长 L 哪一级，再按该级清单推进。**顺序按依赖排，不按板块排**。处在成长 L2～成长 L3 之间、要练判断：先填[层账](/projects/architecture-evolution/ledger/)，再用[闭卷模拟盘](/projects/toolkit/drill/)重推两个案例。
- **按需查阅**：手册用法，直接检索板块；导览页有「与相邻板块的边界」。
- **面试准备**：先打开[成长 L2→L3 · 下一轮该卡](/interview/#pack)，1236 题是库存。答案回正文锚点；项目面用[层账](/projects/architecture-evolution/ledger/) / [闭卷模拟盘](/projects/toolkit/drill/) / [ADR](/projects/toolkit/adr/)。
- **想知道「哪里还没写」**：[成长路线的覆盖度](/projects/architect-roadmap/#coverage)。成长 L4 的组织 / 财务 / 法务仍是知识域边界，**缺的写出来，比让读者自己撞墙好**。

## 内容边界

站点内容以通用技术知识、公开技术方案与脱敏后的工程实践为主，不涉及具体企业的商业信息与内部数据。部分专题仍在整理中，会持续滚动更新。
