---
order: 6
date: 2026-09-11
---

# 观察者模式（Observer）

## 一、问题场景

一个对象的状态变化，需要**通知一批互不相关的对象**：

```java
// 用户注册成功后要做一堆事
public void register(User user) {
    userDao.save(user);
    emailService.sendWelcome(user);         // 发欢迎邮件
    couponService.grantNewUserCoupon(user); // 发新人券
    statsService.recordRegister(user);      // 埋点
    crmService.sync(user);                  // 同步 CRM
    // 每加一个下游动作，就要改这个方法
}
```

这段代码的问题：**注册这个动作被下游反应"绑架"了**。发券失败会导致注册失败（如果异常没吞），加一个新动作要改注册代码，且注册逻辑与所有下游强耦合。

观察者的解法：**目标对象只负责维护一个订阅者列表，状态变化时遍历通知，自己不关心谁订阅了、要做什么。**

## 二、结构与角色

```
                ┌──────────────────────────┐
                │      Subject（目标）      │
                │ - observers: List<Obs>   │
                │ + attach(Observer)       │
                │ + detach(Observer)       │
                │ + notifyObservers()      │──── 遍历通知 ────┐
                └──────────────────────────┘                   │
                                                               ▼
                              ┌────────────────────────────────────────┐
                              │           «interface» Observer         │
                              │            + update(event)             │
                              └───────┬──────────────┬─────────────────┘
                              ┌───────┴──────┐ ┌─────┴────────┐ ┌──────┴──────┐
                              │EmailListener │ │CouponListener│ │StatsListener│
                              └──────────────┘ └──────────────┘ └─────────────┘
```

| 角色 | 职责 |
|---|---|
| **Subject / Observable（目标）** | 维护订阅者列表，提供注册/注销，状态变化时通知 |
| **Observer（抽象观察者）** | 定义更新接口 |
| **ConcreteObserver** | 收到通知后的具体反应 |

### 推模型 vs 拉模型

| 模型 | 通知方式 | 优点 | 缺点 |
|---|---|---|---|
| **推（Push）** | 通知时把变更数据一并传入 `update(event)` | 观察者无需再查目标，效率高 | 传什么由目标决定，可能传了不需要的 |
| **拉（Pull）** | 只告知"有变化"，观察者自己回查目标 | 观察者按需取数 | 需要持有目标引用，可能重复查询 |

**实践中主流是推模型**（携带事件对象），因为观察者通常是异步的、目标后续可能已变化，拉模型容易取到脏数据。

## 三、代码实现

### 3.1 手写实现

```java
/** 事件对象：推模型下携带的数据 */
public class RegisterEvent {
    private final User user;
    private final LocalDateTime occurredAt;
    public RegisterEvent(User user) {
        this.user = user;
        this.occurredAt = LocalDateTime.now();
    }
    public User getUser() { return user; }
    public LocalDateTime getOccurredAt() { return occurredAt; }
}
```

```java
public interface UserListener {
    void onRegister(RegisterEvent event);
}
```

```java
public class UserService {
    private final List<UserListener> listeners = new CopyOnWriteArrayList<>();  // 并发安全

    public void addListener(UserListener listener) { listeners.add(listener); }
    public void removeListener(UserListener listener) { listeners.remove(listener); }

    public void register(User user) {
        userDao.save(user);
        RegisterEvent event = new RegisterEvent(user);
        listeners.forEach(l -> {
            try {
                l.onRegister(event);
            } catch (Exception e) {
                log.error("监听器执行失败: {}", l.getClass(), e);   // 必须隔离：一个失败不影响其他
            }
        });
    }
}
```

两个工程要点：① 用 `CopyOnWriteArrayList` 保证遍历时安全的增删；② **必须逐个 try-catch**，否则一个监听器抛异常会中断后续所有通知。

### 3.2 Spring 事件机制

Spring 内置了完整的观察者实现，业务代码只需两处注解：

```java
// 发布者：注入 ApplicationEventPublisher
@Service
public class UserService {
    private final ApplicationEventPublisher publisher;

    public UserService(ApplicationEventPublisher publisher) { this.publisher = publisher; }

    @Transactional
    public void register(User user) {
        userDao.save(user);
        publisher.publishEvent(new UserRegisteredEvent(user));   // 发布事件
    }
}
```

