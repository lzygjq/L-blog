---
order: 3
date: 2026-09-11
title: AOP 与代理机制
desc: JDK 代理 vs CGLIB、代理生成时机、切点表达式、失效根因
---

# AOP 与代理机制

## 一、问题场景

有些逻辑会**横跨多个业务模块**：日志、事务、权限、缓存、限流、重试、耗时统计。它们的特点是：与具体业务无关，但几乎每个方法都要有。

```java
public void createOrder(Order order) {
    log.info("开始创建订单");                              // 横切
    long start = System.currentTimeMillis();              // 横切
    try {
        transactionTemplate.execute(status -> {            // 横切
            orderDao.insert(order);
            stockService.deduct(order);                    // ← 真正的业务只有这两行
            return null;
        });
    } catch (Exception e) {
        log.error("创建订单失败", e);                       // 横切
        throw e;
    } finally {
        log.info("耗时 {}", System.currentTimeMillis() - start);
    }
}
```

把这坨代码复制到每个业务方法里显然不可接受。**AOP（Aspect Oriented Programming，面向切面编程）的解法是：把横切逻辑抽成"切面"，在运行期织入目标方法，业务代码保持纯净。**

## 二、核心概念

| 概念 | 英文 | 含义 |
|---|---|---|
| **切面** | Aspect | 横切逻辑的封装单元（`@Aspect` 标注的类） |
| **连接点** | Join Point | 程序执行中可以插入切面的点（Spring AOP 中**只能是方法调用**） |
| **切点** | Pointcut | 匹配连接点的表达式（"在哪些方法上织入"） |
| **通知** | Advice | 切面在连接点上执行的动作（"织入什么"） |
| **织入** | Weaving | 把切面应用到目标对象的过程 |
| **目标对象** | Target | 被代理的原始对象 |
| **代理对象** | Proxy | 织入切面后生成的替代对象 |

**Spring AOP 与 AspectJ 的关键差异**：Spring AOP 只支持**方法级别的连接点**（靠运行期动态代理实现），AspectJ 支持字段、构造器等更多连接点（靠编译期/类加载期字节码增强）。Spring 借用了 AspectJ 的**注解与切点表达式语法**，但织入机制是自研的动态代理——**这是面试中的常见陷阱题**。

## 三、通知类型与执行顺序

```java
@Aspect
@Component
public class LogAspect {

    @Pointcut("execution(* com.example.service..*.*(..))")
    public void serviceMethods() {}

    @Around("serviceMethods()")                              // 最强：可控制是否执行目标方法
    public Object around(ProceedingJoinPoint pjp) throws Throwable {
        long start = System.currentTimeMillis();
        try {
            return pjp.proceed();                            // 调用目标方法
        } finally {
            System.out.println(pjp.getSignature() + " 耗时 " + (System.currentTimeMillis() - start) + "ms");
        }
    }

    @Before("serviceMethods()")     public void before(JoinPoint jp) { }
    @AfterReturning(pointcut = "serviceMethods()", returning = "result") public void afterReturning(Object result) { }
    @AfterThrowing(pointcut = "serviceMethods()", throwing = "e")        public void afterThrowing(Exception e) { }
    @After("serviceMethods()")      public void after(JoinPoint jp) { }   // 相当于 finally
}
```

**两种顺序模型（重要且常考）**：

```
版本无关的抽象顺序：            @Around 的执行结构：
  @Around                        try {
    @Before          ──────────▶     @Before
    【目标方法】                       result = target();
    @AfterReturning / @AfterThrowing  @AfterReturning
  @After                           } catch (e) {
    @After →  @AfterThrowing         throw;
                                   } finally {
                                     @After
                                   }
```

**Spring 5.3 / Boot 2.4 之后，同一切面内与切面之间的通知顺序都按此模型统一**（`@AfterReturning` 在 `@After` 之前）。此前版本 `@After` 与 `@AfterReturning` 的相对顺序在不同场景下不一致，是升级时容易踩的坑。

多个切面之间的顺序由 `@Order` 决定：**`@Order` 值越小，优先级越高，`@Before` 越早执行、`@After` 越晚执行**（包裹式）。

## 四、代理方式：JDK 动态代理 vs CGLIB

Spring AOP 的底层是两种动态代理技术：

```
                有接口？
  目标对象 ────▶  ├─ 有 ──▶ JDK 动态代理（生成实现同接口的 $Proxy 类）
                 └─ 无 ──▶ CGLIB（生成目标类的子类，覆写方法）
```

