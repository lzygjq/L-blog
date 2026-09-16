---
date: 2026-09-16
title: Flink SQL 与各类 Join
sidebar: Flink SQL 与 Join
desc: 为什么现在优先写 SQL、动态表与连续查询把"流"看成"不断变化的表"、changelog 的 +I/-U/+U/-D 语义、Regular/Interval/Lookup/Temporal 四种 Join 的边界与状态代价、维表缓存与命中率、窗口 TVF 与关键调优参数
order: 3
---

# Flink SQL 与各类 Join

## 一、问题场景：为什么现在先写 SQL {#why-sql}

同一个需求——"按用户统计最近 5 分钟的订单金额"——有两种写法：

**DataStream API**：定义 WatermarkStrategy、写 KeyedProcessFunction、注册定时器、自己管 ValueState、写窗口逻辑……**约 80 行**，且每一处都可能写错（`allowedLateness` 忘配、状态忘了清）。

**Flink SQL**：**约 8 行**：

```sql
SELECT user_id, window_start, window_end, sum(amount) AS amt
FROM TABLE(
  TUMBLE(TABLE orders, DESCRIPTOR(event_time), INTERVAL '5' MINUTES)
)
GROUP BY user_id, window_start, window_end;
```

这不是"少写代码"，而是**三件更实际的事**：

| 收益 | 说明 |
|---|---|
| **没有状态层面写错的空间** | 状态清理、窗口触发、迟到处理都由引擎按声明式语义实现，**你写不出漏配 `allowedLateness` 这种错** |
| **优化器自动做重排** | 谓词下推、分区裁剪、算子融合、两阶段聚合——你不需要手动调优算子的组织方式 |
| **可被平台化** | SQL 是字符串，可以被平台托管（提交、监控、血缘）。DataStream 作业是 jar，每改一次都要发版 |

**但 SQL 不是万能的**。它的代价是：**表达能力的边界更早到达**。有些逻辑（复杂的状态机、跨多流的有状态交互、自定义的定时器语义）用 SQL 会别扭甚至写不出来。这时正确的做法是 **SQL 与 DataStream 混用**（Table API 与 DataStream 之间可以互转），而不是硬凑。

> **一句判据**：**能用 SQL 表达"声明式意图"（过滤、聚合、Join、窗口）就用 SQL；一旦需要"按事件驱动自己维护一个状态机"，就回到 DataStream。**

## 二、核心心智模型：动态表与连续查询 {#dynamic-table}

### 2.1 流与表的对偶关系 {#duality}

Flink SQL 的全部设计建立在一个转换上：

```
   把「流」看成「表的变化日志」        把「查询」看成「持续更新的结果」

       流（append）                          表
    ┌────┬──────┐                     ┌──────┬──────┬──────┐
    │ t  │ 数据  │   ── 转换 ──▶       │ id   │ user │ amt  │
    ├────┼──────┤                     ├──────┼──────┼──────┤
    │ 1  │ A,10 │                     │ 1    │ A    │ 10   │   ── 每来一条流数据
    │ 2  │ B,20 │                     │ 2    │ B    │ 20   │      表就"多一行"
    │ 3  │ A,15 │                     │ 3    │ A    │ 15   │
    └────┴──────┘                     └──────┴──────┴──────┘

   反过来也成立：表的变化日志就是流（changelog）
```

于是"流处理"变成了"**对一张不断变化的表做持续查询**"：

| 概念 | 含义 |
|---|---|
| **动态表（Dynamic Table）** | 一张随时间变化的表——流是它的 changelog |
| **连续查询（Continuous Query）** | 一次查询，**永不结束**，每当输入表变化就更新结果表 |
| **结果也是动态表** | 结果表的变化日志，就是输出的流 |

**这个转换解释了一个最常见的困惑**：为什么 `SELECT count(*)` 的结果流不是 append 而是 changelog？因为计数会变——`count=1`、`count=2`……**结果是"被更新的"**，所以输出的流里必须包含"撤回旧值、插入新值"。

### 2.2 Changelog 的四种行类型 {#changelog}

Flink 用 `RowKind` 表达"这次变化是什么"，四个标记要记住：

