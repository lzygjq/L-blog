---
date: 2026-09-15
title: 测试基础与 JUnit
sidebar: 测试基础与 JUnit
order: 1
desc: 测试金字塔的真实判据、什么该测什么不该测、JUnit 6 的破坏性变化与迁移、参数化与嵌套结构、断言风格
---

# 测试基础与 JUnit

这一篇不教你「怎么让测试通过」，那是 IDE 的事。它要解决的是三个判断问题：**哪些代码值得写测试、测试写到哪一层为止、JUnit 6 跟前几代到底差在哪。**

## 一、金字塔是判据，不是配额 {#pyramid-judgement}

「单元测试 70%、集成测试 20%、端到端 10%」这类比例被传得很广，但它几乎没有任何指导意义——因为没人能说清那 70% 是按什么单位算的。金字塔真正有用的部分，是它背后的**成本排序**：

```text
   端到端 / 验收        分钟级    全链路     坏了只知道「有东西坏了」
     集成测试           秒级      真依赖     坏了能定位到模块
       单元测试         毫秒级    无外部依赖  坏了直接定位到方法
```

越往下越快、越稳、定位越准，但离「用户真的能用」越远。所以判据只有三句话：

1. **能用单元测试说清的，不要用集成测试**——不是「单元测试更高级」，而是它快、稳、定位准，失败时你不用去翻容器日志。
2. **只靠单元测试说不清的，必须上集成测试**——凡涉及 SQL 方言、事务语义、序列化格式、框架装配、并发控制的地方，Mock 掉就等于把要验证的东西剪掉了。
3. **端到端只留给关键旅程**——登录、下单、支付这类断了就是事故的路径。它最大的价值不是「发现 bug」，而是「证明整条链路此刻是通的」。

### 什么不值得测

判断标准是**「这段代码自己有没有可能错」**，而不是「它在不在覆盖率报告里」：

| 不值得测 | 原因 |
|---|---|
| getter / setter、`toString`、`equals` 由 IDE 生成 | 测它等于测编译器 |
| 纯数据载体（DTO / VO / 实体） | 没有分支就没错的可能 |
| 一行转发的 Controller | 真正的逻辑在 Service，测转发是补覆盖率 |
| 框架自动生成的代码（Mapper 代理、自动配置） | 出错该升级框架，不是加测试 |
| 只是「调用另一个方法」的包装 | 测它等于测别人 |

### 什么必须测

| 必须测 | 原因 |
|---|---|
| 有分支的算法（金额、税率、折扣、分页边界） | 分支多、出错代价高 |
| 边界条件（空集合、单元素、上限、溢出） | 这些是 bug 的高发区 |
| 状态机 / 状态流转 | 组合爆炸，人脑推不完 |
| 并发控制（锁、CAS、队列） | 出问题难以复现，必须有回归测试钉住 |
| 与外部约定的契约（序列化格式、协议、SQL） | 一旦变了就是线上事故 |
| 曾经的 bug（回归测试） | 修过的 bug 最容易复发 |

### 反模式：一堆绿色的、没意义的测试

最常见的坏味道是**把所有协作对象都 Mock 掉**：

```java
// 这个测试除了证明「Mockito 能工作」，什么都没证明
@Test
void shouldReturnUser() {
    when(userMapper.selectById(1L)).thenReturn(new User(1L, "张三"));
    User user = userService.getUser(1L);
    assertEquals("张三", user.getName());
}
```

它断言的是「我的 stub 返回了我 stub 的东西」。真正该验证的是 `userService` 里那段**组装逻辑**——比如「用户不存在时抛什么异常」「禁用状态要不要过滤」——而这段逻辑在示例里根本没被覆盖到。

判据：**如果把这个方法的实现整个删空、直接返回 stub 的值，测试还是绿的，那这个测试就是假的。**

## 二、JUnit 6 变了什么 {#junit6}

