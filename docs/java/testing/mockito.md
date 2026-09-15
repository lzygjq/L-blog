---
date: 2026-09-15
title: Mock 与替身技术
sidebar: Mock 与替身
order: 2
desc: 五种替身的辨析、Mockito 的正确用法与严格桩、Mock 的适用边界（何时 Mock 是自欺欺人）、inline mock maker 与 Java Agent 配置
---

# Mock 与替身技术

上一篇讲了「测哪一层」，这一篇讲**怎么把不关心的依赖换成替身**。但真正难的不是 API，而是那个反复出现的问题：**这块东西到底该不该 Mock。**

## 一、先分清「替身」的五个种类 {#doubles}

业内把测试替身（test double）分成五类，中文常统称「Mock」，但它们的行为差别很大：

| 类型 | 干什么 | 典型场景 |
|---|---|---|
| **Dummy** | 只是占位，用不到 | 传个 `null` 或空对象凑参数 |
| **Stub** | 返回预设值 | `when(mapper.selectById(1L)).thenReturn(user)` |
| **Spy** | 包装真实对象，只改指定方法 | 想验证真实逻辑，但其中一个外部调用要控制 |
| **Mock** | 预先设定期望，验证「有没有被调用」 | `verify(emailService).send(...)` |
| **Fake** | 有真实实现的简化版 | 内存版 Repository、H2 代替 MySQL |

**这个分类的实际价值在于让你分清两件事**：

- **Stub 是「输入」**——给被测方法喂数据
- **Mock 是「输出」**——断言被测方法产生的影响

大部分测试只需要 Stub，只有在「方法的副作用本身就是要验证的行为」时才需要 Mock。**只 Stub 不 verify 的测试往往更稳**，因为它不对实现方式做承诺。

