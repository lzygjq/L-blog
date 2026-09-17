---
order: 3
date: 2026-09-11
---

# 责任链模式（Chain of Responsibility）

## 一、问题场景

请求要经过**一系列处理者**，每个处理者做自己的判断，可能处理、可能放行、也可能直接终止：

```java
// 提交报销单前的校验
public void submit(Expense e) {
    if (e.getAmount() == null || e.getAmount().signum() <= 0) throw new BizException("金额非法");
    if (e.getApplicant() == null) throw new BizException("申请人缺失");
    if (e.getAmount().compareTo(limit(e.getApplicant())) > 0 && !hasBudget(e)) throw new BizException("超预算");
    if (isBlacklisted(e.getApplicant())) throw new BizException("申请人被拉黑");
    // ... 后续还有审批人计算、附件校验、事由校验
}
```

这段代码把 N 个不相关的规则塞进一个方法。**加一条规则就要改这个方法**，而且规则的顺序、复用、单测都很难处理。

责任链的解法：**把每个处理逻辑封装成独立节点，节点串成一条链，请求沿链传递，直到被处理或被放行到链尾。**

## 二、结构与角色

```
Client
  │  ① 发起请求
  ▼
┌──────────┐   next   ┌──────────┐   next   ┌──────────┐
│Handler A │─────────▶│Handler B │─────────▶│Handler C │
│ 校验金额 │  ②       │ 校验权限 │  ③       │ 校验预算 │
└──────────┘          └──────────┘          └──────────┘
      │                     │                     │
      │ 可处理：终止        │ 不处理：放行        │ 尾节点：结束
      ▼                     ▼                     ▼
   响应返回              交给 next            响应返回
```

| 角色 | 职责 |
|---|---|
| **Handler（抽象处理者）** | 定义处理接口，持有下一个处理者的引用 |
| **ConcreteHandler** | 实现自己的判断逻辑：能处理就处理，不能处理就转发给 `next` |
| **Client** | 组装链条并触发第一个节点 |

与装饰者的关键区别在于：**责任链的请求可能中途终止，装饰者的请求必然穿过每一层。**

## 三、代码实现

### 3.1 链表式（经典 GoF 写法）

```java
public abstract class Validator {
    protected Validator next;                  // 后继节点

    public Validator setNext(Validator next) {
        this.next = next;
        return next;                            // 返回 next，支持链式组装
    }

    /** 模板方法 + 责任链的组合：先校验自己，再交给下一个 */
    public final void validate(ExpenseContext ctx) {
        doValidate(ctx);
        if (next != null) {
            next.validate(ctx);
        }
    }

    protected abstract void doValidate(ExpenseContext ctx);
}
```

```java
public class AmountValidator extends Validator {
    protected void doValidate(ExpenseContext ctx) {
        BigDecimal amt = ctx.getAmount();
        if (amt == null || amt.signum() <= 0) {
            throw new BizException("报销金额必须大于 0");
        }
    }
}

public class BudgetValidator extends Validator {
    protected void doValidate(ExpenseContext ctx) {
        if (ctx.getAmount().compareTo(ctx.getBudgetLimit()) > 0 && !ctx.hasBudget()) {
            throw new BizException("超出预算额度");
        }
    }
}

public class BlacklistValidator extends Validator {
    protected void doValidate(ExpenseContext ctx) {
        if (BLACKLIST.contains(ctx.getApplicantId())) {
            throw new BizException("申请人已被拉黑");
        }
    }
}
```

组装与调用：

```java
Validator chain = new AmountValidator();
chain.setNext(new BlacklistValidator())
     .setNext(new BudgetValidator());

chain.validate(ctx);      // 依次穿过三个节点
```

### 3.2 数组式（更常见的工程写法）

链表式的缺点是节点不易交给容器管理（每个节点都要手动 `setNext`）。工程中更常用的是**数组式责任链**——所有节点实现同一接口，由容器注入成 `List`，遍历执行：

```java
public interface ExpenseValidator extends Ordered {
    void validate(ExpenseContext ctx);
    @Override default int getOrder() { return 0; }
}

@Component
@Order(10)
public class AmountValidator implements ExpenseValidator { /* ... */ }

@Component
@Order(20)
public class BlacklistValidator implements ExpenseValidator { /* ... */ }

@Service
public class ExpenseService {
    private final List<ExpenseValidator> validators;      // Spring 按 @Order 注入成有序列表

    public ExpenseService(List<ExpenseValidator> validators) {
        this.validators = validators;
    }

    public void submit(ExpenseContext ctx) {
        validators.forEach(v -> v.validate(ctx));          // 顺序执行；任一抛异常即中断
    }
}
```

