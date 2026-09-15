---
date: 2026-09-15
title: Canal 数据同步
sidebar: Canal 数据同步
desc: 为什么轮询捞不出真实变更、binlog 格式与 dump 协议、Canal 的组件划分与高可用、MySQL → 数仓的同步链路设计、与 Debezium / Maxwell / Flink CDC 的选型对照
---

# Canal 数据同步

## 一、问题场景：业务库的数据怎么"搬"到数仓 {#why-cdc}

分析需求的起点总是同一句话：**业务数据在 MySQL 里，报表要在大数据侧算。**

最直觉的做法是写个定时任务，按 `update_time` 捞增量：

```sql
SELECT * FROM t_order WHERE update_time > ? AND update_time <= ?
```

这个方案在真实系统里会同时踩四个坑：

| 坑 | 表现 | 根因 |
|---|---|---|
| **看不见删除** | 数仓里那笔已取消的订单永远在 | 物理删除不产生"可捞的记录" |
| **看不见字段级变更** | 改了收货地址，数仓只看到整行又写了一次 | 轮询只能拿"最终状态"，拿不到"变了什么" |
| **扫描压力大** | 大表上每分钟一次范围扫描，业务库被拖慢 | 轮询是**主动查询**，成本随表增大而增长 |
| **时间窗不可靠** | 刚好卡在窗口边界的事务被漏掉 | `update_time` 由业务写入，可被覆盖、可被回滚 |

CDC（Change Data Capture，变更数据捕获）换掉的是**数据来源**：不去问业务库"你变了吗"，而是去读**数据库自己记的变更日志**。MySQL 的这份日志就是 **binlog**。

> **一句话认知**：binlog 原本是给"从库复制"用的，CDC 只是把自己伪装成一个从库去订阅它。这也是为什么 CDC 的权限、协议、限制全都继承自 MySQL 复制。

## 二、原理：binlog 与 dump 协议 {#binlog-principle}

### 2.1 为什么 CDC 只能用 ROW 格式 {#row-format}

binlog 有三种记录格式，`binlog_format` 决定写入的是"语句"还是"数据"：

| 格式 | 记录内容 | CDC 能否用 | 原因 |
|---|---|---|---|
| `STATEMENT` | 原始 SQL 语句 | ❌ | 拿到的是 `UPDATE t SET a=a+1`，无法知道影响哪几行、更无法重放到异构目标 |
| `MIXED` | 由 MySQL 自行选择 | ❌ | 不确定哪些语句以 ROW 记录，行为不可预测 |
| `ROW` | 每一行的前后镜像 | ✅ | 记录的是**行级物理结果**，与函数、非确定性表达式、执行计划都无关 |

必须确认两点：

```ini
# my.cnf
binlog_format      = ROW
binlog_row_image   = FULL   # MINIMAL 只记主键+被改列，删改场景下构造不出完整行
```

`binlog_row_image = MINIMAL` 是个**隐蔽的坑**：它省日志体积，但 UPDATE / DELETE 事件里只有被改动的列和主键。如果下游需要"整行替换"，就会因为缺少未改动列而写出残缺记录。

### 2.2 一次变更在 binlog 里长什么样 {#binlog-events}

ROW 格式下一次事务产生的事件序列：

```
BEGIN
  ├─ QUERY_EVENT            事务开始（记录 BEGIN）
  ├─ TABLE_MAP_EVENT        表 ID ↔ 库名/表名 的映射，含列结构
  ├─ UPDATE_ROWS_EVENT      before image + after image
  ├─ (WRITE_ROWS_EVENT / DELETE_ROWS_EVENT)
COMMIT
  └─ XID_EVENT              事务提交，携带 XID
```

两个要点：

- **`TABLE_MAP_EVENT` 必须缓存**。行事件里只有数字表 ID，没有表名。CDC 工具要先解析出映射才能还原成"库.表"。这也解释了为什么**跨 binlog 文件续读时，必须从头重放该事务的 `TABLE_MAP`**。
- **`XID_EVENT` 才是提交点**。只有见到 XID 才能认为整个事务生效；在此之前的下游写入都有回滚风险。

### 2.3 位点：为什么现在用 GTID 而不是文件名+偏移量 {#position}

| 位点形态 | 内容 | 问题 |
|---|---|---|
| **file + position** | `mysql-bin.000123` 的第 45678 字节 | 主从切换 / 主库重建后文件名与偏移量都可能变，位点失效 → 只能重新全量 |
| **GTID** | `server_uuid:transaction_id` | 全局唯一标识一个事务，**与文件、偏移、主库身份无关**，切主后可继续 |

