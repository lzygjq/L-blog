---
order: 7
date: 2026-09-11
---

# 中介者模式（Mediator）

## 一、问题场景

当多个对象**两两之间都要交互**时，依赖关系会呈 **O(n²)** 增长：

```
微服务直连：                    API 网关（中介者）：
  A ── B                          A ──┐
  A ── C                          B ──┤
  A ── D                          C ──┼──▶ Gateway ──▶ 后端服务
  B ── C                          D ──┘
  B ── D          （12 条连线）           （4 条连线）
  C ── D
```

同样的问题出现在 UI 界面里：一个下拉框的选择会影响三个输入框的可用性、两个按钮的文案——如果让控件互相监听，会形成**网状依赖**，改一个控件要牵动一串。

中介者模式的解法：**引入一个中心对象，所有交互都经过它。同事对象不再互相引用，依赖从网状收敛为星形。**

## 二、结构与角色

```
        ┌───────────────┐
        │   Mediator    │  ← 抽象中介者：定义同事间通信的接口
        │ + notify()    │
        └───────┬───────┘
                │
        ┌───────┴─────────┐
        │ ConcreteMediator│ ← 知道所有同事，负责协调
        └───────┬─────────┘
                │ 持有
     ┌──────────┼──────────┐
     ▼          ▼          ▼
┌─────────┐┌─────────┐┌─────────┐
│Colleague││Colleague││Colleague│  ← 同事：只认识中介者，不认识彼此
│  A      ││  B      ││  C      │
└─────────┘└─────────┘└─────────┘
```

| 角色 | 职责 |
|---|---|
| **Mediator（抽象中介者）** | 定义同事间通信的接口 |
| **ConcreteMediator（具体中介者）** | 掌握全部同事引用，负责协调与转发 |
| **Colleague（同事）** | 只持有中介者引用，自身逻辑不涉及其他同事 |

代价很明确：**中介者会变成"上帝对象"**——如果协调逻辑过于复杂，它会膨胀成难以维护的巨型类。所以中介者适合协调**逻辑本身不复杂、但连线数量多**的场景。

## 三、代码实现

以"订单结算页"为例：会员等级、优惠券、积分三者互相影响最终金额。

```java
/** 抽象中介者 */
public interface SettlementMediator {
    /** 某个控件变化后，由中介者统一重算 */
    void notifyChanged(Component source);
    BigDecimal getFinalAmount();
}
```

```java
/** 抽象同事：只依赖中介者 */
public abstract class Component {
    protected final SettlementMediator mediator;
    protected Component(SettlementMediator mediator) { this.mediator = mediator; }
}
```

```java
public class MemberComponent extends Component {
    private MemberLevel level = MemberLevel.NORMAL;

    public MemberComponent(SettlementMediator mediator) { super(mediator); }

    public void select(MemberLevel level) {
        this.level = level;
        mediator.notifyChanged(this);          // 通知中介者，不直接操作其他组件
    }
    public MemberLevel getLevel() { return level; }
}

public class CouponComponent extends Component {
    private Coupon selected;

    public CouponComponent(SettlementMediator mediator) { super(mediator); }

    public void select(Coupon coupon) {
        this.selected = coupon;
        mediator.notifyChanged(this);
    }
    public Coupon getSelected() { return selected; }
}
```

中介者集中所有协调逻辑：

```java
public class SettlementCenter implements SettlementMediator {
    private final MemberComponent member;
    private final CouponComponent coupon;
    private final BigDecimal originalAmount;

    public SettlementCenter(BigDecimal originalAmount) {
        this.originalAmount = originalAmount;
        this.member = new MemberComponent(this);
        this.coupon = new CouponComponent(this);
    }

    @Override
    public void notifyChanged(Component source) {
        if (source == member) {
            // 会员等级变化 → 可能影响可选优惠券范围
            coupon.refreshAvailable(member.getLevel());
        }
        // 其他联动规则集中在这里
    }

    @Override
    public BigDecimal getFinalAmount() {
        BigDecimal afterMember = member.getLevel().discount(originalAmount);
        BigDecimal afterCoupon = coupon.getSelected() == null
            ? afterMember
            : afterMember.subtract(coupon.getSelected().getValue()).max(BigDecimal.ZERO);
        return afterCoupon.setScale(2, RoundingMode.HALF_UP);
    }
}
```

**关键收益**：`MemberComponent` 完全不知道 `CouponComponent` 的存在。联动规则全部集中在中介者里——需求变更时只改一处。

