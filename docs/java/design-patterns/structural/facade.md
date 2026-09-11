---
order: 5
date: 2026-09-11
---

# 外观模式（Facade）

## 一、问题场景

一个业务动作往往需要**按固定顺序协调多个子系统**。如果让调用方自己编排，会出现三个问题：

```java
// 反例：调用方需要了解 6 个子系统、以及它们的正确调用顺序
public void createOrder(OrderCmd cmd) {
    inventoryService.lock(cmd.getSkuId(), cmd.getQty());      // ① 必须最先锁库存
    priceService.calc(cmd);                                   // ② 再算价
    couponService.deduct(cmd);                                // ③ 再核销优惠券（依赖 ② 的结果）
    paymentService.pay(cmd);                                  // ④ 再发起支付
    logisticsService.create(cmd);                             // ⑤ 支付成功后建运单
    notifyService.push(cmd.getUserId(), "下单成功");            // ⑥ 最后通知
}
```

问题在于：顺序是**隐式契约**，任何调用方漏掉或写错顺序都会造成数据不一致；子系统一多，编排代码会在 Web 层、定时任务、MQ 消费者里被复制多份。

外观模式的解法：**为一组子系统提供一个统一的高层接口**，把编排逻辑收敛到一个地方。

## 二、结构与角色

```
┌──────────┐
│  Client  │
└────┬─────┘
     │ 只依赖外观
┌────▼─────────────┐
│     Facade       │  ← 知道哪些子系统负责处理请求、按什么顺序调用
│ + createOrder()  │
└────┬─────────────┘
     │ 委派
 ┌───┴──┬────────┬────────┬─────────┬──────────┐
 ▼      ▼        ▼        ▼         ▼          ▼
库存   价格     优惠券   支付     物流       通知
```

四个角色中，**外观是唯一的"新增"**：它不做业务计算，只做**编排 + 简化**。

## 三、实现

```java
public class OrderFacade {
    private final InventoryService inventoryService;
    private final PriceService priceService;
    private final CouponService couponService;
    private final PaymentService paymentService;
    private final LogisticsService logisticsService;
    private final NotifyService notifyService;
    // 构造器注入省略

    /** 对外只暴露这一个方法，内部编排顺序被固化 */
    public OrderResult createOrder(OrderCmd cmd) {
        inventoryService.lock(cmd.getSkuId(), cmd.getQty());
        try {
            Money amount = priceService.calc(cmd);
            Money payable = couponService.deduct(cmd, amount);
            PaymentResult pay = paymentService.pay(cmd, payable);
            if (!pay.isSuccess()) {
                throw new BizException("支付失败");
            }
            String waybillNo = logisticsService.create(cmd);
            notifyService.push(cmd.getUserId(), "下单成功");
            return OrderResult.of(cmd, payable, waybillNo);
        } catch (RuntimeException e) {
            couponService.rollback(cmd);          // 补偿也被收进外观
            inventoryService.unlock(cmd.getSkuId(), cmd.getQty());
            throw e;
        }
    }
}
```

调用方（Controller / MQ 消费者 / 定时任务）现在只需要：

```java
orderFacade.createOrder(cmd);
```

**两个必须说清的边界**：

1. **外观不阻止直接访问子系统。** 需要细粒度控制（如后台管理要单独解锁库存）时，仍然可以直接调用子系统——外观只是提供了"便捷通道"，不是唯一通道。
2. **外观不增加新功能。** 它只做编排、转换、简化。如果外观里出现了子系统都不具备的业务计算，那是职责放错了地方。

## 四、与相邻模式的边界

| 对比 | 区别 |
|---|---|
| 外观 vs 适配器 | 适配器把**一个**不兼容接口转成另一个接口；外观把**一组**接口收拢成一个入口，不改变任何已有接口 |
| 外观 vs 中介者 | 外观是**单向**的（调用方 → 子系统），子系统之间不通过外观通信；中介者是**多向**的（同事对象之间通过中介者互相通信） |
| 外观 vs 代理 | 代理与目标是**同一接口**，代理控制访问；外观是**新接口**，聚合并简化 |
| 外观 vs 桥接 | 桥接拆两个维度使其独立变化；外观聚合多个子系统以简化使用 |

