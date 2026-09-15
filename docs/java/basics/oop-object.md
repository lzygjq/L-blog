---
date: 2026-09-15
title: 面向对象与 Object 契约
sidebar: 面向对象与 Object
desc: 多态在 JVM 里的落地方式、Object 的 11 个方法、equals 与 hashCode 的契约、clone 与深浅拷贝，以及面试里最容易被追问倒的那几个基础点
order: 1
---

# 面向对象与 Object 契约

「Java 基础」这块内容之所以放在最前面，不是因为它简单，而是因为**它是所有上层知识的解释层**：`HashMap` 为什么要求 key 重写 `hashCode`、Spring 的 Bean 为什么要能覆盖 `equals`、Lombok 生成的 `equals` 为什么有坑——这些问题往回追一步，全都落在这一篇里。

## 一、封装、继承、多态：三个词背后是三件不同的事 {#three-pillars}

| 特性 | 解决的问题 | Java 里的落地手段 | 代价 |
|---|---|---|---|
| **封装** | 把「能改的状态」和「允许的改法」绑在一起 | 访问修饰符、getter/setter、不可变对象 | 样板代码多；写成「每个字段一对 getter/setter」等于没封装 |
| **继承** | 复用父类的实现与约定 | `extends`、`protected`、抽象类 | **耦合**：父类一改，所有子类跟着受影响（著名的「脆弱基类」问题） |
| **多态** | 让调用方只依赖抽象，运行时才决定走哪个实现 | 方法重写 + 动态分派；接口/抽象类 | 排查时「这行代码到底跑进了哪个实现」需要工具辅助 |

一句话区分：**封装管「能不能碰」，继承管「能不能复用」，多态管「调谁」**。

现代 Java 的实践倾向是：**组合优先于继承、接口优先于抽象类**。原因见下面这张辨析表——面试里问「为什么不推荐继承」时，答的就是它：

| 需求 | 用继承 | 用组合 |
|---|---|---|
| 复用实现 | 子类直接拿到父类方法，但也被父类的方法语义绑住 | 持有对方实例，只调用自己需要的方法 |
| 修改父类 | 有破坏子类的风险（子类可能依赖了父类实现细节） | 只要接口不变就互不影响 |
| 运行时替换行为 | 继承关系编译期固定，换不了 | 换一个实现注入进去即可 |
| 访问父类内部 | `protected` 全部可见，封装被削弱 | 只暴露对方对外承诺的接口 |

## 二、多态是怎么落地的：静态分派与动态分派 {#how-polymorphism-works}

「重载（Overload）看编译期、重写（Override）看运行期」这句话大家都背过，但能说清**为什么**的人不多。要解释清楚，必须引入 JVM 的两条调用指令链路。

**静态分派（编译期确定）**：编译器根据**变量的静态类型**（声明类型）和**方法参数**选出唯一一个方法，编译进字节码。重载走的就是这条路——所以下面这段代码打印的是 `Animal` 版本：

```java
class Animal {}
class Dog extends Animal {}

public class Dispatch {
    void feed(Animal a) { System.out.println("feed animal"); }
    void feed(Dog d)    { System.out.println("feed dog"); }

    public static void main(String[] args) {
        Animal a = new Dog();
        new Dispatch().feed(a);   // 打印 feed animal —— 编译期按 Animal 选中
    }
}
```

**动态分派（运行期确定）**：重写走的是这条。字节码里是 `invokevirtual`（实例方法）/ `invokeinterface`（接口方法），JVM 在运行时根据**对象的实际类型**去查方法表。

| 指令 | 用在哪 | 分派方式 |
|---|---|---|
| `invokestatic` | 静态方法 | 编译期确定 |
| `invokespecial` | 构造器、`private` 方法、`super.xxx()` | 编译期确定 |
| `invokevirtual` | 普通实例方法 | **运行期**，查虚方法表 |
| `invokeinterface` | 接口方法 | **运行期**，查接口方法表 |
| `invokedynamic` | Lambda、字符串拼接（JDK 9+） | 首次调用时链接，之后直连 |

