---
order: 4
date: 2026-09-11
title: 声明式事务与传播行为
desc: 七种传播行为、REQUIRES_NEW vs NESTED、失效清单十项、事务与连接池
---

# 声明式事务与传播行为

## 一、问题场景

手工管理事务的代码冗长且容易出错：

```java
public void transfer(Long from, Long to, BigDecimal amount) {
    Connection conn = dataSource.getConnection();
    try {
        conn.setAutoCommit(false);
        accountDao.deduct(conn, from, amount);
        accountDao.add(conn, to, amount);
        conn.commit();
    } catch (Exception e) {
        conn.rollback();
        throw e;
    } finally {
        conn.close();                                   // 忘记释放连接 = 连接池泄漏
    }
}
```

问题在于：**事务的开启/提交/回滚是横切逻辑，却被迫写进每个业务方法**。这正是 [AOP](/java/spring/spring-framework/aop/) 的用武之地——`@Transactional` 把这段模板代码抽成切面，业务方法只保留纯业务逻辑。

## 二、实现原理

`@Transactional` 的生效依赖三个组件：

```
@Transactional 标注的方法
        │
        ▼
┌──────────────────────────┐
│  AOP 代理（Bean 初始化时生成）  │
│   拦截到标注了注解的方法        │
        │
        ▼
┌──────────────────────────┐
│  TransactionInterceptor   │  ← MethodInterceptor，事务切面的入口
│  ① 解析 @Transactional 属性   │
│  ② 通过 PlatformTransactionManager 开启事务  │
│  ③ 执行目标方法               │
│  ④ 正常返回 → commit          │
│     抛异常 → 判断是否回滚 → rollback │
└──────────────────────────┘
        │
        ▼
┌──────────────────────────┐
│ PlatformTransactionManager │  ← 策略接口：DataSourceTransactionManager / JpaTransactionManager
└──────────────────────────┘
```

**`PlatformTransactionManager` 是策略模式的应用**：Spring 定义了统一的 `getTransaction` / `commit` / `rollback` 三个方法，具体实现按持久化技术选择。这也解释了为什么切换 ORM 框架时事务代码无需改动。

注解属性的解析优先顺序（**方法级覆盖类级**）：

```
实现类方法上的注解  >  实现类上的注解  >  接口方法上的注解  >  接口上的注解
```

**注意**：如果使用 JDK 动态代理（目标类有接口），Spring 默认只读取接口上的注解。这是"注解写在实现类上却不生效"的一个隐蔽原因——默认 CGLIB 代理模式（Boot 2.x）不存在这个问题。

## 三、七种传播行为

传播行为（Propagation）回答的是：**当前方法被调用时已经存在事务，该怎么办**。

| 传播行为 | 当前无事务 | 当前有事务 | 典型场景 |
|---|---|---|---|
| **`REQUIRED`**（默认） | 新建事务 | **加入**当前事务 | 绝大多数业务方法 |
| **`REQUIRES_NEW`** | 新建事务 | **挂起**当前，另起独立事务 | 日志记录、独立计费（不受外层回滚影响） |
| **`NESTED`** | 新建事务 | 创建**保存点**，外层可整体回滚 | 部分失败可单独回滚的子流程 |
| `SUPPORTS` | **不新建**，无事务运行 | 加入当前事务 | 查询方法（有无事务都能跑） |
| `NOT_SUPPORTED` | 不新建 | **挂起**当前，无事务运行 | 大批量查询（避免长事务占用连接） |
| `MANDATORY` | **抛异常** | 加入当前事务 | 强制要求调用方开启事务 |
| `NEVER` | 不新建 | **抛异常** | 强制禁止在事务中执行 |

### `REQUIRES_NEW` vs `NESTED`——最常被追问的一对

| 维度 | `REQUIRES_NEW` | `NESTED` |
|---|---|---|
| 事务个数 | **两个独立事务**（两个不同的数据库连接） | **同一个事务**，内层是保存点（同一连接） |
| 外层回滚时内层 | **不受影响**（内层已独立提交） | **一起回滚**（保存点随外层回滚） |
| 内层回滚时外层 | 不受影响，可捕获内层异常后继续 | 外层可继续，也可选择整体回滚 |
| 实现方式 | 挂起外层事务，从连接池另取连接 | `Connection.setSavepoint()` |
| 连接池压力 | **大**（内外层各占一个连接，嵌套深时可能耗尽） | 小（同一连接） |
| 数据库要求 | 无 | 需要 JDBC 3.0 保存点支持（MySQL InnoDB 支持） |

