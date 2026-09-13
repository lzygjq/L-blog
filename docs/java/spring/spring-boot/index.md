---
date: 2026-09-13
title: Spring Boot 自动配置原理
desc: SpringBootApplication 复合注解拆解、EnableAutoConfiguration 导入链路、Conditional 条件装配、spring.factories 到 AutoConfiguration.imports 的演进、自定义 Starter 三段式
---

# Spring Boot 自动配置原理

## 一、要解决什么问题

用 Spring Framework 的时代，引入一个组件要写一堆样板配置：

```xml
<!-- 引了 Redis 客户端，得自己声明连接工厂、模板、序列化器 -->
<bean id="jedisConnectionFactory" class="org.springframework.data.redis.connection.jedis.JedisConnectionFactory">
    <property name="hostName" value="${redis.host}"/>
    <property name="port" value="${redis.port}"/>
</bean>
<bean id="redisTemplate" class="org.springframework.data.redis.core.RedisTemplate">
    <property name="connectionFactory" ref="jedisConnectionFactory"/>
    <property name="keySerializer"><bean class="org.springframework.data.redis.serializer.StringRedisSerializer"/></property>
</bean>
```

Spring Boot 的解法是**自动配置（Auto-configuration）**：**只要 classpath 上有某个库、并且用户没有自己声明，框架就替你把这套 Bean 装配好。**

```xml
<!-- 引入 starter 就够了 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

```java
@Service
public class CacheService {
    @Autowired private StringRedisTemplate redisTemplate;   // 直接可用，没人写过它的 Bean 定义
}
```

**自动配置的本质，用一句话概括：条件化的 Bean 注册。** 拆成两个关键词：

- **「条件化」**——用 `@Conditional` 系列注解判断"该不该生效"；
- **「Bean 注册」**——生效后就是普通的 `@Configuration` + `@Bean`，把对象放进容器。

理解了这一点，后面所有细节都只是"条件怎么写""清单从哪来"的工程问题。

## 二、`@SpringBootApplication` 拆解

一切从启动类的这一个注解开始：

```java
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

它是三个注解的复合体：

```java
@SpringBootApplication
  ├── @SpringBootConfiguration        // = @Configuration，声明这是配置类
  ├── @ComponentScan                  // 扫描启动类所在包及子包
  └── @EnableAutoConfiguration        // 自动配置总开关 ★核心
        ├── @AutoConfigurationPackage
        │     └── @Import(AutoConfigurationPackages.Registrar.class)
        │           // 把启动类所在包登记为"自动配置的基础包"，
        │           // 供 JPA 实体扫描、MyBatis Mapper 扫描等使用
        └── @Import(AutoConfigurationImportSelector.class)   // ★真正的入口
```

**关键是最后的 `@Import(AutoConfigurationImportSelector.class)`**——它负责把 classpath 下所有自动配置类"批量导入"到容器。

**两个实用推论：**

| 现象 | 原因 |
|---|---|
| 启动类必须放在**最外层包** | `@ComponentScan` 默认只扫启动类所在包及子包，放太深会扫不到业务组件 |
| 想扫描额外的包 | 用 `@ComponentScan(basePackages = ...)` 扩展，或在启动类上 `@Import` 其他配置类 |

## 三、完整链路：从 `@EnableAutoConfiguration` 到 Bean 注册

```
① 启动类标注 @SpringBootApplication
        │
        ▼
② @EnableAutoConfiguration 里的 @Import 触发
   AutoConfigurationImportSelector#selectImports()
        │
        ▼
③ 读取 classpath 下所有自动配置类清单
   · Spring Boot 2.7+ ：META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
   · Spring Boot 2.7 之前：META-INF/spring.factories
        │  产出：150+ 个全限定类名的列表（每行一条）
        ▼
④ 去重 + 排除（@SpringBootApplication(exclude = ...) 或 spring.autoconfigure.exclude）
        │
        ▼
⑤ 逐个尝试加载配置类，但「是否真正生效」由 @Conditional 系列注解裁决
   @ConditionalOnClass      → classpath 有没有这个类
   @ConditionalOnMissingBean → 容器里有没有同类型 Bean（用户自定义优先）
   @ConditionalOnProperty   → 配置项是否满足
   ...
        │  满足条件的配置类被注册为 BeanDefinition
        ▼
⑥ 配置类里的 @Bean 方法被调用，产出 Bean 放入容器
        │
        ▼
⑦ 业务代码可 @Autowired 直接使用
```

