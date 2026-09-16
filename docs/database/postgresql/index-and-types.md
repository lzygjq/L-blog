---
order: 4
date: 2026-09-16
title: 索引体系与数据类型
desc: 六种索引类型各自的适用语义、B-tree 的四个边界与 LIKE 前缀坑、GIN 的倒排与 fastupdate、BRIN 为何是十亿行大表的性价比之王、部分索引与表达式索引、数据类型选择的实际影响
---

# 索引体系与数据类型

## 一、问题场景

两个"明明建了索引却没用上"的现场：

1. 一张日志表 10 亿行、按时间范围查询。按常规思路建 B-tree 索引，**索引本身涨到 200 GB**，维护成本比表还高。
2. `WHERE tags @> ARRAY['vip']` 或 `WHERE payload @> '{"level":"error"}'`——**B-tree 索引对这种"包含"查询完全无效**，优化器直接不走。

这两个问题的答案都不是"索引没建对"，而是**索引类型选错了**。PG 提供六种索引类型不是炫技：**每一类对应一种"数据之间的顺序关系"**，选错类型等于用尺子量体积。

## 二、六种索引类型的分工 {#types}

| 类型 | 适配的语义 | 典型场景 | 关键代价 |
|---|---|---|---|
| **B-tree** | 排序、等值、范围、前缀 | 绝大多数常规条件；**唯一约束只能靠它** | 大表上体积大（存全量键）|
| **Hash** | 只有等值 | 超长键的等值查询（索引比 B-tree 小）| 不支持范围/排序；用武之地窄 |
| **GIN** | **"包含"**：一个值里含有哪些元素 | `JSONB` 的 `@>`、数组的 `&&`、全文检索 `@@`、模糊查询 | **写放大严重**，一行更新动多个键项 |
| **GiST** | **"相交 / 距离"** | 几何、范围类型、最近邻排序（KNN）| 查询比 GIN 慢，但写更快、支持 KNN |
| **SP-GiST** | **空间分区**（非平衡结构）| 点、IP 段、前缀树类数据 | 场景专一，通用性低 |
| **BRIN** | **顺序相关性** | **十亿行级的时序 / 追加型大表** | 前提是物理顺序与查询条件相关，否则全失效 |

**选择顺序**（实用的决策链）：

```
条件是什么语义？
   │
   ├─ 等值 / 范围 / 排序 / 唯一  ──────────▶ B-tree（默认，先想它）
   │
   ├─ 「这个值里面包含某元素」
   │     (JSON / 数组 / 全文)  ────────────▶ GIN
   │
   ├─ 「两个值相交 / 谁离谁近」 ────────────▶ GiST（要 KNN 就用它）
   │
   └─ 「表极大、且写入顺序与查询维度一致」 ─▶ BRIN（先算相关性，再决定）
```

## 三、B-tree 的四个边界 {#btree}

B-tree 是默认选择，但它有四个容易踩的边界：

### 3.1 前缀 `LIKE` 不一定走索引

这是 PG 最经典的坑之一：

```sql
-- 能否走索引，取决于数据库的 locale
SELECT * FROM t WHERE name LIKE 'abc%';
```

| 前提 | 结果 |
|---|---|
| 数据库 locale 是 **C**（或 `POSIX`）| **走索引**，字节序与排序序一致 |
| locale 是 `zh_CN.UTF-8` / `en_US.UTF-8` 等 | ❌ 不走索引——排序规则与字节序不同，B-tree 的前缀连续性不成立 |
| 为列建 `text_pattern_ops` 操作符类的索引 | ✅ 走索引（但该索引不能用于普通 `ORDER BY`）|

**实践口径**：需要前缀匹配的列，显式建一个 `text_pattern_ops` 索引：

```sql
CREATE INDEX idx_name_prefix ON t (name text_pattern_ops);
```

### 3.2 多列索引仍是"最左前缀"

与 MySQL 一致：`(a, b, c)` 的索引能用 `a`、`a,b`、`a,b,c` 的条件；**跳过 `a` 直接用 `b` 不行**。

> 这一点和 [MySQL 的联合索引](/database/mysql/index-design)完全一样，**说明它不是某个数据库的实现细节，而是"有序结构只能从头开始扫"的必然结果**。

### 3.3 `INCLUDE` 才是 PG 的覆盖索引写法

