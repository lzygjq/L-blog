---
date: 2026-09-15
title: String 与包装类
sidebar: String 与包装类
desc: String 为什么不可变、字符串常量池与 intern、JDK 9 的紧凑字符串、自动装箱缓存范围与那个经典的 Integer 比较题、BigDecimal 精度
order: 2
---

# String 与包装类

`String` 和八个包装类看起来是最没有技术含量的内容，但它们是**面试里翻车率最高的一块**——因为几乎所有「诡异现象」都由它们产生：`Integer` 比较时好时坏、`==` 和 `equals` 结果不一致、`0.1 + 0.2 != 0.3`、字符串拼接在循环里拖垮性能。把这些现象背后的机制讲清楚，基础题就变成了送分题。

## 一、String 为什么设计成不可变 {#why-immutable}

`String` 类本身是 `final` 的，内部存放字符的数组也是 `final` 的，并且**不提供任何修改内容的方法**（`substring`、`replace` 都是返回新对象）。这个设计换来四件事：

| 收益 | 具体说明 |
|---|---|
| **可安全共享** | 不可变对象天然线程安全，多个线程读同一个 `String` 不需要任何同步 |
| **可缓存哈希值** | `String` 内部懒加载缓存了 `hashCode`（因为内容不变，算一次就够）。这让 `String` 成为 `HashMap` 最理想的 key——高频 key 的哈希只算一次 |
| **支撑常量池** | 只有不可变才能安全地把同一个实例发给无数处引用；可变的话一处修改会「污染」所有引用者 |
| **安全性** | 类名、SQL、文件路径、URL 都用 `String` 传递；如果可变，校验通过之后被篡改就能绕过安全检查 |

**追问「不可变是不是绝对」**：通过反射改 `String` 内部的 `byte[]`（JDK 9+）是可以的，但那属于「打破封装」，不在语义承诺范围内。另外 `String` 的不可变是**浅不可变**——它只保证自己内部的引用不变，这也是为什么 `String` 不该持有可变对象（当前实现里只有基本类型数组，所以是纯不可变的）。

## 二、字符串常量池与 intern {#string-pool}

### 2.1 两种创建方式的本质区别 {#two-ways}

```java
String a = "abc";              // ① 字面量：编译期进入 class 文件的常量池
String b = "abc";              // 同一个常量池引用
String c = new String("abc");  // ② new：在堆上新建对象
String d = c.intern();         // 手动入池，返回池中那个引用

System.out.println(a == b);    // true  —— 同一个对象
System.out.println(a == c);    // false —— 一个在池、一个在堆
System.out.println(a == d);    // true  —— intern() 返回池中已有引用
System.out.println(a.equals(c)); // true —— 内容相同
```

`new String("abc")` 到底创建几个对象？标准答案是**一个或两个**：如果常量池里还没有 `"abc"`，则先创建池中字面量对象、再创建堆对象（两个）；如果已有，则只在堆上创建（一个）。注意「字面量对象」在类加载时就已经放进池里了，所以绝大多数情况下这里是**只创建一个堆对象**。

### 2.2 常量池在哪 {#pool-location}

| 版本 | 字符串常量池的位置 |
|---|---|
| JDK 6 及以前 | 方法区（当时的**永久代** PermGen） |
| **JDK 7 起** | 移到**堆**里 |
| JDK 8 起 | 永久代被元空间（Metaspace，本地内存）取代，但常量池**仍在堆里** |

移到堆里的原因很实际：永久代空间小、且由 `-XX:MaxPermSize` 固定，字符串是最容易把永久代撑爆的东西。搬进堆后既能受益于堆的自动扩容，也能被 GC 正常回收。

这也直接改变了 `intern()` 的语义：**JDK 6 的 `intern()` 会把字符串复制一份进永久代**（复制，池里是新对象）；**JDK 7+ 的 `intern()` 只是把堆里那个对象的引用记进池中**（不复制）。所以「大量用 `intern()` 是否会导致内存暴涨」这个问题的答案在 JDK 7 前后是不同的。

### 2.3 编译期优化：常量折叠 {#constant-folding}

```java
String s1 = "aa" + "bb";            // 编译期直接折叠成 "aabb"，走常量池
final String x = "aa";
String s2 = x + "bb";               // x 是编译期常量 → 同样折叠
String s3 = new String("aa") + "bb"; // 运行期拼接 → 新对象
```

