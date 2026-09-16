---
date: 2026-09-16
title: 缓存抽象：@Cacheable 的生效条件与失效清单
sidebar: 缓存抽象
order: 1
desc: 四件套语义差异、CacheManager SPI 与 Caffeine/Redis 选型、Key 与 SpEL、五类注解失效、与 @Transactional 的顺序陷阱、脏缓存的成因与破法、Redis 序列化器的坑、多实例本地缓存不同步、命中率观测
---

# 缓存抽象：@Cacheable 的生效条件与失效清单

`@Cacheable` 是 Spring 里**最容易被当成"魔法"**的一个注解。写上一行，方法就"快了"——直到某天发现缓存从来没命中，或者更糟：**更新了数据库，接口还返回旧数据**。

这两种故障的根因完全不同。前者是**注解没生效**（代理、条件、key 的问题），后者是**生效了但语义不对**（与事务的顺序、多实例不同步的问题）。它们的共同点是：**都不报错**。缓存失效不会抛异常，它只是安静地做错事。

> **主线：`@Cacheable` 不是"加速注解"，而是一段被代理织入的"查缓存 → 未命中则执行 → 写回缓存"逻辑。**
>
> 理解缓存问题只需要问三个问题：**这段逻辑有没有被执行**（代理与条件）、**它读写的 key 是不是同一个**（key 生成）、**它和事务谁先谁后**（顺序）。
>
> 三问之外才是缓存策略本身（TTL 设计、穿透/击穿/雪崩、一致性方案）。**策略属于缓存组件，顺序与生效属于 Spring**——本篇只讲后者，前者的完整推导见 [缓存模式：三大问题与一致性](/database/redis/cache-patterns)。

## 一、问题场景：为什么"加了缓存反而更慢" {#why-cache}

先看一段"看起来没问题"的代码：

```java
@Service
public class ProductService {

    @Cacheable("products")
    public ProductVO getById(Long id) {
        return loadFromDb(id);          // 假设这里要 200ms
    }

    public void updatePrice(Long id, BigDecimal price) {
        updateDb(id, price);            // 更新了数据库
        this.getById(id);               // 想刷新缓存，实际上没有
    }
}
```

两个问题同时存在：

| 表现 | 根因 | 后果 |
|---|---|---|
| 缓存从不命中 | `@Cacheable("products")` 的默认 key 是 `SimpleKey`，参数变化时 key 也变——**这不是 bug，但**如果缓存名没纳入配置、TTL 为 0，条目会立刻失效 | 每次都查库，缓存成了纯开销 |
| 更新后仍返回旧值 | `this.getById(id)` 走的是**原始对象**，不经过代理 | **脏缓存**，且会一直脏到 TTL 到期 |

第二行是 Spring 缓存最经典的坑，它和 `@Transactional` 失效是**同一类问题**——都源于"自调用不走代理"。相关内容见 [AOP 与代理机制](/java/spring/spring-framework/aop/)。

**先记住一个判断顺序**：遇到缓存问题时，第一个要确认的不是"缓存配得对不对"，而是**"这段缓存逻辑到底有没有跑"**。后者可以用一行日志或一个断点验证，前者要靠猜。

## 二、四件套：语义差异比记忆更重要 {#four-annotations}

Spring Cache 抽象只有四个注解，但它们的**触发时机**和**对方法返回值的使用方式**完全不同。把这张表记住，能避免大半误用：

| 注解 | 触发时机 | 是否执行方法体 | 对返回值做什么 | 典型用途 |
|---|---|---|---|---|
| `@Cacheable` | **方法调用前**查缓存 | **命中则不执行** | 把返回值**写入**缓存 | 读多写少的查询 |
| `@CachePut` | **方法调用后** | **总是执行** | 把返回值**写入**（覆盖） | 更新后刷新缓存 |
| `@CacheEvict` | 方法调用后（可配 `beforeInvocation`） | 总是执行 | 从缓存**删除** | 删除数据时清缓存 |
| `@Caching` | — | — | 组合上面三种 | 一次操作涉及多个缓存 |

