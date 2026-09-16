---
date: 2026-09-13
title: ThreadLocal
sidebar: ThreadLocal
order: 8
desc: 没有它会怎样、值到底存在 ThreadLocalMap 里、为什么 key 用弱引用却依然会泄漏、正确用法与 remove 的时机、InheritableThreadLocal 与跨线程传递的坑、典型应用场景
---

# ThreadLocal

前面几篇的思路都是「把共享变量保护起来」，而 `ThreadLocal` 走的是**完全相反**的一条路：**既然共享才会出问题，那就让每个线程各持一份副本、根本不去共享。**

它解决的是「**变量需要跟着线程走**」的问题：同一个变量，在 A 线程里是 A 的值，在 B 线程里是 B 的值，互不干扰。

## 一、没有它会怎样 {#why-threadlocal}

假设要记录「当前请求的用户信息」，最简单的做法是用一个成员变量：

```java
public class UserContext {
    private static User currentUser;         // ❌ 多线程下会被互相覆盖
    public static void set(User u) { currentUser = u; }
    public static User get() { return currentUser; }
}
```

线程 A 设置了用户张三，还没来得及读取，线程 B 就把值改成了李四——A 读到的是李四。**这不是「数据不安全」，而是「数据串线」**：两个本来无关的线程,因为共享了一个变量而互相污染。

如果改用 `ThreadLocal`：

```java
public class UserContext {
    private static final ThreadLocal<User> CURRENT = new ThreadLocal<>();

    public static void set(User u) { CURRENT.set(u); }
    public static User get()      { return CURRENT.get(); }
    public static void clear()    { CURRENT.remove(); }   // ★ 用完一定要清理
}
```

每个线程调用 `set` 时，值被存进**这个线程自己的**一份存储里；别的线程怎么改都影响不到它。这种设计叫**线程封闭（Thread Confinement）**——把变量关在线程内部，是「避免共享」这一大类并发策略的典型代表。

## 二、它到底把值存在哪 {#threadlocal-structure}

一个很常见的误解是「`ThreadLocal` 内部有个 Map，key 是线程」。**恰恰相反**：

```text
每个 Thread 对象内部都有一个 ThreadLocalMap 成员变量（设值后才创建）
        │
        ▼
┌──────────────────── Thread ─────────────────────┐
│  threadLocals : ThreadLocalMap                  │   ← 属于线程，不属于 ThreadLocal
│      ┌──────────────────────────────────┐       │
│      │  Entry[] table                    │       │
│      │    ┌──────────────────────────┐   │       │
│      │    │ key   = ThreadLocal 对象  │ ← 弱引用（WeakReference）
│      │    │ value = 你存进去的值       │ ← 强引用
│      │    └──────────────────────────┘   │       │
│      └──────────────────────────────────┘       │
└─────────────────────────────────────────────────┘
```

- **值的最终归属是「线程」**：`Thread` 持有 `ThreadLocalMap`，所以线程死了、map 就跟着没了。
- **key 是 `ThreadLocal` 实例本身**：所以一个线程可以放多个不同 `ThreadLocal` 的值（各自一行 Entry）。
- **`ThreadLocalMap` 用「开放地址法」解决冲突**（线性探测往后找空位），不是 `HashMap` 那种链表 + 红黑树——因为它的 Entry 数量通常很少。

```java
// 三个 API 的语义
CURRENT.set(user);     // 拿到当前线程的 ThreadLocalMap（没有就创建一个），以 this 为 key 存值
CURRENT.get();         // 用 this 去当前线程的 map 里查
CURRENT.remove();      // 用 this 作为 key 删掉 Entry
```

**注意一点**：`ThreadLocalMap` 是**设置值时**才创建的（`get()` 时如果 map 为空会先 `setInitialValue()`），所以一个从未被使用过的 `ThreadLocal` 不会占用线程的空间。

## 三、为什么用弱引用，又为什么还会泄漏 {#memory-leak}

这是 `ThreadLocal` 最核心的一道题，要分两步回答。

### 为什么 key 要设计成弱引用

