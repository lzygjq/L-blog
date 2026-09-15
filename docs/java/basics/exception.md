---
date: 2026-09-15
title: 异常体系与 finally 的执行真相
sidebar: 异常体系
desc: 受检与非受检的分歧、try/catch/finally 的真实执行顺序与字节码实现、try-with-resources 的压制异常、以及异常设计里最常见的三个反模式
order: 3
---

# 异常体系与 finally 的执行真相

异常处理是最「看起来都会、追问答不出」的领域。面试官问「`finally` 一定会执行吗」，答「一定会」是错的；问「`finally` 里 `return` 会怎样」，多数人只能背结论说不出机制。这一篇把异常当成**一段有明确字节码落地的控制流**来讲，而不是一组要背的类名。

## 一、异常体系全景 {#hierarchy}

```
Throwable（唯一能被 throw 的根）
├── Error                     不可恢复的严重问题，程序不应尝试捕获
│   ├── OutOfMemoryError         堆/元空间/直接内存耗尽
│   ├── StackOverflowError       栈深度超限（典型原因：无限递归）
│   └── NoClassDefFoundError     运行时找不到类（编译期存在、运行期缺失）
└── Exception
    ├── RuntimeException        【非受检】运行时异常
    │   ├── NullPointerException
    │   ├── IllegalArgumentException / IllegalStateException
    │   ├── IndexOutOfBoundsException
    │   ├── ClassCastException
    │   ├── ArithmeticException
    │   └── ConcurrentModificationException
    └── 其他 Exception           【受检】编译期强制处理
        ├── IOException（含 FileNotFoundException、SocketException）
        ├── InterruptedException
        ├── SQLException
        └── ReflectiveOperationException
```

四条必须记住的性质：

1. **只有 `Throwable` 及其子类能被 `throw`**，也是 `catch` 的合法类型。Java 里没有「任意对象当异常」这回事。
2. **`catch (Exception e)` 抓不到 `Error`**，因为它们不是父子关系。想让兜底逻辑连 `Error` 一起拦，必须写 `catch (Throwable t)`——但**生产代码几乎不该这么做**，`OutOfMemoryError` 之后进程状态已经不可信。
3. **`Error` 与 `RuntimeException` 及其子类合称「非受检异常」**（unchecked），编译器不强制处理；其余 `Exception` 子类是**受检异常**（checked）。
4. **`Throwable` 自带四个信息**：`getMessage()`（描述）、`getCause()`（根因，构成异常链）、`getStackTrace()`（栈帧快照）、`getSuppressed()`（被压制的异常，见第四节）。

**异常链是排查的生命线**：`new BizException("下单失败", e)` 里的 `e` 就是 cause，`printStackTrace()` 会打印 `Caused by:` 那一串。丢了 cause 等于把现场销毁——这是最高频的代码缺陷之一。

## 二、受检与非受检：一次真实的语言设计分歧 {#checked-vs-unchecked}

| 维度 | 受检异常 | 非受检异常 |
|---|---|---|
| 编译期强制 | **必须** `catch` 或 `throws`，否则编译不过 | 无要求 |
| 代表 | `IOException`、`SQLException`、`InterruptedException` | `NullPointerException`、`IllegalStateException` |
| 设计意图 | 调用方**有能力且应该**恢复（重试、换路径、提示用户） | 调用方**无能为力**，是编程错误（参数非法、状态不对） |
| 典型场景 | 网络 IO、文件操作、外部系统调用 | 参数校验、契约违反 |

**为什么会有受检异常**：Java 早期希望「编译器逼着调用方处理每一个可能失败的操作」。这个目标本身没问题，但实践中暴露了三个问题，也是「现在主流框架都倾向非受检」的原因：

1. **API 传染**：底层方法 `throws IOException`，上面每一层都得跟着声明或包装，中间层的签名被下游实现细节污染。
2. **诱导错误的处理方式**：为了编译通过，大量代码写成 `catch (Exception e) { }` 或 `e.printStackTrace()`——比不处理更糟。
3. **函数式接口不兼容**：`Stream`、`Optional` 的接口方法都没有 `throws`，受检异常在里面根本用不了，必须包成非受检。

**现代实践的两条主流路线**：

- **Spring 风格**：DAO 层的受检异常（`SQLException`）在框架内部统一转成非受检的 `DataAccessException` 体系，业务层不用关心底层技术异常。
- **校验前置 + 统一异常处理**：用非受检异常表达业务失败（`BizException`），由全局异常处理器（`@ControllerAdvice`）统一转成响应，避免异常类型泄漏到接口层。

