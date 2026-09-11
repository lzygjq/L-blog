---
date: 2026-09-11
---

# 设计原则与 UML

设计模式解决的是"怎么写"，设计原则回答的是"**为什么这么写**"。六大原则是判断一个设计好坏、也是面试里追问"为什么用这个模式"时的标准答案来源。

## 一、UML 类图：描述结构的最小语言

看模式先看结构，看结构先认类图。日常够用的只有六个符号：

### 1.1 类的表示

```
┌─────────────────────┐
│      ClassName      │  ← 类名
├─────────────────────┤
│ - privateField      │  ← 属性（- 私有 / + 公开 / # 保护）
├─────────────────────┤
│ + publicMethod()    │  ← 方法
└─────────────────────┘
```

### 1.2 六种类间关系（按耦合从弱到强）

| 关系 | 符号 | 语义 | 代码体现 |
|---|---|---|---|
| 依赖 | `- - ->` | 临时使用 | 方法参数、局部变量、静态调用 |
| 关联 | `────>` | 长期持有 | 成员属性 |
| 聚合 | `◇────>` | 整体-部分，生命周期可独立 | 成员属性（可动态替换） |
| 组合 | `◆────>` | 整体-部分，同生共死 | 构造器内 `new` 出成员 |
| 继承 | `───▷`（实线空心三角） | is-a | `extends` |
| 实现 | `- - ▷`（虚线空心三角） | can-do | `implements` |

> 记忆要点：**依赖是"用过"，关联是"有"，聚合是"可换的部件"，组合是"拆不开的部件"**。合成复用原则鼓励的是聚合/组合，排斥的是继承。

## 二、六大设计原则

### 2.1 开闭原则（Open-Closed Principle, OCP）

**定义**：软件实体应当对扩展开放，对修改关闭——新增功能靠加代码，而不是改老代码。

**反例**（每加一种支付方式，都要改这里）：

```java
public class PayService {
    public void pay(String type, BigDecimal amount) {
        if ("alipay".equals(type)) {
            // 支付宝逻辑
        } else if ("wechat".equals(type)) {
            // 微信逻辑
        }
        // 新增银联 → 又要动这个方法
    }
}
```

**重构**：抽出接口，让新增变成"加一个实现类"：

```java
public interface PayChannel {
    boolean support(String type);
    void pay(BigDecimal amount);
}

public class PayService {
    private final List<PayChannel> channels;   // 由 Spring 注入全部实现

    public void pay(String type, BigDecimal amount) {
        channels.stream()
                .filter(c -> c.support(type))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("不支持的支付方式: " + type))
                .pay(amount);
    }
}
```

**判定要点**：需求变化时，改的是"新增文件"还是"已有分支"。改分支 = 违反 OCP。

### 2.2 里氏代换原则（Liskov Substitution Principle, LSP）

**定义**：子类对象应当能在任何父类出现的地方替换父类，且不破坏程序正确性——**父类能做的，子类必须都能做到**。

**典型反例**：正方形继承长方形。`setWidth` 之后 `setHeight` 会被联动修改，导致依赖"宽高独立变化"的调用方逻辑出错。

```java
class Rectangle {
    void setWidth(int w) {}
    void setHeight(int h) {}
}
class Square extends Rectangle {          // 违反 LSP
    @Override void setWidth(int w) { super.setWidth(w); super.setHeight(w); }
    @Override void setHeight(int h) { super.setWidth(h); super.setHeight(h); }
}

// 调用方按长方形语义写的断言会失败
void resize(Rectangle r) {
    r.setWidth(5);
    r.setHeight(4);
    assert r.getWidth() * r.getHeight() == 20;   // 传入 Square 时结果变成 16
}
```

**判定要点**：子类是否**收窄了入参校验、强化了前置条件、削弱了后置结果**。若是，就不能替换，别硬继承。

### 2.3 依赖倒转原则（Dependency Inversion Principle, DIP）

**定义**：高层模块不依赖低层模块，二者都依赖抽象；抽象不依赖细节，细节依赖抽象。

**反例**：业务层直接 `new` 具体实现。

```java
public class OrderService {
    private final MySQLOrderRepository repo = new MySQLOrderRepository();  // 硬编码
}
```

**重构**：面向接口编程 + 构造器注入（这正是 Spring IoC 的理论依据）：