三个容易混淆的点：

**① `@Cacheable` 命中时不执行方法体，所以方法内的日志、埋点、参数校验都不会跑。** 这意味着**不能用 `@Cacheable` 做"带副作用的读"**——比如读的时候顺便记一次访问量。命中率越高，这个副作用越不可靠。

**② `@CachePut` 总是执行方法体，所以它不适合放在查询方法上。** 它必须返回**要放进缓存的那个对象**。如果方法返回 `void` 或返回 `boolean`，缓存里存的就会是 `null` / `true`：

```java
@CachePut(value = "products", key = "#id")     // ❌ 返回 boolean，缓存里是 true
public boolean updatePrice(Long id, BigDecimal price) { ... }

@CachePut(value = "products", key = "#id")     // ✅ 返回更新后的实体
public ProductVO updatePrice(Long id, BigDecimal price) {
    doUpdate(id, price);
    return getById(id);
}
```

也可以用 `key = "#result.id"` 让 key 从返回值推导——**前提是返回值不为 null**，否则会 NPE（`@CachePut` 在返回 null 时行为与 `@Cacheable` 不同，前者会尝试写入并可能触发异常）。

**③ `@CacheEvict(beforeInvocation = true)` 的语义是"先删再执行"。** 默认是方法执行**后**删，这样如果方法抛异常，缓存不会被误删。但如果方法内部会读同一个缓存（先删后写场景），就必须改成 `beforeInvocation = true`，否则会读到旧值写回：

| 配置 | 方法抛异常时 | 适用场景 |
|---|---|---|
| 默认（`false`，后删） | **不删**缓存 | 大多数删除操作 |
| `beforeInvocation = true`（先删） | **已删**，不会回滚 | 方法内部会访问同一缓存的场景 |

## 三、`CacheManager`：SPI 决定"缓存在哪" {#cache-manager}

Spring 缓存抽象的骨架只有三层接口：

```
注解（@Cacheable ...）
   │  AOP 拦截 + SpEL 解析
   ▼
CacheOperationSource ──▶ CacheInterceptor ──▶ CacheManager（SPI）
                                                 │
                                    ┌────────────┼────────────┐
                                    ▼            ▼            ▼
                              CaffeineCache  RedisCache    EhCache
                               （本地）      （分布式）    （本地/分布式）
```

`CacheManager.getCache(name)` 返回一个 `Cache`，后者只有 `get` / `put` / `evict` / `clear` 四个动作。**Spring 不关心缓存在哪，只关心这四个动作的语义。**

### 3.1 三种实现的能力边界 {#implementations}

| 维度 | Caffeine | Redis | 说明 |
|---|---|---|---|
| 位置 | JVM 堆内 | 独立进程 | — |
| 延迟 | 纳秒级 | 毫秒级（受网络影响） | 差距约 3 个数量级 |
| 容量上限 | **受 JVM 内存限制** | 受服务器内存限制 | 本地缓存撑大堆会加剧 GC |
| 多实例一致性 | **天然不一致** | 天然一致 | 这是选型的第一判据 |
| 淘汰策略 | W-TinyLFU + 时间 | TTL + 内存淘汰 | — |
| 适用 | 单实例 / 只读配置 / 作为一级缓存 | 多实例共享 / 需存活重启 | — |

**选型的第一问不是"谁快"，而是"这个数据允许各实例看到不同的值吗"**。商品详情页的文案、地域配置这类**可以容忍秒级不一致**的数据适合本地缓存；账户余额、库存这类**不允许不一致**的数据只能走 Redis（或干脆不缓存）。

### 3.2 配置方式：从"一个属性"到"按缓存名定制" {#configure}

最快的方式是一个属性：

```yaml
spring:
  cache:
    type: caffeine          # 或 redis / simple / none
    cache-names: products,categories    # 声明用到的缓存名
    caffeine:
      spec: maximumSize=1000,expireAfterWrite=10m
```

但**生产上更常见的是按缓存名分别配 TTL**，因为不同数据的生命周期差异极大（商品文案 1 小时、配置项 1 天、会话 7 天）。这时需要自定义 `CacheManager`：

