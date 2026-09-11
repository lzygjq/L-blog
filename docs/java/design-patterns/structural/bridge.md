---
date: 2026-09-11
---

# 桥接模式（Bridge）

## 一、问题场景

当一个类**沿两个（或多个）维度同时变化**时，用继承会形成"类爆炸"：

```
消息系统要支持：消息类型 × 发送渠道
  类型：普通消息、加急消息、定时消息
  渠道：短信、邮件、站内信、APP 推送

继承方案需要 3 × 4 = 12 个类：
  SmsNormalMessage, SmsUrgentMessage, SmsScheduledMessage,
  EmailNormalMessage, EmailUrgentMessage, ...
  AppPushScheduledMessage   ← 每加一个渠道，就要再加 3 个类
```

更糟的是：**两个维度本该独立演进**（渠道要接新供应商，类型要加"群发"），继承把它们焊死在一起，任何一边变化都会波及另一边。

桥接模式的解法：**把这两个维度拆成两条独立的继承体系，在抽象层用组合连接起来。**

## 二、结构与角色

```
        抽象化维度                          实现化维度
┌──────────────────────────┐        ┌───────────────────────┐
│      Abstraction         │        │      Implementor      │
│  - impl : Implementor    │───────▶│  + operationImpl()    │
│  + operation()           │  桥接   └───────────┬───────────┘
└────────────┬─────────────┘                    │
             │ 继承                    ┌────────┴────────┐
   ┌─────────┴──────────┐      ┌───────┴──────┐ ┌────────┴─────┐
   │ RefinedAbstraction │      │ConcreteImplA │ │ConcreteImplB │
   └────────────────────┘      └──────────────┘ └──────────────┘
```

| 角色 | 职责 |
|---|---|
| Abstraction（抽象化） | 定义高层控制逻辑，**持有一个 Implementor 引用**（这就是"桥"） |
| RefinedAbstraction（修正抽象化） | 扩展抽象层，改变高层逻辑 |
| Implementor（实现化） | 定义底层实现接口 |
| ConcreteImplementor | 具体实现 |

**与"抽象类 + 实现类"的区别**：`Abstraction` 不再直接使用 `extends` 绑定实现，而是通过**聚合**持有——这正是合成复用原则的体现。注意两条体系可以**各自独立扩展**。

## 三、实现

以"消息类型 × 发送渠道"为例。

### 3.1 实现化维度（渠道）

```java
public interface MessageSender {                       // Implementor
    void send(String to, String content);
}

public class SmsSender implements MessageSender {       // ConcreteImplementor
    public void send(String to, String content) {
        System.out.println("[短信] → " + to + ": " + content);
    }
}

public class EmailSender implements MessageSender {
    public void send(String to, String content) {
        System.out.println("[邮件] → " + to + ": " + content);
    }
}

public class AppPushSender implements MessageSender {
    public void send(String to, String content) {
        System.out.println("[推送] → " + to + ": " + content);
    }
}
```

### 3.2 抽象化维度（消息类型）

```java
public abstract class Message {                        // Abstraction
    protected final MessageSender sender;              // 桥：持有一个 Implementor

    protected Message(MessageSender sender) { this.sender = sender; }

    public abstract void send(String to, String content);
}

public class NormalMessage extends Message {           // RefinedAbstraction
    public NormalMessage(MessageSender sender) { super(sender); }

    public void send(String to, String content) {
        sender.send(to, content);                      // 直接委派
    }
}

public class UrgentMessage extends Message {
    public UrgentMessage(MessageSender sender) { super(sender); }

    public void send(String to, String content) {
        sender.send(to, "【加急】" + content);          // 在抽象层追加自己的逻辑
        sender.send(to, "【加急·二次提醒】" + content);
    }
}

public class ScheduledMessage extends Message {
    private final long delayMillis;

    public ScheduledMessage(MessageSender sender, long delayMillis) {
        super(sender);
        this.delayMillis = delayMillis;
    }

    public void send(String to, String content) {
        // 定时调度逻辑之后，仍复用同一套渠道实现
        scheduler.schedule(() -> sender.send(to, content), delayMillis);
    }
}
```

### 3.3 客户端组合

```java
Message msg1 = new NormalMessage(new SmsSender());
Message msg2 = new UrgentMessage(new EmailSender());
Message msg3 = new ScheduledMessage(new AppPushSender(), 60_000);

msg2.send("u1001", "订单已超时");
```

**类数量对比**：

| 方案 | 类数量 | 新增一个渠道 | 新增一种消息类型 |
|---|---|---|---|
| 继承 | 3 × 4 = 12 | 再写 3 个类 | 再写 4 个类 |
| **桥接** | 3 + 4 = 7 | **只写 1 个类** | **只写 1 个类** |

两个维度**互不影响地扩展**——这就是桥接模式的核心价值。

## 四、桥接 vs 继承

