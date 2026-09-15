---
date: 2026-09-15
title: Java 基础 · 导览
---

# Java 基础 · 导览

Java 基础是最容易被轻视、也最容易在面试里失分的一块——因为它「看起来都会」。但面试官真正问的从来不是定义，而是「**为什么会这样**」：`Integer a = 100, b = 100` 比较为什么是 `true` 而 `200` 就不是？`finally` 一定会执行吗？泛型的通配符为什么有时候用 `extends` 有时候用 `super`？「反射慢」这个结论现在还算不算数？

这些问题往回追一步，全都落在这个板块里。**它的定位不是「入门教程」，而是「所有上层知识的解释层」**：`HashMap` 为什么要求 key 重写 `hashCode`、Spring 的注解为什么不生效、网关为什么不能用阻塞写法——答案都在这里。

本板块共 **9 篇**，按「**语法地基 → 类型系统 → 平台能力 → 语言演进**」四层递进组织。

## 一、整体体系

| 层次 | 要解决的问题 | 篇目 |
|---|---|---|
| **语法地基** | 对象之间怎么协作、值怎么比较、出错怎么表达 | [面向对象与 Object 契约](/java/basics/oop-object)、[String 与包装类](/java/basics/string-wrapper)、[异常体系](/java/basics/exception) |
| **类型系统** | 泛型到底给了什么、运行期能拿到什么、注解怎么落地 | [泛型](/java/basics/generics)、[反射](/java/basics/reflection)、[注解](/java/basics/annotation) |
| **平台能力** | 数据怎么进出、文件与网络怎么高效读写 | [IO 与 NIO](/java/basics/io-nio) |
| **语言演进** | Java 8 改变了什么、9~21 又补上了什么 | [Java 8 特性](/java/basics/java8)、[Java 9~21 演进](/java/basics/java9-21) |

## 二、四条主线

```text
主线一：语法地基（面试必问的「为什么」）
  面向对象 ── 封装 / 继承 / 多态 ── 多态靠 invokevirtual + 虚方法表
        └─ Object 的 11 个方法 ── equals / hashCode 契约 ── clone 与深浅拷贝
  String 与包装类 ── 不可变的四个收益 ── 常量池与 intern ── 装箱缓存范围
        └─ 0.1 + 0.2 ≠ 0.3 ── BigDecimal 必须用字符串构造
  异常体系 ── 受检 vs 非受检 ── finally 的执行真相（字节码层面）
        └─ try-with-resources 与压制异常 ── 三个反模式

主线二：类型系统（编译期与运行期的分工）
  泛型 ── 类型擦除（编译期工具） ── 桥接方法保住多态
        └─ 通配符与 PECS ── 框架靠「继承」把泛型实参固化下来
  反射 ── 类的加载与初始化时机 ── 动态代理（JDK vs CGLIB）
        └─ 性能代价与 JDK 16/18 的两个变化
  注解 ── 「谁在读它」才是关键 ── SOURCE / CLASS / RUNTIME 三档
        └─ 注解处理器（编译期）vs 反射（运行期）

主线三：平台能力（IO 是高并发话题的地基）
  IO 模型 ── 同步/异步的分界线在「数据拷贝阶段」
        └─ BIO 装饰器体系 ── NIO 三件套 ── epoll ── 零拷贝

主线四：语言演进（大部分项目按 LTS 跳版）
  Java 8 ── Lambda / Stream / Optional / 新日期时间
        └─ Java 9~21 ── 模块化与强封装 ── record / sealed / 模式匹配
                └─ 虚拟线程（21 转正、24 修掉 pinning）
```

## 三、本板块导航