`ThreadLocalMap` 的 `Entry` 继承了 `WeakReference<ThreadLocal<?>>`：

```java
static class Entry extends WeakReference<ThreadLocal<?>> {
    Object value;                                  // value 是强引用
    Entry(ThreadLocal<?> k, Object v) {
        super(k);                                  // key 用弱引用持有
        value = v;
    }
}
```

如果 key 用**强引用**，就会形成一条永远不会断的引用链：

```text
Thread（长期存活）→ ThreadLocalMap → Entry → key（ThreadLocal 对象）
```

只要线程活着，这个 `ThreadLocal` 对象就永远回收不掉。改成**弱引用**后，一旦外部不再持有这个 `ThreadLocal`（比如它是个局部变量，方法执行完了），GC 就能把 key 收走，key 变成 `null`。

### 那泄漏是怎么发生的

key 被回收后，`Entry` 依然留在数组里，而 **value 是强引用**：

```text
Entry { key = null,  value = 一个很大的对象 }   ← 这个 Entry 成了「僵尸」
        ↑ 已经被 GC 回收
```

- **普通线程**：线程结束后 `Thread` 对象被回收，`ThreadLocalMap` 连同里面的 value 一起没了，泄漏只是暂时的。
- **线程池**：线程是**复用**的、长期存活，这些 key 为 `null` 的 Entry 会一直挂在 map 上，value 永远回收不掉——**越积越多，最终内存泄漏**。

> 补充一个细节，能体现你真的读过源码：`ThreadLocal` 其实内置了清理动作——`set()` / `get()` / `remove()` 过程中如果探测到 key 为 `null` 的 Entry（`expungeStaleEntry`），会把它清掉。但这个清理是**机会性**的：如果一个 `ThreadLocal` 用完后再也没有任何读写操作发生，那些僵尸 Entry 就永远等不到清理。所以**不能依赖它，必须自己 `remove()`**。

### 比内存泄漏更隐蔽的问题：数据串线

在线程池里，**「脏数据」比「内存泄漏」更容易出事**：

```text
线程池里的线程 T 处理请求 A → ThreadLocal 存了「用户张三」
T 被复用处理请求 B → 如果 B 没重新 set，读到的是张三 ❌
```

这就是「**用线程池时必须 `remove`**」的真正原因——泄漏是慢性的，串线是立刻就被用户看见的（比如 A 的登录信息出现在了 B 的响应里）。

## 四、正确用法 {#threadlocal-usage}

三条规矩：

```java
private static final ThreadLocal<User> CURRENT = new ThreadLocal<>();   // ① static final

public void handle(Request req) {
    CURRENT.set(req.getUser());
    try {
        doBusiness();                       // ② 业务放在 try 里
    } finally {
        CURRENT.remove();                   // ③ finally 里必清理
    }
}
```

| 规矩 | 原因 |
|---|---|
| ① 声明为 `static final` | 每个线程需要的是**同一个 `ThreadLocal` 实例当 key**；如果每次 `new`，同一个线程里会累积多个不同的 key（既查不到又泄漏） |
| ② 业务包在 `try` 里 | 保证异常时也能走到清理逻辑 |
| ③ `finally` 中 `remove()` | 线程池场景下**必须**，否则既泄漏又串线 |

另外，JDK 8 提供了带初始值工厂的写法，省掉一次判空：

```java
ThreadLocal<SimpleDateFormat> FORMATTER =
        ThreadLocal.withInitial(() -> new SimpleDateFormat("yyyy-MM-dd"));
```

## 五、父子线程之间怎么传 {#inheritable}

普通 `ThreadLocal` 是**线程私有**的，主线程设的值，子线程读不到。`InheritableThreadLocal` 让**创建子线程时**把父线程的值复制一份过去：

```java
private static final ThreadLocal<String> TRACE = new InheritableThreadLocal<>();

public static void main(String[] args) {
    TRACE.set("trace-001");
    new Thread(() -> System.out.println(TRACE.get())).start();   // 输出：trace-001
}
```

原理是在 `Thread` 构造时，如果父线程的 `inheritableThreadLocals` 不为空，就复制一份给子线程。

