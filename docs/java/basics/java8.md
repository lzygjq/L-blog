---
date: 2026-09-15
title: Java 8 核心特性
sidebar: Java 8 特性
desc: Lambda 的底层实现、四大内置函数式接口与变体、接口 default 方法的菱形冲突规则、Stream 的惰性与并行流的坑、Optional 的正确用法与新日期时间 API
order: 8
---

# Java 8 核心特性

Java 8 是这门语言的**分水岭**：在此之前 Java 是纯面向对象的命令式语言，在此之后它具备了函数式表达力。这也是至今仍是使用最广的 LTS 版本的原因。

但「会用」和「讲得清」之间差距很大。这一篇把 Java 8 的四个核心特性（Lambda / 接口默认方法 / Stream / Optional）加上新日期时间 API 讲清楚，重点全放在**它们各自解决了什么问题、代价是什么**上。

## 一、Java 8 到底改变了什么 {#why-java8}

| 特性 | 解决的问题 | 本质手法 |
|---|---|---|
| **Lambda 与函数式接口** | 「行为」无法作为参数传递，只能靠匿名内部类写一堆样板代码 | 引入 `invokedynamic`，让行为可以像值一样传递 |
| **接口 default 方法** | 给已发布的接口加方法会**破坏所有实现类** | 允许接口带方法体，向后兼容地扩展 API |
| **Stream** | 集合操作是命令式循环，可读性与并行化都差 | 把「做什么」与「怎么做」分离，惰性求值 + 可自动并行 |
| **Optional** | `null` 是「没有值」的唯一表达，调用方无从判断 | 用类型系统显式表达「可能没有值」 |
| **新日期时间 API** | `Date`/`Calendar` 可变、非线程安全、月份从 0 开始 | 不可变值对象 + 清晰的时间/日期概念划分 |

**一条贯穿的主线**：Java 8 的所有改动都在往「**把意图表达得更明确**」这个方向走——Lambda 让行为可见、Stream 让处理步骤可见、Optional 让「可能为空」可见、新时间 API 让「这是哪个概念」可见。

## 二、Lambda 与函数式接口 {#lambda}

### 2.1 函数式接口：Lambda 的「类型」{#sam}

**函数式接口 = 只有一个抽象方法的接口**（SAM，Single Abstract Method）。Lambda 必须赋值给一个函数式接口，它自己**没有类型**。

```java
@FunctionalInterface
interface Calculator {
    int calc(int a, int b);
    // default / static 方法不算抽象方法，可以随便加
    default Calculator andThen(Calculator after) { return (a, b) -> after.calc(calc(a, b), b); }
}
```

三条容易搞错的判定规则：

- **`Object` 的方法（`equals`、`hashCode`、`toString`）不算抽象方法**。所以一个「只有一个抽象方法 + 一个 `String toString()` 声明」的接口**仍然是函数式接口**。
- **`default` 和 `static` 方法不算**，可以加任意多个。
- **`@FunctionalInterface` 是可选的**，但它能在编译期拦住「不小心加了第二个抽象方法」这种改动——**强烈建议加**。

### 2.2 内置的四大接口与它们的变体 {#builtin-interfaces}

不需要自己定义接口的场合，用 `java.util.function` 里的即可。**四大核心 + 原始类型特化**：

| 核心接口 | 签名 | 语义 | 记忆 |
|---|---|---|---|
| `Function<T,R>` | `R apply(T)` | 转换 | 有进有出（类型可变） |
| `Consumer<T>` | `void accept(T)` | 消费 | 有进无出 |
| `Supplier<T>` | `T get()` | 供给 | 无进有出 |
| `Predicate<T>` | `boolean test(T)` | 判断 | 有进有布尔出 |

对应的变体（**面试里能说出「为什么要这些变体」比背名字有用**）：