```java
public class OrderService {
    private final OrderRepository repo;                 // 依赖抽象

    public OrderService(OrderRepository repo) {         // 具体的实现由外部决定
        this.repo = repo;
    }
}
```

**判定要点**：变量声明类型是接口还是具体类；`new` 关键字是否出现在业务逻辑里。

### 2.4 接口隔离原则（Interface Segregation Principle, ISP）

**定义**：客户端不该被迫依赖它用不到的方法——接口要拆到"够小、够专"。

**反例**：一个"全能接口"逼所有实现者写空方法或抛异常。

```java
interface Device {
    void print();
    void scan();
    void fax();     // 只有部分设备支持
}
```

**重构**：按能力拆分，实现类只实现自己具备的能力：

```java
interface Printable { void print(); }
interface Scannable { void scan(); }
interface Faxable   { void fax(); }

class SimplePrinter implements Printable { public void print() { } }
```

**判定要点**：实现类里有没有 `throw new UnsupportedOperationException()` 或空实现——那是接口切分不到位的信号。

### 2.5 迪米特法则（Law of Demeter, LoD）

**定义**：只与直接朋友通信，不跟"朋友的朋友"说话。朋友 = 当前对象的成员、方法入参、方法内创建的对象。

**反例**（链式穿透，耦合到了第三层对象的结构）：

```java
order.getCustomer().getAddress().getCity();   // 一旦 Address 结构变了，这里就崩
```

**重构**：把"取城市"这件事封装给直接朋友：

```java
public class Order {
    public String getCustomerCity() {
        return customer.cityOf();      // 细节收敛在 Customer 内部
    }
}
```

**判定要点**：方法里出现连续两个以上的 `.getX().getY()`，就是在穿墙。**注意**：流式 API（Builder、Stream）不算违反，因为每一步返回的还是同一个逻辑实体。

### 2.6 合成复用原则（Composite Reuse Principle, CARP）

**定义**：优先用组合/聚合复用，其次才考虑继承。

**对比**：

| 维度 | 继承复用 | 合成复用 |
|---|---|---|
| 耦合度 | 高，父类改动直接影响子类 | 低，只依赖接口 |
| 灵活性 | 编译期确定，不能运行时替换 | 运行时可替换实现 |
| 封装性 | 父类实现细节对子类暴露 | 细节被封装在对端内部 |
| 风险 | 易形成"继承爆炸" | 组合数量可控 |

**结论**：继承表达 **is-a**（必须是同一种东西），组合表达 **has-a / uses-a**（拥有或使用）。只有语义上真的"是一个"时才继承。

## 三、六大原则速查表

| 原则 | 一句话记忆 | 违反信号 |
|---|---|---|
| 开闭 OCP | 扩展靠加文件，不靠改分支 | 频繁修改同一个 `if-else` |
| 里氏代换 LSP | 子类必须能顶替父类 | 子类抛异常/空实现 |
| 依赖倒转 DIP | 依赖抽象不依赖实现 | 业务代码里 `new` 具体类 |
| 接口隔离 ISP | 接口要小、要专 | 实现类有大量空方法 |
| 迪米特 LoD | 只跟直接朋友说话 | `.getA().getB().getC()` |
| 合成复用 CARP | 组合优于继承 | 为了复用代码而继承 |

## 四、面试问答

**Q：设计原则和设计模式是什么关系？**
原则是"目标"，模式是"前人总结出的达成路径"。同一个问题可以有不同的模式方案，选择依据就是原则之间的权衡——比如引入模式提升了扩展性（OCP），代价可能是类数量变多、可读性下降。**模式不是越多越好。**

**Q：为什么说"多用组合少用继承"？**
继承是编译期绑定、强耦合（父类改动波及全部子类），而组合是运行期绑定、可替换。但继承并非不能用：当子类在语义上确实是父类的一种、且不需要替换行为时，继承最简洁。判断标准是**语义（is-a）而非复用便利**。

**Q：Spring 里哪个机制最能体现依赖倒转？**
IoC 容器。业务类通过构造器声明依赖的**接口**，具体实现由容器在运行时注入；`@Autowired` 注入的其实是代理对象，替换实现不需要改业务代码。这也是"面向接口编程"在框架层面的落地。
