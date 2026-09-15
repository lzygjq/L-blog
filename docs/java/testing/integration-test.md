---
date: 2026-09-15
title: 集成测试与真实依赖
sidebar: 集成测试
order: 4
desc: H2 与真实 MySQL 的差距、Testcontainers 2.x 的用法与迁移、@ServiceConnection、数据隔离三法、内嵌 Mock 路线的代价
---

# 集成测试与真实依赖

上一篇说明了切片测不到什么。这一篇处理那些**必须碰真依赖**的部分：数据库、Redis、消息队列。

核心矛盾一句话：**真依赖测得准但起得贵，假依赖起得快但可能测了个寂寞。** 所以这一篇的重点不是「怎么用 Testcontainers」（那部分查文档就行），而是**在什么情况下假依赖是够的、什么情况下不行**。

## 一、H2 能不能代替 MySQL {#h2-vs-real}

这是国内项目里最常见、也最容易踩坑的一个决策。先说结论：

> **H2 适合验证「映射与基本查询」，不适合验证「MySQL 特有的行为」。而后者恰恰是生产事故的高发区。**

### 1.1 为什么大家爱用 H2

| 优势 | 说明 |
|---|---|
| 启动快 | 内存库，毫秒级，不需要 Docker |
| 零环境依赖 | CI 机器、同事电脑上都不用装东西 |
| 与 Spring 集成简单 | `@DataJpaTest` 默认就用它 |
| 适合高频回归 | 每次保存都跑一遍也不心疼 |

这些优势都是真的。yudao 这类工程选择 H2 + 自建基类是有充分理由的——**它要保证「任何人克隆下来就能跑测试」**。

### 1.2 但它和 MySQL 不是一回事

H2 提供了 `MODE=MySQL` 兼容模式，能糊掉一部分差异，但下面这些它是糊不掉的：

| 差异点 | 表现 |
|---|---|
| **特有语法** | `ON DUPLICATE KEY UPDATE`、`INSERT IGNORE`、`REPLACE INTO`、`STRAIGHT_JOIN` |
| **函数** | `DATE_FORMAT` / `IFNULL` / `GROUP_CONCAT` / `JSON_EXTRACT` 的行为与参数细节 |
| **类型** | `TINYINT(1)` 与布尔、`DECIMAL` 精度与舍入、`DATETIME` 与 `TIMESTAMP` 的时区语义、`TEXT` 与 `VARCHAR` 的长度语义 |
| **严格模式** | MySQL 的 `ONLY_FULL_GROUP_BY`、非空与默认值校验，H2 常常更宽松 |
| **排序与大小写** | 字符串比较大小写敏感性、`ORDER BY` 在等值时的稳定性 |
| **索引与执行计划** | H2 根本没有 MySQL 的索引选择与锁粒度概念 |
| **锁与隔离级别** | 行锁、间隙锁、`SELECT ... FOR UPDATE` 的行为差异 |
| **自增与序列** | 回填主键的方式、多语句批量的自增连续性 |

**最危险的不是「报错」，而是「静默通过」**。比如排序规则不同导致分页结果顺序不稳定——这个 bug 在 H2 上永远复现不出来，上线后表现为「偶发少一条 / 重复一条」。

### 1.3 一条实用的分层策略

```text
所有 SQL 都要在 H2 上跑通        ← 兜住「映射写错了」「字段对不上」这类硬错误
关键 SQL 必须在真实 MySQL 上验证 ← 兜住方言、事务、锁、严格模式
```

具体做法：

1. **日常回归用 H2**——快，覆盖率广，拦住大部分低级错误
2. **CI 上跑一轮真实数据库**（Testcontainers 起 MySQL）——只跑标记过的「集成测试」子集
3. **凡是用了 MySQL 特有语法的 Mapper 方法，必须有真实库的测试**——这条可以做成代码评审的硬规则

> 换句话说：H2 不是「MySQL 的替代品」，它是**「MySQL 之前的一道快筛」**。

## 二、Testcontainers 2.x {#testcontainers}

Testcontainers 的思路很直接：**测试启动时用 Docker 拉起一个真的 MySQL / Redis / Kafka，跑完就销毁。** 它把「真依赖」的成本从「运维负担」降到了「几秒启动时间」。

### 2.1 先说 2.x 的三个破坏性变化

从 1.x 升到 2.x 的代码**编译不过**，因为包结构和依赖名都变了：

