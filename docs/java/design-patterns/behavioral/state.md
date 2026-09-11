---
order: 5
date: 2026-09-11
---

# 状态模式（State）

## 一、问题场景

业务对象常有**生命周期状态**，不同状态下同一个操作的行为不同，且操作会导致状态迁移。最直觉的写法是 `enum + switch`：

```java
public void pay(Order order) {
    switch (order.getStatus()) {
        case CREATED:
            order.setStatus(PAID);
            order.setPayTime(now());
            break;
        case PAID:
            throw new BizException("订单已支付，请勿重复支付");
        case SHIPPED:
            throw new BizException("订单已发货，无法支付");
        case CANCELLED:
            throw new BizException("订单已取消");
        // 新增一个状态，所有 switch 都要改一遍
    }
}
```

状态一多、动作一多，代码就变成 **状态数 × 动作数** 的组合爆炸，而且每个方法都要重复一遍"当前状态是什么 → 能不能做 → 做完变成什么"。

状态模式的解法：**把每个状态变成一个类，状态自己决定"在这个状态下某个动作该怎么做、以及接下来转到哪个状态"。**

## 二、结构与角色

```
        ┌────────────────────┐
        │      Context       │
        │ - state: State     │──── 委托 ────┐
        │ + pay()/ship()/... │              │
        └────────────────────┘              ▼
                                 ┌────────────────────┐
                                 │   «interface»      │
                                 │       State        │
                                 │ + pay(ctx)         │
                                 │ + ship(ctx)        │
                                 └─────────┬──────────┘
                                           │ 实现
              ┌────────────┬───────────────┼──────────────┬────────────┐
      ┌───────┴──────┐ ┌───┴────────┐ ┌────┴──────┐ ┌─────┴───────┐
      │CreatedState  │ │PaidState   │ │ShippedState│ │CancelledState│
      │ 可支付/可取消│ │ 可发货     │ │ 可确认收货 │ │ 全部拒绝     │
      └──────────────┘ └────────────┘ └───────────┘ └─────────────┘
```

| 角色 | 职责 |
|---|---|
| **Context（上下文）** | 持有当前状态对象，对外暴露业务动作，内部委托给状态 |
| **State（抽象状态）** | 声明所有状态共有的行为接口 |
| **ConcreteState** | 实现"这个状态下该动作如何处理 + 处理完转到哪个状态" |

关键点：**转移逻辑写在状态类内部**（`PaidState.pay()` 里 `ctx.setState(new ShippedState())`），调用方只发动作、不问状态。

## 三、代码实现

```java
/** 抽象状态：把"所有状态下都可能被调用的动作"定义清楚 */
public interface OrderState {
    void pay(OrderContext ctx);
    void ship(OrderContext ctx);
    void confirm(OrderContext ctx);
    void cancel(OrderContext ctx);
}
```

```java
/** 已创建：可支付、可取消 */
public class CreatedState implements OrderState {
    @Override public void pay(OrderContext ctx) {
        ctx.setPayTime(LocalDateTime.now());
        ctx.setState(new PaidState());                       // 状态自己决定下一个状态
    }
    @Override public void ship(OrderContext ctx) {
        throw new BizException("未支付，无法发货");
    }
    @Override public void confirm(OrderContext ctx) { throw new BizException("未发货，无法确认"); }
    @Override public void cancel(OrderContext ctx) { ctx.setState(new CancelledState()); }
}
```

```java
/** 已支付：可发货；重复支付/取消都要拒绝 */
public class PaidState implements OrderState {
    @Override public void pay(OrderContext ctx)   { throw new BizException("订单已支付，请勿重复支付"); }
    @Override public void ship(OrderContext ctx)  { ctx.setState(new ShippedState()); }
    @Override public void confirm(OrderContext ctx) { throw new BizException("未发货，无法确认"); }
    @Override public void cancel(OrderContext ctx) { throw new BizException("已支付订单需走退款流程"); }
}
```

```java
/** 上下文：只负责委派，不含任何分支 */
public class OrderContext {
    private OrderState state = new CreatedState();     // 初始状态
    private String orderNo;
    private LocalDateTime payTime;

    public void pay()     { state.pay(this); }
    public void ship()    { state.ship(this); }
    public void confirm() { state.confirm(this); }
    public void cancel()  { state.cancel(this); }

    // 供状态类回调，完成状态迁移
    void setState(OrderState next) { this.state = next; }
    void setPayTime(LocalDateTime t) { this.payTime = t; }

    /** 便于外部查询当前状态名（可选） */
    public String stateName() { return state.getClass().getSimpleName(); }
}
```

调用：

```java
OrderContext order = new OrderContext();
order.ship();      // 抛异常：未支付，无法发货
order.pay();       // 状态 → PaidState
order.ship();      // 状态 → ShippedState
order.cancel();    // 抛异常：已支付订单需走退款流程
```

注意 `OrderContext` 里**没有任何 if/switch**——判断分散到了各个状态类中，新增状态只需新增一个类，符合开闭原则。

### 状态对象的复用

状态对象通常**无状态**（所有数据存在 Context 里），因此可以做成**单例享元**，避免每次迁移都 `new`：

