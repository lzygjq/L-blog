---
order: 3
date: 2026-09-11
---

# 装饰者模式（Decorator）

## 一、问题场景

需要给一个对象**动态添加职责**，且这些职责可以任意组合。用继承解决会出现**类爆炸**：

```
基础导出
├── 加密导出
├── 压缩导出
├── 加密+压缩导出        ← 组合一种就要写一个类
├── 加密+水印导出
├── 压缩+水印导出
└── 加密+压缩+水印导出
```

3 种附加功能 → 需要 2³ = 8 个类；功能增加到 5 种就是 32 个类。而且职责是**运行时才确定**的（今天要加签章、明天要加水印），继承是编译期绑定的，根本无法动态组合。

装饰者模式的解法：**每个功能做成一个"包装器"，包装器与被包装者实现同一接口**，于是可以像套娃一样任意嵌套。

## 二、结构与角色

```
┌────────────────┐
│   Component    │  ← 抽象构件：装饰者与被装饰者共同的接口
│ + operation()  │
└───────┬────────┘
   ┌────┴─────┐
┌──┴────────┐ ┌┴──────────────┐
│Concrete   │ │  Decorator    │  ← 抽象装饰者：实现 Component 且持有一个 Component
│Component  │ │ - component   │
│+operation │ │ + operation() │
└───────────┘ └──────┬────────┘
                ┌────┴─────┐
        ┌───────┴───┐ ┌────┴──────┐
        │DecoratorA │ │DecoratorB │  ← 具体装饰者：在调用前后加自己的逻辑
        └───────────┘ └───────────┘
```

**关键设计**：抽象装饰者既**实现** `Component`（所以能被当作 `Component` 使用），又**持有** `Component`（所以能包装另一个 `Component`）——这一"既实现又持有"的结构是它能无限嵌套的原因。

## 三、实现

以"报表导出"为例，功能包括：压缩、加密、加水印。

```java
public interface Exporter {                       // Component
    byte[] export(String content);
}

public class PdfExporter implements Exporter {    // ConcreteComponent
    @Override
    public byte[] export(String content) {
        return ("PDF:" + content).getBytes(StandardCharsets.UTF_8);
    }
}

public abstract class ExporterDecorator implements Exporter {   // Decorator
    protected final Exporter delegate;            // 持有同类型对象 → 可嵌套

    protected ExporterDecorator(Exporter delegate) { this.delegate = delegate; }

    @Override
    public byte[] export(String content) { return delegate.export(content); }
}

public class CompressDecorator extends ExporterDecorator {      // ConcreteDecorator
    public CompressDecorator(Exporter delegate) { super(delegate); }

    @Override
    public byte[] export(String content) {
        byte[] raw = super.export(content);                        // 先让内层处理
        return gzip(raw);                                          // 再加自己的职责
    }
}

public class EncryptDecorator extends ExporterDecorator {
    public EncryptDecorator(Exporter delegate) { super(delegate); }

    @Override
    public byte[] export(String content) {
        return aesEncrypt(super.export(content));
    }
}

public class WatermarkDecorator extends ExporterDecorator {
    public WatermarkDecorator(Exporter delegate) { super(delegate); }

    @Override
    public byte[] export(String content) {
        return addWatermark(super.export(content));
    }
}
```

**客户端按需组合，顺序即执行顺序**（由外向内）：

```java
// 场景一：只要压缩
Exporter e1 = new CompressDecorator(new PdfExporter());

// 场景二：压缩 + 加密（先压缩再加密）
Exporter e2 = new EncryptDecorator(new CompressDecorator(new PdfExporter()));

// 场景三：压缩 + 加密 + 水印
Exporter e3 = new WatermarkDecorator(new EncryptDecorator(new CompressDecorator(new PdfExporter())));

e3.export("月报");   // 调用链：水印 → 加密 → 压缩 → 基础导出
```

四个类覆盖了全部组合——这正是装饰者相对继承的核心收益：**职责的排列组合从"M×N 个类"变成了"M 个装饰类 + 任意嵌套"**。

