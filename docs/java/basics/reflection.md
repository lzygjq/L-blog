---
date: 2026-09-15
title: 反射：原理、动态代理与代价
sidebar: 反射
desc: 四种拿到 Class 的方式与初始化时机的差异、反射 API 速查、动态代理的两种实现与 Spring AOP 的关系，以及「反射慢十倍」这个结论在 JDK 18 之后该怎么重述
order: 5
---

# 反射：原理、动态代理与代价

反射是**「框架的地基、业务的禁忌」**：你写的每一个 Spring 注解、每一次 MyBatis 的 resultMap 映射、每一个 Jackson 序列化，底层都是反射；但业务代码里出现反射，通常意味着设计有问题。

面试问反射，真正想听的不是 API 列表，而是三件事：**类是怎么被加载和初始化的**、**动态代理为什么必须依赖接口（或继承）**、**「反射慢」这个结论现在还算不算数**。

## 一、反射是什么，什么时候非它不可 {#why-reflection}

**定义**：反射是「**在运行期**检查类、访问字段、调用方法、构造实例的能力」——它把「类」本身也变成了可以操作的对象（`Class` 的实例）。

| 必须用反射的场景 | 为什么没法回避 |
|---|---|
| **IoC 容器** | 运行期才知道要实例化哪个类、要往哪个字段注入依赖（配置/注解决定） |
| **ORM 映射** | 数据库列名与实体字段的对应关系在运行期才读得到，且字段多为 `private` |
| **序列化/反序列化** | 需要遍历对象的全部字段，不依赖任何接口约定 |
| **AOP / 动态代理** | 在运行期生成代理类，方法名与签名来自被代理对象 |
| **测试框架** | JUnit 需要发现并调用测试方法，方法名不固定 |
| **注解驱动的一切** | 注解本身不产生任何行为，必须有人（通常是反射）去「读」它 |

反过来，**下面这些情况下用反射是设计问题**：只是想让代码「更通用」、想绕过访问控制拿私有字段（应该改设计或加公开方法）、想按字符串名字调用自己写的固定方法（应该用接口 + 多态）。

## 二、四种拿到 Class 的方式：差别不在写法，在初始化时机 {#get-class}

```java
Class<?> c1 = User.class;                          // ① 类字面量
Class<?> c2 = new User().getClass();               // ② 已有实例
Class<?> c3 = Class.forName("com.example.User");   // ③ 按全限定名加载
Class<?> c4 = ClassLoader.getSystemClassLoader()
                        .loadClass("com.example.User"); // ④ 通过类加载器
```

四者拿到的是**同一个 `Class` 对象**（同一个类加载器下），但**触发的类加载阶段不同**——这才是考点：

| 方式 | 加载 | 链接 | **初始化（执行静态块与静态赋值）** |
|---|---|---|---|
| `User.class` | —（编译期已确定） | — | **不触发** |
| `obj.getClass()` | 已完成 | 已完成 | 已完成（对象都存在了） |
| `Class.forName("...")` | 是 | 是 | **触发**（等价于 `forName(name, true, loader)`） |
| `ClassLoader.loadClass("...")` | 是 | 是 | **不触发** |

一个能直接观察到的现象：

```java
class Config {
    static { System.out.println("静态块执行"); }
}

Class<?> a = Config.class;                     // 不打印
Class<?> b = ConfigLoader.class.getClassLoader().loadClass("Config");   // 不打印
Class<?> c = Class.forName("Config");          // 打印「静态块执行」
```

**`Class.forName` 的经典用途正是靠这个语义**：JDBC 早期用 `Class.forName("com.mysql.jdbc.Driver")` 加载驱动，就是利用「初始化时执行静态块，静态块里向 `DriverManager` 注册自己」这个副作用。JDBC 4.0 起引入了 SPI（`META-INF/services/java.sql.Driver`）自动发现机制，**现在不再需要写这一行了**——但很多老代码和教程里还有，知道它为什么存在、为什么不必要，是个好答案。

### 顺带讲清「主动引用与被动引用」{#active-passive}