在 Java 里这类题的标准判据只有一条：**只要参与拼接的每一项都是编译期常量（`final` 的基本类型/字符串字面量），结果就进常量池，`==` 为 `true`；只要有任一变量参与，就是运行期生成的新对象**。

## 三、String 的底层结构与拼接 {#string-impl}

### 3.1 从 char[] 到 byte[] {#compact-strings}

| 版本 | 内部存储 | 说明 |
|---|---|---|
| JDK 8 及以前 | `char[] value` | 每个字符固定占 2 字节，拉丁字符也浪费一半 |
| **JDK 9 起** | `byte[] value` + `byte coder` | **紧凑字符串（JEP 254）**：`coder` 标记 `LATIN1`（1 字节/字符）或 `UTF16`（2 字节/字符），纯 ASCII 内容内存直接减半 |

顺带改了 `charAt()`、`length()` 等方法的内部实现，但对外行为不变——**所以「String 底层是 `char` 数组」这个说法在 JDK 9 之后已经过时了**，能指出这一点是加分项。

### 3.2 拼接到底发生了什么 {#concat}

```java
String s = "";
for (int i = 0; i < 10000; i++) {
    s += i;                 // 每次循环都 new 一个 StringBuilder 再 toString
}
```

`+=` 在字节码层面的语义是「新建 `StringBuilder` → `append` → `toString`」，放在循环里就是**一万次对象分配**。正确写法：

```java
StringBuilder sb = new StringBuilder();
for (int i = 0; i < 10000; i++) sb.append(i);
String s = sb.toString();
```

不过要补一句版本细节：**JDK 9 之后，单条语句里的字符串拼接（`"a" + x + "b"`）由 `invokedynamic` 调用 `StringConcatFactory` 生成方法句柄来完成**，不再是「新建 StringBuilder」。这个策略在编译期就能知道所有片段类型，可以预先算好总长度、一次分配、甚至用 `MethodHandle` 直接写入——比 `StringBuilder` 版本更快。**但循环里的 `+=` 依然是每轮一次拼接调用，优化不掉**，所以上面那个循环仍然必须改。

### 3.3 StringBuilder 与 StringBuffer {#stringbuilder-vs-buffer}

| | StringBuilder | StringBuffer |
|---|---|---|
| 线程安全 | 否 | 是（方法上 `synchronized`） |
| 性能 | 高 | 低（每次操作都要抢锁，即使单线程也在做无用同步） |
| 引入版本 | JDK 1.5 | JDK 1.0 |
| 选用 | **默认选它** | 只有确实存在多线程共享同一缓冲区时才用 |

实践结论：`StringBuffer` 存在的理由几乎已经消失——真正需要并发拼字符串时，通常会用局部变量 + 线程封闭，而不是共享一个可变缓冲区。

三者关系与选用：**内容会变且是局部拼接 → `StringBuilder`；内容不变或作为值对象传递 → `String`；跨线程共享同一个缓冲区（罕见）→ `StringBuffer`**。

## 四、包装类与自动装箱 {#boxing-cache}

### 4.1 八个包装类与缓存范围 {#cache-range}

| 包装类 | 缓存范围 | 是否有缓存 |
|---|---|---|
| `Byte` | `-128 ~ 127`（全部） | 是 |
| `Short` | `-128 ~ 127` | 是 |
| `Integer` | **`-128 ~ 127`** | 是（上界可调） |
| `Long` | `-128 ~ 127` | 是 |
| `Character` | `0 ~ 127` | 是 |
| `Boolean` | `TRUE` / `FALSE` 两个常量 | 是 |
| `Float` | — | **否** |
| `Double` | — | **否** |

`Integer` 的缓存上界可以用 `-XX:AutoBoxCacheMax=<n>` 调大（只影响上界，**下界 `-128` 固定不可改**）。这个设计的前提是「`Integer` 是不可变的」——只有当对象不可变时，共享同一个实例才是安全的。

### 4.2 那道经典的比较题 {#classic-question}

```java
Integer a = 100, b = 100;
Integer c = 200, d = 200;
System.out.println(a == b);   // true
System.out.println(c == d);   // false ???
```

