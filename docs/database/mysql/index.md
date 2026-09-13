---
order: 0
date: 2026-09-14
desc: MySQL 知识地图、学习主线与面试高频清单
---

# MySQL · 导览

MySQL 是「数据存储」板块的地基。它看起来只是一句 `select * from t where id = 1`，但这句 SQL 背后要经过**存储引擎选型 → B+ 树索引定位 → 事务隔离与 MVCC 可见性判断 → 日志持久化 → 主从复制分发**五层机制。面试考的也从来不是"会不会写 SQL"，而是**这五层你拆到哪一层**。

本板块按「会选型 → 懂索引 → 会诊断 → 懂事务 → 能扛量」五层组织。

## 一、学习主线

| # | 主题 | 定位 | 状态 |
|---|---|---|---|
| 1 | [存储引擎：InnoDB 与 MyISAM](/database/mysql/storage-engine) | 会选型：三种引擎的差异、行锁与表锁的实际代价 | ✅ 已成篇 |
| 2 | [索引底层：B+ 树与聚簇索引](/database/mysql/index-structure) | 懂原理：数据结构演进、页与 IO 的量化推演、回表 | ✅ 已成篇 |
| 3 | [索引设计：原则、覆盖索引与失效](/database/mysql/index-design) | 会设计：最左前缀、覆盖索引、9 种失效场景 | ✅ 已成篇 |
| 4 | [慢查询定位与 SQL 优化](/database/mysql/diagnosis) | 会诊断：慢日志、EXPLAIN 字段速查、超大分页 | ✅ 已成篇 |
| 5 | [事务：ACID 与隔离级别](/database/mysql/transaction) | 懂原理：三大并发问题、四级隔离级别 | ✅ 已成篇 |
| 6 | [日志体系：redo / undo / binlog](/database/mysql/log) | 懂原理：WAL、组提交、两阶段提交 | ✅ 已成篇 |
| 7 | [MVCC 与锁](/database/mysql/mvcc) | 懂原理：版本链、ReadView、Next-Key Lock | ✅ 已成篇 |
| 8 | [主从复制与读写分离](/database/mysql/replication) | 能扛量：三种复制模式、主从延迟治理 | ✅ 已成篇 |

**推荐顺序**：1 → 2 是地基（不懂 B+ 树，后面所有"索引为什么失效"都是死记）；**3 → 4 是面试主战场与日常最常用**；5 → 6 → 7 是一条因果链——**事务要 ACID → 靠日志实现 → 隔离性靠 MVCC 和锁**，断开任何一环都只能背结论；8 面向架构演进。分库分表单独成篇，见[分库分表](/database/sharding/)。

## 二、板块约定

- 示例基于 **MySQL 8.0 + InnoDB**；涉及 5.7 差异的地方会单独标注（如 `.frm` 文件、并行复制）。
- 所有"索引失效""回表"的判断，**统一以 `EXPLAIN` 的 `key` 与 `Extra` 字段为准**，不靠经验猜。
- 与[分库分表](/database/sharding/)的分工：单库单表内的优化在本板块，跨库跨表的路由、扩容、分布式事务在那篇；与 [Redis](/database/redis/) 的交界是缓存一致性，在缓存篇展开。

## 三、面试高频清单

按出现频率排序，括号内是答案所在篇目：

| # | 问题 | 篇目 |
|---|---|---|
| 1 | 索引为什么用 B+ 树？为什么不用 B 树或红黑树？ | [索引底层](/database/mysql/index-structure) |
| 2 | 什么情况下索引会失效？ | [索引设计](/database/mysql/index-design) |
| 3 | 聚簇索引和非聚簇索引的区别？什么是回表？ | [索引底层](/database/mysql/index-structure) |
| 4 | 什么是覆盖索引？超大分页怎么优化？ | [索引设计](/database/mysql/index-design) |
| 5 | 事务的 ACID 靠什么实现？ | [事务](/database/mysql/transaction) |
| 6 | MySQL 默认隔离级别是什么？RR 能解决幻读吗？ | [事务](/database/mysql/transaction) |
| 7 | undo log 和 redo log 的区别？binlog 呢？ | [日志体系](/database/mysql/log) |
| 8 | MVCC 是怎么实现的？RC 和 RR 差在哪？ | [MVCC 与锁](/database/mysql/mvcc) |
| 9 | 一个 SQL 执行很慢，你怎么分析？ | [慢查询定位](/database/mysql/diagnosis) |
| 10 | InnoDB 和 MyISAM 的区别？ | [存储引擎](/database/mysql/storage-engine) |
| 11 | 主从复制的原理？主从延迟怎么解决？ | [主从复制](/database/mysql/replication) |
| 12 | 分库分表的时机和策略？ | [分库分表](/database/sharding/) |

> **一个提醒**：这 12 题里有 5 题的答案都落在"**索引**"上。如果时间只够看两篇，选 [索引底层](/database/mysql/index-structure) 和 [索引设计](/database/mysql/index-design)。
