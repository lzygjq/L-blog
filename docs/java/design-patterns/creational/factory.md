---
order: 2
date: 2026-09-11
---

# 工厂模式（简单工厂 / 工厂方法 / 抽象工厂）

## 一、问题场景

业务代码里直接 `new` 具体实现，会同时踩到三个坑：

```java
public class OrderService {
    public void notifyUser(String channel, String msg) {
        if ("sms".equals(channel)) {
            new SmsNotifier().send(msg);          // ① 业务类认识了具体实现类
        } else if ("email".equals(channel)) {
            new EmailNotifier().send(msg);        // ② 新增渠道要改这里（违反开闭）
        }
        // ③ 如果 SmsNotifier 构造很复杂（要读配置、建连接），这段代码会被复制到每个调用点
    }
}
```

**工厂模式的核心价值只有一个词：解耦**——把"创建什么对象"的决定权从使用方移交给工厂。

注意一个常被忽略的事实：**"简单工厂"并不属于 GoF 的 23 种设计模式**，它只是一种编码习惯。真正的 GoF 模式是**工厂方法**和**抽象工厂**。

## 二、简单工厂（Simple Factory）

### 2.1 结构

```
        ┌──────────────┐
        │   Notifier   │  ← 抽象产品（接口）
        └──────┬───────┘
     ┌─────────┼─────────┐
┌────┴───┐ ┌───┴────┐ ┌──┴─────┐
│SmsNoti │ │EmailNo │ │WechatNo│  ← 具体产品
└────────┘ └────────┘ └────────┘
     ▲          ▲           ▲
     └──────────┼───────────┘
        ┌───────┴─────────┐
        │ NotifierFactory │  ← 工厂：按类型返回产品
        └─────────────────┘
```

### 2.2 实现

```java
public interface Notifier {
    void send(String msg);
}

public class SmsNotifier implements Notifier {
    public void send(String msg) { System.out.println("短信: " + msg); }
}
public class EmailNotifier implements Notifier {
    public void send(String msg) { System.out.println("邮件: " + msg); }
}

public class NotifierFactory {
    public static Notifier create(String channel) {
        return switch (channel) {
            case "sms"   -> new SmsNotifier();
            case "email" -> new EmailNotifier();
            default      -> throw new IllegalArgumentException("不支持的渠道: " + channel);
        };
    }
}

// 调用方：只认识抽象与工厂，不再出现具体类
Notifier notifier = NotifierFactory.create(channel);
notifier.send(msg);
```

### 2.3 评价

| 维度 | 说明 |
|---|---|
| 优点 | 实现简单，调用方与具体产品解耦，去掉重复的创建代码 |
| 缺点 | **工厂类集中了所有产品的创建逻辑**：新增产品必须改 `switch`（违反开闭原则）；产品类型过多时工厂会变成"上帝类" |
| 适用 | 产品种类少且**基本稳定**的场景 |

> 面试口径：被问到"简单工厂是不是设计模式"时，明确回答**不属于 GoF 23 种**，原因是它没有遵循开闭原则，且不属于"可扩展"的框架性解法。

## 三、工厂方法（Factory Method）

### 3.1 思路

把"要造哪个产品"这个变化点**从工厂类内部挪到工厂的继承体系**：一个产品对应一个工厂，新增产品 = 新增一个产品类 + 新增一个工厂类，**不改任何已有代码**。

### 3.2 结构

```
┌──────────────────┐            ┌──────────────┐
│  NotifierFactory │───────────▶│   Notifier   │  ← 工厂依赖抽象产品
│ + create()       │            └──────┬───────┘
└────────┬─────────┘                   │
   ┌─────┴──────┐              ┌───────┼────────┐
┌──┴───────┐ ┌──┴────────┐  ┌──┴───┐ ┌─┴─────┐ ┌┴──────┐
│SmsFactory│ │EmailFactory│ │SmsNo │ │EmailNo│ │WechatNo│
└──────────┘ └────────────┘ └──────┘ └───────┘ └───────┘
   每个具体工厂只负责一种具体产品
```

### 3.3 实现