```java
// 订阅者：@EventListener，方法签名决定监听哪些事件
@Component
public class CouponListener {
    @EventListener
    public void onUserRegistered(UserRegisteredEvent event) {
        couponService.grantNewUserCoupon(event.getUser());
    }

    /** 支持 @Async 异步执行（需 @EnableAsync） */
    @Async
    @EventListener
    public void recordStats(UserRegisteredEvent event) {
        statsService.recordRegister(event.getUser());
    }
}
```

### 3.3 `@TransactionalEventListener`——事务边界的正解

这是 Spring 事件机制最实用的一个细节。默认的 `@EventListener` 在 `publishEvent` 那一行**同步立即执行**，此时事务还没提交——如果监听器里查数据库，可能查不到刚插入的数据，或监听到"最终会回滚"的事件。

```java
@Component
public class CouponListener {
    /** 事务提交成功后才执行；若事务回滚则自动丢弃该事件 */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onUserRegistered(UserRegisteredEvent event) {
        couponService.grantNewUserCoupon(event.getUser());
    }
}
```

四个可选阶段：`BEFORE_COMMIT`（可参与当前事务）、`AFTER_COMMIT`（默认值，事务已提交）、`AFTER_ROLLBACK`（回滚后）、`AFTER_COMPLETION`（无论成败）。**跨服务/跨库的副作用必须放在 `AFTER_COMMIT`**，否则会出现"注册事务回滚了但优惠券已经发了"的数据不一致。

## 四、对比辨析

### 4.1 观察者 vs 中介者

| 维度 | 观察者 | 中介者 |
|---|---|---|
| 通信拓扑 | **一对多星形**（目标 → N 个观察者） | **多对多收敛为中心**（各方 ↔ 中介者） |
| 观察者之间是否认识 | 互不认识，也不通信 | 各方只与中介者通信，由中介者协调 |
| 方向 | 单向（目标通知观察者） | 双向（各方都能向中介者发请求） |
| 典型实现 | Spring 事件、Guava EventBus | API 网关、消息总线、MVC 的 Controller |

### 4.2 观察者 vs 发布-订阅（Pub/Sub）

两者思想一致（事件驱动 + 解耦），差别在于**有没有 Broker 这个中间层**：

| 维度 | 观察者 | 发布-订阅 |
|---|---|---|
| 耦合关系 | 目标**直接持有**观察者引用 | 发布者与订阅者**互不持有**，只认识 Broker |
| 进程边界 | 通常同一进程内 | 通常跨进程（MQ、事件总线） |
| 典型载体 | Spring `ApplicationEventPublisher` | RocketMQ / Kafka / Redis Pub/Sub |
| 可靠性 | 无（进程崩溃即丢） | 有（持久化、重试、ACK） |

一句话：**观察者是进程内的发布-订阅，"发布-订阅"是加了一个 Broker 的观察者**（或者是观察者模式在分布式场景的演进形态）。

### 4.3 观察者 vs 责任链

- **观察者**：一个事件广播给**多个**订阅者，每个都收到（多播）；
- **责任链**：一个请求沿链传递，通常**只有一个**最终处理（单播或终止）。

## 五、源码剖析

上一节看的是**它和中介者的拓扑差异**；本节看**Spring 的事件机制到底怎么实现的**。哪些框架用了它，速查表在下一节——这里要回答三个问题：**同步还是异步由谁决定、为什么它比 GoF 观察者多一层、以及 JDK 那个实现为什么被废弃。**

### 5.1 Spring · `multicastEvent()`：同步异步只有一个判断

```java
// 精简自 org.springframework.context.event.SimpleApplicationEventMulticaster
@Override
public void multicastEvent(ApplicationEvent event, @Nullable ResolvableType eventType) {
    ResolvableType type = (eventType != null ? eventType : resolveDefaultEventType(event));
    Executor executor = getTaskExecutor();
    for (ApplicationListener<?> listener : getApplicationListeners(event, type)) {
        if (executor != null) {
            executor.execute(() -> invokeListener(listener, event));   // ① 配了线程池 → 异步
        }
        else {
            invokeListener(listener, event);                          // ② 没配 → 同步
        }
    }
}
```

**结构差异**：这是本节最值得记的一段，因为它澄清了一个高频误解——**`@Async` 与"事件异步"是两套完全不同的机制**：

