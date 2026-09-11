---
order: 4
date: 2026-09-11
---

# 建造者模式（Builder）

## 一、问题场景

当一个对象的**构造参数很多，且大部分是可选的**，常规的两种写法都有硬伤。

**写法一：重叠构造器**（参数一多就不可读）

```java
public Order(String no) { ... }
public Order(String no, String userId) { ... }
public Order(String no, String userId, BigDecimal amount) { ... }
public Order(String no, String userId, BigDecimal amount, String remark) { ... }
public Order(String no, String userId, BigDecimal amount, String remark, String channel) { ... }

// 调用方：这五个参数分别是什么？只能靠数位置
new Order("SO2026001", "u1001", new BigDecimal("99.00"), "", "wechat");
```

**写法二：JavaBean setter**（可读性好了，但对象状态不安全）

```java
Order o = new Order();
o.setNo("SO2026001");
o.setAmount(...);
// 中间这段对象处于"半成品"状态，若被其他线程读到就是脏数据；
// 而且无法做"整体校验"——只能在最终使用时才发现漏字段
```

建造者模式解决的就是这个：**把"分步组装"与"最终校验"分开，产出不可变对象**。

## 二、结构与角色

```
┌──────────────┐         ┌────────────────────┐
│  Director    │────────▶│  <<abstract>>      │
│ + construct()│         │      Builder       │
└──────────────┘         │ + buildPart()      │
                         │ + getResult()      │
                         └─────────┬──────────┘
                                   │ implements
                         ┌─────────┴──────────┐
                         │  ConcreteBuilder   │
                         │ + buildPart()      │
                         │ + getResult()      │
                         └─────────┬──────────┘
                                   │ 产出
                              ┌────┴────┐
                              │ Product │
                              └─────────┘
```

| 角色 | 职责 |
|---|---|
| 产品 Product | 被构建的复杂对象 |
| 抽象建造者 Builder | 定义组装各部件的方法 + 返回成品的方法 |
| 具体建造者 ConcreteBuilder | 实现组装细节，**持有产品实例** |
| 指挥者 Director | 决定**组装顺序**，屏蔽组装过程 |

**要点**：把"组装步骤的顺序"（Director）与"每个步骤怎么实现"（Builder）分离——换一个具体建造者就能产出不同形态的成品，而调用流程不变。

## 三、实现

### 3.1 经典写法（含 Director）

```java
public class Order {                         // 产品
    private final String no;
    private final String userId;
    private final BigDecimal amount;
    private final String channel;
    private final String remark;

    Order(String no, String userId, BigDecimal amount, String channel, String remark) {
        this.no = no; this.userId = userId; this.amount = amount;
        this.channel = channel; this.remark = remark;
    }
    // 只有 getter，无 setter —— 不可变对象
}

public abstract class OrderBuilder {         // 抽象建造者
    protected Order order;
    public abstract void buildNo(String no);
    public abstract void buildUser(String userId);
    public abstract Order getResult();
}

public class WechatOrderBuilder extends OrderBuilder {
    private String no, userId; private BigDecimal amount;

    public void buildNo(String no) { this.no = no; }
    public void buildUser(String userId) { this.userId = userId; }
    public void buildAmount(BigDecimal amount) { this.amount = amount; }
    public Order getResult() { return new Order(no, userId, amount, "wechat", null); }
}

public class OrderDirector {                 // 指挥者：固定组装顺序
    private final OrderBuilder builder;
    public OrderDirector(OrderBuilder builder) { this.builder = builder; }

    public Order construct(String no, String userId, BigDecimal amount) {
        builder.buildNo(no);
        builder.buildUser(userId);
        ((WechatOrderBuilder) builder).buildAmount(amount);
        return builder.getResult();
    }
}
```

### 3.2 现代工程写法（链式调用，省略 Director）

实际项目里几乎不写 Director——**Builder 自己负责流程，用链式调用表达组装顺序**：

```java
public class Order {
    private final String no;
    private final String userId;
    private final BigDecimal amount;
    private final String channel;
    private final String remark;

    private Order(Builder b) {
        this.no = b.no; this.userId = b.userId; this.amount = b.amount;
        this.channel = b.channel; this.remark = b.remark;
    }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private String no, userId, channel, remark;
        private BigDecimal amount;

        public Builder no(String no)          { this.no = no; return this; }
        public Builder userId(String id)      { this.userId = id; return this; }
        public Builder amount(BigDecimal a)   { this.amount = a; return this; }
        public Builder channel(String c)      { this.channel = c; return this; }
        public Builder remark(String r)       { this.remark = r; return this; }

        public Order build() {
            // 整体校验集中在这里，缺一不可
            if (no == null || userId == null) throw new IllegalStateException("订单号与用户不能为空");
            if (amount == null || amount.signum() <= 0) throw new IllegalArgumentException("金额必须大于 0");
            return new Order(this);
        }
    }
}

// 调用：可读、安全、字段可选
Order order = Order.builder()
        .no("SO2026001")
        .userId("u1001")
        .amount(new BigDecimal("99.00"))
        .channel("wechat")
        .build();
```