| 变体 | 签名 | 为什么存在 |
|---|---|---|
| `BiFunction<T,U,R>` / `BiConsumer<T,U>` / `BiPredicate<T,U>` | 两个入参 | 双参数场景，避免自己定义 |
| `UnaryOperator<T>` | `T apply(T)` | `Function<T,T>` 的特化，可读性更好 |
| `BinaryOperator<T>` | `T apply(T,T)` | 二元同类型，`reduce` 的常见参数 |
| `IntFunction<R>` / `ToIntFunction<T>` / `IntPredicate` / `IntSupplier` / `IntUnaryOperator` … | 入参或返回为基本类型 | **避免装箱拆箱**——泛型不能是基本类型，所以每套都要单独定义 |

**实践建议**：`IntStream`、`mapToInt` 这类原始类型特化不是「纯粹为了优雅」，而是**避免在百万级数据上产生百万个 `Integer` 对象**。这是「知道标准写法，也知道它在哪里不够用」的层次。

### 2.3 方法引用的四种形式 {#method-reference}

```java
// ① 静态方法引用
Function<String, Integer> f1 = Integer::parseInt;          // s -> Integer.parseInt(s)

// ② 特定对象的实例方法引用
String prefix = "id-";
Function<String, String> f2 = prefix::concat;              // s -> prefix.concat(s)

// ③ 任意对象的实例方法引用（第一个参数当接收者）
Function<String, Integer> f3 = String::length;             // s -> s.length()

// ④ 构造器引用
Supplier<User> f4 = User::new;                             // () -> new User()
Function<String, User> f5 = User::new;                     // name -> new User(name)
```

**② 与 ③ 的区分是常见的困惑点**：`prefix::concat` 是把 `prefix` 当接收者（引用已存在的对象）；`String::length` 是把**第一个参数**当接收者（`(String s) -> s.length()`）。前者的 `prefix` 必须是 effectively final 的变量。

### 2.4 Lambda 的底层：不是匿名内部类 {#lambda-bytecode}

这是「Lambda 到底是怎么实现的」的标准答案，也是与匿名内部类的关键区别：

| | 匿名内部类 | Lambda |
|---|---|---|
| 编译产物 | 编译期生成一个真实的 `.class` 文件（`Outer$1.class`） | **不生成 `.class`**，只留一条 `invokedynamic` 指令 |
| 实现机制 | `new` 一个对象 | 首次执行时由 `invokedynamic` 链接到 `LambdaMetafactory`，**运行期动态生成**实现类 |
| 之后的开销 | 每次执行都 `new` | 链接完成后就是普通方法调用，可被 JIT 内联 |
| `this` 的指向 | 指向匿名类实例 | 指向**外层实例**（是编译期确定的词法作用域，不是新对象） |

**`this` 的差异是最实用的一条**：匿名内部类里 `this` 是它自己，所以调用外层方法要写 `Outer.this.xxx()`；Lambda 里直接写 `xxx()` 就是外层方法——因为 Lambda 没有自己的 `this`。

**性能上还有两个细节**：

- **不捕获外部变量的 Lambda 会被缓存成单例**（同一个实例反复使用）；捕获变量的每次执行可能新建。
- 这也是**为什么 Lambda 捕获的变量必须是 effectively final**：Lambda 不是「复制一份变量进去」，而是通过生成的实现类**持有对变量的引用**——如果变量可变，就无法保证语义一致（并且并发下会混乱）。匿名内部类有同样的限制。

## 三、接口的 default 方法与菱形冲突 {#default-method}

### 3.1 为什么需要它 {#why-default}

**核心动机是「向后兼容地给接口加方法」**。最直接的证据：Java 8 要给 `Collection` 加 `stream()`、`forEach()`，而 `Collection` 有无数第三方实现类——如果按老规矩加抽象方法，**所有实现类全部编译失败**。`default` 方法让接口可以带一个默认实现，从而不破坏既有实现。

```java
public interface Collection<E> {
    default Stream<E> stream() { return StreamSupport.stream(spliterator(), false); }
}
```

**这也解释了另一个设计**：`List` 的 `sort` 为什么是 `default` 方法而不是抽象方法（同理）；以及 `Iterable` 的 `forEach` 为什么是 `default`。

### 3.2 菱形继承冲突的三条规则 {#diamond-rules}

一个类可以继承多个接口，如果两个接口都有同名同参数的 `default` 方法，怎么办？Java 用三条规则按顺序判定：

