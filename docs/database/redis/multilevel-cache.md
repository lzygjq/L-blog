---
order: 7
date: 2026-09-12
title: 多级缓存：亿级流量架构
desc: 传统缓存链路的两处瓶颈、Nginx+Lua/Caffeine/Redis 多级架构、Canal 驱动的缓存同步闭环
---

# 多级缓存：亿级流量架构

当单靠 Redis 缓存也扛不住时（目标 QPS 进入十万/百万级），优化的方向只有一个：**在请求到达后端之前，让每一跳都尽可能终结它**。这就是多级缓存——它不是「多加一层 Redis」，而是把缓存下推到请求链路的每个环节。

## 一、传统链路的两处瓶颈

```
客户端 → Nginx(反代) → Tomcat → Redis → DB
                          │
                 所有请求都要过 Tomcat 进程
```

1. **Tomcat 是性能天花板**：Servlet 模型每请求一线程（或虚拟线程调优），Tomcat 的连接与线程成本比 Nginx 事件模型高一个数量级。静态热点数据也要走到 Java 进程，Tomcat 就成了整个链路最贵的一跳。
2. **缓存失效冲击集中**：Redis 未命中（或 Redis 故障）时，全部压力瞬间落到 DB，之前的[三大问题](/database/redis/cache-patterns)在更高 QPS 下被放大。

## 二、多级缓存架构

```
浏览器缓存(HTTP 头)
   → Nginx 集群本地缓存(OpenResty + Lua / shared_dict)
      → Redis
         → Tomcat 进程缓存(Caffeine)
            → MySQL
```

两条设计原则：

1. **越靠前的层越快、越钝**：浏览器和 Nginx 层存的是「相对稳定」的数据（商品详情、店铺信息），命中即终结请求，根本不产生后端流量。
2. **Tomcat 进程缓存挡「实时性高但访问极热」的数据**：库存余量这类不适合放 Nginx 长缓存的，用 Caffeine 承接一跳，减少对 Redis 的 RTT。

## 三、Nginx 层：OpenResty + Lua

OpenResty = Nginx + LuaJIT，让 Lua 脚本在 Nginx 进程内执行业务逻辑，请求不必转发到 Tomcat：

- **shared_dict**：Nginx worker 间共享的内存字典，做本地热点缓存，读写微秒级。
- **Lua 查 Redis**：本地未命中时由 Lua 直连 Redis（cosocket），命中则直接返回 JSON——整条「本地缓存 → Redis → 响应」都在 Nginx 进程内闭环。

这一层的本质：**把「查详情」这种读接口的实现从 Java 下沉到边缘节点**。部署上业务 Nginx 按流量横向扩展，前面挂纯反代层做负载均衡。

## 四、Tomcat 层：Caffeine

JVM 进程内缓存的当前标准解（Guava Cache 的继任者）：

```java
Cache<String, Shop> cache = Caffeine.newBuilder()
        .maximumSize(100_000)                       // 容量上限，防 OOM
        .expireAfterWrite(Duration.ofSeconds(60))   // 写后过期
        .build();
```

两个必须回答的问题：

- **多实例一致性**：每台 Tomcat 各有一份本地缓存，DB 更新后其他实例的副本是陈旧的。解法不靠轮询，靠**主动失效广播**——下一节。
- **为什么不用 JVM 缓存替代 Redis**：内存容量受限于单机、无持久化、实例间不共享；进程缓存永远是 Redis 前面的「热上热」，不是替代品。

## 五、缓存同步：Canal 驱动的失效闭环

多级缓存的一致性难点在「DB 变了，N 台 Nginx + M 台 Tomcat 的本地缓存都要失效」。轮询 DB 或定时刷新都太粗糙，工程标准答案是事件驱动：

```
MySQL binlog → Canal（伪装成 MySQL 从库）
            → MQ（RabbitMQ/Kafka）
            → 各服务实例消费 → 删本地缓存（Nginx shared_dict / Caffeine）
```

收益与代价：

| 收益 | 代价 |
|---|---|
| 对业务代码零侵入（不用在写逻辑里埋失效调用） | 引入 Canal + MQ 两个中间件，运维复杂度上升 |
| binlog 完整性保证不漏 | 事件乱序需处理（携带时间戳/版本号） |
| 延迟毫秒级，远优于 TTL 自愈 | 本地缓存仍需 TTL 兜底（链路故障时不至于永久陈旧） |

这套链路与本站[Canal 数据同步](/bigdata/canal/)和 property 数仓入仓是同一套基础设施——一个 Canal 实例可以多路下游分发，这是中间件复用的典型样板。

## 六、效果验证思路

上线前后用同一压测脚本对比三组数据：链路各层命中率（Nginx 层应 >90%）、Tomcat QPS（多级化后应大幅下降）、Redis QPS（仍高但可控）。多级缓存的验收标准不是「加了」，而是**流量分布确实前移了**。

## 七、面试问答

**Q: 多级缓存和 Redis 集群扩容怎么选？**
先看瓶颈在哪：Redis 本身扛不住（CPU/带宽）→ 扩分片集群；Redis 不是瓶颈、Tomcat 和链路才是 → 多级缓存。多数「亿级」叙事里两者共存：集群保数据层容量，多级化砍链路流量。

**Q: 本地缓存的一致性怎么保证？**
事件驱动失效（Canal→MQ→广播删）为主，TTL 兜底为辅。要坦白承认：只要有多副本就有不一致窗口，工程目标是把窗口压到业务可接受，不是消灭它。

**Q: 为什么第一层缓存放 Nginx 而不是直接上 CDN？**
静态资源和不常变的页面片段直接上 CDN 更前置；Nginx 层放的是「个性化但读多」的动态数据（带鉴权、按城市/类目聚合），CDN 覆盖不了。两者是互补不是替代。
