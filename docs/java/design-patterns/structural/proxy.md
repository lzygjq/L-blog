---
order: 1
date: 2026-09-11
---

# 代理模式（Proxy）

## 一、问题场景

有一类逻辑，业务代码**不该关心但必须执行**：日志、权限校验、事务、限流、耗时统计、懒加载。如果把这类代码写进业务方法，会出现两个问题：

```java
public class UserServiceImpl implements UserService {
    public void save(String name) {
        long start = System.currentTimeMillis();      // ① 横切逻辑侵入业务
        if (!currentUser().hasPermission("user:save")) throw new ForbiddenException();
        try {
            System.out.println("保存用户: " + name);   // ② 真正的业务只有这一行
        } finally {
            System.out.println("耗时 " + (System.currentTimeMillis() - start) + "ms");
        }
    }
    // 每个业务方法都要复制这一坨
}
```

代理模式的解法：**在调用方与目标对象之间插入一个代理对象**，横切逻辑放在代理里，业务类保持干净。

另一个场景是**控制访问**——远程对象（RPC 调用本地看起来像本地方法）、开销大的对象（大图懒加载）、需要保护的对象（屏蔽部分方法）。

## 二、结构与角色

```
┌──────────────┐
│   Subject    │  ← 抽象主题：代理与被代理者共同实现的接口
│ + request()  │
└──────┬───────┘
   ┌───┴────┐
┌──┴─────┐ ┌┴───────────┐
│Proxy   │ │RealSubject │
│- target│ │+ request() │  ← 真实主题：业务实现
│+request│ └────────────┘
└────────┘
    │ 持有并调用
    └───────────────▶ RealSubject
```

关键在于**代理与真实主题实现同一个接口**，因此调用方无需感知代理的存在（符合里氏代换）。

## 三、静态代理

```java
public interface UserService {
    void save(String name);
}

public class UserServiceImpl implements UserService {          // 真实主题
    public void save(String name) { System.out.println("保存用户: " + name); }
}

public class UserServiceProxy implements UserService {          // 代理：编译期即存在
    private final UserService target;

    public UserServiceProxy(UserService target) { this.target = target; }

    public void save(String name) {
        long start = System.currentTimeMillis();
        target.save(name);                                     // 调用真实主题
        System.out.println("耗时 " + (System.currentTimeMillis() - start) + "ms");
    }
}
```

**优点**：实现直观，无反射开销。
**致命缺点**：**每个接口都要手写一个代理类**，接口增加方法时代理类也要跟着改。项目里几十个 Service 就要几十个代理类——这也是动态代理出现的直接动因。

## 四、JDK 动态代理

思路：不在编译期写代理类，而是**在运行时按接口"生成"代理类的字节码**。

### 4.1 实现

```java
public class LogHandler implements InvocationHandler {
    private final Object target;                      // 被代理对象

    public LogHandler(Object target) { this.target = target; }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        long start = System.currentTimeMillis();
        System.out.println("调用前: " + method.getName());
        try {
            return method.invoke(target, args);       // 反射调用真实方法
        } finally {
            System.out.println("调用后: " + method.getName()
                    + "，耗时 " + (System.currentTimeMillis() - start) + "ms");
        }
    }
}

// 使用
UserService target = new UserServiceImpl();
UserService proxy = (UserService) Proxy.newProxyInstance(
        target.getClass().getClassLoader(),           // ① 类加载器
        target.getClass().getInterfaces(),            // ② 要实现的接口列表
        new LogHandler(target));                      // ③ 调用处理器
proxy.save("张三");
```

### 4.2 三个参数与生成物

`Proxy.newProxyInstance` 生成的类（约定名 `$Proxy0`）形如：

```java
public final class $Proxy0 extends Proxy implements UserService {
    private static final Method m3;                  // 对应 save 方法

    public $Proxy0(InvocationHandler h) { super(h); }

    @Override
    public final void save(String name) {
        try {
            super.h.invoke(this, m3, new Object[]{name});   // 转交给 InvocationHandler
        } catch (RuntimeException | Error e) {
            throw e;
        } catch (Throwable t) {
            throw new UndeclaredThrowableException(t);
        }
    }
}
```

由此得出两个关键结论：