这种写法的优势：**新增一条规则 = 新增一个带 `@Order` 的 `@Component`，原有代码零改动**，同时天然支持单测（每个校验器可独立测试）。

如果需要"某个节点处理完就终止"，让接口返回 `boolean` 表示是否继续：

```java
public interface Handler<T> {
    /** @return true 继续传递，false 终止链 */
    boolean handle(T context);
}

// 遍历时
for (Handler<Ctx> h : handlers) {
    if (!h.handle(ctx)) break;
}
```

## 四、对比辨析

### 4.1 责任链 vs 装饰者

两者都用"持有下一个对象"的方式串联，但语义完全不同：

| 维度 | 责任链 | 装饰者 |
|---|---|---|
| 请求是否穿过全部节点 | **不一定**，可中途终止 | **必然**穿过每一层 |
| 目的 | 找到**能处理的**节点 | **逐层增强**同一行为 |
| 节点是否互相独立 | 独立，各自判断 | 逐层包裹，后者以前者结果为基础 |
| 节点数量是否固定 | 动态可配 | 按需嵌套 |
| 典型例子 | Servlet Filter、Netty Pipeline | `BufferedInputStream` 装饰链 |

一句话：**责任链是"传下去，直到有人接"，装饰者是"包起来，层层加料"。**

### 4.2 责任链 vs 状态模式

- **责任链**：节点之间**互不认识**，谁处理由请求内容和节点自身的判断决定；
- **状态模式**：每个状态**明确知道**下一个状态是谁，转移关系是写死的。

### 4.3 链表式 vs 数组式

| 维度 | 链表式（`setNext`） | 数组式（`List` 遍历） |
|---|---|---|
| 动态性 | 每个请求可组装不同的链 | 链固定，由容器决定顺序 |
| 容器集成 | 差，手工组装 | 好，`@Order` + 自动注入 |
| 是否支持分支 | 支持（一个节点可有多个后继） | 不支持（线性） |
| 适用 | 需要按请求动态改变处理流程 | 固定的规则/过滤器流水线 |

## 五、源码剖析

上一节看的是**它和装饰者的边界**；本节看**真实的责任链是怎么串起来的**。哪些框架用了它，速查表在下一节——这里只回答一个问题：**教科书里的"节点持有 next 指针"，为什么在框架里普遍变成了"数组 + 下标"。**

### 5.1 Tomcat · `ApplicationFilterChain`：数组下标模拟出的链

```java
// 精简自 org.apache.catalina.core.ApplicationFilterChain
public final class ApplicationFilterChain implements FilterChain {
    private ApplicationFilterConfig[] filters = new ApplicationFilterConfig[0];
    private int pos = 0;                                  // ① 当前执行到第几个 Filter
    private int n = 0;                                    // ② 一共几个 Filter

    @Override
    public void doFilter(ServletRequest request, ServletResponse response) {
        if (Globals.STRICT_SERVLET_COMPLIANCE) {
            request = getRequest(request);                // ③ 包装：防止 Filter 篡改原始请求
            response = getResponse(response);
        }
        internalDoFilter(request, response);
    }

    private void internalDoFilter(ServletRequest request, ServletResponse response) {
        if (pos < n) {
            ApplicationFilterConfig filterConfig = filters[pos++];   // ④ 取下一个并前进
            Filter filter = filterConfig.getFilter();
            filter.doFilter(request, response, this);               // ⑤ 把 this 传回去
            return;
        }
        servlet.service(request, response);                         // ⑥ 链尾才到 Servlet
    }
}
```

**结构差异**：三处与教科书写法不同，且都解决真实问题——

1. **链用数组 + 下标表达**，不是节点指针。每个 `Filter` 收到的是同一个 `FilterChain` 对象（`this`），它调用 `chain.doFilter()` 时由 `pos++` 前进。好处是 Filter 列表**可随时增删/重排**，不必重建链。
2. **"继续"与"终止"是同一行代码的两种结果**：调用 `chain.doFilter()` → 前进；不调用 → 链就地终止。没有 `setNext(null)` 这种显式断链动作。
3. **链尾硬编码了终点**：`pos >= n` 时执行 `servlet.service()`。教科书里链尾通常是 `null` 或空实现，容器版把终点写死——**因为对容器而言，这条链的唯一目的就是把请求送到 Servlet**。