**虚方法表（vtable）**：每个类在方法区（JDK 8 后的元空间）里都有一张表，记录「方法签名 → 实际入口地址」。子类重写某方法时，就把表里那一格替换成自己的入口；没重写就沿用父类的那一格。所以「根据实际类型找方法」实际上是一次**数组下标寻址**，非常快——多态的代价不在这里，而在**内联（inlining）**：JIT 只有在能确定调用目标单一（单态）时才敢内联，多态调用点会退化成类型检查 + 跳转。

由此引出两个高频追问：

- **构造器里调用可被子类重写的方法，会怎样？** 父类构造器先执行，此时子类字段还是默认值（`0`/`false`/`null`），但方法已经被动态分派到子类版本——子类方法读到的是「没初始化完的字段」。这是实际会踩的坑，不是理论问题。
- **`private` 方法、静态方法、`final` 方法能被重写吗？** 不能。前两个用 `invokespecial`/`invokestatic`，压根不走虚方法表；`final` 方法编译器/运行期都不允许覆盖。所以「子类里定义一个同名 `private` 方法」不是重写，是**两个不相干的方法**，`@Override` 会直接编译报错。

## 三、Object 的 11 个方法 {#object-methods}

`java.lang.Object` 是所有类的根，它一共提供了 11 个可继承的方法（另有 1 个私有的 `registerNatives()`）。把它们分三类记，比死背清单有用：

| 分类 | 方法 | 要点 |
|---|---|---|
| **身份与比较** | `getClass()` | `final`，返回运行时类；任何「运行时类型」判断的起点 |
| | `hashCode()` | native，默认按对象地址派生；重写 `equals` 必须一起重写 |
| | `equals(Object)` | 默认是 `==`（引用相等）；重写必须满足自反/对称/传递/一致/非空 |
| | `toString()` | 默认输出 `类名@十六进制哈希`，日志排查时几乎必须重写 |
| **复制与回收** | `clone()` | `protected native`，要靠实现 `Cloneable` 才不抛异常；已不推荐 |
| | `finalize()` | **JDK 9 起废弃、JDK 18 起标记为待移除**，永远不要用 |
| **线程协作** | `wait()` / `wait(long)` / `wait(long,int)` | `final`，必须在持有该对象锁时调用，会释放锁 |
| | `notify()` / `notifyAll()` | `final`，唤醒等待队列；优先用 `notifyAll` |

为什么线程协作的方法要放在 `Object` 而不是 `Thread` 上？因为**「等待/通知」依赖的锁是对象级的**：Java 里任何对象都能当锁（`synchronized (anyObject)`），所以等待队列也必须挂在对象上，而不是挂在执行体上。这条经常被当成「为什么 `wait` 在 Object 里」的答案。

`finalize()` 现在应该完全放弃，替代方案见第五节。

## 四、equals 与 hashCode 的契约 {#equals-hashcode}

这一节是本篇的核心，因为**只要写错，症状会以「集合行为诡异」的形式出现在离现场很远的地方**。

### 4.1 两套契约 {#two-contracts}

`equals` 必须满足五条（`Object` 的 javadoc 原文规定）：

| 性质 | 含义 | 违反的后果 |
|---|---|---|
| 自反性 | `x.equals(x)` 恒为 `true` | 集合里 `contains(x)` 找不到刚放进去的 x |
| 对称性 | `x.equals(y)` 与 `y.equals(x)` 结果一致 | 父子类各自重写时最容易破坏 |
| 传递性 | `x=y`、`y=z` → `x=z` | 同上 |
| 一致性 | 只要用于比较的字段没变，结果就不能变 | **可变字段参与 equals** → `HashSet` 里的元素「消失」 |
| 非空性 | `x.equals(null)` 恒为 `false` | 抛 NPE |

`hashCode` 的契约只有两条，但都很硬：