类初始化的触发条件是 JVM 规范定的「主动引用」，六种：`new`、访问静态字段/静态方法、反射调用、初始化子类（父类会先初始化）、作为启动类（`main`）、`MethodHandle` 的基本用法。而三种**被动引用不触发初始化**（高频考点）：

```java
class Parent { static int value = 1; static { System.out.println("Parent init"); } }
class Child extends Parent { static { System.out.println("Child init"); } }

// ① 通过子类访问父类的静态字段：只初始化父类
System.out.println(Child.value);        // 只打印 Parent init

// ② 定义数组：不初始化元素类
Child[] arr = new Child[10];            // 什么都不打印

// ③ 访问编译期常量：常量已在编译期折叠进常量池
class Const { static final String S = "x"; static { System.out.println("Const init"); } }
System.out.println(Const.S);            // 什么都不打印
```

这三条与 [类的加载过程](/java/jvm/classloading) 是同一套机制，放在一起记更牢。

## 三、反射 API 速查 {#api}

### 3.1 获取成员的四个方法对 {#member-api}

**最常写错的是「带 `Declared`」与「不带」的区别**：

| 方法 | 返回范围 | 是否包含继承成员 | 是否包含 `private` |
|---|---|---|---|
| `getMethods()` | 所有**公开**方法 | **是**（含父类、接口默认方法） | 否 |
| `getDeclaredMethods()` | 本类**声明**的方法 | 否 | **是** |
| `getFields()` / `getDeclaredFields()` | 同上规则 | 同上 | 同上 |
| `getConstructors()` / `getDeclaredConstructors()` | 同上规则 | 构造器本来不继承 | 同上 |

所以**访问 `private` 成员必须用 `getDeclaredXxx()`，并且配合 `setAccessible(true)`**：

```java
Class<?> clazz = User.class;

// 构造实例：不要用 Class.newInstance()（JDK 9 起废弃，异常传播语义有问题）
Constructor<?> ctor = clazz.getDeclaredConstructor(String.class);
User user = (User) ctor.newInstance("alice");

// 调用 public 方法
Method getName = clazz.getMethod("getName");
String name = (String) getName.invoke(user);

// 读写 private 字段
Field age = clazz.getDeclaredField("age");
age.setAccessible(true);
age.set(user, 18);
int v = age.getInt(user);
```

**查找方法的参数类型必须精确匹配**：`getMethod("setId", Long.class)` 与 `getMethod("setId", long.class)` 是两个不同的方法。重载或包装类/基本类型混用时，这一步是「为什么明明有这个方法却报 `NoSuchMethodException`」的常见原因。

### 3.2 `setAccessible(true)` 在模块化之后的处境 {#set-accessible}

`setAccessible(true)` 的作用是**关闭访问检查**（跳过一次 `AccessibleObject` 的权限校验，不只是为了「改私有」）。JDK 9 引入模块系统后它开始受限：

| 版本 | 行为 |
|---|---|
| JDK 8 及以前 | 只要有权限，`setAccessible(true)` 几乎总能成功 |
| JDK 9 ~ 15 | 打开 JDK 内部包的深层反射会打警告（`--illegal-access=permit` 是默认值） |
| **JDK 16 起** | **默认拒绝**，尝试打开未 `opens` 的 JDK 内部包会抛 `InaccessibleObjectException` |

报错时的解法是启动参数显式开放，例如：

```bash
--add-opens java.base/java.lang=ALL-UNNAMED
```

