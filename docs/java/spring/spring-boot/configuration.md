---
order: 4
date: 2026-09-15
sidebar: 配置体系
title: Spring Boot 外部化配置体系
desc: 15 层属性源的优先级与成因、config data 内部的 4 层、Profile 与多文档、spring.config.import 的反直觉语义、config tree 与 K8s、ConfigurationProperties 绑定与校验、密钥与动态刷新
---

# Spring Boot 外部化配置体系

> 这篇回答一个每天都在发生的问题：**"我明明改了配置文件，为什么没生效？"**
>
> 它和[自动配置原理](/java/spring/spring-boot/auto-configuration#config-precedence)里的「配置优先级」小节是同一件事的两个视角：那一节列出顺序是为了说明"自动配置从哪取值"，这一篇讲的是**顺序为什么是这个样子、以及怎么利用它**。

## 一、问题场景 {#why-config}

先看一个几乎人人都遇到过的现场：

```text
① 本地开发：application.yml 里写 server.port: 8080                → 生效
② 部署到 K8s：改 application-prod.yml 为 9090                     → 没生效，还是 8080
③ 排查：配置文件确实被加载了（同一个文件里另一个配置项改动生效了）
④ 最后发现：容器环境变量里有 SERVER_PORT=8080
```

这个问题的答案只有一句话：**环境变量的优先级高于所有配置文件**。但如果不了解优先级体系的构成，就只能靠"一个个删配置试"来定位——而 Spring Boot 默认不会告诉你"这个值到底从哪来的"。

**本篇要建立的能力**：拿到一个"配置不生效"的问题，能在 3 分钟内说出"被哪一层压住了"，并知道用什么手段把它**显式地验证出来**。

## 二、配置从哪来：15 层属性源 {#precedence}

### 2.1 完整列表（后者覆盖前者） {#full-list}

| # | 来源 | 说明 |
|---|---|---|
| 1 | 默认属性 | `SpringApplication.setDefaultProperties(...)` |
| 2 | `@PropertySource` | 挂在 `@Configuration` 上；**直到 refresh 阶段才加入 Environment**，因此配不了 `logging.*`、`spring.main.*` 这类早期属性 |
| 3 | **Config data（配置文件）** | `application.properties` / `.yaml`、profile 文件、`spring.config.import` 导入的一切 |
| 4 | `RandomValuePropertySource` | 只有 `random.*` 前缀 |
| 5 | **操作系统环境变量** | 如 `SERVER_PORT` |
| 6 | Java 系统属性 | `-Dserver.port=9090` |
| 7 | JNDI（`java:comp/env`） | 传统应用服务器场景 |
| 8 | `ServletContext` 初始化参数 | |
| 9 | `ServletConfig` 初始化参数 | |
| 10 | `SPRING_APPLICATION_JSON` | 内嵌 JSON 的环境变量 / 系统属性 |
| 11 | **命令行参数** | `--server.port=9090` |
| 12 | 测试上的 `properties` 属性 | `@SpringBootTest(properties = ...)` |
| 13 | `@DynamicPropertySource` | 测试中动态注册（如 Testcontainers） |
| 14 | `@TestPropertySource` | 测试专用 |
| 15 | Devtools 全局设置 | `$HOME/.config/spring-boot`，仅 devtools 激活时 |

### 2.2 三条必记的结论 {#three-conclusions}

**① 配置文件是最"弱"的一档。** 第 3 层之上还有 12 层，其中最常见的两层是**环境变量（5）**与**命令行参数（11）**。所以「本地改了生效、线上改了不生效」，第一个要查的就是环境变量。

**② 同名前缀的两层，差一位就差很多。** 注意顺序是"后来的覆盖先前的"，不要记成"越靠前的越优先"——这是最容易记反的一点。

**③ 同一位置同时有 `.properties` 与 `.yaml` 时，`.properties` 赢。** 官方建议整个应用只用一种格式，混用会出现"我改的 yml 没生效、而没人看的 properties 生效了"这种事故。

### 2.3 config data 内部还有 4 层 {#config-data-order}

只看第 3 层，它自己也是一套顺序（后者覆盖前者）：

```text
① jar 内的 application.properties                    ← 打包进产物的默认值
② jar 内的 application-{profile}.properties           ← profile 覆盖默认
③ jar 外的 application.properties                    ← 部署目录覆盖产物
④ jar 外的 application-{profile}.properties          ← 最高
```

**这个设计意图很明确**：产物里放"能跑的默认值"，部署时在 jar 旁边放文件覆盖，**不需要重新打包**。这也是「配置与代码分离」在 Spring Boot 里的落地方式。

搜索位置依次是（`spring.config.location` 可整体替换、`spring.config.additional-location` 可追加）：

```text
optional:classpath:/
optional:classpath:/config/
optional:file:./
optional:file:./config/
optional:file:./config/*/
```

最后一条 `./config/*/` 是**通配位置**：它会展开 `./config/` 下的**直接子目录**，因此 `./config/redis/application.properties` 与 `./config/mysql/application.properties` 会被**同时**加载——K8s 里把多个 ConfigMap 挂成不同子目录时非常有用（**通配只对外部目录生效，`classpath:` 下不支持**）。

**`optional:` 前缀很重要**：没有它时，配置位置不存在会**直接启动失败**；加了才表示"允许缺失"。给外部依赖的配置位置（如 `configserver:`）一律加 `optional:`，否则配置中心抖动会导致应用起不来。

## 三、Profile：按环境切换配置 {#profile}

### 3.1 profile 文件与多 profile 的顺序 {#profile-files}

| 规则 | 说明 |
|---|---|
| 命名 | `application-{profile}.yml`，与 `application.yml` **从同一批位置加载** |
| 覆盖 | profile 文件**总是覆盖**通用文件（不论是 jar 内还是 jar 外） |
| 多 profile | **后赢**：`--spring.profiles.active=prod,live` 时 `application-live.yml` 覆盖 `application-prod.yml` |
| 默认 profile | 未设置时是 `default`，即 `application-default.yml` 会被考虑 |
| 只加载一次 | 若某个 profile 文件已被显式 import，不会再被当作 profile 文件加载第二遍 |

**"后赢"这条容易踩**：它的实际含义是"**最后激活的那个 profile 优先级最高**"，而不是"先激活的优先"。用 CI 变量拼接 `--spring.profiles.active=base,env` 这类写法时，必须明确谁在最后。

### 3.2 多文档文件：不增加文件的写法 {#multi-document}

同一个 `.yml` 里用 `---` 分隔多个文档，用 `spring.config.activate.on-profile` 做条件激活：

```yaml
demo:
  greeting: 默认值
---
spring:
  config:
    activate:
      on-profile: staging
demo:
  greeting: staging 用的值
---
spring:
  config:
    activate:
      on-profile: prod
demo:
  greeting: prod 用的值
```

**规则**：**后面的文档覆盖前面的**，所以第一个无条件文档天然充当默认值。这样好处是"一个技术的全部环境配置在一屏内可对比"，坏处是容易忘记谁覆盖谁——**文档顺序即优先级顺序**。

### 3.3 profile group：一次激活一组 {#profile-group}

```yaml
spring:
  profiles:
    group:
      prod: proddb, prodmq
```

激活 `prod` 时同时激活 `proddb` 与 `prodmq`。

**一个关键的时序细节**：**profile group 会在 config data 被处理之前解析**。所以"在 `application.yml` 里声明 group"是有效的——它仍能控制后续要加载哪些文件。这也意味着 group 的写法不能反过来依赖某个 profile 文件里的值。

### 3.4 `@Profile` 与配置文件是两回事 {#profile-vs-annotation}

| | 配置文件（`application-{profile}.yml` / `on-profile`） | `@Profile` 注解 |
|---|---|---|
| 作用对象 | **属性值** | **Bean 是否存在** |
| 生效时机 | config data 解析阶段（很早） | 容器构建、条件评估阶段（很晚） |
| 典型用途 | 数据库地址、开关 | `prod` 用实现 A、`dev` 用 Mock 实现 |

**混淆的后果**：想用 `@Profile("prod")` 来"切换配置值"——做不到，它只决定 Bean 装不装。反过来，想用配置文件来"禁用某个 Bean"也不对，配置只影响属性的值。

## 四、`spring.config.import`：导入外部配置 {#config-import}

这是 Spring Boot 2.4 引入、现在最重要的扩展点之一。

### 4.1 一个反直觉的语义 {#import-semantics}

```yaml
# application.yml
spring:
  application:
    name: myapp
  config:
    import: optional:file:./dev.properties
```

```properties
# ./dev.properties
spring.application.name=overridden
```

**结果是 `overridden`，不是 `myapp`。** 官方文档写得很清楚：

> Imports are processed as they are discovered, and are treated as **additional documents inserted immediately below the one that declares the import**. Values from the imported file will take precedence over the file that triggered the import.

**为什么这样设计**：导入的通常更"具体"（外部覆盖文件、配置中心、挂载的 Secret），理应比"声明它的通用文件"优先级更高。这也解释了另一个高频疑惑——"我明明把 `spring.config.import` 写在 `application.yml`，为什么 `application-prod.yml` 里的值被它盖住了？"

**三条配套规则**：

| 规则 | 说明 |
|---|---|
| 只导入一次 | 无论声明多少次，同一个位置只导入一次 |
| 声明顺序有意义 | 同一键下多个位置**按定义顺序处理，后导入的优先** |
| 文档内位置无关 | 同一文档里 `spring.config.import` 写在哪一行都一样 |

### 4.2 config tree：K8s 挂载配置的标准解法 {#config-tree}

K8s 的 ConfigMap / Secret 挂载到容器里是**目录树**形态：每个 key 是一个文件，文件内容是 value。

```bash
/etc/app-config/
├── spring.datasource.password     # 文件内容就是密码
├── app.feature.enabled            # 文件内容 true
└── app.retry.limit                # 文件内容 3
```

`configtree:` 前缀就是为它准备的：

```yaml
spring:
  config:
    import: "configtree:/etc/app-config/"
```

**为什么不用环境变量**：环境变量的 key 只能 `[A-Z0-9_]`，**无法表达大小写敏感与点号层级**（`app.retry.limit` 变成 `APP_RETRY_LIMIT`，再由 Boot 反向映射回来，遇到不规则命名就会失真）；而且环境变量会进 `/proc/1/environ`，密码类信息更容易泄露。**config tree 是官方推荐的容器内配置挂载方式**。

> 另外：挂载的文件**没有扩展名**时，需要给加载器提示，例如 `spring.config.import=file:/etc/config/app[.yaml]`。K8s 挂载默认不带扩展名，这一点经常被忽略。

## 五、`@ConfigurationProperties` 还是 `@Value` {#binding}

### 5.1 对比 {#binding-compare}

| 维度 | `@Value("${a.b}")` | `@ConfigurationProperties` |
|---|---|---|
| 类型安全 | ❌ 靠字符串转换，错在运行时 | ✅ 绑定失败即启动失败 |
| 松散绑定 | ❌ | ✅ |
| 复杂对象 / 集合 / 嵌套 | ❌ 很别扭（`@Value` 表达不了 `Map<String, X>`） | ✅ |
| JSR-380 校验 | ❌ | ✅ `@Validated` |
| IDE 提示与元数据 | ❌ | ✅ |
| SpEL | ✅ 支持 `${...}` 与 `#{...}` | ❌ 不支持 |
| 适用 | **单个**简单值、临时开关 | **一组**相关配置 |

**判据**：**两个以上相关配置项，就应该有一个 `@ConfigurationProperties` 类**。它带来的不只是绑定能力，更重要的是"**把配置收敛成一个有类型、有默认值、可校验的对象**"——配置出错在启动时就报，而不是运行时某次调用。

### 5.2 松散绑定：同一个属性的多种写法 {#relaxed-binding}

| 写法 | 场景 |
|---|---|
| `app.my-name` | kebab-case（**官方推荐的配置文件写法**） |
| `app.myName` | camelCase |
| `app.my_name` | snake_case |
| `APP_MYNAME` | 环境变量 |

**四条注意**：

1. **推荐写法是 kebab-case**，因为环境变量形式本质上是"全大写下划线"，只有 kebab-case 能被无歧义地映射过去。
2. **环境变量到属性名是单向的**：`SERVER_PORT` → `server.port` 可以，反向表达大小写敏感的名字就不行——这又一次解释了为什么容器里"值被环境变量覆盖"最难察觉。
3. **前缀本身也要松散匹配**（`@ConfigurationProperties(prefix = "app")` 对应 `app.*` / `APP_*`）。
4. **集合绑定有两种**：逗号分隔的单个值（`app.hosts=a,b,c`）与索引写法（`app.hosts[0]=a`）。**索引写法在环境变量下不可用**（`APP_HOSTS_0` 这种名字不可靠），K8s 里传列表建议用逗号分隔或 config tree。

### 5.3 校验与元数据 {#validation-metadata}

```java
@ConfigurationProperties(prefix = "app")
@Validated                                                     // 开启 JSR-380 校验
public class AppProperties {

    @NotBlank                                                  // 必填
    private String name;

    @Min(1) @Max(1000)                                         // 边界
    private int poolSize = 10;                                 // 默认值

    @DurationUnit(ChronoUnit.SECONDS)                          // 支持 "30s" / PT30S
    private Duration timeout = Duration.ofSeconds(3);

    @NestedConfigurationProperty                               // 嵌套对象也要有元数据
    private Retry retry = new Retry();
}
```

**为什么值得加校验**：配置错误的**最佳发现时机是启动期**。`@Validated` + `@NotBlank` 让"忘了配 `app.name`"变成一条启动失败信息，而不是运行半小时后一个空指针。

**构造器绑定**：`@ConstructorBinding`（或单构造器自动识别）适合不可变配置对象，代价是**没有默认值就必须全配**。两者的取舍是"可变 + 默认值"对"不可变 + 强约束"。

## 六、密钥怎么放 {#secrets}

| 方案 | 适用 | 代价 |
|---|---|---|
| **环境变量** | 简单场景 | 会进 `/proc/1/environ` 与 `docker inspect`；无法表达复杂 key |
| **K8s Secret + config tree** | 容器部署（推荐） | 需要 RBAC 与挂载配置 |
| **配置中心**（如 Nacos / Spring Cloud Config） | 多环境、需要集中管理 | 引入额外依赖与单点；需处理 `optional:` 与启动依赖 |
| **云 KMS / 信封加密** | 合规要求高 | 接入成本高 |
| **Jasypt 等本地加密** | 遗留系统过渡 | 主密钥仍在环境里，只是"换了个地方放" |

**三条硬规则**：

1. **绝不把生产密钥写进版本库**（包括 `application-prod.yml`）。放在仓库里的密钥等于公开——尤其是当仓库还会被当作简历附件或公开示例时。
2. **注意 Actuator 的泄露面**：`/actuator/env` 与 `/actuator/configprops` 会**脱敏**（默认把 `password` 一类值显示为 `******`），但 `/actuator/heapdump` 拿到的是**堆快照**，明文密钥就在里面。所以真正的手段是**不暴露这些端点**，而不是依赖脱敏（详见 [Actuator 与生产可观测](/java/spring/spring-boot/actuator#security)）。
3. **启动期校验密钥存在性**：配合 `@Validated` 让"密钥没注入"在启动时就失败，而不是第一次调用外部接口时。

## 七、动态刷新 {#refresh}

配置中心的诉求是"改配置不重启"。机制与限制：

| 机制 | 说明 | 限制 |
|---|---|---|
| `@RefreshScope` | Bean 被代理，刷新时**销毁并重建** | 只对标注了它的 Bean 生效；重建会丢失该 Bean 的内部状态 |
| `@ConfigurationProperties` 重新绑定 | 刷新事件触发重新绑定 | 依赖它的 Bean 若没标 `@RefreshScope`，仍持有旧值引用 |
| `EnvironmentChangeEvent` | 监听属性变更事件 | 只能读到"哪些 key 变了"，自己做二次处理 |

**四个必须知道的坑**：

1. **端口、日志级别这类早期属性刷不了**——它们在使用它们的组件启动时就固定了（`server.port` 改了不会重新绑定端口）。
2. **`@RefreshScope` 的 Bean 每次刷新都重建**，如果它持有连接池、本地缓存，重建代价会被低估。
3. **单例 Bean 注入了 `@RefreshScope` Bean** 时，注入的是代理，能拿到新值；但如果它注入的是**具体配置值（`@Value` 的字段）**，就不会更新——这是"刷新了没生效"最常见的原因。
4. **并发刷新**：刷新期间会出现"部分 Bean 新值、部分旧值"的窗口，严格一致性要求高的配置不适用。

## 八、版本现状 {#version}

| 事实 | 说明 |
|---|---|
| **配置体系的机制稳定** | `spring.config.import` 自 2.4 引入后语义未变；本文描述的优先级与 profile 规则在 3.x / 4.x 一致 |
| **Spring Boot 4.0** | 2025-11-20 发布（Spring Framework 7.0）；**Jackson 升级到 3**（`tools.jackson` 命名空间），JSON 相关配置行为有变化 |
| **Spring Boot 4.1** | 2026-06-10 发布 |
| **Spring Boot 3.5 已 EOL** | OSS 支持 **2026-06-30 结束**（最后补丁 3.5.16）；4.0.x 支持到 2026-12-31 |
| **属性迁移工具** | `spring-boot-properties-migrator`：运行时识别被重命名/废弃的配置项并打印迁移提示，**迁移完成后必须移除**（别带上生产） |

## 九、常见坑 {#pitfalls}

| 坑 | 症状 | 定位手段 |
|---|---|---|
| 环境变量压过配置文件 | 改文件不生效 | `/actuator/env` 会列出**所有**属性源及其顺序，直接看是哪一层提供的值 |
| `spring.config.import` 位置写对但优先级反了 | 被导入文件盖住了当前文件 | 记住"导入文档插在声明者下方 → 优先级更高" |
| 通配位置用在 classpath 上 | 配置没被加载 | 通配只支持外部目录 |
| 忘了 `optional:` | 外部配置缺失时启动失败 | 给外部来源一律加 `optional:` |
| 用 `@Profile` 切配置值 | 无效 | 切**属性值**用 profile 文件，切**Bean** 用 `@Profile` |
| 多 profile 顺序记反 | 期望的环境配置没赢 | 记住"最后一个赢" |
| K8s 挂载文件无扩展名 | 未导入 | `spring.config.import=file:/path/app[.yaml]` |
| 密钥进了版本库 | 泄露 | 用 config tree / 配置中心，并关闭危险 Actuator 端点 |
| 只改了 `@Value` 想动态刷新 | 不更新 | 改用 `@ConfigurationProperties` + `@RefreshScope`（或接受重启） |

## 十、使用场景与面试问答 {#interview}

**Q1：Spring Boot 的配置优先级顺序是什么？**

从低到高：默认属性 → `@PropertySource` → **配置文件（config data）** → `random.*` → **环境变量** → Java 系统属性 → JNDI → `ServletContext` / `ServletConfig` 初始化参数 → `SPRING_APPLICATION_JSON` → **命令行参数** → 测试注解相关 → devtools 全局设置。**后者覆盖前者**。

**最该记住的一条**：配置文件整体处在**中下位**——环境变量与命令行参数都压得过它。所以"线上改配置不生效"先查环境变量。

**Q2：配置文件之间还有顺序吗？**

有，四层（后者覆盖前者）：jar 内 `application` → jar 内 `application-{profile}` → jar 外 `application` → jar 外 `application-{profile}`。设计意图是"产物带默认值、部署可覆盖，不必重新打包"。

**Q3：`spring.config.import` 的优先级方向是什么？**

**被导入的配置优先于导入它的配置文件**。因为它被当成"插在声明它的文档紧下方"的额外文档，而文档顺序上后出现者优先。这与很多人的直觉相反，也是最容易误判的一处。

**Q4：怎么在 K8s 里传配置，为什么不用环境变量？**

用 **config tree**：把 ConfigMap / Secret 挂载成目录，然后 `spring.config.import=configtree:/etc/config/`。理由是环境变量的 key 受限（只能大写字母、数字、下划线），**无法无歧义地表达层级与大小写**，密码也更容易通过 `/proc/1/environ` 泄露；config tree 还能保留原始的 key 名。

**Q5：`@ConfigurationProperties` 和 `@Value` 怎么选？**

一组相关配置用 `@ConfigurationProperties`（类型安全、支持集合与嵌套、支持校验、有 IDE 元数据），单个简单值可以用 `@Value`。`@Value` 的优势只有 SpEL 支持；它的短板是"绑定失败发生在运行时"。

**Q6：`@Profile` 和 `application-{profile}.yml` 什么关系？**

作用对象不同：前者决定**Bean 装不装**（在容器构建期评估），后者决定**属性值**（在 config data 解析期读取）。所以不能用 `@Profile` 去切配置值，也不能靠配置文件去禁用一个 Bean。

**Q7：如何排查"配置没生效"？**

三步：① 打开 `/actuator/env`（或 `/actuator/configprops`）看**该属性的最终值与来源**——这是最快的一步，它直接告诉你哪一层赢了；② 检查是否有同名环境变量 / 命令行参数（常见于容器与启动脚本）；③ 检查是否被 `spring.config.import` 的导入文档覆盖。**不要靠删配置试**。

**Q8：配置能动态刷新吗？**

能，但有限制。`@RefreshScope` 通过"销毁并重建代理目标"实现，因此：**只能影响标注了它的 Bean**；端口、日志级别这类**早期属性刷不了**；单例里若注入的是 `@Value` 的字段值，也不会更新（要么注入 `@RefreshScope` Bean，要么改用 `@ConfigurationProperties`）。这些限制是"改配置不重启"承诺背后必须付出的代价。

---

> 相关篇目：[自动配置原理](/java/spring/spring-boot/auto-configuration)（条件装配如何消费配置）、[Starter 设计与自定义](/java/spring/spring-boot/starter)（配置项的默认值与元数据）、[Actuator 与生产可观测](/java/spring/spring-boot/actuator)（`env` / `configprops` 端点与安全边界）。