**不懂会误判**：按"节点持有 next"去找 `setNext()`，会找不到，从而怀疑"这不是责任链"。而**判据是"请求能否被中途截断"，不是"有没有 next 字段"**。

### 5.2 Spring MVC · `HandlerExecutionChain`：为了逆序回滚而记录下标

```java
// 精简自 org.springframework.web.servlet.HandlerExecutionChain
public class HandlerExecutionChain {
    private final Object handler;
    private HandlerInterceptor[] interceptors;
    private int interceptorIndex = -1;                    // ⑦ 已成功执行到第几个

    boolean applyPreHandle(HttpServletRequest request, HttpServletResponse response) throws Exception {
        for (int i = 0; i < this.interceptorList.size(); i++) {
            HandlerInterceptor interceptor = this.interceptorList.get(i);
            if (!interceptor.preHandle(request, response, this.handler)) {
                triggerAfterCompletion(request, response, null);   // ⑧ 失败即回调已完成的部分
                return false;
            }
            this.interceptorIndex = i;                    // ⑨ 记住成功位置
        }
        return true;
    }

    void triggerAfterCompletion(HttpServletRequest request, HttpServletResponse response, Exception ex) {
        for (int i = this.interceptorIndex; i >= 0; i--) {         // ⑩ 逆序
            HandlerInterceptor interceptor = this.interceptorList.get(i);
            try {
                interceptor.afterCompletion(request, response, this.handler, ex);
            } catch (Throwable ex2) {
                logger.error("HandlerInterceptor.afterCompletion threw exception", ex2);
            }
        }
    }
}
```

**结构差异**：`interceptorIndex` 是教科书里不存在的角色。它记录「哪些拦截器的 `preHandle` **已经成功**」，好在请求失败时**逆序**回调它们的 `afterCompletion`。

它解决的真实问题：5 个拦截器，第 3 个的 `preHandle` 返回 `false`（比如权限不足）——此时前两个的 `preHandle` 已经执行过（可能已开了资源、写了 `ThreadLocal`），**必须回滚**。用单向链表做不到这点（没有前驱指针），用数组 + 下标，逆序就是一个倒着走的 `for`。

**这解释了为什么真实责任链普遍用数组：责任链的"处理"是正向的，但"清理"往往是逆向的。** 只有支持随机访问的结构才能高效支持逆向清理。

**不懂会误判**：不理解"拦截器需要逆序清理"的人，会把 `afterCompletion` 当成"请求结束后每个拦截器都会被调一次"，于是写出顺序无关的成对逻辑。实际上**没执行过 `preHandle` 的拦截器永远不会收到 `afterCompletion`**，而收到回调的那些，顺序是**从后往前**。

### 5.3 Netty · `ChannelPipeline`：双向链表，因为出站要往回走

```java
// 精简自 io.netty.channel.AbstractChannelHandlerContext（结构示意）
abstract class AbstractChannelHandlerContext implements ChannelHandlerContext {
    volatile AbstractChannelHandlerContext next;
    volatile AbstractChannelHandlerContext prev;      // ⑪ 教科书版不会有这个字段
}
```

**结构差异**：Netty 的 Pipeline 是**双向链表**，因为 handler 分两类，遍历方向相反：

| 方向 | 触发时机 | 遍历顺序 |
|---|---|---|
| **入站**（Inbound，如 `channelRead`） | 数据从 socket 读进来 | head → tail |
| **出站**（Outbound，如 `write` / `flush`） | 应用主动写出 | tail → head |

一次 `write()` 从链尾往链头走，途中经过编码器、压缩器——**方向与入站正好相反**。这让编解码能用同一份 Pipeline 表达：入站 `ByteBuf → 对象`（解码），出站 `对象 → ByteBuf`（编码）。用单链表就只能做一半。

**不懂会误判**：把 Netty Pipeline 当成"Servlet Filter 那样的单向链"，会困惑于"为什么 `addLast` 加的 encoder 能被 `write` 触发"。**遍历方向由语义决定，不由结构决定**——入站与出站是两条相反的链，共用一套节点。