> **面试口径别走极端**：说「受检异常完全是设计失误」也不对。**唯一被公认为「受检异常用对了」的场景是 `InterruptedException`**——它表达的是「有人请你停下来」，这个信号必须被显式处理（要么退出、要么恢复中断标记），编译期强制反而是好事。

## 三、try / catch / finally 的真实执行顺序 {#finally-order}

### 3.1 先建立正确的模型 {#correct-model}

`finally` 的正确表述不是「一定会执行」，而是：

> **只要进入过 try 块，`finally` 就会执行**——无论 try 是正常结束、抛异常、还是被 `return`/`break`/`continue` 中断。

**四种不执行的情况**（面试高频）：

| 情况 | 说明 |
|---|---|
| 根本没进入 try | 在 try 之前就抛了异常，或线程已被中断 |
| **`System.exit()`** | 直接终止 JVM，`finally` 没有机会跑 |
| JVM 崩溃 / 被强杀 | `kill -9`、`Runtime.halt()` |
| **try 所在线程被终止** | 线程在执行 try 中途被 `stop()`（已废弃）或意外死亡 |

### 3.2 执行顺序的三种典型形态 {#three-forms}

```java
// 形态一：正常结束
try { return 1; } finally { System.out.println("finally"); }
// 输出：finally  然后返回 1

// 形态二：异常传播
try { throw new RuntimeException(); } finally { System.out.println("finally"); }
// 输出：finally  然后异常继续往上抛

// 形态三：finally 里 return —— 吞掉异常 + 覆盖返回值
try { throw new RuntimeException("boom"); } finally { return 2; }
// 结果：不抛异常，返回 2  ← 异常被彻底吞掉，这是最危险的写法
```

**形态三是重点**：`finally` 里的 `return` 会（a）丢弃 try 中正在传播的异常，（b）覆盖 try 中的返回值。所以**`finally` 里绝对不要写 `return`**——静态检查工具默认会报这个警告，不是风格洁癖。

### 3.3 `finally` 修改返回值为什么有时无效 {#modify-return}

```java
// 基本类型：改不动
static int f() {
    int x = 1;
    try { return x; }        // 此时返回值已被复制到栈上的返回槽
    finally { x = 100; }     // 改的是局部变量，不影响已复制的返回值
}
// 返回 1

// 引用类型：改得动（改的是对象内部，不是引用本身）
static StringBuilder g() {
    StringBuilder sb = new StringBuilder("a");
    try { return sb; }
    finally { sb.append("b"); }   // 对象还是同一个，内容被改了
}
// 返回 "ab"
```

判据：**`return` 语句执行时，返回值已经确定下来了**。基本类型复制的是值本身；引用类型复制的是引用（地址），所以通过这个引用去改对象内容是可见的，而重新赋值 `sb = new StringBuilder()` 则不可见。

### 3.4 字节码层面：`finally` 是怎么实现的 {#bytecode}

`finally` **不是一条 JVM 指令**，而是编译器做的代码复制。javac 会把 `finally` 块的内容**复制三份**：

```
正常路径：try 体结束 → 执行 finally 副本 → 继续往下
异常路径：异常表捕获任意异常 → 执行 finally 副本 → athrow 重新抛出
提前返回：return/break 前 → 执行 finally 副本 → 再真正 return
```

对应到 `异常表（exception table）`，每个 `try` 块会生成若干条记录，形如：

```
from  to  target  type
  4    18   30    any      ← any 表示「任意 Throwable」，捕获后先跑 finally 再 athrow
```

**这就是为什么**：方法里有大段 `finally` 时代码体积会明显膨胀；也是为什么 `finally` 里的异常会「顶替」try 里的异常（异常表里 `athrow` 那一步被 `finally` 内部先抛出的异常打断了）。

### 3.5 try-with-resources 与压制异常 {#twr}

```java
try (InputStream in = new FileInputStream("a.txt");
     OutputStream out = new FileOutputStream("b.txt")) {
    // 使用 in / out
} catch (IOException e) {
    // 这里能拿到 in.close() 抛出的异常，同时被 close 吞掉的原异常在 e.getSuppressed() 里
}
```

三个机制细节：

