---
order: 3
date: 2026-09-16
title: 锁与并发控制：谁在阻塞谁
desc: 表级锁八种模式与冲突矩阵、行锁标记在元组头上所以不会锁升级、DDL 锁与"锁队列插队"停表、SSI 可串行化与重试、四类意外阻塞与 pg_blocking_pids 诊断
---

# 锁与并发控制：谁在阻塞谁

## 一、问题场景

三个都真实会发生、且都不好排查的现象：

1. **一条 `SELECT` 被卡住了。** PG 不是"读不加锁"吗？为什么读也会等？
2. **`ALTER TABLE` 加一个索引，整张表的访问全停了。** 明明只是加索引，没改数据。
3. **两条 `UPDATE` 各自等对方，最后一条被数据库杀掉**，报 `deadlock detected`。

这三个问题指向同一套东西：**MVCC 只解决了「读和写之间的可见性」，没有解决「写和写之间」的互斥，也没有解决「结构变更与数据访问」的互斥。** 那部分仍然要靠锁。

## 二、锁的层次与冲突矩阵 {#lock-matrix}

PG 的锁分两个层次：**表级**（8 种模式）和**行级**（4 种模式）。先看表级，因为**大部分"莫名其妙被阻塞"都是表级锁造成的**。

| 模式 | 谁获取 | 与他人冲突情况 |
|---|---|---|
| `ACCESS SHARE` | `SELECT` | **只与 `ACCESS EXCLUSIVE` 冲突** |
| `ROW SHARE` | `SELECT FOR UPDATE/SHARE` | 与 `EXCLUSIVE`、`ACCESS EXCLUSIVE` 冲突 |
| `ROW EXCLUSIVE` | `INSERT` / `UPDATE` / `DELETE` | 与 `SHARE` 及以上冲突 |
| `SHARE UPDATE EXCLUSIVE` | `VACUUM`、`ANALYZE`、`CREATE INDEX CONCURRENTLY` | 与自身及以上（不含 `SHARE`）冲突 |
| `SHARE` | `CREATE INDEX`（非并发）| 与 `ROW EXCLUSIVE` 及以上冲突 |
| `SHARE ROW EXCLUSIVE` | 极少使用 | 与自身及以上冲突 |
| `EXCLUSIVE` | 少见 | 与除 `ACCESS SHARE` 外全部冲突 |
| `ACCESS EXCLUSIVE` | `ALTER TABLE`、`DROP TABLE`、`TRUNCATE`、`VACUUM FULL`、`REINDEX` | **与所有模式冲突** |

**三条要记住的推论**：

1. **普通 DML 之间不互相挡表**。`ROW EXCLUSIVE` 与自身不冲突——两个事务更新**不同的行**，可以真正并行。
2. **`SELECT` 只挡 `ACCESS EXCLUSIVE`**。所以正常情况下读不会等任何写。
3. **`CREATE INDEX`（不带 `CONCURRENTLY`）要 `SHARE` 锁**——它不挡读，但**挡所有写**。大表上这次建索引期间，业务写全部排队。

## 三、行锁的真相：为什么 PG 不会锁升级 {#row-lock}

这是 PG 与 MySQL 一个**结构性差异**，面试里问到就是加分项。

| | MySQL / InnoDB | PostgreSQL |
|---|---|---|
| 行锁记在哪 | **内存里的锁结构**（锁表 + 位图）| **元组的头上**（改 `xmax` + 标志位）|
| 锁数量与内存关系 | 有：锁记录多会吃锁内存 | **无关**：锁不占共享内存 |
| 锁升级 | 锁内存不足时会升级（退化到更大粒度）| **不存在锁升级** |
| 多个共享锁怎么表示 | 位图 | `MultiXact` ID |
| 代价 | 锁信息好查（`performance_schema`）| 查锁要看元组头，`pg_locks` 里行锁信息不直观 |

**为什么 PG 能把锁放在元组头上？** 因为那个元组本来就有 `xmax` 字段表示「谁删了它」。行锁复用了这个位置：把 `xmax` 设成锁持有者的事务 ID，再在 `t_infomask` 里标记「这是锁，不是删除」。

**这条设计的直接收益**：**更新一亿行、开一百万个事务各锁一行，也不会因为"锁太多"而升级成表锁。** MySQL 侧要担心的锁升级问题在 PG 里根本不存在。

