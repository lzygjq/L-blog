---
date: 2026-09-15
title: 泛型：类型擦除与 PECS
sidebar: 泛型
desc: 类型擦除到底擦掉了什么、桥接方法如何保住多态、通配符的上界下界与 PECS 原则，以及框架如何绕过擦除拿到泛型实参
order: 4
---

# 泛型：类型擦除与 PECS

泛型是**面试里最容易「会用但说不清」**的一块。大家每天都在写 `List<String>`，但要解释「为什么不能在运行时判断 `list instanceof List<String>`」「为什么通配符有时候用 `extends` 有时候用 `super`」「`new ArrayList<String>().getClass()` 和 `new ArrayList<Integer>().getClass()` 为什么是同一个类」，就需要把**类型擦除**这个机制讲透。

## 一、泛型要解决什么问题 {#why-generics}

在泛型出现之前（JDK 1.5 以前），集合只能存 `Object`，取出时必须自己强转：

```java
List list = new ArrayList();
list.add("hello");
list.add(123);                                  // 编译器完全不拦
String s = (String) list.get(1);                // ClassCastException，且报错点离肇因很远
```

泛型解决的是**三件事**，而不只是「少写一次强转」：

| 目标 | 具体收益 |
|---|---|
| **编译期类型检查** | 往 `List<String>` 里放 `Integer` 直接编译不过，错误在写代码时就暴露 |
| **消除显式强转** | 取出来就是声明类型，读代码不用在脑子里维护「这个 List 装的是什么」 |
| **API 自描述** | `Map<String, List<Order>>` 一眼能看懂结构，比注释可靠 |

关键在于：**这些都是编译期的保障**。运行期泛型信息不存在——这就是下一节的主题。

## 二、类型擦除：泛型在字节码里长什么样 {#erasure}

### 2.1 擦除规则 {#erasure-rules}

Java 采用**类型擦除（Type Erasure）**实现泛型：编译器在生成字节码时，把泛型信息全部丢掉，只留下「原始类型（raw type）」。

| 声明 | 擦除后 |
|---|---|
| `<T>`（无界） | `Object` |
| `<T extends Number>` | `Number`（**第一个**边界） |
| `<T extends Number & Comparable<T>>` | `Number`（多边界只保留第一个，其余只用于编译期检查） |
| `List<String>` / `List<Integer>` | `List` |
| `Map<String, List<Order>>` | `Map` |

可以自己用 `javap -c` 验证：`List<String> list = new ArrayList<>(); list.add("a"); String s = list.get(0);` 的字节码里，`add` 和 `get` 的操作数类型都是 `Object`，`get` 之后会跟一条 `checkcast java/lang/String`。

**所以「泛型是给编译器看的」这句总结是准确的**：编译期用它做类型检查，检查通过后插入必要的 `checkcast` 保证运行期不会拿到错类型，然后把这些信息丢掉。

### 2.2 由此产生的一系列限制 {#erasure-limits}

擦除机制直接决定了下面这些「为什么不能」，每一条都能追到同一个根因：

| 限制 | 原因 |
|---|---|
| **不能用基本类型做类型参数**（`List<int>` 不合法） | 擦除后类型参数要能变成 `Object`，而基本类型不是引用类型。必须用包装类，代价是装箱（JDK 21 仍如此，值类型要等 Valhalla 项目） |
| **不能 `new T()`、`new T[]`** | 运行期不知道 `T` 是什么，无法确定要构造哪个类、要分配多大数组 |
| **不能 `instanceof List<String>`** | 运行期只有 `List`，这条判断等价于 `instanceof List`（无意义）。可以写 `instanceof List<?>` |
| **不能取 `List<String>.class`** | 类字面量只有 `List.class`；参数化类型没有对应的 `Class` 对象 |
| **泛型类里不能有使用类型参数的静态成员** | 静态成员属于类级别、先于实例存在，而类型参数是**每个实例化**才确定的 |
| **不能 `catch (T e)`，泛型类不能继承 `Throwable`** | 异常表需要在编译期写出确定的类型 |
| **不能重载「擦除后签名相同」的方法** | `void f(List<String>)` 与 `void f(List<Integer>)` 擦除后都是 `f(List)`，构成「签名冲突」（name clash） |

对泛型数组，有一个受限的绕法（能看到 `@SuppressWarnings` 就说明在用）：

```java
@SuppressWarnings("unchecked")
static <T> T[] newArray(int size) {
    return (T[]) new Object[size];   // 数组本身是 Object[]，运行期若被当作 String[] 用会 CCE
}
```