| 变化 | 1.x 写法 | 2.x 写法 |
|---|---|---|
| **依赖名加前缀** | `org.testcontainers:mysql` | `org.testcontainers:testcontainers-mysql` |
| **包名按模块拆** | `org.testcontainers.containers.MySQLContainer` | `org.testcontainers.mysql.MySQLContainer` |
| **泛型移除** | `MySQLContainer<SELF>` 自引用泛型 | 直接用 `MySQLContainer`，不再有类型参数 |
| 版本管理 | 各模块版本可能不一致 | 用 `testcontainers-bom` 统一 |

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.testcontainers</groupId>
            <artifactId>testcontainers-bom</artifactId>
            <version>2.0.5</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

> 中文资料大量还停在 1.x 的 `org.testcontainers.containers.*` 写法。**升级到 Spring Boot 4 时这一点会一起暴露**——因为 Boot 4 的 BOM 对准的是 Testcontainers 2.x。如果解析不到，显式钉版本比依赖 BOM 更稳。

### 2.2 推荐写法：`@ServiceConnection` 免掉样板

老写法要手动把容器的端口、账号往属性里塞：

```java
// 老写法：每个测试类都要写这段，且要自己拼 URL
@DynamicPropertySource
static void props(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", mysql::getJdbcUrl);
    registry.add("spring.datasource.username", mysql::getUsername);
    registry.add("spring.datasource.password", mysql::getPassword);
}
```

新写法一行搞定：

```java
@SpringBootTest
@Testcontainers
class UserMapperIntegrationTest {

    @Container
    @ServiceConnection                 // 自动把连接信息接到 DataSource 上
    static MySQLContainer mysql = new MySQLContainer("mysql:8.0");

    @Test
    void 分页查询在真实MySQL上的顺序是稳定的() { }
}
```

`@ServiceConnection` 是 Spring Boot 3.1 引入的，它按容器类型自动配置对应的连接（MySQL → `DataSource`、Redis → `RedisConnectionFactory`、Kafka → `KafkaTemplate`）。**建议把它当作默认写法**。

### 2.3 一个官方明确的警告：容器生命周期 vs 上下文缓存

`@Testcontainers` + `@Container` 静态字段这套用法有个副作用，Spring 官方文档专门写了：

> 静态容器字段会在**测试类跑完后**停止容器。但 Spring 的上下文缓存可能在那个时间点之后仍在复用该上下文——于是后续测试或 Bean 销毁回调会遇到「依赖已停止的容器」而失败。

所以官方建议：**当上下文需要跨测试类复用缓存时，把容器当 Spring Bean 管理**，而不是用 JUnit 扩展：

```java
@TestConfiguration(proxyBeanMethods = false)
class Containers {
    @Bean
    @ServiceConnection
    MySQLContainer mysql() {
        return new MySQLContainer("mysql:8.0");
    }
}
```

这是个很典型的「两个框架各自都合理，放一起就有缝」的问题——**报错往往出现在别的测试类上，定位起来很绕**。

### 2.4 成本控制

容器启动慢，但可以压：

| 手段 | 效果 | 注意 |
|---|---|---|
| **容器复用**（`withReuse(true)` + `~/.testcontainers.properties`） | 跨测试运行复用容器，第二次起飞快 | 本地开发用；CI 上要清干净，否则残留数据造成假绿 |
| **单例容器 + 静态字段** | 一个类内所有方法共用一个容器 | 注意上面的缓存冲突 |
| **只跑必要的集成测试** | CI 上按标签分组（如 `-Dgroups=integration`） | 别让整个套件都起容器 |
| **固定的镜像 tag** | 避免每次拉取新镜像 | **不要用 `latest`**——今天绿明天红 |
| **只验证关键路径** | 集成测试数量控制在「单元测试的十分之一」量级 | 数量上去后收益递减、耗时线性增长 |

### 2.5 环境前提

Testcontainers **必须有可用的 Docker 守护进程**：

- 本地：Docker Desktop / Colima / Lima / OrbStack 均可，但要保证 `DOCKER_HOST` 在**你跑 Maven 的那个终端里**可见（macOS 上这是最常见的坑，GUI 应用继承不到 shell 变量）
- CI：GitHub Actions 的 Linux runner 自带 Docker，通常开箱可用；自建 runner 要确认 socket 挂载
- **Testcontainers 会启动一个叫 Ryuk 的清理容器**负责回收资源。公司网络里若禁止拉取该镜像，需要显式关掉（代价是异常退出时会留下孤儿容器）

```properties
# ~/.testcontainers.properties
ryuk.disabled=true
```

关掉 Ryuk 后如果进程被强杀，**记得手动 `docker ps` 看一眼有没有残留**——这正是前面提到的「进程卫生」问题在容器上的翻版。

