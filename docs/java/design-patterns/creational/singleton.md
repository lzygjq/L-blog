# 单例模式（Singleton）

## 一、问题场景

系统里有些对象**只需要一个**：全局配置、线程池、连接池、注册表、缓存管理器。如果每次使用都 `new` 一个，会带来实际问题：

```java
// 反例：每处 new 一个配置读取器，配置被重复加载，且修改无法同步
ConfigReader a = new ConfigReader("config.properties");
ConfigReader b = new ConfigReader("config.properties");
// a 改了内存中的配置，b 看不到
```

更麻烦的是资源类对象——多个线程池实例意味着多份线程，多个连接池实例意味着连接数翻倍，最终压垮数据库。

## 二、结构与角色

单例只有一个角色，靠三条约束保证唯一性：

```
┌─────────────────────────────┐
│        Singleton            │
├─────────────────────────────┤
│ - static instance : Singleton │  ← 静态成员，持有唯一实例
├─────────────────────────────┤
│ - Singleton()               │  ← 构造器私有，禁止外部 new
│ + static getInstance()      │  ← 唯一入口
└─────────────────────────────┘
```

1. **构造器私有**——外部无法 `new`；
2. **静态成员持有实例**——实例生命周期与类绑定；
3. **静态方法对外暴露**——提供唯一访问入口。

## 三、六种写法（按演进顺序）

### 3.1 饿汉式（静态常量）

```java
public class EagerSingleton {
    // 类加载即初始化，由 JVM 保证线程安全
    private static final EagerSingleton INSTANCE = new EagerSingleton();

    private EagerSingleton() {}

    public static EagerSingleton getInstance() {
        return INSTANCE;
    }
}
```

- **优点**：实现最简单，线程安全由 JVM 类加载机制保证，无锁、性能好。
- **缺点**：类加载时就创建实例，**不支持懒加载**。如果这个实例很重（比如要读大文件、建连接），而程序可能根本用不到，就是浪费。

> 变体：把 `new` 放进 `static {}` 静态代码块，效果等同，可用于把异常处理写得更清晰。

### 3.2 懒汉式（线程不安全）—— 反面教材

```java
public class UnsafeLazySingleton {
    private static UnsafeLazySingleton instance;

    private UnsafeLazySingleton() {}

    public static UnsafeLazySingleton getInstance() {
        if (instance == null) {          // 多线程下多个线程同时通过判断
            instance = new UnsafeLazySingleton();   // 会创建出多个实例
        }
        return instance;
    }
}
```

**唯一价值**是让你理解后面为什么需要加锁——**生产中绝不可用**。

### 3.3 懒汉式（同步方法）

```java
public static synchronized LazySingleton getInstance() {
    if (instance == null) {
        instance = new LazySingleton();
    }
    return instance;
}
```

- 线程安全，但**每次调用都加类锁**，即使实例早已创建。高并发场景下这把锁会成为串行瓶颈。

### 3.4 双重检查锁（DCL）+ volatile —— 面试重点

```java
public class DclSingleton {
    // volatile 不可省略，见 3.5 分析
    private static volatile DclSingleton instance;

    private DclSingleton() {}

    public static DclSingleton getInstance() {
        if (instance == null) {                       // 第一次检查：避免走锁，提升性能
            synchronized (DclSingleton.class) {
                if (instance == null) {               // 第二次检查：防止重复创建
                    instance = new DclSingleton();
                }
            }
        }
        return instance;
    }
}
```

**为什么两次检查都不能少？**

- 去掉**第一次**检查 → 退化成 3.3，每次调用都要抢锁。
- 去掉**第二次**检查 → 两个线程同时通过第一次检查，前者释放锁后后者继续进入，仍会创建第二个实例。

### 3.5 为什么 DCL 必须加 volatile

`instance = new DclSingleton();` 这一行在字节码层面是三步：

```
1. memory = allocate()          // 分配内存
2. ctorInstance(memory)         // 在内存上初始化对象
3. instance = memory            // 把引用指向该内存
```

JIT 编译器和 CPU 可能把 **2 和 3 重排序**（因为单线程语义下结果不变）。重排后执行顺序变成 1 → 3 → 2，于是出现：

```
线程 A：1 分配内存 → 3 instance 已非 null → 2 开始初始化（尚未完成）
线程 B：进入 getInstance()，第一次检查发现 instance != null
        → 直接返回一个"非 null 但字段还是默认值"的半成品对象
```

`volatile` 的作用有两点：**禁止该写操作的指令重排**（通过内存屏障），以及**保证可见性**（B 线程能立即看到 A 的写入）。少了它，DCL 就是有缺陷的写法。

> 补充：JDK 5 之后 `volatile` 的语义才被修正（JSR-133），JDK 5 以前用 DCL 是真实存在 bug 的。

### 3.6 静态内部类（推荐）

```java
public class HolderSingleton {
    private HolderSingleton() {}

    // 外部类加载时，静态内部类不会被加载
    private static class Holder {
        private static final HolderSingleton INSTANCE = new HolderSingleton();
    }

    public static HolderSingleton getInstance() {
        return Holder.INSTANCE;      // 第一次调用才触发 Holder 的类加载
    }
}
```

- **懒加载**：`Holder` 只有在 `getInstance()` 被调用时才初始化；
- **线程安全**：JVM 保证类加载过程是同步的，且只会执行一次 `<clinit>`；
- **无锁**：调用路径上没有 `synchronized`，性能与饿汉式相同。

这是**兼顾懒加载、线程安全与性能的最优解**，也是绝大多数场景的首选。

### 3.7 枚举（最安全，Effective Java 推荐）

```java
public enum EnumSingleton {
    INSTANCE;

    public void doSomething() {
        // 业务方法
    }
}
```