| 标记 | 全称 | 含义 | 出现在哪 |
|---|---|---|---|
| **+I** | INSERT | 新增一行 | 所有结果流 |
| **-U** | UPDATE_BEFORE | 撤回更新前的旧值 | 有更新的结果（聚合、upsert） |
| **+U** | UPDATE_AFTER | 插入更新后的新值 | 同上 |
| **-D** | DELETE | 删除一行 | 有删除语义的输入（CDC 的删除操作） |

一次"更新"在流里长这样：

```
   上游订单 A 的金额从 10 改成 15：

      -U  (A, 10)     ← 撤回旧值
      +U  (A, 15)     ← 写入新值

   ⚠️ 注意这是「两条记录」，不是「一条记录的修改」。
      所以下游必须是能接受"撤回"的系统。
```

**这带来一个非常实际的约束**：如果下游是一个**只支持 append 的 sink**（如写普通文件、只插入的日志表），那么它**无法消费含 -U 的 changelog**。这时你有两个选择：

| 选择 | 做法 |
|---|---|
| 把 changelog 转成 append | 在结果表上套一层"只输出最终值"的 sink（如 upsert-kafka、JDBC upsert） |
| 改查询 | 用 `GROUP BY window_start, window_end` 这类**窗口聚合**——它的结果天然是 append（窗口一旦输出就是终态） |

> **这条是 Flink SQL 最实用的一个判据**：**"下游支持不支持撤回（upsert）？"** 决定了你能不能写"非窗口的聚合"。答案是否 → 必须用窗口聚合或加 upsert sink。这个问题在选表模型（Doris 的 Unique/Duplicate、Kafka 的 upsert-kafka）时会反复出现。

## 三、四种 Join 与它们的代价 {#joins}

Flink 里的"双流打宽"有四种做法，**它们的区别不在语法，在状态代价与时间语义**：

```
 ① Regular Join（双流常驻）      ② Interval Join（有界时间窗）
 ┌────────┐  ┌────────┐         ┌────────┐  ┌────────┐
 │ 流 A   │  │ 流 B   │         │ 流 A   │  │ 流 B   │
 └───┬────┘  └────┬───┘         └───┬────┘  └────┬───┘
     │ 两侧状态都**永远保留**        │ 只保留 [t-1h, t] 区间
     ▼            ▼                ▼            ▼
   ┌──────────────────┐          ┌──────────────────┐
   │  状态无限增长 ⚠️   │          │  状态按水位自动清理 │
   └──────────────────┘          └──────────────────┘

 ③ Lookup Join（维表，处理时间）  ④ Temporal Join（时态表，事件时间）
 ┌────────┐                      ┌────────┐
 │ 流 A   │──┐                   │ 流 A   │──┐
 └────────┘  │ 每条消息实时查       └────────┘  │ 按**事件时间**取版本
             ▼                                ▼
      ┌──────────────┐                ┌──────────────┐
      │ 外部系统      │                │ 版本表/维表   │
      │ (MySQL/Redis)│                │ (带主键+时间) │
      └──────────────┘                └──────────────┘
      状态在外部，Flink 只做缓存        结果与维表**当前值无关**
```

### 3.1 Regular Join：状态无限增长，必须配 TTL {#regular-join}

```sql
SELECT o.order_id, o.amount, u.level
FROM orders AS o
JOIN users AS u ON o.user_id = u.user_id;
```

**语义是 SQL 的标准语义**：任何时刻，只要 A 里有一行、B 里有一行满足条件，结果里就有一行。**这意味着两侧的数据都不能丢**——A 的每一行要等 B 未来可能的匹配，B 的每一行也要等 A。

| 后果 | 说明 |
|---|---|
| 状态**只增不减** | 两侧历史数据全部保留在状态里 |
| 结果会**先输出后撤回** | A 先到、B 后到时，`+I` 之后还会因为匹配而更新 |

**必须做的事**：给它配状态 TTL，否则跑几周就会被状态撑爆。

```sql
-- 状态保留 1 天（超过就清理，代价是"迟到的匹配会漏"）
SET 'table.exec.state.ttl' = '24h';
```