## 五、工程中的常见形态

外观模式在架构中最常见的表现就是**分层本身**：

| 层 / 组件 | 作为外观 | 屏蔽了什么 |
|---|---|---|
| Service 层 | 领域服务的外观 | 屏蔽 DAO、缓存、MQ、外部 HTTP 的调用细节 |
| DDD 应用服务（Application Service） | 领域模型的外观 | 屏蔽聚合、领域事件、仓储的编排细节 |
| API 网关 | 后端微服务集群的外观 | 屏蔽服务发现、鉴权、路由、限流细节 |
| BFF（Backend For Frontend） | 多服务的聚合外观 | 屏蔽多服务聚合与字段裁剪 |
| `JdbcTemplate` | JDBC 的外观 | 屏蔽 `Connection`/`Statement`/`ResultSet` 的资源管理与异常转换 |
| SLF4J | 日志框架的外观 | 屏蔽 logback / log4j2 的 API 差异（严格说是"门面 + 适配"的组合） |
| Tomcat `RequestFacade` | 内部 `Request` 的外观 | 屏蔽容器内部方法，防止应用强转后破坏容器 |

> SLF4J 是最贴切的例证：**"日志门面"这个词本身就来自 Facade**。业务只依赖 `org.slf4j.Logger`，底层换实现不需要改代码。

## 六、优缺点

**优点**

1. **降低耦合**：调用方只依赖外观，不依赖子系统家族；
2. **固化正确顺序**：把隐式的调用契约变成显式的代码，减少误用；
3. **提高可读性**：一个业务动作对应一个方法名，代码即文档；
4. 便于替换子系统：只要外观接口不变，内部实现可以整体重构。

**缺点**

1. **容易膨胀成"上帝类"**：所有编排都往外观塞，最后变成一个巨型类——这是外观模式最主要的实践风险；
2. 外观接口可能被迫同时服务多个调用方，导致接口越来越宽（可拆成多个专用外观缓解）；
3. 过度封装会挡住必要的细粒度能力。

> 实践建议：**按"业务用例"而不是"技术功能"划分外观**（`OrderFacade` 而不是 `CommonFacade`），并控制单个外观的方法数量；超过 10 个方法就该考虑拆分了。

## 七、使用场景

- 复杂**下单/退款/审批**等跨多个子系统的业务流程编排；
- 为遗留系统提供**统一入口**，屏蔽其混乱的接口；
- **分层架构**中的 Service / Application Service 层；
- 为第三方提供**精简 SDK**（内部几十个接口，对外只暴露 5 个）；
- **网关 / BFF** 聚合多个下游服务。

## 八、面试问答

**Q1：外观模式的本质是什么？**
**为子系统集合提供一个统一的高层接口，使子系统更易使用。** 它不改变原有接口、不增加新功能，只做聚合与编排。价值在于降低调用方与子系统家族之间的耦合，以及把隐式的调用顺序固化成代码。

**Q2：外观模式会"限制"对子系统的访问吗？**
不会。外观只是提供便捷入口，子系统仍然可以直接访问。若要真正做到"禁止绕过"，需要配合包可见性（如把子系统类设为包级私有）——那是架构约束，不是外观模式本身的职责。

**Q3：外观模式和适配器模式的区别？**
适配器改变**接口形态**（A 接口 → B 接口），面向"不兼容"；外观改变**接口数量**（N 个接口 → 1 个入口），面向"复杂"。适配器是转换，外观是聚合。

**Q4：Service 层算外观模式吗？**
算——它通常是领域/数据访问子系统的外观，向上提供粗粒度的业务用例接口。但要注意：Service 层同时承担了业务逻辑、事务边界等职责，比纯粹的 Facade 更重。**判断标准是有没有"聚合多个子系统并屏蔽其细节"这一动作。**

**Q5：外观模式最大的实践风险是什么？**
演变成**上帝类**。缓解手段：① 按业务用例而不是技术功能划分外观（`OrderFacade`、`RefundFacade`）；② 控制单个外观的方法数量，超过 10 个考虑拆分；③ 把可复用的编排下沉到领域服务，外观只保留与调用场景相关的部分。