## 三、数据隔离：三个方案各有代价 {#isolation}

集成测试有一个共同难题：**测试之间共享同一个真库，数据怎么不互相污染**。

| 方案 | 做法 | 代价 |
|---|---|---|
| **每测试清理** | `@Sql(clean.sql, AFTER_TEST_METHOD)` 删表数据 | 要维护清理脚本；外键顺序容易漏 |
| **事务回滚** | `@Transactional` + 自动回滚 | 快，但**测试永不真正提交**——提交后回调、触发器、部分约束验证不到 |
| **每次重建** | 每个测试类重建 schema | 最干净，最慢；适合小规模必测项 |
| **独立命名空间** | 每个测试用独立 schema / 库 / 表前缀 | 隔离彻底，适合并行执行；配置复杂 |

**怎么选**：

- 大多数情况用 **`AFTER_TEST_METHOD` 清理**——它是「诚实」的方案，走真的提交路径
- **只有当测试完全不依赖提交语义时**才用事务回滚
- 需要**并行执行**测试时必须用独立命名空间（同一库上并发清理会互相打架）

> 一条容易忽略的点：清理脚本本身也要被 review。`DELETE FROM` 的顺序如果和外键约束冲突，就会间歇性失败——**表现为「单独跑绿、整体跑红」，极难排查**。

## 四、内嵌 Mock 路线：快，但要认代价

不用 Docker 的替代方案是**内嵌/模拟实现**，在 Java 生态里有几种常见选择：

| 依赖 | 替代品 | 性质 |
|---|---|---|
| MySQL | **H2**（`MODE=MySQL`） | 真数据库，但方言不同 |
| Redis | **jedis-mock** / embedded-redis | 用 Java 模拟的 Redis 协议实现 |
| Kafka | embedded-kafka / `spring-kafka-test` | 进程内 broker |

它们的共同优势是**快且无环境依赖**，共同风险是**「模拟」与「真实」的偏差**。

一个真实项目里的记录（yudao 的 `RedisTestConfiguration`），注释写着：

> 一次执行多个单元测试时，貌似创建多个 Spring 容器，导致不进行 stop。这样，就导致**端口被占用，无法启动**。

而且代码里应对方式是直接把启动异常吞掉：

```java
try {
    redisServer.start();
} catch (Exception ignore) { }   // 端口被占用时静默跳过
```

这段代码很值得琢磨：**它在「让测试不挂在环境问题上」和「掩盖真实失败」之间做了取舍**。抛异常会让整套测试因为一个端口问题全红；吞掉则可能后面的测试连到一个**上一个容器留下的、状态不明的 Redis** 上。

这不是在批评这段代码——而是在说明一条规律：**凡是用「模拟服务 + 固定端口」的路线，一定会在并行执行、多上下文、重复启动这些场景下遇到资源冲突**。Testcontainers 用「随机端口 + 容器编排」把这些问题交给 Docker，代价是启动慢和环境污染——**两种路线是在用不同的东西换同一个目标**。

## 五、确定性：让测试不依赖「运气」 {#determinism}

集成测试最容易变成 flaky（时好时坏），根源通常是这几类不确定性：

| 不确定来源 | 现象 | 处理 |
|---|---|---|
| **当前时间** | 跨天/跨月跑就红 | 注入 `Clock`，测试里固定时钟 |
| **随机数 / UUID** | 断言具体值失败 | 注入生成器，或只断言格式与唯一性 |
| **时区** | 本地绿、CI 红 | 测试里显式指定时区 |
| **异步与最终一致** | 偶发断言过早 | 用 Awaitility 轮询，别用 `sleep` |
| **并发执行冲突** | 单独跑绿、并行跑红 | 独立命名空间 + 随机端口 |
| **容器启动顺序** | 依赖服务还没就绪 | 依赖健康检查（Testcontainers 已内建等待策略） |
| **排序不稳定** | 分页结果顺序偶发不同 | 断言里必须有确定性的 `ORDER BY` |