1. **JDK 动态代理只能代理接口**——生成的类必须 `extends Proxy`，Java 单继承，所以无法再继承目标类。
2. **代理类的方法被 `final` 修饰**，且它继承自 `Proxy`，因此不能再被代理（代理的代理会退化）。

## 五、CGLIB 动态代理

CGLIB（Code Generation Library）走的是另一条路：**生成目标类的子类**，覆写方法并在其中插入增强逻辑。

```java
public class LogMethodInterceptor implements MethodInterceptor {
    @Override
    public Object intercept(Object obj, Method method, Object[] args, MethodProxy proxy)
            throws Throwable {
        System.out.println("before: " + method.getName());
        Object result = proxy.invokeSuper(obj, args);     // 调用父类（即目标类）的实现
        System.out.println("after: " + method.getName());
        return result;
    }
}

Enhancer enhancer = new Enhancer();
enhancer.setSuperclass(UserServiceImpl.class);            // 设父类，不是接口
enhancer.setCallback(new LogMethodInterceptor());
UserServiceImpl proxy = (UserServiceImpl) enhancer.create();
proxy.save("张三");
```

**限制**：无法代理 `final` 类（不能继承）、`final` 方法（不能覆写）、`private` 方法（子类不可见）。

> Spring 4.3 起把 CGLIB 的类从 `net.sf.cglib` 重打包进 `org.springframework.cglib`，避免与用户依赖冲突；Spring Boot 2.x 默认 `spring.aop.proxy-target-class=true`，即**默认优先用 CGLIB**。

## 六、三种代理对比

| 维度 | 静态代理 | JDK 动态代理 | CGLIB 动态代理 |
|---|---|---|---|
| 代理类生成时机 | 编译期（手写） | 运行期（字节码生成） | 运行期（字节码生成） |
| 代理目标 | 接口 | **接口** | **类**（生成子类） |
| 是否要求目标实现接口 | 是 | 是（硬要求） | 否 |
| 无法代理的情况 | — | 无接口的类 | `final` 类/方法、`private` 方法 |
| 性能（调用侧） | 无反射，最快 | JDK 8+ 优化后与 CGLIB 接近 | 首次生成慢，之后调用较快 |
| 依赖 | 无 | JDK 内置 | 需引入 CGLIB（Spring 已内置） |
| 代码量 | 每接口一个类 | 一个 Handler 通吃 | 一个 Interceptor 通吃 |

**选型**：目标有接口 → 优先 JDK（无第三方依赖、更轻）；无接口或需要代理类本身的方法 → CGLIB。Spring AOP 就是按这个规则自动选的。

## 七、源码剖析

| 框架 | 实现 | 说明 |
|---|---|---|
| Spring AOP | `JdkDynamicAopProxy` / `CglibAopProxy` | 按目标是否实现接口自动选择 |
| MyBatis | `MapperProxy` + `MapperProxyFactory` | 用动态代理把"接口方法调用"翻译成 SQL 执行，**这是 Mapper 接口不需要实现类的原因** |
| Spring | `@Transactional`、`@Async`、`@Cacheable` | 本质都是通过代理织入的横切逻辑 |
| Dubbo | `JavassistProxyFactory` / `JdkProxyFactory` | 远程调用在本地表现为代理对象调用 |
| JDK | `Proxy`、`InvocationHandler` | 动态代理的基础设施 |

**一个高频陷阱**：Spring 中**同类内部方法互调不会走代理**（`this.methodB()` 绕过了代理对象），导致 `@Transactional` / `@Async` 失效。原因是调用方拿到的 `this` 是原始对象，不是代理对象（细节见第 7.2 节）。

同族的另外两种失效场景：**`private` / `protected` 方法**（Spring AOP 只拦截 public）、**`final` 类或 `final` 方法**（CGLIB 靠继承生成子类，无法覆写）。绕开第一种的常见手段是 `AopContext.currentProxy()`（需开启 `exposeProxy`）或把方法拆到另一个 bean。

### 7.1 JDK 动态代理为什么必须实现接口

```java
public static Object newProxyInstance(ClassLoader loader, Class<?>[] interfaces, InvocationHandler h) {
    ...
    Class<?> cl = getProxyClass0(loader, intfs);       // 生成或命中缓存
    ...
}

// ProxyClassFactory#apply 里的校验
for (Class<?> intf : interfaces) {
    if (!intf.isInterface()) {
        throw new IllegalArgumentException(intf.getName() + " is not an interface");
    }
    if (!Modifier.isPublic(intf.getModifiers())) {
        // 非 public 接口必须与代理类同包
        ...
    }
}
```