## 四、对比辨析

### 4.1 中介者 vs 外观（Facade）

两者都在"简化"，但方向不同：

| 维度 | 中介者 | 外观 |
|---|---|---|
| 通信方向 | **双向**：同事可以向中介者主动发请求 | **单向**：客户端调用外观，子系统不知道外观存在 |
| 子系统之间 | 通过中介者**互相通信** | 子系统之间**不通过外观通信** |
| 目的 | 收敛多对多的**网状依赖** | 为复杂子系统提供**统一简化入口** |
| 是否新增功能 | 不新增，只重路由 | 不新增，只做编排 |

一句话：**外观是"客户端 → 子系统"的简化门面，中介者是"同事 ↔ 同事"的通信枢纽。**

### 4.2 中介者 vs 观察者

| 维度 | 观察者 | 中介者 |
|---|---|---|
| 拓扑 | 一对多星形（单目标 → N 订阅者） | 多对多收敛（N 方 ↔ 1 中心） |
| 方向 | 单向广播 | 双向请求 |
| 中心是否知道业务规则 | 不需要（只管转发） | 需要（负责协调决策） |
| 典型 | Spring 事件 | API 网关、消息总线、Controller |

**观察者只做"通知"，中介者要做"协调"**——后者掌握业务规则，是决策中心。

### 4.3 中介者 vs 门面模式在微服务中的映射

| 模式 | 微服务对应物 |
|---|---|
| 中介者 | **API 网关**、服务总线、事件总线（BFF 层）、Saga 协调器 |
| 外观 | BFF（Backend For Frontend）、聚合服务 |
| 观察者 | 消息队列广播、Spring Cloud Bus |

有意思的是，**微服务架构的演进本身就是在重复中介者模式的思想**：最初服务直连（网状），然后加网关收敛（星形），再用服务网格（Service Mesh）把中介能力下沉到基础设施层——**Sidecar 就是"中介者模式的基础设施化"**。

## 五、使用场景与面试问答

### 典型场景

| 场景 | 中介者 |
|---|---|
| UI 控件联动 | 对话框控制器（GoF 原始例子） |
| Web MVC | `DispatcherServlet` / Controller（协调 Model 与 View） |
| 微服务入口 | API 网关、BFF |
| 分布式事务 | Saga 协调器、TCC 事务管理器 |
| 消息驱动架构 | 事件总线、MQ Broker |
| 聊天室 | 消息服务器（用户之间不直连） |

### 面试问答

**Q1：中介者模式的最大风险是什么？**

**中介者膨胀为上帝对象**。所有协调逻辑集中在一处，一旦规则复杂，中介者会变成一个庞大、难测、人人绕不开的类。缓解手段：① 按业务域**拆成多个中介者**（如结算中介者、库存中介者）；② 把规则抽成策略/规则引擎，中介者只负责路由；③ 微服务场景下把中介下沉为独立服务（网关、编排服务），物理隔离复杂度。

**Q2：微服务里的 API 网关是中介者模式吗？**

是，且是规模最大的应用形态。网关收敛了所有客户端与服务之间、服务与服务之间的通信路径（路由、鉴权、限流、协议转换），服务之间不再两两直连。区别在于：GoF 的中介者是**进程内对象**，网关是**独立部署的网络组件**；且网关通常**不承载业务规则**（那是 BFF/编排层的职责），偏向"技术中介"。

**Q3：中介者与观察者怎么配合使用？**

常见组合：**事件总线既是中介者也是观察者**——各方通过总线发布事件（中介者收敛通信），总线遍历通知订阅者（观察者多播）。Spring 的 `ApplicationEventPublisher` 就是这种"进程内的轻量事件总线"。

**Q4：什么情况下不该用中介者？**

对象数量少（≤3）时，直接引用更简单直观——中介者引入了一层间接性，调试时"谁调用了谁"变得不直观。中介者的价值来自**连线数量**：只有依赖关系确实呈网状（n ≥ 4 且交互频繁）时，收敛才划算。

**Q5：`DispatcherServlet` 体现了中介者模式吗？**

体现的是它的核心思想。`DispatcherServlet` 本身不作为业务中介者接收各方请求，而是**编排** `HandlerMapping`（找处理器）、`HandlerAdapter`（调用处理器）、`ViewResolver`（解析视图）等组件协作——这是**外观 + 中介者 + 责任链的组合**。Spring MVC 的设计恰恰说明：**真实框架里往往是多个模式的混合，而不是单一模式的教条实现**。