⚠️ **`table.exec.state.ttl` 是"用正确性换可用性"**：设小了会让本该匹配上的数据因为一侧被清理而匹配不上（结果少），设大了状态会涨。**这是 Regular Join 的本质困境**——所以**能用有界语义（Interval Join）就不要用 Regular Join**。

### 3.2 Interval Join：把"无界等待"变成"有界区间" {#interval-join}

```sql
SELECT o.order_id, p.pay_time
FROM orders AS o
JOIN payments AS p
  ON o.order_id = p.order_id
 AND p.pay_time BETWEEN o.order_time - INTERVAL '5' MINUTE
                    AND o.order_time + INTERVAL '30' MINUTE;
```

**语义**：同一个 key，且 B 的事件时间落在 A 的事件时间的某个区间内。业务上的对应关系很自然——"订单发生后 30 分钟内的支付"。

| 特征 | 说明 |
|---|---|
| 状态是**有界**的 | 水位超过 `A.time + 30min` 后，A 这条就可以清理了 |
| 结果**只有 +I** | 匹配是单向确定的，不产生更新 |
| 前提 | **两条流都必须有事件时间和水印** |

**判据：凡是"事件之间有明显时间关联"的场景，都该用 Interval Join 而不是 Regular Join。** 它把一个"要等到天荒地老"的 join 变成了可清理的。

### 3.3 Lookup Join：维表打宽，最常用也最容易踩坑 {#lookup-join}

```sql
-- 维表：MySQL 里的用户表（通过 JDBC connector 声明，不复制数据）
CREATE TABLE users (
  user_id BIGINT,
  level   STRING,
  PRIMARY KEY (user_id) NOT ENFORCED
) WITH (
  'connector' = 'jdbc',
  'url' = 'jdbc:mysql://mysql:3306/biz',
  'table-name' = 'users'
);

SELECT o.order_id, o.amount, u.level
FROM orders AS o
JOIN users FOR SYSTEM_TIME AS OF o.proc_time AS u      -- 处理时间语义
  ON o.user_id = u.user_id;
```

**语义关键**：`FOR SYSTEM_TIME AS OF o.proc_time` 表示"**按处理这条消息的时刻**去维表查当时的值"。所以它是**处理时间语义**——**换一天重跑，结果可能不同**（如果维表变了）。

三个必须解决的工程问题：

| 问题 | 现象 | 解法 |
|---|---|---|
| **QPS 打爆维表库** | 每条消息一次查询，下游 MySQL 直接被打满 | 开缓存（见下） |
| **缓存命中率低** | 开了缓存但没用，因为 key 太分散 | 用 `lookup.cache.max-rows` + 合理 TTL 组合，或改用**本地小维表全量加载**（`PARTIAL` 模式） |
| **维表更新不可见** | 缓存 TTL 内看不到维表的新值 | 缩 TTL（代价是 QPS 上升）或改用事件时间 Temporal Join |

**缓存的两级配置**：

```sql
'lookup.cache' = 'PARTIAL',          -- PARTIAL：只缓存查过的（LRU）；FULL：全量加载到内存
'lookup.partial-cache.max-rows' = '10000',
'lookup.partial-cache.expire-after-write-time' = '10min',
'lookup.partial-cache.cache-missing-key' = 'true',   -- ⚠️ 不缓存"查不到"，会导致不存在的 key 每次都打库
'lookup.async' = 'true'              -- 异步查询：并发发请求，别串行等
```

⚠️ **`lookup.async` 值得单独提醒**：不开异步时，lookup 是**同步阻塞**的——每条消息都要等一次网络往返。这会让 Flink 侧的吞吐直接受限于维表的 RT，**并且在上游流量突增时迅速演变成背压**（这一点在下一篇会展开）。

⚠️ **`lookup.partial-cache.cache-missing-key` 默认是 true**，但它的含义容易被误解：它是"把'查不到'也缓存起来"。当业务里存在**大量不存在的 key**（如脏数据、已删用户）时，**缓存未命中结果反而救了维表**——但代价是"维表新增了一条，缓存里仍是'查不到'"。**这是一个必须按业务决定的取舍**，不是配置越优越好。