**代价**：行锁的信息分散在数据页里，`pg_locks` 只能看到「某个事务在某个关系上持有 `tuple` 锁」的汇总，**具体锁了哪一行要靠 `ctid` 推断**。这也是为什么 PG 的锁诊断更依赖 `pg_blocking_pids()` 而不是直接读锁表。

### 3.1 四种行级锁 {#row-lock-modes}

| 模式 | 谁获取 | 强度 | 设计意图 |
|---|---|---|---|
| `FOR UPDATE` | 显式 `SELECT ... FOR UPDATE` | 最强 | 我要改它，且改的是**键列或需要独占** |
| `FOR NO KEY UPDATE` | **普通 `UPDATE` 默认拿这个** | 次强 | 不改键列；**不与 `FOR KEY SHARE` 冲突** |
| `FOR SHARE` | 显式 `SELECT ... FOR SHARE` | 次弱 | 我读它并要求它别被改（多个可共存）|
| `FOR KEY SHARE` | **外键检查时自动拿** | 最弱 | 只要键列不变就行；**不挡 `FOR NO KEY UPDATE`** |

**`FOR NO KEY UPDATE` 与 `FOR KEY SHARE` 不冲突**，这是为外键优化设计的：父表某行的**非键列**被更新时，子表的外键检查不需要被阻塞。这条优化让"带外键的表"在高并发下不至于互相卡死。

### 3.2 死锁 {#deadlock}

PG 有自动死锁检测：一个事务等待超过 `deadlock_timeout`（默认 **1 秒**）后会触发一次检测，发现环就中止其中一个事务，报 `deadlock detected`。

> **注意 `deadlock_timeout` 的含义**：它不是"等 1 秒就报错"，而是"等 1 秒才开始检查"。而且**每个事务都要先等满这 1 秒**，所以死锁的暴露有延迟。把它调小会让检测频繁（消耗 CPU），调大则死锁持有时间更长——默认值通常够用。

## 四、DDL 锁为什么能停表 {#ddl-lock}

### 4.1 锁队列的"插队"效应 {#lock-queue}

PG 的锁授予是**队列化**的：一个请求拿不到锁就排队，**后面的请求即使与当前持有者不冲突，也要排在它后面**。

这条规则推出了 PG 上最经典的运维事故：

```
① 业务在跑 SELECT（持 ACCESS SHARE）
        │
② ALTER TABLE 请求 ACCESS EXCLUSIVE —— 与 ① 不冲突（① 是读）？
   实际上 ACCESS EXCLUSIVE 与 ACCESS SHARE 冲突 → 排队等待
        │
③ 新的 SELECT 到达 → 它想拿 ACCESS SHARE
   但队列里有个 ACCESS EXCLUSIVE 在等 → 它必须排在后面
        │
④ 于是：SELECT 被一个"只是想改表结构"的请求挡住了
   → 后续所有查询全部堆积 → 连接池打满 → 故障扩散
```

**关键点：挡住的不是"已经持锁的人"，而是"排队中的 DDL"。** 所以一个"本来几毫秒就能完成"的 `ALTER TABLE`，只要它拿不到锁，就会变成整个业务面的阻塞源。

**正确做法**：DDL 前先设锁超时，拿不到就退让、稍后重试——

```sql
BEGIN;
SET LOCAL lock_timeout = '3s';       -- 拿不到锁 3 秒就放弃，不占队列
SET LOCAL statement_timeout = '30s';
ALTER TABLE t_order ADD COLUMN remark text;
COMMIT;
```

这样做的好处：**DDL 请求不会在队列里长期占位**，业务查询不会被它牵连。失败就重试，直到等到一个流量低谷。

### 4.2 各 DDL 的锁与替代方案 {#ddl-alternatives}

| 操作 | 锁 | 阻塞范围 | 在线替代 |
|---|---|---|---|
| `CREATE INDEX` | `SHARE` | 写全停、读不受影响 | **`CREATE INDEX CONCURRENTLY`** |
| `ALTER TABLE ... ADD COLUMN`（带默认值）| `ACCESS EXCLUSIVE` | 全停，但**自 PG 11 起是元数据操作、秒级完成** | 加列本身已够快，关键是"拿锁"那一下 |
| `ALTER TABLE ... ALTER COLUMN TYPE` | `ACCESS EXCLUSIVE` | **全停，且会重写整表** | 加新列 + 回填 + 切换 |
| `DROP INDEX` | `ACCESS EXCLUSIVE`（旧版）| 全停 | **`DROP INDEX CONCURRENTLY`**（9.2+）|
| `VACUUM FULL` | `ACCESS EXCLUSIVE` | 全停 | `pg_repack` |

