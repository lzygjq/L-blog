---
order: 4
date: 2026-09-14
title: 慢查询定位与 SQL 优化
desc: 从 APM 到慢日志再到 EXPLAIN 的三级定位法、EXPLAIN 字段速查与 type 性能全序、表设计与 Join 优化清单
---

# 慢查询定位与 SQL 优化

## 一、问题场景

压测报出某个接口 P99 是 **5 秒**。这时候最怕的反应是"我看看代码"——5 秒的耗时可能来自下游 RPC、GC、锁等待，也可能来自 SQL。

**正确的顺序是：先定位到"是不是 SQL"，再定位到"是哪条 SQL"，最后定位到"为什么慢"。** 三级递进，每一级都用一个明确的工具产出确定的结论，不靠猜。

```
① 是哪个接口慢？          → APM / 监控（Skywalking、Prometheus、Arthas）
        ↓ 确认是 SQL 耗时占比高
② 是哪条 SQL 慢？         → 慢查询日志（long_query_time 阈值）
        ↓ 拿到具体 SQL
③ 这条 SQL 为什么慢？     → EXPLAIN 执行计划（key / type / Extra）
        ↓ 定位到根因
④ 怎么改？                → 加索引 / 改写法 / 改表结构 / 改架构
```

## 二、第一级：先确认是不是 SQL 的问题

| 工具 | 类型 | 用途 |
|---|---|---|
| **Skywalking** | APM（运维级） | 分布式链路追踪，直接看到每个 span 的耗时分布——**一眼看出 5 秒里 SQL 占了多少** |
| **Prometheus** + Grafana | 监控告警 | 采集 MySQL 指标（QPS、连接数、慢查询数），做趋势与阈值告警 |
| **Arthas** | 在线诊断（开发级） | `trace` 命令追踪方法内部调用耗时，定位到具体是哪一行代码慢 |

**关键动作**：在 Skywalking 里看到接口耗时 5 秒，其中 MySQL span 占 4.8 秒 → **锁定是 SQL 问题**，进入第二级。

## 三、第二级：用慢查询日志捞出具体 SQL

慢查询日志记录所有执行时间超过 `long_query_time` 的 SQL。

```ini
# my.cnf 配置
slow_query_log = 1              # 开启慢查询日志
long_query_time = 2             # 阈值：默认 10 秒，建议调到 2 秒（生产）
log_queries_not_using_indexes = 1  # 额外记录未走索引的 SQL（可选，日志量会变大）
slow_query_log_file = /var/lib/mysql/localhost-slow.log
log_output = FILE               # 也可设为 TABLE，用 mysql.slow_log 表查询
```

| 参数 | 说明 |
|---|---|
| `slow_query_log` | 开关，`1` 开启 |
| `long_query_time` | 阈值（秒）。**默认 10 秒太宽松**，线上建议 1~2 秒 |
| `log_queries_not_using_indexes` | 记录未使用索引的 SQL。**注意**：小表全表扫也会被记录，日志可能爆炸 |
| `min_examined_row_limit` | 配合上一项，扫描行数少于该值的不记录（减少噪音，如设 100） |

**动态生效**（不改配置文件也能开）：

```sql
set global slow_query_log = 1;
set global long_query_time = 2;   -- 注意：只对新连接生效，当前会话需重连
```

**分析工具**：

```bash
mysqldumpslow -s t -t 10 /var/lib/mysql/localhost-slow.log   # 按总耗时排序取前 10
# 或使用 pt-query-digest（Percona Toolkit），输出更详细，推荐
```

> **实践提醒**：如果 `log_output = TABLE` 且设为 `FILE` 同时开启，日志会双写。生产建议 `FILE` + `pt-query-digest` 定时分析，避免 `mysql.slow_log` 表本身变成大表。

### 常见的慢 SQL 场景