**流程中最值得记住的是第 ⑤ 步**：**清单里的配置类数量远大于实际生效的数量**。Spring Boot 会加载全部候选清单，然后靠条件注解筛掉绝大多数——启动时那 150+ 个自动配置类里，通常只有十几个真正生效。

## 四、条件装配：`@Conditional` 家族

这是自动配置真正的"智能"所在——**让框架既能提供默认实现，又永远给用户留出覆盖的余地**。

| 注解 | 生效条件 | 典型用途 |
|---|---|---|
| `@ConditionalOnClass` | classpath 中存在指定类 | **"引了依赖才生效"**——Starter 的核心机制 |
| `@ConditionalOnMissingClass` | classpath 中不存在指定类 | 避免与其它实现冲突 |
| **`@ConditionalOnMissingBean`** | 容器中**不存在**该类型 Bean | **"用户没自定义才用默认"**——最重要的一个 |
| `@ConditionalOnBean` | 容器中**存在**指定 Bean | 依赖其它 Bean 才生效 |
| `@ConditionalOnProperty` | 配置项满足条件（`havingValue` / `matchIfMissing`） | 功能开关，如 `feature.enabled=true` |
| `@ConditionalOnResource` | 存在指定资源文件 | 按配置文件存在与否决定 |
| `@ConditionalOnWebApplication` | 是 Web 应用（可细分 `SERVLET` / `REACTIVE`） | 只在 Web 环境注册 Web 相关 Bean |
| `@ConditionalOnSingleCandidate` | 该类型 Bean 只有一个（或有 `@Primary`） | 避免多候选时装配歧义 |

**`@ConditionalOnMissingBean` 是理解"为什么我能覆盖框架默认配置"的钥匙：**

```java
@AutoConfiguration
@ConditionalOnClass(RedisOperations.class)
@EnableConfigurationProperties(RedisProperties.class)
public class RedisAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(name = "redisTemplate")     // ★ 用户没定义才注册
    public RedisTemplate<Object, Object> redisTemplate(RedisConnectionFactory factory) {
        RedisTemplate<Object, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(factory);
        return template;
    }
}
```

```java
// 用户想自定义序列化器？直接声明 Bean 即可，自动配置会自动让位
@Configuration
public class MyRedisConfig {
    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory factory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(factory);
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(new GenericJackson2JsonRedisSerializer());   // 覆盖默认 JDK 序列化
        return template;
    }
}
```

**这是一条重要的设计经验**：给团队写公共组件时，**默认实现一律加 `@ConditionalOnMissingBean`**，把"覆盖权"交给使用方。否则使用方只能靠 `exclude` 硬排，体验很差。

## 五、配置类清单的来源：`spring.factories` → `AutoConfiguration.imports`

这是 Spring Boot 版本演进中最容易踩的坑之一，**面试高频追问点**。

| 版本 | 注册位置 | 格式 |
|---|---|---|
| **≤ 2.6** | `META-INF/spring.factories` | Properties 格式，key 为 `org.springframework.boot.autoconfigure.EnableAutoConfiguration`，value 为逗号分隔的类名列表 |
| **2.7 ~ 2.x** | `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` | **每行一个类名**，旧方式保留兼容 |
| **3.x** | 同上（`.imports` 文件） | **`spring.factories` 中的自动配置项已被移除** |

**2.6 及之前：**

```properties
# META-INF/spring.factories
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
com.example.starter.RedisAutoConfiguration,\
com.example.starter.WebAutoConfiguration
```

**2.7 之后：**

```
# META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
com.example.starter.RedisAutoConfiguration
com.example.starter.WebAutoConfiguration
```

**为什么要改？** 三个理由：