| 细节 | 说明 |
|---|---|
| **关闭顺序** | **逆序**关闭（后声明的先关），与嵌套 `try/finally` 的语义一致 |
| **压制异常（suppressed）** | 如果 try 体抛了异常 A、关闭时又抛了异常 B，**A 是主异常、B 被 `addSuppressed` 记为压制异常**，A 不会被 B 顶替。这比手写 `try/finally` 的「后抛的覆盖先抛的」正确得多 |
| **资源类型** | 必须实现 `AutoCloseable`（`close()` 可抛任意异常）；`Closeable` 是它的子接口，`close()` 只抛 `IOException` |

**手动写 try/finally 关闭资源的三个典型错误**（也是 try-with-resources 存在的理由）：① 忘记判空导致 NPE；② 关闭异常覆盖了业务异常；③ 第二个资源的关闭写在了第一个 `finally` 里，第一个资源关闭失败时第二个不会被关。

**JDK 9 的小改进**：如果资源变量已经是 effectively final，可以直接写 `try (in)`，不必重复声明。

**关于 `InterruptedException`**：`try` 体里收到中断，异常链会是 `InterruptedException` 打头。catch 块里必须恢复中断标记（`Thread.currentThread().interrupt()`），否则上层再也感知不到中断请求——这条与 [线程基础](/java/concurrent/thread-basics#stop-thread) 里讲的是同一件事。

## 四、异常处理的三个反模式 {#anti-patterns}

### 4.1 吞异常 {#swallow}

```java
// 反模式
try { doSomething(); } catch (Exception e) { }

// 反模式
try { doSomething(); } catch (Exception e) { log.error("出错了"); }   // 丢了堆栈

// 正确
try { doSomething(); }
catch (SpecificException e) {
    log.error("处理订单 {} 失败", orderId, e);   // 传 e，不要 e.getMessage()
    throw new BizException("订单处理失败", e);    // 保留 cause
}
```

**为什么不能只打印 `e.getMessage()`**：`getMessage()` 只有一行描述，丢掉了类名和整条调用链——而定位问题靠的正是「哪一行、谁调的、根因是什么」。日志框架的正确用法是把异常对象作为**最后一个参数**传入，由框架负责打印堆栈。

### 4.2 既记日志又抛出 {#log-and-throw}

```java
// 反模式：同一异常被打印多次
catch (IOException e) {
    log.error("读取失败", e);
    throw new BizException("读取失败", e);     // 上层还会再记一次
}
```

同一次故障在日志里出现三遍、每遍都是完整堆栈，真正的有用信息被淹没。规则很简单：**要么处理并记录，要么包装并抛出，二者只选一个**。通常的分配是——**在异常最终被「消费」的那一层记日志**（全局异常处理器），底层只负责包装和传递。

### 4.3 用异常做流程控制 {#exception-as-flow}

```java
// 反模式
try {
    return list.get(index);
} catch (IndexOutOfBoundsException e) {
    return defaultValue;           // 用异常判断边界
}

// 正确
return index >= 0 && index < list.size() ? list.get(index) : defaultValue;
```

性能代价很实在：异常构造时 `fillInStackTrace()` 要遍历整个调用栈快照，**一次异常创建的开销在微秒级**（比一次普通方法调用贵三到四个数量级）。放在循环里会让吞吐量断崖下跌。

这衍生出一个知识点：如果想用异常做控制流（比如状态机里频繁抛），可以**重写 `fillInStackTrace()` 直接 `return this`**，把堆栈采集关掉——代价是排查时看不到调用链。绝大多数业务场景不该这么做，但要知道这个开关存在。

## 五、其余高频细节 {#more-details}

| 主题 | 要点 |
|---|---|
| **多重 catch** | JDK 7 起支持 `catch (IOException \| SQLException e)`，且 `e` 是 **implicitly final**，不能再赋值。多个异常类型之间是「或」的关系，不能有父子包含 |
| **`throw` 与 `throws`** | `throw` 抛出一个异常实例；`throws` 声明方法可能抛出的异常类型，只是编译期的契约 |
| **返回类型与异常** | 重写方法抛出的异常不能比父类方法**更宽**（可以更窄或干脆不抛），否则违反里氏替换 |
| **静态初始化块里的异常** | 抛 `RuntimeException` 会让类变成「初始化失败」状态，之后任何访问都报 `NoClassDefFoundError`——极难排查 |
| **`ExceptionInInitializerError`** | 专门用于包装静态初始化块中抛出的非 `Error` 异常 |
| **helpful NPE** | **JDK 14（JEP 358）引入、JDK 15 起默认开启**：空指针消息会指明「哪个变量/哪个方法调用的返回值为 null」，不再只有一行 `null`，省去来回猜的功夫 |
| **`Optional` 替代返回 null** | 只用于返回值，不要用于字段和参数；`orElse` 无论是否命中都会求值，需要延迟计算就用 `orElseGet`（见 [Java 8 特性](/java/basics/java8#optional)） |
| **竞态下的异常** | `ConcurrentModificationException` 是「尽力检测」而非强保证，不能靠它做并发正确性判断 |

## 六、常见坑速查 {#pitfalls}

| 坑 | 现象 | 根因 |
|---|---|---|
| `finally` 里写 `return` | 异常被吞、返回值被改 | `finally` 的 `return` 会丢弃 try 中正在传播的异常 |
| 只 `catch (Exception e)` 不记 cause | 日志只有一行描述，无法定位 | 丢掉了异常链与堆栈 |
| 既 `log.error` 又 `throw` | 同一故障日志出现多遍 | 记录与抛出的职责重叠，应只在最终消费层记录 |
| 手写 try/finally 关资源 | 关闭异常覆盖业务异常、资源漏关 | 没有 suppressed 机制；正确做法是 try-with-resources |
| 忘记恢复中断标记 | 上层感知不到线程中断 | catch 到 `InterruptedException` 后未 `interrupt()` |
| 用异常做边界判断 | 循环里吞吐暴跌 | `fillInStackTrace()` 采集整条调用栈，开销极高 |
| `catch (Throwable)` | 连 `OutOfMemoryError` 一起吞掉，进程状态不可信 | `Error` 不属于 `Exception` 分支，不该兜底捕获 |
| 静态块里抛异常 | 后续所有访问该类的地方都报 `NoClassDefFoundError` | 类初始化失败会「记住」这个状态 |
| 包装异常丢 cause | `Caused by` 链断了 | `new BizException(msg)` 没传原异常 |
| 受检异常在 Stream 里用不了 | 必须写 try/catch 包成非受检 | 函数式接口方法签名没有 `throws` |

## 面试口径

- **体系结构**：`Throwable` → `Error` / `Exception`；`Exception` 再分 `RuntimeException`（非受检）与其他（受检）。`catch (Exception e)` 抓不到 `Error`，因为二者是兄弟分支不是父子。
- **受检 vs 非受检**：受检异常要求调用方「有能力恢复」，编译期强制 `catch`/`throws`；非受检表达编程错误。受检异常的现实问题是 **API 传染**、诱导 `catch (Exception e) {}`、与函数式接口不兼容，所以现代框架普遍转成非受检（典型如 Spring 把 `SQLException` 转成 `DataAccessException`）。**唯一公认用对了的受检异常是 `InterruptedException`。**
- **`finally` 一定会执行吗**：只要进入过 try 就会执行；**不执行**的四种情况是——没进 try、`System.exit()`、JVM 崩溃/被强杀、执行线程被终止。
- **`finally` 与 `return` 的交互**：`finally` 里的 `return` 会**覆盖返回值并丢弃正在传播的异常**，所以不要写。`finally` 修改基本类型返回值无效（返回值已复制），修改引用类型的对象内容有效。
- **`finally` 的实现**：不是 JVM 指令，而是编译器把 `finally` 块**复制到正常路径、异常路径、提前返回路径**三处，配合异常表的 `any` 条目在跑完 `finally` 后 `athrow` 重新抛出。因此代码量会膨胀，也解释了「`finally` 里抛异常会顶替原异常」。
- **try-with-resources 的优势**：逆序关闭、**压制异常**（`getSuppressed()`，try 体的异常是主异常不被`close` 的异常顶替）、不需要手写判空。资源必须实现 `AutoCloseable`；JDK 9 起可直接复用 effectively final 的变量。
- **三个反模式**：吞异常（`catch (Exception e) {}` 或只打 `getMessage()`）、既记日志又抛出（同一次故障日志重复）、用异常做流程控制（`fillInStackTrace` 开销高，微秒级）。
- **日志正确写法**：`log.error("处理订单 {} 失败", orderId, e)`——把异常对象作为最后一个参数传，由框架打印堆栈；**不要 `e.printStackTrace()`**（输出到标准错误，绕过日志框架、无法采集）。