因为 PG 的二级索引叶子存的是 `ctid` 而不是主键（见[根设计二](/database/postgresql/vs-mysql#root-two)），**索引不会"顺带"覆盖任何列**。要覆盖必须显式声明：

```sql
-- 键列是 user_id，覆盖列是 amount、created_at
CREATE INDEX idx_user_amount ON orders (user_id) INCLUDE (amount, created_at);
```

`INCLUDE` 列只存在叶子节点、不参与排序比较——**它让 Index Only Scan 成为可能，同时不改变索引的有序性**。

### 3.4 唯一约束只能由 B-tree 提供

即使你只想做「等值查询」，如果那个列需要唯一保证，**也只能用 B-tree**。Hash 与 GIN 都无法表达唯一性。

## 四、GIN：为"包含"而生 {#gin}

GIN（Generalized Inverted Index）是**倒排索引**——它的结构就是「元素 → 哪些行含有它」，与 [Elasticsearch 的倒排索引](/search/inverted-index)是同一个思路，只是落后在数据库内部。

### 4.1 它能加速哪些查询

```sql
-- JSONB 包含
SELECT * FROM events WHERE payload @> '{"level": "error"}';
-- 数组包含 / 重叠
SELECT * FROM articles WHERE tags @> ARRAY['pg'] OR tags && ARRAY['db'];
-- 全文检索
SELECT * FROM docs WHERE to_tsvector('simple', body) @@ to_tsquery('simple', 'postgres');
-- 模糊匹配（需 pg_trgm 扩展）
SELECT * FROM users WHERE name ILIKE '%john%';
```

最后一条值得说明：**`LIKE '%xxx%'` 在 B-tree 下永远无法走索引**（因为无法确定起点），但用 `pg_trgm` 扩展把字符串切成三元组后建 GIN 索引，**就可以走**。这是"B-tree 做不到的事，换一种索引就能做到"的典型例子。

### 4.2 代价：写放大与 `fastupdate`

GIN 的代价是**一行更新要改动多个键项**（一个 JSONB 里有 20 个键，更新它就动 20 处索引）。

PG 用 `fastupdate`（默认开）缓解这个问题：

| 模式 | 写入行为 | 读取行为 |
|---|---|---|
| `fastupdate = on` | 新数据先进 **pending list**（默认 4 MB），攒满才批量合并进主索引 | 查询要**同时查主索引和 pending list**，稍慢 |
| `fastupdate = off` | 每次插入直接更新主索引 | 查询更快，但写入更慢 |

代价的转移很明确：**`fastupdate` 用读性能换写性能**。写密集的场景保持开启；如果发现读延迟抖动，检查 `gin_pending_list_limit` 是否积压太多。

## 五、BRIN：大表的性价比之王 {#brin}

BRIN 解决的是「**表大到 B-tree 索引本身成为负担**」这个问题。

### 5.1 它存什么

BRIN 不存每一行的键，而是**按块范围（默认每 128 个 8 KB 页 = 1 MB）存这一段的最小/最大值**：

```
   表文件（物理顺序）
   ┌──────────┬──────────┬──────────┬──────────┐
   │ 块范围 0  │ 块范围 1  │ 块范围 2  │ 块范围 3  │
   │ 1MB      │ 1MB      │ 1MB      │ 1MB      │
   └──────────┴──────────┴──────────┴──────────┘
        │          │          │          │
        ▼          ▼          ▼          ▼
   ┌────────────────────────────────────────────┐
   │ BRIN 索引：每个块范围只记一对 min / max      │
   │ [08:00, 08:59] [09:00, 09:59] ...          │
   └────────────────────────────────────────────┘
        索引大小 ≈ 表的 1/1000 量级
```

查询 `WHERE created_at BETWEEN '09:30' AND '09:45'` 时，BRIN **先排除掉不相关的块范围**（只保留可能有命中的 1~2 个范围），再精细扫描。这个过程叫**块范围剪枝**。

### 5.2 前提条件：顺序相关性

**这是 BRIN 唯一的、也是绝对的前提**：

| 写入模式 | BRIN 效果 |
|---|---|
| 时序追加（日志、流水、埋点）| ✅ 每个块范围内的时间高度集中，剪枝命中率高 |
| 数据经过排序导入 | ✅ 同上 |
| 随机写入 / 频繁更新打乱物理顺序 | ❌ 每个块范围的 min/max 都会跨满全区间，**剪枝完全失效**，反而比全表扫多一层开销 |

**怎么判断该不该用 BRIN**：

```sql
-- 物理顺序与逻辑顺序的相关性，取值 -1 ~ 1
-- 接近 ±1 = 高度相关（适合 BRIN）；接近 0 = 随机（不要用）
SELECT correlation FROM pg_stats
WHERE tablename = 't_log' AND attname = 'created_at';
```

### 5.3 与 B-tree 的量化对比

一张 10 亿行的日志表，`created_at` 列：

| | B-tree | BRIN |
|---|---|---|
| 索引大小 | 数百 GB（与行数同阶）| **几 MB**（与表大小同阶，表 1/1000 量级）|
| 建索引耗时 | 小时级 | 分钟级 |
| 写放大 | 每行插入都改索引 | 影响极小（只维护块范围汇总）|
| 点查精度 | 精确 | 粗（按块范围）|
| 范围扫描 | 精确但成本高 | **范围越大优势越明显** |

**结论**：**BRIN 用"精度"换"体积与写成本"**。它不替代 B-tree，它覆盖的是「表极大 + 顺序相关 + 查询多为范围」这一块 B-tree 性价比崩塌的区域。

> **面试答法**：「十亿行的时序表建索引，我会先算 `correlation`。接近 1 就上 BRIN——索引从几百 GB 降到几 MB，写放大也基本消失；如果相关性低，就得改设计（分区或调整写入顺序），而不是硬建 B-tree。」

## 六、部分索引与表达式索引 {#partial}

这两个特性组合起来能解决不少"常规索引解决不了"的问题。

### 6.1 部分索引：只索引你真正要查的子集

```sql
-- 全表 5000 万行，但只有 2000 条是「待处理」
CREATE INDEX idx_pending ON orders (created_at) WHERE status = 'pending';
```

**收益**：索引体积从千万级降到几千条 → 索引常驻内存、写放大几乎消失、维护成本归零。

**关键前提**：查询条件必须**蕴含**索引的 `WHERE` 条件，否则优化器无法证明可用：

| 查询 | 能否命中 |
|---|---|
| `WHERE status = 'pending' AND created_at > ...` | ✅ |
| `WHERE status IN ('pending', 'done') AND ...` | ❌ 不蕴含 |
| `WHERE created_at > ...`（不带 status）| ❌ 不蕴含 |

### 6.2 唯一部分索引：软删除下的唯一约束

这是部分索引最经典的用法——**"每个邮箱只能有一个未删除用户"**：

```sql
CREATE UNIQUE INDEX uniq_active_email ON users (lower(email))
WHERE deleted_at IS NULL;
```

一条语句同时解决了三件事：**大小写不敏感**（表达式）、**只约束未删除行**（部分）、**唯一性**（只能是 B-tree）。MySQL 要达成同样效果通常得靠触发器或应用层保证。

### 6.3 表达式索引

```sql
CREATE INDEX idx_lower_email ON users (lower(email));
-- 查询必须写成同样形式（或等价）才能命中
SELECT * FROM users WHERE lower(email) = 'a@b.com';
```

> **与 MySQL 的对照**：MySQL 8.0 支持函数索引，但**不支持部分索引**。所以「只索引待处理的行」在 PG 上是一行 DDL，在 MySQL 上要靠额外列或触发器模拟。这属于[根设计之外的、产品层面的能力差异](/database/postgresql/vs-mysql#diff-table)。

## 七、数据类型选择的实际影响 {#datatypes}

类型选得对不对，影响存储、索引体积和查询能否走索引。

| 选择 | 建议 | 理由 |
|---|---|---|
| **`text` 还是 `varchar(n)`** | **用 `text`** | 两者性能无差别；`varchar(n)` 只多一个长度校验。长度约束用 `CHECK` 表达更清晰、改起来不用锁表重定义类型 |
| `char(n)` | 别用 | 会补空格，比较逻辑反直觉 |
| **`json` 还是 `jsonb`** | **默认 `jsonb`** | `jsonb` 是二进制存储、**可建 GIN 索引**、键去重；`json` 只保留原始文本（适合存档原文）|
| 数组类型 | 多值标签、权限列表用它 + GIN | 但它**替代不了关联表**：做不到外键约束、更新是整列替换 |
| 枚举类型 | 谨慎 | 加值要 `ALTER TYPE`；排序按定义序（不够灵活时用 `text` + `CHECK`）|
| **`timestamp` 还是 `timestamptz`** | **默认 `timestamptz`** | `timestamptz` 内部存 UTC、按会话时区显示；`timestamp` 不带时区语义，跨时区必出事 |
| 金额 | **`numeric`** | 精确十进制；`float8` 会有舍入误差 |
| 主键 | `bigint` 或有序 UUID | 无序 UUID 在 PG 上不会撕裂堆表（见[根设计二](/database/postgresql/vs-mysql#root-two)），但索引体积更大。较新版本已内置时间有序的 `uuidv7()` 生成函数，兼顾两者 |

**一个通用判据**：**类型的"表达能力"决定它能不能被索引加速**。把 JSON 存成 `text`，就只能整串匹配；存成 `jsonb`，才能用 GIN 做"包含"查询。**选类型时先问"我以后会怎么查它"。**

## 八、索引与查询诊断 {#diagnosis}

### 8.1 找出无用索引

```sql
SELECT relname, indexrelname, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

**判读要点**：

- 统计自 `pg_stat_reset()` 或实例启动起累计，**刚重启的实例所有值都是 0**，不能直接下结论；
- **主键与唯一索引即使在 `idx_scan = 0` 时也不能删**——它们承担的是约束职责，不是查询加速；
- 大表上每个无用索引都是实打实的写放大来源（[PG 的 UPDATE 要改所有索引](/database/postgresql/vs-mysql#root-one-diff)）。

### 8.2 `EXPLAIN (ANALYZE, BUFFERS)` 的三个必看项

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
```

| 看什么 | 说明 |
|---|---|
| **估算行数 vs 实际行数** | 差距达数量级 → 统计信息过期，先 `ANALYZE`，再谈加索引 |
| `Buffers: shared hit=N read=M` | `hit` 是缓存命中、`read` 是磁盘读。**逻辑读总量才是真实成本**，不是"执行时间" |
| `Index Only Scan` 下的 `Heap Fetches` | **`Heap Fetches: 0` 才是真覆盖**。非 0 说明可见性映射没生效 → 需要 VACUUM（[见这里](/database/postgresql/mvcc-and-vacuum#vacuum)）|

**最后一项最容易被忽略**：很多人建了 `INCLUDE` 覆盖索引，看到执行计划里写着 `Index Only Scan` 就以为大功告成，**但它仍然在每个回表查可见性**。根因是那张表很久没 VACUUM，可见性映射没维护——**一个索引问题，根因却在 VACUUM 上**。

## 九、面试高频索引 {#interview}

| # | 问题 | 一句话答案 | 出处 |
|---|---|---|---|
| 1 | PG 有哪几种索引类型？ | B-tree / Hash / GIN / GiST / SP-GiST / BRIN，各对一种语义 | [六种分工](#types) |
| 2 | JSONB 字段该建什么索引？ | GIN，B-tree 对"包含"查询无效 | [六种分工](#types) |
| 3 | 唯一约束能用 GIN 吗？ | 不能，**唯一约束只能由 B-tree 提供** | [B-tree 边界](#btree) |
| 4 | 为什么 `LIKE 'abc%'` 有时不走索引？ | locale 不是 C 时字节序与排序序不一致；需建 `text_pattern_ops` 索引 | [前缀 LIKE](#btree) |
| 5 | PG 的覆盖索引怎么写？ | `INCLUDE (col)`，显式声明 | [INCLUDE](#btree) |
| 6 | GIN 适合什么、不适合什么？ | 适合包含/重叠/全文；不适合写密集（写放大重）| [GIN](#gin) |
| 7 | `fastupdate` 是什么取舍？ | 用读性能换写性能：新数据先进 pending list 批量合并 | [GIN 代价](#gin) |
| 8 | `LIKE '%xxx%'` 能走索引吗？ | B-tree 永远不行；`pg_trgm` + GIN 可以 | [GIN](#gin) |
| 9 | BRIN 存的是什么？ | 每个块范围（默认 128 页）的 min/max，不是行级键 | [BRIN](#brin) |
| 10 | **BRIN 唯一的前提是什么？** | 物理顺序与查询条件相关（`pg_stats.correlation` 接近 ±1）| [顺序相关性](#brin) |
| 11 | 十亿行时序表为什么选 BRIN？ | 索引从数百 GB 降到几 MB，写放大几乎消失 | [量化对比](#brin) |
| 12 | 部分索引能带来多大收益？ | 只索引热点子集，体积与写放大按比例下降 | [部分索引](#partial) |
| 13 | 软删除下的唯一约束怎么做？ | `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL` | [唯一部分索引](#partial) |
| 14 | MySQL 有部分索引吗？ | 没有，这是 PG 侧的产品能力差异 | [表达式索引](#partial) |
| 15 | `timestamp` 还是 `timestamptz`？ | 默认 `timestamptz`，内部存 UTC | [数据类型](#datatypes) |
| 16 | `json` 和 `jsonb` 怎么选？ | 要索引和查询用 `jsonb`，要保留原文用 `json` | [数据类型](#datatypes) |
| 17 | 怎么找无用索引？ | `pg_stat_user_indexes.idx_scan = 0`，但**约束类索引不能删** | [索引诊断](#diagnosis) |
| 18 | 为什么建了覆盖索引还是慢？ | 看 `Heap Fetches`：非 0 说明可见性映射没维护 → 该 VACUUM 了 | [索引诊断](#diagnosis) |

> **本篇与 [MySQL · 索引设计](/database/mysql/index-design) 的分工**：那边讲「最左前缀、覆盖索引、索引失效场景」这套**通用索引原理**；本篇讲 PG **独有的索引类型与产品能力**（GIN / BRIN / 部分索引）。通用原理不在此复制。