| 维度 | JDK 动态代理 | CGLIB |
|---|---|---|
| 实现手段 | 实现目标接口，生成 `$ProxyN` 类 | 继承目标类，生成子类 |
| 前置条件 | **必须实现接口** | 类与方法**不能是 `final`** |
| 生成速度 | 快 | 慢（需生成字节码） |
| 调用速度 | 稍慢（反射调用） | 快（FastClass 索引，接近直接调用） |
| 依赖 | JDK 内置 | 第三方库（Spring 已内嵌 repackage 版本） |
| 能否代理 `private` 方法 | — | **不能**（子类无法访问） |

**Spring Boot 2.x 起默认强制使用 CGLIB**（`spring.aop.proxy-target-class=true`）。原因：① 无需业务类实现接口；② 避免"注入了接口、强转实现类"导致的 `ClassCastException`；③ 对只有一个实现类的场景更直观。代价是无法代理 `final` 类/方法——这也是 Lombok `@Value` 生成的 `final` 类不适合做代理目标的原因。

### 代理是在什么时机创建的

回顾 [Bean 生命周期](/java/spring/spring-framework/ioc-container/)：代理创建于**初始化阶段的后置处理**——`AbstractAutoProxyCreator.postProcessAfterInitialization()`：

```java
// AbstractAutoProxyCreator 核心逻辑（简化）
public Object postProcessAfterInitialization(Object bean, String beanName) {
    if (bean != null) {
        Object cacheKey = getCacheKey(bean.getClass(), beanName);
        if (this.earlyProxyReferences.remove(cacheKey) != bean) {
            return wrapIfNecessary(bean, beanName, cacheKey);   // ← 需要代理则生成并返回代理对象
        }
    }
    return bean;
}
```

**关键结论：放入单例池的是代理对象，不是原始对象。** 理解这一点，才能解释事务、缓存、异步注解失效的各种现象。

## 五、`@Transactional` 失效的根本原因

**代理机制决定了"只有通过代理对象调用，增强逻辑才会生效"**。以下是所有失效场景的完整清单：

```java
@Service
public class OrderService {

    @Transactional
    public void create(Order order) {
        // ① 同类内部调用：this 是原始对象，不是代理 → 事务失效
        this.doSomething();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void doSomething() { /* ... */ }
}
```

| 失效场景 | 原因 | 解法 |
|---|---|---|
| **① 同类内部方法调用** | `this` 引用的是原始对象，绕过代理 | 注入自身（`@Lazy`）、拆到另一个 Bean、用 `AopContext.currentProxy()` |
| **② 方法不是 `public`** | CGLIB 无法覆写 `private`；Spring 只对 public 方法应用事务 | 改为 `public` |
| **③ 类未被 Spring 管理** | 自己 `new` 出来的对象没有代理 | 交给容器管理 |
| **④ 异常被 catch 吞掉** | 事务管理器感知不到异常，无法触发回滚 | 吞掉后手动 `TransactionAspectSupport.currentTransactionStatus().setRollbackOnly()` |
| **⑤ 异常类型不匹配** | **默认只对 `RuntimeException` 和 `Error` 回滚**，受检异常不回滚 | `@Transactional(rollbackFor = Exception.class)` |
| **⑥ 多线程调用** | 事务上下文绑定在 `ThreadLocal`，子线程拿不到 | 子线程内独立开启事务 |
| **⑦ 传播行为不当** | 设为 `NOT_SUPPORTED` / `NEVER` | 按语义正确设置 |
| **⑧ 数据库引擎不支持** | MySQL 的 MyISAM 不支持事务 | 改用 InnoDB |

**其中 ①、⑤ 是面试最高频的两个**。特别是 ⑤——**默认不回滚受检异常**这个默认行为，导致过大量"事务没生效"的生产事故：

```java
@Transactional                                        // ✗ 抛 IOException 不会回滚
public void save() throws IOException { /* ... */ }

@Transactional(rollbackFor = Exception.class)         // ✓ 推荐：显式覆盖所有异常
public void save() throws IOException { /* ... */ }
```

**工程建议：所有 `@Transactional` 都显式写 `rollbackFor = Exception.class`**，一行成本换掉一整类隐患。

## 六、AspectJ 切点表达式

```
execution(修饰符? 返回类型 包.类.方法名(参数类型) throws?)
                    ────   ────── ──────  ────────
                                │      │
              支持 * 通配    支持 .. 表示任意多层包 / 任意参数
```

常用示例：

| 表达式 | 含义 |
|---|---|
| `execution(* com.example.service.*.*(..))` | service 包下所有类的所有方法 |
| `execution(* com.example..*Service.*(..))` | 任意层级包下、以 `Service` 结尾的类 |
| `execution(public * *(..))` | 所有 public 方法 |
| `@annotation(org.springframework.transaction.annotation.Transactional)` | 标了该注解的方法 |
| `within(com.example.service..*)` | 包内所有类型的所有方法（比 `execution` 更粗） |
| `@within(org.springframework.stereotype.Service)` | 标了 `@Service` 的类中所有方法 |
| `args(java.lang.String)` | 参数为单个 String 的方法 |