| 优先级 | 规则 | 结果 |
|---|---|---|
| 1 | **类的方法（含父类的具体方法）优先于接口的 `default`** | 类赢了，直接用类的方法 |
| 2 | **如果两个接口之间是继承关系，子接口的 `default` 优先** | 更具体的赢 |
| 3 | **以上都不成立（两个不相关接口的 `default` 冲突）** | **必须显式重写**，否则编译报错；要用 `Interface.super.method()` 指定调用哪一个 |

```java
interface A { default String hello() { return "A"; } }
interface B { default String hello() { return "B"; } }

class C implements A, B {
    @Override
    public String hello() {
        return A.super.hello() + B.super.hello();   // 必须自己裁决
    }
}
```

**注意规则 3 的措辞**：「编译报错」而不是「随便选一个」——Java 选择让开发者显式表达意图，而不是隐式猜测。另外类（含抽象类）里的方法无论是否 `abstract`，都优先于接口 `default`——这保证了「继承类比实现接口更强」这个直觉。

## 四、Stream：声明式数据处理 {#stream}

### 4.1 三个基本性质 {#stream-basics}

| 性质 | 含义与后果 |
|---|---|
| **声明式** | 描述「做什么」而非「怎么做」，所以 `filter` 后不用关心循环怎么写 |
| **惰性求值** | **中间操作不会立即执行**，直到遇到终端操作才一次性跑完整条流水线 |
| **一次性** | Stream 只能被消费一次，重复使用抛 `IllegalStateException: stream has already been operated upon or closed` |

**惰性求值是 Stream 最值得理解的一点**，它带来两个实际收益：

1. **可以短路**：`list.stream().filter(...).findFirst()` 找到第一个就停，不会遍历完整个集合。
2. **可以合并遍历**：`filter().map().sorted()` 不会产生三个中间集合（与「命令式写法里每步都建一个 List」完全不同）。

```java
// 印证惰性：什么都不会打印（没有终端操作）
Stream.of("a", "b").map(s -> {
    System.out.println("map " + s);
    return s.toUpperCase();
});

// 加上终端操作才会执行
Stream.of("a", "b").map(s -> { System.out.println("map " + s); return s.toUpperCase(); })
                   .collect(Collectors.toList());
```

### 4.2 中间操作与终端操作 {#intermediate-terminal}

| 分类 | 方法 | 特点 |
|---|---|---|
| **中间操作** | `filter`、`map`、`flatMap`、`distinct`、`sorted`、`limit`、`skip`、`peek` | 返回新 Stream，**惰性** |
| **终端操作** | `forEach`、`collect`、`reduce`、`count`、`findFirst`、`anyMatch`、`toArray` | 触发执行，返回非 Stream 结果 |
| **有状态中间操作** | `sorted`、`distinct`、`limit`、`skip` | 需要知道**前面的全部元素**才能继续，会破坏流水线式处理、**并行代价高** |
| **无状态中间操作** | `filter`、`map`、`flatMap`、`peek` | 每个元素独立处理，并行友好 |

**「有状态 vs 无状态」是理解并行流性能的关键**：无状态操作可以逐元素流水线处理；有状态操作要等前面全部就绪（`sorted` 甚至要缓冲全部元素），并行时反而可能更慢。

**`flatMap` 与 `map` 的区别**常被混淆：`map` 是「一个元素 → 一个元素」，`flatMap` 是「一个元素 → 一个流」，并把所有流摊平成一个流。用于「集合的集合」拉平：

```java
List<List<Integer>> nested = List.of(List.of(1, 2), List.of(3, 4));
List<Integer> flat = nested.stream().flatMap(List::stream).collect(Collectors.toList());
// [1, 2, 3, 4]
```

**`peek` 的定位**：它在官方文档里明确写着「主要用于调试」，因为它不保证在并行流里对每个元素都按预期顺序执行——**不要用 `peek` 做业务副作用**。

### 4.3 并行流的四个坑 {#parallel-stream}

`list.parallelStream()` 或 `stream().parallel()` 会启用并行。它的底层是 **`ForkJoinPool.commonPool()`**，默认并行度是 **CPU 核数 − 1**（留一个给主线程）。可以用 `-Djava.util.concurrent.ForkJoinPool.common.parallelism=N` 调整。