1. 同一个对象，只要用于 `equals` 的字段没被改，多次调用 `hashCode` 必须返回**同一个值**（同一进程内）。
2. **`equals` 返回 `true` 的两个对象，`hashCode` 必须相等。**

注意第 2 条只说了一个方向：`hashCode` 相等不代表 `equals` 相等（这叫哈希冲突，允许）。反过来——**`equals` 相等但 `hashCode` 不等，是绝对禁止的**。

### 4.2 为什么必须成对重写 {#why-both}

哈希容器的查找是两步：先用 `hashCode` 定位到桶，再在桶内用 `equals` 逐个比对。如果只重写 `equals` 而沿用默认 `hashCode`（按地址派生），那么：

```java
class User {
    String id;
    User(String id) { this.id = id; }
    @Override public boolean equals(Object o) {
        return o instanceof User u && id.equals(u.id);
    }
    // 故意不重写 hashCode
}

Set<User> set = new HashSet<>();
set.add(new User("1"));
set.contains(new User("1"));   // false —— 两个对象 hashCode 不同，进了不同的桶
```

`contains` 返回 `false`，但两次 `equals` 明明是 `true`。这就是「只重写 `equals`」的典型症状。反过来只重写 `hashCode` 也不行：所有对象挤进同一个桶，退化成链表，查找从 O(1) 掉到 O(n)。

**标准写法（推荐直接用 `Objects` 工具类，避免手写踩坑）：**

```java
@Override
public boolean equals(Object o) {
    if (this == o) return true;                       // 引用相等快速返回
    if (!(o instanceof User)) return false;           // 用 instanceof 而不是 getClass()，见 4.4
    User that = (User) o;
    return Objects.equals(id, that.id);               // 字段逐个比，字段用 Objects.equals 防空
}

@Override
public int hashCode() {
    return Objects.hash(id);                          // 多字段 Objects.hash(a, b, c)
}
```

> **`Objects.hash` 的小代价**：它是可变参数，每次调用都会创建一个 `Object[]` 并装箱基本类型。放在热点路径（比如百万级 key 的 `HashMap`）上不划算，那时应该手写 `31 * result + field` 的展开形式。这是「知道标准写法，也知道它不适用于哪里」的加分点。

`record`（JDK 16 正式）会自动生成符合契约的 `equals`/`hashCode`/`toString`，不可变场景优先考虑，能省掉整段样板代码。

### 4.3 用可变字段做 key 的坑 {#mutable-key}

`HashMap` 的 key 一旦入桶，它的 `hashCode` 就被「记住」在桶的位置上了。此时如果修改 key 对象里参与 `hashCode` 的字段，**对象还在表里，但再也找不到了**：

```java
Map<Point, String> map = new HashMap<>();
Point p = new Point(1, 2);
map.put(p, "origin");
p.x = 100;                    // 改了参与 hashCode 的字段
map.get(p);                   // null —— 桶位置按新 hashCode 找，但元素还在老桶
map.containsKey(p);           // false
```

结论：**用作 Map key / Set 元素的类型必须是不可变或「参与哈希的字段不可变」**。这也是为什么 `String`、`Integer`、`record` 是天然的合格 key。

### 4.4 父类与子类的对称性陷阱 {#inheritance-symmetry}

假设父类按 `instanceof` 写 `equals`，子类又加了一个字段：

```java
class Point { int x, y; }          // equals 用 instanceof Point 判断
class ColorPoint extends Point { Color c; }   // equals 用 instanceof ColorPoint
```

此时 `point.equals(colorPoint)` 可能为 `true`，而 `colorPoint.equals(point)` 为 `false`——**对称性被破坏**。经典解法（《Effective Java》给的）有两个：

- 用 **`getClass()` 代替 `instanceof`**：只有同类才可能相等，对称性成立；代价是「父类实例与子类实例永不相等」，且违反里氏替换原则的常规解读。
- **改成组合**：让 `ColorPoint` 持有 `Point` 而不是继承它，从根上消除这个对称性问题。这也是「组合优先于继承」最实在的一条论据。