| 篇目 | 覆盖内容 | 关键问题 |
|---|---|---|
| [面向对象与 Object 契约](/java/basics/oop-object) | 封装 / 继承 / 多态的分工、静态分派与动态分派、虚方法表、Object 的 11 个方法、`equals` 与 `hashCode` 契约、`finalize` 的退场与 `Cleaner`、`clone` 与深浅拷贝 | 重载和重写分别在哪一步决定？为什么重写 `equals` 必须重写 `hashCode`？为什么不推荐 `clone`？ |
| [String 与包装类](/java/basics/string-wrapper) | `String` 不可变的四个收益、字符串常量池与 `intern`、编译期常量折叠、紧凑字符串（JDK 9）、`StringBuilder` / `StringBuffer`、自动装箱缓存范围、拆箱 NPE、`BigDecimal` 精度 | `new String("a")` 创建几个对象？`Integer` 比较为什么时好时坏？金额为什么不能用 `double`？ |
| [异常体系](/java/basics/exception) | `Throwable` 体系、受检与非受检的设计分歧、`try` / `catch` / `finally` 的真实执行顺序、`finally` 的字节码实现、try-with-resources 与压制异常、三个反模式 | `finally` 一定会执行吗？`finally` 里 `return` 会怎样？为什么受检异常在 Stream 里用不了？ |
| [泛型](/java/basics/generics) | 类型擦除规则、一串「为什么不能」的共同根因、数组协变 vs 泛型不变、通配符与 PECS、桥接方法、框架如何拿到泛型实参 | 擦除擦掉了什么？`? extends` 和 `? super` 怎么选？运行期怎么拿到 `List<String>` 里的 `String`？ |
| [反射](/java/basics/reflection) | 必须用反射的场景、四种拿 `Class` 的方式与初始化时机、主动/被动引用、成员 API 速查、`setAccessible` 与模块化、动态代理两种实现、性能与安全 | 为什么 JDBC 驱动不用再写 `Class.forName`？动态代理为什么必须有接口？「反射慢十倍」现在还成立吗？ |
| [注解](/java/basics/annotation) | 注解的本质（编译后是接口）、五个元注解、三档保留策略与各自的读取者、注解处理器与多轮处理、运行期反射与组合注解 | 加了注解为什么没反应？`@Retention` 忘写会怎样？Java 的注解为什么不能继承？ |
| [IO 与 NIO](/java/basics/io-nio) | BIO 流体系与装饰器模式、Buffer / Channel / Selector 的用法与坑、Reactor 模式、零拷贝的 Java API、序列化（**五种 IO 模型与 epoll 的内核机制见[计算机基础](/fundamentals/os/io-model)**） | NIO 到底是不是异步？`select` 和 `epoll` 差在哪？Kafka 为什么快（零拷贝）？ |
| [Java 8 特性](/java/basics/java8) | Lambda 的底层（`invokedynamic`）、四大函数式接口与变体、接口 `default` 与菱形冲突、Stream 的惰性与并行流四个坑、`Optional` 纪律、新日期时间 API | Lambda 和匿名内部类的区别？并行流什么时候别用？`orElse` 和 `orElseGet` 差在哪？ |
| [Java 9~21 演进](/java/basics/java9-21) | 模块化与强封装、`var` / `record` / `sealed` / 模式匹配、类库与 GC 的关键变化、虚拟线程的原理与三条禁忌、升级 LTS 排查清单 | 升级 JDK 17 为什么框架会挂？`record` 能不能做实体？虚拟线程为什么不能池化？ |

## 四、高频考点速查 {#faq}

按「问 → 答 → 详见」压缩，面试前扫一遍。

