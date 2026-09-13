---
order: 6
date: 2026-09-13
sidebar: 作用域与线程安全
title: Bean 作用域与线程安全
desc: 六种作用域对比、单例线程安全的准确结论、无状态与有状态辨析、四种解法及代价
---

# Bean 作用域与线程安全

## 一、问题场景

一个高频的面试开场题：**「Spring 的单例 Bean 是线程安全的吗？」**

这个问题之所以容易答错，是因为它把两件不相干的事绑在了一起：

- **「单例」说的是实例数量**——容器里只放一个对象；
- **「线程安全」说的是并发访问共享状态**——多个线程同时读写同一块内存会不会出问题。

**容器保证的是前者，对后者不承担任何责任。** 换句话说：Spring 只承诺"给你一个实例"，至于这个实例能否被多线程安全地使用，完全取决于**它内部有没有共享的可变状态**。

理解这一点之后，"Controller 是单例为什么能并发处理请求"「Service 里能不能写成员变量」「`SimpleDateFormat` 为什么不能做成静态字段」这一串问题，就都归到同一条根因上了。

## 二、六种作用域

`@Scope`（或 XML 的 `scope` 属性）决定 Bean 的实例化策略与生命周期边界：

| 作用域 | 实例数量 | 生命周期边界 | 是否线程安全 | 典型用途 |
|---|---|---|---|---|
| **`singleton`**（默认） | 容器内**唯一** | 容器启动到关闭 | **取决于有无状态** | 绝大多数 Bean（Service / DAO / Controller） |
| **`prototype`** | **每次获取都新建** | 交给调用方，**容器不管销毁** | 每次独立，天然隔离 | 有状态且不可共享的对象 |
| `request` | 每个 HTTP 请求一个 | 请求开始到响应结束 | 隔离（请求内单线程为主） | 请求级上下文对象 |
| `session` | 每个会话一个 | 会话创建到失效 | **不安全**（同一会话可能并发） | 用户级上下文 |
| `application` | 每个 `ServletContext` 一个 | 应用生命周期 | 同 `singleton` | Web 应用级共享 |
| `websocket` | 每个 WebSocket 会话一个 | 连接建立到关闭 | 隔离 | WebSocket 会话对象 |

**几处容易混淆的细节：**

**① `singleton` 是"每个容器一个"，不是"每个 JVM 一个"。** 一个 JVM 里可以有多个 `ApplicationContext`（比如父子容器、多数据源各自的容器），每个容器都有自己的一份单例池。

**② `prototype` 的销毁不由容器负责。** 容器只负责创建，`@PreDestroy` / `DisposableBean` **不会**被回调——因为容器不持有它的引用，无从追踪。需要释放资源时得自己在业务代码里管。

**③ `request` / `session` 只在 Web 环境下有效。** 非 Web 容器中声明这两个作用域会直接启动失败（`IllegalStateException: No Scope registered`）。早期用 `RequestContextListener` 注册，Boot 集成 Web 时自动生效。

**④ `request` 作用域注入到单例中，靠的是代理。** 这是"作用域不同却能被注入"的关键机制——单例 Bean 里注入的 `request` 作用域对象，实际是一个**代理**，每次方法调用时才去 `RequestContextHolder` 里查当前线程绑定的真实对象（`ThreadLocal` 承载）。这也解释了为什么在线程池的子线程里访问会拿到错误对象。

## 三、准确结论：单例 Bean 安全吗

**结论：容器不保证线程安全，安不安全取决于 Bean 内部有没有可变状态。**

先看一个反例——这段 Service 是典型的有状态写法：

```java
@Service                                        // 默认 singleton
public class OrderService {
    private int count = 0;                      // ✗ 成员变量，堆上共享
    private List<String> cache = new ArrayList<>();  // ✗ 非线程安全集合，且被共享

    public void create(Order order) {
        count++;                                // ✗ 竞态：多线程下 count++ 不是原子操作
        cache.add(order.getId());               // ✗ ArrayList 并发 add 会丢数据甚至死循环
    }
}
```

再看正确写法——同样的功能，把状态降到方法内部：

```java
@Service
public class OrderService {
    private final OrderDao orderDao;            // ✓ 依赖本身无状态，可安全共享
    private static final Logger log = ...;      // ✓ static final 不可变，安全

    public OrderService(OrderDao orderDao) { this.orderDao = orderDao; }

    public void create(Order order) {
        int count = 0;                          // ✓ 局部变量，随栈帧创建，天然隔离
        List<String> cache = new ArrayList<>();  // ✓ 每次调用新建，不共享
        log.info("创建订单 {}", order.getId());
        orderDao.insert(order);
    }
}
```