| 场景 | 为什么慢 | 典型解法 |
|---|---|---|
| **聚合查询** | `count` / `sum` / `group by` 要扫描大量行 | 走覆盖索引；或做**预聚合/汇总表**，离线算好 |
| **多表关联** | 关联字段无索引 → 笛卡尔积；驱动表选择错误 | 关联列加索引；`inner join` 让优化器重排；小表驱动大表 |
| **表数据量过大** | 单表千万级以上，B+ 树变高、Buffer Pool 命中率下降 | 归档冷数据；[分库分表](/database/sharding/) |
| **深度分页查询** | `limit 9000000, 10` 要排序并丢弃前 900 万行 | 延迟关联 / 游标分页（见下面第五节） |

## 四、第三级：EXPLAIN 执行计划

用 `EXPLAIN`（或 `DESC`）查看执行计划，五个字段最关键：

| 字段 | 含义 | 怎么看 |
|---|---|---|
| **`type`** | 连接类型（访问方式） | **性能由好到差**，见下面的全序表 |
| **`possible_keys`** | 理论上可能用到的索引 | 有值但 `key` 为 NULL → **有索引但优化器没选** |
| **`key`** | **实际命中**的索引 | `NULL` = 没走索引；这列是第一眼要看的 |
| **`key_len`** | 索引占用的字节数 | **反推联合索引用到了前几个字段** |
| `rows` / `filtered` | 预估扫描行数 / 过滤后剩余比例（%） | `rows` 越小越好；`filtered` 越接近 100 越好 |
| **`Extra`** | 附加信息 | 见下面的三态说明 |

### `type` 的性能全序

```
NULL > system > const > eq_ref > ref > range > index > ALL
（好 ←───────────────────────────────────────────────→ 差）
```

| type | 含义 | 出现场景 |
|---|---|---|
| `NULL` | 不用访问表 | 如 `select 1`、`select now()` |
| `system` | 表只有 1 行 | 系统表 |
| **`const`** | 常量查找，最多 1 行 | **主键或唯一索引的等值查询**（`where id = 1`） |
| `eq_ref` | 联表时被驱动表走主键/唯一索引 | JOIN 关联列是被驱动表的主键 |
| **`ref`** | 走**普通（非唯一）索引**的等值查询 | `where name = 'Arm'`（name 是普通索引） |
| **`range`** | 索引上的**范围扫描** | `where id > 100`、`where create_time between ...`、`like 'abc%'` |
| `index` | **扫整棵索引树**（不是扫表，但等价于全量） | 常见于"要的列被索引覆盖了，所以扫索引而不扫表" |
| **`ALL`** | **全表扫描** | 没走索引，**必须优化** |

**判断口径**：日常要达到 **`range` 以上**；出现 `index` 或 `ALL` 就要看 `rows`（不一定是问题，小表或全覆盖时可能是优化器的正确选择，见 [索引设计](/database/mysql/index-design) 第 9 条失效场景）。

### `Extra` 的三个高频取值

| Extra 值 | 含义 | 判断 |
|---|---|---|
| **`Using index`** | **覆盖索引**，需要的列全在索引里 | ✅ 最好，**不需要回表** |
| `Using index condition` | 用了索引，但**索引条件下推（ICP）**后仍需回表取列 | ⚠️ 比 `Using where` 好，仍需回表 |
| **`Using where`** | 需要**回表**后再用 `where` 过滤 | ⚠️ 有回表，考虑加联合索引做成覆盖索引 |
| `Using filesort` | 索引无法满足排序，需**额外排序** | ❌ 尽量消除（让 `order by` 走索引顺序） |
| `Using temporary` | 使用了**临时表** | ❌ 常见于 `group by` / `distinct` / `union`，尽量优化 |
| `Using join buffer` | 关联时被驱动表无索引，用了 Join Buffer | ❌ 关联列应加索引 |

### 完整的分析步骤

拿到慢 SQL 后的定式：