原因是装箱走的是 `Integer.valueOf(int)`，而它内部先判断是否落在缓存范围内：命中就返回缓存数组里的实例，否则 `new Integer(...)`。所以 `100` 拿到同一个对象、`200` 拿到两个不同对象。

**由此得出两条工程结论：**

1. **包装类之间一律用 `equals` 比较，或者先拆箱成基本类型再比。** 写 `==` 就是在赌数值范围，而这个赌注会在数据量变大后突然失效——属于最难排查的一类 bug。
2. **同一个对象内的 `==` 反而是真的**：`Integer a = 100; a == a` 恒为 `true`。

### 4.3 拆箱 NPE 与循环装箱 {#unboxing-pitfalls}

三个高频陷阱：

```java
// 陷阱一：三目运算符的隐式拆箱
Map<String, Integer> map = new HashMap<>();
Integer v = map.get("nonexistent");           // null
Integer r = flag ? v : 0;                     // 两个分支一个是 Integer 一个是 int
                                              // → 整个表达式被提升为 int，v 被拆箱 → NPE
```

编译器在「一个分支是包装类、另一个是基本类型」时会对整个三目表达式做**类型统一**，方向是拆箱（因为基本类型优先级更高）。这是 `Integer` 相关的 NPE 里最隐蔽的一种。

```java
// 陷阱二：空集合/空映射下的直接运算
Map<String, Integer> counter = new HashMap<>();
counter.put("k", counter.getOrDefault("k", 0) + 1);   // 正确：getOrDefault 保证非 null
counter.put("k", counter.get("k") + 1);               // 错误：第一次 get 返回 null → NPE
```

```java
// 陷阱三：循环里反复装箱
Long sum = 0L;
for (int i = 0; i < 1_000_000; i++) {
    sum += i;          // 每次 += 都拆箱、相加、再装箱，产生百万个 Long 对象
}
```

正确做法是用基本类型 `long sum = 0L`。这类问题不会报错，只会在压测时表现为「GC 频率异常高」。

### 4.4 为什么 switch 能接收包装类和 String {#switch-support}

`switch` 的表达式类型限定为 `int`（以及可隐式提升到 `int` 的 `char`/`byte`/`short`）。`Integer` 能进 `switch` 是因为**编译器自动拆箱**；`String` 能进 `switch` 是 JDK 7 加的语法糖——编译器把它改写成「先算 `hashCode` 做一次 `switch`，再用 `equals` 逐个确认」，所以**字符串过长或数量多时性能与可读性都会变差**。枚举的 `switch` 则是用序数（`ordinal`）实现的。

反过来说，`switch` 对 `null` 会直接抛 NPE——包装类的 `switch` 之前必须先判空。

## 五、浮点、BigDecimal 与精度 {#bigdecimal}

### 5.1 为什么 0.1 + 0.2 != 0.3 {#float-precision}

```java
System.out.println(0.1 + 0.2);              // 0.30000000000000004
System.out.println(0.1 + 0.2 == 0.3);       // false
```

原因是 `float`/`double` 采用 **IEEE 754 二进制浮点**格式，`0.1` 这样的十进制小数在二进制下是无限循环小数，只能截断存储。**这不是 Java 的 bug，是所有用二进制浮点的语言共有的现象**。

代码里的三条铁律：

- **不要用 `==` 比较浮点**。真要比较，用两数之差的绝对值小于一个容差（`Math.abs(a - b) < 1e-9`）。
- **不要用浮点做金额计算**。用 `BigDecimal` 或者干脆用「分」为单位的 `long`。
- **`float` 只有约 7 位有效数字、`double` 约 15~16 位**，超出部分不精确。

### 5.2 BigDecimal 的两个必知点 {#bigdecimal-rules}

```java
new BigDecimal(0.1);              // 错：0.1000000000000000055511151231257827...
new BigDecimal("0.1");           // 对：用字符串构造，精确
BigDecimal.valueOf(0.1);         // 对：内部走 Double.toString，等价于字符串构造
```

**第一点：一定要用 `String` 构造。** 用 `double` 构造会把浮点误差原样带进来，等于白用。

**第二点：`equals` 与 `compareTo` 语义不同。**