**选型判断**：

```
内层失败后外层是否应该一起失败？
  ├─ 不应该（内层是独立业务）→ REQUIRES_NEW
  └─ 应该（内层是外层的一部分，但要能单独标记回滚）→ NESTED
```

**`REQUIRES_NEW` 最典型的场景**是"操作日志"：无论主业务成功还是失败，日志都要落库。**但它有个隐蔽的坑**：内层事务先提交，之后外层才回滚——**如果外层回滚，内层已提交的数据无法撤销**。这会造成数据不一致，因此只适用于"内层数据与主业务无关"的场景（日志、审计），**绝不能用它来"防止主业务失败影响子业务"**。

```java
@Service
public class OrderService {
    @Autowired private LogService logService;

    @Transactional(rollbackFor = Exception.class)          // 外层：REQUIRED
    public void createOrder(Order order) {
        orderDao.insert(order);
        // 即使外层回滚，这条日志也会保留（独立事务）—— 这是期望行为
        logService.record("创建订单: " + order.getId());
        if (someCondition) throw new BizException("业务校验失败");
    }
}

@Service
public class LogService {
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void record(String message) { logDao.insert(message); }
}
```

**注意**：`logService.record()` 必须通过**注入的代理对象**调用（跨 Bean 调用），若在 `OrderService` 内部定义该方法并直接调用，会因 `this` 引用而完全失效（见下一节）。

## 四、隔离级别与回滚规则

### 隔离级别

| 级别 | 脏读 | 不可重复读 | 幻读 |
|---|---|---|---|
| `READ_UNCOMMITTED` | ✓ | ✓ | ✓ |
| `READ_COMMITTED` | ✗ | ✓ | ✓ |
| `REPEATABLE_READ` | ✗ | ✗ | ✓ |
| `SERIALIZABLE` | ✗ | ✗ | ✗ |

**关键实践点**：Spring 的默认隔离级别是 `DEFAULT`，即**跟随数据库**。MySQL InnoDB 默认 `REPEATABLE_READ`，Oracle / PostgreSQL 默认 `READ_COMMITTED`。这意味着**同一份代码在不同数据库上行为可能不同**——涉及并发敏感的统计逻辑时，应显式声明隔离级别，不要依赖默认值。

### 回滚规则（最重要的默认行为）

**Spring 的默认回滚规则：只有 `RuntimeException` 和 `Error` 回滚，受检异常（`Exception` 的非运行时子类）不回滚。**

```java
@Transactional                                    // ✗ 抛 IOException 时数据已提交，不会回滚
public void importData() throws IOException { /* ... */ }

@Transactional(rollbackFor = Exception.class)     // ✓ 显式声明，覆盖所有异常
public void importData() throws IOException { /* ... */ }
```

这个默认值源于 Spring 的设计假设（受检异常代表"可预期的业务状态"，运行时异常代表"程序错误"），但在实际业务中，**业务异常常被定义为受检异常或不继承自 `RuntimeException`**，导致大量"事务没生效"的事故。

**工程建议：所有 `@Transactional` 都显式声明 `rollbackFor = Exception.class`。** 一行成本，消掉一整类隐患。

反向需求也存在——**某些异常不回滚**：

```java
@Transactional(rollbackFor = Exception.class, noRollbackFor = BizWarningException.class)
```

## 五、`@Transactional` 失效的完整清单

这是面试必问、生产必踩的部分。**根因都指向同一件事：事务增强在代理对象里，任何绕过代理的调用都会失效。**