1. **`spring.factories` 是"大杂烩"**——同一个文件里塞了自动配置、监听器、初始化器、失败分析器等多种用途，职责混乱；新机制**一个用途一个文件**，语义清晰。
2. **`spring.factories` 是 Properties 格式**，多值场景需要反斜杠续行，容易写错；`.imports` 每行一条，**更适合自动生成与工具处理**。
3. **加载语义更明确**——`.imports` 机制配合 `@AutoConfiguration` 注解，可以精确控制自动配置的排序（`before` / `after`），而旧机制无法表达顺序。

**配套的注解变化**：Spring Boot 3 中自动配置类应标注 **`@AutoConfiguration`**（而非 `@Configuration`），它是 `@Configuration(proxyBeanMethods = false)` 的特化，并额外支持 `before` / `after` 属性声明排序：

```java
@AutoConfiguration(after = DataSourceAutoConfiguration.class)     // 必须在数据源装配之后
@ConditionalOnClass(RedisOperations.class)
public class RedisAutoConfiguration { ... }
```

> **实践提示**：给 Spring Boot 2.7+ / 3.x 写 Starter 时，**必须把清单放到 `.imports` 文件**。只用 `spring.factories` 在 3.x 下**完全不会生效**——这是升级迁移中最常见的"自动配置莫名失效"原因。

## 六、自定义 Starter 的三段式结构

官方 Starter 的目录结构是有讲究的，**照抄这个结构**能避免大部分坑：

```
mybatis-plus-spring-boot-starter/                  ← ① 启动器（空 jar，只做依赖聚合）
  └── pom.xml           依赖：autoconfigure 模块 + 实际的库
        │
mybatis-plus-spring-boot-autoconfigure/            ← ② 自动配置（放代码）
  ├── src/main/java/.../MybatisPlusAutoConfiguration.java
  └── src/main/resources/META-INF/spring/
        org.springframework.boot.autoconfigure.AutoConfiguration.imports
        │
mybatis-plus-spring-boot-starter-test/             ← ③ 测试支持（可选）
```

**为什么要拆成两个模块？** 这是被问得最多的一点：

| 理由 | 说明 |
|---|---|
| **避免依赖污染** | 使用者可能只想用配置类，不想引入实际的库（如自定义一个不依赖具体实现的场景） |
| **职责分离** | `starter` 只管"引哪些依赖"，`autoconfigure` 只管"怎么装配" |
| **测试友好** | 自动配置模块可以独立测试（不拉入完整依赖），启动更快 |

**一个最小的自动配置类：**

```java
@AutoConfiguration
@ConditionalOnClass(GreetingService.class)
@EnableConfigurationProperties(GreetingProperties.class)      // 绑定 greeting.* 配置
public class GreetingAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean                                     // 用户可覆盖
    public GreetingService greetingService(GreetingProperties props) {
        return new GreetingService(props.getPrefix(), props.getLocale());
    }
}
```

```java
@ConfigurationProperties(prefix = "greeting")
@Validated
public class GreetingProperties {
    private String prefix = "Hello";          // 提供合理默认值
    private Locale locale = Locale.CHINA;
    // getter / setter
}
```

```
# META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
com.example.starter.GreetingAutoConfiguration
```

**四条 Starter 设计规范：**

1. **配置项必须有合理默认值**——用户不配也能跑起来（`prefix = "Hello"`）。
2. **所有 Bean 都加 `@ConditionalOnMissingBean`**——把覆盖权交给使用方。
3. **用 `@ConditionalOnClass` 守卫**——避免"引了 autoconfigure 却没引实现库"时报 `ClassNotFoundException`。
4. **类名以 `AutoConfiguration` 结尾，包名避免与官方冲突**（不要放在 `org.springframework.boot` 下）。

## 七、配置优先级

自动配置依赖的配置值来自多个源，**同名配置的覆盖顺序从高到低**：

```
① 命令行参数                    --server.port=9090
② SPRING_APPLICATION_JSON      环境变量里的 JSON
③ ServletConfig / ServletContext 参数
④ JNDI 属性
⑤ Java 系统属性                 -Dserver.port=9090
⑥ 操作系统环境变量               SERVER_PORT=9090
⑦ application-{profile}.yml（jar 包外）
⑧ application-{profile}.yml（jar 包内）
⑨ application.yml（jar 包外）
⑩ application.yml（jar 包内）
⑪ @PropertySource 注解
⑫ 默认属性（SpringApplication.setDefaultProperties）
```

