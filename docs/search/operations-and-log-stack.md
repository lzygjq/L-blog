---
order: 5
date: 2026-09-16
title: 运维、调优与日志检索栈
sidebar: 运维、调优与日志检索栈
desc: 堆不要超过 31GB 的指针压缩原因与 Lucene 吃 page cache 的分工、「一半给堆、一半留给文件缓存」的由来、集群健康三色与必看监控指标、查询慢的六类原因与排查顺序、MySQL 到 ES 的三种同步方式与一致性、ELK 日志栈的完整链路、ILM 生命周期与冷热分层、与 Doris 倒排索引的边界
---

# 运维、调优与日志检索栈：内存要分对，指标要盯对

> 上一篇：[分片、路由与深分页](/search/sharding-and-scale)　|　导览：[搜索与检索](/search/)

前四篇讲机制，这一篇收口到"怎么让它稳定跑在生产"。核心只有两件事：**内存怎么分**（ES 的性能几乎完全由内存布局决定）、**问题怎么看**（哪些指标能在出事前报警）。最后把 ES 放回整个数据链路里——它是 MySQL 的从属视图，也是日志栈的存储端。

## 一、内存怎么分：为什么堆不要超过 31GB {#memory}

ES 的内存分配有一条著名规则：

> **JVM 堆不要超过物理内存的一半，且绝对值不要超过约 31GB。**

两个约束各有独立的原因，缺一个都会让人做出错误的配置。

### 约束一：50% 是对半砍，剩下那一半给"文件缓存"

ES 的读取路径不只有堆：

```text
ES 进程内存
├── JVM 堆              ← 文档、聚合中间结果、协调节点归并、query cache
└── Lucene（堆外）       ← segment 文件 通过 mmap 读，靠 OS page cache 加速
```

**Lucene 的段文件是"不可变文件"，读取走文件系统缓存（page cache）**，这部分**不在 JVM 堆里**。如果堆吃了一整台机器的内存，page cache 就没空间了——**磁盘 IO 立刻成为瓶颈，表现为"CPU 不高、堆没满，但查询很慢"**。

所以"堆 = 物理内存的一半"是为了**另一半留给操作系统做文件缓存**：

| 机器规格 | 推荐堆 | 留给 page cache |
|---|---|---|
| 16GB | ≤ 8GB | 8GB |
| 32GB | ≤ 16GB | 16GB |
| 64GB | **约 31GB**（不是 32GB） | 33GB |
| 128GB | **约 31GB** | 97GB |

### 约束二：31GB 是"指针压缩"的边界

HotSpot 有一个优化：在堆小于约 32GB 时，对象指针可以用 **32 位压缩表示**（Compressed OOP），实际寻址能力靠"8 字节对齐"放大到 32GB。

一旦堆超过这个边界，指针恢复成 64 位：

```text
堆 31GB（指针压缩开启） → 对象头与引用都用 4 字节 → 能装更多对象、cache 命中率更高
堆 33GB（指针压缩关闭） → 每个引用变 8 字节 → 有效容量可能反而比 31GB 更少
```

**所以 32GB 到 40GB 之间的堆是"越加越差"的区间**——多给的内存被指针膨胀吃掉了，还失去了 page cache。**这是一个典型的"参数不是单调的"案例**，与 JVM 指针压缩的其它影响可对照[JVM 调优](/java/jvm/tuning)。

### 三条相关配置

| 配置 | 作用 | 建议 |
|---|---|---|
| `-Xms` = `-Xmx` | 避免堆动态伸缩带来的停顿 | **两者设成相同值** |
| `bootstrap.memory_lock: true` | 锁定堆内存，**防止被换出到 swap** | **生产必开**（swap 会让 ES 延迟飙到秒级） |
| `-XX:+UseG1GC`（JDK 默认） | GC 收集器 | 保持默认，ES 对 G1 有针对性优化 |

```yaml
# jvm.options
-Xms16g
-Xmx16g
```

```bash
# 确认内存锁定生效（会看到 mlockall 调用）
GET _nodes/stats/process?filter_path=**.mlockall
```

> **`mlockall: false` 是一个高危信号**——说明内存锁定失败（常见原因：`ulimit -l` 限制、容器权限不足）。它意味着**高峰期 ES 可能被换出到 swap**，一次查询从毫秒变成秒。这与容器 OOMKilled 那类问题的排查思路相通（见[微服务 → K8s 云原生演进](/projects/property-saas/microservice-to-k8s/)）。