**`CREATE INDEX CONCURRENTLY` 的代价**（面试常追问）：

- **要扫两遍表**（第一遍建索引，第二遍校验既有行的可见性），总耗时约为普通建索引的两倍以上；
- 不能放在事务块里（因为它需要多个独立快照）；
- **失败会留下一个 `INVALID` 状态的索引**——它占空间、写时也要维护，但查询用不了。必须 `DROP INDEX CONCURRENTLY` 清掉再重建；
- 高峰期仍会与 `VACUUM` 抢 `SHARE UPDATE EXCLUSIVE` 锁。

## 五、SSI：PG 的可串行化不是加锁 {#ssi}

PG 的 `SERIALIZABLE` 用的是 **SSI（Serializable Snapshot Isolation）**，一种**乐观**实现——与 MySQL 侧"给读加间隙锁、写加更多锁"的思路方向相反。

```
   运行期：不加额外锁，只在读/写同一数据时记录"依赖关系"
                    │
                    ▼
   提交前：检查依赖图里有没有「危险的环」
           （两个事务互相读对方写的版本 → rw-antidependency 环）
                    │
                    ▼
   有环 → 中止其中一个，报错：
          could not serialize access due to read/write
          dependencies among transactions
```

**这意味着两件事**：

1. **应用必须能处理重试**。用 `SERIALIZABLE` 却把序列化失败当异常抛给用户，是选型错误——这个错误码（`40001`）的语义就是「**换个时机重来一遍就行**」。
2. **它不会为了避免冲突而让事务互相等待**——代价从"延迟"转移到了"重试率"。在读多写少、冲突稀疏的场景下，SSI 的吞吐显著优于传统加锁实现；在高冲突场景下，重试率会失控。

| | MySQL `SERIALIZABLE` | PG `SERIALIZABLE`（SSI）|
|---|---|---|
| 思路 | 悲观：读写都加锁（含间隙锁）| 乐观：不加锁，提交前检测依赖环 |
| 冲突代价 | 等待、易死锁 | **中止 + 应用重试** |
| 读阻塞写 | 会 | 不会 |
| 适合 | 冲突少的短事务 | 冲突少的事务 + **应用支持重试** |

> **面试里怎么答**：「PG 的可串行化是 SSI，乐观检测，冲突时中止事务让应用重试，所以要配重试逻辑；MySQL 的可串行化靠加锁，容易死锁。**两者代价不同，不是同一个东西的两种实现。**」

## 六、四类意外阻塞与诊断 {#surprises}

### 6.1 四类"明明逻辑没问题却被挡住" {#four-blocks}

| # | 现象 | 根因 | 处理 |
|---|---|---|---|
| 1 | 全库变慢、`pg_stat_activity` 有长时间 `idle in transaction` | 事务开着不提交，**持锁 + 顶住 VACUUM 水位** | `idle_in_transaction_session_timeout` |
| 2 | DDL 一直等不到锁 | 有长事务/长查询占着 `ACCESS SHARE` | `lock_timeout` + 低峰重试 |
| 3 | 有 `prepared transaction` 长期挂着 | 两阶段提交的应用崩溃，事务留在 `pg_prepared_xacts` | 排查并 `ROLLBACK PREPARED` |
| 4 | 更新父表时把子表相关的写都挡住了 | **外键列没建索引**：外键检查要扫子表并加 `KEY SHARE` 锁，范围被放大 | **给所有外键列建索引**（PG 不会自动建）|

**第 4 条是 PG 特有的**：MySQL 建外键时会自动创建索引，PG **不会**。所以「更新父表某一行，却把子表的大量行锁住」在 PG 上是"缺索引"这个简单原因造成的，排查起来却极不直观。

### 6.2 诊断语句 {#blocking-diag}