**实践中最常用的三条规则：**

- **命令行 > 环境变量 > 配置文件 > 代码默认值**——这是"外部化配置"的设计目标：**同一份 jar，不改代码就能在不同环境用不同配置**。
- **`profile` 粒度的配置优先于通用配置**——`application-prod.yml` 覆盖 `application.yml`。
- **jar 包外的 `config/` 目录优先于包内**——这让运维可以在部署目录放一份 `application.yml` 覆盖打包时的默认值，无需重新构建。

**两个常被忽略的能力：**

- **随机值**：`${random.int}` / `${random.uuid}`，适合测试环境动态端口。
- **占位符与默认值**：`${redis.host:127.0.0.1}`——冒号后是默认值，避免配置缺失导致启动失败。

## 八、怎么调试自动配置

**自动配置出问题时的第一手段是打开条件评估报告**：

```yaml
# application.yml
debug: true
# 或者
logging:
  level:
    org.springframework.boot.autoconfigure: DEBUG
```

启动后控制台会输出 `ConditionEvaluationReport`，分三块：

```
============================
CONDITIONS EVALUATION REPORT
============================

Positive matches:                    ← 生效的自动配置（附生效原因）
-----------------
   RedisAutoConfiguration matched:
      - @ConditionalOnClass found required class 'org.springframework.data.redis.core.RedisOperations'

Negative matches:                    ← 未生效的（附未生效原因）
-----------------
   MongoAutoConfiguration:
      Did not match:
         - @ConditionalOnClass did not find required class 'com.mongodb.client.MongoClient'

Exclusions:                          ← 被显式排除的
-----------
   ...
```

**这个报告有两个高价值用途：**

| 场景 | 排查方式 |
|---|---|
| **"配置没生效"** | 在 `Negative matches` 里找目标配置类，看它因为哪个条件不满足被跳过 |
| **"Bean 冲突"** | 在 `Positive matches` 里找到意料之外的配置类，确认是否该用 `exclude` 排除 |

**另一个实用工具**：`/actuator/conditions` 端点（需引入 Actuator）可以用 HTTP 方式查看同一份报告，便于线上排查。

## 九、面试问答

**Q1：Spring Boot 自动配置的原理？**

`@SpringBootApplication` 是一个复合注解，核心是 `@EnableAutoConfiguration`，它通过 `@Import(AutoConfigurationImportSelector.class)` 导入自动配置类清单。`AutoConfigurationImportSelector` 会读取 classpath 下所有 jar 包的自动配置清单文件（Spring Boot 2.7+ 是 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`，之前是 `spring.factories`），得到一个候选配置类列表；然后由 `@Conditional` 系列注解逐个裁决是否生效——`@ConditionalOnClass` 判断依赖是否存在，`@ConditionalOnMissingBean` 判断用户是否已自定义；生效的配置类被注册为 `BeanDefinition`，其 `@Bean` 方法产出的对象进入容器，业务代码即可直接注入使用。

**一句话总结：自动配置 = 一份清单（从 `.imports` 读）+ 条件裁决（`@Conditional` 系列）+ 常规的 Bean 注册。**

**Q2：为什么引入 starter 就能用，不需要写配置？**

因为 starter 做了两件事：**① 依赖聚合**——它的 pom 里把所需的库（如 `spring-data-redis`、连接池）都传递进来；**② 携带自动配置清单**——它依赖的 `autoconfigure` 模块提供了 `.imports` 文件和配置类。启动时自动配置类被导入，`@ConditionalOnClass` 检测到 classpath 上的核心类存在，于是注册默认 Bean；`@ConditionalOnMissingBean` 保证仅在用户没有自定义时才注册默认实现。

**Q3：Spring Boot 3.x 中 `spring.factories` 还能用于自动配置吗？**

**不能。** 自动配置的注册位置在 2.7 起迁移到了 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`，Spring Boot 3.x 已**完全移除** `spring.factories` 中的 `EnableAutoConfiguration` 项。改动原因：旧的 `spring.factories` 一个文件承载多种用途（自动配置、监听器、初始化器），职责混杂；`.imports` 一用途一文件、每行一条类名，更好维护也更好支持工具生成。**注意 `spring.factories` 本身并未被删除**，仍用于注册 `ApplicationListener`、`EnvironmentPostProcessor` 等，只是不再承载自动配置。

