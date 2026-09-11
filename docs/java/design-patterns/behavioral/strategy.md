---
date: 2026-09-11
---

# 策略模式（Strategy）

## 一、问题场景

业务代码里最常见的坏味道是**条件分支堆积**：

```java
public BigDecimal calculate(Member member, BigDecimal amount) {
    if (member.getLevel() == NORMAL) {
        return amount;
    } else if (member.getLevel() == SILVER) {
        return amount.multiply(new BigDecimal("0.95"));
    } else if (member.getLevel() == GOLD) {
        return amount.multiply(new BigDecimal("0.90"));
    } else if (member.getLevel() == DIAMOND) {
        return amount.multiply(new BigDecimal("0.85"));
    }
    throw new IllegalArgumentException("未知等级");
}
```

这段代码的问题不在于"用了 if"，而在于**每一个分支都是一个独立的变化点**——新增一个会员等级，就要回到这个方法里改动。它违反复合开闭原则（对扩展开放），而且随着业务复杂化会膨胀成几百行的"上帝方法"。

策略模式的解法：**把每个分支的算法抽成一个独立的类，让调用方持有一个抽象策略，运行时替换。**

## 二、结构与角色

```
┌──────────────┐        ┌────────────────────┐
│   Context    │───────▶│   «interface»      │
│ - strategy   │ 持有   │     Strategy       │
│ + execute()  │        │ + algorithm()      │
└──────────────┘        └─────────┬──────────┘
                                  │ 实现
                   ┌──────────────┼──────────────┐
          ┌────────┴───────┐ ┌────┴──────┐ ┌─────┴────────┐
          │StrategyA       │ │StrategyB  │ │StrategyC     │
          │+ algorithm()   │ │...        │ │...           │
          └────────────────┘ └───────────┘ └──────────────┘
```

| 角色 | 职责 |
|---|---|
| **Strategy（抽象策略）** | 定义所有策略共有的算法接口 |
| **ConcreteStrategy（具体策略）** | 实现具体算法，彼此之间独立 |
| **Context（上下文）** | 持有策略引用，把请求委托给策略；自身不关心算法细节 |

关键约束：**策略之间互不认识，也不允许互相调用**。任何"策略 A 需要调用策略 B"的需求，都说明应该换用状态模式或责任链。

## 三、代码实现

### 3.1 基础写法

```java
public interface DiscountStrategy {
    BigDecimal apply(BigDecimal amount);
    MemberLevel supportLevel();        // 用于注册/选择
}

@Component
public class NormalStrategy implements DiscountStrategy {
    public BigDecimal apply(BigDecimal amount) { return amount; }
    public MemberLevel supportLevel() { return MemberLevel.NORMAL; }
}

@Component
public class GoldStrategy implements DiscountStrategy {
    public BigDecimal apply(BigDecimal amount) {
        return amount.multiply(new BigDecimal("0.90")).setScale(2, RoundingMode.HALF_UP);
    }
    public MemberLevel supportLevel() { return MemberLevel.GOLD; }
}
```

### 3.2 两种"消除 if-else"的落地方式

**方式一：Map 注册（纯 Java，适合算法少、无外部依赖）**

```java
public class DiscountStrategyFactory {
    private static final Map<MemberLevel, DiscountStrategy> REGISTRY = new EnumMap<>(MemberLevel.class);

    public static void register(MemberLevel level, DiscountStrategy strategy) {
        REGISTRY.put(level, strategy);
    }

    public static DiscountStrategy of(MemberLevel level) {
        DiscountStrategy s = REGISTRY.get(level);
        if (s == null) throw new IllegalArgumentException("未知会员等级: " + level);
        return s;
    }
}
```

**方式二：Spring 自动注入（推荐，零手工注册）**

```java
@Component
public class DiscountContext {
    private final Map<MemberLevel, DiscountStrategy> registry = new EnumMap<>(MemberLevel.class);

    // Spring 会把容器里所有 DiscountStrategy 实现注入进 List
    public DiscountContext(List<DiscountStrategy> strategies) {
        strategies.forEach(s -> registry.put(s.supportLevel(), s));
    }

    public BigDecimal calculate(MemberLevel level, BigDecimal amount) {
        return registry.get(level).apply(amount);
    }
}
```

**方式二的价值在于"新增策略零改动"**：新增一个会员等级，只需新建一个 `@Component` 类实现 `DiscountStrategy`，容器自动装配，原有代码一行不用动——这才是真正的开闭原则。

### 3.3 JDK 8 之后的函数式替代

如果策略只是一个无状态的纯函数，直接用 `Function` 或 `UnaryOperator`，不必为它建类：

```java
private static final Map<MemberLevel, UnaryOperator<BigDecimal>> DISCOUNT = Map.of(
    MemberLevel.NORMAL, a -> a,
    MemberLevel.GOLD,   a -> a.multiply(new BigDecimal("0.90"))
);
```