```sql
-- 一眼看出「谁被谁挡住了」
SELECT blocked.pid,
       blocked.state,
       now() - blocked.query_start AS waited,
       left(blocked.query, 50) AS blocked_query,
       blocker.pid AS blocker_pid,
       left(blocker.query, 50) AS blocker_query
FROM pg_stat_activity blocked
JOIN LATERAL unnest(pg_blocking_pids(blocked.pid)) AS b(pid) ON true
JOIN pg_stat_activity blocker ON blocker.pid = b.pid;
```

`pg_blocking_pids(pid)` 是 PG 9.6+ 提供的函数，**直接把阻塞链算好了**，不用自己去 `pg_locks` 里做自连接——这是 PG 侧诊断比 MySQL 侧（要看 `sys.innodb_lock_waits` 之类）更省事的地方。

```sql
-- 当前所有非 ACCESS SHARE 的表级锁，找出"谁在挡 DDL"
SELECT relation::regclass, mode, granted, pid
FROM pg_locks
WHERE locktype = 'relation' AND mode <> 'AccessShareLock'
ORDER BY relation;
```

## 七、面试高频索引 {#interview}

| # | 问题 | 一句话答案 | 出处 |
|---|---|---|---|
| 1 | PG 的表级锁有几种模式？ | 8 种，从 `ACCESS SHARE` 到 `ACCESS EXCLUSIVE` | [冲突矩阵](#lock-matrix) |
| 2 | 普通 SELECT 会被什么挡住？ | 只会被 `ACCESS EXCLUSIVE` 挡住（含排队中的）| [冲突矩阵](#lock-matrix) |
| 3 | 两个事务更新不同的行会互相挡吗？ | 不会，`ROW EXCLUSIVE` 与自身不冲突 | [冲突矩阵](#lock-matrix) |
| 4 | **PG 的行锁记在哪里？** | **元组头上**（复用 `xmax` + 标志位），不在共享内存 | [行锁真相](#row-lock) |
| 5 | PG 会有锁升级吗？ | 不会，行锁不占锁内存，不存在因锁太多而降级 | [行锁真相](#row-lock) |
| 6 | 多个事务对同一行加共享锁怎么表示？ | `MultiXact` ID | [行锁真相](#row-lock) |
| 7 | 普通 UPDATE 拿的是哪种行锁？ | `FOR NO KEY UPDATE`，与 `FOR KEY SHARE` 不冲突 | [四种行级锁](#row-lock-modes) |
| 8 | 死锁多久被发现？ | 等满 `deadlock_timeout`（默认 1s）才开始检测 | [死锁](#deadlock) |
| 9 | **为什么一个 ALTER TABLE 能卡死整个业务？** | 锁队列 FIFO：排队中的 `ACCESS EXCLUSIVE` 会挡住后续所有 SELECT | [锁队列插队](#lock-queue) |
| 10 | DDL 前该做什么防护？ | 先 `SET LOCAL lock_timeout`，拿不到就退让重试 | [锁队列插队](#lock-queue) |
| 11 | `CREATE INDEX CONCURRENTLY` 的代价？ | 扫两遍表、不能放事务里、**失败留 INVALID 索引** | [DDL 替代方案](#ddl-alternatives) |
| 12 | PG 加列会重写表吗？ | 带默认值时自 PG 11 起不会，是元数据操作 | [DDL 替代方案](#ddl-alternatives) |
| 13 | PG 的 SERIALIZABLE 和 MySQL 一样吗？ | 不一样：PG 是 SSI 乐观检测，冲突中止让应用重试 | [SSI](#ssi) |
| 14 | SSI 报错后应用该怎么办？ | 换时机重试（`40001` 的语义就是"再来一次"）| [SSI](#ssi) |
| 15 | PG 会为外键自动建索引吗？ | **不会**。不建索引会导致父表更新时锁范围被放大 | [意外阻塞](#four-blocks) |
| 16 | 怎么一次查出阻塞链？ | `pg_blocking_pids(pid)`，不用自己连 `pg_locks` | [诊断](#blocking-diag) |

> **本篇与 [MVCC 与 VACUUM](/database/postgresql/mvcc-and-vacuum) 的分工**：那边讲「读写的可见性怎么判」，本篇讲「写写互斥与结构变更怎么排队」。**MVCC 不提供互斥，锁才提供**——这是两篇的分界线。