### 5.4 四种实现对着一张表

| 实现 | 链的载体 | 终止方式 | 特殊设计 |
|---|---|---|---|
| 教科书 | 节点持有 `next` | `next == null` | — |
| Tomcat `FilterChain` | **数组 + `pos` 下标** | 不调用 `chain.doFilter()` | 链尾硬编码 Servlet |
| Spring `HandlerExecutionChain` | **List + `interceptorIndex`** | `preHandle` 返回 `false` | 记录下标以支持**逆序**清理 |
| Netty `ChannelPipeline` | **双向链表** | 不调用 `ctx.fireXxx()` | 入站/出站**方向相反**，可动态增删 |
| Sentinel `ProcessorSlotChain` | 单向链（`ProcessorSlot.next`） | slot 内抛异常 | `entry`/`exit` 成对，`exit` **逆序**执行 |

**收束**：三种工程变形都源于同一个压力——**链不仅要能正向传递请求，还要能逆向清理、双向流转**。教科书的 `next` 指针只解决了第一件事。

## 六、使用场景与面试问答

### Web 与框架中的实例

| 位置 | 节点类型 | 终止方式 |
|---|---|---|
| Servlet `Filter` | `FilterChain` | 不调用 `chain.doFilter()` 即中断 |
| Spring MVC `HandlerInterceptor` | `HandlerExecutionChain` | `preHandle` 返回 `false` 中断 |
| Spring Security | `FilterChainProxy` + 一串 Filter | 认证失败直接响应，不再下发 |
| Netty | `ChannelPipeline`（**双向**链表） | 入站/出站两个方向，可动态增删 handler |
| Sentinel | `ProcessorSlotChain` | 各 slot 顺序处理，限流 slot 可抛异常中断 |
| MyBatis 插件 | `InterceptorChain`（`@Intercepts`） | 用动态代理包装 Executor/StatementHandler |

这些实现的共同特征：**都提供了"中断"能力**（Filter 不调 `doFilter`、`preHandle` 返回 false）——这正是责任链区别于装饰者的核心标志。

### 面试问答

**Q1：Filter、Interceptor、AOP 三者有什么区别？**

三者都能做横切逻辑，但所处层次和实现不同：

| 维度 | Filter | Interceptor | AOP |
|---|---|---|---|
| 规范 | Servlet 规范（容器级） | Spring MVC（框架级） | Spring AOP（Spring 容器级） |
| 作用范围 | 所有请求（含静态资源） | 仅 Controller 请求 | 任意 Spring Bean 方法 |
| 能否拿到方法信息 | 不能 | 能（`HandlerMethod`） | 能（`Method` + 参数） |
| 实现机制 | 责任链 | 责任链 | 动态代理 |

执行顺序：**Filter → Interceptor.preHandle → AOP 环绕 → Interceptor.postHandle → Filter**。

**Q2：Netty 的 Pipeline 为什么是双向链表？**

因为网络通信有**入站（inbound，读取数据）**和**出站（outbound，写出数据）**两个方向。入站事件从 head 向 tail 传播，出站事件从 tail 向 head 传播。双向链表让同一个 handler 可以同时处理两个方向，也支持在运行时动态增删节点（如握手完成后移除 `SslHandler`）。

**Q3：责任链如何实现"中断"？**

两种约定：① 返回 `boolean`，`false` 表示终止（数组式）；② 不调用下一个节点（链表式，如 Servlet Filter 不调用 `chain.doFilter()`）。注意**中断后的响应处理**——Filter 中如果没调用 `doFilter` 就直接写响应，必须确保响应完整返回，否则客户端会一直等待。

**Q4：责任链会导致性能问题吗？**

链太长会有多次方法调用开销，但相比业务逻辑本身通常可忽略（纳秒级）。真正的风险是**调试困难**：请求被哪个节点处理的变得不直观。缓解手段是给每个节点打日志/trace（如 Spring Security 的 `FilterChainProxy` 会打印整个链）。

**Q5：业务代码里怎么用责任链？**

典型场景：参数校验链、风控规则链、优惠券叠加计算、审批流转、订单创建的前置检查。推荐用**数组式 + `@Order`**：每个规则独立成 `@Component`，可单独单测、可配置开关、可动态排序，比手写 `if-else` 更易维护。
