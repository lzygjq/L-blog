---
date: 2026-09-16
title: 分布式协调 · 板块导览
desc: 协调服务只存"谁说了算"、不存"发生了什么"——从这句判据出发的五篇：边界判据、ZooKeeper 数据模型、ZAB 协议、分布式锁与 fencing、选型与集群治理
---

# 分布式协调 · 板块导览

这个子板块是[分布式理论](/distributed/)的**工程化落地层**。上一层的三篇讲的是机制本身（共识怎么定序、数据怎么摊开、ID 怎么唯一），这一层讲的是**把这些机制打包成一个能用的服务之后，你会遇到什么**。

先说清它**不做什么**：

- 不重复共识协议的原理（[共识协议](/distributed/consensus) 已成篇），只讲 ZAB 与 Raft 的结构差异；
- 不重复 CAP 的取舍判据（[CAP 与 BASE](/java/spring/spring-cloud/cap-base) 已成篇）；
- 不重复 Redis 侧锁的实现细节（[Redis 分布式锁与 MQ](/database/redis/lock-and-mq) 有专节），只讲**三种锁实现的语义差异**。

## 一、一条主线：它只存"谁说了算"，不存"发生了什么" {#thread}

协调服务的全部能力，都可以从这一句推出来：

> **协调服务只存"谁说了算"，不存"发生了什么"。**

| 存什么 | 例子 | 特征 | 该放哪 |
|---|---|---|---|
| **谁说了算** | 选主结果、锁的归属、成员列表、配置、分片归属 | **小**（KB 级）、**能重建**、**丢了会全局震荡** | 协调服务 |
| **发生了什么** | 订单、消息、日志、用户数据 | **大**、**不能重建**、必须持久 | 数据库 / 消息队列 |

这条判据一分开，下面所有结论都变成推论：

| 现象 | 为什么 |
|---|---|
| 单节点只有约 1MB、官方反对调大 | 因为它存的是"谁说了算"，本来就不该大；大了会动摇同步 |
| 读多写少、吞吐只有每秒千级写 | "谁说了算"的变化天然稀疏；稠密说明用错了 |
| 它挂了不一定影响读写，但**冻结所有变更** | 扩缩容、故障转移、配置变更**都要问它** |
| 所有基于超时的锁都有"双持有"窗口 | 它只能保证"谁说了算"，**保证不了"失去话语权的人停手"** |

最后一行是这个板块里最值钱的一条，单独成篇（第 4 篇）。

## 二、五篇地图 {#map}

| # | 篇 | 解决什么问题 | 一句话结论 |
|---|---|---|---|
| 1 | [协调问题的边界](/distributed/coordination/what-coordination-solves) | 什么该交给协调服务、什么绝对不该 | 六种原语共通的只有三条要求：**读多写少、要通知不要轮询、崩了要自动清理**；五条"不该用"的判据里有三条是杀鸡用牛刀 |
| 2 | [ZooKeeper 数据模型](/distributed/coordination/zookeeper-model) | znode、会话、Watcher 各自带来什么约束 | **会话决定"谁还在"、znode 决定"谁占了位置"、Watcher 决定"变化多久传到"**；Watcher 的三个特性各对应一类错误用法 |
| 3 | [ZAB 协议](/distributed/coordination/zab-protocol) | ZK 为什么不直接用 Raft、默认读是不是线性的 | **ZAB 面向"一段历史"、Raft 面向"一条日志"**；ZK 保证的是"写不丢 + 全序"，**不是"读到最新"** |
| 4 | [分布式锁与 fencing](/distributed/coordination/coordination-lock) | 三种锁的语义差在哪、为什么会双持有 | 锁只能保证"**同一时刻一个人认为自己持有锁**"，**保证不了"失去锁的人停手"**——后者只能靠资源端 fencing |
| 5 | [协调服务选型](/distributed/coordination/coordination-selection) | 用哪个、以及买到之后怎么才不出事 | 它是体系里**最不能被牺牲的一环**：挂了不阻塞读写，但**冻结一切变更**；etcd 的两大坑是**配额**与**磁盘延迟** |

## 三、与其他板块的关系 {#relations}

