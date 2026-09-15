---
order: 2
date: 2026-09-15
sidebar: Starter 设计与自定义
title: Spring Boot Starter 设计与自定义
desc: starter 与 autoconfigure 的职责切分、条件装配的粒度、属性元数据与失败快、ApplicationContextRunner 测试、Spring Boot 4 模块化对第三方 starter 的影响
---

# Spring Boot Starter 设计与自定义

> [自动配置原理](/java/spring/spring-boot/auto-configuration)讲的是**机制**：`@EnableAutoConfiguration` 怎么把配置类捞进来、`@Conditional` 怎么裁决。这一篇讲的是**工程化**：当你要把一套装配逻辑交给别人用时，怎么组织依赖、怎么设计条件、怎么测试、怎么避免把坑传下去。

## 一、问题场景 {#why-starter}

假设团队有一套「统一日志与链路追踪」的接入规范：要引入三个依赖、写四个配置类、配置 `logback-spring.xml`、注册两个 Filter 和一个拦截器。没有 starter 时，接入方式是——

```text
新人接入 → 翻一篇 Confluence 文档 → 复制 6 个文件 → 改 4 处常量
             └─ 三个月后文档过期了，没人知道 └─ 各项目的实现开始各自演化
```

代价可以量化：

| 问题 | 表现 | 后果 |
|---|---|---|
| **配置散落** | 每个项目各存一份配置类 | 修一个 bug 要改 N 个仓库 |
| **版本漂移** | 有人用 1.2、有人用 1.5 | 出问题时无法对齐排查 |
| **依赖不全** | 漏引了 `aspectjweaver`，编译过、运行报错 | 排查成本高（报错点离原因很远） |
| **覆盖困难** | 想自定义其中一个 Bean，只能复制整个配置类 | 复制即分叉 |

**Starter 解决的就是"分发"这件事**：把「引哪些依赖 + 怎么写装配 + 默认值是多少」打包成一个 Maven 坐标。接入方只加一行 `<dependency>`，需要定制时才写自己的 Bean。

一句话定位：**Starter 是「一套装配逻辑」的发布单元**。它把 `autoconfiguration` 这篇讲的所有机制，变成一个别人 `install` 得动的东西。

## 二、它是什么、不是什么 {#definition}

| 维度 | Starter |
|---|---|
| **本质** | 一个依赖坐标（Maven artifact），它的价值在 `pom.xml` 与自动配置资源文件里，而不在 Java 代码里 |
| **包含** | ① 依赖聚合（拉齐版本）② 自动配置类（`AutoConfiguration.imports` 清单）③ 默认配置（`@ConfigurationProperties` 的字段默认值 + `additional-spring-configuration-metadata.json`）④ 可选：诊断与失败分析 |
| **不包含** | 业务逻辑 |

**必须划清的三条边界：**

| 它不是 | 为什么容易误会 |
|---|---|
| **不是自动配置本身** | 自动配置是机制（框架能力），starter 是打包方式（工程约定）。你可以手写自动配置而不发布 starter，也可以发布一个不含自动配置的「依赖聚合包」 |
| **不是 Spring 的模块系统** | 它没有类加载隔离、没有版本仲裁能力，**本质上仍是 Maven 依赖传递**。冲突时该 `exclusions` 还是得写 |
| **不需要 Spring 才能生效** | `AutoConfiguration.imports` 是「类路径清单 + 条件裁决」，装配发生在容器启动时；它替换的是「人写 XML/`@Bean`」，不是「Spring 的存在」 |

### 命名规范（不是小事） {#naming}

| 场景 | 命名 | 例子 |
|---|---|---|
| **官方** starter | `spring-boot-starter-{技术}` | `spring-boot-starter-web`、`spring-boot-starter-data-redis` |
| **第三方** starter | `{技术}-spring-boot-starter` | `mybatis-spring-boot-starter`、`dubbo-spring-boot-starter` |
| **含自动配置代码的模块** | `{技术}-spring-boot-autoconfigure` | `mybatis-spring-boot-autoconfigure` |