`ProxyGenerator` 生成的代理类反编译后长这样：

```java
public final class $Proxy0 extends Proxy implements Foo {
    private static Method m3;

    public $Proxy0(InvocationHandler h) { super(h); }

    @Override
    public final Object bar() {
        return super.h.invoke(this, m3, null);       // 转发给 InvocationHandler
    }
}
```

**根因在这里：代理类必须 `extends Proxy`**——为了拿到 `h` 字段，以及统一转发 `equals` / `hashCode` / `toString`。而 Java 是单继承，**已经继承了 `Proxy`，就不可能再继承你的目标类**。

所以教科书那句「JDK 动态代理基于接口、CGLIB 基于继承」，真正的成因是**「单继承 + 必须继承 `Proxy`」这个双重约束**，而不是「JDK 做不了类代理」这种能力上的描述。CGLIB 之所以能代理类，是因为它直接改字节码生成子类，**不走 `Proxy` 这条链**。

> 这也顺带解释了「为什么非 public 接口必须和代理类同包」「为什么接口数组里不能有重复」——它们都是「一个类只能带一组 `interfaces`、且可见性必须自洽」这条 JVM 规则的直接后果。

### 7.2 `JdkDynamicAopProxy#invoke`：一个 invoke 装了整条 AOP 链

```java
public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
    ...
    // ① 拿到与当前方法匹配的通知链
    List<Object> chain = this.advised.getInterceptorsAndDynamicInterceptionAdvice(method, targetClass);

    if (chain.isEmpty()) {
        // ② 没有通知：直接反射调用目标方法，不构造调用链
        Object[] argsToUse = AopProxyUtils.adaptArgumentsIfNecessary(method, args);
        retVal = AopUtils.invokeJoinpointUsingReflection(target, method, argsToUse);
    } else {
        // ③ 有通知：构造 ReflectiveMethodInvocation，逐个 proceed
        MethodInvocation invocation =
                new ReflectiveMethodInvocation(proxy, target, method, args, targetClass, chain);
        retVal = invocation.proceed();
    }
    ...
}
```

三点值得注意：

1. **没有通知时短路。** `chain.isEmpty()` 直接反射调用，**不构造 `MethodInvocation`**。所以「被代理的 bean 每次调用都要付调用链的代价」是错的——没配通知就没有这层开销。
2. **`@Transactional` 的事务代码不在这里。** `invoke` 只负责「把调用送进链」；事务的开启 / 提交 / 回滚在链上的 `TransactionInterceptor#invoke` 里，日志在 `LogInterceptor`，安全在 `MethodSecurityInterceptor`。→ **代理负责「入口」，横切逻辑住在拦截器里**，是两个层次各司其职。面试里最容易答错的就是把它混成一句「代理里做了事务」。
3. **拦截器链是按方法缓存的。** `AdvisedSupport` 用 `methodCache`（`ConcurrentHashMap`）缓存「方法 → 通知链」的结果，**只有第一次算**。这也是运行时动态增删通知需要 `freeze()` 配合的原因：缓存一旦建立，改变通知集合就必须让缓存失效。

### 7.3 `MapperProxy#invoke`：为什么 Mapper 接口不需要实现类

```java
public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
    try {
        if (Object.class.equals(method.getDeclaringClass())) {
            return method.invoke(this, args);              // ① equals/hashCode/toString 走本地
        } else {
            return cachedInvoker(method).invoke(proxy, method, args, sqlSession);
        }
    } catch (Throwable t) {
        throw ExceptionUtil.unwrapThrowable(t);
    }
}

private MapperMethodInvoker cachedInvoker(Method method) {
    return methodCache.computeIfAbsent(method, m -> {
        if (m.isDefault()) {                               // ② JDK 8 默认方法走另一条路
            return new DefaultMethodInvoker(getMethodHandleJava9(m));
        } else {
            return new PlainMethodInvoker(
                    new MapperMethod(mapperInterface, method, sqlSession.getConfiguration()));
        }
    });
}
```

**三处与教科书的差异：**

