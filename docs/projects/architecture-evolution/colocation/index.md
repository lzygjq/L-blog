---
date: 2026-09-17
title: 架构 L1 共址与拆机
desc: 架构路线里唯一齐步的阶段——四件套先挤在一台机器上共命运，再按疼的那件串行往外搬；拆机买隔离，不买高可用
order: 1
sidebar: 架构 L1 共址与拆机
---

# 架构 L1 共址与拆机

> **口径说明**：这一页是[架构路线](/projects/architecture-evolution/)的架构 L1，**唯一齐步的阶段**。四件套不是一起演进，只是挤在同一台机器上共命运。拆开之后各走各的梯子：[架构 L2 应用](/projects/architecture-evolution/app/) · [架构 L3 数据](/projects/architecture-evolution/data/) · [架构 L4 缓存](/projects/architecture-evolution/cache/) · [架构 L5 文件](/projects/architecture-evolution/file/) · [架构 L6 部署](/projects/architecture-evolution/deploy/)。

## 一、起步：还没有「文件服务器」 {#colocation}

单体时期常常是这样，不是四条平行的梯子：

```text
一台机器
  ├── 应用进程（Tomcat / JVM）
  ├── MySQL 数据目录        ← 同一块磁盘
  ├── Redis（也可以还没有） ← 同一块内存
  └── uploads / 本地文件    ← 同一块磁盘，还不是独立文件服务
```

这一档不是落后，是量还小的时候**成本最优**。该拆的信号也不是「看起来不够企业级」，而是它们开始互相伤害：

| 现场 | 真正在抢什么 |
|---|---|
| `mysqldump` 期间接口超时 | 磁盘 IO：备份和业务写同一块盘 |
| Redis `bgsave` 之后 JVM 被 OOMKill | 内存：fork 的写时复制把 RSS 顶满 |
| 上传图片把磁盘打满，数据库也写不进去 | 容量：文件和 binlog 没有隔离 |
| 高峰时 MySQL 和应用抢 CPU，谁都慢 | 计算：没有独立上限 |

**共址的上限**：单机的 CPU、内存、磁盘、网卡。任何一件打满，四件一起死。能撑多久取决于业务量，没有统一 QPS——能确定的是**它撑不住「其中一件需要独占资源」之后的阶段**。

共址期就要留好三条后路，否则拆机变成搬家工程：配置外置、会话不写本地、文件路径可配。

## 二、物理拆开：还没做主从，先不再抢 {#split}

拆机买的是**隔离**。主从买的是副本和读扩展。在共址上堆主从，只是把抢资源的现场复制一份。

| 项 | 内容 |
|---|---|
| **解决了共址什么** | 资源争抢。库的 IO、Redis 的内存、应用的 CPU 分开记账 |
| **触发信号** | ① 备份 / 持久化 / 上传已经能把另外三件打停；② 需要给库或缓存单独升配，却不能把应用一起升；③ 准备上多实例，但文件还在本地盘 |
| **怎么拆（串行）** | **先迁 MySQL**（IO 最凶），**再迁 Redis**（内存最凶）。文件可以晚一点——直到应用要跑第二台，必须先离开本地盘。Redis 如果还没引入，这一步不存在 |
| **拆完能撑什么** | 每一件按自己的规格垂直升配；备份打满库盘时应用还能活。**体量仍然是「几台单机之和」，不是集群** |
| **新上限** | 每件仍是单点。读打满单库 CPU、主库宕机要人切、内存装不下、多实例写文件对不上——这些**拆机解决不了**，交给各层自己的梯子 |

> **先拆机、后做主从。** 出口设计见[迁移期的兼容](/projects/property-saas/microservice-to-k8s/#coexistence)。

拆开之后，应用往往还是单体，发布还是手工。MySQL 主从、哨兵、对象存储、K8s **都还没发生**——那是各层页的事，不要在这一页齐步往前推。

## 三、拆完之后去哪一层 {#next}

看[总览里谁先撞墙](/projects/architecture-evolution/#triggers)。常见的下一跳：

| 现象 | 去哪一层 |
|---|---|
| 读把单库 CPU 打满，或备份仍要停业务 | [架构 L3 数据 · 主从](/projects/architecture-evolution/data/#replica) |
| 要起第二台应用 | [架构 L5 文件](/projects/architecture-evolution/file/)必须离开本机；[架构 L6 部署](/projects/architecture-evolution/deploy/)至少要能重复 |
| 模块变多、横切各写各的 | [架构 L2 应用 · 父子聚合](/projects/architecture-evolution/app/#modular) |
| 图片已经慢了，库还远没到分片 | [架构 L5 文件 · CDN 可提前](/projects/architecture-evolution/file/#cdn) |

| 回看 | 各层 |
|---|---|
| [架构路线总览](/projects/architecture-evolution/) | [架构 L2 应用](/projects/architecture-evolution/app/) · [架构 L3 数据](/projects/architecture-evolution/data/) · [架构 L4 缓存](/projects/architecture-evolution/cache/) · [架构 L5 文件](/projects/architecture-evolution/file/) · [架构 L6 部署](/projects/architecture-evolution/deploy/) |