**四个必须知道的坑**：

| 坑 | 现象 | 说明 |
|---|---|---|
| **用在 IO 密集任务上** | 整体变慢甚至拖垮其他任务 | 并行流的设计前提是 **CPU 密集**；IO 阻塞会占满 commonPool，而 **commonPool 是全局共享的**——你阻塞了它，同 JVM 里其他用并行流的地方一起受影响 |
| **有状态操作** | 并行比重没快多少，甚至更慢 | `sorted`、`distinct`、`limit` 需要全局协调；`forEach` 还是无序的（需要顺序输出必须用 `forEachOrdered`） |
| **装箱拆箱开销** | 数据量大时 GC 压力明显 | 应使用 `IntStream`/`LongStream`/`DoubleStream` 及 `mapToInt` 等特化方法 |
| **共享可变状态** | 结果不确定、并发 bug | 累加应使用 `reduce`/`collect` 的规约形式，而不是往共享集合里 `add` |

**一条实践结论**：**并行流只适合「数据量大 + 纯 CPU 计算 + 无状态操作 + 不共享可变状态」这四个条件同时满足的场景**。其余情况用显式线程池 + `CompletableFuture`，或者干脆顺序流——**为了并行而并行几乎总是错的**。

### 4.4 `Collectors` 里最常用的几个与它们的坑 {#collectors}

```java
// 分组
Map<String, List<User>> byCity = users.stream().collect(Collectors.groupingBy(User::getCity));

// 分组后二次统计（下游收集器）
Map<String, Long> countByCity = users.stream()
        .collect(Collectors.groupingBy(User::getCity, Collectors.counting()));

// 转 Map —— 两个经典坑都在这里
Map<String, User> map = users.stream().collect(Collectors.toMap(User::getId, u -> u));
```

`Collectors.toMap` 的两个坑**必须记住**（线上事故高发点）：

| 坑 | 报错 | 解法 |
|---|---|---|
| **value 为 `null`** | `NullPointerException`（`toMap` 内部调 `map.merge`，不允许 `null` value） | 提前过滤掉 `null`，或改用 `HashMap` + `forEach` 手动放 |
| **key 重复** | `IllegalStateException: Duplicate key` | 提供合并函数：`toMap(User::getId, u -> u, (a, b) -> a)`，并指定要保留哪一个 |

```java
// 指定 Map 实现 + 合并函数
Map<String, User> safe = users.stream().collect(Collectors.toMap(
        User::getId, u -> u, (existing, replacement) -> existing, LinkedHashMap::new));
```

## 五、Optional：让「可能没有值」进入类型系统 {#optional}

### 5.1 它要解决什么 {#optional-why}

`null` 的问题不是「会抛 NPE」，而是**调用方从签名上无法知道一个方法可能返回 `null`**——只能靠文档、靠猜，或者到处判空。`Optional<T>` 把这个信息放进了类型：

```java
// 调用方看到这个签名就知道「要处理空的情况」
public Optional<User> findById(Long id);
```

### 5.2 三条使用纪律 {#optional-rules}

| 纪律 | 原因 |
|---|---|
| **只用作返回值**，不要做字段、不要做方法参数 | 字段用 `Optional` 会让对象不可序列化、也让对象图变得奇怪；参数用 `Optional` 是把「判空」的成本转嫁给调用方——**调用方直接不传这个参数或传 `null` 更简单** |
| **不要 `isPresent()` + `get()`** | 这与写 `if (x != null)` 没有区别，等于没用上 `Optional`。应该用 `map`/`orElse`/`ifPresent` 链式表达 |
| **不要用 `Optional` 做集合元素** | `List<Optional<T>>` 是反模式，用「过滤掉空值」代替 |

```java
// 反模式
Optional<User> opt = findById(1L);
if (opt.isPresent()) { return opt.get().getName(); }
return "unknown";

// 正确
return findById(1L).map(User::getName).orElse("unknown");
```

### 5.3 `orElse` 与 `orElseGet` 的区别（高频考点）{#orelse-vs-orelseget}