```java
BigDecimal a = new BigDecimal("1.0");
BigDecimal b = new BigDecimal("1.00");
System.out.println(a.equals(b));       // false —— equals 连「标度 scale」一起比
System.out.println(a.compareTo(b));    // 0     —— compareTo 只比数值
```

所以**判断金额相等要用 `compareTo(b) == 0`**，用 `equals` 会在 `"1.0"` 与 `"1.00"` 这种场景下判错。

另外 `BigDecimal` 是**不可变**的：`add`、`multiply` 都返回新对象，`x.add(y)` 不会改变 `x`（写了不接收返回值的代码等于什么都没做）。除法还必须显式给舍入模式，否则除不尽时抛 `ArithmeticException`：

```java
a.divide(b, 2, RoundingMode.HALF_UP);   // 必须给 scale + 舍入模式
```

## 六、常见坑速查 {#pitfalls}

| 坑 | 现象 | 根因 |
|---|---|---|
| 包装类用 `==` 比较 | 小数值 `true`、大数值 `false` | 只有缓存范围内复用实例 |
| 三目运算里有 `null` 包装类 | 抛 NPE | 分支类型不一致触发隐式拆箱 |
| 循环里 `Long sum += i` | GC 频繁、吞吐下降 | 每次运算都拆箱再装箱 |
| `new BigDecimal(0.1)` | 金额出现一长串尾数 | `double` 构造带入了浮点误差 |
| `BigDecimal.equals` 比金额 | `1.0` 与 `1.00` 判为不等 | `equals` 连 `scale` 一起比，应改用 `compareTo` |
| 循环里 `String s += i` | 内存与耗时随长度线性恶化 | 每轮生成新对象，JDK 9+ 的 `invokedynamic` 优化只覆盖单条语句 |
| `SimpleDateFormat` 当静态字段 | 偶发解析出错误日期或抛异常 | 内部 `Calendar` 可变且共享（见 [Java 8 特性](/java/basics/java8#datetime)） |
| `substring` 后持有大字符串 | 老版本里内存不释放 | JDK 7 起 `substring` 会复制（不再共享 `char[]`），旧印象需更新 |

## 面试口径

- **String 为什么不可变**：`final` 类 + `final` 存储 + 不提供修改方法。收益是四件事——可安全共享（线程安全）、可缓存 `hashCode`（利于做 `HashMap` key）、支撑常量池、作为参数传递时不会被篡改（类名、SQL、路径都靠它）。
- **`String s = "a"` 与 `new String("a")`**：前者直接取常量池引用，后者在堆上新建（若池中还没有字面量则连池对象一起创建，共两个）。所以 `==` 为 `false`，`equals` 为 `true`。
- **常量池位置**：JDK 6 在永久代，**JDK 7 起移到堆**。因此 `intern()` 从「复制进池」变成「把堆对象引用记进池」，语义变了。
- **底层结构**：JDK 8 是 `char[]`，**JDK 9 起是 `byte[]` + `coder`（紧凑字符串）**，纯 ASCII 内存减半——所以「String 底层是 char 数组」这个说法已经过时。
- **拼接选型**：局部可变拼接用 `StringBuilder`，跨线程共享缓冲区用 `StringBuffer`，内容不变用 `String`。循环里的 `+=` 一定是灾难；JDK 9 起单条语句的 `+` 由 `invokedynamic` + `StringConcatFactory` 优化，与 `StringBuilder` 无关。
- **Integer 缓存**：范围 `-128 ~ 127`，上界可用 `-XX:AutoBoxCacheMax` 调大、**下界固定**。`Byte`/`Short`/`Long`/`Character` 同范围，`Boolean` 两个常量，`Float`/`Double` **没有缓存**。所以包装类必须用 `equals` 比。
- **最隐蔽的 NPE**：三目运算符两个分支一个是包装类一个是基本类型时整体拆箱；`map.get(k) + 1` 在 key 不存在时拆箱 `null`。
- **`0.1 + 0.2`**：IEEE 754 二进制浮点无法精确表示十进制小数，与 Java 无关。金额一律 `BigDecimal`，且**必须用字符串构造**；比较用 `compareTo` 而非 `equals`（后者比 `scale`）；除法必须给舍入模式；它是不可变的，运算结果必须接收返回值。