| 维度 | 继承实现 | 桥接模式 |
|---|---|---|
| 概念 | is-a，强绑定 | has-a，松耦合 |
| 类数量 | M × N | M + N |
| 扩展方式 | 两个维度耦合在一起 | 两个维度各自独立演进 |
| 编译期依赖 | 有（父类改动波及子类） | 无（只依赖接口） |
| 适用场景 | 单一维度、关系稳定 | 多个独立变化的维度 |

**桥接的代价**：增加了抽象层次，理解成本上升。**只有确认存在两个独立变化的维度时才值得引入。**

## 五、桥接 vs 策略（结构相似但意图不同）

两者都是"持有一个接口引用 + 运行时替换"，代码形状接近：

| 维度 | 桥接 | 策略 |
|---|---|---|
| 层次关系 | **两个层次结构**，抽象层自己也有继承体系 | **一个**层次结构（算法族） |
| 抽象层的子类 | 会扩展抽象侧的行为（`UrgentMessage`） | 通常没有，只有一个上下文类 |
| 目的 | 让两个维度**独立变化** | 让**算法可替换** |
| 替换时机 | 通常在装配时确定（一条"桥"对应一类场景） | 运行时按条件切换 |

一句话：**桥接关注"结构如何拆成两条线"，策略关注"算法如何换"。** 桥接中的 `Implementor` 维度看起来像策略，但多出"抽象侧也有继承体系"这一层，这是判断的关键。

## 六、JDK 中的实现：JDBC

JDBC 是桥接模式最标准的例子：

```
  抽象化维度                              实现化维度
┌──────────────────┐                 ┌──────────────────┐
│ DriverManager    │─────桥─────────▶│ java.sql.Driver  │
│ Connection       │                 │ (接口)            │
│ Statement        │                 └────────┬─────────┘
└──────────────────┘                ┌─────────┴──────────┐
                                    │MySQL Driver         │
                                    │PostgreSQL Driver    │
                                    │Oracle Driver        │
```

- `java.sql.Driver` 是 `Implementor`，各数据库厂商提供 `ConcreteImplementor`；
- `DriverManager` / `Connection` / `Statement` 是抽象层的 API；
- 应用代码只依赖 `java.sql.*` 这套抽象，**换数据库只需换驱动 jar 与 URL**，业务代码一行不改。

其他例子：AWT 的 `Component` 与 `Peer`（`ComponentPeer` 按操作系统实现）、SLF4J（API 抽象层）与 logback/log4j2（实现层绑定）、`java.util.logging` 的 Handler 体系。

## 七、优缺点

**优点**

1. 抽象与实现分离，两边可**独立扩展**，消除继承爆炸；
2. 符合开闭原则与合成复用原则；
3. 对客户端隐藏实现细节（客户端只看到抽象层的接口）。

**缺点**

1. 引入额外的抽象层次，**增加系统的理解与设计难度**；
2. 需要正确识别"哪些维度真正独立"——识别错了反而增加复杂度；
3. 对只需要一个变化维度的场景属于过度设计。

## 八、使用场景

判定信号：**你的类名里出现了"A的B"这种双维度描述，且两个维度都会增长。**

- **多端 + 多支付**：支付方式（微信/支付宝/银联）× 终端（iOS/Android/H5/小程序）；
- **消息通知**：消息类型 × 发送渠道（本页示例）；
- **跨平台组件**：控件类型 × 操作系统实现；
- **数据访问**：统一 DAO 抽象 × 多种存储引擎（MySQL / ES / 对象存储）；
- **文件导出**：导出格式（PDF/Excel）× 存储目标（本地/OSS/S3）。

## 九、面试问答

**Q1：桥接模式解决什么问题？**
解决**多维度变化导致的类爆炸**。当类沿两个独立维度变化时，继承方案需要 M×N 个类，桥接拆成两条继承体系后用组合连接，类数量降为 M+N，且两个维度可独立扩展。

**Q2：桥接和策略有什么区别？**
两者都是"组合 + 委派"，区别在**层次数量**：桥接的抽象侧**自己有继承体系**（`NormalMessage` / `UrgentMessage`），是两个层次结构间的桥；策略只有算法一族，上下文类通常只有一个。桥接是架构层面的拆分，策略是行为层面的替换。

**Q3：桥接和适配器有什么区别？**
**时机不同**：桥接是**事前设计**——预见到两个维度会独立变化，主动拆开；适配器是**事后补救**——已有的类接口不兼容，加一层转换。桥接不改变接口，适配器把接口 A 转成接口 B。

**Q4：为什么说 JDBC 是桥接模式？**
`java.sql.Driver` 是实现化接口，各厂商驱动是实现类；`DriverManager`、`Connection` 等是抽象化层。应用只依赖 `java.sql` 抽象，切换数据库只需换驱动，抽象层与实现层完全解耦——这正是桥接"抽象与实现分离"的定义。

**Q5：什么时候不该用桥接？**
当只存在**一个**变化维度时。比如只有"消息渠道"会变、消息类型固定，那么用策略模式就够了；硬套桥接会多出一层无用的抽象。判断标准是：**去掉这一层抽象后，类数量是否仍会随两个维度的乘积增长。**