1. **它没有目标对象。** 教科书的代理是「代理 + 被代理对象」成对的；`MapperProxy` 背后并没有一个 `UserMapper` 实例——**它把「接口方法 → SQL 语句」的映射当成了目标**。所以「代理模式背后一定有一个真实对象」这句话是错的，**目标也可以是一份约定**。
2. **`MapperMethod` 是懒解析 + 缓存的。** 每个方法只在第一次调用时解析（`computeIfAbsent`），解析结果（SQL 类型、参数映射、返回类型处理）之后一直复用——**这正是「Mapper 接口零实现类」既可行又不慢的原因**。
3. **`Object` 的三个方法不走代理。** `equals` / `hashCode` / `toString` 直接本地 invoke，否则会出现「拿 Mapper 当 `Map` 的 key 时触发一次 SQL 查询」这种荒谬行为。**自己实现 `InvocationHandler` 时，这三个方法必须单独处理。**

## 八、与装饰者模式的边界

两者都是"实现同一接口 + 持有目标 + 调用前后插入逻辑"，结构几乎一样，区别在**目的**：

| 维度 | 代理 | 装饰者 |
|---|---|---|
| 目的 | **控制访问**（能不能调、何时调、怎么调） | **增强功能**（叠加职责） |
| 是否改变行为语义 | 通常不改变（只包裹） | 会改变（层层累加） |
| 组合方式 | 一对一，通常单层 | 可多层嵌套，调用方决定组合 |
| 谁创建 | 框架/工厂创建，调用方无感 | 调用方显式 `new` 逐层包装 |
| 关注点 | 横切逻辑（事务/日志/鉴权） | 功能扩展（缓存/压缩/加密） |

一句话：**代理是"代你去做"，装饰者是"给你加料"。**

## 九、使用场景

- **横切关注点**：日志、事务、权限、限流、幂等、耗时统计；
- **远程代理**：RPC / 微服务调用的本地替身；
- **虚拟代理**：大对象懒加载（开启代理、图片占位）；
- **保护代理**：按权限屏蔽目标对象的部分方法；
- **智能引用**：引用计数、写时复制。

## 十、面试问答

**Q1：JDK 动态代理和 CGLIB 的区别？**
JDK 基于**接口**，运行时生成 `$Proxy0`（继承 `Proxy` 并实现目标接口），通过 `InvocationHandler` 反射调用；CGLIB 基于**继承**，生成目标类的子类，通过 `MethodInterceptor` 调用 `invokeSuper`。前者要求目标必须有接口，后者不能代理 `final` 类/方法。

**Q2：为什么 JDK 动态代理只能代理接口？**
因为生成的代理类必须 `extends Proxy`（`Proxy` 持有 `InvocationHandler` 并提供 `newProxyInstance`），而 Java 是单继承——已经继承了 `Proxy`，就不能再继承目标类，只能通过实现接口来"看起来像"目标类型。

**Q3：Spring AOP 用哪种代理？**
Spring 4.x 之前：目标实现接口用 JDK，无接口用 CGLIB。Spring Boot 2.x 起默认 `proxy-target-class=true`，即**统一用 CGLIB**。可通过 `@EnableAspectJAutoProxy(proxyTargetClass = false)` 关掉。需要注意：CGLIB 代理下 `@Autowired` 注入的字段类型仍是目标类（子类赋值给父类引用），而 JDK 代理下必须按接口类型注入，否则 `ClassCastException`。

**Q4：为什么 `@Transactional` 会失效？**
最常见三种：① **同类内部方法调用**——`this.methodB()` 不经过代理；② 方法不是 `public`（JDK 代理与 CGLIB 的默认拦截范围限制）；③ 异常类型不在 `rollbackFor` 范围内（默认只回滚 `RuntimeException` 和 `Error`，受检异常不回滚）。第一种的解法是注入自身代理或用 `AopContext.currentProxy()`。

**Q5：MyBatis 的 Mapper 接口没有实现类，为什么能调用？**
`MapperProxyFactory` 用 JDK 动态代理为接口生成代理对象，`MapperProxy.invoke()` 中根据方法签名找到对应的 `MappedStatement`，交给 `SqlSession` 执行 SQL 并把结果映射回对象。所以"Mapper 接口的实现类"其实是运行时生成的代理。

**Q6：静态代理和动态代理怎么选？**
绝大多数场景选动态代理——静态代理的维护成本随接口数量线性增长。只有在"代理逻辑与特定接口强绑定、且没有性能预算"时才考虑静态代理。