> 注意：`super.export(content)` 的调用嵌套会形成一个**调用链栈**，顺序由包装顺序决定。写成 `EncryptDecorator(new CompressDecorator(...))` 是"先压缩后加密"；反过来则是"先加密后压缩"——语义完全不同。**这是装饰者最需要小心的地方。**

## 四、源码剖析

### 4.1 Java IO：装饰者的教科书应用

Java IO 是装饰者模式的教科书应用：

```
InputStream                  ← Component
├── FileInputStream          ← ConcreteComponent（直接读文件的"基础"实现）
├── ByteArrayInputStream     ← ConcreteComponent
└── FilterInputStream        ← Decorator（抽象装饰者）
    ├── BufferedInputStream  ← 加缓冲
    ├── DataInputStream      ← 加"按基本类型读取"的能力
    ├── GZIPInputStream      ← 加解压
    ├── DigestInputStream    ← 加摘要计算
    └── CipherInputStream    ← 加解密
```

`FilterInputStream` 的实现正是标准的装饰者骨架：

```java
public class FilterInputStream extends InputStream {
    protected volatile InputStream in;             // 持有同类型对象

    protected FilterInputStream(InputStream in) { this.in = in; }

    public int read() throws IOException { return in.read(); }   // 默认委派
}
```

使用时的套娃写法：

```java
// 文件 → 缓冲 → 解压 → 按基本类型读取，四层包装
try (DataInputStream in = new DataInputStream(
        new BufferedInputStream(
                new GZIPInputStream(
                        new FileInputStream("data.gz"))))) {
    int count = in.readInt();
}
```

### 4.2 `FilterInputStream` 的默认方法是「全委派」：装饰者必须重写才有价值

```java
public class FilterInputStream extends InputStream {
    protected volatile InputStream in;

    public int read() throws IOException { return in.read(); }
    public int read(byte b[]) throws IOException { return read(b, 0, b.length); }
    public int read(byte b[], int off, int len) throws IOException { return in.read(b, off, len); }
    public long skip(long n) throws IOException { return in.skip(n); }
    public int available() throws IOException { return in.available(); }
    public void close() throws IOException { in.close(); }
    public synchronized void mark(int readlimit) { in.mark(readlimit); }
    public synchronized void reset() throws IOException { in.reset(); }
    public boolean markSupported() { return in.markSupported(); }
}
```

**注意：这一整个类一个功能都没加，全是纯委派。** 真正的装饰逻辑全在子类里：

```java
// BufferedInputStream：只重写了需要改变行为的那些方法
public synchronized int read(byte b[], int off, int len) throws IOException {
    ...
    for (;;) {
        int nread = read1(b, off + n, len - n);      // ① 优先从内部 buffer 取
        ...
    }
}

public synchronized long skip(long n) throws IOException {
    ...
    if (n <= count - pos) {          // ② buffer 里还有，直接移动指针，不真的读
        pos += (int) n;
        return n;
    }
    ...
}
```

**这是本站各篇里最容易被忽略的一条：教科书说「装饰者与被装饰者同一接口、默认委派」，但没说「默认委派只是兜底」。**

如果一个子类一个问题方法都不重写（比如一个声称「加日志」的 `LoggingInputStream` 却不在 `read` 里写日志），它就退化成**透明代理**——**装饰者的全部价值都在「它重写了哪些方法」上**。看一个装饰者实现，只要看它重写了哪几个方法，就知道它到底加了什么能力。

`skip` 的重写尤其值得注意：`BufferedInputStream#skip` 在 buffer 够用时**只移动 `pos` 指针、不产生任何 I/O**——「加缓冲」这个职责要同时改 `read` 和 `skip` 两个方法才算完整。**这是「默认委派会漏掉职责」的实例**：只重写 `read`、忘了 `skip`，缓冲的收益就少一半。

### 4.3 MyBatis 的 `Cache` 装饰链：五层包装，且顺序有讲究

MyBatis 的二级缓存是装饰者在工程里的标准用法——`CacheBuilder#build` 把多个装饰者叠成一条链：