## 二、集群健康与必看监控指标 {#monitoring}

### 健康三色的真实含义

| 颜色 | 含义 | 严重性 |
|---|---|---|
| **`green`** | 所有主分片与副本分片都已分配 | 正常 |
| **`yellow`** | **所有主分片已分配，但有副本未分配** | **数据没丢，但容错能力下降**——常被忽略，最危险 |
| **`red`** | **有主分片未分配** | **数据不可用**（该分片的查询/写入会失败） |

**`yellow` 必须被当成告警而不是"还行"**：单节点集群天然是 `yellow`（副本无法与主分片分离），这在开发环境正常，**但在生产意味着"再挂一台就 red"**。

### 必看的七类指标

| 类别 | 关键指标 | 为什么重要 |
|---|---|---|
| **集群状态** | `_cluster/health` 的 `status`、`unassigned_shards` | 未分配分片数是趋势性指标，持续上涨必有问题 |
| **线程池拒绝** | `thread_pool.search.rejected`、`thread_pool.write.rejected` | **最直接的过载信号**——出现即说明请求速度超过集群吸收能力 |
| **JVM** | `jvm.mem.heap_used_percent`、**`jvm.gc.collectors.old.collection_time_in_millis`** | **Old GC 时间持续上涨 = 有内存压力**；配合 [GC 日志判读](/java/jvm/troubleshooting-cli) |
| **磁盘** | 各节点 `disk.available_percent` | **默认 `low watermark` 85% / `high` 90%**：超过后 ES 会**停止分配分片**、甚至把索引设为只读（`index.blocks.read_only_allow_delete`） |
| **分片** | `_cat/shards` 的状态、节点分片数分布 | 分片在节点间**严重不均**会导致热点 |
| **段与合并** | `segments.count`、`segments.merge_time` | 段数持续增长说明合并跟不上；**merge 抢 IO 是"查询无故变慢"的常见原因** |
| **查询** | `indices.search.query_time_in_millis`、`fetch_time` | 区分"算得慢"（query）与"取文档慢"（fetch） |

**区分 query 慢还是 fetch 慢，是一个很有价值的判据：**

```text
query_time 高，fetch_time 低  → 检索/过滤/算分慢  → 看查询写法（filter 上下文、聚合）
query_time 低，fetch_time 高  → 取文档/反序列化慢 → 看 _source 是否返回了整条宽文档、字段是否过多
两者都高                      → 看分片数与集群资源（扇出过大）
```

> **`_source` 的取舍值得单独说**：默认 `_source` 存**整个原始 JSON**。它带来两个好处（可 reindex、可局部更新）和一个代价（**存储翻倍、fetch 慢**）。如果某字段只是用来存、不需要被搜索也不需要被返回原始值，可以用 **`"doc_values": false` + `"_source": {"excludes": [...]}`** 收窄。**但要注意：一旦关闭 `_source`，就无法 reindex 与局部更新了**——这是一个不可逆的取舍。

## 三、查询慢：六类原因与排查顺序 {#slow-query}

按"命中概率 × 修改成本"排序，**能从下往上排除**：

```text
① 数据量是否异常？
   GET /index/_count
   └─ 文档数暴增（如 CDC 重复同步、双写失败重放）→ 先修数据管道
② 是不是深分页？
   from + size > 1000 就要怀疑 → 改 search_after
③ 是不是聚合太重？
   terms 聚合在高基数字段、size 设得过大、嵌套聚合层数多 → 收窄或改走数仓
④ 是不是没走 filter？
   筛选条件写在 must 里 → 移到 filter（可缓存，常见收益 30%~70%）
⑤ 是不是查询写法有问题？
   wildcard 通配、regexp、script、terms 里塞几万 ID → 改 ngram / 改设计
⑥ 是不是集群资源问题？
   thread_pool 拒绝数、merge 抢 IO、磁盘 watermark、分片倾斜 → 扩节点 / 限速 / 再平衡
```

**用 `profile` API 精确定位**（它会给出每个子查询的耗时与命中文档数）：

```json
POST /product/_search
{ "profile": true,
  "query": { "bool": { "must": [ { "match": { "title": "手机" } } ] } } }
```

**用慢查询日志做长期观测**（这是最被低估的手段）：