```java
// orElse：无论 Optional 是否为空，参数都会被求值
String a = opt.orElse(expensiveDefault());     // expensiveDefault() 一定会执行

// orElseGet：只有为空时才执行 Supplier
String b = opt.orElseGet(() -> expensiveDefault());   // 有值时不会执行
```

**这个差别什么时候会造成事故**：默认值来自数据库查询、远程调用、或创建大对象时，`orElse` 会让「本来命中了、不需要默认值」的路径也付出代价。**所以：默认值是常量用 `orElse`，默认值需要计算就用 `orElseGet`。**

其余常用方法：`orElseThrow(Supplier)`（推荐用它替代「返回 `null`」）、`map`/`flatMap`（链式转换，`flatMap` 用于嵌套 `Optional`）、`filter`、`ifPresent`、`ifPresentOrElse`（JDK 9）、`stream()`（JDK 9，把 `Optional` 当 0 或 1 个元素的流）。

**一个必须注意的创建细节**：`Optional.of(null)` 会直接抛 NPE，可能为 `null` 时要用 `Optional.ofNullable(...)`。

## 六、新日期时间 API（`java.time`）{#datetime}

### 6.1 为什么必须换掉 Date/Calendar {#why-new-date}

老 API 的四个问题，每个都真实踩过：

| 问题 | 说明 |
|---|---|
| **月份从 0 开始** | `new Date(2024, 0, 1)` 表示 1 月——极易写错且不报错（`Calendar.JANUARY == 0`） |
| **可变** | `Date` 有 `setTime()`，任何持有它的人都能改；作为参数/字段传递时语义不可控 |
| **非线程安全** | `SimpleDateFormat` 是**共享可变状态**的典型：内部持有 `Calendar`，多线程同时 `format` 会互相覆盖 → 偶发解析出错误日期或抛 `NumberFormatException`。**「`SimpleDateFormat` 为什么线程不安全」的答案是它内部用一个共享的 `Calendar` 保存中间状态**。修复方式：每次新建（性能差）、用 `ThreadLocal`（能解决但繁琐）、或**换 `DateTimeFormatter`** |
| **概念混在一起** | `Date` 既是「时间戳」又承担日期/时间格式化，跨时区处理混乱 |

### 6.2 新的概念划分 {#new-types}

新 API 的第一价值是**把不同的时间概念拆成不同的类**：

| 类 | 表示什么 | 有没有时区 | 典型用途 |
|---|---|---|---|
| `Instant` | 时间轴上的一个**时刻**（UTC，纳秒精度） | 隐含 UTC | 时间戳、日志、计算两个时刻的先后 |
| `LocalDate` | 日期（年-月-日） | 无 | 生日、账单日 |
| `LocalTime` | 时间（时:分:秒） | 无 | 营业时间 |
| `LocalDateTime` | 日期 + 时间 | **无** | 业务上的「某天某时」，如预约时间 |
| `ZonedDateTime` | 带时区的完整时间 | 有（含时区规则） | 跨时区的绝对时间 |
| `OffsetDateTime` | 带偏移量的时间 | 有（仅偏移量） | 与不支持区域规则的协议交互 |
| `Duration` | **时间**量（秒 + 纳秒） | — | 「耗时 3 小时」 |
| `Period` | **日期**量（年 + 月 + 日） | — | 「3 年 2 个月后」 |

**最关键的一条区分（高频追问）**：`LocalDateTime` **没有时区，所以它不能唯一确定一个时刻**。「北京时间 10:00」与「伦敦时间 10:00」是两个不同的瞬间。所以——

- **要表示「某一时刻」→ 用 `Instant` 或 `ZonedDateTime`**；
- **要表示「当地时间」→ 用 `LocalDateTime`**；
- 二者之间转换需要显式给时区：`localDateTime.atZone(ZoneId.of("Asia/Shanghai")).toInstant()`。

**跨时区/夏令时的地方一定不要用 `LocalDateTime` 做时刻运算**——夏令时切换那天它算出来的「加一小时」可能根本不是一小时。

### 6.3 不可变与线程安全 {#immutable-datetime}

