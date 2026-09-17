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

## 五、源码剖析

上一节看的是**它和观察者的拓扑差异**；本节看**中介者在真实系统里的三种形态**。哪些系统用了它，速查表在下一节——这里要回答一个问题：**中介者一旦成为中心，它自己出了故障怎么办。**

### 5.1 Spring MVC · `DispatcherServlet`：编排式中介者

```java
// 精简自 org.springframework.web.servlet.DispatcherServlet#doDispatch
protected void doDispatch(HttpServletRequest request, HttpServletResponse response) throws Exception {
    HttpServletRequest processedRequest = request;
    HandlerExecutionChain mappedHandler = null;
    ModelAndView mv = null;
    Exception dispatchException = null;
    try {
        processedRequest = checkMultipart(request);
        mappedHandler = getHandler(processedRequest);              // ① 找处理器
        if (mappedHandler == null) {
            noHandlerFound(processedRequest, response);            // ② 找不到就 404
            return;
        }
        HandlerAdapter ha = getHandlerAdapter(mappedHandler.getHandler());   // ③ 找适配器
        // ...
        if (!mappedHandler.applyPreHandle(processedRequest, response)) {
            return;                                                // ④ 拦截器中断
        }
        mv = ha.handle(processedRequest, response, mappedHandler.getHandler());   // ⑤ 执行
        applyDefaultViewName(processedRequest, mv);
        mappedHandler.applyPostHandle(processedRequest, response, mv);
    } catch (Exception ex) {
        dispatchException = ex;
    }
    processDispatchResult(processedRequest, response, mappedHandler, mv, dispatchException);
}
```

**结构差异**：`DispatcherServlet` 是中介者的**编排式**形态。`HandlerMapping`、`HandlerAdapter`、`HandlerInterceptor`、`ViewResolver`、`HandlerExceptionResolver` 之间**互不认识**——`Controller` 不知道谁在解析视图，`ViewResolver` 不知道谁调用了它，所有协作都发生在 `doDispatch()` 这一个方法里。

这与教科书的中介者有一处显著不同：**教科书里各方持有中介者引用（`colleague.setMediator(m)`），主动向中介者汇报；而 `doDispatch()` 是中介者主动、顺序地调用各方。** 各方甚至不需要知道自己是"同事"——它们是纯粹的被动组件。

**代价同样明显**：`doDispatch()` 成了整个 MVC 的**唯一支点**，任何组件要参与进来（新增一个 `HandlerAdapter`、插入一段异常处理）都必须改这里或改它的扩展点。这就是中介者的固有代价：**中心化换来了解耦，也换来了中心自身的高变更频率。**

### 5.2 注册中心：中介者的 N×N → N×1，以及它的单点代价

Dubbo / Nacos / Eureka 这类注册中心，是中介者模式在分布式里的形态：

```
不使用注册中心：                      使用注册中心：
consumer1 ─┬─▶ provider1              consumer1 ─┐
           ├─▶ provider2                          │
           └─▶ provider3              consumer2 ─┼─▶ Registry ◀─ provider1/2/3
consumer2 ─┬─▶ provider1                          │
           ├─▶ provider2              consumer3 ─┘
           └─▶ provider3
   连接数 = N × M                          连接数 = N + M
```

**结构差异**：中介者在这里解决的是**连接数与地址管理**问题——消费者不需要知道任何提供者的地址，只与注册中心交互。这带来教科书没提的一个后果：**注册中心成了全局单点，它的不可用会同时影响所有服务发现。**

工程上的对策分两级，都值得记住：

1. **本地缓存 + 推空保护**：Dubbo 的 `RegistryDirectory` 会把服务列表缓存在本地，注册中心断开后**继续用缓存调用**。这就是"注册中心挂了，服务还能撑一段时间"的原因。
2. **推空保护**：如果订阅到的地址列表变**空**，Dubbo 默认**拒绝更新缓存**（保留旧列表）。因为"本该有 100 个提供者却收到 0 个"更可能是注册中心异常而非真下线——**宁可调用失败也不要清空地址**。

**这条能给出一条通用判据**：**引入中介者的同时，必须为"中介者不可用"设计降级路径。** 中介者把所有依赖收敛到一点，那一点就成了可用性的上限。

### 5.3 消息代理：异步形态下，中介者变成了存储

Kafka / RocketMQ 是中介者的**异步形态**——生产者与消费者不仅互不认识，连**时间上也不重叠**（生产者写完可能就退出了）。

**结构差异**：同步中介者只负责"转发"（收到请求、找目标、调用、返回），所以它可以很轻（`EventBus` 就是一个 `Map` + `CopyOnWriteArrayList`）。而**异步中介者必须负责"保存"**——消息可能几小时后才被消费，中介者要么持久化，要么丢失。

这解释了两者的体量差异：

| 形态 | 中介者要做什么 | 实现复杂度 | 例子 |
|---|---|---|---|
| **同步编排** | 顺序调用各方，转发结果 | 低（几百行） | `DispatcherServlet` |
| **同步转发** | 维护订阅表，逐个通知 | 低 | Guava `EventBus`、Spring `ApplicationContext` |
| **持久化代理** | **存消息** + 分区 + 复制 + 位移管理 + 重平衡 | 高（一个分布式系统） | Kafka、RocketMQ |

**从"转发"到"存储"这一步，就是 `EventBus` 与 Kafka 之间的全部距离。** 很多团队在设计"解耦通知"时的第一个决策点就在这里：**消息丢了能不能接受**——能接受就用应用内事件总线，不能接受才需要引入消息中间件。

### 5.4 中介者 vs 外观：一件常被混淆的事

两者都"用一个对象包住一堆组件"，区别在**通信方向**：

| 维度 | 外观 Facade | 中介者 Mediator |
|---|---|---|
| 谁调用谁 | 调用方 → 外观 → 子系统（**单向**） | 各方 ↔ 中介者（**双向**，中介者知道各方） |
| 子系统是否知道它 | **不知道**，也无需知道 | **知道**，且通过它通信 |
| 目的 | **简化接口**（把多个步骤包成一步） | **解耦协作**（把网状依赖收敛成星形） |
| 复杂度去向 | 复杂度没消失，只是被藏起来了 | 复杂度被搬到了中介者身上 |

**一句话**：外观是"**给外人看的门面**"（子系统之间该怎么调还怎么调，只是外人不用知道），中介者是"**大家都必须经过的枢纽**"（子系统之间不再直接通信）。`DispatcherServlet` 之所以是中介者而不是外观，就在于 `Controller` 与 `ViewResolver` 之间**根本不存在直接通信**。

## 六、使用场景与面试问答

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