| # | 失效场景 | 根因 | 解法 |
|---|---|---|---|
| 1 | **同类内部方法调用** | `this` 是原始对象，绕过代理 | 拆到另一个 Bean（推荐）/ 注入自身 + `@Lazy` / `AopContext.currentProxy()` |
| 2 | **方法不是 `public`** | CGLIB 无法覆写 `private`；Spring 只对 public 方法生效 | 改为 `public` |
| 3 | **类未被 Spring 管理** | 手动 `new` 的对象没有代理 | 交给容器管理 |
| 4 | **异常被 catch 吞掉** | 事务管理器感知不到异常 | 手动 `setRollbackOnly()` 或重新抛出 |
| 5 | **异常类型不匹配** | 默认只回滚 `RuntimeException` / `Error` | `rollbackFor = Exception.class` |
| 6 | **多线程调用** | 事务上下文在 `ThreadLocal`，新线程无上下文 | 子线程内独立开启事务 |
| 7 | **传播行为设置错误** | `NOT_SUPPORTED` / `NEVER` 会挂起或禁止事务 | 按语义正确设置 |
| 8 | **数据库引擎不支持** | MySQL 的 MyISAM 无事务能力 | 改用 InnoDB |
| 9 | **`final` / `static` 方法** | 无法被代理覆写 | 去掉修饰符 |
| 10 | **只读事务中执行写操作** | `readOnly = true` 下部分驱动会拒绝写 | 修正 `readOnly` 声明 |

### 场景 4 的代码示例——最容易被忽视

```java
@Transactional(rollbackFor = Exception.class)
public void process(Order order) {
    orderDao.insert(order);
    try {
        riskService.check(order);                    // ✗ 异常被吞，事务照常提交
    } catch (Exception e) {
        log.error("风控校验失败", e);                 // 只打日志，没有抛出
    }
}
```

正确做法二选一：

```java
// 方案一：重新抛出（推荐——让事务管理器感知到失败）
try {
    riskService.check(order);
} catch (Exception e) {
    log.error("风控校验失败", e);
    throw e;
}

// 方案二：若业务上确实要"记录失败但整体回滚"
try {
    riskService.check(order);
} catch (Exception e) {
    log.error("风控校验失败", e);
    TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
}
```

### 场景 1 的代码示例

```java
@Service
public class OrderService {
    @Transactional(rollbackFor = Exception.class)
    public void create(Order order) {
        orderDao.insert(order);
        this.doSomething();              // ✗ this 指向原始对象 → 事务失效
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void doSomething() { /* ... */ }
}
```

**最佳解法是把它拆到另一个 Bean**——不仅是技术修复，也让职责边界更清晰；`@Lazy` 注入自身属于技术绕过，`AopContext.currentProxy()` 需要开启 `exposeProxy=true` 且让业务代码依赖 Spring API，侵入性最强。

## 六、事务与连接池

`DataSourceTransactionManager` 获取事务的方式是**从连接池借出一个连接，并在整个事务期间独占它**：

```
事务开始 → 从连接池取出 Connection（绑定到 ThreadLocal）
   │
   ├─ 期间所有 DAO 操作复用这个 Connection
   │
事务结束 → commit/rollback → 归还 Connection 到连接池
```

由此推出几个生产要点：

| 现象 | 原因 | 应对 |
|---|---|---|
| 事务中查询很慢 → 连接池被打满 | 事务内持连接期间执行了**远程调用**（HTTP/RPC），把等待时间算进了事务时长 | **不要在事务内做远程调用**——先查、再远程调用、最后在事务内写 |
| `REQUIRES_NEW` 嵌套后连接池耗尽 | 内外层各占一个连接，嵌套层数 × 并发数可能超过池大小 | 控制嵌套深度，或改用 `NESTED`（共用连接） |
| 长事务导致 `Lock wait timeout` | 事务持锁时间长，阻塞其它事务 | 缩小事务范围、拆分大事务 |
| 连接泄漏 | 手动获取 `Connection` 未归还 | 统一交给 `@Transactional` 管理 |

**核心实践原则：事务要尽可能短、尽可能小。** 事务边界内只放必要的数据库操作，外部调用（缓存、消息、远程接口）放在事务外——**"先做完所有准备工作，再开启事务做写入"** 是更稳的模式。

## 七、面试问答

**Q1：`@Transactional` 的实现原理？**