### 3.4 Temporal Join：按事件时间取"当时的版本" {#temporal-join}

与 Lookup Join 的差别只有一处，但性质完全不同：**按左流的事件时间去维度表里找当时有效的那个版本**。

```sql
-- 维表是「版本表」：主键 + 事件时间 + 必须有 watermark
CREATE TABLE user_level_history (
  user_id BIGINT,
  level   STRING,
  update_time TIMESTAMP(3),
  WATERMARK FOR update_time AS update_time - INTERVAL '5' SECOND,
  PRIMARY KEY (user_id, update_time) NOT ENFORCED
) WITH (...);

SELECT o.order_id, o.amount, u.level
FROM orders AS o
JOIN user_level_history FOR SYSTEM_TIME AS OF o.order_time AS u
  ON o.user_id = u.user_id;
```

| | Lookup Join | Temporal Join（事件时间） |
|---|---|---|
| 时间语义 | **处理时间** | **事件时间** |
| 维表来源 | 外部系统（JDBC/HBase/Redis） | 需要是**版本表**（含时间与主键的 changelog 流） |
| 结果可重放 | ❌ 维表变了结果就变 | ✅ **与维表当前值无关** |
| 典型用途 | 补当前维表属性（名称、类目） | **对账、回溯、口径需要可复现的场景** |

> **判据**：**"这个结果明天重跑，应该还是一样的吗？"** 应该一样 → Temporal Join；"用最新的就行" → Lookup Join。结算、对账、审计类场景必须用 Temporal Join。

### 3.5 四种 Join 的总对照 {#join-compare}

| Join 类型 | 时间语义 | 状态代价 | 结果类型 | 该不该用 |
|---|---|---|---|---|
| Regular Join | 无（永不过期） | **无限增长**，必须配 TTL | changelog（含 -U） | 尽量不用；没有时间关联时才会用到 |
| Interval Join | 事件时间 | **有界**（按区间清理） | append（仅 +I） | **首选**（存在时间关联时） |
| Lookup Join | 处理时间 | 在外部，Flink 侧只有缓存 | append | 补当前维表属性 |
| Temporal Join | 事件时间 | 需要版本表状态 | append | **结果需可重放时** |

## 四、窗口 TVF：新的窗口写法 {#window-tvf}

Flink 1.13 起引入**窗口表值函数（TVF）**，取代了老式的 `GROUP BY TUMBLE(...)` 写法。**新代码应该一律用 TVF**。

```sql
-- 滚动窗口
SELECT window_start, window_end, user_id, sum(amount) AS amt
FROM TABLE(TUMBLE(TABLE orders, DESCRIPTOR(event_time), INTERVAL '5' MINUTES))
GROUP BY window_start, window_end, user_id;

-- 滑动窗口（size=1h, slide=10min）
FROM TABLE(HOP(TABLE orders, DESCRIPTOR(event_time), INTERVAL '10' MINUTES, INTERVAL '1' HOUR))

-- 累计窗口（一天内每小时累计）
FROM TABLE(CUMULATE(TABLE orders, DESCRIPTOR(event_time), INTERVAL '1' HOUR, INTERVAL '1' DAY))
```

TVF 相比老写法的三个好处：

| 好处 | 说明 |
|---|---|
| 窗口的 `start` / `end` **成为真实列** | 可以 `SELECT` 出来、可以 `GROUP BY`、可以 `WHERE` 过滤 |
| 可以**再套一层** | TVF 的输出是表，可继续聚合、Join（老写法做不到） |
| 支持 **`window_time`** | 可以按窗口时间再做后续窗口运算 |

⚠️ **`CUMULATE` 的一个反直觉点**：它会在**每个 step 都输出一次**（1h 出一次、2h 出一次……）。所以它产生的是**更新流**（同一个窗口不断被更新），不是 append。若要写进只支持 append 的表，需要再处理。

## 五、关键调优参数 {#tuning-sql}

SQL 作业的调优不同于 DataStream——**多数问题在优化器开关上**：