**更好的做法是「让调用方提供数组」**——这也是 JDK 自己解决这个问题的办法，那个看着很怪的 `toArray(T[] a)` 签名正是为此存在：

```java
List<String> list = new ArrayList<>();
String[] arr = list.toArray(new String[0]);    // 由调用方提供类型信息
```

### 2.3 一个直观的印证 {#same-class}

```java
List<String> a = new ArrayList<>();
List<Integer> b = new ArrayList<>();
System.out.println(a.getClass() == b.getClass());     // true —— 都是 java.util.ArrayList
```

运行期没有任何「`ArrayList<String>` 这个类」。这也是为什么**用泛型参数做「重载」必然失败**：编译器看到的两个方法，擦除后是同一个签名。

## 三、通配符与 PECS {#pecs}

### 3.1 先理解「不变」与数组的对照 {#invariance}

Java 的泛型是**不变的（invariant）**：`List<String>` 不是 `List<Object>` 的子类型。而数组是**协变的（covariant）**：`String[]` 是 `Object[]` 的子类型。

```java
// 数组：编译通过，运行期才炸
Object[] arr = new String[1];
arr[0] = 123;              // ArrayStoreException —— 运行期检查

// 泛型：编译期就拦住
List<Object> list = new ArrayList<String>();   // 编译错误
```

**这就是「数组协变被证明是设计失误、泛型选择不变」的完整论据**：数组把类型检查推迟到了运行期（坏），泛型把它提前到编译期（好）。代价是泛型写起来更啰嗦——需要用通配符把「安全的协变」显式表达出来。

### 3.2 三种通配符的能力边界 {#wildcard-types}

```java
List<?>              // 未知类型
List<? extends Number>   // Number 或其子类
List<? super Integer>    // Integer 或其父类
```

| 类型 | 能否读 | 能否写 | 读出来是什么类型 |
|---|---|---|---|
| `List<Object>` | 能 | 能 | `Object` |
| `List<?>` | 能 | **只能写 `null`** | `Object` |
| `List<? extends Number>` | 能 | **不能写** | `Number`（知道上界） |
| `List<? super Integer>` | 能 | 能写 `Integer` 及其子类 | `Object`（只有下界） |

**「不能写」的原因**值得讲清：对 `List<? extends Number>`，编译器不知道它实际是 `List<Integer>` 还是 `List<Double>`。往里写 `Integer` 就会污染 `List<Double>` 的语义，所以除了 `null` 一律禁止。**「读出来是 `Number`」**是因为不管实际类型是哪个，它一定是个 `Number`。

对 `List<? super Integer>`，写 `Integer` 一定安全（不管实际是 `List<Integer>`、`List<Number>` 还是 `List<Object>`，都装得下 `Integer`）；但读出来只能是 `Object`（因为不知道上界在哪）。

### 3.3 PECS 原则 {#pecs-rule}

> **PECS = Producer Extends, Consumer Super**
> 参数是**生产者**（你要从中读数据）→ 用 `? extends T`
> 参数是**消费者**（你要往里写数据）→ 用 `? super T`

```java
// 生产者：从 src 读出元素放进 dest → src 用 extends，dest 用 super
public static <T> void copy(List<? super T> dest, List<? extends T> src) {
    for (T t : src) dest.add(t);
}
```

JDK 里两个可对照的实例：

```java
// Collections.addAll：把元素写进 c → 消费者 → super
public static <T> boolean addAll(Collection<? super T> c, T... elements)

// Collections.max：从 coll 读元素比较 → 生产者 → extends（且带 Comparable 的经典自引用写法）
public static <T extends Object & Comparable<? super T>> T max(Collection<? extends T> coll)
```

`Comparable<? super T>` 这个「自引用上界」是另一个高频追问：如果写成 `Comparable<T>`，那么 `List<Dog>` 在 `Dog implements Comparable<Animal>` 时就无法调用 `max`——因为 `Dog` 的 `Comparable` 实参是 `Animal` 而不是 `Dog`。用 `? super T` 放宽后，任何「能比较自己或其父类」的类型都能用。**这是 PECS 用在类型变量边界上的例子，不只是方法参数**。

**记忆辅助**：`? extends` 读得出来、写不进去；`? super` 写得进去、读出来是 `Object`。所以「**要读就用 extends，要写就用 super**」和 PECS 是同一句话。

### 3.4 一个常见误解 {#wildcard-vs-object}

`List<?>` 与 `List<Object>` 的区别必须能说清：