实际工程里更常见的做法是：**让参与 `equals` 的类尽量是 `final` 的，或者根本不定义继承层次**。

## 五、finalize 的退场与 Cleaner 的登场 {#finalize}

`finalize()` 的问题不是「性能差」这么简单，而是三条硬伤：

| 问题 | 说明 |
|---|---|
| 执行时机不确定 | 由 GC 线程调度，可能几秒后、可能程序退出前都不执行——**不能用来释放文件句柄、数据库连接这类必须及时归还的资源** |
| 可能让对象「复活」 | `finalize()` 里把 `this` 赋给一个静态变量，对象就逃过了这次回收，GC 需要再判一次 |
| 拖慢 GC | 重写了 `finalize` 的对象需要额外队列与二次处理，分配和回收都变慢 |

演进路线：**JDK 9 标记 `@Deprecated` → JDK 18（JEP 421）标记为「待移除」→ 后续版本禁用**。替代方案按推荐顺序：

1. **`try-with-resources` + `AutoCloseable`**：确定性释放，首选。
2. **`java.lang.ref.Cleaner`（JDK 9+）**：只想做一个「兜底清理」时用。注意 Cleaner 的动作对象**不能持有被清理对象的引用**，否则永远不回收——这是最常见的误用。

```java
public class Resource implements AutoCloseable {
    private static final Cleaner CLEANER = Cleaner.create();
    private final Cleaner.Cleanable cleanable;
    private final State state;                 // 独立状态对象，不持有 Resource

    private static class State implements Runnable {
        @Override public void run() { /* 释放底层资源 */ }
    }

    Resource() {
        this.state = new State();
        this.cleanable = CLEANER.register(this, state);
    }

    @Override public void close() { cleanable.clean(); }
}
```

## 六、clone、浅拷贝与深拷贝 {#clone}

`clone()` 是「能用但不要用」的典型。它有三个反直觉之处：

1. **`Cloneable` 是个空接口**（标记接口），它不声明 `clone()`。`clone()` 本身在 `Object` 上是 `protected`，子类必须自己把它提升为 `public`。
2. **它不走构造器**。对象直接按内存复制，绕过了所有构造器里的校验与初始化逻辑——如果有哪条不变式是在构造器里建立的，克隆出来的对象可能不满足它。
3. **它默认是浅拷贝**。基本类型字段复制值、引用类型字段只复制引用，副本和原对象**指向同一个内部对象**。

| 拷贝方式 | 基本类型字段 | 引用类型字段 | 说明 |
|---|---|---|---|
| 赋值 `b = a` | 复制引用 | 复制引用 | 两个变量指向同一个对象，根本不算拷贝 |
| 浅拷贝 | 复制值 | **复制引用**（共享内部对象） | 改副本的引用字段会「连累」原对象 |
| 深拷贝 | 复制值 | 递归复制出一份新对象 | 两者完全独立 |

三种深拷贝实现：

```java
// ① 手写：逐层递归拷贝（最可控，推荐）
public User copy() {
    User u = new User(this.name, this.age);
    u.tags = new ArrayList<>(this.tags);       // 集合要新建
    u.address = this.address.copy();           // 嵌套对象也要支持 copy
    return u;
}
```

```java
// ② 拷贝构造器 / 静态工厂：语义清晰，不走 clone 的怪癖
public User(User other) { this(other.name, other.age); }
public static User copyOf(User other) { return new User(other); }
```

```java
// ③ 序列化往返：省事但慢，且要求整条引用链都可序列化（不推荐）
ByteArrayOutputStream bos = new ByteArrayOutputStream();
try (ObjectOutputStream oos = new ObjectOutputStream(bos)) { oos.writeObject(this); }
try (ObjectInputStream ois = new ObjectInputStream(new ByteArrayInputStream(bos.toByteArray()))) {
    return (User) ois.readObject();
}
```