```java
LocalDate today = LocalDate.now();
LocalDate tomorrow = today.plusDays(1);     // 返回新对象，today 不变
```

所有 `java.time` 的值对象都是**不可变的**，`plusXxx`/`withXxx`/`minusXxx` 一律返回新实例。由此得到两条实践纪律：

1. **必须接收返回值**：`today.plusDays(1);` 这一行等于什么都没做——不会报错，也容易看漏，是新手常见 bug。
2. **可以安全地作为静态常量与共享字段**，不像 `SimpleDateFormat` 需要每次新建或放 `ThreadLocal`。

`DateTimeFormatter` 也是线程安全的（不可变），**它才是 `SimpleDateFormat` 的正确替代**：

```java
private static final DateTimeFormatter FMT =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

String s = LocalDateTime.now().format(FMT);          // 多线程共用这个静态常量是安全的
LocalDate d = LocalDate.parse("2026-09-15");
```

### 6.4 与老 API 的互转 {#legacy-interop}

```java
// Date（本质是时间戳）↔ Instant
Date date = Date.from(instant);
Instant instant = date.toInstant();

// 需要时区才能与 LocalDateTime 互转
LocalDateTime ldt = LocalDateTime.ofInstant(instant, ZoneId.systemDefault());
Instant back = ldt.atZone(ZoneId.systemDefault()).toInstant();

// 老的 SimpleDateFormat 可换成 DateTimeFormatter，Calendar 用 ZonedDateTime 替代
```

**实测中最容易出错的点**：`Date` 与 `LocalDateTime` 之间**不能直接转**，中间必须经过时区——因为 `Date` 是时间戳（隐含 UTC 瞬时），而 `LocalDateTime` 没有时区。这一步漏了时区，就会出现「差 8 小时」的经典问题。

## 七、常见坑速查 {#pitfalls}

| 坑 | 现象 | 根因 |
|---|---|---|
| 重复使用同一个 Stream | `IllegalStateException: stream has already been operated upon` | Stream 只能消费一次，需要重新 `stream()` |
| 没有终端操作 | 中间操作完全没执行 | Stream 是惰性的，必须靠终端操作触发 |
| `Collectors.toMap` 的 value 为 `null` | `NullPointerException` | `toMap` 内部走 `map.merge`，不允许 `null` value |
| `Collectors.toMap` 的 key 重复 | `IllegalStateException: Duplicate key` | 必须传合并函数 |
| 用并行流处理 IO | 整体变慢、拖累同 JVM 其他任务 | 并行流用全局的 `ForkJoinPool.commonPool`，IO 阻塞会占满它 |
| 并行流里有状态操作 | 并行反而更慢 | `sorted`/`distinct`/`limit` 需要全局协调 |
| 并行流 `forEach` 期望有序 | 输出顺序随机 | 要顺序必须用 `forEachOrdered` |
| `orElse` 写了一个重计算 | 明明命中却仍然付出了默认值的代价 | `orElse` 无论是否为空都求值，应改 `orElseGet` |
| `Optional.of(null)` | 直接抛 NPE | 可能为 `null` 要用 `ofNullable` |
| `isPresent()` + `get()` | 代码比判空还长 | 没有用上 `Optional` 的表达力，应改 `map`/`orElse` |
| 忘记接收 `plusDays` 的返回值 | 日期没变 | `java.time` 全部不可变，运算返回新对象 |
| `SimpleDateFormat` 做静态字段 | 偶发解析错误日期或抛异常 | 内部共享可变 `Calendar`；应改用线程安全的 `DateTimeFormatter` |
| `LocalDateTime` 跨时区运算 | 时间差 8 小时 / 夏令时出错 | `LocalDateTime` 不带时区，表示时刻要用 `Instant`/`ZonedDateTime` |
| `Date` 直接转 `LocalDateTime` | 差 8 小时 | 必须经时区转换（`Date` → `Instant` → `atZone` → `LocalDateTime`） |
| Lambda 里改了外部变量 | 编译错误 | 捕获的变量必须 effectively final，因为 Lambda 通过引用持有它 |

## 面试口径