```yaml
# elasticsearch.yml
index.search.slowlog.threshold.query.warn:  10s
index.search.slowlog.threshold.fetch.warn:  1s
# 索引级也可以动态改
```

```bash
PUT /product/_settings
{ "index.search.slowlog.threshold.query.warn": "2s",
  "index.search.slowlog.threshold.query.info": "500ms" }
```

> **慢日志的价值在于"发现你不知道自己慢的查询"**——线上最常见的性能问题不是"某个查询很慢"，而是"某个查询在特定参数下（大日期范围、空关键词、超深分页）退化成全扫"，平时测不出来。**这与 MySQL 慢查询的定位思路完全一致**（见[慢查询定位](/database/mysql/diagnosis)）。

## 四、数据同步：MySQL → ES 的三种方式 {#sync}

**ES 几乎从不做唯一数据源**，所以"数据怎么从 MySQL 同步过来"是一个绕不开的工程问题。

| 方式 | 做法 | 一致性 | 适用 |
|---|---|---|---|
| **业务双写** | 在业务代码里"写库 + 写 ES" | ⚠️ 弱（两次写入不在一个事务里） | 写入量小、要求简单 |
| **MQ 异步（发件箱 + 消费者）** | 写库与发消息同事务（发件箱）→ 消费者投递 ES | 最终一致，**可重放** | **推荐**的主流方案 |
| **CDC（Canal / Flink CDC）** | 订阅 binlog → 投递 ES | 最终一致，**对业务零侵入** | 已有数据 + 持续增量 |

**双写为什么危险，必须说清：**

```text
写库成功 → 写 ES 失败 → 数据不一致（ES 里没有这条）
   · 补不补？怎么补？无从下手——因为没有任何"待补偿"的记录
```

**双写的致命点是"没有可重放的载体"**。而 MQ / CDC 方案天然带这个载体：消息/位点在，就能重放。

**发件箱方案与 CDC 的分工**（见[事件驱动与 CQRS](/methodology/event-driven-cqrs)）：

| | 发件箱 + MQ | CDC |
|---|---|---|
| 侵入性 | 需要改业务代码（写发件箱表） | **零侵入**（读 binlog） |
| 优点 | **领域语义清晰**（发的是"领域事件"，不是"行变化"） | 上线快、覆盖已有数据 |
| 缺点 | 需要业务配合 | **只能发"行级变化"**，缺业务语义；表结构变化要跟着改 |
| 选型 | **业务事件为主**（订单已支付、库存已锁定） | **数据镜像为主**（把表同步成 ES 索引） |

**同步链路里三个必做的一致性措施：**

**① 用外部版本号做幂等与防乱序**

```json
PUT /product/_doc/1001?version=1758000000000&version_type=external
```