```java
public Cache build() {
    setDefaultImplementations();
    Cache cache = newBaseCacheInstance(implementation, id);       // ① 最内层：PerpetualCache
    ...
    for (Class<? extends Cache> decorator : decorators) {        // ② 按配置再套装饰者
        cache = newCacheDecoratorInstance(decorator, cache);
    }
    cache = setStandardDecorators(cache);                        // ③ 最后套标准装饰者
    return cache;
}

private Cache setStandardDecorators(Cache cache) {
    if (clearInterval != null) cache = new ScheduledCache(cache);  // 定时清理
    if (logPrefix != null)     cache = new LoggingCache(cache);    // 命中率日志
    cache = new SynchronizedCache(cache);                          // 同步包装
    return cache;
}
```

最终拿到的是这样一个套娃：

```
SynchronizedCache              ← 最外层：锁住所有读写
└── LoggingCache               ← 统计命中率
    └── ScheduledCache         ← 定时清空
        └── LruCache           ← 按 LRU 淘汰
            └── PerpetualCache ← 最内层：真正的 Map
```

**链的顺序不是随便排的，它决定了行为的语义**：

| 装饰者 | 必须处在哪一层 | 为什么 |
|---|---|---|
| `PerpetualCache` | 最内 | 它是唯一的真实存储，其余都只是拦截 |
| `LruCache` / `FifoCache` | 内层 | 淘汰策略要作用在真实存储上 |
| `ScheduledCache` | 中层 | 它按时间清空内层缓存 |
| `LoggingCache` | 在 `ScheduledCache` 之外 | **否则命中率统计会把「定时清理造成的未命中」和「真实未命中」混在一起** |
| `SynchronizedCache` | 最外 | 不套在最外面，就锁不住其它装饰者的状态字段 |

> **这比「能套娃」深一层：装饰者链是洋葱，谁在外面决定了谁能观察到谁的副作用。** 设计装饰链时，先想清楚「哪些统计要包含哪些行为」，顺序自然就定了。

### 4.4 `HttpServletRequestWrapper`：判据是「持有的是接口还是具体类」

```java
public class HttpServletRequestWrapper extends ServletRequestWrapper
        implements HttpServletRequest {

    public HttpServletRequestWrapper(HttpServletRequest request) {
        super(request);
    }
    ...
}
```

它的父类 `ServletRequestWrapper` 持有的字段类型是 **`ServletRequest`（同接口）**，所有方法纯委派——这是**装饰者**。

对照本站[外观模式](/java/design-patterns/structural/facade)里的 `RequestFacade`：它同样实现 `HttpServletRequest`，但**持有的是容器具体类 `Request`**——那是门面。

| 实现 | 实现的接口 | 持有的字段类型 | 判定 |
|---|---|---|---|
| `FilterInputStream` | `InputStream` | `InputStream` | 装饰者 |
| `HttpServletRequestWrapper` | `HttpServletRequest` | `ServletRequest` | 装饰者 |
| `RequestFacade` | `HttpServletRequest` | `Request`（具体类） | 门面 |
| `HandlerAdapter` | 统一的 `handle` 协议 | 各种 `Handler` | 适配器 |

> **一句判据：实现同一接口 + 持有同一接口 = 装饰者；持有具体类 = 门面 / 适配器。** 三个结构型模式长得几乎一样，字段类型是唯一可靠的分辨依据。

Servlet 容器里这两个类**经常同时出现**：Tomcat 用 `RequestFacade` 把请求交给应用（隔离容器），Spring 的过滤器再用 `ContentCachingRequestWrapper` 把它包一层（加「请求体可重复读」的能力）——**同一个请求对象，先被门面包一次，再被装饰者包一次**，这是两个模式动机差异的最直观现场。

## 五、与代理模式的区别（最常被问）

| 维度 | 装饰者 | 代理 |
|---|---|---|
| 目的 | **增强功能**，叠加职责 | **控制访问**，插入横切逻辑 |
| 是否改变行为 | 会改变（累加效果） | 通常不改变（只包裹） |
| 组合方式 | **多层嵌套**，调用方决定顺序 | 通常**单层**，框架创建 |
| 谁创建对象 | 调用方显式 `new` 层层包装 | 框架 / 工厂创建，调用方无感 |
| 是否暴露目标类型 | 是（同一接口，可继续包装） | 通常只暴露抽象接口 |
| 典型场景 | IO 流、请求包装、功能可选项 | 事务、日志、鉴权、远程代理 |