### 为什么"无状态"就安全——栈帧隔离

多线程访问同一个对象时，**方法级的数据是隔离的，对象级的数据是共享的**：

```
      堆（全线程共享）                   每个线程各自的栈
┌──────────────────────────┐      ┌────────────────────────┐
│  OrderService 实例         │      │ 线程 1 栈               │
│  ├─ orderDao ────────────┼──┐   │  ├─ 局部变量 count=1    │  ← 各线程各一份
│  ├─ count = 5   ✗ 共享    │  │   │  └─ 局部变量 cache ──┐  │
│  └─ cache ───────────────┼┐ │   ├────────────────────────┤│
└──────────────────────────┘│ │   │ 线程 2 栈               ││
                            │ │   │  ├─ 局部变量 count=1    ││
                            │ │   │  └─ 局部变量 cache ──┐  ││
                            │ │   └────────────────────────┘││
                            │ └─────────────────────────────┘│
                            └────────────────────────────────┘
            同一个实例的方法被并发调用，但各自的局部变量互不可见
```

**"无状态"的定义就是：对象上没有可变字段，所有中间数据都活在方法栈帧里。** 栈帧是线程私有的，所以天然不存在竞态——这正是 Service / DAO / Controller 这些"只有方法、没有可变字段"的 Bean 能安全共享的原因。

> 一个常见疑问：Controller 是单例，多个请求并发打进来不会互相覆盖数据吗？
> 不会。因为请求相关的数据（`HttpServletRequest`、`@RequestBody` 解析出的对象、`@PathVariable` 绑定的值）**全部通过方法参数传入，是局部变量**，而不是 Controller 的字段。这也是[Spring MVC](/java/spring/spring-framework/spring-mvc) 能放心用单例 Controller 处理高并发的前提。

### 判断标准：三步自检

面对一个 Bean，按顺序问三个问题：

```
① 有没有非 final 的成员变量？           —— 没有 → 无状态，安全，不用管
        │ 有
        ▼
② 这些字段是否只在初始化时写入（如 @Value 注入的配置）？ —— 是 → 事实上的不可变，安全
        │ 否，运行期会读写
        ▼
③ 是否被多线程并发访问？                 —— 否（如只在单线程任务中）→ 暂时安全
                                          是 → 必须处理，见下一节
```

**特别注意第 ② 步**：`@Value` 注入的配置项、`@Autowired` 注入的依赖、`final` 集合（如 `Map` 初始化后只读）都属于"事实不可变"，可以放心共享。真正危险的是**运行期会被写入的字段**——计数器、缓存 Map、`StringBuilder` 缓冲区、可变的 DTO 复用对象。

## 四、四种解法与代价

| 解法 | 做法 | 适用场景 | 代价 / 副作用 |
|---|---|---|---|
| **① 改为 `prototype`** | `@Scope("prototype")` | 对象本身有状态且必须共享给调用方 | **开销大**（每次创建 + 依赖注入）；**且注入到单例会失效**（见下） |
| **② `ThreadLocal` 隔离** | 每个字段放进 `ThreadLocal` | 状态需跨方法传递、天然按线程隔离 | **线程池下必须 `remove()`**，否则内存泄漏 + 数据串号 |
| **③ 加锁** | `synchronized` / `ReentrantLock` | 状态必须全局共享（如全局限流计数） | **串行化**，并发度归零；粒度难控，易死锁 |
| **④ 改为方法内局部变量** | 状态降到栈帧 | **绝大多数情况** | 无——这是**推荐的默认答案** |

### 解法 ① 的陷阱：prototype 注入到单例中只创建一次

这是极容易被忽略的一点。**`prototype` 保证的是"每次向容器 `getBean` 时新建"，而不是"每次使用字段时新建"**：

```java
@Service
public class OrderService {
    @Autowired
    private OrderContext context;      // ✗ OrderContext 是 prototype，但注入只发生一次
                                       //   这个字段在整个 OrderService 生命周期内都是同一个对象
}
```

因为**依赖注入发生在 Bean 创建阶段，只执行一次**（见 [Bean 生命周期](/java/spring/spring-framework/ioc-container) 第 ② 步属性填充）。单例 Bean 的属性只被填充一次，此后 `context` 字段永远指向同一个实例——`prototype` 形同虚设。

正确用法是**让容器在每次需要时创建**，三种方式：

```java
// 方式一：ObjectProvider（推荐，延迟获取，Spring 4.3+）
@Service
public class OrderService {
    private final ObjectProvider<OrderContext> contextProvider;

    public OrderService(ObjectProvider<OrderContext> p) { this.contextProvider = p; }

    public void create(Order order) {
        OrderContext ctx = contextProvider.getObject();   // ✓ 每次调用新建
    }
}
```