```
① 看 key / possible_keys
     ├─ key = NULL 且 possible_keys = NULL  → 没可用索引 → 加索引
     └─ key = NULL 且 possible_keys 有值    → 有索引但没选 → 看表大小/区分度（可能属正常）
② 看 type
     ├─ ALL        → 全表扫描 → 必须处理
     └─ index      → 扫整棵索引树 → 视 rows 而定
③ 看 Extra
     ├─ Using where            → 有回表 → 尝试联合索引做到 Using index
     ├─ Using filesort         → 排序没走索引 → 调整 order by 或索引顺序
     └─ Using temporary        → 有临时表 → 重构 group by / 子查询
④ 看 key_len
     └─ 联合索引只用到了前半段 → 补充中间列条件，或调整索引字段顺序
```

## 五、深度分页的优化

`limit 9000000, 10` 要**先排序取出 9000010 条再丢弃前 900 万条**。三种解法按推荐度排序：

| 方案 | 写法 | 代价特征 |
|---|---|---|
| **① 游标 / 书签分页**（最优） | `where id > 9000000 order by id limit 10` | 定位 O(1)，与页码无关；**不能跳页** |
| **② 延迟关联（覆盖索引 + 子查询）** | `select t.* from t, (select id from t order by id limit 9000000, 10) a where t.id = a.id` | 子查询只扫主键（覆盖索引不回表），外层只回表 10 次 |
| ③ 产品层限制页数 | 最多允许翻 100 页 / 改用条件筛选 | 最省事，但需要产品配合 |

方案 ② 的核心思想与代码示例见 [索引设计](/database/mysql/index-design) 第六节。

## 六、SQL 优化清单

按层次组织，面试可以按这个顺序答（从表设计到架构，由内向外）：

### 6.1 表设计层面

| 项 | 建议 |
|---|---|
| 数值类型 | 按取值范围选 `tinyint` / `int` / `bigint`，**不要一律 bigint**——主键越窄，所有二级索引越小 |
| 字符串类型 | `char`（定长，效率高，适合身份证号、MD5）vs `varchar`（变长，省空间） |
| 金额字段 | 用 `decimal` 或**整数存分**，不用 `float` / `double`（精度丢失） |
| 时间字段 | 用 `datetime` / `timestamp`，避免字符串存时间 |
| 范式与冗余 | 参照阿里《Java 开发手册》（嵩山版）：**适度反范式**——高频关联的字段可冗余，减少 JOIN |

### 6.2 SQL 语句层面

| 项 | 说明 |
|---|---|
| ✅ `SELECT` 指明字段 | 避免 `select *`——减少网络传输、避免回表、利于覆盖索引 |
| ✅ 避免索引失效写法 | 见 [索引设计的 9 种场景](/database/mysql/index-design) |
| ✅ 用 `union all` 代替 `union` | `union` 会多一次**去重排序**；确认无重复时用 `union all` |
| ✅ 不在 `where` 里对字段做表达式/函数 | `where amount + 100 > 500` → 改为 `where amount > 400` |
| ✅ 批量操作代替循环单条 | 用 `insert into ... values (...),(...)` 或 `insert ... select`，减少网络往返与事务开销 |
| ✅ 大事务拆小 | 长事务持有锁时间长、undo 膨胀、主从延迟加剧 |

### 6.3 Join 优化

| 项 | 说明 |
|---|---|
| **能用 `inner join` 就不用 `left`/`right join`** | `inner join` 的**驱动顺序由优化器自动选择**，能挑小表做驱动表；`left join` 的驱动表被语义固定为左表 |
| **必须用 `left join` 时，以小表为驱动表**（小表放左边） | 驱动表越小，外层循环次数越少 |
| **关联列必须都建索引** | 被驱动表的关联列没索引 → `Using join buffer` → 近似嵌套全扫 |
| 控制关联表数量 | 建议**不超过 3 张**；更多时考虑拆查询或在应用层聚合 |