**判据**：一个测试如果在同一份代码上连续跑 10 次有 1 次失败，它就不是「偶发问题」，而是**有 bug 的测试**——而它会污染整个套件的可信度（详见 [质量门禁](/java/testing/quality-gates#flaky)）。

## 六、常见坑 {#pitfalls}

1. **拿 H2 验证 MySQL 特有语法**：`ON DUPLICATE KEY UPDATE` 之类在 H2 上直接失败；而更危险的是排序/严格模式差异导致的**静默通过**。
2. **升级后 Testcontainers 1.x 写法编译不过**：包名改成模块化路径、依赖名加 `testcontainers-` 前缀、自引用泛型移除。
3. **用 `latest` 镜像**：今天绿明天红，且失败原因跟你的代码无关。
4. **`DOCKER_HOST` 在 GUI 终端里可见、在 CI/脚本里不可见**：Testcontainers 报「找不到 Docker」，但 `docker info` 手动跑是好的。
5. **Ryuk 被网络策略挡住**：表现为容器启动超时或残留；关掉 Ryuk 后要自己保证清理。
6. **`@Testcontainers` 与上下文缓存冲突**：容器已停、上下文还在缓存 → 报错出现在别的测试类上。
7. **`@Transactional` 回滚掩盖提交语义问题**：事务同步回调、`AFTER_COMMIT` 监听、唯一约束在提交时才暴露的冲突，全都测不到。
8. **清理脚本顺序不对**：外键约束导致「单独跑绿、一起跑红」。
9. **集成测试数量失控**：把本该用单元测试覆盖的分支也塞进集成测试，套件从秒级变成十分钟级，然后没人愿意跑。
10. **用固定端口起内嵌服务**：并行或重复启动时端口冲突；有的实现选择吞掉异常，于是测试连上了状态不明的实例。
11. **断言依赖当前时间**：跨天、跨月、跨时区边界时失败。
12. **测试之间靠执行顺序共享数据**：`@TestMethodOrder` 能「修好」，但真正的问题是共享状态。

## 七、面试口径 {#interview}

1. **H2 能代替 MySQL 做测试吗？** 能覆盖大部分映射与查询，但**不能验证 MySQL 特有的行为**：特有语法与函数、类型与精度语义、严格模式、排序与大小写规则、锁与执行计划。更大的风险是差异导致**静默通过**（比如分页顺序不稳定）。合理定位是「MySQL 之前的快筛」，关键 SQL 仍要在真库上验证。
2. **Testcontainers 和 H2 各自的取舍？** Testcontainers 测的是真依赖（准、能测方言与事务），代价是要 Docker、启动慢、有环境依赖；H2 快且零依赖，但只覆盖标准 SQL 子集。常见组合是「日常回归用 H2、CI 上跑一轮真实库」。
3. **`@ServiceConnection` 解决什么问题？** 免掉手写 `@DynamicPropertySource` 把容器端口/账号搬到 `spring.datasource.*` 的样板代码，按容器类型自动完成连接装配。
4. **Testcontainers 2.x 相比 1.x 的变化？** 包名从 `org.testcontainers.containers.*` 改为按模块的 `org.testcontainers.<模块>.*`；依赖名加 `testcontainers-` 前缀；移除自引用泛型；用 BOM 统一版本。
5. **测试数据怎么隔离？** 四种：每测试清理（`@Sql` AFTER_TEST_METHOD，最诚实）、事务回滚（快但掩盖提交语义）、每次重建（最干净最慢）、独立命名空间（隔离彻底，并行必需）。多数场景选第一种。
6. **`@Transactional` 回滚有什么盲区？** 测试事务永不真正提交，所以「提交后触发」的机制（事务同步回调、`AFTER_COMMIT` 事件、触发器、部分唯一约束冲突）都验证不到。
7. **集成测试为什么会 flaky？怎么治？** 来源是时间、随机、时区、异步等待、并发冲突、排序不稳定。治法是**消除不确定性来源**：注入 `Clock`、固定随机种子、显式时区、Awaitility 轮询、独立命名空间、断言里带确定性 `ORDER BY`。
8. **容器化测试的启动成本怎么压？** 容器复用、单例容器、按标签分组只跑必要子集、固定镜像 tag、控制集成测试总量在单元测试的十分之一量级。
9. **Testcontainers 一定要装 Docker 吗？** 要，而且**`DOCKER_HOST` 必须在跑构建的那个终端里可见**——macOS 上 GUI 应用继承不到 shell 环境变量是最常见的坑。CI 上 Linux runner 一般自带 Docker。另外要留意 Ryuk 清理容器是否被网络策略挡住。
10. **不用 Docker 的内嵌方案有什么风险？** 模拟实现与真实服务存在行为偏差（H2、jedis-mock 都是）；固定端口方案在并行执行/多上下文/重复启动时必然资源冲突，有些实现会用「吞异常」来掩盖，反而让测试连上状态不明的实例。

> 最后一篇收口：**覆盖率怎么读、CI 卡在哪、怎么治理测试债务**——[覆盖率与质量门禁](/java/testing/quality-gates)。