**Q4：如果我想覆盖自动配置提供的默认 Bean，怎么做？**

**最干净的方式是直接定义自己的 Bean。** 官方自动配置的 Bean 几乎都标注了 `@ConditionalOnMissingBean`——当你声明了同类型（或同名）的 Bean，条件不满足，默认实现自动让位，不需要任何额外配置。如果确实要完全禁用某个自动配置，可以用 `@SpringBootApplication(exclude = XxxAutoConfiguration.class)` 或配置项 `spring.autoconfigure.exclude`。

**Q5：`@ConditionalOnMissingBean` 有什么风险？**

**它与自动配置类的加载顺序强相关**。该注解的判断依据是"当前容器里有没有这个 Bean"，而自动配置是按顺序处理的——如果它被评估时用户定义的那个 Bean 还没注册，判断就会出错，导致默认实现和用户实现同时存在。因此**官方明确建议只在自己编写的自动配置类中使用 `@ConditionalOnMissingBean`，不要用在普通的 `@Configuration` 类里**（用户配置类与自动配置类的注册时序不同）。在自动配置类中，可以用 `@AutoConfiguration(before = ...)` / `after = ...` 精确控制相对顺序。

**Q6：`@ConfigurationProperties` 和 `@Value` 有什么区别，怎么选？**

`@Value("${a.b}")` 只能逐个字段注入，**必须精确匹配键名**，对复杂类型（List / Map / 嵌套对象）支持有限；`@ConfigurationProperties(prefix = "a")` 可以**批量绑定到整个 POJO**，支持**松散绑定**（`a-b-c`、`aBc`、`A_BC` 都能映射到同一个属性），支持复杂类型，配合 `@Validated` 还能直接做校验。**结论：零散的一两个值用 `@Value`，成组的配置一律用 `@ConfigurationProperties`。**

**Q7：自定义 Starter 为什么推荐拆成 `autoconfigure` 和 `starter` 两个模块？**

为了**职责分离与依赖隔离**：`starter` 只做依赖聚合（空 jar，把所需的库和 `autoconfigure` 模块引进来），`autoconfigure` 放自动配置代码与 `.imports` 清单。拆开的好处是：使用者可以只依赖 `autoconfigure`（自己控制实际实现库的版本，避免被 starter 锁死）；自动配置模块可以独立测试，不拉入完整依赖；也让"引什么依赖"和"怎么装配"两件事各自演进，互不干扰。

**Q8：Spring Boot 的配置加载优先级？**

从高到低：**命令行参数 → `SPRING_APPLICATION_JSON` → 系统属性 → 操作系统环境变量 → jar 包外的 `application-{profile}.yml` → jar 包内的 `application-{profile}.yml` → jar 包外的 `application.yml` → jar 包内的 `application.yml` → `@PropertySource` → 代码里的默认值**。核心规律是"**外部优先于内部、具体 profile 优先于通用配置**"——这是外部化配置的设计目标：同一份 jar 不改代码就能适应不同环境。另外 jar 包外 `config/` 目录下的配置会覆盖包内，便于运维在部署目录覆盖打包默认值。

**Q9：自动配置没生效，怎么排查？**

**打开条件评估报告**：配置 `debug: true`（或把 `org.springframework.boot.autoconfigure` 的日志级别调为 `DEBUG`），启动时会输出 `ConditionEvaluationReport`。在 **`Negative matches`** 中查找目标配置类，它会明确写出未生效的原因（如 `@ConditionalOnClass did not find required class 'xxx'`）——通常就是依赖没引或包名写错。如果是 Bean 冲突，则在 `Positive matches` 中定位意料之外的配置类，用 `exclude` 排除。线上环境可用 Actuator 的 `/actuator/conditions` 端点查看同一份报告。