三个设计要点：① `Order` 构造器**私有**，只能由 Builder 产出，杜绝半成品；② 所有字段 `final`，**对象不可变**，天然线程安全；③ **校验集中在 `build()`**，一次性失败而不是分散在各处。

> `Lombok` 的 `@Builder` 生成的就是 3.2 这套结构；配合 `@Value` 或 `@Getter + @AllArgsConstructor(access = PRIVATE)` 使用。

### 3.3 变体：Director 与链式并存

需要在多处复用**同一套固定组装顺序**时，可以保留 Director，把"顺序"固化下来：

```java
public class PresetOrders {
    public static Order wechatSmall(String userId) {
        return Order.builder()
                .no(generateNo()).userId(userId)
                .amount(new BigDecimal("1.00")).channel("wechat")
                .build();                    // 预置模板，避免调用方重复写流程
    }
}
```

## 四、与工厂模式的边界

| 维度 | 工厂（含抽象工厂） | 建造者 |
|---|---|---|
| 关注点 | **造什么**——按条件选类型 | **怎么造**——按步骤组装 |
| 产出时机 | 一步返回成品 | 多步组装后 `build()` 返回 |
| 参数特征 | 参数少，类型选择是变化点 | 参数多，可选参数多是变化点 |
| 扩展方向 | 加产品/产品族 | 加组装步骤/换组装方式 |
| 调用体验 | `factory.create()` | `Xxx.builder()...build()` |

**组合使用**是很常见的：工厂决定"用哪个建造者"，建造者负责"如何组装"。MyBatis 就是典型——`SqlSessionFactoryBuilder.build(Configuration)` 组装出 `SqlSessionFactory`（工厂本身又是建造者的产物）。

## 五、优缺点

**优点**

1. 分离构造与表示，同样的组装流程可产出不同表示；
2. 客户端不必知道产品内部组成细节；
3. 支持**链式编写**，可读性远高于多参数构造器；
4. 便于产出**不可变对象**，并把校验集中在 `build()`。

**缺点**

1. 类的数量增加（每个产品一个 Builder）；
2. 产品内部结构变化时，建造者需要同步修改；
3. 参数很少的对象用它属于过度设计。

## 六、使用场景

| 场景 | 说明 |
|---|---|
| `StringBuilder` / `StringBuffer` | JDK 自带的建造者，`append()` 是组装步骤，`toString()` 是产出 |
| Lombok `@Builder` | 业务 DTO / 领域对象的标准做法 |
| MyBatis `SqlSessionFactoryBuilder` | 组装 `Configuration` 后产出 `SqlSessionFactory` |
| OkHttp `Request.Builder` | 链式构造 HTTP 请求 |
| Spring Security `HttpSecurity` | 链式配置过滤器链 |
| 复杂报表 / 规则对象 | 参数多、可选参数多，且需要整体校验 |

## 七、面试问答

**Q1：建造者模式和工厂模式的区别？**
**工厂管"造什么"，建造者管"怎么造"。** 工厂一步返回成品，建造者分步组装、最后 `build()` 产出；工厂的扩展点是产品类型，建造者的扩展点是组装步骤。两者常组合使用。

**Q2：为什么不用 setter 而要引入建造者？**
setter 让对象在组装期间处于**半成品状态**（可能被其他线程读到，也可能被误用），且校验只能散落在各 setter 里或推迟到使用处。建造者把对象做成**不可变**、把校验收敛到 `build()`，一次性失败、语义清晰。

**Q3：`StringBuilder` 是建造者模式吗？**
是它的 JDK 实现形态。区别在于 `StringBuilder` 没有独立的抽象建造者与指挥者，属于**简化版**——把"组装步骤"（`append`）与"产出"（`toString`）分离这一核心思想保留了。

**Q4：建造者模式的 Director 是必需的吗？**
不是。Director 的价值是**固化组装顺序**，只在"同一套顺序需要被多处复用"时才需要。现代 Java 更常用链式 Builder 让调用方自己表达顺序，省掉 Director 这一层。

**Q5：建造者能保证线程安全吗？**
建造者本身（`Builder` 实例）是**非线程安全**的——它是有状态的中间对象，不应共享。它产出的**产品对象**因为字段 `final` 且不可变，是线程安全的。这也是"用建造者产出不可变对象"的实践价值所在。