| 高频问题 | 一句话答案 | 详见 |
|---|---|---|
| 重载和重写在哪一步决定？ | 重载是**静态分派**（编译期按变量静态类型，`invokestatic`/`invokespecial` 同属此类）；重写是**动态分派**（运行期 `invokevirtual`/`invokeinterface` 查虚方法表） | [面向对象](/java/basics/oop-object#how-polymorphism-works) |
| 为什么重写 `equals` 必须重写 `hashCode`？ | 哈希容器先用 `hashCode` 定位桶、再用 `equals` 比对；只重写 `equals` 会让相等对象落在不同桶，`contains` 返回 `false` | [面向对象](/java/basics/oop-object#why-both) |
| `Object` 有几个方法？`wait` 为什么在 `Object` 上？ | 11 个：`getClass`/`hashCode`/`equals`/`toString`/`clone`/`finalize` + `wait`×3 + `notify`/`notifyAll`。等待通知依赖**对象级**的锁，所以挂在 `Object` 上 | [面向对象](/java/basics/oop-object#object-methods) |
| `finalize` 还能用吗？ | 不能。执行时机不确定、对象可能复活、拖慢 GC；JDK 9 废弃、JDK 18 起标记待移除。替代是 `try-with-resources` 与 `Cleaner` | [面向对象](/java/basics/oop-object#finalize) |
| `clone` 有什么问题？ | `Cloneable` 是空标记接口、**不走构造器**（可能绕过不变式）、默认是浅拷贝。推荐拷贝构造器或静态工厂 | [面向对象](/java/basics/oop-object#clone) |
| `String` 为什么不可变？ | 可安全共享（线程安全）、可缓存 `hashCode`（适合做 key）、支撑常量池、作为参数传递不会被篡改 | [String](/java/basics/string-wrapper#why-immutable) |
| `new String("a")` 创建几个对象？ | 一个或两个：池中没有字面量则先建池对象再建堆对象（两个）；已有则只建堆对象。所以 `"a" == new String("a")` 为 `false` | [String](/java/basics/string-wrapper#two-ways) |
| `String` 底层是什么？ | JDK 8 是 `char[]`；**JDK 9 起是 `byte[]` + `coder`**（紧凑字符串，ASCII 内容内存减半） | [String](/java/basics/string-wrapper#compact-strings) |
| `Integer` 比较为什么时好时坏？ | 装箱走 `Integer.valueOf`，**`-128 ~ 127` 命中缓存返回同一实例**，超出则新建。所以包装类必须用 `equals` 比 | [String 与包装类](/java/basics/string-wrapper#boxing-cache) |
| `0.1 + 0.2 != 0.3` 为什么？ | IEEE 754 二进制浮点无法精确表示十进制小数（与 Java 无关）。金额用 `BigDecimal`，且**必须字符串构造**、**比较用 `compareTo`** | [String 与包装类](/java/basics/string-wrapper#float-precision) |
| `finally` 一定会执行吗？ | 只要进入过 try 就会；**不执行**的四种：没进 try、`System.exit()`、JVM 崩溃/被强杀、线程被终止 | [异常](/java/basics/exception#correct-model) |
| `finally` 里 `return` 会怎样？ | 会**覆盖返回值并丢弃正在传播的异常**，所以绝对不要写。修改基本类型返回值无效，修改引用类型对象内容有效 | [异常](/java/basics/exception#modify-return) |
| 受检异常在 Stream 里为什么用不了？ | 函数式接口的方法签名没有 `throws`，只能包成非受检异常。这也是现代框架倾向转非受检的原因之一 | [异常](/java/basics/exception#checked-vs-unchecked) |
| 类型擦除擦掉了什么？ | 无界类型变量擦成 `Object`、有界擦成第一个边界、参数化类型擦成原始类型；运行期泛型信息不存在 | [泛型](/java/basics/generics#erasure) |
| 通配符怎么选？ | **PECS**：生产者用 `? extends T`（能读不能写），消费者用 `? super T`（能写、读出来是 `Object`） | [泛型](/java/basics/generics#pecs-rule) |
| 擦除后子类重写泛型方法为什么还生效？ | 编译器生成**桥接方法**（`ACC_BRIDGE`）覆盖父类的擦除后签名，内部强转后转发 | [泛型](/java/basics/generics#bridge-method) |
| 运行期怎么拿到泛型实参？ | 泛型签名编译进 class 的 `Signature` 属性，但**必须通过继承固化**才读得到——这就是 `TypeReference`/`TypeToken` 都要求写匿名子类的原因 | [泛型](/java/basics/generics#generic-reflection) |
| `Class.forName` 和 `loadClass` 的区别？ | `forName` **触发类初始化**（执行静态块），`loadClass` 只加载不初始化。JDBC 驱动曾经靠这个副作用注册自己 | [反射](/java/basics/reflection#get-class) |
| `getDeclaredMethods` 和 `getMethods` 的区别？ | 带 `Declared` 是「本类声明的全部（含 `private`）、不含继承」；不带是「公开的、含继承」 | [反射](/java/basics/reflection#member-api) |
| 动态代理为什么必须有接口？ | JDK 动态代理生成的类必须继承 `Proxy`（单继承位被占用），只能靠**实现接口**获得目标类型；没有接口就换 CGLIB 生成子类 | [反射](/java/basics/reflection#two-proxies) |
| 反射现在还慢吗？ | 慢的来源是参数装箱、访问检查、无法内联、以及**元数据查找**；**JDK 18（JEP 416）改由方法句柄实现核心反射后差距明显缩小**。优化顺序：缓存元数据 → `setAccessible` → `MethodHandle` | [反射](/java/basics/reflection#performance) |
| 加了注解为什么没反应？ | **注解本身不产生行为**，必须有读者。三条排查：`@Retention` 是不是 `RUNTIME`、有没有人扫到这个位置、有没有被代理绕过（`private`/`static`/自调用） | [注解](/java/basics/annotation#retention) |
| `@Retention` 忘写会怎样？ | 默认是 **`CLASS`**，反射读不到（看起来像注解失效）。自定义注解只在 `SOURCE` 与 `RUNTIME` 之间选 | [注解](/java/basics/annotation#meta-annotation) |
| Java 的注解能继承吗？ | **不能**。`@SpringBootApplication` 那种「组合注解」是框架用 `AnnotationUtils.findAnnotation` 递归查元注解实现的，用 JDK 的 `getAnnotation` 一定拿不到 | [注解](/java/basics/annotation#composed) |
| NIO 是异步 IO 吗？ | **不是**。NIO 是同步非阻塞（IO 多路复用）——`epoll` 告诉你可读了之后，数据拷贝仍要你自己调 `read` 并等待。真异步是 AIO | [IO 与 NIO](/java/basics/io-nio#five-models) |
| `select` / `poll` / `epoll` 的差别？ | 前两者每次调用都要把全部 fd 传入内核并**线性遍历**（`select` 还有 1024 上限）；`epoll` 把 fd 集合维护在内核、用回调维护就绪链表，**只返回就绪的 fd** | [IO 与 NIO](/java/basics/io-nio#channel-selector) |
| 零拷贝到底省了什么？ | 传统 `read`+`write` 是 **4 次拷贝 + 4 次上下文切换**；`mmap` 省一次 CPU 拷贝，`sendfile` 让数据不经过用户空间（Kafka 就是这么快的） | [IO 与 NIO](/java/basics/io-nio#zero-copy) |
| Java 原生序列化有什么问题？ | 安全（`readObject` 可执行代码，历史 RCE 主因）、性能与体积、不能跨语言、兼容性脆弱。**必须显式声明 `serialVersionUID`** | [IO 与 NIO](/java/basics/io-nio#serialization-problems) |
| Lambda 和匿名内部类有什么区别？ | Lambda 只生成 `invokedynamic`、**运行期动态生成**、可被 JIT 内联；**`this` 指向外层实例**（匿名类指向自己）。捕获变量必须 effectively final | [Java 8](/java/basics/java8#lambda-bytecode) |
| 接口 `default` 方法为什么出现？ | **向后兼容地给接口加方法**（Java 8 给 `Collection` 加 `stream()` 不能破坏已有实现类）。菱形冲突：类优先 → 子接口优先 → 冲突必须显式重写 | [Java 8](/java/basics/java8#default-method) |
| 并行流什么时候不要用？ | 它用**全局共享的 `ForkJoinPool.commonPool`**（并行度 = CPU 核数 − 1），**IO 任务会占满并拖累整个 JVM**；有状态操作、共享可变状态也是坑 | [Java 8](/java/basics/java8#parallel-stream) |
| `orElse` 和 `orElseGet` 的区别？ | `orElse(T)` **无论是否为空都会求值**；默认值需要计算时必须用 `orElseGet(Supplier)` | [Java 8](/java/basics/java8#orelse-vs-orelseget) |
| `SimpleDateFormat` 为什么线程不安全？ | 它内部持有一个共享可变的 `Calendar` 保存中间状态；应改用线程安全的 `DateTimeFormatter`（可作静态常量） | [Java 8](/java/basics/java8#why-new-date) |
| `LocalDateTime` 有什么坑？ | 它**不带时区，不能唯一确定一个时刻**；表示时刻要用 `Instant`/`ZonedDateTime`。`Date` 与 `LocalDateTime` 互转必须经过时区，否则差 8 小时 | [Java 8](/java/basics/java8#new-types) |
| 升级 JDK 17 为什么老框架会挂？ | **强封装自 JDK 16 起默认生效**，深层反射 JDK 内部包会抛 `InaccessibleObjectException`。解法是升级依赖或精确 `--add-opens` | [Java 9~21](/java/basics/java9-21#strong-encapsulation) |
| `record` 能当 JPA 实体吗？ | 不能。组件是 `final`、没有无参构造器，ORM 无法反射赋值。它适合值对象、DTO、多返回值载体 | [Java 9~21](/java/basics/java9-21#record) |
| `sealed` 有什么用？ | 限制实现者，配合 `switch` 模式匹配做**穷尽性检查**——漏分支**编译报错**，新增子类型会让相关 `switch` 全部失败。所以**不要写 `default`** | [Java 9~21](/java/basics/java9-21#sealed) |
| 虚拟线程为什么不能池化？ | 创建成本极低（不需要复用），池化只增加复杂度。要限并发应对**有限的下游资源**用信号量，而不是池化线程 | [Java 9~21](/java/basics/java9-21#vt-pitfalls) |
| 虚拟线程的 `synchronized` 还会 pin 吗？ | **JDK 21~23 会**（锁所有权记在平台线程上，阻塞时无法卸载，高并发下会退化甚至死锁）；**JDK 24（JEP 491）已修复**，JDK 25 LTS 继承。`-Djdk.tracePinnedThreads` 在 24 已移除，改用 JFR 的 `jdk.VirtualThreadPinned` | [Java 9~21](/java/basics/java9-21#vt-pitfalls) |

## 五、阅读建议

**如果时间有限**，按这个顺序：

1. **`equals`/`hashCode` + 装箱缓存 + 浮点精度** —— 这三处是「写错就出线上事故」的级别，收益最高。
2. **泛型擦除与 PECS** —— 它是理解所有框架源码的前置知识（`TypeReference`、`Class<T>`、`BaseMapper<T>` 全都建立在这上面）。
3. **反射与动态代理** —— 把注解、Spring AOP、事务失效这几块串成一条线。
4. **IO 模型与零拷贝** —— 高并发话题的地基，也是中间件面试的常考区。
5. **Java 9~21 与虚拟线程** —— 决定你讲的是「Java 8 时代的 Java」还是「现在的 Java」。

**相关板块**：集合的 `HashMap` 原理见 [Java 集合](/java/collections/)；`ThreadLocal` 与 AQS 见 [Java 并发](/java/concurrent/)；类加载过程见 [Java 虚拟机](/java/jvm/)；动态代理在 Spring 里的落地见 [Spring 生态](/java/spring/)；装饰器模式见 [设计模式](/java/design-patterns/structural/decorator)。