而 **Fake 是被严重低估的一类**。当你有 10 个测试都要用同一个依赖时，写一个内存实现比写 10 组 `when(...)` 更好维护——这也是 [H2 代替 MySQL](/java/testing/integration-test#h2-vs-real) 那个套路的本质。

## 二、Mockito 的骨架 {#usage}

先看一个真实项目里最短的、但是**完整**的单元测试（yudao 的 `BpmTaskCandidateRoleStrategy`，测策略模式里的一个分支）：

```java
public class BpmTaskCandidateRoleStrategyTest extends BaseMockitoUnitTest {

    @InjectMocks
    private BpmTaskCandidateRoleStrategy strategy;   // 被测对象

    @Mock
    private RoleApi roleApi;                          // 协作者：被替换
    @Mock
    private PermissionApi permissionApi;              // 协作者：被替换

    @Test
    public void testCalculateUsers() {
        // 准备参数
        String param = "1,2";
        // mock 方法
        when(permissionApi.getUserRoleIdListByRoleIds(eq(asSet(1L, 2L))))
            .thenReturn(asSet(11L, 22L));

        // 调用
        Set<Long> userIds = strategy.calculateUsersByTask(null, param);
        // 断言
        assertEquals(asSet(11L, 22L), userIds);
    }
}
```

四个注解撑起全部结构：

| 注解 | 作用 | 注意 |
|---|---|---|
| `@Mock` | 造一个空壳替身，方法默认返回 `null` / `0` / 空集合 | 不用手动 `mock(Xxx.class)` |
| `@InjectMocks` | 把上面所有 `@Mock` **注入**到被测对象 | 优先构造器注入，其次 setter，最后字段反射 |
| `@Captor` | 声明 `ArgumentCaptor`（见第四节） | 比在方法里 new 更简洁 |
| `@Spy` | 包装真实对象 | 慎用，理由见第六节 |

它们要靠一个扩展才能生效：

```java
@ExtendWith(MockitoExtension.class)   // 忘了这行，@Mock 全是 null
public class BaseMockitoUnitTest { }
```

> yudao 把这一行提成了基类 `BaseMockitoUnitTest`——整个工程 42 个纯 Mock 单测都继承它。**把「测试基础设施」做成基类和 starter，而不是每个类重复注解**，这是[框架设计](/java/spring/spring-boot/starter)的思路用在测试上的样子。

## 三、桩（stub）的三种写法与一个坑 {#stubbing}

```java
// 1. 返回固定值
when(userMapper.selectById(1L)).thenReturn(user);

// 2. 抛异常
when(payClient.charge(any())).thenThrow(new PayException("余额不足"));

// 3. 用入参算出返回值（最灵活）
when(orderMapper.insert(any())).thenAnswer(inv -> {
    Order o = inv.getArgument(0);
    o.setId(100L);          // 模拟数据库回填主键
    return 1;
});
```

`thenAnswer` 的典型用途就是**模拟「数据库回填 ID」这类由被调用方产生的副作用**——如果只是 `thenReturn(1)`，被测代码拿到的对象永远没有 ID，后续逻辑就测不到。

### 坑：`when(spy.xxx())` 会真的调用一次真实方法

```java
// 危险：spy.method() 立刻被真实执行了一遍
when(spy.computeHeavy()).thenReturn(1);

// 安全：doReturn 家族不触发真实调用
doReturn(1).when(spy).computeHeavy();
```

同理，**`void` 方法没法写 `when(...)`**（语法上就是错的），必须用 `doThrow` / `doNothing`：

```java
doThrow(new RuntimeException("发信失败")).when(emailService).send(any());
doNothing().when(logService).record(any());
```

这条规则可以简化成一句：**`when` 用于普通方法的桩，`doXxx` 用于 `void` 方法和 spy。**

## 四、验证：`verify` 家族与参数捕获 {#verifying}

```java
verify(emailService).send(any());                          // 恰好一次
verify(emailService, times(2)).send(any());                // 恰好两次
verify(emailService, never()).send(any());                 // 从未调用
verify(emailService, atLeastOnce()).send(any());           // 至少一次
verifyNoInteractions(eventPublisher);                      // 完全没碰过
verifyNoMoreInteractions(emailService);                    // 除了验证过的，没别的调用
```

### 4.1 `verifyNoMoreInteractions` 是把双刃剑

它能抓住「意外多调了一次」，但**任何新增的无关调用都会让它变红**——这让它变成「实现细节的看门狗」。适度使用，别当默认动作。

### 4.2 验证顺序：`InOrder`

```java
InOrder inOrder = inOrder(lock, mapper);
inOrder.verify(lock).acquire();      // 必须先拿锁
inOrder.verify(mapper).update(any()); // 再改数据
```

顺序敏感的流程（加锁→改数据、先写库→再发消息）值得用 `InOrder` 钉住——**这类顺序错了就是线上事故，而普通断言看不出来**。

### 4.3 捕获参数做深度断言：`ArgumentCaptor`

当你需要检查「传出去的对象的内部字段」，而不是只检查「调用发生了」：

```java
@Captor
ArgumentCaptor<Order> orderCaptor;

@Test
void 下单时应该冻结库存而不是扣减() {
    orderService.create(request);

    verify(stockApi).freeze(orderCaptor.capture(), eq(2));
    Order sent = orderCaptor.getValue();
    assertThat(sent.getStatus()).isEqualTo(OrderStatus.FROZEN);  // ← 关键断言
    assertThat(sent.getFrozenAt()).isNotNull();
}
```

没有 Captor 时，很多人会退化成 `any()`——**`any()` 是最弱的一种断言**，它只能证明「方法被调过」，不能证明「传对了」。

## 五、严格桩：让没用上的 stub 变成失败 {#strictness}

Mockito 5.x 默认走 `STRICT_STUBS`（严格桩）策略，它会：

- 报 `UnnecessaryStubbingException`——**声明了却没用上的桩**
- 报 `PotentialStubbingProblem`——**入参不匹配的桩**（比如桩了 `eq(1L)` 却传了 `2L`）

这两个报错一开始很烦，但它挡住的是**测试腐化**：

```java
@Test
void 测试A() {
    when(userApi.get(1L)).thenReturn(u);   // 复制粘贴来的残留
    when(orderApi.get(2L)).thenReturn(o);
    // 实际只用了 orderApi
}
```

`UnnecessaryStubbingException` 会指出第一行是多余的——**它意味着这段测试在悄悄偏离被验证的行为**，很可能被测方法已经改了而测试没人管。

真需要放宽时（比如共享的 `@BeforeEach` 里有公共桩），用：

```java
@MockitoSettings(strictness = Strictness.LENIENT)   // 类级
@Mock(strictness = Strictness.LENIENT)              // 单个字段级
```

但**默认不要动它**，先搞清楚为什么报错。

## 六、Mock 的边界：什么时候 Mock 是自欺欺人 {#boundary}

这一节是本篇的重点，也是面试里最容易拉开差距的地方。

### 6.1 不要 Mock 你不拥有的类型

对第三方库 / 外部服务（`RestTemplate`、`OkHttpClient`、`HttpClient`）做 Mock，等于**用你的假设去替换真实协议**：你把 `Response` 构造成你想象中的样子，然后断言你的代码能处理它。

正确做法是**把外部调用包一层适配器**，Mock 你自己的接口：

```java
// 差：Mock 第三方客户端 —— 假设了它的行为
when(okHttpClient.newCall(any())).thenReturn(mockCall);

// 好：Mock 自己的端口接口，真实交互交给集成测试
when(weatherPort.getByCity("深圳")).thenReturn(new Weather(28, "晴"));
```

顺带的好处：这个接口就是**防腐层**，第三方换 SDK 时只改一个实现类。

### 6.2 不要 Mock 值对象和 DTO

数据类就用真实对象构造：

```java
// 差：Mock 一个 POJO，字段全是 null，测试毫无意义
User user = mock(User.class);
when(user.getName()).thenReturn("张三");

// 好：直接构造
User user = new User(1L, "张三");
```

Mock POJO 甚至会让某些框架（序列化、`equals`）表现异常——因为它不是你数据的真实形态。

### 6.3 不要把「被测对象自己」的方法 Mock 掉

```java
@Spy
@InjectMocks
OrderService orderService;

@Test
void 测试() {
    // 灾难：把要验证的核心逻辑 stub 掉了，剩下的代码在没有真实逻辑的情况下跑
    doReturn(new Order()).when(orderService).calculate(any());
    orderService.create(request);   // 这个测试还能测到什么？
}
```

判据和上一篇一样：**如果被测方法内部的关键步骤都被替换掉了，你测的其实是「这些步骤之间的胶水」**——而胶水通常不是出错的地方。

### 6.4 Mock 数量是最灵敏的设计警报

一个测试类里出现 5 个以上 `@Mock`，通常说明被测类**职责太多**（顺带违反[单一职责](/java/design-patterns/)）。

这时候有两个选择，都比硬撑更好：

1. **拆类**——把被测类按职责拆开，每个测试只需 2~3 个替身
2. **换 Fake / 集成测试**——如果这些依赖都是同一层的（比如 5 个 Mapper），干脆用 H2 起真库，一次跑完

### 6.5 一条实用的决策线

```text
这个依赖有没有「值得验证的真实行为」（SQL、序列化、协议、事务）？
  ├─ 有 → 用 Fake 或集成测试（别 Mock）
  └─ 没有
       ├─ 它是外部系统（网络/第三方）？ → 包一层适配器再 Mock 适配器
       ├─ 它是值对象/DTO？             → 不 Mock，直接构造
       └─ 它是内部协作者（Service/Mapper）
            ├─ 只是喂数据 → Stub（when）
            └─ 副作用就是要验证的东西 → Mock + verify
```

## 七、inline mock maker 与 Java Agent 配置 {#agent}

这是当前最容易被忽略、但一定会遇到的一类问题。

### 7.1 `mockito-inline` 已经不存在了

Mockito 5.0 起，**inline mock maker 成为默认**，所以「引入 `mockito-inline` 来支持 mock final 类和静态方法」这个老做法**已经过时**：

| 版本 | 状况 |
|---|---|
| Mockito 4.x 及更早 | 默认用 subclass mock maker；mock `final` / `static` 要额外引 `mockito-inline` |
| **Mockito 5.0 起** | **inline 成为默认**，final 类、final 方法、静态方法开箱可用 |
| **Mockito 5.3.0 起** | **`mockito-inline` 停止发布**——继续引它只会带来版本混乱 |

> 顺带一条实战观察：不少项目（包括我在读的一些成熟开源工程）pom 里还留着 `mockito-inline` 依赖，那是 Mockito 4 时代的遗留，**应当清理**。反过来，如果你真的要 subclass mock maker（GraalVM native image 下 inline 不工作），用的是新的 **`mockito-subclass`**。

### 7.2 JDK 21+ 的告警与解法

跑测试时会看到这句：

```text
Mockito is currently self-attaching to enable the inline-mock-maker.
This will no longer work in future releases of the JDK.
```

原因：inline mock maker 靠**运行时动态加载 Java Agent** 改字节码。JDK 出于安全考虑正在收紧动态 agent 加载（`-XX:+EnableDynamicAgentLoading` 之类的开关就是这轮收紧的产物），所以 Mockito 先给出预告。

解法是**把 Mockito 作为显式 agent 挂上去**，Maven Surefire 里加一段即可：

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-surefire-plugin</artifactId>
    <configuration>
        <argLine>-javaagent:${settings.localRepository}/org/mockito/mockito-core/${mockito.version}/mockito-core-${mockito.version}.jar</argLine>
    </configuration>
</plugin>
```

**这件事值得现在就做**，因为它是「未来某个 JDK 升级会突然炸掉测试」的典型——现在配好，就是省掉一次深夜排查。

### 7.3 静态与构造方法：用 try-with-resources 收口

Mockito 5 原生支持 `mockStatic` / `mockConstruction`（**不再需要 PowerMock**），但它们必须在作用域结束时显式关闭：

```java
try (MockedStatic<IdUtils> mocked = mockStatic(IdUtils.class)) {
    mocked.when(IdUtils::uuid).thenReturn("fixed-uuid");
    // 测试逻辑
}
// 出作用域自动 close，否则该类的 mock 会泄漏到后面的测试
```

**忘了关 = 影响同一线程里后续所有测试**——这是比「测试失败」更难查的一类污染。

### 7.4 PowerMock 的历史定位

PowerMock 解决的问题（mock 静态/私有/final/构造）已经在 Mockito 5 原生能力内，而且 PowerMock 对 JUnit 5 与新版 JDK 的支持一直滞后。**新项目没有理由再用它**，老项目应逐步替换。

## 八、常见坑 {#pitfalls}

1. **忘了 `@ExtendWith(MockitoExtension.class)`**：`@Mock` 全是 `null`，报 NPE 而看不出原因。
2. **`when(spy.xxx())` 触发真实调用**：改 `doReturn(...).when(spy).xxx()`。
3. **给 `void` 方法写 `when`**：语法不通，必须用 `doThrow` / `doNothing`。
4. **`any()` 满天飞**：`any()` 是最弱断言，参数传错了测试还是绿的。该用 `eq(...)` 与 `ArgumentCaptor` 时就别偷懒。
5. **`thenReturn` 与 `thenAnswer` 混用错误**：需要被调用方产生副作用（回填 ID、改状态）时必须用 `thenAnswer`。
6. **`mockStatic` 忘了关闭**：污染后续测试，且报错位置跟根因隔得很远。
7. **Mock 第三方 SDK**：把「你假设它怎么工作」当成「它真的这么工作」，一旦升级就全线飘红。
8. **Mock POJO**：字段全 `null`，测试形同虚设。
9. **Mock 掉被测对象自己的核心方法**：测的是胶水，不是逻辑。
10. **`@Mock` 超过 5 个还硬撑**：这是设计警报，考虑拆类或改 Fake。
11. **`verify` 泛滥**：每个方法都 verify 一遍，把测试变成实现细节的看门狗，重构即红。
12. **`UnnecessaryStubbingException` 一律 `LENIENT` 压掉**：它通常意味着测试已经与被测代码脱节，压掉只是把问题藏起来。

## 九、面试口径 {#interview}

1. **Mock 和 Stub 什么区别？** Stub 是「输入」——给被测方法提供预设返回值；Mock 是「输出」——验证被测方法有没有按预期调用协作者。大多数测试只需要 Stub，只有副作用本身就是验证目标时才需要 Mock。
2. **哪些东西不该 Mock？** 三类：不属于你的类型（第三方 SDK，应包适配器后 Mock 自己的接口）、值对象与 DTO（直接构造）、被测对象自己的核心方法（Mock 掉等于把要测的逻辑删了）。
3. **`@Mock` 和 `@Spy` 的区别？** Mock 是空壳，所有方法默认返回默认值；Spy 包装真实对象，默认走真实实现，只对你 stub 的方法生效。Spy 更危险（`when` 会触发真实调用，要用 `doReturn`），也更容易掩盖设计问题。
4. **Mock 太多说明什么？** 说明被测类职责过多、耦合过重。**Mock 数量是最灵敏的设计味道指示器**——超过 5 个通常该拆类，或者这些依赖同层时改用集成测试。
5. **`when(...).thenReturn(...)` 和 `doReturn(...).when(...)` 什么时候分别用？** 前者是常规写法；后者用于 `void` 方法（`when` 写不出来）和 spy（避免真实调用被触发）。
6. **`thenReturn` 和 `thenAnswer` 的区别？** `thenReturn` 返回固定值；`thenAnswer` 能用入参计算返回值，也能修改传入对象——**模拟「数据库回填主键」这类副作用只能靠它**。
7. **严格桩（STRICT_STUBS）为什么要报错？** 它能发现「声明了没用上的桩」，这通常意味着测试已经偏离被测代码的真实行为。默认不要关掉，先查原因。
8. **怎么 mock 静态方法？** Mockito 5 原生支持 `mockStatic`，但**必须用 try-with-resources 包住**，否则该类的 mock 会泄漏到后续测试。不需要 PowerMock——它解决的场景已被 Mockito 原生覆盖。
9. **`mockito-inline` 还要不要引？** 不要。Mockito 5.0 起 inline 就是默认，且 `mockito-inline` 从 5.3.0 起停止发布，继续引只会引入版本冲突。要 subclass mock maker 才用 `mockito-subclass`。
10. **JDK 21 上跑 Mockito 有告警，怎么处理？** 那是 inline mock maker 的自附加 agent 机制将被 JDK 收紧的预告。解法是在 Surefire 里用 `-javaagent` 显式挂载 mockito-core，避免未来 JDK 升级后测试直接失败。

> 下一篇讲**怎么控制 Spring 容器的启动范围**：[Spring Boot 测试与上下文](/java/testing/spring-boot-test)。