```java
public interface NotifierFactory {
    Notifier create();        // 工厂方法：返回值是抽象产品
}

public class SmsNotifierFactory implements NotifierFactory {
    public Notifier create() { return new SmsNotifier(); }
}
public class EmailNotifierFactory implements NotifierFactory {
    public Notifier create() { return new EmailNotifier(); }
}

// 使用：工厂对象本身通常由配置或框架注入，从而把"选择"外置
public class NotifyService {
    private final NotifierFactory factory;

    public NotifyService(NotifierFactory factory) {   // 依赖抽象，符合依赖倒转
        this.factory = factory;
    }

    public void notify(String msg) {
        factory.create().send(msg);
    }
}
```

### 3.4 评价

- **优点**：完全符合开闭原则——新增产品只加新类；符合依赖倒转——高层只依赖抽象工厂。
- **缺点**：**类的数量成对增长**，产品多了会出现"类爆炸"。这是它最常被诟病的代价。

> 现实工程中的折衷：与其手工维护工厂继承体系，不如**用容器 + 约定替代工厂**。Spring 中 `Map<String, Notifier>` 注入所有实现，通过 `support()` 方法自选，等价实现了工厂方法的效果且没有类爆炸。

## 四、抽象工厂（Abstract Factory）

### 4.1 从"一个产品"到"一族产品"

工厂方法解决"造一个产品"，抽象工厂解决"造**一整套相互关联的产品**"。

以支付渠道为例，每个渠道都提供一整套能力：**支付 + 退款 + 对账单**。这三者是同一渠道下的产品族，不应该混用（不能收微信的钱、退支付宝的款）。

```
        产品族 →
产品线        支付宝族          微信族
  ↓
 支付      AlipayPay    WechatPay
 退款      AlipayRefund WechatRefund
 对账      AlipayBill   WechatBill
```

### 4.2 结构

```
┌────────────────────┐
│ PaymentFactory     │  ← 抽象工厂：定义了"一族"产品的创建接口
│ + createPay()      │
│ + createRefund()   │
│ + createBill()     │
└─────────┬──────────┘
   ┌──────┴────────┐
┌──┴───────────┐ ┌─┴─────────────┐
│AlipayFactory │ │WechatFactory  │  ← 具体工厂：各自生产一整套
└──────────────┘ └───────────────┘
   │                  │
   ├─ AlipayPay       ├─ WechatPay
   ├─ AlipayRefund    ├─ WechatRefund
   └─ AlipayBill      └─ WechatBill
```

### 4.3 实现

```java
public interface PayService    { void pay(BigDecimal amount); }
public interface RefundService { void refund(String orderNo); }
public interface BillService   { String download(String day); }

public class AlipayPay implements PayService {
    public void pay(BigDecimal amount) { /* 调支付宝 SDK */ }
}
// ... AlipayRefund / AlipayBill / WechatPay / WechatRefund / WechatBill 同理

public interface PaymentFactory {
    PayService createPay();
    RefundService createRefund();
    BillService createBill();
}

public class AlipayFactory implements PaymentFactory {
    public PayService createPay()       { return new AlipayPay(); }
    public RefundService createRefund() { return new AlipayRefund(); }
    public BillService createBill()     { return new AlipayBill(); }
}

// 业务层只依赖抽象工厂，切换渠道只需换一个工厂实现
public class SettlementService {
    private final PaymentFactory factory;

    public SettlementService(PaymentFactory factory) { this.factory = factory; }

    public void settle(BigDecimal amount, String day) {
        factory.createPay().pay(amount);
        factory.createBill().download(day);
    }
}
```

### 4.4 评价

- **优点**：保证同一产品族内的对象**配套使用**，客户端与具体产品族解耦；切换整个技术栈只需替换一个工厂（例如从"本地文件存储族"整体切到"对象存储族"）。
- **缺点（关键）**：**扩展产品维度极不友好**——在 `PaymentFactory` 上加一个 `createInvoice()`，**所有具体工厂都必须跟着改**（违反开闭原则）。对比工厂方法：抽象工厂对"加产品族"开放、对"加产品线"封闭，两者恰好相反。

> 结论：**产品族稳定、产品线可能增长**时用抽象工厂；**产品线固定、实现可能增长**时用工厂方法。

## 五、三种工厂横向对比