**用 MySQL 的 `update_time`（转成毫秒时间戳）作为外部版本号**：后到的旧数据会被自动拒绝。**这一招同时解决了"重复投递"和"乱序投递"两个问题**（机制见[写入链路的并发控制](/search/write-and-read#concurrency)）。

**② 必须有一条"对账"链路**

同步一定会漏（消息丢了、消费者挂了、reindex 中断）。**定期比对"MySQL 行数/时间戳"与"ES 文档数/时间戳"**，把差异找出来补偿。**没有对账的同步，等于把数据不一致变成"哪天有人搜不到再修"**。

**③ 同步延迟要作为监控指标**

`sync_lag`（binlog 位点落后时间 / MQ 堆积量）必须报警——**它同时是"数据管道健康度"和"用户感知到的搜索新鲜度"**。

## 五、ELK 日志检索栈 {#elk}

ES 的另一半主战场是日志。标准链路是：

```text
应用（结构化 JSON 日志 → stdout）
  │
  ▼
采集（Filebeat DaemonSet / Fluent Bit）        ← 每个节点一个，轻量
  │
  ▼
缓冲（Kafka 或 Logstash）                      ← 削峰的关键层
  │
  ├─ Logstash：解析、转换、富化（grok、geoip）    ← 重，但表达力强
  └─ Kafka：只管缓冲与解耦                       ← 日志量大时更稳
  │
  ▼
ES（按天/按 ILM 滚动的索引）
  │
  ▼
Kibana（检索、可视化、告警）
```

**每一层的取舍：**

| 层 | 关键决策 | 判据 |
|---|---|---|
| **采集** | Filebeat（轻）vs Fluent Bit（更轻、云原生） | 容器环境优先 DaemonSet 采集 stdout，**不在应用里写文件** |
| **缓冲** | **要不要 Kafka** | **日志峰值远超 ES 写入能力时必须加**。没有缓冲，采集端会把压力直接压给 ES，导致 `write.rejected` 雪崩 |
| **解析** | 在 Logstash 解析 vs 在 ES ingest pipeline 解析 | 解析规则变动频繁时放 ingest pipeline（改配置不用重启） |
| **存储** | 索引按天 / 按大小滚动 | 按天最直观，配合 ILM 自动管理 |
| **可视化** | Kibana / Grafana | 日志用 Kibana，**指标用 Prometheus + Grafana**（两边定位不同） |

**日志要能回答问题，前提是结构化。** 三条纪律（与[监控与可观测](/cloud-native/observability/#logging)的分工是"链路 vs 存储端"）：

| 纪律 | 做法 |
|---|---|
| **统一字段** | `@timestamp` / `level` / `service` / `traceId` / `message` —— **`traceId` 是跨服务串联的唯一钥匙** |
| **不解析即不索引** | 日志 message 不要做全文分词（`"index": false` 或 `keyword`），**日志检索靠字段过滤，不靠全文搜** |
| **控制量** | 全量日志的成本通常高于指标与链路的总和；采样 + 保留期是必需手段 |

> **`traceId` 与 [链路追踪](/java/spring/spring-cloud/tracing) 的配合**：链路系统告诉你"哪个 span 慢"，日志系统告诉你"那个时刻发生了什么"。**只上其中一个，排障时都要来回问人。** ES 也常被用作链路数据的存储后端。

## 六、ILM：索引生命周期与冷热分层 {#ilm}

日志/时序数据的访问特征很明确：**新数据被频繁查，老数据几乎不查**。ILM（Index Lifecycle Management）就是把这件事自动化：

```text
Hot  （热）  ← 正在写入，SSD，副本多，refresh 频繁（1s）
  ↓  达到一定大小/时长
Warm （温）  ← 只读，SSD/机械盘，段可 force merge，副本减到 1
  ↓  30 天
Cold （冷）  ← 只读，机械盘，可搜索但慢
  ↓  90 天
Delete      ← 直接删除（或归档到对象存储）
```

```json
PUT _ilm/policy/logs_policy
{
  "policy": {
    "phases": {
      "hot":  { "actions": { "rollover": { "max_size": "30gb", "max_age": "1d" } } },
      "warm": { "min_age": "3d",  "actions": { "forcemerge": { "max_num_segments": 1 },
                                               "shrink": { "number_of_shards": 1 },
                                               "allocate": { "number_of_replicas": 1 } } },
      "cold": { "min_age": "30d", "actions": { "allocate": { "require": { "data": "cold" } } } },
      "delete": { "min_age": "90d", "actions": { "delete": {} } }
    }
  }
}
```

**四个要点：**

| 要点 | 说明 |
|---|---|
| **`rollover` 靠"写别名"实现** | 应用往别名 `logs-write` 写，ILM 滚动时新建索引并切换别名指向——**业务无感** |
| **`forcemerge` 只在只读阶段做** | 这与前文的"force merge 不是在线调优手段"是同一条纪律（见[段合并](/search/write-and-read#merge)） |
| **`shrink` 可以减少分片数** | 冷数据分片太碎时合并分片，降低集群元数据开销 |
| **冷热分层靠**`node.attr` **打标签 + `allocate` 路由** | 机械盘节点打 `data: cold`，热数据在 SSD 节点上 |

## 七、与 Doris 倒排索引的边界（本板块收口） {#boundary}

本板块反复提到 Doris。这里把边界一次性划清——**这是一个很值钱的架构判断，也是最容易被"再上一套系统"的冲动带偏的地方**：

| 能力 | ES | Doris（3.1+ 倒排索引） |
|---|---|---|
| 全文检索 | ✅ 强 | ✅ 可以（IK / ICU / Basic 分词） |
| **相关性排序（BM25 等）** | ✅ **核心能力** | ❌ **不做复杂相关性排序** |
| 大规模多维聚合 | ⚠️ 能做但受桶数/基数额限制 | ✅ **列存 + MPP，为聚合而生** |
| 日志检索 | ✅ 传统方案，成本高 | ✅ **可替代，省掉一个组件** |
| 事务 / 唯一数据源 | ❌ | ⚠️ 支持部分（主键模型 upsert） |
| 运维复杂度 | 中高（分片、段合并、JVM 内存） | 中（FE/BE 分离，无 JVM 段合并压力） |

**判断口径压缩成一句话：**

> **要看"搜索结果的相关性排序"吗？**
> - **要** → ES（或 ES 出 ID + 别的引擎做聚合）
> - **不要，只要能按条件筛 + 全文匹配 + 聚合** → **Doris 倒排索引可能就够了，省一个组件**

**三条具体的选型结论：**

| 场景 | 选择 |
|---|---|
| 电商商品搜索（用户需要"最相关"在前） | **ES** |
| 日志检索（量极大、只要"筛出相关日志"） | **Doris 或 ES**（按量与成本定，Doris 通常更省） |
| 既要做商品搜索又要做经营报表 | **ES 负责检索，Doris 负责报表**（CDC 双投或 ES 回查） |

完整取舍见 [Doris · 四类索引](/bigdata/doris/#indexes) 与 [数仓方案选型](/projects/property-saas/data-warehouse/)。

## 八、生产事故清单：这七件事最容易翻车 {#incidents}

| 事故 | 根因 | 预防 |
|---|---|---|
| **写入被拒（`es_rejected_execution_exception`）** | 写入速度超过集群吸收能力，队列满 | 监控 `thread_pool.write.rejected`；加 Kafka 缓冲层；**不要盲目重试** |
| **磁盘水位触发只读** | 磁盘 > 95%，ES 自动设 `read_only_allow_delete` | 监控磁盘水位；配置 ILM 自动滚动删除 |
| **堆 OOM** | 开了 `fielddata`、聚合中间结果过大、分片数过多 | 禁用 `fielddata`；控制聚合 size；堆不超 31GB |
| **ES 被 swap 换出，延迟飙到秒级** | `memory_lock` 未生效或内存不足 | 检查 `mlockall: true`；堆 ≤ 物理内存一半 |
| **`yellow` 长期不恢复** | 副本无法分配（节点数不足） | 单节点集群应显式设 `number_of_replicas: 0`；生产至少 2 节点 |
| **脑裂/反复选主** | master 混跑数据角色、网络抖动、GC 长停顿 | 3 个专用 master；`cluster.initial_master_nodes` 只在首次配置 |
| **搜索数据"少了"** | 同步链路漏数据（消息丢、消费失败、reindex 中断） | **对账 + 同步延迟监控**；外部版本号幂等 |

> **最后一条最值得强调**：ES 里的数据问题，**很少是 ES 的问题**。它几乎总是"上游同步链路"或"查询写法"的问题。**所以排查顺序永远是：`_count` 对不对（数据有没有）→ `_analyze` 对不对（词切得对不）→ `profile` 慢在哪（查询写法）→ 才轮到集群资源。**

## 九、面试问答 {#interview}

| # | 高频问法 | 一句话答案 | 出处 |
|---|---|---|---|
| 1 | "ES 堆内存怎么设？" | **不超过物理内存一半，且约不超 31GB**：一半留给 OS page cache（Lucene 段靠它读），31GB 是**指针压缩**的边界（超过后引用膨胀，有效容量反而变小） | [内存怎么分](#memory) |
| 2 | "为什么堆不是越大约好？" | 32~40GB 是"越加越差"的区间：指针压缩关闭让每个引用多占 4 字节，同时挤掉了 page cache，磁盘 IO 成为瓶颈 | [内存怎么分](#memory) |
| 3 | "`bootstrap.memory_lock` 是干什么的？" | 锁定堆内存**防止被换出到 swap**——被换出会让延迟从毫秒变秒级。生产必开，`mlockall: false` 是高危信号 | [内存怎么分](#memory) |
| 4 | "`green` / `yellow` / `red` 分别代表什么？" | `green` 主副本全分配；`yellow` **主分片全在但副本未分配**（数据没丢、容错下降）；`red` **有主分片未分配**（数据不可用） | [集群健康](#monitoring) |
| 5 | "集群是 `yellow` 要紧吗？" | 要紧。**生产 `yellow` 意味着"再挂一台就 red"**；单节点集群天然 yellow，应显式把副本设为 0 | [集群健康](#monitoring) |
| 6 | "怎么判断 ES 是否过载？" | 看 **`thread_pool.write/search.rejected`**——出现即说明请求速度超过吸收能力。此时应降速/扩容，**重试会雪崩** | [监控指标](#monitoring) |
| 7 | "查询慢怎么排查？" | 顺序：① `_count` 看数据量异常 → ② 是否深分页 → ③ 聚合是否过重 → ④ 筛选是否走了 `filter` → ⑤ 查询写法（wildcard/script） → ⑥ 集群资源（rejected / merge / 磁盘水位） | [查询慢](#slow-query) |
| 8 | "怎么精确定位查询慢在哪？" | 用 **`profile: true`**（列出每个子查询耗时）；长期观测用**慢查询日志**（能发现"特定参数下退化"的查询） | [查询慢](#slow-query) |
| 9 | "`query_time` 高和 `fetch_time` 高分别说明什么？" | `query_time` 高 = 检索/过滤/算分慢（看查询写法）；`fetch_time` 高 = 取文档/反序列化慢（看 `_source` 与字段数） | [监控指标](#monitoring) |
| 10 | "MySQL 数据怎么同步到 ES？" | 三种：**双写**（弱一致、不可补偿）、**MQ 异步**（推荐，可重放）、**CDC**（零侵入，但只有行级语义）。**双写的致命问题是"没有可重放的载体"** | [数据同步](#sync) |
| 11 | "同步怎么保证幂等和防乱序？" | 用 MySQL 的 `update_time` 当**外部版本号**（`version_type=external`），后到的旧数据自动被拒绝——一招同时解决重复与乱序 | [数据同步](#sync) |
| 12 | "同步的数据不一致怎么发现？" | **必须有对账链路**（比对行数与时间戳）+ **同步延迟监控**（binlog 位点落后 / MQ 堆积）。没有对账等于把问题留给用户发现 | [数据同步](#sync) |
| 13 | "ELK 里为什么常加 Kafka 层？" | **削峰与解耦**：日志峰值远超 ES 写入能力，没有缓冲采集端会直接把压力压给 ES，触发 `write.rejected` 雪崩 | [ELK 栈](#elk) |
| 14 | "日志检索为什么要结构化？" | 日志检索靠**字段过滤**而不靠全文搜；统一 `timestamp/level/service/traceId/message` 才能被机器解析与跨服务关联 | [ELK 栈](#elk) |
| 15 | "日志的 `message` 字段该建什么类型？" | **不做全文分词**（`index: false` 或 `keyword`）——日志量大、message 是高基数长文本，分词会让索引急剧膨胀且几乎无用 | [ELK 栈](#elk) |
| 16 | "ILM 是什么？怎么用？" | 索引生命周期管理：**Hot → Warm → Cold → Delete** 自动滚动；靠 `rollover` 写别名实现业务无感，`forcemerge` 只在只读阶段做 | [ILM](#ilm) |
| 17 | "ES 能做数据报表吗？" | 能但不擅长：受 `terms` 桶数、`cardinality` 近似、高基数限制；**亿级多维聚合应交给 Doris** | [与 Doris 的边界](#boundary) |
| 18 | "什么情况下不需要 ES？" | 只需要"按条件筛 + 全文匹配 + 聚合"、**不需要相关性排序**时，**Doris 的倒排索引可能就够了**，省掉一个组件与一套运维 | [与 Doris 的边界](#boundary) |
| 19 | "ES 磁盘满了会怎样？" | 超过 `high watermark`（默认 90%）会**停止分配分片**；超过 `flood`（95%）会把索引设成 **只读**（需手工解 `read_only_allow_delete`） | [事故清单](#incidents) |
| 20 | "ES 里的数据对不上，先查什么？" | **先怀疑上游**：`_count` 看数据有没有进来（同步链路）→ `_analyze` 看词切得对不对 → `profile` 看查询写法 → 最后才是集群资源 | [事故清单](#incidents) |

> **本篇是这个板块的第 5 篇，也是收尾篇。** 五篇的完整主线是：**词怎么切（倒排与分词）→ 怎么写进去（写入与近实时）→ 怎么问（DSL 与算分）→ 分布式多出什么代价（分片与分页）→ 怎么让它稳（内存、指标、同步、日志栈）。** 与 [Doris 数仓](/bigdata/doris/)、[监控与可观测](/cloud-native/observability/)、[Canal 数据同步](/bigdata/canal/) 三处交叉引用而不复制正文。