**这条规范的实际作用**：让使用者一眼看出「这是官方还是社区维护的」。反之则很危险——把包名放进 `org.springframework.boot` 命名空间下的第三方 starter，会在排错时误导所有人（[自动配置原理](/java/spring/spring-boot/auto-configuration#starter-structure)里也提过这一条）。

## 三、一个 starter 该拆成几个模块 {#two-modules}

上一级篇目已给出三段式骨架，这里回答**为什么这样拆**，以及**什么时候可以不拆**：

```text
greeting-spring-boot-starter            ← ① 空 jar：只有 pom.xml，做依赖聚合
  └── pom.xml  ─ depends on ─▶ greeting-spring-boot-autoconfigure
                            └─▶ greeting-core（真正的实现库）
greeting-spring-boot-autoconfigure      ← ② 放代码：AutoConfiguration + Properties
  └── src/main/resources/META-INF/spring/...AutoConfiguration.imports
greeting-spring-boot-starter-test       ← ③ 可选：测试基类、Testcontainers 封装
```

拆两个模块的四条理由：

| 理由 | 具体场景 |
|---|---|
| **避免依赖污染** | 只想用配置类（适配自己已有的实现）的人，不该被迫引入你的实现库 |
| **职责单一** | `starter` 只声明「引什么」，`autoconfigure` 只声明「怎么装」；两者演进节奏不同 |
| **测试更快** | `autoconfigure` 可以独立跑 `ApplicationContextRunner` 测试，不拉完整依赖链 |
| **可选依赖的技巧** | 实现库在 `autoconfigure` 里标 `<optional>true</optional>`：编译期可见（`@ConditionalOnClass` 才能引它），但不传递到使用者 |

**什么时候可以不拆：** 内部小 starter、只有一个下游使用者、实现库就是你自己发布的时候，单模块也完全可以——**拆分的收益来自"分发范围"，不是教条**。判据是：这套东西如果给别人用，别人会不会想绕开你的实现？

## 四、自动配置类的设计原则 {#design-rules}

### 4.1 条件装配的粒度 {#condition-granularity}

这是 starter 质量的分水岭。同一个注解放在**类上**还是**方法上**，语义完全不同：

| 位置 | 语义 | 典型用法 |
|---|---|---|
| 类上的 `@ConditionalOnClass` | **类路径即开关**：没引这个库，整个配置类不参与 | 守卫整个自动配置 |
| 方法上的 `@ConditionalOnMissingBean` | **用户优先**：用户自己定义了就不注册 | 每个可覆盖的 Bean |
| 类上的 `@ConditionalOnMissingBean` | **整个配置类都失效** | 谨慎：容易"用户只覆盖了一个 Bean，结果丢了五个" |
| `@ConditionalOnProperty` | **显式开关**：`xxx.enabled=false` 直接关掉 | 需要人工干预的能力 |
| `@ConditionalOnWebApplication` | 只在 Web / 非 Web 场景生效 | 两种装配路径 |

**一个真实的高频误用**：

```java
@AutoConfiguration
@ConditionalOnMissingBean(DataSource.class)   // ✗ 危险：用户定义了数据源，整个类的所有 Bean 都没了
public class MultiDataSourceAutoConfiguration {
    @Bean public DataSource primary() { ... }
    @Bean public DataSource secondary() { ... }
    @Bean public SqlSessionFactory sqlSessionFactory() { ... }   // 用户明明没定义，却也丢了
}
```

正确做法是把条件**下沉到每个 Bean 方法**，让粒度与"可覆盖单元"对齐。

**配套的一条纪律**：把**可覆盖的 Bean 放在同一个配置类里**，并且不要在这个类里掺"必须存在"的基础设施 Bean（用户覆盖一个，另一个跟着消失）。

### 4.2 顺序控制 {#ordering}

自动配置之间是有依赖的（数据源要先于 `SqlSessionFactory`），而加载顺序不能靠运气：

| 注解 | 用在 | 说明 |
|---|---|---|
| `@AutoConfiguration(after = ...)` / `(before = ...)` | 配置类 | 声明相对顺序，**推荐**（Boot 2.7+） |
| `@AutoConfigureAfter` / `@AutoConfigureBefore` | 配置类 | 3.x 起不推荐，被上面取代 |
| `@AutoConfigureOrder(Ordered.HIGHEST_PRECEDENCE)` | 配置类 | 绝对顺序，很少用 |

**为什么顺序不能靠 `@Order`**：`@Order` 管的是「同一 `@Configuration` 类内部的 `@Bean` 方法顺序」以及某些扩展点的排序（如 `Filter`、拦截器），而自动配置的排序由 `AutoConfigurationSorter` 依据这些注解**重新计算**一遍。写错注解，顺序就是你猜不到的那个。

> **判据**：只有当「读你的配置类时需要另一个自动配置的产物」时才声明顺序。**不需要就别加**——多余的排序声明会让维护者误以为存在依赖。

### 4.3 属性绑定与元数据 {#properties-metadata}

```java
@ConfigurationProperties(prefix = "greeting")
@Validated                                                    // 支持 JSR-380 校验
public class GreetingProperties {
    private String prefix = "Hello";                          // 默认值 = 开箱即用
    private Duration timeout = Duration.ofSeconds(2);
    private List<String> excludes = new ArrayList<>();
}
```

三个必须做到的细节：

| 要求 | 为什么 |
|---|---|
| **每个字段都有合理默认值** | "引了就能跑"是 starter 的核心承诺；靠文档让用户填参数是失败设计 |
| **加 `spring-boot-configuration-processor`** | 编译期生成 `META-INF/spring-configuration-metadata.json`，IDE 才有补全与提示 |
| **把"内部字段"标 `@DeprecatedConfigurationProperty` 或加 `additional-spring-configuration-metadata.json`** | 隐藏不该被外部改的项，给枚举字段补允许值 |

**注册方式**：`@EnableConfigurationProperties(GreetingProperties.class)`（精准）或 `@ConfigurationPropertiesScan`（按包扫描）。**不要**给 Properties 类加 `@Component` —— 那样它会绕过条件装配、也更容易被误当成业务 Bean。

### 4.4 失败要快、报错要能读懂 {#fail-fast}

| 反模式 | 后果 |
|---|---|
| 初始化逻辑外包 `try-catch` 然后 `log.warn` | 启动"成功"了，运行到某次调用才连环报错，排查从几小时变几天 |
| 配置错时报 `NullPointerException` | 使用者看不出是哪个配置项有问题 |
| 缺少必填项时静默用默认值 | 线上跑在一个谁都不知道的配置上 |

**推荐写法**：把"不满足前提"变成**启动期异常**，并尽量实现 `FailureAnalyzer`，让报错变成一段人话：

```text
***************************
APPLICATION FAILED TO START
***************************

Description:
greeting.prefix 未配置，且 greeting.require-prefix=true

Action:
请在 application.yml 中设置 greeting.prefix，或关闭 greeting.require-prefix
```

**判据**：**任何"配置错了要等到运行时才炸"的场景，都是 starter 设计的问题**。

## 五、怎么测：把装配当契约来验 {#testing}

自动配置最大的风险是「在 A 项目能跑、在 B 项目不生效」——因为条件装配的结果依赖**类路径**与**已有 Bean**。这两样恰好在普通单元测试里是固定不变的。所以官方给了专门的测试工具：

```java
class GreetingAutoConfigurationTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(GreetingAutoConfiguration.class));

    @Test
    void 缺实现库时整个装配不生效() {
        contextRunner.run(ctx -> assertThat(ctx).doesNotHaveBean(GreetingService.class));
    }

    @Test
    void 存在实现库时自动注册并带默认值() {
        contextRunner
            .withClassLoader(new FilteredClassLoader(GreetingService.class.toString()))   // 反向：假装没有这个类
            .withUserConfiguration(EnableGreeting.class)
            .run(ctx -> assertThat(ctx).hasSingleBean(GreetingService.class));
    }

    @Test
    void 用户自定义的 Bean 覆盖默认实现() {
        contextRunner
            .withUserConfiguration(CustomGreetingConfig.class)
            .run(ctx -> assertThat(ctx).getBean(GreetingService.class)
                .isSameAs(CustomGreetingConfig.CUSTOM));
    }

    @Test
    void 属性绑定生效() {
        contextRunner
            .withPropertyValues("greeting.prefix=Hi")
            .run(ctx -> assertThat(ctx.getBean(GreetingProperties.class).getPrefix()).isEqualTo("Hi"));
    }
}
```

**一个 starter 的最低测试矩阵**（按优先级）：

| # | 要验的场景 | 断言 |
|---|---|---|
| 1 | **类路径缺失** | 装配不生效、不抛异常 |
| 2 | **正常路径** | Bean 被注册、默认值正确 |
| 3 | **用户覆盖** | 用户的 Bean 优先，且不重复注册 |
| 4 | **开关关闭** | `enabled=false` 时全部不生效 |
| 5 | **属性边界** | 非法值触发校验失败（而不是静默） |

**调试装配结果**（不写测试时用）：

```bash
java -jar app.jar --debug                                    # 打印条件评估报告（Positive/Negative matches）
# 或临时开启
logging.level.org.springframework.boot.autoconfigure=DEBUG
```

报告里最有用的是 **`Negative matches`**：它明确告诉你"某个自动配置为什么没生效"，比搜源码快得多。Actuator 的 `/actuator/conditions` 端点提供同样信息的结构化版本。

## 六、版本现状：Spring Boot 4 的模块化对 Starter 意味着什么 {#boot4}

Spring Boot 4.0 于 **2025-11-20** 发布（基于 Spring Framework 7.0），4.1.0 于 **2026-06-10** 发布。对写 starter 的人，最重要的变化是**单体 `spring-boot-autoconfigure` JAR 被拆成了多个模块**。

| 收益 | 说明 |
|---|---|
| **启动更快** | 模块化后每次启动需要做类路径检查的类大幅减少（官方明确说性能"不是主要目标，但确实有提升"） |
| **JAR 更小** | 只引入所需模块，可执行包体积下降 |
| **类名搬迁** | 拆包带来包名调整，这是升级时最容易踩的地方 |

已实测的包名迁移（写 starter 时必须确认）：

| 类型 | Spring Boot 3.x | Spring Boot 4.x |
|---|---|---|
| 健康指标 | `org.springframework.boot.actuate.health.HealthIndicator` | `org.springframework.boot.health.contributor.HealthIndicator` |
| 指标定制 | `org.springframework.boot.actuate.autoconfigure.metrics.MeterRegistryCustomizer` | `org.springframework.boot.micrometer.metrics.autoconfigure.MeterRegistryCustomizer` |
| Web 测试切片 | `org.springframework.boot.test.autoconfigure.web.servlet` | `org.springframework.boot.webmvc.test.autoconfigure` |

**对第三方 starter 的三条影响**：

1. **依赖坐标要重新对齐**——如果你的 starter 直接依赖 `spring-boot-autoconfigure` 这个聚合包，Boot 4 下应改为依赖具体模块。生态里已有「Jackson 2 兼容模块」这类过渡方案，说明官方预期第三方会有滞后。
2. **条件装配的写法不变**——`@ConditionalOnClass` / `AutoConfiguration.imports` 那套机制延续，接口层面兼容（`HealthIndicator` 现在扩展 `HealthContributor`，改完 import 基本可直接编译）。
3. **`spring-boot-starter-aop` 已被移除**（Micrometer 切面改用 `org.springframework:spring-aspects`），若你的 starter 靠它拉 AOP 依赖，需要改。

**顺带一条计划提示**：Spring Boot **3.5 的 OSS 支持已于 2026-06-30 结束**（最后补丁 3.5.16）；4.0.x 的支持窗口到 2026-12-31。如果 starter 还要覆盖 3.x 使用者，这个时间点需要写进 README。

**迁移工具**：官方维护 `spring-boot-properties-migrator`（运行时识别被重命名的配置项并打印迁移提示，**用完要移除**）、以及社区 OpenRewrite 规则（自动改 import 与属性名）。

## 七、常见坑 {#pitfalls}

| 坑 | 症状 | 修法 |
|---|---|---|
| **只写 `spring.factories`** | Boot 3.x 起自动配置**完全不生效** | 必须放 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` |
| **清单文件路径/文件名拼错** | 静默不生效，无任何报错 | 打开 `--debug`，看 `Positive matches` 里有没有你的类 |
| **`@ConditionalOnMissingBean` 写在类上** | 用户覆盖一个 Bean，其他全没了 | 条件下沉到每个 `@Bean` 方法 |
| **实现库没标 `<optional>true</optional>`** | 使用者被迫引入你的实现 | 在 autoconfigure 模块标 optional |
| **用 `@Component` 注册 Properties** | 绕过条件装配、被误当业务 Bean | 用 `@EnableConfigurationProperties` |
| **`@Bean` 方法里做远程调用** | 启动慢甚至卡死 | 初始化只做组装，连接按需建立（如懒加载） |
| **配置项没默认值** | "引了就跑不起来" | 每个字段给默认值 |
| **包名放 `org.springframework.boot.*`** | 与官方冲突、排错误导 | 用自家命名空间 |

## 八、使用场景与面试问答 {#interview}

**Q1：Starter 是什么？它和自动配置是一回事吗？**

不是。**自动配置是机制**（`@EnableAutoConfiguration` + `AutoConfiguration.imports` + `@Conditional` 体系），**Starter 是打包方式**——一个 Maven 坐标，用依赖传递把「实现库 + 自动配置模块 + 默认配置」一起交给使用者。

**Q2：为什么要拆 `starter` 和 `autoconfigure` 两个模块？**

职责分离与依赖隔离：`starter` 只做依赖聚合（可以是空 jar），`autoconfigure` 放代码。这样使用者可以只引 `autoconfigure` 适配自己的实现，而不被强制引入你的实现库；同时 autoconfigure 能独立做条件装配测试，跑得更快。**如果只有一个下游使用者，不拆也行——收益来自分发范围。**

**Q3：`@ConditionalOnMissingBean` 应该加在哪里？**

原则上加在**每个 `@Bean` 方法**上，把"用户优先"的粒度与"可覆盖单元"对齐。加在类上意味着用户只要自己定义了其中任意一个 Bean，整个配置类的全部 Bean 都会消失——这是 starter 里最常见的设计缺陷。

**Q4：怎么保证自动配置的加载顺序？**

用 `@AutoConfiguration(after = XxxAutoConfiguration.class)` / `(before = ...)` 声明相对顺序，由 `AutoConfigurationSorter` 统一排序。不要指望 `@Order`——它管的是类内部 `@Bean` 顺序及部分扩展点，不管自动配置之间的先后。**并且只在真有依赖时声明**。

**Q5：怎么测试一个自动配置？**

用 `ApplicationContextRunner`（`spring-boot-test` 提供）：它能在不启动完整应用的情况下指定类路径、属性、用户配置，然后断言 Bean 是否注册、条件是否命中。核心是覆盖五种场景：类路径缺失、正常路径、用户覆盖、开关关闭、属性非法。必要时用 `FilteredClassLoader` 模拟"类不存在"。

**Q6：自定义 starter 时，怎么让 IDE 对我的配置项有提示？**

引入 `spring-boot-configuration-processor`（`provided`/`optional` 作用域），编译期生成 `META-INF/spring-configuration-metadata.json`；枚举、默认值、废弃标记等 IDE 猜不出来的信息，写进 `additional-spring-configuration-metadata.json`。

**Q7：Spring Boot 4 对写 starter 有什么影响？**

① `spring-boot-autoconfigure` 从单体拆成多模块，依赖坐标要重新对齐；② 部分类型包名迁移（如健康指标移到 `org.springframework.boot.health.contributor`）；③ `spring-boot-starter-aop` 被移除，Micrometer 切面改用 `spring-aspects`；④ 条件装配与 `.imports` 机制不变，接口层面基本兼容。启动更快、包更小是模块化的附带收益。

**Q8：为什么 starter 里初始化失败必须抛异常，而不是打日志？**

因为 starter 的装配发生在**启动期**，这是唯一能给出准确上下文（哪个配置项、哪个依赖缺失）的时机。启动期抛异常配合 `FailureAnalyzer`，能把问题变成一段可读的提示；若吞掉异常，问题会推迟到运行期某个业务调用处爆发，此时现场信息已经丢失，排查成本高一个数量级。

---

> 相关篇目：[自动配置原理](/java/spring/spring-boot/auto-configuration)（条件装配与 `.imports` 机制）、[启动流程](/java/spring/spring-boot/startup)（装配发生在哪个阶段）、[配置体系](/java/spring/spring-boot/configuration)（属性从哪来、谁覆盖谁）。
