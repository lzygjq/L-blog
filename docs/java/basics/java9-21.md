---
date: 2026-09-15
title: Java 9~21 演进与新特性
sidebar: Java 9~21 演进
desc: 模块化与强封装、从 var 到 record/sealed/模式匹配的语法演进、API 与 GC 的关键变化，以及虚拟线程的原理、用法与三条禁忌（含 JDK 24 的 pinning 修复）
order: 9
---

# Java 9~21 演进与新特性

Java 从 9 开始改成**每 6 个月一个版本**的发布节奏，同时每 2 年出一个 LTS（长期支持）版本。这个节奏带来了一个实际问题：**大部分项目只会在 LTS 上跳（8 → 11 → 17 → 21 → 25），所以每次跳都是一次「跨好几个版本的一次性补课」**。

这一篇就是那份补课清单。按「**平台层（模块化）→ 语言层 → 类库与 GC → 并发（虚拟线程）**」四层来讲，最后给出升级时要排查的清单。

## 一、先建立版本坐标系 {#version-map}

| 版本 | 发布时间 | LTS | 这一版的标志性内容 |
|---|---|---|---|
| **8** | 2014-03 | ✅ | Lambda、Stream、Optional、新日期时间 API（见 [Java 8 特性](/java/basics/java8)） |
| 9 | 2017-09 | — | **模块系统 JPMS**、集合工厂方法、G1 成为默认 GC、接口私有方法 |
| 10 | 2018-03 | — | `var` 局部变量类型推断 |
| **11** | 2018-09 | ✅ | `HttpClient` 转正、单文件源码直接运行、`String` 新方法 |
| 12~16 | 2019-03 ~ 2021-03 | — | switch 表达式（14 转正）、文本块（15 转正）、`instanceof` 模式匹配与 `record`（16 转正）、**JDK 16 起强封装默认生效**、偏向锁默认禁用（15） |
| **17** | 2021-09 | ✅ | **`sealed` 转正**、移除 `SecurityManager` 的启用路径（标记废弃）、文本块/record 已就位 |
| 18~20 | 2022-03 ~ 2023-03 | — | UTF-8 成为默认字符集（18）、**核心反射改由方法句柄实现**（18）、虚拟线程与模式匹配持续预览 |
| **21** | 2023-09 | ✅ | **虚拟线程转正**、模式匹配 for switch 与 record patterns 转正、顺序集合、分代 ZGC |
| 22~23 | 2024 | — | 未命名变量转正（22）、**字符串模板被撤回**（23）、`javac` 默认不再自动运行注解处理器（23） |
| **24~25** | 2025 | 25 是 ✅ | **JEP 491 解决 `synchronized` 的 pinning**（24，25 继承）、`Scoped Values` 转正（25） |

**两条使用结论**：

1. 面试里「Java 有哪些新特性」这种开放问题，**按 LTS 分组回答**（8 / 11 / 17 / 21 / 25）比按版本号流水背诵清晰得多。
2. 现在（2026 年）做新项目的 LTS 选择是 **21 或 25**——21 生态最成熟，25 拿到了 pinning 修复与 `Scoped Values`。

## 二、平台层：模块化与强封装 {#jpms}

### 2.1 JPMS 要解决什么 {#jpms-why}

模块系统（Jigsaw 项目）的目标有三个，只有理解了目标才明白为什么它影响面这么大：

| 目标 | 具体问题 |
|---|---|
| **可靠的配置** | 类路径（classpath）上「缺一个 jar 到运行期才报 `NoClassDefFoundError`」；模块描述能声明依赖，启动就校验 |
| **强封装** | JDK 内部 API（`sun.*`、`com.sun.*`）长期被随意使用，导致 JDK 无法演进；模块能**明确哪些包对外可见** |
| **可裁剪** | `jlink` 能只打包用到的模块，做出几十 MB 的定制运行时 |

用法（`module-info.java`）：

```java
module com.example.order {
    requires java.sql;                          // 依赖
    requires transitive com.example.common;     // 传递依赖（用到我的模块就能用到它）
    exports com.example.order.api;              // 只导出这个包，其余包对外不可见
    opens com.example.order.entity to com.fasterxml.jackson.databind;  // 允许特定模块反射
    uses com.example.order.spi.PaymentProvider;         // SPI 消费
    provides com.example.order.spi.PaymentProvider      // SPI 提供
            with com.example.order.impl.AlipayProvider;
}
```