判断口诀：**"我要给它多加一个能力" → 装饰者；"我要拦住这次调用" → 代理。**

## 六、与继承的对比

| 维度 | 继承扩展 | 装饰者扩展 |
|---|---|---|
| 绑定时机 | 编译期 | 运行期 |
| 组合能力 | 静态、固定 | 动态、任意嵌套 |
| 类数量 | 组合爆炸（2ⁿ） | 线性（每个功能一个装饰类） |
| 侵入性 | 需为每种组合建类 | 原类无需改动 |
| 调试难度 | 低（结构清晰） | 较高（调用链长、嵌套深、栈信息冗长） |
| 初始化复杂度 | 低 | 高（包装顺序容易写错） |

**结论**：功能可选项多且需要运行时组合时用装饰者；职责固定时继承更简单直接。

## 七、优缺点

**优点**

1. 扩展功能无需修改原有代码，符合开闭原则；
2. 职责可**动态**增删，组合方式由调用方决定；
3. 每个装饰类职责单一，符合单一职责原则；
4. 避免继承带来的类爆炸。

**缺点**

1. 会产生**大量小对象**，包装层次过深时增加内存与调用开销；
2. 排查问题时调用链不直观（异常栈里全是装饰器的 `read`）；
3. 装饰顺序影响语义，写错不易被发现；
4. 若 `Component` 接口很大，每个装饰者都要实现全部方法（可配合缺省适配器缓解）。

## 八、使用场景

- **IO / 网络流**：缓冲、压缩、加密、摘要的任意组合；
- **请求/响应包装**：`HttpServletRequestWrapper` 添加自定义头、审计日志、参数改写；
- **数据导出链路**：报表先压缩再加密再加水印——本页示例；
- **缓存与降级**：给数据源套一层"缓存装饰"或"限流装饰"；
- **Spring 生态**：`ServerHttpRequestDecorator`（WebFlux）、`TransactionAwareCacheDecorator`（缓存与事务联动）。

## 九、面试问答

**Q1：装饰者模式和继承的本质区别？**
继承是**编译期静态**扩展，一种组合对应一个类；装饰者是**运行期动态**扩展，通过"实现同接口 + 持有同接口"实现任意嵌套。前者类数量随组合数指数增长，后者线性增长。

**Q2：装饰者和代理怎么区分？**
看目的与创建方：装饰者为**增强功能**、由**调用方**逐层包装；代理为**控制访问**、由**框架**创建且通常单层。两者结构相同（同一接口 + 持有目标），语义不同。

**Q3：举个 JDK 里装饰者的例子，并说明嵌套顺序。**
`new DataInputStream(new BufferedInputStream(new FileInputStream("a.txt")))`：最内层 `FileInputStream` 负责实际读文件，`BufferedInputStream` 在其上加缓冲，`DataInputStream` 再把字节解释为基本类型。调用最外层的方法会逐层向内传递，返回时逐层向外加工。

**Q4：装饰者的缺点是什么？**
产生大量小对象，包装层次过深时性能与内存开销上升；异常栈与调试信息冗长；包装顺序会改变语义（先压缩后加密 ≠ 先加密后压缩），而这一点在代码上看不出对错，只能靠理解。**因此装饰层数建议控制在 3 层以内，并用工厂方法把"标准组合"封装起来。**

**Q5：为什么 `BufferedReader` 要包在 `FileReader` 外面？直接 `FileReader` 不行吗？**
`FileReader` 每调用一次 `read()` 都可能触发一次系统调用（读文件），性能很差；`BufferedReader` 一次读入一块数据放进内存缓冲区，后续 `read()` 大多命中缓冲区，并额外提供 `readLine()` 这类便利方法。这正是装饰者"在不改原类的前提下增加能力"的价值体现。