JUnit 6.0.0 于 **2025-09-30** 发布（6.0.1 在 2025-10-31）。它不是重写，而是**一次「清账 + 统一」**。下面是实际会影响你项目的地方。

### 2.1 Java 17 是硬门槛

这是升级最大的拦路虎：**JUnit 6 要求 Java 17+**（Kotlin 2.2+）。项目还跑在 Java 8 / 11 上就没得谈，先把 JDK 升级排掉。

对本站的技术栈来说这不构成问题——Spring Boot 3.x 起就要求 Java 17，[JUnit 6 与 Boot 4 是配套的一组](/java/spring/spring-boot/)：

| | 最低 Java | 版本号规则 |
|---|---|---|
| JUnit 5 | Java 8 | Platform `1.x` + Jupiter `5.x` 分开走 |
| JUnit 6 | **Java 17** | Platform / Jupiter / Vintage **统一 6.x** |

### 2.2 版本号终于统一了

JUnit 5 时代最反直觉的一点是：你引的「JUnit 5」其实由 `junit-platform-*`（`1.x`）、`junit-jupiter-*`（`5.x`）、`junit-vintage-*`（`5.x`）三套版本号拼起来。翻 `dependency:tree` 时经常出现 Platform 1.9 配 Jupiter 5.6 的错配。

JUnit 6 把它们统一到同一个 `6.x`——这是迁移后最直接的收益。

### 2.3 三个模块被移除

| 移除的 | 原来干什么 | 现在怎么办 |
|---|---|---|
| `junit-platform-runner` | 用 JUnit 4 的 `Runner` 跑 JUnit 5 测试 | 直接去掉，用原生 `@Test` |
| `junit-platform-jfr` | 把测试事件写成 Java Flight Recorder 事件 | 功能并入 `junit-platform-launcher` |
| `junit-platform-suite-commons` | 套件模块的公共部分 | 并入 `junit-platform-suite` |

另外 `ConsoleLauncher` **必须带子命令**（`--scan-classpath` 之类），以前那种裸跑的方式被移除了——这会打断一部分 CI 脚本。

### 2.4 `@CsvSource` 换了实现的解析器

`@CsvSource` / `@CsvFileSource` 底层从 `univocity-parsers`（已停止维护）换成了 **FastCSV**，严格遵循 RFC 4180。影响是**以前能「糊过去」的引号写法现在会报错**。同时 `@CsvFileSource` 的 `lineSeparator` 属性被移除（自动识别行尾）。

```java
// JUnit 6 里这样写会失败（老版本能过）
@CsvSource({ "a, b, 'c, d'" })
// 含逗号的值必须用双引号包起来
@CsvSource({ "a, b, \"c, d\"" })
```

### 2.5 新的实用能力

| 能力 | 说明 |
|---|---|
| **`CancellationToken`** | 可以主动取消测试执行（长跑套件很有用） |
| **`--fail-fast`** | ConsoleLauncher 支持首个失败即停，大套件下反馈更快 |
| **JSpecify 空安全注解** | 全部 API 标注了 `@Nullable` / `@NonNull`，IDE 与 Kotlin 的空检查更准 |
| **`@Nested` 顺序确定** | `@Nested` 类的执行顺序不再是随机；`@TestMethodOrder` 会被嵌套类继承 |
| **`MethodOrderer.Default` / `ClassOrderer.Default`** | 新增的默认排序器 |

### 2.6 迁移怎么做

1. **JDK 升到 17+**，这是前置条件
2. **依赖统一到 `6.0.0`**（或同版本 BOM）
3. **Maven 插件升到 3.0.0+**——`surefire` / `failsafe` 低于 3.0.0 的支持被移除
4. **清掉废弃 API**：`ReflectionUtils.readFieldValue`、`@UseTechnicalNames`、`PreconditionViolationException`、`ClasspathScanningSupport` 等一批「弃用超两年」的类被删了
5. **`@EnabledOnJre(JAVA_8)` 这类注解可以删**——在 Java 17 baseline 下它们恒不成立