这也解释了**为什么很多老框架在 JDK 17 上启动就报错**——它们依赖对 JDK 内部类的反射访问（`sun.misc.Unsafe`、`java.lang.reflect` 内部结构等）。这是「升级 JDK 为什么比想象中麻烦」的主要原因之一，详见 [Java 9~21 演进](/java/basics/java9-21#jpms)。

### 3.3 其余常用 API {#other-api}

| API | 用途 |
|---|---|
| `getModifiers()` + `Modifier.toString()` | 拿到并还原修饰符（`public static final` 这种） |
| `isInterface()` / `isEnum()` / `isArray()` / `isAnnotation()` | 类型判定 |
| `getSuperclass()` / `getInterfaces()` | 类型层次 |
| `getGenericSuperclass()` / `getGenericReturnType()` | 泛型签名（见 [泛型](/java/basics/generics#generic-reflection)） |
| `getAnnotation(X.class)` / `isAnnotationPresent(X.class)` | 读注解（见 [注解](/java/basics/annotation#runtime)） |
| `java.lang.reflect.Array` | 数组的通用操作：`Array.newInstance(componentType, length)`、`Array.get/set/getLength` |
| `Method#isBridge()` / `isSynthetic()` | 过滤编译器生成的桥接方法与合成方法 |

## 四、动态代理：反射最重要的落地 {#dynamic-proxy}

### 4.1 两种实现的路子 {#two-proxies}

| | JDK 动态代理 | CGLIB / 字节码生成 |
|---|---|---|
| 原理 | 运行期生成一个实现了**目标接口**的类（`$Proxy0`） | 运行期生成目标类的**子类**，重写方法 |
| 前提 | **必须有接口** | 类不能是 `final`，方法不能是 `final`/`private` |
| 依赖 | JDK 自带（`java.lang.reflect.Proxy`） | 第三方库（CGLIB / ByteBuddy / ASM） |
| Spring 里的角色 | 目标类**实现了接口**时默认用它 | 目标类**没有接口**时降级用它 |

**为什么「有没有接口」决定了实现方式**，这个因果链要能讲出来：JDK 动态代理生成的类**必须继承 `java.lang.reflect.Proxy`**（这是 JDK 的硬性设计），而 Java 是单继承——既然继承位被 `Proxy` 占了，就只能靠**实现接口**来获得目标类型。没有接口可实现的场景，就只能换一条路：生成目标类的**子类**，用重写来拦截（CGLIB 的做法）。

### 4.2 手写一个 JDK 动态代理 {#jdk-proxy-demo}

```java
interface OrderService {
    void create(String orderId);
}

class OrderServiceImpl implements OrderService {
    @Override public void create(String orderId) { System.out.println("创建订单 " + orderId); }
}

public class ProxyDemo {
    public static void main(String[] args) {
        OrderService target = new OrderServiceImpl();

        OrderService proxy = (OrderService) Proxy.newProxyInstance(
            target.getClass().getClassLoader(),          // 类加载器
            target.getClass().getInterfaces(),           // 要实现的接口列表
            (p, method, params) -> {                     // InvocationHandler
                System.out.println("前置：开启事务 / 记录日志");
                try {
                    return method.invoke(target, params); // 反射调用真实方法
                } catch (InvocationTargetException e) {
                    throw e.getCause();                   // 剥掉反射包装，抛出真实异常
                } finally {
                    System.out.println("后置：提交或回滚");
                }
            });

        proxy.create("A001");
    }
}
```

三个关键点：

1. **`method.invoke(target, params)` 是被代理对象真正执行的地方**，参数是 `Object[]`，返回值是 `Object`——所以有装箱与数组创建开销。JDK 16+ 可以用 `method.invoke(target, params)` 之外的 `MethodHandle` 路径降低开销。
2. **异常会被 `InvocationTargetException` 包一层**。目标方法抛出的异常被封在这个包装异常里，必须 `getCause()` 剥出来再抛，否则调用方看到的异常类型就变了（这是「为什么 AOP 里异常处理看着别扭」的原因）。
3. **代理类看不到**：`$Proxy0` 是运行期生成在内存（JDK 8 有 `sun.misc.ProxyGenerator.saveGeneratedFiles=true` 可落盘查看），调试时在堆栈里会看到 `com.sun.proxy.$Proxy12` 这类名字。

**自调用失效**是这套机制最著名的副作用：`OrderServiceImpl` 内部 `this.otherMethod()` 走的是**原始对象**，不经过代理，因此 `otherMethod` 上的事务/日志注解不生效。解法是注入自身代理、`AopContext.currentProxy()`，或者重构掉自调用。这条与 [Spring AOP](/java/spring/spring-framework/aop/) 里的坑完全对应。

### 4.3 更快的代理：方法句柄与 Lambda 化 {#fast-proxy}

JDK 7 引入的 `MethodHandle`（方法句柄）绕过了反射的访问检查与装箱，在 JIT 能内联的场景下性能接近直接调用。更彻底的做法是 `LambdaMetafactory`——把一次「方法调用」在运行期编译成一个函数式接口实例，之后调用它与调用普通接口方法没有区别：

```java
MethodHandles.Lookup lookup = MethodHandles.lookup();
MethodHandle mh = lookup.findVirtual(OrderService.class, "create",
        MethodType.methodType(void.class, String.class));
mh.invokeExact(impl, "A001");     // 无需拆装箱、可被内联
```

**MyBatis、Jackson、Spring 内部都在往这条路上走**（缓存 `MethodHandle` 或生成函数式包装）。这属于「知道有这条路、知道它解决的问题（访问检查 + 装箱 + 无法内联）、实际项目里优先用现成框架」的层次。

## 五、性能与安全：两个要更新认识的地方 {#cost}

### 5.1 「反射慢十倍」这个结论要重新校准 {#performance}

传统解释（仍然成立的部分）：

| 开销来源 | 说明 |
|---|---|
| 参数装箱与数组创建 | `invoke(Object, Object...)` 每次都要把参数装进 `Object[]`，基本类型要装箱 |
| 访问检查 | 每次调用做权限校验（`setAccessible(true)` 可跳过） |
| **无法内联** | JIT 看不到确定的目标，做不了内联，于是方法调用的固定成本无法消除 |
| 查找开销 | `getMethod`/`getDeclaredField` 每次都遍历并复制成员数组，**这是最容易被忽略、代价最大的一项** |

**而版本现状让这个结论需要修正**：**JDK 18（JEP 416）用方法句柄重新实现了核心反射**（`java.lang.reflect` 的内部调用路径改为走 `MethodHandle`），被 JIT 内联得更充分，反射调用与直接调用的差距明显缩小。所以现在更准确的说法是：

> **少数几次反射调用几乎可以忽略；把反射放进热循环（百万次量级）才会有可测量的差距。**

**正确的优化优先级**（比「不要用反射」这种口号有用得多）：

1. **缓存元数据**：`Method`/`Field`/`Constructor` 只查一次，放进 `static` 或 `ConcurrentHashMap` 缓存——这一条的收益通常超过其他所有优化之和。
2. **`setAccessible(true)`**：跳过访问检查。
3. **换 `MethodHandle` / `VarHandle`**：`VarHandle`（JDK 9+）是字段访问的现代替代，支持原子操作且能被内联。
4. **`LambdaMetafactory`**：把调用点变成函数式接口，之后就是普通虚调用。

### 5.2 反射与安全 {#security}

反射能读取和修改任何字段——这既是能力也是风险面：

- **绕过访问控制**：可以把 `final` 字段改掉、把单例实例替换掉（这也是「反射破坏单例」的原因，枚举单例能防住是因为 `Constructor.newInstance` 对枚举做了特判会直接抛异常）。
- **反序列化利用链**：大量历史漏洞（`commons-collections` 的 `InvokerTransformer` 一类）本质是「借反序列化 + 反射在目标机器上执行任意代码」。**防御要点是不要反序列化不可信数据**，而不是指望反射本身有权限检查。
- **`SecurityManager` 已退场**：JDK 17 起标记为待移除，新代码不要再依赖它做安全边界；JDK 17 起提供了序列化过滤器（`ObjectInputFilter`）用于限制可反序列化的类型。

## 六、常见坑速查 {#pitfalls}

| 坑 | 现象 | 根因 |
|---|---|---|
| `getMethod` 找不到方法 | `NoSuchMethodException` | 用了不带 `Declared` 的版本找不到 `private`；或参数类型写成了包装类/基本类型的另一种 |
| `IllegalAccessException` | 无法访问成员 | 没有 `setAccessible(true)`（JDK 16 前会先弹警告） |
| `InaccessibleObjectException`（JDK 16+） | 反射访问 JDK 内部包失败 | 强封装默认生效，需要 `--add-opens` |
| 用 `Class.newInstance()` | 编译告警、异常传播错乱 | JDK 9 起废弃，应改用 `getDeclaredConstructor().newInstance()` |
| 反射调用后异常类型变了 | 拿到 `InvocationTargetException` | 反射把目标异常包了一层，必须 `getCause()` 剥开 |
| 每次调用都 `getDeclaredMethod` | 热点路径吞吐低 | 元数据查找开销远大于调用本身，**必须缓存** |
| 反射破坏单例 | 出现第二个实例 | `Constructor.newInstance()` 会忽略私有构造器；枚举单例可防 |
| 统计方法数偏多 | 比源码里的方法多 | 编译器生成的桥接方法（`isBridge()`）/合成方法（`isSynthetic()`） |
| 代理方法没生效 | 同类内部调用不走代理 | 自调用走 `this`，不经过代理对象 |
| CGLIB 代理失败 | 启动报错 | 目标类是 `final` 或方法被 `final`/`private` 修饰，无法生成子类 |

## 面试口径

- **反射的定义与定位**：运行期检查类、访问成员、调用方法、构造实例的能力。它是 IoC、ORM、序列化、AOP、测试框架的共同底层；**它和注解是配套的——注解本身不产生行为，必须有人去读它**。
- **四种获取 Class 的差异**：`User.class`（不触发初始化）、`obj.getClass()`（必然已初始化）、`Class.forName(name)`（**触发初始化**，因此能做「静态块注册驱动」那种事）、`ClassLoader.loadClass(name)`（只加载不初始化）。JDBC 4.0 起有 SPI 自动发现，`Class.forName("...Driver")` 已不必要。
- **被动引用的三种情况不触发初始化**：通过子类访问父类静态字段（只初始化父类）、定义数组（`new Child[10]`）、访问编译期常量（已入常量池）。
- **`getDeclaredXxx` vs `getXxx`**：带 `Declared` = 本类声明的全部（含 `private`）、不含继承；不带 = 公开的、含继承。**访问私有成员必须用 `getDeclaredXxx` + `setAccessible(true)`**。
- **`setAccessible(true)` 在 JDK 16 起默认失效**：强封装成为默认行为，打开未 `opens` 的 JDK 内部包会抛 `InaccessibleObjectException`，需 `--add-opens`。这是老框架升级 JDK 17 报错的主因之一。
- **动态代理的两种实现**：JDK 动态代理生成实现了**接口**的类（因为必须继承 `Proxy`，占掉了唯一的继承位，只能靠接口获得类型）；CGLIB 生成目标类的**子类**（所以 `final` 类/方法不行）。Spring 的规则就是「有接口用 JDK，没接口用 CGLIB」。
- **`InvocationHandler` 里必须剥异常**：`method.invoke` 抛出的 `InvocationTargetException` 要 `getCause()` 后重新抛出，否则异常类型被改变。
- **自调用导致注解失效**：内部 `this.method()` 不走代理对象，事务/缓存/日志注解不生效。
- **反射性能的现代表述**：开销来自参数数组与装箱、访问检查、无法内联、以及**元数据查找**（最容易被忽视、代价最大的一项）。**JDK 18（JEP 416）改由方法句柄实现核心反射后，与直接调用的差距明显缩小**——所以「慢十倍」只在热循环里成立。优化顺序是：**缓存元数据 → `setAccessible` → `MethodHandle`/`VarHandle` → `LambdaMetafactory`**。
- **反射的安全面**：能绕过访问控制改 `final`、破坏非枚举单例；大量反序列化 RCE 漏洞的利用链都建立在反射之上。防御靠「不反序列化不可信数据」与序列化过滤器，而不是 `SecurityManager`（JDK 17 起已标记待移除）。