- `List<?>` 可以接收 `List<String>`、`List<Integer>` 等**任何**参数化 `List`。
- `List<Object>` 只能接收 `List<Object>`（因为泛型不变）。
- 但 `List<?>` 基本是只读的，`List<Object>` 可读可写。

实践建议：**方法参数优先用通配符写（`List<? extends T>`），方法返回值不要用通配符**（会把类型不确定性传染给调用方）。

## 四、桥接方法：擦除之后多态为什么还在 {#bridge-method}

这是泛型与多态交叉处最漂亮的一个机制，也是「泛型擦除后重写还能生效吗」的答案。

```java
class Node<T> {
    private T data;
    public void setData(T data) { this.data = data; }   // 擦除后：setData(Object)
}

class StringNode extends Node<String> {
    @Override
    public void setData(String data) { /* ... */ }      // 擦除后：setData(String)
}
```

`StringNode` 里的 `setData(String)` 擦除后签名是 `setData(String)`，而父类的是 `setData(Object)`——**两个签名不同，按 JVM 规则这不算重写**，那么多态就该失效：`Node<String> n = new StringNode(); n.setData("x")` 会调进父类的实现。

为了让多态成立，**javac 会自动生成一个桥接方法**：

```java
// javap 会把下面这个方法标成 ACC_BRIDGE | ACC_SYNTHETIC
public void setData(Object data) {
    setData((String) data);       // 转发到真正的 String 版本，中间带一次强转
}
```

于是父类的 `setData(Object)` 被这个桥接方法覆盖，多态恢复了。

**能解释三个现象**：

1. **反射时看到「多出来」的方法**：`StringNode.class.getDeclaredMethods()` 返回数组里会包含 bridge 方法（`Method#isBridge()` 返回 `true`），用 `getDeclaredMethods().length` 数方法会数多。写通用反射代码（比如自己实现 JSON 序列化）时必须过滤掉 bridge/synthetic 方法。
2. **为什么反射调用泛型方法有时抛 `ClassCastException`**：桥接方法里那次强转是编译器插的，传错类型时炸在这里，堆栈里看到的是 `StringNode.setData` 但调用方明明传对了类型——原因就是走到了桥接方法的强转。
3. **为什么 `@Override` 在泛型重写上是必须的**：它能帮你在编译期抓住「其实没重写成功」的错误（比如把 `String` 写成了 `Object`）。

## 五、框架怎么绕过擦除拿到泛型 {#generic-reflection}

擦除丢掉了运行期信息，但**编译期把泛型签名写进了 class 文件的 `Signature` 属性**——框架正是从这里读回来的。这解释了一个反直觉的事实：**运行期拿不到泛型实参，除非你通过「继承」把它固化下来**。

```java
class StringList extends ArrayList<String> { }

Type t = StringList.class.getGenericSuperclass();        // ArrayList<String>
if (t instanceof ParameterizedType pt) {
    Type actual = pt.getActualTypeArguments()[0];        // class java.lang.String
}
```

而直接 `new ArrayList<String>().getClass().getGenericSuperclass()` 拿到的只是 `java.util.AbstractList<E>`——因为是「使用」而不是「继承」，实参信息没被固化。

这就是那些看着很怪的写法的原理：

```java
// Jackson 用它做反序列化：new TypeReference<List<User>>() {}
new TypeReference<List<User>>() {}
```

匿名子类 `TypeReference<List<User>>{}` 就是一次「继承」，泛型实参被写进了匿名类的 `Signature`，`getGenericSuperclass()` 就能读出来。同类设计还有 Guava 的 `TypeToken`、Spring 的 `ParameterizedTypeReference`。

**用得到的具体 API**：

| API | 用途 |
|---|---|
| `Class#getGenericSuperclass()` | 拿父类的泛型签名 |
| `Class#getGenericInterfaces()` | 拿接口的泛型签名 |
| `ParameterizedType#getActualTypeArguments()` | 拿实参列表 |
| `Field#getGenericType()` / `Method#getGenericReturnType()` | 拿字段/方法返回值上的泛型 |
| `TypeVariable#getBounds()` | 拿类型变量的边界 |

**约束**：只能解析**一层**泛型。`List<List<String>>` 这种嵌套要靠递归解析；`TypeVariable` 表示「还是个未定类型参数」，需要结合上下文（子类链）继续向上推。这也说明「为什么把泛型工具写通用很难」——要处理的 `Type` 子类型有 `Class`、`ParameterizedType`、`TypeVariable`、`GenericArrayType`、`WildcardType` 五种。