**但它在实际项目里基本不可用**，因为线程池会破坏这个前提：

| 问题 | 说明 |
|---|---|
| 复制只发生在**创建线程的那一刻** | 线程池的线程是**提前创建好、反复复用**的，池里的线程早在业务开始前就建好了，根本拿不到当时的父线程值 |
| 线程复用导致值过期 | 池里线程第一次被谁创建，就永远带着谁的「初始值」 |

正解是使用**阿里开源的 `TransmittableThreadLocal`（TTL）**，它在任务**提交时**捕获当前线程的上下文、在线程池**执行前**回填、执行后清理，从而支持线程池场景。使用时配合 `TtlExecutors.getTtlExecutorService()` 包装线程池即可。

## 六、典型应用 {#threadlocal-scenarios}

`ThreadLocal` 在框架里用得非常多，能说出几个实例，面试会加分很多：

| 场景 | 怎么用 |
|---|---|
| **Spring 事务管理** | `TransactionSynchronizationManager` 用 `ThreadLocal` 保存当前线程绑定的事务资源（`Connection`、`TransactionStatus`），这才能保证「同一个线程里多个 DAO 操作共用同一个连接、处于同一个事务」 |
| **Spring MVC 请求上下文** | `RequestContextHolder` 把 `HttpServletRequest` / `HttpServletResponse` 放进 `ThreadLocal`，所以 controller 里可以随处静态获取 request |
| **Web 层用户上下文** | 拦截器里解析 token → 存进 `UserContext`（`ThreadLocal`），Service 层直接取，避免层层传参 |
| **链路追踪 / 日志** | SLF4J 的 `MDC` 本质上就是一个 `ThreadLocal<Map>`，用来给同一线程的日志打上 `traceId` |
| **非线程安全对象的复用** | `SimpleDateFormat` 不是线程安全的，用 `ThreadLocal` 给每个线程各配一个（空间换安全），比每次 `new` 更省，比加锁更快 |

最后这条其实是 `ThreadLocal` 最通用的套路：**「一个对象不是线程安全的，但每个线程各用一个就很安全，而且创建成本不低」**——这时就该用 `ThreadLocal` 把它变成「线程私有实例」。

```java
// 用 ThreadLocal 包装 SimpleDateFormat，避免每次 new，也避免加锁
private static final ThreadLocal<SimpleDateFormat> FMT =
        ThreadLocal.withInitial(() -> new SimpleDateFormat("yyyy-MM-dd HH:mm:ss"));
```

## 面试口径

- **`ThreadLocal` 是什么**：为每个线程提供一份独立的变量副本，实现**线程封闭**，从而避免共享带来的竞争；同时也实现了「线程内资源共享」（同一线程里随处可取）。
- **数据结构**：每个 `Thread` 内部有一个 `ThreadLocalMap`（**不是 `ThreadLocal` 持有 Map**）；`Entry` 的 key 是 `ThreadLocal` 实例（**弱引用**），value 是强引用；冲突用**开放地址法**（线性探测）解决。
- **为什么内存泄漏**：key 是弱引用，`ThreadLocal` 被回收后 key 变成 `null`，但 value 是强引用、`Entry` 还挂在 map 上；线程池的线程长期存活，这些 value 就永远回收不掉，越积越多。
- **为什么要 `remove()`**：一是防泄漏（清掉僵尸 Entry），二是防**数据串线**——线程复用时读到上一个任务残留的值，这比泄漏更危险。必须放在 `finally` 里。
- **为什么 key 用弱引用**：若为强引用，只要线程活着 `ThreadLocal` 对象就永远回收不掉；弱引用至少让 key 能被回收（虽然 value 仍需手动清理）。
- **父子线程传递**：`InheritableThreadLocal` 只在**创建子线程时**复制值，**在线程池里会失效**；线程池场景要用 `TransmittableThreadLocal`（TTL）。
- **典型应用**：Spring 事务的 `TransactionSynchronizationManager`、`RequestContextHolder`、`MDC` 链路追踪、用户上下文、`SimpleDateFormat` 的线程安全封装。