> 大批量的机械替换可以用 OpenRewrite 的 `JUnit5to6Migration` recipe 跑一版，再人工复核。这件事本身**很适合写成一次可复现的迁移记录**——比背 API 更能体现工程能力。

### 2.7 JUnit 4 的处境

`junit-vintage-engine`（跑 JUnit 4 测试）**已被正式弃用**。它还能用，但只剩「给老项目过渡」这一个身份。新项目没有理由再引它。

## 三、测试的骨架：结构与生命周期 {#lifecycle}

```java
class OrderServiceTest {

    @BeforeAll            // 整个类执行一次 —— 必须 static
    static void initAll() { }

    @BeforeEach           // 每个测试方法前 —— 不允许 static
    void init() { }

    @AfterEach            // 每个测试方法后
    void tearDown() { }

    @AfterAll             // 整个类结束后一次 —— 必须 static
    static void closeAll() { }
}
```

四个注解里最容易搞错的是 **`@BeforeAll` / `@AfterAll` 必须是 `static`**（因为它们在实例创建前/销毁后执行）。除非类上标了 `@TestInstance(PER_CLASS)`——那时生命周期方法可以是非 static 的，这也顺带解决了「`@BeforeAll` 里想用实例字段」的别扭。

### 3.1 执行顺序：默认不确定，且不该依赖

JUnit 默认**不保证测试方法之间的执行顺序**（有意为之）。原因很直接：**能通过的顺序依赖测试，本质上是在共享状态**——今天绿，明天加个方法就红。

如果确实需要顺序（例如演示性的场景测试），显式声明：

```java
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class FlowTest {
    @Test @Order(1) void step1() { }
    @Test @Order(2) void step2() { }
}
```

但更该问的是：**这两个测试为什么不能各自独立？** 大多数「需要顺序」的场景，其实是 `@BeforeEach` 里的准备不够。

### 3.2 `@Nested`：用结构表达场景

`@Nested` 是比「方法名里塞 `_whenXxx_shouldYyy`」更好的组织方式——它让测试类本身成为一份**可读的规格说明**：

```java
class DiscountCalculatorTest {

    @Nested
    @DisplayName("当用户是 VIP 时")
    class WhenVip {
        @Test void 满一百减二十() { }
        @Test void 不满一百不打折() { }
    }

    @Nested
    @DisplayName("当用户是普通用户时")
    class WhenNormal {
        @Test void 不打折() { }
    }
}
```

JUnit 6 里 `@Nested` 的执行顺序变得确定了——这让嵌套结构从「能读」升级到「能读且可复现」。

## 四、参数化：一个逻辑多种输入 {#parameterized}

同一段逻辑要验证多组输入时，参数化测试比复制粘贴强一个档次——**因为失败信息会告诉你是哪一组数据挂了**。

```java
@ParameterizedTest(name = "[{index}] {0} 的税额应为 {1}")
@CsvSource({
    "100,   6",     // 普通
    "0,     0",     // 边界：零
    "10000, 600",   // 上限档
    "\"100,5\", 6"  // 含逗号的值 —— 必须双引号
})
void 计算税额(String amount, int expected) {
    assertThat(calculator.tax(new BigDecimal(amount))).isEqualByComparingTo(expected);
}
```

| 数据源 | 适用 |
|---|---|
| `@ValueSource` | 单个参数的简单值（一组字符串 / 数字） |
| `@CsvSource` | 多参数、数据量小、想直接写在注解里 |
| `@CsvFileSource` | 多参数、数据量大或需要复用（放在 `src/test/resources`） |
| `@EnumSource` | 遍历枚举——**测「所有枚举值都被覆盖」的利器** |
| `@MethodSource` | 数据本身要构造（对象、复杂结构） |

`@EnumSource` 值得单独提一句：新增枚举值时，参数化测试会自动把新值纳入覆盖——**这是防止「加了枚举忘了处理」的少数有效手段**。