| 参数 | 作用 | 代价 |
|---|---|---|
| `table.exec.state.ttl` | 状态的存活时间 | 设小了会漏匹配、结果不准 |
| `table.exec.mini-batch.enabled` | **攒一批再算**，减少状态访问次数 | 延迟增加（批大小对应的时间） |
| `table.exec.mini-batch.size` | 一批多少条 | 同上 |
| `table.optimizer.agg-phase-strategy` | `TWO_PHASE`：本地预聚合 + 全局聚合 | 解决 group by 热点 key |
| `table.exec.async-state.enabled` | **Flink 2.0**：异步状态访问 | 仅对有状态算子、需要缓存配合 |
| `table.local-time-zone` | SQL 里的时区 | 设错会导致窗口边界整体偏移 |

**两个最值得记的**：

**① mini-batch 是"吞吐换延迟"的标准开关**：

```sql
SET 'table.exec.mini-batch.enabled' = 'true';
SET 'table.exec.mini-batch.allow-latency' = '5s';   -- 最多等 5 秒攒一批
SET 'table.exec.mini-batch.size' = '5000';          -- 或攒到 5000 条
```

它把"每条数据都读写一次状态"改成"一批数据合并后读写一次状态"。**代价是每个聚合结果最多延迟 5 秒**。对"状态访问是瓶颈"的作业，收益通常在数倍。

**② 时区坑（最容易造成"窗口结果整体差 8 小时"）**：

| 类型 | 含义 | 需要搭配 |
|---|---|---|
| `TIMESTAMP` | 不带时区的"墙上时间" | `table.local-time-zone` 一起理解 |
| `TIMESTAMP_LTZ` | 带时区的瞬时时刻 | **更适合作事件时间**（跨时区不歧义） |

```sql
SET 'table.local-time-zone' = 'Asia/Shanghai';
```

**排查判据**：如果窗口结果**正好差了整数小时**（8 小时最常见），先怀疑时区，不要去查水印。

## 六、版本现状：Flink 2.0 带来的变化 {#version}

| 变化 | 说明 |
|---|---|
| **物化表（Materialized Table）** | 声明式地"要什么数据、多新"，由系统决定用流还是批刷新。**Flink 2.0 起生产可用** |
| 物化表的存储限制 | 首个也是目前唯一支持的 Catalog 是 **Paimon**——存储不是 Paimon 就要先评估改造 |
| SQL 语法增强（2.3） | 新增 `QUALIFY` 子句（对窗口函数结果过滤）、C 风格转义字符串、表函数可直接写在 `FROM` 中 |
| SQL Gateway | 支持 Application 模式（接替被移除的 per-job 模式） |
| **1.x → 2.x 不保证状态兼容** | 见上一篇 |
| DataStream V2 API | 仍**标注为实验性**，不建议生产使用 |

物化表的写法（声明"新鲜度"，引擎自己选流/批）：

```sql
CREATE MATERIALIZED TABLE dwd_order_agg
PARTITIONED BY (dt)
FRESHNESS = INTERVAL '10' MINUTE
AS SELECT user_id, count(*) AS order_cnt, sum(amount) AS amount
   FROM ods_order GROUP BY user_id;
```

它的价值是**把"流批两套代码"合并成一张表**——同一份逻辑，历史用批、增量用流。代价是绑定了 Paimon。

## 七、对比辨析 {#compare}

### 7.1 SQL 与 DataStream 该怎么分工 {#vs-datastream}

| 场景 | 选择 |
|---|---|
| 过滤、聚合、窗口、Join、简单 ETL | **SQL**（优化器帮你做掉大部分调优） |
| 复杂状态机、跨流的有状态交互、自定义定时器 | **DataStream** |
| 需要 UDF 里的复杂逻辑 | SQL + UDF（注意 UDF 不能访问状态） |
| 已有 DataStream 作业想加 SQL 逻辑 | 混用（`toChangelogStream` / `fromChangelogStream` 互转） |

### 7.2 "结果里出现了撤回标记，下游不认"怎么处理 {#vs-changelog-sink}

三种解法，按优先级：