GTID 是生产环境的标准选择，代价是要开 `gtid_mode = ON` 并处理它与旧位点的兼容。Canal 侧的对应配置是 `canal.instance.gtidon`。

### 2.4 dump 协议：伪装成从库的五个技术细节 {#dump-protocol}

```
        ┌──────────────┐  1. 握手：伪装 slave，上报 server_id
        │              │ ────────────────────────────────────┐
        │  MySQL 主库   │                                      ▼
        │              │  2. COM_BINLOG_DUMP_GTID      ┌──────────────┐
        │   ├ binlog   │ ─────────────────────────────▶│ Canal Server │
        │   ├ 复制协议  │                                │ （slave 身份）│
        └──────────────┘  3. 持续推送 binlog event 流   └──────┬───────┘
                                                                 │ 解析 → 过滤 → 攒批
                                                                 ▼
                                                          ┌──────────────┐
                                                          │  EventStore  │ 位点持久化
                                                          └──────┬───────┘
                                                                 │ 4. Client 拉取并 ACK
                                                                 ▼
                                                     MQ / 下游写入 / Canal Adapter
```

1. **`server_id` 必须唯一**。CDC 在主库看来就是一个从库。如果它的 `server_id` 与真实从库或另一个 CDC 实例重复，MySQL 会直接断开其中一个连接。这是"莫名其妙连不上"的第一大原因。
2. **权限最小化**：需要 `REPLICATION SLAVE`（发起 dump）与 `REPLICATION CLIENT`（查看位点/状态）。**不要给 `ALL PRIVILEGES`**——CDC 只需要"读日志"，不需要"读数据"。
3. **`COM_BINLOG_DUMP` 与 `COM_BINLOG_DUMP_GTID`** 是两个不同命令，对应新旧两种位点形态。
4. **主库要保留 binlog 够久**（`binlog_expire_logs_seconds`、`max_binlog_size`）。CDC 停止超过保留期，位点对应的文件已被清理 → 只能重新全量。**这是 CDC 运维最常见的生产事故**，必须配"位点落后"告警。
5. **一个实例一个连接**。instance 与 MySQL 连接基本一对一，订阅的表多了要考虑主库连接数。

## 三、Canal 的组件划分与高可用 {#components}

组件不多，但职责边界要分清：

| 组件 | 职责 | 不负责 |
|---|---|---|
| **Canal Server** | 伪装从库、拉取并解析 binlog、维护位点、对外提供订阅 | 不负责业务语义（订阅哪些表、怎么转换） |
| **Instance** | 一个独立的订阅单元（对应一套库/表 + 一份位点） | 不是进程，是 Server 内的逻辑单元 |
| **EventStore** | 环形队列，暂存已解析事件；下游 ACK 后推进位点 | 不是长久的消息中间件，**不能当 MQ 用** |
| **Canal Client** | 从 Server 拉事件、按业务处理、成功后 ACK | 不做格式转换 |
| **Canal Adapter** | 内置一批 Sink（MySQL / ES / HBase 等），配置化同步 | 不适合复杂转换与高吞吐 |

**投递模式**：直连（Client 主动拉）适合下游是自研 Java 服务；**投递到 Kafka / RocketMQ** 适合多下游订阅同一份变更流——这才是大数据侧的常规形态，因为下游（实时计算、数仓写入）通常已经接在 MQ 上。

### 3.1 高可用与语义 {#ha-semantics}

- **HA 靠 ZooKeeper 选主**：多个 Canal Server 对同一 instance 竞争，只有 leader 拉 binlog；leader 挂掉后从持久化的位点续读。
- **语义是 At Least Once，不是 Exactly-Once**：

```
位点 P1 ──读事件──▶ 写入 EventStore ──Client 拉取──▶ 下游写入 ──▶ ACK 到 P2
                                        ▲
                        若在下游写入成功后、ACK 之前宕机
                        → 重启从 P1 重放 → 下游收到重复事件
```

**结论：下游必须自己做幂等**，不能假设"不会重复"。这一条是所有 CDC 方案的共同前提，也是面试最常追问的一层。

## 四、把变更同步进数仓：链路怎么设计 {#pipeline}

### 4.1 三条链路对比 {#three-pipelines}

| 链路 | 形态 | 适用 | 代价 |
|---|---|---|---|
| **CDC → MQ → 自研消费者 → 数仓** | 最经典、可控性最强 | 需要复杂转换、多下游 | 要自己实现幂等、攒批、失败重试 |
| **Canal Adapter 直写** | 配置化，开箱即用 | 小规模、目标就是 MySQL / ES | 转换能力弱、吞吐有限、中间无缓冲 |
| **Flink CDC 直读 binlog** | CDC + 计算一体 | 需要实时清洗 / 关联 / 聚合 | 依赖 Flink 集群，作业即服务，运维形态不同 |