**对日常开发影响最大的是 `exports` 与 `opens` 的区别**：

| | 编译期可见 | **运行期反射可见** |
|---|---|---|
| `exports` | ✅ | ❌（不能反射访问非 public 成员） |
| `opens` | ❌ | ✅ |

所以「模块化之后反射就不能用了」这个说法不准确——**没 `opens` 的包不能用反射访问非公开成员**，而 `opens ... to <模块名>` 可以只对特定框架开放（比全局 `opens` 安全）。

### 2.2 真正的现实影响：强封装 {#strong-encapsulation}

**大多数业务项目并不会写 `module-info.java`**（框架生态、依赖兼容性的成本太高），但**所有人都会被「强封装 JDK 内部 API」影响**，因为这是单向的、不可回避的：

| 版本 | 行为 |
|---|---|
| JDK 8 | `sun.misc.Unsafe`、`sun.reflect.*` 随便用 |
| JDK 9 ~ 15 | 非法深层反射只打警告（`--illegal-access=permit`） |
| **JDK 16 起** | **默认拒绝**（`--illegal-access=deny`），抛 `InaccessibleObjectException` |

**这就是「升级 JDK 17 时老框架启动就挂」的主因**——很多框架（老版 CGLIB、老版序列化库、各类字节码工具）依赖对 JDK 内部结构的反射访问（见 [反射](/java/basics/reflection#set-accessible)）。解法是在启动参数里显式开放：

```bash
--add-opens java.base/java.lang=ALL-UNNAMED
--add-opens java.base/java.util=ALL-UNNAMED
```

**排查思路**：看异常消息里的包名，用 `--add-opens <模块>/<包>=ALL-UNNAMED` 精确开放，**优先升级依赖到支持新 JDK 的版本**，而不是无脑加一堆 `--add-opens`（那等于放弃了强封装带来的收益）。

## 三、语言层：从 `var` 到模式匹配 {#amber}

这些改动由 **Project Amber** 推动，主线是**让 Java 的语法更简洁、更具表达力**。按「它替掉了什么写法」来记最清楚：

| 特性 | 转正版本 | 替掉了什么 |
|---|---|---|
| `var` 局部变量类型推断 | 10 | 冗长的泛型声明：`Map<String, List<Order>> m = new HashMap<>()` |
| 接口私有方法 | 9 | 接口内部复用逻辑只能写重复代码或用 `static` 方法暴露出去 |
| switch 表达式 | 14 | 用 `break` 赋值的 switch，以及忘记 `break` 导致的穿透 bug |
| 文本块 | 15 | 多行字符串的 `"\n" +` 拼接与转义地狱 |
| `instanceof` 模式匹配 | 16 | `if (o instanceof X) { X x = (X) o; }` 的重复声明与强转 |
| `record` | 16 | 只用来装数据的类：一堆字段 + 构造器 + getter + `equals`/`hashCode`/`toString` |
| `sealed` | 17 | 「这个接口只允许这几类实现」只能靠文档约定 |
| switch 模式匹配 + record patterns | 21 | 层层嵌套的 `instanceof` + 类型转换 |
| 未命名变量 `_` | 22 | 用不到却必须声明的变量名 |

### 3.1 `var` 的正确使用边界 {#var}

```java
var list = new ArrayList<String>();       // ✅ 右侧已经写明类型
var map = new HashMap<String, List<Order>>();   // ✅ 省掉泛型重复

var result = service.find(id);            // ⚠️ 读者看不出 find 返回什么，可读性变差
var a = 1, b = 2;                         // ❌ 一次只能声明一个变量
var x;                                    // ❌ 必须有初始值
```

**四条硬限制**：只能用于**局部变量**（含 `for` 循环变量与 try-with-resources），不能用于字段、方法参数、方法返回值；必须有初始值；不能同时声明多个；不能赋 `null`（无法推断类型）。

**实践标准**：`var` 的价值是「**消除右侧重复**」，不是「少打字」。判据很简单——**看右侧能否一眼看出类型，能就用，不能就别用**。

### 3.2 `record`：为「数据载体」发明的东西 {#record}

```java
public record Point(int x, int y) { }

// 编译器自动生成：全参构造器、x()、y()、equals、hashCode、toString
```

**四个必须知道的点**：

| 点 | 说明 |
|---|---|
| **自动 `equals`/`hashCode`** | 按组件生成，**符合契约**——这让 `record` 成为天然的 `Map` key（见 [面向对象与 Object 契约](/java/basics/oop-object#equals-hashcode)） |
| **不可变** | 组件是 `private final`，没有 setter；访问器叫 `x()` 而不是 `getX()` |
| **紧凑构造器** | 用于校验：`record Range(int lo, int hi) { Range { if (lo > hi) throw new IllegalArgumentException(); } }`（不用写参数列表，也不用赋值，赋值由编译器补） |
| **不能继承、隐式 `final`** | 因为它就是为「值语义」设计的，继承会破坏对称性 |

**什么时候不要用 `record`**：

- **JPA 实体**——ORM 需要通过反射改字段，而 `record` 字段是 `final`、也没有无参构造器；
- **需要可变或需要 setter** 的场景；
- **需要继承**的场景。

**与 Lombok 的 `@Data` 对比**（面试常问）：

| | `record` | Lombok `@Data` |
|---|---|---|
| 是否为语言特性 | **是**（标准、无依赖） | 否（编译期改 AST 的第三方工具） |
| 不可变性 | **强制** | 默认可变（要 `@Value` 才是不可变） |
| 与 JDK 升级的关系 | 无风险 | **易不兼容**（依赖编译器内部 API，且受 [JDK 23 注解处理变化](/java/basics/annotation#apt) 影响） |
| 可继承 | 否 | 可以 |
| 适用 | 值对象、DTO、多返回值载体 | 需要可变实体/复杂类的场景 |

### 3.3 `sealed` + 模式匹配：Java 的「穷尽性检查」 {#sealed}

`sealed` 约束「谁能实现我」：

```java
public sealed interface Shape permits Circle, Square, Triangle { }
record Circle(double r) implements Shape { }
record Square(double side) implements Shape { }
record Triangle(double a, double b) implements Shape { }
```

**它真正的价值在于配合模式匹配做穷尽性检查**——这是 Java 向「代数数据类型」靠近的一步：

```java
double area(Shape s) {
    return switch (s) {                       // switch 模式匹配（JDK 21 转正）
        case Circle c                -> Math.PI * c.r() * c.r();
        case Square sq               -> sq.side() * sq.side();
        case Triangle t              -> 0.5 * t.a() * t.b();
        // 不需要 default：编译器知道只剩这三种可能
    };
}
```

三个由这个组合带来的好处：

1. **漏掉一个分支编译报错**。加了新的 `permits` 实现后，所有 `switch` 都会编译失败——**错误在编译期暴露，而不是运行期抛「未知类型」**。
2. **不需要 `default`**。有 `default` 反而会掩盖「新增了子类型却没处理」的问题。
3. **模式匹配还支持卫语句（`when`）与嵌套解构**：

```java
// 带守卫条件的模式
case Circle c when c.r() > 100 -> "big circle";

// record 解构（record patterns，JDK 21 转正）
case Point(int x, int y) -> "x=" + x + ", y=" + y;     // 直接取出组件，不用调访问器
```

**注意版本时点**：`instanceof` 模式匹配是 JDK 16 转正、`sealed` 是 17、switch 模式匹配与 record patterns 是 21。**在 JDK 17 上写 switch 模式匹配是不行的**（还是预览），这是升级到 21 才解锁的能力。

## 四、类库与 GC 的关键变化 {#api-gc}

### 4.1 值得记住的类库改动 {#api}

| 改动 | 版本 | 说明 |
|---|---|---|
| **集合工厂方法** `List.of` / `Set.of` / `Map.of` | 9 | 创建**不可变**集合的简洁写法。⚠️ **不可变**——`add` 会抛 `UnsupportedOperationException`；且 `List.of` **不允许 `null` 元素** |
| `Stream.toList()` | 16 | 比 `collect(Collectors.toList())` 更短，返回**不可变**列表（注意与 `Collectors.toList()` 的可变性差异） |
| `Optional.isEmpty()` | 11 | 替代 `!isPresent()` |
| `String` 新方法 | 11 | `isBlank`、`strip`（比 `trim` 更懂 Unicode 空白）、`lines`、`repeat`、`indent` |
| `HttpClient` | 11 转正 | 支持 HTTP/2 与异步，替代 `HttpURLConnection` |
| **UTF-8 成为默认字符集** | 18（JEP 400） | `file.encoding` 默认 UTF-8，缓解了跨平台的编码问题；但仍建议显式指定编码 |
| **顺序集合** `SequencedCollection` | 21（JEP 431） | 统一了「有明确顺序的集合」的 API：`getFirst`/`getLast`/`addFirst`/`reversed`，`List`/`Deque`/`LinkedHashSet` 都实现了它 |
| 单文件源码直接运行 | 11 | `java Hello.java` 不用先 `javac` |
| **核心反射改由方法句柄实现** | 18（JEP 416） | 反射性能明显改善（见 [反射](/java/basics/reflection#performance)） |

### 4.2 GC 的演进路线 {#gc}

| 收集器 | 关键节点 | 定位 |
|---|---|---|
| **Serial** / **Parallel** | 老 | 小堆、批处理 |
| **CMS** | JDK 9 废弃 → **14 移除** | 低延迟，被 G1 取代 |
| **G1** | **JDK 9 起成为默认** | 通用默认选择，可预测停顿（`-XX:MaxGCPauseMillis`） |
| **ZGC** | JDK 11 实验 → **15 生产可用** → **21 分代** | **超低停顿（亚毫秒级）**，支持超大堆（TB 级） |
| **Shenandoah** | JDK 12 实验 → 15 生产可用 | 低延迟，与 ZGC 定位相近 |

另外两个与本篇其他内容相关的 JVM 改动：

- **偏向锁默认禁用（JDK 15，JEP 374）**：因为它在现代应用里收益有限、维护成本高。⚠️ **所以「偏向锁」相关的问题在新版本上已经不再适用**——面试时提到这一点非常加分。
- **字符串去重增强（JDK 18，JEP 192）**：G1 可以在 GC 时合并内容相同的 `String`（默认关闭，需显式开启），配合 [紧凑字符串](/java/basics/string-wrapper#compact-strings) 一起降低字符串内存占用。

## 五、虚拟线程：Java 21 最重要的变化 {#virtual-thread}

### 5.1 它解决什么问题 {#vt-why}

传统的「一请求一线程」模型（见 [IO 与 NIO](/java/basics/io-nio#bio-bottleneck)）撑不住高并发，因为**平台线程 = 操作系统线程**，昂贵且有数量上限。于是业界转向了异步/响应式——但代价是**编程模型复杂化**（回调、`CompletableFuture` 链路、回压处理），可读性与调试体验急剧下降。

**虚拟线程的目标就是「用同步的写法拿到异步的吞吐」**：

| | 平台线程 | 虚拟线程 |
|---|---|---|
| 实现 | 一对一映射到 OS 线程 | **由 JVM 调度**，映射到少量「载体线程（carrier）」上 |
| 创建成本 | 高（栈约 1MB、系统调用） | **极低**（初始栈只有几百字节，按需增长） |
| 数量级 | 数千 | **百万级** |
| 阻塞时的行为 | 占用 OS 线程 | **卸载（unmount）**，释放载体线程去跑别的虚拟线程 |
| 池化 | 必需（创建昂贵） | **反模式**（创建太便宜，池化无意义） |
| 适用 | CPU 密集 | **IO 密集** |

### 5.2 用法 {#vt-usage}

```java
// 方式一：每个任务一个虚拟线程（推荐）
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (int i = 0; i < 100_000; i++) {
        executor.submit(() -> {
            var result = httpClient.send(request, BodyHandlers.ofString());  // 阻塞，但会卸载
            return result.body();
        });
    }
}

// 方式二：直接创建
Thread t = Thread.ofVirtual().name("worker-", 0).start(() -> doSomething());
t.join();
```

**关键机制**：虚拟线程执行到**可挂起的阻塞操作**（Socket IO、`Thread.sleep`、`LockSupport`、`java.util.concurrent` 的同步器等）时，JVM 会保存它的执行状态（底层是 Continuation）、把它从载体线程上**卸载**，让载体线程去执行其他虚拟线程；等阻塞完成后再挂载回来（**可能换一个载体线程**）。

**所以它的收益有前提**：**只有任务大部分时间在等待，才有意义**。纯 CPU 计算的任务用虚拟线程不会更快——线程再多也变不出更多 CPU 时间。

### 5.3 三条禁忌与一个历史坑 {#vt-pitfalls}

| 禁忌 | 原因 |
|---|---|
| **不要池化虚拟线程** | 创建成本极低，池化只是徒增复杂度；它的定位就是「一次任务一个」。需要限制并发数时用 **`Semaphore`**（因为瓶颈通常是数据库连接、下游服务这类**有限资源**，而不是线程本身） |
| **不要用于 CPU 密集型任务** | 虚拟线程不会增加 CPU 时间，反而因为调度开销略慢 |
| **慎用 `ThreadLocal`** | 平台线程会被复用，`ThreadLocal` 有「复用缓存」的收益；虚拟线程**每个请求一个新线程**，`ThreadLocal` 里存大对象就变成每请求创建一份——**内存压力会很大**。JDK 25 已转正的 **`Scoped Values`** 是更合适的替代（不可变、结构化作用域内共享、自动清理） |

**那个历史坑（必须更新认识）**：**JDK 21~23 上，`synchronized` 块内的阻塞会「钉住（pin）」载体线程**——因为那几版的 JVM 把监视器锁的所有权记在**平台线程**上，虚拟线程一旦持有锁就不能卸载。后果是「所有载体线程被钉住 → 吞吐退化甚至死锁」。

**JDK 24（JEP 491）从根上解决了这个问题**：JVM 改为把锁的所有权直接记在虚拟线程上，卸载时备份锁状态、重挂载时恢复。**因此**：

- **JDK 24 及之后，`synchronized` 不再导致 pinning，不需要改代码**（JDK 25 作为 LTS 继承了这个修复）；
- **JDK 21 ~ 23 上**，如果虚拟线程在 `synchronized` 临界区里做阻塞操作，应该改用 `ReentrantLock`；短小、非阻塞的 `synchronized` 无所谓；
- **仍未解决的一类**：调用 **native 代码 / 外部函数（JNI、FFM）** 时阻塞仍会钉住载体线程——因为 native 代码必须在 OS 线程上执行。这属于「Java 与 native 边界」的根本限制。

**监控方式也变了**：以前用 `-Djdk.tracePinnedThreads=full` 排查，**JDK 24 起这个参数已被移除**；现在应使用 **JFR 的 `jdk.VirtualThreadPinned` 事件**（默认开启，阈值 20ms）：

```bash
jcmd <pid> JFR.start duration=200s filename=recording.jfr
jfr print --events jdk.VirtualThreadPinned recording.jfr
```

### 5.4 与现有技术栈的关系 {#vt-ecosystem}

- **Spring Boot 3.2+**：`spring.threads.virtual.enabled=true` 一行开启（Tomcat/Jetty 的请求处理切到虚拟线程）。
- **和响应式的关系**：虚拟线程的目的正是**让大多数场景不必再用响应式**——同步代码可读、可调试、栈信息完整。响应式仍然在「极高吞吐 + 流式背压」场景有价值，但它不再是「为了性能」的默认选择。
- **和线程池的关系**：不是「全部换掉」。**CPU 密集任务仍应用有界平台线程池**；对数据库连接、下游接口这类有限资源，要用信号量做并发限流——**虚拟线程让并发变得便宜，但下游资源并没有变多**，这是落地时最容易出的事故。

## 六、21 之后的补充与升级清单 {#upgrade}

### 6.1 21 之后的三个重要改动 {#after-21}

| 改动 | 版本 | 为什么重要 |
|---|---|---|
| **字符串模板被撤回** | 23 | 它在 21、22 两轮预览后被判定「当前设计不合适」而**整体撤回**（不是转正也不是继续预览）。所以在 21 上学到的字符串模板**在新版本里已经不存在了**，不要写进项目 |
| **`javac` 默认不再自动运行注解处理器** | 23 | 依赖 Lombok、MapStruct 的项目需要显式 `-proc:full`（或 `-Dmaven.compiler.proc=full`）。见 [注解](/java/basics/annotation#apt) |
| **`synchronized` 不再 pin 虚拟线程** | 24（JEP 491） | 虚拟线程落地的最大障碍被移除，JDK 25 LTS 继承 |

### 6.2 LTS 选择与升级排查清单 {#lts-choice}

**当前 LTS：8 / 11 / 17 / 21 / 25**（25 发布于 2025-09；下一个 LTS 是 2027-09 的 Java 29，之后固定 2 年一个）。**新项目的合理选择是 21 或 25。**

**从 8 或 11 升到 17/21 时，按这个清单逐项排查**（都是真实会挡住的点）：

| 检查项 | 症状 | 对策 |
|---|---|---|
| **强封装 JDK 内部 API** | 启动抛 `InaccessibleObjectException` | 升级依赖；临时用 `--add-opens` 放开具体包 |
| **`javax.*` → `jakarta.*`** | 编译失败、找不到类 | Java EE 到 Jakarta EE 的包名迁移（Spring Boot 3 起强制） |
| **JDK 内部 API 被移除** | `NoSuchMethodError`、`ClassNotFoundException` | `sun.misc.*`、`com.sun.*` 类被移除或改写 |
| **注解处理器默认行为变化** | Lombok/MapStruct 生成代码消失 | `-proc:full` 或升级插件版本（JDK 23 起） |
| **偏向锁相关调优参数失效** | 启动告警「ignoring option」 | JDK 15 起偏向锁默认禁用，相关参数已无意义 |
| **GC 默认变化** | 停顿特征与老环境不同 | JDK 9 起 G1 是默认；从 8 升上来要重新做压测与 GC 日志基线 |
| **`SecurityManager` 相关** | 启动告警或行为变化 | 已废弃（17 起标记待移除），改用其他权限模型 |
| **反射实现的性能特征变化** | 生产环境性能与旧版基线不一致 | JDK 18 起核心反射改由方法句柄实现，**要重新压测**而不是沿用旧结论 |
| **第三方依赖的字节码版本** | `UnsupportedClassVersionError` | 依赖必须支持目标 JDK |
| **序列化过滤器** | 反序列化被拒绝或需要配置 | 17 起可配置 `ObjectInputFilter`，是安全加固项而非障碍 |

**一条方法论**：升级 JDK 的正确顺序是**先升依赖、再升 JDK**，而不是反过来。依赖不兼容是绝大多数升级失败的原因，而非语言变化本身。

## 七、常见坑速查 {#pitfalls}

| 坑 | 现象 | 根因 |
|---|---|---|
| `List.of(...)` 后调用 `add` | `UnsupportedOperationException` | 集合工厂方法返回**不可变**集合 |
| `List.of(null)` | NPE | 集合工厂方法**不允许 `null` 元素** |
| `Stream.toList()` 期望可变 | 后续 `add` 报错 | `toList()` 返回**不可变**列表（与 `Collectors.toList()` 不同） |
| 在 JDK 17 上用 switch 模式匹配 | 编译失败 | 该特性 **21 才转正**（17 上仍是预览） |
| `var` 用在字段或参数上 | 编译错误 | `var` 只能用于局部变量，且必须有初始值 |
| `record` 当作 JPA 实体 | ORM 报错 | 组件是 `final`、没有无参构造器，无法反射赋值 |
| `record` 里想写 setter | 编译不了 | `record` 是不可变的，需要可变请用普通类 |
| 老的 Lombok/字节码库升级 JDK 后启动失败 | `InaccessibleObjectException` | 强封装自 JDK 16 起默认生效 |
| 页面/文件名中文乱码 | 与老版本行为不同 | JDK 18 起默认字符集变为 UTF-8（JEP 400），与依赖旧默认值的代码冲突 |
| 升级 JDK 23 后生成代码消失 | 编译成功但缺类 | `javac` 默认不再运行注解处理器，需 `-proc:full` |
| JDK 21 上虚拟线程吞吐上不去 | 载体线程被大量钉住 | `synchronized` 内的阻塞导致 pinning；**24 起已修复**，21 上改 `ReentrantLock` |
| 用 `-Djdk.tracePinnedThreads` 排查 | 无输出 | 该参数在 **JDK 24 已被移除**，应改用 JFR 的 `jdk.VirtualThreadPinned` |
| 池化虚拟线程 | 复杂度上升但没收益 | 虚拟线程创建成本极低，池化是反模式 |
| 用虚拟线程跑 CPU 密集任务 | 没有变快甚至变慢 | 虚拟线程只解决「等待」，不增加 CPU 时间 |
| 虚拟线程 + `ThreadLocal` 存大对象 | 内存暴涨 | 每个任务一个新线程，`ThreadLocal` 的复用收益消失；应改用 `Scoped Values` |
| 虚拟线程直接打下游 | 下游连接池被打爆 | 并发变便宜但**下游资源没变多**，必须用信号量限流 |

## 面试口径

- **版本节奏**：JDK 9 起每 6 个月一个版本，每 2 年一个 LTS。**LTS 目前是 8 / 11 / 17 / 21 / 25**，下一个是 2027-09 的 Java 29。回答「有哪些新特性」时按 LTS 分组答，比按版本流水背清晰。
- **模块化的三个目标**：可靠的配置（启动即校验依赖）、强封装（区分哪些包对外可见）、可裁剪（`jlink`）。核心概念：`requires`（依赖）、`exports`（编译期可见）、**`opens`（允许运行期反射访问，且可 `to 指定模块`）**、`uses`/`provides`（SPI）。
- **模块化对开发者的真实影响不是「要写 module-info」，而是「强封装」**：JDK 16 起默认拒绝深层反射，`sun.misc.*` 一类不再可用，**这是老框架升级 JDK 17 启动报错的头号原因**，解法是升级依赖或精确 `--add-opens`。
- **`var` 的边界**：只能用于局部变量（含 for 变量、try-with-resources），必须有初始值，不能一次声明多个，不能赋 `null`。判据是**「右侧能否一眼看出类型」**，能就用。
- **`record` 的关键点**：自动生成全参构造器与**符合契约的 `equals`/`hashCode`/`toString`**、不可变、访问器不带 `get` 前缀、支持**紧凑构造器**做校验、不能继承。**不适合做 JPA 实体**（字段 `final`、无无参构造器）。与 Lombok `@Data` 的差别是「语言特性 vs 编译期改 AST 的第三方工具」，后者升级 JDK 易不兼容。
- **`sealed` 的价值在同模式匹配配合**：`sealed` 限制实现者，`switch` 模式匹配就能做**穷尽性检查**——漏分支**编译报错**，新增子类型会让所有相关 `switch` 编译失败。这是 Java 靠近「代数数据类型」的一步，也意味着**不要写 `default`**（会掩盖未处理的新类型）。
- **版本时点要记准**：`instanceof` 模式匹配与 `record` 是 **16**，`sealed` 是 **17**，**switch 模式匹配与 record patterns 是 21**（17 上只是预览）。`var` 是 10，文本块 15，switch 表达式 14。
- **集合工厂方法与 `Stream.toList()`**：都是**不可变**的，且 `List.of` **不允许 `null` 元素**——与 `Collectors.toList()`（可变）的行为差异是常见坑。
- **强封装 + 反射 + 注解处理器三条「升级 JDK 踩坑线」**：JDK 16 强封装默认生效、JDK 18 核心反射改由方法句柄实现（性能特征变了，旧结论要重测）、JDK 23 `javac` 默认不跑注解处理器。
- **虚拟线程的原理**：JVM 调度的轻量线程，映射到少量**载体线程**上；遇到可挂起的阻塞操作时**卸载**（保存 Continuation），释放载体线程去跑别的虚拟线程，完成后再挂载（可能换载体）。因此**只对 IO 密集型有收益**，对 CPU 密集型没有。
- **虚拟线程的三条禁忌**：**不要池化**（创建太便宜；要限并发就针对「有限的下游资源」用 `Semaphore`）、**不要用于 CPU 密集**、**慎用 `ThreadLocal`**（每任务一个新线程，复用收益消失；`Scoped Values` 是替代，JDK 25 已转正）。
- **pinning 的版本现状（这是最能体现「知识是否更新」的一问）**：JDK 21~23 上 `synchronized` 临界区内阻塞会**钉住载体线程**（锁所有权记在平台线程上），高并发下会退化成死锁；**JDK 24（JEP 491）改为把锁所有权记在虚拟线程上，pinning 被消除，无需改代码**，JDK 25 LTS 继承。**仍未解决的是 native 代码/外部函数中的阻塞**。监控从 `-Djdk.tracePinnedThreads`（24 起移除）改为 **JFR 的 `jdk.VirtualThreadPinned` 事件**。
- **虚拟线程没有改变的事**：**下游资源没有变多**。并发变得便宜之后，数据库连接池、下游接口会成为新的瓶颈，必须显式限流——这是虚拟线程落地时最容易被忽略的风险。