| 解法 | 做法 | 适用 |
|---|---|---|
| 换成 append-only 的查询 | 用窗口聚合（窗口结果是终态） | 需求本身是"按段统计" |
| 换成支持 upsert 的 sink | `upsert-kafka`、JDBC（带主键）、Doris Unique 模型 | 需求是"维护一张最新的宽表" |
| 在下游做去重 | 让下游按主键覆盖 | 下游本来就支持 upsert |

**不要做的是**：在中间加一层"把 changelog 转成 append"的自定义逻辑——那要自己维护一份状态，等于把引擎已经做好的事重做一遍。

## 八、使用场景与面试问答 {#interview}

**Q1：SQL 和 DataStream 怎么选？**

先用 SQL：过滤/聚合/窗口/Join 这类声明式逻辑，优化器会替你处理谓词下推、算子融合、两阶段聚合，而且**写不出漏配状态清理这类的错**。一旦需要"按事件驱动维护一个自己的状态机"（复杂事件处理、多流有状态交互、自定义定时器语义），就回到 DataStream。**两者可以混用**，不必二选一。

另一边，SQL 的代价是**表达边界更早到达**，而且**行为依赖优化器版本**——升级 Flink 时 SQL 作业的执行计划可能变化，这一点在做升级评估时必须考虑。

**Q2：为什么 `count(*)` 的结果流不是 append 的？**

因为结果是**动态表**：计数会随新数据变化。结果表的一次变化要表达成"撤回旧值 + 插入新值"（`-U` / `+U`），所以输出是 changelog 而不是 append。**判断方法：问"同一行的值会不会被更新"**——会，就是 changelog。

**Q3：Regular Join 和 Interval Join 的本质区别？**

**状态有没有下界。** Regular Join 是标准 SQL 语义——任何时刻只要两侧有匹配的行就输出，这意味着**两侧的数据都不能丢**，状态只增不减（必须配 `table.exec.state.ttl`）。Interval Join 给匹配加了一个**事件时间区间**（如 `[t-5min, t+30min]`），水位越过区间上界后数据就可以清理，**状态有界**。所以**凡是有时间关联的场景，都该用 Interval Join**。

**Q4：Lookup Join 和 Temporal Join 怎么选？**

问一句"**这个结果明天重跑，应该还是一样的吗**"。Lookup Join 是处理时间语义——按"处理这条消息的时刻"查维表的当前值，**维表变了结果就变、不可重放**。Temporal Join 是事件时间语义——按左流的事件时间去版本表里找当时有效的版本，**与维表当前值无关、可重放**。结算/对账/审计必须用 Temporal Join。

**Q5：维表 Join 把 MySQL 打爆了怎么办？**

四步，按优先级：① 开缓存（`lookup.cache` = `PARTIAL` + 合理 TTL；维表小且变化少可用 `FULL` 全量加载）；② 开 `lookup.async`，把串行等待改成并发；③ 检查 `cache-missing-key`——"查不到"是否被缓存，取决于业务里不存在 key 的比例；④ 都不够就**改架构**：把维表同步到 Redis/HBase 这类高 QPS 系统，或者把维表变成流做 Temporal Join（状态在 Flink 侧，不打外部库）。

**Q6：`table.exec.mini-batch` 是干什么的？代价是什么？**

把"每条数据都读写一次状态"改成"攒一批合并后读写一次状态"，用于降低状态访问次数。代价是**聚合结果最多延迟 `allow-latency` 那么久**。它是"吞吐换延迟"的典型开关，对状态访问密集的聚合作业收益显著。

**Q7：窗口结果差了整整 8 小时，怎么排查？**

**先查时区，不要查水印**——"差整数小时"是时区问题的指纹。检查 `table.local-time-zone` 的设置，以及事件时间字段用的是 `TIMESTAMP`（无时区的墙上时间）还是 `TIMESTAMP_LTZ`（带时区的瞬时时刻）。**跨时区场景优先用 `TIMESTAMP_LTZ` 作事件时间**，避免歧义。

---

**上一篇**：[状态、检查点与端到端一致](/bigdata/flink/state-and-checkpoint)　**下一篇**：[部署、背压与调优](/bigdata/flink/backpressure-and-tuning) —— 逻辑写对了，接下来是**让它稳定跑住**。
