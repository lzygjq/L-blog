---
order: 0
date: 2026-09-12
desc: Redis 知识地图、学习主线与面试高频清单
---

# Redis · 导览

Redis 是「数据存储」板块里工程含量最高的一块：它既是缓存组件，又是分布式锁与消息队列的轻量实现，还是高可用架构（主从/哨兵/分片）的完整样本。本板块按「会用 → 懂原理 → 会设计 → 能扛量」四层组织。

## 一、学习主线

| # | 主题 | 定位 | 状态 |
|---|---|---|---|
| 1 | [基础篇：数据模型与命令体系](/database/redis/basics) | 会用：五大结构、命令体系、Java 客户端 | ✅ 已成篇 |
| 2 | [底层原理：数据结构与网络模型](/database/redis/internals) | 懂原理：SDS/跳表/IO 多路复用/内存淘汰 | ✅ 已成篇 |
| 3 | [缓存模式：三大问题与一致性](/database/redis/cache-patterns) | 会设计：穿透/击穿/雪崩、更新策略 | ✅ 已成篇 |
| 4 | [分布式锁与消息队列](/database/redis/lock-and-mq) | 会设计：锁演进、Redisson、三种 MQ | ✅ 已成篇 |
| 5 | [特种类型：BitMap / HyperLogLog / GEO](/database/redis/special-data-types) | 会设计：亿级统计的场景化选型 | ✅ 已成篇 |
| 6 | [持久化、主从与集群](/database/redis/ha-cluster) | 能扛量：RDB/AOF、哨兵、分片集群 | ✅ 已成篇 |
| 7 | [多级缓存：亿级流量架构](/database/redis/multilevel-cache) | 能扛量：Nginx+Lua / Caffeine / Canal | ✅ 已成篇 |
| 8 | [最佳实践：键值设计与运维清单](/database/redis/best-practices) | 工程化：BigKey、批处理、服务端配置 | ✅ 已成篇 |

**推荐顺序**：1 → 2 打地基（命令背后的编码方式决定了 8 里所有最佳实践）；3 → 4 → 5 是面试主战场；6 → 7 面向架构演进；8 是上线前的 checklist。

## 二、板块约定

- 命令示例基于 Redis 7.x；客户端示例基于 Spring Data Redis（Lettuce）。
- 高可用部分与本地 Docker Compose「1 主 2 从 + 3 哨兵」环境对应，可直接复现。
- 多级缓存一篇与[数据仓库板块的 Canal](/bigdata/canal/)共享数据同步链路，交叉引用不重复展开。

## 三、面试高频（按出现频率排序）

1. 缓存穿透/击穿/雪崩的区别与组合方案（板块 3）
2. 缓存与数据库一致性：为什么是「先更新库再删缓存」+ 延迟双删/Canal 兜底（板块 3）
3. Redis 为什么快：内存 + 单线程无锁 + IO 多路复用 + 高效编码（板块 2）
4. RDB vs AOF 选型与混合持久化（板块 6）
5. 主从复制的全量/增量流程，哨兵如何完成故障转移（板块 6）
6. 分布式锁的演进：SETNX 的三个坑 → Redisson 看门狗（板块 4）
7. Redis 分片集群的插槽机制：怎么定位、怎么扩容（板块 6）
8. BigKey 的发现与治理（板块 8）
9. 用 Redis 实现消息队列的三种方式及局限（板块 4）
10. 十万级 UV 统计为什么用 HyperLogLog 而不是 Set（板块 5）