- **Lambda 的底层**：编译期只生成一条 `invokedynamic` 指令、**不生成匿名内部类**；首次执行时链接到 `LambdaMetafactory` 在运行期动态生成实现类，之后就是普通方法调用、可被 JIT 内联。**与匿名内部类的关键区别是 `this` 指向**——匿名类的 `this` 是自己（要写 `Outer.this`），Lambda 的 `this` 就是外层实例。
- **为什么 Lambda 捕获的变量必须 effectively final**：它不是复制变量，而是通过生成的实现类**持有对该变量的引用**；变量可变会导致语义不一致。不捕获外部变量的 Lambda 会被缓存成单例。
- **函数式接口的判定**：只有一个抽象方法；`Object` 的方法（`equals`/`hashCode`/`toString`）与 `default`/`static` 方法都不计入。建议加 `@FunctionalInterface` 由编译器守住这个约束。
- **四大内置接口与变体**：`Function`（有进有出）、`Consumer`（有进无出）、`Supplier`（无进有出）、`Predicate`（有进有布尔出）；变体有 `BiXxx`（双参）、`UnaryOperator`（同类型进出）、`BinaryOperator`（二元同类型）、以及 `Int/Long/Double` 特化（**目的是避免装箱**——泛型不能是基本类型）。
- **方法引用四种形式**：静态方法、特定对象的实例方法、任意对象的实例方法（第一个参数当接收者）、构造器引用。要注意区分第二与第三种。
- **`default` 方法的动机**：**向后兼容地给接口加方法**（Java 8 给 `Collection` 加 `stream()`/`forEach()` 时不能破坏所有实现类）。菱形冲突三条规则：**类的方法优先于接口 default → 子接口的 default 优先于父接口 → 都不成立时必须显式重写并用 `接口名.super.方法()` 指定**。
- **Stream 的三个性质**：声明式、**惰性求值**（中间操作不执行，直到终端操作）、**一次性**（重复消费抛 `IllegalStateException`）。惰性的收益是可以短路（`findFirst`/`anyMatch`）与合并遍历（不产生中间集合）。
- **中间操作要分「有状态/无状态」**：`filter`/`map`/`flatMap`/`peek` 无状态、并行友好；`sorted`/`distinct`/`limit`/`skip` 有状态、需要全局协调、**并行时可能更慢**。`peek` 官方定位是调试，不要用来做业务副作用。
- **并行流的四个坑**：用全局共享的 `ForkJoinPool.commonPool`（默认并行度 = **CPU 核数 − 1**），**IO 任务会占满它并影响同 JVM 其他任务**；有状态操作代价高；装箱拆箱需用 `IntStream` 等特化；共享可变状态会产生竞态。**只适合「数据量大 + 纯 CPU + 无状态 + 不共享可变状态」**。
- **`Collectors.toMap` 的两个坑**：value 为 `null` 抛 NPE（内部走 `map.merge`）、key 重复抛 `IllegalStateException`（必须给合并函数）。
- **Optional 的使用纪律**：只作返回值（不做字段/参数）；不要 `isPresent()` + `get()`；不要放进集合。**`orElse` 无论是否为空都会求值，需要计算默认值时必须用 `orElseGet`。** `Optional.of(null)` 抛 NPE，要用 `ofNullable`。
- **为什么要有新日期时间 API**：`Date` 月份从 0 开始、可变、`SimpleDateFormat` **内部共享 `Calendar` 所以线程不安全**；新 API 全部**不可变**、概念分离（`Instant` 是时刻、`LocalDateTime` 无时区、`ZonedDateTime` 带时区、`Duration` 是时间量、`Period` 是日期量）、`DateTimeFormatter` 线程安全可作静态常量。
- **最关键的区分**：**`LocalDateTime` 不带时区，能唯一确定一个时刻的只有 `Instant` 与 `ZonedDateTime`**。因此 `Date` 与 `LocalDateTime` 互转必须经过时区，否则会出现「差 8 小时」。夏令时场景绝不能用 `LocalDateTime` 做时刻运算。
- **不可变的代价**：所有 `plusXxx`/`withXxx` 返回新对象，**忘记接收返回值不会报错**，是常见遗漏。