| 板块 | 关系 |
|---|---|
| [分布式理论](/distributed/)（本板块的上一层） | **机制层**：共识、数据分布、分布式 ID 的算法本身；本层讲这些机制的**服务化形态** |
| [共识协议](/distributed/consensus) | ZAB 那一篇是它的**具体实现**；对照表的第 6 行（ZooKeeper / ZAB）在本板块展开 |
| [CAP 与 BASE](/java/spring/spring-cloud/cap-base) | **取舍层**：ZK / etcd 是典型的 **CP** 代表，这里的判据是"**读到旧的会出大问题**" |
| [Redis 分布式锁](/database/redis/lock-and-mq) | 同一问题的**另一条路线**：那边讲 `SET NX` 与 Lua 的实现，这边讲三种实现的语义差异与 fencing |
| [消息队列](/middleware/) | **最直接的解耦现场**：Kafka 4.0 起移除 ZooKeeper（[KRaft 的因果链](/distributed/coordination/coordination-selection#kraft)）；RocketMQ 5.x 引入 Controller 模式 |
| [云原生](/cloud-native/) | **K8s 的整个控制平面依赖 etcd**：etcd 不可用则集群无法做任何变更（[etcd 的配额与磁盘](/distributed/coordination/coordination-selection#etcd-ops)） |
| [高可用](/high-availability/) | **同一命题的另一面**：那边讲冗余与故障转移，这边要解决的是「**失去租约的那段窗口里，旧持有者还在写**」 |
| [数据仓库](/bigdata/) | ClickHouse Keeper 协议兼容 ZK、Doris 用 Paxos 不依赖 ZK —— **把外部协调依赖内化**的两个样本 |

## 四、面试高频索引 {#interview-index}

| 主题 | 高频问法 | 出处 |
|---|---|---|
| 协调服务的本质 | "分布式协调服务是干什么的" | [六种原语与三条共通要求](/distributed/coordination/what-coordination-solves#what) |
| 为什么不用数据库做锁 | "为什么不能在 MySQL 里存一张锁表" | [业务库与 Redis 各缺什么](/distributed/coordination/what-coordination-solves#why-not-db) |
| Redis 锁与 ZK 锁的区别 | "TTL 和会话到底差在哪" | [绝对过期 vs 会话](/distributed/coordination/what-coordination-solves#why-not-db) |
| znode 能存多大 | "ZK 一个节点能放多少数据" | [约 1MB 与它为什么必须小](/distributed/coordination/zookeeper-model#znode-limit) |
| 四种节点类型 | "临时节点和持久节点怎么选" | [znode 的四种类型](/distributed/coordination/zookeeper-model#znode-types) |
| 崩溃为什么能自动清理 | "进程被 kill 了临时节点怎么没的" | [会话与临时节点](/distributed/coordination/zookeeper-model#session) |
| Watcher 的三个特性 | "watch 是不是可靠通知" | [一次性 / 不含数据 / 不保证每次变化](/distributed/coordination/zookeeper-model#watcher) |
| 羊群效应 | "几千个客户端 watch 同一个节点会怎样" | [只 watch 前一个](/distributed/coordination/zookeeper-model#herd) |
| zxid 是什么 | "zxid 的 64 位怎么划分" | [epoch + 计数器](/distributed/coordination/zab-protocol#zxid) |
| ZAB vs Raft | "两者最大的结构差异" | [两套机制 vs 一套](/distributed/coordination/zab-protocol#modes) |
| TRUNC 为什么安全 | "新的 Leader 凭什么删掉多的提案" | [TRUNC 的推理链](/distributed/coordination/zab-protocol#trunc) |
| ZK 的读是否线性一致 | "刚写完立刻读能读到吗" | [默认本地读，要 `sync()`](/distributed/coordination/zab-protocol#read-consistency) |
| 分布式锁的边界 | "锁能保证不发生什么" | [它的能力边界](/distributed/coordination/coordination-lock#fencing-why) |
| fencing token | "锁已经正确了为什么还要令牌" | [令牌从哪来与它的代价](/distributed/coordination/coordination-lock#fencing) |
| RedLock 的争议 | "RedLock 到底能不能用" | [它的正确定位](/distributed/coordination/coordination-lock#redlock) |
| etcd 默认配额 | "etcd 为什么会突然只读" | [2GiB 与 NOSPACE](/distributed/coordination/coordination-selection#etcd-quota) |
| compaction 与 defrag | "压缩完文件为什么还那么大" | [逻辑回收 vs 物理重写](/distributed/coordination/coordination-selection#etcd-compaction) |
| Kafka 为什么弃用 ZK | "KRaft 解决了什么" | [元数据成为分区数天花板](/distributed/coordination/coordination-selection#kraft-why) |
| Consul 还能用吗 | "BUSL 许可影响自用吗" | [许可的触发边界](/distributed/coordination/coordination-selection#license) |
| Observer 有什么用 | "加 Observer 提升可用性吗" | [提升读、不提升写可用性](/distributed/coordination/zab-protocol#quorum) |

## 五、版本现状 {#versions}

| 组件 | 当前版本 | 关键时间点 |
|---|---|---|
| **ZooKeeper** | **3.9.x**（3.9.5）；稳定版 3.8.x | 3.7 于 2024-01-19 EOL；3.8 起迁 Logback + 支持 JDK 17；3.9 起 FIPS 默认开启 |
| **etcd** | **3.6.x**（3.6.13）；**3.7.0 已 GA** | 3.6.0 发布于 2025-05-15（近四年首个 minor）、**首个支持降级的版本**；3.4 于 **2026-05-15 EOL** |
| **Kafka** | **4.x** | **4.0（2025-03）起移除 ZooKeeper，KRaft 成为唯一模式**；Broker 要求 Java 17 |
| **Consul** | 1.17+ | **2023-08-10 起由 MPL 2.0 改为 BUSL 1.1**（API/SDK 仍 MPL 2.0） |

## 六、阅读建议 {#reading}

| 你的情况 | 建议顺序 |
|---|---|
| 面试前突击 | 第 1 篇（边界）→ 第 4 篇（锁与 fencing）→ 第 3 篇（ZAB 与 Raft 对照） |
| 正在选型 | 第 1 篇（要原语还是成品）→ 第 5 篇（选型与治理） |
| 线上出过 ZK / etcd 故障 | 第 2 篇（会话与 Watcher）→ 第 5 篇的 [ZK](/distributed/coordination/coordination-selection#zk-ops) / [etcd](/distributed/coordination/coordination-selection#etcd-ops) 两节 |
| 想把这一层学透 | 按 1 → 2 → 3 → 4 → 5 顺序读，第 3 篇可以和第 1 篇的[共识协议](/distributed/consensus)对着看 |

> **本子板块 5 篇正文 / 6 页。** 与[共识协议](/distributed/consensus)的分工是「协议原理 vs 服务化形态」，与 [Redis 分布式锁](/database/redis/lock-and-mq)的分工是「语义差异 vs 实现细节」，与[高可用](/high-availability/)的分工是「协调原语 vs 冗余与切换」，各处交叉引用而不复制正文。