> **驱动表的选择逻辑**：驱动表是外层循环，被驱动表是内层。`A join B` 若 A 有 100 行、B 有 100 万行，以 A 驱动 → 外层 100 次，每次在内层用索引查 B（`eq_ref`/`ref`）；反过来则是 100 万次外层循环。**这就是"小表驱动大表"的量化含义。**

### 6.4 架构层面

| 项 | 说明 |
|---|---|
| **读写分离** | 读多写少时，用主从复制把读流量分到从库，避免写操作影响查询性能（见 [主从复制](/database/mysql/replication)） |
| **缓存** | 热点读走 [Redis](/database/redis/)，减少数据库压力 |
| **归档冷数据** | 历史数据迁到归档表 / [Doris 数仓](/bigdata/doris/)，保持主表在千万级以内 |
| **分库分表** | 单表超 1000 万或 20G 且优化到极限后（见 [分库分表](/database/sharding/)） |

## 七、面试问答

**Q1：如何定位慢查询？**

分三级：① **监控工具**——先用 Skywalking（APM）看到是哪个接口慢、耗时是否集中在 MySQL span，或用 Prometheus 做阈值告警、Arthas `trace` 追踪方法级耗时，确认**确实是 SQL 问题**；② **慢查询日志**——开启 `slow_query_log = 1`，把 `long_query_time` 从默认的 10 秒调到 **2 秒**，日志落在 `slow_query_log_file`（如 `/var/lib/mysql/localhost-slow.log`），再用 `mysqldumpslow` 或 `pt-query-digest` 按总耗时排序捞出 TOP SQL；③ **EXPLAIN**——对具体 SQL 看执行计划，定位根因。常见的慢 SQL 场景有四类：**聚合查询、多表关联、表数据量过大、深度分页**。

**Q2：`EXPLAIN` 你重点看哪些字段？**

五个：① **`key` 和 `possible_keys`**——先确认有没有走索引、索引是否失效；`possible_keys` 有值而 `key` 为 `NULL` 说明有索引但优化器没选；② **`type`**——看连接类型，`ALL` 是全表扫描必须处理，日常要保证 `range` 以上；③ **`Extra`**——出现 `Using where` 说明有回表，可以尝试加联合索引做成覆盖索引（`Using index`）；出现 `Using filesort` / `Using temporary` 说明排序或分组没走索引；④ **`key_len`**——反推联合索引用到了前几个字段；⑤ **`rows` / `filtered`**——预估扫描行数与过滤比例，判断代价量级。

**Q3：`Using index`、`Using index condition`、`Using where` 有什么区别？**

`Using index` 表示 **覆盖索引**——查询要的列全部能从索引里拿到，**无需回表**，是最优情况；`Using index condition` 表示用到了**索引条件下推（ICP）**——部分 `where` 条件在存储引擎层用索引过滤了，但仍有列需要回表取；`Using where` 表示需要**先把行取回来（回表）再用 `where` 过滤**，是三者中最需要优化的情况。优化方向是**让它尽量变成 `Using index`**。

**Q4：谈谈你的 SQL 优化经验。**

我分四个层次：**① 表设计**——数值类型按需选（不要一律 bigint，主键越窄所有二级索引越小）、字符串按定长变长选 `char`/`varchar`、金额用 `decimal` 或整数存分、适度反范式减少 JOIN；**② SQL 语句**——`SELECT` 显式列字段避免 `select *`、避免所有索引失效写法、用 `union all` 代替 `union`、不在 `where` 里对字段做运算、批量操作代替循环单条；**③ Join**——能用 `inner join` 就不用 `left join`（`inner join` 由优化器自动选驱动顺序），必须用 `left join` 时**以小表为驱动表放左边**，关联列都要有索引；**④ 架构**——读多写少做主从读写分离、热点数据上缓存、冷数据归档、单表超千万再考虑分库分表。另外整个规范我会参照阿里《Java 开发手册》（嵩山版）。