| 维度 | 简单工厂 | 工厂方法 | 抽象工厂 |
|---|---|---|---|
| 是否 GoF 23 种 | ❌ 不是 | ✅ 是 | ✅ 是 |
| 工厂结构 | 一个工厂类 + 分支判断 | 工厂继承体系 | 工厂继承体系 |
| 产出 | 单个产品 | 单个产品 | **一整套产品族** |
| 新增产品 | 改工厂（违反 OCP） | 加产品 + 加工厂（符合 OCP） | 加产品族（符合 OCP）；加产品线则违反 OCP |
| 复杂度 | 低 | 中（类数量成对增长） | 高（类数量成倍增长） |
| 典型场景 | 类型少且稳定 | 单一维度的产品扩展 | 多产品配套、多套实现切换 |

## 六、演进逻辑一张图

```
直接 new（耦合）
   │  把创建逻辑抽出来
   ▼
简单工厂（一个类管所有分支）        ← 违反开闭：加产品要改工厂
   │  把"选择"下放给工厂继承体系
   ▼
工厂方法（一个工厂管一个产品）      ← 加产品只加类；代价是类成对增长
   │  把"一族产品"交给同一个工厂
   ▼
抽象工厂（一个工厂管一族产品）      ← 保证产品配套；代价是加产品线要改所有工厂
```

## 七、源码剖析

| 框架 | 实现 | 属于哪种 |
|---|---|---|
| Spring | `BeanFactory` / `ApplicationContext` | 广义工厂（本质是"容器 + 注册表"，比模式更灵活） |
| Spring | `FactoryBean<T>` | 工厂方法：`getObject()` 就是工厂方法 |
| JDK | `Collection.iterator()` | 工厂方法：集合类充当具体工厂，`Iterator` 是抽象产品 |
| JDK | `Calendar.getInstance()` | 简单工厂 |
| JDK | `Executors.newFixedThreadPool()` 等 | 简单工厂（静态方法按参数产出不同 `ExecutorService`） |
| MyBatis | `SqlSessionFactory` | 工厂方法 + 建造者（用 `SqlSessionFactoryBuilder` 组装） |

### 7.1 `FactoryBean` 与 `&` 前缀：容器里的两种 bean

```java
public interface FactoryBean<T> {
    T getObject() throws Exception;          // 产品
    Class<?> getObjectType();                // 产品类型
    default boolean isSingleton() { return true; }
}
```

麻烦在于：**`FactoryBean` 自己也是一个 bean**。容器必须能同时表达「工厂」和「工厂的产品」两种身份——靠的就是名字前缀：

```java
// AbstractBeanFactory
String FACTORY_BEAN_PREFIX = "&";

// AbstractBeanFactory#getObjectForBeanInstance
protected Object getObjectForBeanInstance(Object beanInstance, String name, String beanName, RootBeanDefinition mbd) {
    if (!(beanInstance instanceof FactoryBean) || BeanFactoryUtils.isFactoryDereference(name)) {
        return beanInstance;                              // 带 & 前缀：返回工厂自己
    }
    ...
    return getObjectFromFactoryBean(factory, beanName, !synthetic);   // 不带 &：返回 getObject() 的产物
}
```

```java
Object sqlSessionFactory = context.getBean("sqlSessionFactory");    // getObject() 的产物
Object factory          = context.getBean("&sqlSessionFactory");    // FactoryBean 本身
```

**与教科书的差异**：教科书的工厂方法里产品类型在编译期就定了，调用方 `new` 一个工厂、拿产品，天经地义。但**在 IoC 容器里，工厂也必须是被容器管理的对象**——于是同一个 bean name 就指向了两个东西，只能用前缀区分。

> **这是「把模式搬进框架」的典型增量成本：教科书示例里不存在的问题（工厂自己被注入、被后置处理器加工、被 AOP 代理），在框架里全都要解决。** 看到 `FactoryBean` 别只记 API，要记住它存在的理由是「容器里的一切都得先是 bean」。

### 7.2 `Collection#iterator` 算不算工厂方法

```java
// ArrayList
public Iterator<E> iterator() {
    return new Itr();                 // Itr 是 ArrayList 的私有内部类
}
```

对照教科书的工厂方法四角色：