- **天然线程安全**：枚举实例由 JVM 保证唯一；
- **天然防反射**：`Constructor.newInstance()` 对枚举类型直接抛 `IllegalArgumentException`；
- **天然防序列化破坏**：枚举的序列化由 JVM 特殊处理，反序列化返回同一实例；
- **代码最短**。

唯一取舍：**不支持懒加载**（枚举常量在类加载时创建），且无法继承其他类（枚举已隐式继承 `Enum`）。Effective Java 的结论是：**单元素的枚举类型是实现单例的最佳方法**。

## 四、六种写法横向对比

| 写法 | 线程安全 | 懒加载 | 性能 | 防反射 | 防序列化 |
|---|---|---|---|---|---|
| 饿汉式 | ✅ | ❌ | 高（无锁） | ❌ | ❌ |
| 懒汉式（不安全） | ❌ | ✅ | 高 | ❌ | ❌ |
| 懒汉式（同步方法） | ✅ | ✅ | 低（全加锁） | ❌ | ❌ |
| DCL + volatile | ✅ | ✅ | 高 | ❌ | ❌ |
| 静态内部类 | ✅ | ✅ | 高 | ❌ | ❌ |
| 枚举 | ✅ | ❌ | 高 | ✅ | ✅ |

**选型建议**：无特殊要求 → **静态内部类**；要求绝对防反射/防序列化，或需要作为序列化载体 → **枚举**；实例很轻且必然用到 → **饿汉式**。

## 五、破坏单例的三种方式与防护

### 5.1 反射攻击

```java
Constructor<DclSingleton> c = DclSingleton.class.getDeclaredConstructor();
c.setAccessible(true);                       // 强行打开私有构造器
DclSingleton evil = c.newInstance();         // 造出第二个实例
```

**防护**：在构造器中加判断，实例已存在就抛异常。

```java
private DclSingleton() {
    if (instance != null) {
        throw new IllegalStateException("单例已被创建，禁止反射构造");
    }
}
```

> 用枚举实现则无需防护——JDK 在 `Constructor.newInstance()` 里直接拦截枚举类型。

### 5.2 序列化攻击

反序列化 `readObject()` 会绕开构造器创建新对象。**防护**：实现 `readResolve()`，返回已有实例。

```java
private Object readResolve() {
    return instance;      // 反序列化时用这个返回值替换新对象
}
```

### 5.3 克隆攻击

若单例类实现了 `Cloneable` 且暴露了 `clone()`，`super.clone()` 会造出新对象。**防护**：不实现 `Cloneable`，或重写 `clone()` 直接返回 `instance`。

## 六、JDK 源码中的单例

`java.lang.Runtime` 是标准的**饿汉式**单例：

```java
public class Runtime {
    private static final Runtime currentRuntime = new Runtime();

    public static Runtime getRuntime() {
        return currentRuntime;
    }

    private Runtime() {}      // 私有构造器
}
```

其他例子：`java.lang.System` 的部分内部实现、`Desktop`、Spring 中默认 `singleton` 作用域的 Bean（注意：**Spring 的单例是"容器内单例"，与 GoF 单例不同**，一个 JVM 里可以有多个容器，各自持有自己的实例）。

## 七、优缺点与使用场景

**优点**：① 严格控制实例数量，节省系统资源；② 提供全局访问点。

**缺点**：① 违反单一职责——既管创建又管业务；② 与调用方形成隐式依赖，不利于单元测试（无法通过 new 注入替身）；③ 无接口无继承，难以扩展；④ 在多线程/分布式环境下容易掩盖并发问题。

**使用场景**（判断标准：**"多实例是否会造成实际危害"**）：

- 配置管理器、全局缓存；
- 线程池、数据库连接池（本质是"池"的载体，通常由框架管理而非手写单例）；
- 日志对象（SLF4J 的 `Logger` 实际是工厂产出，非单例）；
- 设备管理器、驱动对象等独占资源。

> **反面提醒**：单例是"全局状态"的另一种写法。如果只是为了图方便而把工具类改成单例，通常得不偿失。Spring 环境下绝大多数"单例需求"应该交给容器管理（`@Component` 默认单例），而不是手写 `getInstance()`。

## 八、面试问答

**Q1：写一个线程安全的懒加载单例。**
优先答**静态内部类**（无锁、懒加载、实现干净），或 **DCL + volatile**；并主动补一句"如果要求绝对防反射和序列化破坏，用枚举"。

**Q2：DCL 中 volatile 的作用？**
禁止 `new` 对象时"分配内存—初始化—赋值引用"三步的指令重排，避免其他线程读到非 null 但未初始化完成的对象；同时保证可见性。

**Q3：饿汉式和静态内部类都能保证线程安全，区别在哪？**
答：**加载时机**。饿汉式在外部类加载时就创建实例（不支持懒加载）；静态内部类把实例放在嵌套类中，只有首次调用 `getInstance()` 才触发嵌套类初始化，实现懒加载。两者的线程安全都由 JVM 类加载机制保证，因此都不需要同步开销。

**Q4：枚举单例为什么能防反射？**
`Constructor.newInstance()` 源码中对 `clazz.isEnum()` 有显式判断，为真时抛 `IllegalArgumentException: Cannot reflectively create enum objects`。

**Q5：Spring 的 Bean 是单例吗？和这个模式什么关系？**
Spring 默认 `singleton` 作用域指"**每个 IoC 容器内**只创建一个实例"，由容器缓存保证，不是 JVM 级唯一。它复用了单例的思想（控制实例数量 + 统一访问入口），但实现机制是**容器注册表 + 三级缓存**，而不是私有构造器。