大规模同步到 OLAP（如 Doris / StarRocks）时，**中间加 MQ 是必要的**：它同时解决了"削峰""多下游""可重放"三件事。binlog 本身没有重放能力（位点只能前进），一旦下游写失败又没有 MQ，就只能回退位点、把下游的重放范围一起拉大。

### 4.2 表过滤与 DDL {#filter-ddl}

- **只订阅需要的表**：`canal.instance.filter.regex`（白名单）与 `filter.black`（黑名单）。订阅全库是最容易犯的错——日志量大、下游无用，还平白增加了 DDL 敏感度。
- **DDL 不会自动同步**。Canal 能解析出 `QUERY_EVENT` 里的 DDL，但**下游表结构不会跟着变**。实务中有两档做法：
  - **保守**：DDL 走审批，只做**兼容变更**（新列可空、不改类型、不删列），下游手工补列；
  - **激进**：解析 DDL 后驱动下游 Schema 演化（Flink CDC 3.x 支持自动演化；Canal 需要自己写）。

### 4.3 字段类型映射：容易翻车的地方 {#type-mapping}

| MySQL 侧 | 数仓侧的风险 | 处理 |
|---|---|---|
| `tinyint(1)` | 当布尔用，也可能当数值用 | 明确语义，别指望自动推断 |
| **`unsigned`** | 目标侧若无符号会溢出 | 显式放大类型（如 `bigint`） |
| `decimal(m,n)` | 转 `double` 丢精度、金额算错 | 映射到定点类型或字符串 |
| `datetime` / `timestamp` | **时区**：`timestamp` 存 UTC、`datetime` 无时区 | 统一按 UTC 落库、展示层再转；服务与容器显式配 `Asia/Shanghai` |
| `text` / `blob` | 某些 Sink 不支持大字段 | 单独链路或截断策略 |
| 无主键表 | 增量无法定位行 | 上游规范约束 + 定期全量校准 |

### 4.4 幂等与顺序 {#idempotency-order}

**顺序的真实边界**：

- **同一个 instance（同一份 binlog 流）内，事件是有序的**——这是 binlog 的固有性质；
- **跨 instance / 按表拆分后，顺序不再成立**。按表拆 instance 提高吞吐的代价，就是放弃了全局顺序。

**幂等的正确做法**：不要指望"不重复"，而是让重复写入的结果与一次写入相同。

```sql
-- 目标表用 Unique Key 模型按主键 UPSERT；
-- 关键点：用一个单调字段（binlog 时间戳 / 事务序号）作为 sequence 列，
-- 让"先到的旧事件"不能覆盖"后到的新事件"。
```

更进一步的问题是**乱序**：一旦下游并发消费，乱序就会发生，此时单靠主键 UPSERT 不够——旧事件晚到会覆盖新值。解法是给目标表加**版本列**（binlog 位点或时间戳），写入时比较版本、只接受更新的。