| 机制 | 配置位置 | 作用范围 |
|---|---|---|
| `@Async` | 监听器方法上的注解 | **只有**该监听器异步 |
| `applicationEventMulticaster` 的 `taskExecutor` | 容器里的 `ApplicationEventMulticaster` Bean | **所有**监听器都异步 |

也就是说：**你以为 `@Async` 生效了，实际可能是广播器本来就配了 Executor；反之给广播器配了 Executor，想让某个监听器同步都做不到。** `multicastEvent()` 里那个 `executor != null` 是唯一的开关。

**第二个坑：同步广播下的异常传播**。`invokeListener()` → `doInvokeListener()` → `listener.onApplicationEvent(event)` 抛出异常时（且没有 ErrorHandler），异常会**向上抛给 `publishEvent` 的调用方**——也就是**业务代码的事务里**。所以同步监听器里抛异常会**回滚发布方的事务**，这个副作用很多人踩过。

### 5.2 Spring · 按类型路由：观察者与发布订阅的真正分界

```java
// 精简自 org.springframework.context.event.AbstractApplicationEventMulticaster
protected Collection<ApplicationListener<?>> getApplicationListeners(
        ApplicationEvent event, ResolvableType eventType) {

    // ... 命中 listenerCache 则直接返回 ...
    for (ApplicationListener<?> listener : listeners) {
        // ③ 用 ResolvableType 判断：这个监听器的泛型参数是不是能接住这个事件
        if (supportsEvent(listener, eventType)) {
            allListeners.add(listener);
        }
    }

    if (allListeners.size() > 1) {
        allListeners.sort(AnnotationAwareOrderComparator.INSTANCE);   // ④ 支持 @Order 排序
    }
    // ...
    return retriever.retrieveApplicationListeners(eventType, allListeners);
}
```

**结构差异**：教科书的观察者模式里，`notify()` 会通知**所有**注册的观察者，是否关心由观察者**自己在 `update()` 里判断**。Spring 在**发布之前**就把不关心的监听器筛掉了——靠 `ResolvableType` 解析监听器的泛型参数：

```java
// 只关心 OrderCreatedEvent 的监听器，不会收到其他事件
@Component
public class OrderEventListener {
    @EventListener
    public void onCreated(OrderCreatedEvent e) { ... }
}
```

**这就是"观察者"与"发布-订阅"的架构分界**：

| 维度 | GoF 观察者 | 发布-订阅（Spring 事件 / 消息队列） |
|---|---|---|
| 发布者是否知道订阅者 | 知道（持有 `List<Observer>`） | 不知道（只投递给广播器/代理） |
| 是否按类型过滤 | **否**，靠观察者自行判断 | **是**，发布前按类型路由 |
| 通知几个 | 全部 | 匹配的那几个 |

教科书上说得含蓄，但源码写得很直白：**`getApplicationListeners(event, type)` 这个"按类型取监听器"的动作，就是发布订阅比观察者多出来的那一层 broker。**

**不懂会误判**：认为"Spring 事件就是观察者模式的实现"。**结构上它用了观察者的注册/通知协议，但语义上它是发布订阅**——发布方不知道订阅方、按类型路由、支持 `@Order` 排序。面试里被问"观察者和发布订阅有什么区别"，用这一层过滤来答最准。

### 5.3 JDK · `java.util.Observable`：三个缺陷与一次语言演进的清算

```java
// 精简自 java.util.Observable（Java 9 起标记 @Deprecated）
@Deprecated(since="9")
public class Observable {
    private boolean changed = false;
    private final Vector<Observer> obs;              // ⑤ 用的是 Vector

    public synchronized void addObserver(Observer o) { ... }

    protected synchronized void setChanged() { changed = true; }   // ⑥ 必须手动调用

    public void notifyObservers(Object arg) {
        Object[] arrLocal;
        synchronized (this) {
            if (!changed) return;                    // ⑦ 忘了 setChanged 就不通知
            arrLocal = obs.toArray();
            clearChanged();
        }
        for (int i = arrLocal.length - 1; i >= 0; i--)                 // ⑧ 倒序通知
            ((Observer) arrLocal[i]).update(this, arg);
    }
}
```