> JUnit 5.13 起还有 `@ParameterizedClass`（整个类参数化），JUnit 6 里保留并增强。用它要克制，类级参数化会让结构变复杂。

## 五、断言：别用 `assertEquals` 撑全场 {#assertions}

JUnit 原生断言能用，但有两个长期痛点：**参数顺序容易写反**（`assertEquals(expected, actual)`，写反了失败信息会误导人），以及**集合/对象断言很无力**（只能比 `toString` 或自己写循环）。

### 5.1 用 AssertJ 的流式断言

```java
// JUnit 原生：集合断言很难表达
assertEquals(3, list.size());
assertTrue(list.contains("a"));

// AssertJ：意图直接读出来
assertThat(list).hasSize(3).contains("a").doesNotContain("z");

assertThat(user)
    .extracting(User::getName)
    .isEqualTo("张三");

assertThat(orders)
    .filteredOn(o -> o.getAmount().compareTo(HUNDRED) > 0)
    .hasSize(2);
```

它最大的价值不是「语法好看」，而是**失败信息能直接指出是哪一项不符合**——`list` 有 500 个元素时，`assertEquals` 只告诉你「期望 3 实际 5」，AssertJ 会告诉你差在哪。

### 5.2 异常断言要断言到「哪个异常 + 什么信息」

```java
// 太弱：任何 RuntimeException 都能过
assertThatThrownBy(() -> service.get(1L)).isInstanceOf(RuntimeException.class);

// 够用：类型 + 错误码
ServiceException ex = assertThrows(ServiceException.class, () -> service.get(1L));
assertThat(ex.getCode()).isEqualTo(USER_NOT_EXISTS);
```

**只断言「抛了异常」的测试，在异常类型没变但错误码变了的场景下是瞎的。**

### 5.3 多个断言失败只想看一次报告 → 软断言

默认情况下，第一个断言失败就会中断测试方法，后面的断言根本不执行。改一处代码要跑五次测试才能收集齐所有问题——这时候用软断言：

```java
// JUnit 原生
assertAll(
    () -> assertEquals("张三", user.getName()),
    () -> assertEquals(18, user.getAge())
);

// AssertJ
SoftAssertions softly = new SoftAssertions();
softly.assertThat(user.getName()).isEqualTo("张三");
softly.assertThat(user.getAge()).isEqualTo(18);
softly.assertAll();   // 别忘这一行，忘了等于没断言
```

`softly.assertAll()` 漏写是个经典坑——**断言不执行，测试永远绿**。

### 5.4 超时断言

```java
assertTimeout(Duration.ofMillis(200), () -> service.batchProcess(list));
```

注意 `assertTimeout` 是「跑完再判断」（不中断），`assertTimeoutPreemptively` 是「到点就中断但会另起线程」——**后者在测试里涉及线程上下文（`ThreadLocal`、事务）时行为会变**，慎用。

## 六、异步测试：别用 `Thread.sleep` {#async-wait}

```java
// 坏：浪费时间，而且不一定够
Thread.sleep(2000);
assertEquals(1, counter.get());

// 好：轮询直到条件成立或超时
await().atMost(Duration.ofSeconds(5))
       .untilAsserted(() -> assertThat(counter.get()).isEqualTo(1));
```

`Thread.sleep` 的两个问题：慢的时候白等，快的时候不够——而**在 CI 机器上「不够」是常态**。Awaitility 的轮询模型既快又稳。