> 思路与 [接口幂等](/java/spring/spring-cloud/idempotency#solutions)、[分布式事务的 MQ 方案](/java/spring/spring-cloud/transaction#mq-idempotent) 是同一套——"消息至少一次 + 幂等消费"在不同层面上反复出现。

### 4.5 大事务、主键变更与对账 {#pitfalls}

| 坑 | 现象 | 处理 |
|---|---|---|
| **大事务** | 一次性 `UPDATE` 百万行，事件在内存堆积、下游延迟飙升 | 上游改分批；调大 `canal.instance.memory.buffer.size`；下游攒批写入 |
| **主键变更** | 目标侧变成两行或数据错位 | 视为"删旧 + 插新"；或用业务唯一键（而非自增 ID）作为目标主键 |
| **binlog 过期** | 位点对应文件已被清理 | 保留期 > 最大允许停机时间；配位点落后告警；保留全量重跑通道 |
| **事务边界丢失** | 下游只看到单行，看不到"这批一起提交" | 保留 `XID`；需要在同一事务内生效的表按事务成组提交 |
| **数据漂移** | 长期运行后数仓与业务库对不上 | **每日 T+1 对账**：行数 + 关键指标 + 抽样明细，差异自动告警 |

## 五、对比辨析：四种 CDC 方案怎么选 {#compare}

| 维度 | **Canal** | Debezium | Maxwell | Flink CDC |
|---|---|---|---|---|
| 定位 | MySQL 专用、轻量 | 多数据源、标准化 | 极简单进程 | CDC + 计算一体 |
| 数据源 | MySQL / MariaDB | MySQL / PG / Mongo / Oracle / SQL Server 等 10+ | 仅 MySQL | MySQL / PG / Mongo / Oracle |
| 部署 | 独立 Java 进程 | Kafka Connect 集群 | 单进程 | Flink 作业 |
| HA | ZooKeeper 选主 | 由 Kafka Connect 承担 | 无内置 | 由 Flink 承担 |
| 输出 | Kafka / RocketMQ / RabbitMQ / TCP | 主要 Kafka | Kafka 等 | Flink DataStream / Table |
| **语义** | **At Least Once，需自行幂等** | 依赖 Connector + SMT | At Least Once | **Checkpoint + 两阶段提交 → Exactly-Once** |
| **Schema 演化** | 弱，需自行处理 | Avro / Protobuf + Schema Registry | 弱 | **内置自动演化** |
| 全量 + 增量衔接 | 需自行实现 | 内置初始快照衔接 | 内置 bootstrap | **增量快照：无全局锁、分块并行读** |
| 端到端延迟 | 低（直连） | 中（经 Kafka） | 低 | 中（受反压影响） |
| 国内生态 | 最广、中文资料多 | 逐渐增多 | 较少 | 大数据场景多 |

**按场景的选型结论**：

- 已有 Kafka 生态、要求多下游解耦 → **Debezium**
- 国内 Java 项目、中等规模、希望轻量快速落地 → **Canal**
- 要连 Flink 做实时清洗 / 关联 / 聚合 → **Flink CDC**
- 快速验证 → **Maxwell**

> **版本现状与趋势（面试慎答的一层）**：Canal 长期是国内 CDC 的事实标准，但它有三个结构性短板——**只支持 MySQL**、**Schema 管理弱**、**不提供 Exactly-Once**。而 Flink CDC 2.x 之后用"无锁并行快照 + Checkpoint 两阶段提交"，把全量增量衔接与精确一次都做进了框架里，同时省掉了 Kafka 中间层。**新项目如果在"CDC 只是第一步、下面还要算"的前提下，Flink CDC 通常更优；Canal 的价值集中在"只要把变更搬走、不打算引入 Flink"的场景。**

## 六、使用场景与面试问答 {#interview}

**Q1：CDC 和定时轮询的本质区别？**
轮询是**主动查询业务表**，看到的是"最终状态"，天然看不见物理删除与字段级变更，成本还随表体量增长。CDC 读的是数据库自己的变更日志（binlog），拿到的是**行级前后镜像**，能准确还原 INSERT / UPDATE / DELETE 与具体变更列，对业务库的额外压力也小得多。

**Q2：为什么 CDC 必须要求 `binlog_format = ROW`？**
`STATEMENT` 只记 SQL 文本，无法知道影响哪些行、也无法重放到异构目标；`MIXED` 由 MySQL 自行选择，行为不可预测。只有 ROW 记录的是行级物理结果，与函数、非确定性表达式无关。另外 `binlog_row_image` 必须是 `FULL`，否则 UPDATE / DELETE 事件缺少未改动列，构造不出完整行。

**Q3：Canal 的 `server_id` 为什么要唯一？**
Canal 伪装成 MySQL 从库，`server_id` 是复制拓扑里区分"每个从库"的唯一标识。若与真实从库或另一个 CDC 实例重复，MySQL 会断开其中一个连接。这是"连不上 / 连上又被踢"的常见原因。

**Q4：Canal 能保证不重复吗？为什么下游还要做幂等？**
不能。Canal 的语义是 **At Least Once**：位点在下游 ACK 之后才推进，一旦"下游写成功、ACK 前宕机"，重启后就会从旧位点重放。所以幂等必须由下游承担——目标表用主键 UPSERT，并用单调版本列防止旧事件覆盖新值。

**Q5：GTID 位点比 file + position 好在哪？**
`file + position` 绑定具体的 binlog 文件与字节偏移，主从切换、主库重建后都可能失效，位点一失效就只能重新全量。GTID 用 `server_uuid:transaction_id` 全局唯一标识事务，与文件和主库身份无关，切主后可继续续读。

**Q6：CDC 同步中最容易出生产事故的点是什么？**
**binlog 保留期短于 CDC 停机时间**——位点对应的文件被清理，只能重新全量。其次是 `server_id` 冲突、大事务打爆内存缓冲、DDL 导致下游表结构不匹配、以及长期运行后的数据漂移（必须靠每日对账发现）。

> 下一篇：[Doris 数仓](/bigdata/doris/) —— 变化的数据搬到了分析侧，接下来要解决"怎么存、怎么算才够快"，以及三种表模型该怎么选。