基于 Spring AOP。容器初始化时，`AbstractAutoProxyCreator` 检测到 Bean 上有 `@Transactional`（或类/方法匹配事务切点），就为其生成代理；方法调用被 `TransactionInterceptor` 拦截，它按注解属性通过 `PlatformTransactionManager` 开启事务、执行目标方法，正常返回则 `commit`，抛异常则按 `rollbackFor` / `noRollbackFor` 规则决定是否 `rollback`。**所以事务生效的前提是"调用经过代理"**——这是所有失效场景的共同根因。

**Q2：`REQUIRES_NEW` 和 `NESTED` 的区别？**

`REQUIRES_NEW` 会**挂起外层事务，另开一个完全独立的事务（另一条数据库连接）**——外层回滚不影响内层（内层已独立提交），内层回滚也不影响外层。`NESTED` 在当前事务内**创建保存点**，共用同一个连接——内层回滚只回滚到保存点，外层可以选择继续或整体回滚；但外层回滚时内层会被一起回滚。

选择依据：内层结果需要独立保留 → `REQUIRES_NEW`；内层只是外层流程的一部分但需要局部回滚能力 → `NESTED`。**注意 `REQUIRES_NEW` 的额外连接开销**，高并发嵌套场景可能耗尽连接池。

**Q3：`@Transactional` 为什么会失效？**

根因是**调用绕过了代理**。典型场景：① 同类内部方法调用（`this` 引用原始对象）——最高频；② 方法非 `public`；③ 类未被 Spring 管理；④ 异常被 `catch` 吞掉导致事务管理器无法感知；⑤ 异常类型不在回滚范围内（**默认只回滚 `RuntimeException` / `Error`**）；⑥ 多线程调用（事务上下文在 `ThreadLocal`）；⑦ 传播行为设为 `NOT_SUPPORTED` / `NEVER`；⑧ 数据库引擎不支持事务。

**Q4：Spring 事务默认回滚哪些异常？**

只回滚 `RuntimeException` 及 `Error`，**受检异常默认不回滚**。这是很多"事务失效"事故的直接原因。解决方式是在注解上显式声明 `rollbackFor = Exception.class`。**建议在建规范时就要求所有 `@Transactional` 都写明 `rollbackFor`**，用一行成本换取确定性。

**Q5：事务方法中能否做远程调用？**

技术上讲可以，但**强烈不建议**。原因：事务期间会独占一个数据库连接，远程调用的耗时（网络延迟、对端超时）全部计入事务时长，直接导致连接持有时间变长、连接池压力上升、数据库锁持有时间延长。正确模式是把远程调用**移到事务外**：

```
① 事务外：查询数据、调用远程服务、准备写入内容
② 事务内：只执行数据库写操作（尽量简短）
③ 事务提交后：发送消息、发通知（用 @TransactionalEventListener(AFTER_COMMIT)）
```

**Q6：只读事务有什么意义？**

`@Transactional(readOnly = true)` 有三层价值：① **语义表达**——明确该方法不应修改数据；② **性能优化**——Hibernate 会跳过脏检查（不保存快照），MySQL 可据此减少部分开销；③ **读写分离路由**——多数据源场景下可据此把查询路由到从库。**注意**：`readOnly = true` 也不能绝对阻止写操作（取决于驱动与 ORM 实现），它更多是"声明 + 优化"，不是强制约束。

**Q7：事务提交后发送消息，怎么保证一致性？**

这是分布式场景的经典问题。`@TransactionalEventListener(phase = AFTER_COMMIT)` 能解决"消息在事务提交后才发送"，但**无法解决"消息发送失败"**（事务已提交，无法回滚）。可靠方案是**本地消息表 + 定时补偿**，或使用支持事务消息的 MQ（如 RocketMQ 事务消息）：

```
① 事务内：业务写操作 + 写一条"待发送"消息记录（同库同事务）
② 事务提交后：尝试发送 MQ 消息
③ 发送成功 → 更新消息记录为"已发送"
④ 定时任务扫描超时未发送的记录 → 重试（消费端需幂等）
```

**注意**：`AFTER_COMMIT` 阶段的异常**不会导致业务事务回滚**（事务已结束），因此这个阶段的操作必须自行处理失败，不能依赖事务保护。
