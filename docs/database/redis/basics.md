---
order: 1
date: 2026-09-12
title: 基础篇：数据模型与命令体系
desc: NoSQL 与 SQL 的分界、五大结构命令速查、Jedis→Lettuce→Spring Data Redis 的客户端演进与序列化坑
---

# 基础篇：数据模型与命令体系

## 一、NoSQL 与 SQL：解决的是不同问题 {#nosql-vs-sql}

| 维度 | SQL（关系型） | NoSQL（以 Redis 为例） |
|---|---|---|
| 数据模型 | 结构化，先定义表结构 | 灵活的 KV / Document / 图，无 schema 约束 |
| 数据关联 | 外键 + JOIN，关联查询是常态 | 无关联，聚合结构一次取全 |
| 查询方式 | SQL 声明式查询，能力强 | 命令式 API，按结构定制 |
| 事务 | ACID，强一致 | 多为 BASE，最终一致（Redis 有 MULTI/EXEC 但无回滚） |
| 扩展方式 | 垂直为主，水平分库成本高 | 天然适合水平扩展 |

**结论式的判断**：不是替代关系，是分工关系。MySQL 管「必须强一致、要复杂查询」的核心数据，Redis 管「读多写少、可容忍短暂不一致、要极致速度」的热数据。把 Redis 当「更快的 MySQL」用是初学者最常见的架构误用。

## 二、Redis 的定位

- **内存 KV 数据库**：数据在内存，读写 O(1) 起步，单机 10 万级 QPS。
- **命令执行单线程**（6.0 后网络读写多线程，命令执行仍单线程）——无锁、无竞争，这是它模型简单可靠的根源。
- 五大基础结构 + 若干特种结构（BitMap/HyperLogLog/GEO 等，见[特种类型](/database/redis/special-data-types)），每个 Value 结构都有底层编码优化（见[底层原理](/database/redis/internals)）。

## 三、五大结构的命令体系

按「能存什么 → 常用命令 → 典型场景」压缩成一张速查表：

| 结构 | 元素 | 核心命令 | 典型场景 |
|---|---|---|---|
| String | 字符串/数字 | SET / GET / INCR / SETNX / MSET | 对象 JSON 缓存、计数器、分布式锁（见[锁](/database/redis/lock-and-mq)） |
| Hash | field-value 对 | HSET / HGET / HMGET / HGETALL / HINCRBY | 对象的部分字段更新（比整体 JSON 省网络） |
| List | 双端链表 | LPUSH / RPUSH / LPOP / RPOP / BRPOP / LRANGE | 简单队列、最新列表（朋友圈时间线） |
| Set | 无序去重 | SADD / SREM / SINTER / SUNION / SDIFF | 标签、抽奖去重、共同关注 |
| ZSet | member + score | ZADD / ZINCRBY / ZRANGE / ZREVRANGE / ZRANGEBYSCORE | 排行榜、延迟队列（score 存执行时间） |

三个容易踩的细节：

1. `KEYS pattern` 是 O(N) 全库扫描，线上禁用，用 `SCAN` 渐进遍历（见[最佳实践](/database/redis/best-practices)）。
2. `HGETALL` 对大 Hash 是网络+阻塞双杀，大 Hash 只 `HMGET` 需要的 field。
3. `EXPIRE` 是对整个 key 的，Hash 无法对单个 field 设置过期——需要 field 级 TTL 就换结构或存过期时间戳自己判断。

## 四、Java 客户端演进

### 1. Jedis：老牌但线程不安全

Jedis 的连接是非线程安全的，多线程共享一个实例会报错，必须配连接池：

```java
JedisPool pool = new JedisPool("127.0.0.1", 6379);
try (Jedis jedis = pool.getResource()) {
    jedis.set("k", "v");
}
```

每个请求借还连接，高并发下连接管理是额外负担。

### 2. Lettuce：基于 Netty，线程安全

单连接多路复用，线程安全，支持异步/响应式 API，Spring Boot 2 起默认客户端。这也是 Spring Data Redis 默认选它的原因：不需要池化，连接数与线程数解耦。

### 3. Spring Data Redis：统一抽象

```java
@Bean
public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory factory) {
    RedisTemplate<String, Object> template = new RedisTemplate<>();
    template.setConnectionFactory(factory);
    template.setKeySerializer(new StringRedisSerializer());
    template.setValueSerializer(new GenericJackson2JsonRedisSerializer());
    template.setHashKeySerializer(new StringRedisSerializer());
    template.setHashValueSerializer(new GenericJackson2JsonRedisSerializer());
    return template;
}
```

**必须改默认序列化器**——这是新手第一大坑：

| 序列化器 | 问题 |
|---|---|
| JdkSerializationRedisSerializer（默认） | 二进制乱码、体积大、类必须实现 Serializable、跨语言不可读 |
| GenericJackson2JsonRedisSerializer（推荐） | JSON 可读、自带 `@class` 类型信息支持反序列化回原类型 |
| StringRedisSerializer | 纯字符串场景最省空间，但对象要自己转 JSON |

另一个高频坑：`@class` 类型信息要求反序列化时有对应的类路径。缓存对象跨服务共享或经历重构后包名变化，反序列化会直接失败——所以缓存 JSON 结构要尽量稳定，或用 StringRedisSerializer + 手动 JSON，把类型问题留在业务层。

## 五、易混辨析

| 辨析 | 结论 |
|---|---|
| RedisTemplate vs StringRedisTemplate | 前者泛型 Object + 可配序列化器；后者 key/value 都是 String。混用时同一 key 两套序列化互不兼容，**一个项目里要统一** |
| Hash 存对象 vs String 存 JSON | 需要部分字段读写、字段独立过期语义 → Hash；整体读写、结构嵌套深 → String JSON（内存对比见[最佳实践](/database/redis/best-practices)） |
| EXISTS vs 拿值判空 | 判断存在性用 EXISTS，不要 GET 回整个 Value——大 Value 场景差一次全量传输 |

## 六、面试问答

**Q: Redis 和 MySQL 怎么分工？**
按数据特征分工：强一致、复杂查询留给 MySQL；高读频、可容忍毫秒级陈旧的热数据放 Redis。关键是想清楚「这份缓存 miss 一次的代价」和「短暂不一致的业务后果」，两者决定缓存策略（见[缓存模式](/database/redis/cache-patterns)）。

**Q: 为什么 Spring Boot 默认用 Lettuce 而不是 Jedis？**
Lettuce 基于 Netty，单连接多路复用、线程安全，连接数不随线程数增长；Jedis 每线程要独占连接，高并发下连接池成为瓶颈。Lettuce 还原生支持哨兵/集群的自动拓扑刷新。

**Q: SET 和 MSET 有什么性能区别？**
N 次 SET 是 N 次网络往返；MSET 一次批量提交，省 N-1 次 RTT。这个思路展开就是 Pipeline 和批处理优化（见[最佳实践](/database/redis/best-practices)）。

**Q: 「你们项目里 Redis 都用来做什么」怎么答？**
不要罗列五种数据类型，按**业务问题**回答：热点数据做缓存、并发扣减加锁、点赞阅读量用原子计数、登录令牌靠 TTL 自动失效、异步削峰用 List/Stream、定时关单这类延迟任务用 ZSet。完整的一览表与选型口径见[场景地图与选型叙事](/database/redis/scenarios)。