```java
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CacheManager cacheManager(RedisConnectionFactory factory) {
        RedisCacheConfiguration defaults = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(10))
                .disableCachingNullValues()                    // 不缓存 null（防穿透另见下文）
                .serializeKeysWith(SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(SerializationPair.fromSerializer(
                        new GenericJackson2JsonRedisSerializer()));

        return RedisCacheManager.builder(factory)
                .cacheDefaults(defaults)
                .withCacheConfiguration("products",   defaults.entryTtl(Duration.ofMinutes(30)))
                .withCacheConfiguration("categories", defaults.entryTtl(Duration.ofHours(1)))
                .withCacheConfiguration("sessions",   defaults.entryTtl(Duration.ofDays(7)))
                .build();
    }
}
```

本地缓存则用 `CaffeineCacheManager`，并且注意 **`setCacheNames()` 与 `registerCustomCache()` 不能混用**——前者会让所有缓存共用同一个 spec：

```java
@Bean
public CacheManager cacheManager() {
    CaffeineCacheManager manager = new CaffeineCacheManager();
    manager.setCaffeine(Caffeine.newBuilder()           // 默认 spec（未单独注册的缓存用这个）
            .maximumSize(1000)
            .expireAfterWrite(Duration.ofMinutes(10))
            .recordStats());                            // 开启统计，用于观测命中率
    // 单独定制：一旦调用 registerCustomCache，前面 setCacheNames 设置的名称会被忽略
    manager.registerCustomCache("products", Caffeine.newBuilder()
            .maximumSize(500)
            .expireAfterWrite(Duration.ofMinutes(30))
            .recordStats()
            .build());
    return manager;
}
```