需要精确控制并发时序时（比如验证锁的行为），用 [CountDownLatch](/java/concurrent/juc-tools#countdown-latch) 让测试自己编排顺序，而不是靠睡眠碰运气。

## 七、常见坑 {#pitfalls}

1. **测实现不测行为**：断言内部调用了哪个方法、依赖哪个字段。重构一动就红——**而重构不该让测试变红**。
2. **断言太弱**：`assertNotNull(result)` 几乎等于没测。它只能抓住「NPE 级」的错误。
3. **一个方法塞太多断言**：失败时只说「第一个断言挂了」，后面全不执行，排查要一轮一轮来。
4. **测试间共享可变状态**：静态字段、单例缓存没清干净 → 单独跑绿、一起跑红。这类问题的排查成本极高，因为它取决于执行顺序。
5. **依赖执行顺序**：见 3.1。测试之间应该彼此**不知道对方存在**。
6. **用睡眠等待异步**：见第六节。
7. **断言不确定的东西**：直接断言 `LocalDateTime.now()`、`UUID.randomUUID()`、`HashMap` 的迭代顺序。要测时间就注入时钟，要测随机就注入种子（详见[可测性设计](/java/testing/quality-gates#testability)）。
8. **Mock 掉被测对象自己**：`spy` 之后把核心方法也 stub 掉，测试就变成了「验证我 stub 的东西」。
9. **为覆盖率写测试**：为了让数字好看，给 getter 写一堆 `assertNotNull`。这是本板块最想劝退的行为——详见 [覆盖率与质量门禁](/java/testing/quality-gates#coverage)。
10. **测试名不表达意图**：`test1`、`testGetUser2`。测试名是**唯一会在失败报告里出现的东西**，它应该直接说明「什么条件下、期望什么」。

## 八、面试口径 {#interview}

1. **单元测试和集成测试怎么划分？** 按「依赖的真假」划，不按代码层级划——只依赖内存中对象的是单元测试，碰了数据库/网络/容器的是集成测试。划分的意义在于**反馈速度与失败定位精度**，所以判据是：能用单元测试说清的不要上集成测试，只说清不了的必须上集成测试。
2. **单元测试要写到多少覆盖率？** 覆盖率是**发现测试盲区**的工具，不是目标。追 100% 会逼出大量无意义断言。可行的做法是：核心模块设较高门槛（如 60~80% 分支覆盖），非核心不设硬指标，同时用「新增代码覆盖率」卡住增量。
3. **测试之间能互相依赖吗？** 不能。依赖顺序的测试是**共享状态**的症状，JUnit 也刻意不保证顺序。需要顺序说明准备不充分——把前置条件挪进 `@BeforeEach`。
4. **`@BeforeAll` 为什么要 static？** 它在类实例创建前执行，所以只能访问静态成员。想用实例字段就上 `@TestInstance(PER_CLASS)`。
5. **`@Mock` 和 `spy` 的区别？** Mock 是空壳（方法默认返回 null/0），spy 是真实对象的包装（默认走真实实现，只 stub 你指定的方法）。spy 用多了通常意味着设计耦合太重。
6. **为什么不用 `Thread.sleep` 做异步等待？** 两个方向都错：时间给长了白等（CI 上是分钟级累积），给短了随机红（flaky）。应该用 Awaitility 这类轮询断言，或 `CountDownLatch` 精确编排时序。
7. **JUnit 5 到 JUnit 6 主要变化？** Java 17 baseline；三套版本号统一为 6.x；移除 `junit-platform-runner` / `-jfr` / `-suite-commons`；`@CsvSource` 换 FastCSV 后引号规则更严；`lineSeparator` 属性移除；新增 `CancellationToken` 与 `--fail-fast`；JSpecify 空安全注解；Vintage（JUnit 4）弃用。
8. **测试名有什么讲究？** 它是失败报告里唯一出现的信息。好的名字包含**条件 + 期望**（「VIP 用户满一百减二十」），而不是编号或方法名复述。
9. **哪些代码可以不测？** 没有分支可能的代码：getter/setter、纯数据载体、框架生成代码、纯粹转发。判断标准是「这段代码自己有没有可能错」。
10. **怎么判断一个测试是「假测试」？** 把被测方法的实现删空、直接返回 stub 的值，测试还是绿的——那它测的是 stub，不是被测逻辑。这个判据能一眼识别出大量为覆盖率而生的测试。

> 下一篇讲**怎么把协作对象换成替身**：[Mock 与替身技术](/java/testing/mockito)。