| 角色 | 教科书 | `ArrayList` |
|---|---|---|
| 抽象工厂 | `Creator` 声明 `factoryMethod()` | `Collection#iterator()` ✅ |
| 抽象产品 | `Product` | `Iterator<E>` ✅ |
| 具体工厂 | `ConcreteCreator` | `ArrayList` ✅ |
| 具体产品 | `ConcreteProduct` | `ArrayList.Itr` ✅ |

四个角色齐了，**但「具体工厂」与「具体产品」是同一个类的内外两层**（`ArrayList` 与它的私有内部类 `Itr`）。这在教科书示例里很少见，却是**工厂方法在 JDK 里最常见的形态**。

判据其实一直很清楚：**创建逻辑被推迟到「具体实现类」内部，调用方只面向抽象产品编程。** 「具体工厂要不要独立成类」是形态问题，不是模式问题。

更贴近教科书「多套具体工厂」的例子是同为 `Collection` 的另一个实现：`Collections.unmodifiableList(list).iterator()` 返回 `UnmodifiableList.Itr`——**同一个抽象产品、两套具体工厂与具体产品**。

### 7.3 `Executors` 的简单工厂：返回值被刻意收窄

```java
public static ExecutorService newFixedThreadPool(int nThreads) {
    return new ThreadPoolExecutor(nThreads, nThreads, 0L, TimeUnit.MILLISECONDS,
                                  new LinkedBlockingQueue<Runnable>());
}

public static ExecutorService newSingleThreadExecutor() {
    return new FinalizableDelegatedExecutorService(
            new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<Runnable>()));
}
```

两个都是「静态方法按参数返回不同实现」的简单工厂，但第二个多包了一层：

```java
static class DelegatedExecutorService extends AbstractExecutorService {
    private final ExecutorService e;

    DelegatedExecutorService(ExecutorService executor) { e = executor; }

    public void execute(Runnable command) { e.execute(command); }
    public void shutdown() { e.shutdown(); }
    // 注意：没有 setCorePoolSize / setMaximumPoolSize / setKeepAliveTime
}
```

为什么？因为 `newSingleThreadExecutor()` 对调用方的承诺是「**永远只有一个线程**」。如果直接返回 `ThreadPoolExecutor`，调用方可以强转回去、把核心线程数改成 10——**承诺就没了**。包一层之后，**强转也拿不到配置方法**。

> **这是简单工厂里最容易被忽略的一层职责：不只是「选实现」，还包括「限制产物对外暴露的能力面」。** 教科书的简单工厂只做 `switch`，真实的工厂方法常常还要保证「拿到手的东西不能被玩坏」。

另外 `Executors.defaultThreadFactory()` 返回的 `DefaultThreadFactory` 负责给线程命名（`pool-N-thread-M`）——**给「这个线程从哪来」留下可观测的线索**，也是工厂的常见附带职责。

## 八、面试问答

**Q1：简单工厂、工厂方法、抽象工厂的区别？**
一句话版本：**简单工厂是分支判断，工厂方法是继承体系造一个产品，抽象工厂是继承体系造一族产品。** 再补一句开闭原则的差异：简单工厂加产品要改代码；工厂方法加产品只加类；抽象工厂加产品族只加类，加产品线要改所有工厂。

**Q2：抽象工厂和工厂方法最本质的区别？**
**产出粒度**：工厂方法的每个具体工厂只产出一种产品；抽象工厂的每个具体工厂产出一族**相互关联**的产品，并有"必须配套使用"的约束。

**Q3：既然依赖倒转要求面向接口，为什么还要工厂？直接用接口 + Spring 注入不行吗？**
行，而且更常见。工厂模式的价值在**运行时才能确定具体实现**、**创建逻辑复杂（需要读配置/初始化资源）**、或者**没有 IoC 容器可用**的场景。有 Spring 时，绝大多数"工厂"可以直接由容器承担：注入 `Map<String, T>` 或 `List<T>`，用 `support()` 自选，比手写工厂继承体系更轻。

**Q4：工厂模式的缺点是什么？**
三个：① **类数量膨胀**（工厂方法成对增长，抽象工厂成倍增长）；② 增加了抽象层次，简单场景下属于过度设计；③ 抽象工厂难以扩展产品线。所以判断标准是：**变化点是否真实存在**。只有一个实现类时引入工厂，是纯粹的负担。