**性能提醒**：切点匹配在 Bean 初始化时执行一次（判断是否需要代理），不会在每次调用时重新解析——所以表达式复杂度对运行期性能影响很小，但对**启动时间**有影响。大项目中应尽量缩小切点范围（避免 `execution(* *(..))` 这类全匹配）。

## 七、AOP 在框架中的应用

| 框架能力 | 切面实现 |
|---|---|
| `@Transactional` | `TransactionInterceptor`（`MethodInterceptor`） |
| `@Cacheable` / `@CacheEvict` | `CacheInterceptor` |
| `@Async` | `AsyncExecutionInterceptor` |
| `@PreAuthorize` | `AuthorizationManagerBeforeMethodInterceptor` |
| `@Retryable`（Spring Retry） | `RetryOperationsInterceptor` |
| `@Validated` 参数校验 | `MethodValidationInterceptor` |
| MyBatis Mapper 接口 | `MapperProxy`（JDK 动态代理，非切面） |

**`@Async` 与 `@Transactional` 组合的经典坑**：两者都靠代理生效，若在同一方法上同时使用，**事务上下文不会传播到异步线程**（`ThreadLocal` 不同线程），异步方法内需要独立的事务。若真需要"提交后再异步执行"，正确做法是用 `@TransactionalEventListener(phase = AFTER_COMMIT)`。

## 八、面试问答

**Q1：Spring AOP 和 AspectJ 的区别？**

**织入时机与能力范围都不同**。Spring AOP 是运行期动态代理，只支持方法级连接点，只能增强 Spring 管理的 Bean；AspectJ 是编译期/类加载期字节码增强，支持字段访问、构造器、静态初始化等更细粒度的连接点，可增强任意对象。Spring 复用了 AspectJ 的**注解与切点表达式语法**（`@Aspect`、`execution()` 都来自 AspectJ），但织入是自研的——**别把两者的织入机制混为一谈**。

**Q2：JDK 动态代理和 CGLIB 怎么选？**

Spring 的默认策略是"目标类实现了接口就用 JDK 代理，否则用 CGLIB"；Spring Boot 2.x 起默认强制 CGLIB（`proxy-target-class=true`）。选型考虑：**CGLIB 无需接口、调用更快，但无法代理 `final` 类/方法/`private` 方法；JDK 代理只依赖接口，但要求必须声明接口。** 如果项目里有大量面向接口编程的代码且不介意多一层间接，JDK 代理足够；否则用 CGLIB 更省心。

**Q3：为什么同类内部调用会导致 `@Transactional` 失效？**

因为**事务增强逻辑在代理对象里，而内部调用用的是 `this`（原始对象）**，请求根本没经过代理。三种解法：① 把方法拆到另一个 Bean（最干净，推荐）；② 注入自身（`@Autowired @Lazy private OrderService self;` 然后调 `self.doSomething()`），注意需要 `@Lazy` 避免循环依赖；③ `AopContext.currentProxy()`（需开 `exposeProxy=true`，侵入性强，不推荐）。

**Q4：Spring AOP 能代理 `private` 方法吗？**

不能。CGLIB 通过**继承并覆写**实现代理，`private` 方法不可见也不可覆写；`final` 方法同样无法覆写。`static` 方法也不在代理范围内（属于类而非实例）。**这是 AOP 的固有边界，不是配置问题。**

**Q5：`@Around` 和 `@Before` 有什么区别？**

`@Before` 只能在目标方法前执行一段逻辑，**无法阻止方法执行、无法获取返回值、无法捕获异常**；`@Around` 拿到 `ProceedingJoinPoint`，可以决定是否调用 `proceed()`（等于决定目标方法是否执行）、可以修改入参、可以改写返回值、可以吞掉异常并返回降级结果。**只有 `@Around` 具备"改变流程"的能力**，其余通知类型都是观察性的。代价是 `@Around` 必须自己处理返回值与异常，写错容易导致返回值丢失（忘记 `return pjp.proceed()`）或异常被吞。

**Q6：多个切面的执行顺序如何控制？**

用 `@Order`（或实现 `Ordered` / `@Priority`）。数值越小优先级越高，其 `@Before` 越早执行、`@After` 越晚执行（包裹结构）。**未指定 `@Order` 时顺序不确定**（取决于 Bean 注册顺序，不可依赖）——生产代码中涉及多个切面叠加（如事务 + 日志 + 限流）时应显式声明顺序，否则会出现"限流在事务内还是事务外"这类难以排查的问题。