```java
// 方式二：@Lookup 让 Spring 覆盖方法体（CGLIB 生成子类）
@Component
public abstract class OrderService {
    @Lookup
    protected abstract OrderContext createContext();      // ✓ 每次调用由容器返回新实例
}
```

```java
// 方式三：实现 ApplicationContextAware，手动 getBean（侵入性最强，不推荐）
```

**面试要点**：被问到"`prototype` 能解决线程安全吗"，除了答"能，但开销大"，**补一句"注入到单例里会失效，需要 `ObjectProvider` 或 `@Lookup`"**——这一句能明显拉开区分度。

### 解法 ② 的陷阱：ThreadLocal 在线程池下会串数据

`ThreadLocal` 把状态绑定到线程，看似完美，但在**线程池复用线程**的场景下有两个真实风险：

```java
public class UserContext {
    private static final ThreadLocal<User> CURRENT = new ThreadLocal<>();

    public static void set(User user) { CURRENT.set(user); }
    public static User get() { return CURRENT.get(); }
    // ✗ 缺少 remove()：线程归还池后，User 引用仍挂在 ThreadLocalMap 上
}
```

```
① 请求 A 进来 → 线程 T-1 设置 User(A) → 处理完 → 线程归还池（未清理）
② 请求 B 进来 → 复用线程 T-1 → 若某处漏了 set()，get() 拿到的是 User(A)  ← 数据串号，严重的安全问题
③ 长期累积 → ThreadLocalMap 的 Entry 持有 User → 无法回收                  ← 内存泄漏
```

**两条铁律**：必须在 `finally` 里 `remove()`；能用框架提供的上下文（如 `RequestContextHolder`）就不自己造轮子。`Entry` 的 key 是弱引用（ThreadLocal 对象可被回收）、value 是强引用——这就是经典的 ThreadLocal 内存泄漏成因，详见[并发板块](/java/concurrent/)。

### 解法 ③ 什么时候是对的

加锁通常被认为是"下策"，但有一类场景它确实是正解：**状态必须全局共享且写操作不频繁**。

```java
@Service
public class RateLimitService {
    private final AtomicInteger counter = new AtomicInteger();   // 全局计数，必须共享

    public boolean tryAcquire() {
        return counter.incrementAndGet() <= LIMIT;               // ✓ 用原子类而不是 synchronized
    }
}
```

**这里的正确姿势是用 `java.util.concurrent` 的原子类 / 并发容器，而不是 `synchronized`**：

| 共享状态 | 不要用 | 应该用 |
|---|---|---|
| 计数器 | `int` + `synchronized` | `AtomicInteger` / `LongAdder` |
| 缓存 Map | `HashMap` + `synchronized` | `ConcurrentHashMap` |
| 累加集合 | `ArrayList` + 同步块 | `CopyOnWriteArrayList`（读多写少） |

`LongAdder` 在高并发计数下比 `AtomicInteger` 快得多（分段累加，减少 CAS 冲突）；`ConcurrentHashMap` 用 CAS + 分段锁替代了整表锁。**这类"共享状态"是设计需要，不是设计缺陷**——和④的区别在于：④是"状态本可以不放对象上"，这里是"状态必须在对象上"。

## 五、哪些常见 Bean 其实有状态

面试中常考的"有状态"组件清单——它们的共同点是**把自己的字段当作可变工作区**：

| 组件 | 有状态的原因 | 正确用法 |
|---|---|---|
| **`SimpleDateFormat`** | 内部 `Calendar` 字段在 `format()` 中被改写，**非线程安全** | 用 `DateTimeFormatter`（不可变，线程安全）；或放入 `ThreadLocal` |
| **`StringBuilder`** | 内部可变字符数组 | 方法内局部使用，绝不做成员变量 |
| **`HttpServletRequest`** | 请求级，随请求变化 | 通过方法参数获取，不缓存到字段 |
| **`Model` / `ModelMap`** | 请求级数据容器 | 方法参数传入 |
| **`SqlSession`** | 持有 `Executor` 与事务状态 | 由 `SqlSessionTemplate` 代理管理，见 [MyBatis 集成](/java/spring/spring-framework/mybatis) |
| **`DefaultListableBeanFactory`** | 内部大量 `ConcurrentHashMap` | 框架已做并发控制，业务不直接操作 |

**`SimpleDateFormat` 是最高频的例子**——它有静态实例被共享导致日期错乱的经典事故。JDK 8 之后用 `DateTimeFormatter` 即可彻底规避（它被设计为不可变）。