**判断标准**：策略有状态、有依赖注入、有多个方法 → 建类；只是"一个入参一个出参"的纯计算 → 用 Lambda。

## 四、对比辨析

### 4.1 策略 vs 状态——结构相同、意图相反

这是最容易混淆的一对，因为**类图完全一样**：

| 维度 | 策略 | 状态 |
|---|---|---|
| 谁是切换的发起者 | **客户端**（显式选择并注入） | **状态自身**（内部触发转移） |
| 调用方是否知道具体实现 | 知道，且主动挑一个 | 通常不知道，流转是封闭的 |
| 策略/状态之间是否互相感知 | 互不感知 | 存在明确的转移关系（A 能转 B） |
| 是否保存"当前是谁" | 不需要 | 需要一个当前状态引用 |
| 典型场景 | 支付渠道、计费规则、压缩算法 | 订单状态机、审批流、TCP 连接状态 |

一句话记忆：**策略是"我挑一个用"，状态是"走着走着就变了"。**

### 4.2 策略 vs 简单工厂

两者常配合出现，但职责不同：

- **简单工厂**解决"**怎么创建**对象"（创建型问题）；
- **策略**解决"**怎么选择并使用**算法"（行为型问题）。

上面的 `DiscountContext` 同时承担了两者：内部用 Map 做对象查找（工厂味），对外提供算法执行入口（策略味）。这在实践中很常见，不必教条地区分。

### 4.3 策略 vs 模板方法

| 维度 | 策略 | 模板方法 |
|---|---|---|
| 复用手段 | 组合 | 继承 |
| 变化粒度 | 整个算法 | 算法中的部分步骤 |
| 运行时替换 | 支持 | 不支持（编译期确定） |

## 五、使用场景与面试问答

### JDK 与框架中的实例

| 位置 | 策略接口 | 具体策略 |
|---|---|---|
| `Collections.sort(list, comparator)` | `Comparator` | 任意比较器，运行时可换 |
| `ThreadPoolExecutor` | `RejectedExecutionHandler` | 拒绝策略（Abort/ CallerRuns / Discard / DiscardOldest） |
| Spring `ResourceLoader` | 按 `Resource` 前缀选策略（`classpath:` / `file:` / `http:`） |
| Spring `PlatformTransactionManager` | 事务管理策略（JDBC / JTA / JPA） | 业务代码无感 |
| Spring MVC `HandlerMapping` | 按 URL 匹配处理器 | 多种映射策略 |
| `javax.servlet.http.HttpServlet` | 无（用模板方法） | — |

`ThreadPoolExecutor` 的四种拒绝策略是最直观的例子：线程池满了之后怎么办，是一个纯策略选择，JDK 把 `AbortPolicy`（默认抛异常）、`CallerRunsPolicy`（调用线程执行）、`DiscardPolicy`（静默丢弃）、`DiscardOldestPolicy`（丢最老的）都做成了独立的类。

### 面试问答

**Q1：策略模式怎么消除 if-else？**

三步：① 把每个分支抽成一个实现类；② 让每个策略声明自己"负责哪个 key"（如 `supportLevel()`）；③ 用一个 Map 建立 key → 策略的映射，Spring 场景下直接注入 `List<Strategy>` 自动注册。调用方从"判断 + 执行"退化为"查表 + 委托"。

**Q2：那 if-else 真的一律要用策略替换吗？**

不是。**分支少（≤3）且稳定、逻辑只有一两行、不需要复用**时，if-else 更直观，引入策略反而增加跳转成本和文件数量。策略的收益来自"**分支会持续增加**"或"**每个分支逻辑复杂**"。为消灭 if-else 而制造 10 个只有一个方法的类，是过度设计。

**Q3：策略模式和工厂模式如何配合？**

工厂负责"按条件创建/取出策略"，策略负责"执行算法"，上下文（Context）负责对外暴露统一入口。Spring 中借助 `List<Strategy>` 注入 + Map 注册，两者可以合并到同一个 Context 类中，不需要额外的工厂类。

**Q4：策略模式如何做动态切换（如运行时改配置）？**

策略对象本身无状态，切换就是把 Context 里持有的引用换成另一个。常见做法：① 每次调用时按 key 查表（无状态、天然支持动态）；② 结合配置中心的监听回调刷新 Context 持有的策略实例（适用于策略自身带配置参数的场景，如限流阈值）。

**Q5：策略与"多态"有什么区别？**

**策略模式是多态的自觉应用**。多态是语言机制（父类引用指向子类对象），策略模式是在这个机制之上，把"算法替换"识别为一类独立职责并加以封装的设计决策。所有策略都是多态，但不是所有多态都叫策略模式。