**结论**：`clone` 在面试里要能讲清「为什么它被 `Effective Java` 列为应该避免的做法」（绕构造器、浅拷贝陷阱、`Cloneable` 语义混乱），实际代码里用**拷贝构造器或静态工厂**。

## 七、常见坑速查 {#pitfalls}

| 坑 | 现象 | 根因 |
|---|---|---|
| 只重写 `equals` 不重写 `hashCode` | `HashSet.contains()` 返回 `false` | 两个相等对象哈希值不同，落在不同的桶 |
| 用可变字段参与 `hashCode` | Map 里的 key「找不到」了 | 入桶位置由旧哈希决定，改字段后按新哈希定位 |
| 父类用 `instanceof`、子类也重写 `equals` | 对称性被破坏 | 父子实例互相 `equals` 结果不一致 |
| 构造器里调用可重写方法 | 子类字段读到默认值 | 父类构造器先跑，子类字段尚未初始化 |
| 用 `==` 比较包装类/字符串 | 大数值时突然为 `false` | 只有缓存范围内的包装类会复用对象（见 [String 与包装类](/java/basics/string-wrapper#boxing-cache)） |
| `finalize()` 里释放资源 | 句柄泄漏、连接池被耗尽 | 执行时机不确定，可能根本不执行 |
| 浅拷贝当成深拷贝用 | 改了副本，原对象也变了 | 引用类型字段共享同一个内部对象 |
| `Objects.hash()` 用在热点路径 | GC 压力大 | 每次调用创建 `Object[]` 并对基本类型装箱 |

## 面试口径

- **封装/继承/多态的分工**：封装管访问边界，继承管实现复用，多态管运行期决定调谁。实践倾向是**组合优先于继承**，因为继承把子类绑死在父类的实现细节上（脆弱基类）。
- **重载与重写怎么分派**：重载是**静态分派**，编译期按变量的静态类型选中（`invokestatic`/`invokespecial` 同样编译期确定）；重写是**动态分派**，运行期通过 `invokevirtual`/`invokeinterface` 查虚方法表。所以 `Animal a = new Dog()` 调重载方法走的是 `Animal` 版本，调重写方法走的是 `Dog` 版本。
- **`private` / `static` / `final` 不能被重写**：前两者用 `invokespecial`、`invokestatic`，不进虚方法表；`final` 被编译器/运行期禁止。
- **Object 的方法**：`getClass`、`hashCode`、`equals`、`toString`、`clone`、`finalize`，加 `wait`×3、`notify`、`notifyAll`，共 11 个。等待/通知放在 `Object` 上是因为**锁是对象级的**，等待队列必须跟着锁走。
- **`equals`/`hashCode` 契约**：`equals` 要满足自反、对称、传递、一致、非空；`hashCode` 要求「同一对象字段不变则哈希不变」以及「`equals` 相等则哈希必须相等」。**只重写 `equals` 会让哈希容器彻底失灵**，因为定位靠哈希、桶内比对才靠 `equals`。
- **父类子类对称性**：父类用 `instanceof` 判断的子类重写 `equals` 会破坏对称性；解法是改用 `getClass()`（子类实例永不等于父类实例）或**改成组合**。
- **`finalize` 不能用**：执行时机不确定、对象可能复活、拖慢 GC；JDK 9 废弃、JDK 18 起标记待移除。替代是 `try-with-resources`（确定性释放）与 `Cleaner`（兜底，注意状态对象不能持有宿主引用）。
- **`clone` 的三宗罪**：`Cloneable` 是空标记接口、不走构造器（可能绕过不变式）、默认浅拷贝。推荐**拷贝构造器或静态工厂**；深拷贝要么手写递归，要么用序列化往返（慢且要求全程可序列化）。
- **构造器里调用可重写方法的后果**：方法被动态分派到子类实现，而子类字段此时还是默认值，会读到 `null`/`0`。所以构造器里不要调用非 `final` 的公开方法。