`recordStats()` 值得单独提一句：**不开启它，`Cache` 就没有命中率数据**，缓存就成了一个只能靠猜的黑盒。命中率的观测方式见[第九节](#observability)。

### 3.3 一个容易漏掉的框架变化：`@Fallback` {#fallback-bean}

写"默认 CacheManager"时，常见做法是 `@ConditionalOnMissingBean`。Spring Framework 6.2 起提供了一个更简洁的等价物 `@Fallback`——**当容器中已有同类型 Bean 时，被标注的 Bean 直接跳过**，框架内部大量使用它：

```java
@Bean
@Fallback                     // 只在没有其他 CacheManager 时生效
public CacheManager defaultCacheManager() {
    return new ConcurrentMapCacheManager();
}
```

这与 `@ConditionalOnMissingBean` 的区别在于：`@Fallback` 是**框架层的约定**，不依赖 Boot 的条件评估，因此在自定义 starter 里更轻量。注意它的判定发生在**同一类型**范围内，不区分 Bean 名称。

## 四、Key 生成：90% 的"缓存不命中"出在这里 {#key-spel}

默认策略是 `SimpleKeyGenerator`：

| 方法参数个数 | 生成的 key |
|---|---|
| 无参 | `SimpleKey.EMPTY` |
| 1 个 | **参数本身**（不是 `SimpleKey` 包装） |
| 多个 | `SimpleKey(params...)` |

这里有两个反直觉之处：

**① 只传一个参数时，key 就是那个对象。** 所以 `getById(Long id)` 的 key 是 `1L`、`2L`，而 `getById(ProductQuery q)` 的 key 是这个查询对象的**整体**——除非它正确实现了 `equals`/`hashCode`，否则每次请求都是新 key，**缓存永不命中**：

```java
// ❌ 用普通对象作参数，未重写 equals/hashCode → 永远不命中
@Cacheable("products")
public ProductVO query(ProductQuery query) { ... }

// ✅ 显式指定由哪个字段参与 key
@Cacheable(value = "products", key = "#query.id")
public ProductVO query(ProductQuery query) { ... }
```

**② `key` 是 SpEL，而 SpEL 的参数名依赖编译参数。** 默认情况下 `-parameters` 在 Spring Boot 的 Maven/Gradle 插件里是**开启的**，所以 `#id` 能工作；但如果项目自定义了编译配置、或用了 Lombok 之外的其他处理器，参数名可能丢失，此时必须回退到 `#p0` / `#a0`。

`key` 与 `condition` / `unless` 的差别也是高频考点：

| 属性 | 求值时机 | 能否引用返回值 | 典型用途 |
|---|---|---|---|
| `key` | 调用前 | ❌ | 决定缓存的键 |
| `condition` | **调用前** | ❌ | 决定"要不要查缓存"（false 时完全不碰缓存） |
| `unless` | **调用后** | ✅ `#result` | 决定"要不要写缓存" |

```java
@Cacheable(value = "products",
           key = "#id",
           condition = "#id > 0",          // id 非法时不查缓存
           unless = "#result == null")     // 查不到不写缓存（避免缓存null）
```

**`condition` 与 `unless` 的分工经常被写反**：前者控制"读"，后者控制"写"。`unless = "#result == null"` 是防"缓存 null 值"最常用的写法——它与 `disableCachingNullValues()` 的区别在于：前者是**不写入**，后者是**写入时报错**。

## 五、失效清单：五类"注解不生效" {#failures}

这是本篇的核心。**五类问题的根因只有两个：代理没走到，或条件没满足。**

| # | 现象 | 根因 | 解法 |
|---|---|---|---|
| 1 | 同类内部调用方法，缓存不生效 | **自调用不走代理** | 注入自身代理 / `AopContext.currentProxy()` / 拆到另一个 Bean |
| 2 | `private` / `final` / `static` 方法上无效 | CGLIB 无法覆盖 | 改为 `public` 非 final 实例方法 |
| 3 | 启动就没缓存 | 漏了 **`@EnableCaching`** | 加到任一 `@Configuration` 上 |
| 4 | 每次请求都不命中 | key 不稳定（见[第四节](#key-spel)） | 显式指定 `key` |
| 5 | 多实例下"有时命中有时没有" | 用了**本地缓存** | 换 Redis，或加广播失效 |

第 1 类的完整代码示例值得再看一遍，因为它和事务失效是**同一份代码**：

```java
@Service
public class OrderService {

    @Autowired private OrderService self;      // 注入自身代理（方式一）

    public void create(Order o) {
        self.refreshCache(o.getId());          // ✅ 走代理
        // refreshCache(o.getId());            // ❌ 走原始对象，@Cacheable 不生效
    }

    @Cacheable(value = "orders", key = "#id")
    public Order refreshCache(Long id) { return load(id); }
}
```

**方式一（注入自身）有一个隐藏前提：不能构成循环依赖**——`OrderService` 依赖自己。在 Spring Boot 2.6+ 默认禁止循环依赖的前提下，这通常能工作（因为注入的是代理而非原始实例），但更干净的做法是把"要缓存的方法"拆到独立的 Bean。

### 5.1 与 `@Transactional` 失效的对照 {#compare-transaction}

两者是同一机制的两个表现，放一起看能省下不少死记：

| | `@Cacheable` 失效 | `@Transactional` 失效 |
|---|---|---|
| 根因 | 调用没经过代理 | 同 |
| 自调用 | **绕过缓存，直接查库**（读问题） | **绕过事务，各自提交**（写问题） |
| 危险度 | 中——性能退化，数据仍正确 | **高——数据可能不一致** |
| 查询信号 | 命中率异常低 | 无异常，靠 SQL 日志或连接数发现 |

**这就是为什么"代理"是理解 Spring 全部注解失效的唯一钥匙**——`@Async`、`@Cacheable`、`@Transactional`、`@PreAuthorize` 无一例外。见[导览页主线二](/java/spring/spring-framework/#interview)。

## 六、与事务的顺序：脏缓存的成因与破法 {#with-transaction}

这是缓存篇唯一会**污染数据**的问题，也是最容易被忽略的。

先看一个典型错误：

```java
@Transactional
@Cacheable(value = "products", key = "#id")     // 缓存在事务外层
public ProductVO getById(Long id) { ... }

@Transactional
@CachePut(value = "products", key = "#id")
public ProductVO update(Long id, BigDecimal price) {
    doUpdate(id, price);
    return getById(id);
}
```

**问题的关键不是"谁先谁后"，而是缓存的写发生在事务提交之前还是之后。**

`@CachePut` 的写入发生在**方法返回时**，而方法返回 → 事务提交之间还有一小段窗口。在这个窗口里，**缓存里已经有了新值，数据库里还没有**。此时另一个线程读同一个 key：

```
T1: 执行 update → 写缓存(新值) → [事务未提交]
T2:                                    读缓存 → 命中新值 → 但数据库里是旧值
T1: 事务提交（或回滚）
```

如果 T1 **回滚**了，缓存里的新值就成了**永久脏数据**（直到 TTL 到期）。

| 组合 | 顺序 | 风险 |
|---|---|---|
| `@CachePut` 在事务方法内 | 缓存写 → 事务提交 | **回滚后缓存残留新值** |
| `@CacheEvict` 在事务方法内 | 缓存删 → 事务提交 | 删除是安全的（下次读会回源） |
| `@CacheEvict(beforeInvocation=true)` + 事务 | 缓存删 → 业务 → 提交 | 安全，但并发下会有"击穿"窗口 |

**破法有三条，按推荐度排序**：

**① 优先用 `@CacheEvict` 而不是 `@CachePut`。** 删除是幂等的、不会残留错误值；而"更新缓存"在事务场景下天然有窗口。**"删除缓存 + 下次读回源"是更稳的模式**，代价是回源那一次会慢（可用 `sync = true` 合并并发回源）。

**② 把缓存操作挪到事务外层。** 让事务方法先提交，再由调用方（非事务方法）更新缓存：

```java
public void updateProduct(Long id, BigDecimal price) {   // 无 @Transactional
    productTxService.update(id, price);                  // 事务在这里结束
    cacheManager.getCache("products").evict(id);          // 提交后再清（用编程式更明确）
}
```

**③ 用事务同步回调，把清缓存挂到"提交成功之后"**：

```java
TransactionSynchronizationManager.registerSynchronization(
    new TransactionSynchronization() {
        @Override public void afterCommit() {
            cacheManager.getCache("products").evict(id);   // 只有提交成功才清
        }
    });
```

`afterCommit` 是**数据库事务已提交**之后才回调的，因此**回滚时不会误清**，提交后清也不会残留脏值。这是"既要事务正确、又要缓存正确"的解法。

> **与 Redis 板块的分工**：「先更新库再删缓存」为什么是这个顺序、一致性四档方案（旁路/读写穿透/写回）、延迟双删，属于**缓存组件的策略问题**，完整推导见[缓存模式：三大问题与一致性](/database/redis/cache-patterns)。本篇讲的是**这些策略在 Spring 里的落地位置**——落地位置错了，策略再对也没用。

## 七、`sync = true`：并发回源与"缓存击穿"的关系 {#sync}

`@Cacheable(sync = true)` 的语义是：**同一个 key 的并发回源，只让一个线程执行方法体，其余线程等它的结果**。

```java
@Cacheable(value = "products", key = "#id", sync = true)
public ProductVO getById(Long id) { ... }
```

它解决的问题与缓存的"击穿"是同一个——热点 key 失效瞬间，大量请求同时打到数据库。但**两条路径的边界必须分清**：

| 手段 | 作用范围 | 生效前提 |
|---|---|---|
| `sync = true` | **单个 JVM 内**同一 key 的并发合并 | Cache 实现必须支持 `get(key, Callable)` |
| 分布式锁 / 逻辑过期 | 跨实例 | 需要额外组件 |

**`sync = true` 在 Redis 缓存下不是分布式去重**——它只保证单个实例内不会重复回源，多实例仍会各自回源一次。而且 `sync = true` 与 `unless` **不能同时使用**（Spring 会直接抛 `IllegalStateException`），因为"同步加载"必须在方法执行完就决定是否写入，没有"事后排除"的机会。

## 八、Redis 缓存的序列化：一个高频事故点 {#redis-serializer}

用 Redis 做缓存时，**默认的 `JdkSerializationRedisSerializer` 会写出人类不可读的二进制**，导致：缓存内容无法在 `redis-cli` 里排查、类结构变更后反序列化失败、体积比 JSON 大 2~3 倍。

换成 JSON 序列化器是标准做法，但 `GenericJackson2JsonRedisSerializer` 有两个坑：

**① 它会在 JSON 里写入 `@class` 字段**（用于反序列化还原类型）。这带来两个后果：**缓存内容与类名强绑定**（改包名/类名会导致旧缓存全部反序列化失败）、**跨语言共享缓存时其他语言无法解析**。

**② 无参构造与 `final` 字段**。Jackson 反序列化需要可用的构造方式，`record` 或全参构造需要额外的模块支持（Boot 会通过 `ParameterNamesModule` 处理大部分情况）。

一个更可控的替代是**用明确的类型序列化器**，或在需要极致性能时改用 `Fastjson2` / `Kryo`：

```java
RedisCacheConfiguration cfg = RedisCacheConfiguration.defaultCacheConfig()
        .serializeKeysWith(SerializationPair.fromSerializer(new StringRedisSerializer()))
        .serializeValuesWith(SerializationPair.fromSerializer(
                new GenericJackson2JsonRedisSerializer()));
```

**key 的序列化同样重要**：不显式指定 `StringRedisSerializer` 时，key 也会被 JDK 序列化，导致你在 `redis-cli` 里看到 `\xac\xed\x00\x05t\x00\x08products` 这种东西——排查问题时非常痛苦。

### 8.1 本地缓存的多实例不一致 {#multi-instance}

用 Caffeine 做缓存时有一个**框架不解决**的问题：**实例 A 删除了一条缓存，实例 B 仍然持有**。Spring 的 `Cache` 接口没有"广播失效"的语义。

三种应对方式，代价递增：

| 方式 | 做法 | 一致性 | 代价 |
|---|---|---|---|
| 缩短 TTL | 把 TTL 设到"业务可容忍"的秒级 | 最终一致，窗口 = TTL | 命中率下降 |
| 广播失效 | 用 Redis Pub/Sub 或 MQ 通知其他实例 `evict` | 秒级一致 | 需要额外链路，需处理消息丢失 |
| 放弃本地缓存 | 统一用 Redis | 强一致（对缓存而言） | 每次读都有网络开销 |

**"本地缓存 + 广播失效"的复杂度常被低估**：消息丢失、实例上下线、通知风暴（一次批量更新触发大量失效消息）都要处理。如果业务对一致性窗口的要求在秒级以内，**直接用 Redis 是更便宜的方案**。

## 九、观测：缓存变成黑盒之前 {#observability}

缓存最大的风险不是"慢"，而是**"看起来在缓存，实际每次回源"**——接口能跑通，只是数据库压力莫名很大。

两个必做的观测动作：

**① 打开 `recordStats()`**，把命中率暴露成指标。Caffeine 的 `CacheStats` 提供 `hitRate()` / `evictionCount()` / `loadCount()`；Spring Boot 的 Actuator **会自动把 `Cache` 的统计暴露为 Micrometer 指标**（`cache.gets`，带 `result=hit|miss` 标签）——前提是缓存实现支持统计。

**② 观察"回源次数"与"数据库 QPS"的比例。** 命中率下降时，数据库 QPS 会立刻上升；反过来，如果数据库 QPS 没有随流量波动，说明缓存可能在**空转**。

| 指标 | 含义 | 异常信号 |
|---|---|---|
| `cache.gets{result="hit"}` | 命中次数 | 长期为 0 = 注解没生效 |
| `cache.gets{result="miss"}` | 未命中次数 | **miss/hit 比高但 QPS 平稳** = key 不稳定 |
| `cache.evictions` | 淘汰次数 | 持续高频 = 容量或 TTL 配小了 |
| 缓存条目数 | 占用 | 突降 = 大批量失效或重启 |

> **一个诊断捷径**：怀疑缓存没生效时，先在方法体第一行打日志。**如果日志每次都打，说明方法体每次都执行——缓存必然没命中**（`@Cacheable` 命中时方法体不执行）。这一条能在一分钟内区分"代理问题"和"key 问题"。

## 十、面试口径 {#interview}

| # | 问题 | 一句话答案 |
|---|---|---|
| 1 | `@Cacheable` 的原理？ | 本质是 **AOP 拦截**：调用前按 key 查缓存，命中则直接返回、**不执行方法体**；未命中则执行方法体并把返回值写入缓存。它和 `@Transactional` 共用同一套代理机制，因此**失效条件也相同** |
| 2 | `@Cacheable` 和 `@CachePut` 的区别？ | `@Cacheable` **命中就不执行方法体**（用于读）；`@CachePut` **总是执行**并把返回值写入缓存（用于更新）。把 `@CachePut` 用在查询方法上等于关掉了缓存 |
| 3 | 为什么同类内部调用缓存不生效？ | 自调用走的是**原始对象**，不经过代理。解法：注入自身代理、`AopContext.currentProxy()`，或把方法拆到另一个 Bean。这与 `@Transactional` 失效是同一根因 |
| 4 | `condition` 和 `unless` 的区别？ | `condition` 在**调用前**求值，决定**要不要查缓存**，不能引用 `#result`；`unless` 在**调用后**求值，决定**要不要写缓存**，可以引用 `#result`。`unless = "#result == null"` 是防缓存 null 的常用写法 |
| 5 | 默认 key 是怎么生成的？ | `SimpleKeyGenerator`：无参用 `SimpleKey.EMPTY`，一个参数**直接用该参数对象**，多参数用 `SimpleKey` 包装。所以**用普通对象作单参数且未重写 `equals`/`hashCode` 时永远不命中** |
| 6 | 缓存和事务谁在外层？ | 缓存注解默认在**事务外层**（同一方法上）。真正的坑是 `@CachePut` 的写入发生在**事务提交之前**——事务回滚会留下**永久脏缓存**。推荐改用 `@CacheEvict`，或用 `TransactionSynchronization.afterCommit()` 在提交后清 |
| 7 | 为什么推荐删缓存而不是更新缓存？ | 删除是**幂等**的，最坏结果是下次回源；更新则有"缓存已新、库未提交"的窗口，回滚后残留脏值。**"删除 + 回源"是更稳的模式**，代价是一次回源延迟 |
| 8 | `sync = true` 能解决缓存击穿吗？ | **只解决单实例内**同一 key 的并发回源合并，**不是分布式去重**。多实例仍会各自回源。另外 `sync = true` 不能与 `unless` 共用（Spring 会抛异常） |
| 9 | 本地缓存（Caffeine）多实例怎么保证一致？ | **框架不保证**。三选一：缩短 TTL 容忍窗口、用 Pub/Sub 或 MQ 广播失效、直接改用 Redis。广播失效的复杂度（消息丢失、通知风暴）常被低估 |
| 10 | Redis 缓存为什么要自定义序列化器？ | 默认的 JDK 序列化写出二进制：**无法用 `redis-cli` 排查、类变更后反序列化失败、体积大 2~3 倍**。换 JSON 序列化器时注意 `@class` 字段会与类名强绑定，`key` 也要显式用 `StringRedisSerializer` |
| 11 | 怎么确认缓存真的生效了？ | 最直接的一招：**在方法体第一行打日志**。命中时方法体不执行，日志不打。`@Cacheable` 命中不执行方法体这一点，也让"带副作用的读"（如顺便计数）变得不可靠 |
| 12 | 缓存命中率怎么观测？ | Caffeine 需显式 `recordStats()`；Spring Boot 会把统计暴露为 Micrometer 指标 `cache.gets{result=hit\|miss}`。**miss 高但接口 QPS 平稳**往往说明 key 不稳定，而非缓存没配 |

> 回到：[Spring 横切能力 · 导览](/java/spring/spring-framework/crosscutting/)　|　下一篇：[异步执行与线程池](/java/spring/spring-framework/crosscutting/async)