```java
public class PaidState implements OrderState {
    public static final PaidState INSTANCE = new PaidState();
    private PaidState() { }
    // ...
}
// 迁移时：ctx.setState(PaidState.INSTANCE);
```

这与享元模式的思想一致：**把可共享的内部状态抽出来复用**。

## 四、对比辨析

### 4.1 状态 vs 策略——最易混淆的一对

**两者的类图几乎完全一样，区别只在"谁决定切换"：**

| 维度 | 状态 | 策略 |
|---|---|---|
| 切换发起者 | **状态自己**（内部触发） | **客户端**（外部注入） |
| 状态/策略之间的关系 | 有**转移关系**，A 知道 B 的存在 | 彼此**独立**，互不感知 |
| 调用方是否知道当前是哪个 | 通常不知道 | 知道，且主动挑选 |
| 是否需要转移记录 | 需要（当前状态引用） | 不需要 |
| 关注点 | 对象**随时间的状态迁移** | 算法的**可替换性** |

**判据**：如果"下一个实现"是由当前对象在运行时决定的 → 状态；如果是由调用方在调用前选好的 → 策略。

### 4.2 状态模式 vs 状态机（State Machine）

| 维度 | 状态模式 | 状态机引擎（如 Spring StateMachine） |
|---|---|---|
| 转移规则位置 | 散落在各状态类的方法里 | 集中配置（声明式） |
| 可观测性 | 差（要读代码才知道全貌） | 好（配置即文档） |
| 改动成本 | 新增状态改类 | 改配置 |
| 适用规模 | 状态少（<6）、逻辑简单 | 状态多、转移复杂、需要审计 |

**中等规模以下的业务，状态模式够用；状态超过 6~8 个、或需要事后审计状态流转，应该上状态机引擎。** 状态模式的隐患是"转移关系不可视"——想画一张完整状态图，得把每个类读一遍。

### 4.3 状态 vs `enum + switch`

| 维度 | enum + switch | 状态模式 |
|---|---|---|
| 新增状态 | 改所有 switch 方法 | 新增一个类 |
| 行为分散度 | 集中在一个方法里 | 分散在各状态类 |
| 可读性（状态少时） | 更好，一眼看全 | 需要跳转 |
| 可扩展性 | 差 | 好 |
| 状态特有数据 | 塞进 enum 或 Context | 放状态类，天然隔离 |

**选择标准**：状态 ≤ 4 个且转移简单 → `enum + switch` 更直观；状态多、每个状态下行为差异大 → 状态模式。

## 五、使用场景与面试问答

### 典型场景

| 场景 | 状态 | 动作 |
|---|---|---|
| 电商订单 | 待支付 / 已支付 / 已发货 / 已完成 / 已取消 | 支付、发货、确认、退款、取消 |
| 审批流 | 草稿 / 待审 / 审批中 / 通过 / 驳回 | 提交、同意、驳回、撤回 |
| 支付单 | 待支付 / 支付中 / 成功 / 失败 | 发起、回调、重试、关单 |
| 连接对象 | 未连接 / 连接中 / 已连接 / 断线 | connect、send、close |
| 任务调度 | 待调度 / 运行中 / 暂停 / 完成 | start、pause、resume、stop |

这些场景的共同特征：**同一个动作在不同状态下的合法性不同，且动作会改变状态**。

### 面试问答

**Q1：状态模式和策略模式怎么区分？**

核心看**切换的控制权**：策略由客户端挑好并注入，策略之间互不感知；状态由状态对象自己在处理动作时切换，状态之间存在明确的转移关系。代码形状一样，**意图相反**——这是设计模式中"结构相同、意图不同"的典型例证（另一例是代理与装饰者）。

**Q2：状态模式怎么避免类爆炸？**

① 状态对象做成**单例享元**（无状态，可复用）；② 抽象状态类提供**默认实现**（都抛"不支持该操作"异常），各具体状态只覆写自己支持的动作——这是**缺省适配器**思想在状态模式中的应用，能显著减少空方法；③ 状态超过 8 个时改用状态机引擎，用配置替代类。

**Q3：状态对象需要线程安全吗？**

需要关注。如果 Context 被多线程共享（如同一订单被并发请求操作），状态迁移必须加锁或使用 CAS，否则可能同时从"待支付"迁到"已支付"和"已取消"。实务做法：**用数据库行锁或乐观锁保护状态字段**，把状态迁移变成一次原子的条件更新（`UPDATE ... WHERE status = 'CREATED'`），而不是依赖 JVM 锁——因为服务是多实例部署的。

**Q4：状态模式怎么和持久化配合？**

Context 的数据（包括状态标识）存库，状态对象本身**不持久化**（它是行为，不是数据）。加载时按 `status` 字段映射回对应的状态对象（如 `switch` 或 Map 查表）。这是"数据与行为分离"的体现：**持久化的是状态标识，恢复的是状态对象**。

**Q5：什么情况下不该用状态模式？**

状态少（≤4）且转移简单，或状态间行为差异很小——此时 `enum + switch` 更直观、更易读，引入状态模式只是徒增文件。**状态模式买的是"可扩展性"，如果状态集合稳定不变，这笔投资就不划算。**