**结构差异**：这是"模式的标准库实现被语言演进淘汰"的教科书案例。它的三个缺陷恰好对应三件后来才有的东西：

| 缺陷 | 后果 | 后来的解法 |
|---|---|---|
| 是**类**不是接口（`extends Observable`） | 占用类唯一的继承位，想同时继承别的类就不可能 | 接口 + 组合 |
| 内部用 **`Vector`** | 每个方法都同步，读写都要抢锁，且 `Vector` 本身已过时 | `CopyOnWriteArrayList` |
| **`update(Observable o, Object arg)` 无泛型** | 参数类型全丢，接收方必须强转，编译期无保护 | 泛型（`ApplicationListener<E>`） |

还有一条设计上的别扭：**`setChanged()` 必须由发布方手动调用**，否则 `notifyObservers()` 直接 `return`。这个"两段式通知"的初衷是让发布方能合并多次变更（改完了再统一通知），但实践中几乎只会带来"忘了调 `setChanged()` 导致事件不发"的 bug。

**不懂会误判**：在面试里答"观察者模式的 JDK 实现是 `Observable`/`Observer`"，会显得知识停留在 Java 8 之前。**正确的答法是：JDK 曾有该实现，Java 9 起废弃，现在应当直接用 Spring 事件或 Guava `EventBus`，并说清废弃的三个原因。** 这比单纯背模式定义更能体现判断力。

## 六、使用场景与面试问答

### 典型场景

| 场景 | Subject | Observer |
|---|---|---|
| Spring 事件 | `ApplicationContext` | `@EventListener` 方法 |
| Guava EventBus | `EventBus` | `@Subscribe` 方法 |
| Spring Cloud Bus | 配置变更广播 | 各服务实例 |
| DDD 领域事件 | `AggregateRoot.publish()` | 领域事件处理器 |
| 前端框架 | 响应式数据（Vue/React） | 依赖该数据的组件 |
| JDK（已废弃） | `java.util.Observable` | `java.util.Observer` |

### 面试问答

**Q1：Spring 的事件机制是怎么实现的？**

`ApplicationContext` 实现了 `ApplicationEventPublisher`，内部维护一个 `ApplicationListener` 集合（在 `refresh()` 的 `initApplicationEventMulticaster()` 中初始化 `SimpleApplicationEventMulticaster`）。`publishEvent` 时，多播器按事件类型匹配所有监听器并逐个调用。`@EventListener` 由 `EventListenerMethodProcessor` 在容器启动时扫描并注册为 `ApplicationListener`。若配置了 `taskExecutor`，多播器会用线程池异步派发。

**Q2：Spring 事件是同步还是异步？**

**默认同步**——`publishEvent` 会阻塞直到所有监听器执行完毕，异常会向上抛（可打断事务）。加 `@Async` 后异步（需 `@EnableAsync`）；也可以给多播器设置 `taskExecutor` 让所有事件统一异步。**注意异步后异常无法反馈给发布者**，必须靠日志和告警兜底。

**Q3：`@EventListener` 和 `@TransactionalEventListener` 的区别？**

前者在 `publishEvent` 处立即执行，此时所在事务可能尚未提交，存在监听器读到"未提交数据"或"事务最终回滚但副作用已发生"的问题。后者绑定事务阶段，默认 `AFTER_COMMIT`，**事务提交成功才触发，回滚则丢弃事件**——这是处理跨库/跨服务副作用的正确姿势。

**Q4：观察者模式的常见坑有哪些？**

① **内存泄漏**——观察者注册后未注销，导致目标持有观察者引用无法回收（尤其长生命周期目标 + 短生命周期观察者）；② **通知风暴**——链式反应（A 变触发 B，B 变触发 C）可能形成循环，需要防止重复通知或加深度限制；③ **异常隔离**——必须逐个 try-catch，否则一个观察者失败导致后续全部收不到通知；④ **顺序不确定**——不要依赖监听器的执行顺序，需要有序时用 `@Order` 显式声明。

**Q5：什么时候不该用观察者？**

如果"触发方"和"响应方"本来就该强耦合、需要同步返回结果（如查询、需要立即校验的流程），用观察者会把简单的调用关系复杂化，还丧失了编译期检查和事务一致性。观察者适合**"发出去就不管了"的副作用**，不适合**"必须成功返回"的调用**。