## 六、常见坑速查 {#pitfalls}

| 坑 | 现象 | 根因 |
|---|---|---|
| 用基本类型参数 | `List<int>` 编译不过 | 擦除后要变成 `Object`，基本类型不是引用类型 |
| 写 `instanceof List<String>` | 编译不过 | 运行期只有 raw type，泛型实参不存在 |
| 泛型类型重载 | 「name clash: same erasure」 | `List<String>` 与 `List<Integer>` 擦除后签名相同 |
| `new T[]` | 编译不过 | 运行期不知道 `T`，无法确定数组元素类型 |
| 反射时数方法数不对 | 多出若干方法 | 编译器生成的桥接方法（`isBridge()`）与合成方法（`isSynthetic()`） |
| 堆污染（heap pollution） | 运行期 `ClassCastException`，位置离肇因很远 | 泛型可变参数与 `(T[]) new Object[]` 这类 unchecked 操作，编译期只给警告 |
| 泛型可变参数告警 | `Possible heap pollution` | 可变参数本质是数组，泛型数组不合法；确认安全后加 `@SafeVarargs`（只能标在 `static`/`final`/`private` 方法或构造器上） |
| 通配符当成 `Object` 用 | `List<? extends Number>` 里 `add(1)` 编译不过 | 通配符上界只保证「读出来是 Number」，不保证「能写进 Number」 |
| 返回值带通配符 | 调用方到处被迫处理类型不确定性 | 通配符应只出现在方法参数上 |
| 运行期取泛型实参失败 | `getActualTypeArguments()` 拿到 `TypeVariable` | 没有通过继承固化实参——必须用匿名子类/具名子类（`TypeReference` 模式） |

## 面试口径

- **泛型的价值**：编译期类型检查、消除显式强转、API 自描述。**全部是编译期收益**——运行期泛型信息不存在。
- **类型擦除规则**：无界类型变量擦成 `Object`，有界擦成**第一个边界**（`<T extends A & B>` 只保留 `A`），参数化类型擦成原始类型。编译器在需要的地方插入 `checkcast`，所以运行期不会拿到错类型。
- **擦除带来的限制**（一串「为什么不能」的同一个根因）：不能是基本类型、不能 `new T()`/`new T[]`、不能 `instanceof List<String>`、不能 `List<String>.class`、泛型类不能有使用类型参数的静态成员、擦除后签名相同的不能重载。绕泛型数组的正解是**让调用方提供数组**（即 `toArray(T[] a)` 那种签名）。
- **数组协变 vs 泛型不变**：`Object[] a = new String[1]; a[0] = 1;` 编译通过、运行期 `ArrayStoreException`；`List<Object> l = new ArrayList<String>()` 直接编译不过。**泛型刻意选择了不变**，把检查提前到编译期，代价是要用通配符显式表达安全的型变。
- **PECS**：Producer Extends、Consumer Super。`? extends T` 能读不能写（未知具体子类，写了会污染），`? super T` 能写但读出来是 `Object`。经典实例：`Collections.addAll(Collection<? super T>, T...)` 用 super；`Collections.max(Collection<? extends T>)` 用 extends，且带 `Comparable<? super T>` 的自引用上界（放宽成 `super` 才能接受「实现了比较父类」的类型）。
- **`List<?>` vs `List<Object>`**：`List<?>` 能接收任何参数化 `List` 但几乎只读；`List<Object>` 只能接收 `List<Object>`，可读写。
- **桥接方法**：擦除会让「子类重写泛型方法」的签名与父类不一致，javac 自动生成一个 `ACC_BRIDGE | ACC_SYNTHETIC` 的方法（参数类型是擦除后的类型，内部强转后转发），用它覆盖父类方法以保住多态。副作用是**反射会多看到方法**（要过滤 `isBridge()`），以及桥接方法里的强转可能成为 `ClassCastException` 的发生点。
- **运行期取泛型实参**：编译期把泛型签名写进 class 的 `Signature` 属性，但只有**通过继承固化**才读得到——这正是 Jackson 的 `TypeReference`、Guava 的 `TypeToken`、Spring 的 `ParameterizedTypeReference` 都要求写成**匿名子类**的原因。
- **`@SafeVarargs`**：泛型可变参数会触发「可能的堆污染」警告；确认方法内不会把数组暴露出去（不写入、不外泄）时可标 `@SafeVarargs` 关闭警告，但它只能加在 `static`/`final`/`private` 方法或构造器上。
