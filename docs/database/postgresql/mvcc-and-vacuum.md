---
order: 2
date: 2026-09-16
title: MVCC 与 VACUUM：版本、膨胀与回卷
desc: 行头的 xmin/xmax/ctid、快照三要素与可见性判定、VACUUM 的三件事与三种形态、长事务为何能拖死全库、膨胀度量、事务 ID 回卷与 autovacuum 阈值公式
---

# MVCC 与 VACUUM：版本、膨胀与回卷

## 一、问题场景

两个线上现象，看起来无关，其实是同一个机制的两种发作方式：

**现象 A**：一张 200 万行的订单表，`select count(*)` 说 200 万行，但 `pg_relation_size` 显示 7.8 GB——**每行平均占 4 KB**，而实际行长不过 300 字节。

**现象 B**：某天开始所有表都变慢，`pg_stat_activity` 里有一条 `state = 'idle in transaction'`、`xact_start` 是**两小时前**的连接。杀掉它，全库立刻恢复。

两者都源于 [PG 把旧版本留在数据行里](/database/postgresql/vs-mysql#root-one)这个根设计。这篇讲清楚：**版本怎么组织 → 怎么判断可见 → 谁来清理 → 不清理会怎样**。

## 二、行版本是怎么组织的 {#row-version}

每个行版本（tuple）的头上有四个关键字段：

| 字段 | 含义 | 关键点 |
|---|---|---|
| `xmin` | **创建**这个版本的事务 ID | 决定「这个版本什么时候开始可见」 |
| `xmax` | **删除或锁定**这个版本的事务 ID | `0` 表示未被删除；非 0 也可能是行锁而非删除 |
| `ctid` | 物理位置（页号, 行偏移） | 索引指向它；更新后在旧版本里指向**新版本** |
| `t_infomask` | 标志位 | 缓存「已提交 / 已中止 / 已冻结」等状态，避免每次查 CLOG |

一次 `UPDATE` 的物理过程：

```
更新前：行 A（ctid=(0,1)，xmin=100，xmax=0）
                写 UPDATE ... WHERE id=1

  ① 在新位置写入完整的新版本
     ┌──────────────────────────────┐
     │ ctid=(0,3) xmin=150 xmax=0   │  新版本，内容为更新后的值
     └──────────────────────────────┘

  ② 旧版本打上「被 150 删除」的标记，并把 ctid 指向新版本
     ┌──────────────────────────────┐
     │ ctid=(0,1) xmin=100 xmax=150 │──┼──▶ (0,3)
     └──────────────────────────────┘
        这个旧版本此刻已「对所有人不可见」，
        但空间还占着 —— 直到 VACUUM 来标记可复用

  ③ 每个索引都插入一条指向 (0,3) 的新索引项
     （HOT 更新例外：若改动列无索引引用且同页可容纳，则跳过此步）
```

**两个必须记住的推论**：

1. **「已删除」不等于「空间已释放」**。旧版本的清理是**后台任务**，不是写入路径的一部分。这就是膨胀的物理来源。
2. **索引条目数 ≥ 行版本数**。所以更新频繁的表，主键索引和每个二级索引都会一起长——**多一个索引，就多一份写放大与膨胀**。

## 三、可见性怎么判断：快照的三要素 {#snapshot}

每个语句（`READ COMMITTED`）或每个事务（`REPEATABLE READ`）拿到一个**快照**，快照就三样东西：

| 快照字段 | 作用 |
|---|---|
| `xmin` | 边界下界：**比它更早的事务**都已结束，其效果应当可见 |
| `xmax` | 边界上界：**从它起的事务 ID** 都还没开始，不可见 |
| `xip_list` | 快照生成时**仍在活跃**的事务 ID 列表 |

判定一个行版本是否可见，本质是三问：

```
   xmin（创建者） ─┬─ 是当前事务？           → 可见（自己改的自己看得见）
                   ├─ 在 xip_list 里？        → 不可见（它当时还没做完）
                   ├─ 大于快照 xmax？         → 不可见（它当时还没开始）
                   └─ 已提交且更早？          → 继续看 xmax
                                               │
   xmax（删除者） ─┬─ 为 0 / 未提交？         → 可见
                   ├─ 在 xip_list 里？        → 可见（删它的人当时还没做完）
                   └─ 已提交且早于快照？      → 不可见（它确实已被删掉）
```

**这就是「读不阻塞写、写不阻塞读」的全部秘密**：读操作只做**内存里的标志位判断**，不去等锁、不去读 undo、不去看别人的中间状态。**代价就是那些旧版本必须有人清。**

> **与 MySQL 的对照**：MySQL 用 ReadView + undo 版本链做同样的事，也是「读不加锁」。差别在版本链的位置与长度——MySQL 的链在 undo 里、可以被 purge 截断；PG 的链**一直留在表里**。机制细节见 [MySQL · MVCC 与锁](/database/mysql/mvcc)。

## 四、VACUUM 到底做了什么 {#vacuum}

很多人把 VACUUM 理解成「清理垃圾」。它实际做**三件事**，第三件最容易被忽略，却也最致命：

| # | 动作 | 直接收益 | 不做的后果 |
|---|---|---|---|
| ① | **回收死元组占用的空间**，标记为页内可复用 | 新数据能重用这些空间，文件不再无谓增长 | 膨胀 |
| ② | **更新可见性映射**（Visibility Map）：把「所有元组对所有事务都可见」的页标记出来 | **Index Only Scan 才会生效**（否则仍要回表查可见性）| 覆盖索引白建，索引扫描仍回表 |
| ③ | **冻结足够老的行版本**（把 `xmin` 标记为冻结）| 事务 ID 可以循环使用，不会回卷 | **数据库保护性停机**（见 [第七节](#wraparound)）|

所以 VACUUM 不只是「省空间」的运维动作，它**同时是查询性能的组成部分**（第 ② 条）和**数据库可用性的前提**（第 ③ 条）。

### 4.1 三种形态与各自代价

| 形态 | 做什么 | 锁 | 归还 OS 空间 | 适用 |
|---|---|---|---|---|
| `VACUUM` | 标记可复用，文件不缩 | `SHARE UPDATE EXCLUSIVE`（不阻塞读写） | ❌ | **日常，由 autovacuum 自动执行** |
| `VACUUM FULL` | 重写整表到新文件，删旧文件 | **`ACCESS EXCLUSIVE`（等于停表）** | ✅ | 极端膨胀且可停机窗口 |
| `pg_repack` | 建影子表 + 触发器同步增量，最后短暂切换 | 切换瞬间极短 | ✅ | **在线重建的正确做法** |

> **反模式**：把 `VACUUM FULL` 当日常清理手段。它会**停表**，而且重建期间的 WAL 也会爆炸。日常该做的是**把 autovacuum 调对**。

## 五、长事务为什么能拖死全库 {#long-transaction}

这是 PG 与 MySQL 差异最大的运维面，也是这道题的答案：

> **VACUUM 只能清理「比所有活跃快照都旧」的行版本。**

原因很简单：一个还没结束的事务，**随时可能去读某个旧版本**。如果 VACUUM 把那个版本清了，这个事务的查询结果就会错。所以 PG 的做法是**保守地画一条线**——线之前的可以清，线之后的一个都不能动。

```
   事务 ID 时间轴 ────────────────────────────────────────▶

   已结束的事务              最老的活跃快照         当前
   ─────┬──────┬──────┬──────┬───────────────┬────────────
        │      │      │      │               │
        └──────┴──────┴──────┘               │
         ✅ VACUUM 可以清理这一段               │
                                              │
                              ❌ 这一段里所有表的死元组
                                 都清不掉（哪怕它们早已无人可见）
```

**一个两小时未提交的事务（哪怕它什么也没干，只是 `idle in transaction`），会把清理水位钉在两小时前**。这两小时内全库**所有表**产生的死元组——包括那些与这个事务完全无关的表——全都清不掉。看到的现象就是「所有表同时开始胀」。

### 5.1 怎么发现与预防

```sql
-- 当前最老的长事务：超过 5 分钟的都值得看一眼
SELECT pid, state, xact_start,
       now() - xact_start AS xact_age,
       left(query, 60)    AS query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
  AND now() - xact_start > interval '5 minutes'
ORDER BY xact_start;
```

| 手段 | 说明 |
|---|---|
| `idle_in_transaction_session_timeout` | **最该配的参数**：空闲事务超时自动断开，从源头杜绝「忘了提交」 |
| `statement_timeout` | 防单条 SQL 跑太久（但挡不住 idle in transaction）|
| 应用侧纪律 | 事务里绝不包含「等用户输入」「调外部 HTTP」「读大文件」 |
| 监控 | `pg_stat_activity` 的 `xact_start` 取最大值，做成告警项 |

> **面试里的高分答法**：不要只说「长事务占锁、undo 大」。要说「**PG 里长事务会把 VACUUM 的清理水位顶住，导致全库膨胀，影响面不止它自己那张表**」——这句话区分开了「背过 MySQL 长事务危害」和「真正运维过 PG」。

## 六、膨胀的度量与治理 {#bloat}

### 6.1 先能量出来，再谈治理

| 指标 | 来源 | 判读 |
|---|---|---|
| 死元组数 | `pg_stat_user_tables.n_dead_tup` | 持续高于活元组 20% 就值得查 |
| 最后清理时间 | `last_autovacuum` / `last_vacuum` | 长期为 `NULL` 说明 autovacuum 从没碰过它 |
| 实际膨胀率 | `pgstattuple` 扩展的 `pgstattuple_approx()` | 精确但会扫表，抽样用近似版 |
| 表与索引体积 | `pg_relation_size` / `pg_indexes_size` | 索引比表还大是索引膨胀的信号 |

```sql
SELECT relname, n_live_tup, n_dead_tup,
       last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 10;
```

### 6.2 治理手段按代价排序

| 手段 | 代价 | 说明 |
|---|---|---|
| 调低该表的 autovacuum 阈值 | 无 | **首选**，见 [第八节](#autovacuum) |
| 手动 `VACUUM (VERBOSE) 表名` | 低，不阻塞 | 立即见效一次，但不改变长期行为 |
| 消除长事务 | 无（但要改应用）| 治本 |
| `pg_repack` | 需要额外空间 + 一次短暂锁 | 已经在还 OS 空间的场景 |
| `VACUUM FULL` | **停表** | 最后手段 |

## 七、事务 ID 回卷：PG 最独特的故障模式 {#wraparound}

事务 ID（XID）是 **32 位无符号整数**，约 42.9 亿个。PG 判断「谁更新」靠的是 XID 的大小比较，而**比较必须考虑回绕**，所以实际安全可用空间只有 **约 20 亿**。

处理办法是**冻结**：把足够老、肯定不再有活跃快照需要判断的行版本标记为「冻结」（`xmin` 视为永远过去）。冻结过的版本不参与 XID 比较，于是 XID 可以安全回绕。

```
   XID 已用量的四道门（默认值）
   ────────────────────────────────────────────────────────
   0        5000 万              2 亿                20 亿
   │           │                  │                   │
   │           │                  │                   └─ ⛔ 拒绝新事务
   │           │                  │                      保护性停机
   │           │                  └─ 强制 autovacuum
   │           │                     （即使 autovacuum 被关掉也会跑）
   │           │
   │           └─ vacuum_freeze_min_age：
   │              超过这个年龄的行版本才会被本次 VACUUM 冻结
   │
   └─ 起点
```

| 参数 | 默认 | 含义 |
|---|---|---|
| `vacuum_freeze_min_age` | 5000 万 | 冻结的最小年龄——设太大会让冻结不彻底，需要更多轮 |
| `vacuum_freeze_table_age` | 1.5 亿 | 超过此值，VACUUM 会做**全表扫描**来冻结（而不是只扫脏页）|
| `autovacuum_freeze_max_age` | **2 亿** | 表的年龄上限，超过则**强制**触发防回卷 VACUUM |

**监控语句**（这两个数应该进日常巡检）：

```sql
-- 库级：距离强制冻结还有多远
SELECT datname, age(datfrozenxid) FROM pg_database ORDER BY 2 DESC;
-- 表级：找出最老的表
SELECT relname, age(relfrozenxid) FROM pg_class
WHERE relkind = 'r' ORDER BY 2 DESC LIMIT 10;
```

**为什么这件事值得单独记**：

1. **它是唯一会导致「数据库自己拒绝服务」的运维欠账**——不是变慢，是直接不可用。
2. **它的发生是缓慢而无声的**。没有报警的话，往往到停机那天才发现。
3. **防回卷 VACUUM 本身会造成 IO 尖峰**——它要全表扫、可能要冻结几千万个元组。**所以不能靠它兜底，要靠日常 autovacuum 把年龄维持在低位。**

> **一句话**：膨胀是性能问题，回卷是**可用性**问题。前者可以慢慢治，后者必须在它发作前就监控起来。

## 八、autovacuum 怎么调 {#autovacuum}

### 8.1 触发阈值公式

VACUUM 的触发条件是：

```
        死元组数 > 阈值 + 比例 × 表的当前行数
                   │        │
                   │        └─ autovacuum_vacuum_scale_factor（默认 0.2）
                   └─ autovacuum_vacuum_threshold（默认 50）
```

**把这个公式代进大表，就会看到问题的全貌**：

| 表行数 | 需要积累多少死元组才触发 | 后果 |
|---|---|---|
| 1 万 | 50 + 2000 ≈ 2050 | 正常 |
| 100 万 | 50 + 200000 ≈ **20 万** | 死元组堆到 20 万才清理，膨胀率常年 20% |
| 1 亿 | 50 + **2000 万** | **基本等于不清理** |

所以**大表必须按表覆盖默认值**，把 `scale_factor` 降到 1% 甚至更低：

```sql
ALTER TABLE t_order SET (
  autovacuum_vacuum_scale_factor  = 0.01,
  autovacuum_vacuum_threshold     = 1000,
  autovacuum_analyze_scale_factor = 0.005
);
```

### 8.2 只增不改的表也要 VACUUM

一个容易漏的场景：**只插入、从不更新删除的表**（日志、流水），按旧公式永远达不到触发阈值。但这类表恰恰需要 VACUUM 的**第二件事**——更新可见性映射，否则 `Index Only Scan` 永远不生效。

PG 13 起补了这条例外路径：

| 参数 | 默认 | 作用 |
|---|---|---|
| `autovacuum_vacuum_insert_threshold` | 1000 | 插入触发的阈值 |
| `autovacuum_vacuum_insert_scale_factor` | 0.2 | 插入触发的比例 |

### 8.3 全局资源与"清理不力"的三个常见误配

| 参数 | 默认 | 常见问题 |
|---|---|---|
| `autovacuum_max_workers` | 3 | 表多、单 worker 慢 → 队列排不上；但加 worker 会抢 IO |
| `autovacuum_naptime` | 1 min | 实例上表极多时，每轮来不及全跑一遍 |
| `autovacuum_vacuum_cost_delay` / `_limit` | 2 ms / 200 | **默认值非常保守**（担心拖 IO）。SSD 上留默认值会让 VACUUM 慢得离谱，是"明明开了 autovacuum 却还在膨胀"的头号原因 |

**诊断顺序**（线上遇到"autovacuum 不干活"）：

```
① pg_stat_activity 里 autovacuum 进程在跑吗？（在跑 → 是慢，不是没跑）
        │
② 表上是不是有长事务把水位顶住了？ → 查 xact_start
        │
③ 阈值没到？ → 看 n_dead_tup vs 阈值公式
        │
④ 到了但很慢？ → 看 cost_delay / cost_limit 与 max_workers
        │
⑤ 被锁挡住了？ → 表上有长持 ACCESS EXCLUSIVE 的事务
```

## 九、面试高频索引 {#interview}

| # | 问题 | 一句话答案 | 出处 |
|---|---|---|---|
| 1 | PG 的行版本头上有哪些字段？ | `xmin` 创建者、`xmax` 删除者、`ctid` 物理位置、`t_infomask` 状态位 | [行版本组织](#row-version) |
| 2 | 「已删除」为什么空间不释放？ | 清理是后台 VACUUM 的活，不在写入路径上 | [行版本组织](#row-version) |
| 3 | 快照由哪三部分组成？ | 下界 `xmin`、上界 `xmax`、活跃事务列表 `xip_list` | [可见性判定](#snapshot) |
| 4 | 为什么 PG 读不加锁？ | 可见性判断只在内存里做标志位比对，不等锁也不读 undo | [可见性判定](#snapshot) |
| 5 | VACUUM 做了哪三件事？ | 回收死元组空间、**更新可见性映射**、**冻结旧版本** | [VACUUM](#vacuum) |
| 6 | VACUUM 不更新可见性映射会怎样？ | Index Only Scan 失效，覆盖索引白建 | [VACUUM](#vacuum) |
| 7 | `VACUUM` 和 `VACUUM FULL` 的区别？ | 前者只标记复用不归还 OS；后者重写文件但要 `ACCESS EXCLUSIVE` 停表 | [三种形态](#vacuum) |
| 8 | 在线重建膨胀表怎么做？ | `pg_repack`，影子表 + 触发器同步增量 | [三种形态](#vacuum) |
| 9 | **长事务为什么影响面是全库？** | VACUUM 的清理水位被它顶住，全库所有表的死元组都清不掉 | [长事务](#long-transaction) |
| 10 | 怎么防长事务？ | 配 `idle_in_transaction_session_timeout`，并监控 `xact_start` | [长事务](#long-transaction) |
| 11 | 膨胀怎么量？ | `n_dead_tup` / `last_autovacuum` / `pgstattuple_approx()` | [膨胀治理](#bloat) |
| 12 | 事务 ID 回卷是什么后果？ | 不是变慢，是**拒绝新事务**——数据库保护性停服 | [回卷](#wraparound) |
| 13 | 回卷的四个阈值参数？ | `freeze_min_age` 5000 万 / `freeze_table_age` 1.5 亿 / `autovacuum_freeze_max_age` 2 亿 / 20 亿停机 | [回卷](#wraparound) |
| 14 | 怎么监控回卷风险？ | `age(datfrozenxid)` 库级 + `age(relfrozenxid)` 表级，放进日常巡检 | [回卷](#wraparound) |
| 15 | autovacuum 的触发公式？ | 阈值 50 + 比例 0.2 × 行数——**表越大越不可用** | [autovacuum](#autovacuum) |
| 16 | 大表 autovacuum 该怎么设？ | 按表覆盖 `scale_factor` 到 1% 或更低 | [autovacuum](#autovacuum) |
| 17 | 只插不改的表为什么也要 VACUUM？ | 需要它维护可见性映射，否则 Index Only Scan 不生效 | [autovacuum](#autovacuum) |
| 18 | "开了 autovacuum 还在膨胀"最可能的原因？ | `cost_delay`/`cost_limit` 默认太保守，VACUUM 慢到追不上 | [autovacuum](#autovacuum) |

> **本篇与 [MySQL · MVCC 与锁](/database/mysql/mvcc) 的分工**：那边讲 ReadView 四字段与 undo 版本链的**具体实现**；本篇讲 PG 相反的版本存放策略**推出来的运维后果**。两篇的机制不互相复制，结论互为对照。