**一个反向的坑**：`ApplicationContext` 本身是线程安全的（内部用了并发容器 + 双重检查锁），可以放心注入到任何 Bean 中。

## 六、工程规范建议

把上面的分析固化成几条可执行的规范，比背结论更有价值：

| 规范 | 理由 |
|---|---|
| **Service / DAO / Controller 只写 `final` 字段（依赖注入）** | 从根上消灭"有状态"，让线程安全问题不可能发生 |
| **禁止在成员变量中存放请求级数据** | 单例 + 请求数据 = 必然串号，且极难复现 |
| **`ThreadLocal` 一律在 `finally` 中 `remove()`** | 线程池场景下防泄漏与串号 |
| **需要可变状态时优先用 `java.util.concurrent` 组件** | 比自己加锁更安全、性能更好 |
| **`prototype` 注入单例时改用 `ObjectProvider`** | 否则作用域声明无效 |
| **避免静态可变字段（除 `static final` 常量）** | 静态字段跨容器共享，问题范围更大 |

## 七、面试问答

**Q1：Spring 的单例 Bean 是线程安全的吗？**

**容器不保证线程安全。** `singleton` 作用域只保证"容器内只有一个实例"，是否存在并发问题取决于 Bean 有没有可变状态。无状态 Bean（只有方法、没有可变字段，如典型的 Service / DAO）天然安全——因为方法内的局部变量随栈帧创建，是线程私有的；有状态 Bean（如持有可变 `List` / `Map` / 计数器的成员变量）在并发下必然出现竞态。

解法按优先级：**① 改成无状态（状态降到方法内局部变量）——首选；② `ThreadLocal` 隔离（注意 `finally` 中 `remove`）；③ 加锁或改用原子类 / 并发容器；④ 改 `prototype`（开销大，且注入到单例中会失效）。**

**Q2：为什么无状态的 Bean 就是安全的？**

因为多线程并发调用同一个对象的**方法**时，共享的只有**对象的字段**，而方法的局部变量、参数、返回值都存放在**各自线程的虚拟机栈**中，互相不可见。所以只要对象上没有可变字段（"无状态"），无论多少线程并发调用，每次执行都有一份独立的运行时数据，不存在竞态条件。这也是 Spring 默认单例却能扛高并发的根本原因。

**Q3：`@Scope("prototype")` 能解决线程安全吗？有什么坑？**

能解决——每次获取都是新对象，状态不共享。但有两个代价：① **创建开销大**（每次都要实例化 + 依赖注入 + 走一遍生命周期）；② **注入到单例 Bean 中会失效**——依赖注入只在 Bean 创建时执行一次，单例 Bean 的字段此后一直指向同一个 `prototype` 实例。正确做法是用 `ObjectProvider.getObject()` 或 `@Lookup` 在每次使用时向容器要新实例。

**Q4：`ThreadLocal` 解决线程安全问题有什么风险？**

两个风险，都与管理不当有关：① **内存泄漏**——`ThreadLocalMap` 的 Entry 对 value 是强引用，线程池中的线程长期存活，若不 `remove()`，value 无法回收；② **数据串号**——线程归还池后被下一个请求复用，若新请求没有重新 `set()`，`get()` 会读到上一个请求的残留数据，这在用户身份、租户 ID 这类场景下是严重的安全隐患。所以必须用 `try { ... } finally { remove(); }` 包裹。

**Q5：为什么 Spring MVC 的 Controller 是单例，却能并发处理请求？**

因为 Controller 是**无状态**的。所有请求相关的数据——`HttpServletRequest`、`@RequestBody` 反序列化的对象、`@PathVariable` / `@RequestParam` 绑定的值——都是通过**方法参数**传入的，属于局部变量，随每个请求的栈帧独立存在。Controller 的字段通常只有注入的 Service / Mapper 这类无状态依赖，因此多个请求并发执行时不会互相干扰。**前提是绝不要把请求数据写成 Controller 的成员变量**——这是最典型的"单例 + 请求数据"事故来源。

**Q6：`SimpleDateFormat` 为什么不能做静态成员？**

因为它**不是线程安全的**——`format()` 和 `parse()` 内部会改写自己持有的 `Calendar` 字段，多线程并发调用会导致字段状态互相覆盖，输出错乱的日期（甚至抛异常）。三种处理方式：① **改用 JDK 8 的 `DateTimeFormatter`**（不可变、线程安全，首选）；② 放入 `ThreadLocal`；③ 每次使用都 `new`。这一类"内部有可变工作区"的工具类，本质上都是有状态的，不能共享。
