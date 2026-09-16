---
date: 2026-09-15
title: IO 与 NIO：模型、多路复用与零拷贝
sidebar: IO 与 NIO
desc: 五种 IO 模型与 Java 三种实现的关系、BIO 流体系为什么是装饰器模式的典范、Buffer/Channel/Selector 三件套与 epoll、零拷贝的四种实现，以及序列化的四个问题
order: 7
---

# IO 与 NIO：模型、多路复用与零拷贝

IO 是所有「高并发」话题的地基：为什么 Web 服务器要换掉「一请求一线程」、Netty 为什么存在、Kafka 凭什么能那么快、网关为什么必须响应式——答案都在 IO 模型里。

这篇按「**Java 实现 → 用法 → 优化**」来讲，最后补上序列化这个绕不开的配套话题。

> **边界说明**：五种 IO 模型在内核里怎么工作、`select`/`poll`/`epoll` 的数据结构、零拷贝的拷贝次数推导、`io_uring` 的定位 —— 这些**属于操作系统域**，已归到 [IO 模型与多路复用](/fundamentals/os/io-model)。**本篇只讲 Java 这一侧：用哪些 API、怎么用对、坑在哪。**

## 一、五种 IO 模型与 Java 的三种实现 {#io-models}

### 1.1 只留 Java 侧必须记住的分界线 {#five-models}

网络 IO 的本质是「**数据从内核缓冲区搬到用户缓冲区**」，所有模型讨论的都是**两次等待**（等数据到内核、等拷到用户空间）。**五种 IO 模型的完整讨论在** [IO 模型与多路复用](/fundamentals/os/io-model#five-models) —— 那篇是内核视角：每种模型的机制与代价、收包路径、以及 **Linux 原生 AIO 为什么不成熟**。

本篇只留 Java 侧必须记住的对应关系：

| 模型 | Java 里对应什么 | 一句话 |
|---|---|---|
| 阻塞 IO | `java.io`（BIO） | 一请求一线程 |
| **IO 多路复用** | `java.nio` + `Selector` | **一个线程管大量连接——主流方案** |
| 异步 IO | `java.nio.channels.Asynchronous*`（AIO） | 真异步，但 Linux 上长期没成主流 |
| 非阻塞 IO | **Java 没有独立暴露** | 单独用就是轮询空转，没意义 |
| 信号驱动 IO | **Java 不支持** | 信号语义差（不排队、可能丢） |

> **同步与异步的分界线在「数据拷贝阶段是否阻塞调用方」。** 按这条线，**多路复用也算同步 IO** —— 因为 `epoll` 告诉你"可读了"之后，**数据仍要你自己调 `read` 去拷，你还是得等**。

这条线是「NIO 到底是不是异步」这个高频争议的标准答案：**Java NIO 是同步非阻塞（多路复用），不是异步 IO**。Java 的 AIO（NIO.2）才是异步。

### 1.2 Java 三种实现的对应关系 {#java-three}

| Java 实现 | 对应模型 | 核心类 | 编制 |
|---|---|---|---|
| **BIO**（`java.io`） | 阻塞 IO | `InputStream`/`OutputStream`/`Reader`/`Writer` | JDK 1.0 |
| **NIO**（`java.nio`） | IO 多路复用 | `Buffer`/`Channel`/`Selector` | JDK 1.4 |
| **AIO**（`java.nio.channels.Asynchronous*`） | 异步 IO | `AsynchronousSocketChannel` 等 | JDK 7（NIO.2） |

## 二、BIO：流体系为什么是装饰器模式的典范 {#bio}

### 2.1 两条并行的体系 {#stream-categories}

```
InputStream / OutputStream        字节流：处理一切原始数据
    ├── FileInputStream               文件
    ├── ByteArrayInputStream          内存数组
    └── 装饰器：BufferedInputStream / DataInputStream / ObjectInputStream

Reader / Writer                   字符流：处理文本，负责字符集编解码
    ├── FileReader / FileWriter
    ├── BufferedReader / BufferedWriter      按行读、缓冲区
    └── InputStreamReader / OutputStreamWriter   架在「字节 ↔ 字符」之间的转换流
```

**为什么要有字符流**：字节流处理的是「字节」，而文本涉及**字符集**——同一个 `0xE4 0xB8 0xAD` 序列在 UTF-8 下是一个汉字，在别的编码下可能是别的意思。字符流把这层编解码封装起来，并以「字符」为单位提供 `read()`/`readLine()`。**文件读写指定编码的正确姿势是显式包一层**：

```java
try (BufferedReader reader = new BufferedReader(
        new InputStreamReader(new FileInputStream("a.txt"), StandardCharsets.UTF_8))) {
    String line;
    while ((line = reader.readLine()) != null) { /* ... */ }
}
```

> **`FileReader` 的坑**：它用的是**平台默认编码**，同一份代码在 Windows（GBK）和 Linux（UTF-8）上结果不同。**跨环境场景一律显式指定 `StandardCharsets.UTF_8`。** JDK 18 起 `file.encoding` 默认变为 UTF-8（JEP 400），缓解了这个问题，但显式声明仍是最佳实践。

### 2.2 装饰器模式：BIO 最有价值的设计遗产 {#decorator}

BIO 的类层次是**装饰器模式**（结构型模式之一）在 JDK 里最完整的一次应用，值得把它与[设计模式](/java/design-patterns/structural/decorator)对照着看：

```java
// 每个装饰器只加一种能力，可以任意叠加，且顺序有意义
DataInputStream in = new DataInputStream(
        new BufferedInputStream(
                new FileInputStream("data.bin")));
int n = in.readInt();          // DataInputStream 提供「按类型读」
```

**这个设计的三个优点**（也是面试问「为什么 IO 要这么设计」时的答案）：

| 优点 | 说明 |
|---|---|
| **组合优于继承** | 若用继承，`缓冲 + 按类型读`、`缓冲 + 压缩`、`按类型读 + 压缩`……每种组合都要一个类，**类数量指数爆炸** |
| **职责单一** | `BufferedInputStream` 只管缓冲，`DataInputStream` 只管类型转换，每个类都足够小 |
| **可动态叠加与替换** | 运行期决定要不要加缓冲、用什么底层流；换一个 `FileInputStream` 为 `SocketInputStream` 时上层代码不用改 |

**代价**：嵌套层次深、`close()` 的顺序语义要自己保证（外层关掉会连带关闭内层，所以只需关最外层——这也是 try-with-resources 会**逆序关闭**的原因）。

### 2.3 BIO 的根本瓶颈 {#bio-bottleneck}

```java
// 经典的一请求一线程模型
ServerSocket server = new ServerSocket(8080);
while (true) {
    Socket socket = server.accept();          // 阻塞
    new Thread(() -> handle(socket)).start(); // 每连接一个线程
}
```

问题在于**数量级**：线程是昂贵的操作系统资源（一个线程的栈默认 1MB 左右），几千个连接就是几千个线程——上下文切换成本急剧上升、内存压力大。而这个模型里绝大多数线程**大部分时间都阻塞在 `read()` 上什么都不做**。

改进路径有三条，正好对应后文：

1. **线程池 + 短连接**：只缓解，不解决长连接（连接持有线程的时间等于连接存活时间）。
2. **NIO 多路复用**：一个（或少数几个）线程管所有连接，只在真正有数据时才处理——**这是主流路线**。
3. **AIO 真异步**：理论上最优，实践中在 Linux 上没成为主流（见第五节）。

## 三、NIO 三件套：Buffer / Channel / Selector {#nio-core}

### 3.1 Buffer：三个指针与五个操作 {#buffer}

NIO 面向**缓冲区**：数据先读进 `Buffer`，再从中取。理解 `Buffer` 只要抓住三个指针：

```
        0         position            limit          capacity
        |             |                 |                |
        |  已读/已写   |   可读写区间      |    空闲空间     |

capacity  总容量，创建后固定
position  下一个要读/写的位置
limit     可读/写的边界（写模式下 = capacity，读模式下 = 已写入的数据量）
mark      一个「书签」，reset() 会回到这里
```

四个核心操作（**`flip()` 是新手最容易漏的一步**）：

| 方法 | 作用 | 典型时机 |
|---|---|---|
| `flip()` | `limit = position; position = 0` | **写完准备读之前**，忘了它就会读出 0 个字节 |
| `clear()` | `position = 0; limit = capacity` | 准备重新写入（数据未清，但会被覆盖） |
| `rewind()` | `position = 0`，`limit` 不变 | 重新读一遍同一段数据 |
| `compact()` | 把未读数据挪到开头，`position` 设为剩余长度 | **读了一半又想继续写**，比 `clear()` 安全 |

`flip()` 的坑几乎每个写过 NIO 的人都踩过：`channel.read(buffer)` 之后直接 `buffer.get()` 会拿到错误结果，因为 `position` 停在末尾。**正确的四步循环是：read → flip → get（循环）→ clear/compact**。

`ByteBuffer` 还有一个重要区分：

| | 堆内缓冲区（`allocate`） | 直接缓冲区（`allocateDirect`） |
|---|---|---|
| 内存位置 | JVM 堆 | 堆外（本地内存） |
| 分配/回收成本 | 低 | **高**（不受 GC 直接管理，靠 `Cleaner` 释放） |
| IO 性能 | 要额外拷贝到堆外，**慢** | **快**（可以直接交给内核） |
| 适用 | 数据量小、对象多 | 长生命周期、频繁 IO（**需要复用，不要反复创建**） |

### 3.2 Channel 与 Selector {#channel-selector}

**Channel 与流的两点本质区别**：

- **双向**：`Channel` 既可读又可写（流是单向的，输入流和输出流分开）。
- **可非阻塞**：`configureBlocking(false)` 之后 `read()` 立即返回（通常返回 0），这是多路复用的前提。

**Selector 是多路复用的核心**：一个 `Selector` 可以注册多个 `Channel`，用一个线程等待「哪些 Channel 就绪了」。

```java
Selector selector = Selector.open();
channel.configureBlocking(false);
channel.register(selector, SelectionKey.OP_READ);      // 注册感兴趣的事件

while (true) {
    selector.select();                                  // 阻塞直到至少一个事件就绪
    Iterator<SelectionKey> it = selector.selectedKeys().iterator();
    while (it.hasNext()) {
        SelectionKey key = it.next();
        if (key.isReadable()) { /* 处理读 */ }
        else if (key.isAcceptable()) { /* 处理新连接 */ }
        it.remove();                                    // ⚠️ 必须手动移除，否则重复处理
    }
}
```

四种事件（`SelectionKey`）：

| 事件 | 含义 |
|---|---|
| `OP_ACCEPT` | 有新连接可接受（`ServerSocketChannel`） |
| `OP_CONNECT` | 连接已建立（客户端） |
| `OP_READ` | 有数据可读 |
| `OP_WRITE` | 可以写入（**注意：通常一直是就绪的，只在写不完时注册**） |

`OP_WRITE` 的使用方式是最容易写错的地方：**不要一开始就注册它**，否则会变成忙循环；正确做法是「先尝试写，写不完再注册 `OP_WRITE`，写完就取消注册」。

**`select` / `poll` / `epoll` 的差别**：`Selector` 在 Linux 上底层走的就是 `epoll`。**三者的内核数据结构与复杂度分析在** [IO 模型与多路复用](/fundamentals/os/io-model#select-poll-epoll)，Java 侧只要记住三条：

| 结论 | 对 Java 的意义 |
|---|---|
| `select` 有 **1024** 的 fd 上限（`FD_SETSIZE` 是编译期常量） | 所以高并发必须用 `epoll`；JDK 会按平台自动选实现（Linux `epoll` / macOS `kqueue` / Windows `IOCP`） |
| `epoll` 快在「**不用每次把 fd 集合拷进内核 + 不用线性遍历**」 | 这是 Netty / Redis / Nginx 能扛万级连接的机制层原因 |
| `epoll` 支持**水平触发与边缘触发** | **Java 的 `Selector` 用的是水平触发**；要控制触发模式得用 Netty 的原生 transport（`EpollChannelOption` / `EpollMode`） |

### 3.3 Reactor 模式 {#reactor}

NIO 的手写代码很容易写错（半包粘包、事件注册时机、写未完成），工程上交给 Netty。它实现的**主从 Reactor 多线程模型**可以这样理解：

```
mainReactor（1 个线程）：只负责 accept 新连接 → 注册到 subReactor
    │
    ├── subReactor 1（N 个线程）：负责已建立连接的 read/write 事件
    ├── subReactor 2
    └── subReactor 3
            │
            └── 业务线程池：真正耗时的业务逻辑（避免阻塞 IO 线程）
```

三个要点：**accept 与 read/write 分离**（避免新连接风暴影响已有连接）、**IO 线程数约等于 CPU 核数**（IO 线程只做数据搬动，不写业务）、**业务逻辑必须扔到独立线程池**（IO 线程一旦被阻塞，该线程上的所有连接都停摆——这与[网关为什么不能用阻塞写法](/java/spring/spring-cloud/gateway#why-gateway)是同一个道理）。

## 四、零拷贝：从四次拷贝到一次 {#zero-copy}

### 4.1 拷贝次数：机制推导在别处 {#traditional-copy}

把文件通过网络发出去，最朴素的写法是「读进缓冲区再写出去」。它一共是 **4 次拷贝（其中 2 次是 CPU 参与）+ 4 次用户态/内核态切换**——数据只是「路过」用户空间，却被完整地搬进搬出两趟。

**`mmap`、`sendfile`、`sendfile + SG-DMA`、`splice` 四种实现各自省掉哪一次拷贝，机制推导在** [零拷贝](/fundamentals/os/io-model#zero-copy)。这里只留一个判断准则和 Java 侧的对应 API。

> **「零拷贝」的「零」指的是「零 CPU 拷贝」或「零用户态参与」**，不是真的不搬数据。

### 4.2 Java 能用的是什么 {#zero-copy-ways}

| 方式 | Java 对应 | 适用场景 | 注意事项 |
|---|---|---|---|
| **`mmap` + `write`** | `FileChannel.map()` | 需要**读/改**文件内容（索引文件、CommitLog） | 映射内存**不受 `-Xmx` 管理**，是堆外 |
| **`sendfile`** | `FileChannel.transferTo` / `transferFrom` | **纯转发**：静态文件、消息投递 | **单次调用有传输上限，必须循环 + 累加返回值** |
| **直接缓冲区** | `ByteBuffer.allocateDirect()` | 配合 Channel 的常规优化（省掉「堆内 → 堆外」的中间拷贝） | 分配/回收成本高，**必须复用** |

```java
// Java 里最实用的零拷贝 API
try (FileChannel in = FileChannel.open(Path.of("big.zip"), StandardOpenOption.READ);
     FileChannel out = FileChannel.open(Path.of("copy.zip"), StandardOpenOption.WRITE,
                                        StandardOpenOption.CREATE)) {
    long size = in.size(), pos = 0;
    while (pos < size) {
        pos += in.transferTo(pos, size - pos, out);   // 循环，单次不保证全传
    }
}
```

**必须知道的两个边界**：

1. **`transferTo` 单次传输有上限**（不同平台/版本上是 2GB 或更小），**大文件必须循环**，并且要累加返回值——这是「用了 `transferTo` 复制大文件却只复制了一半」的原因。
2. **`transferTo` 在 Linux 上才是真正的 `sendfile`**，在 Windows 上走的是别的路径，性能收益不同。

**中间件的落地**（这才是面试官想听的）：

- **Kafka**：生产者/消费者与 broker 之间用 `sendfile`，消息日志文件直接从页缓存投递到网卡——这是 Kafka 高吞吐的核心原因之一（配合**顺序写 + 页缓存 + 批量**）。
- **RocketMQ**：同样依赖 `FileChannel.map`（`mmap`）与堆外内存做读写。
- **Nginx**：静态文件服务用 `sendfile on`。
- **Netty**：提供 `FileRegion`（走 `transferTo`）与 `CompositeByteBuf`（组合多个缓冲区，避免合并拷贝）。

## 五、AIO 与 Netty 的定位 {#aio-netty}

**AIO（NIO.2，JDK 7）**提供 `AsynchronousSocketChannel` 等 API，用**回调或 `Future`** 获取结果，理论上不阻塞、最省线程。但现实中它没成为高并发的主流方案，原因有三：

| 原因 | 说明 |
|---|---|
| **底层：Linux 原生 AIO 本身不行** | 它主要只对 `O_DIRECT` 块设备 IO 有效、不覆盖网络、每请求一次系统调用——**机制分析见 [Linux 原生 AIO 的问题](/fundamentals/os/io-model#why-not-aio)** |
| **语言层：编程模型复杂** | 回调风格导致「回调地狱」，调试与异常传播都麻烦；而 NIO 可以配合虚拟线程在**保持同步写法**的同时获得高吞吐（见 [虚拟线程](/java/basics/java9-21#virtual-thread)） |
| **工程：收益被 IO 线程数掩盖** | Netty 用少量 IO 线程就能撑住极高并发，AIO 的「省线程」优势不再关键 |

**Netty 的定位**：不是「异步 IO 框架」，而是**「基于 NIO 多路复用的、把 Reactor 模式与协议解析工程化的网络框架」**。它解决的是裸 NIO 的三个痛点——半包/粘包（`LengthFieldBasedFrameDecoder` 一类解码器）、事件注册时机（`OP_WRITE` 的正确用法）、以及线程模型（boss/worker 分离）。主流 RPC、网关、消息中间件的网络层都建在它上面——**这些框架在它之上又做了什么**，见 [RPC 与协议](/middleware/rpc/)（其中 [线程模型](/middleware/rpc/protocol-and-transport#thread-model) 讲的正是"IO 线程为什么不能写业务"）。

## 六、序列化：绕不开的配套话题 {#serialization}

### 6.1 Java 原生序列化 {#java-serialization}

```java
public class User implements Serializable {
    private static final long serialVersionUID = 1L;   // 显式声明
    private String name;
    private transient String password;                 // 不参与序列化
}
```

| 要点 | 说明 |
|---|---|
| `serialVersionUID` | 用于版本兼容校验。**不显式声明时由编译器根据类结构自动计算**，加个字段就会变 → 反序列化老数据时抛 `InvalidClassException`。**必须显式声明。** |
| `transient` | 标记字段不参与序列化；反序列化后该字段是默认值（`null`/`0`），**不会执行构造器与初始化** |
| `Externalizable` | 手动控制读写，比 `Serializable` 更可控但要自己实现 `writeExternal`/`readExternal`，且**必须有无参构造器** |
| 静态字段 | 不参与序列化（属于类而不是对象） |
| `writeObject`/`readObject` | 可自定义序列化逻辑（如对敏感字段加密） |

### 6.2 原生序列化的四个问题 {#serialization-problems}

| 问题 | 说明 |
|---|---|
| **安全** | 反序列化会执行 `readObject` 里的逻辑，历史上大量 RCE 漏洞都由「反序列化不可信数据」触发。**这是官方在 JDK 17 引入序列化过滤器（`ObjectInputFilter`）、并废弃 `finalize` 系列的同一批安全治理动作** |
| **性能与体积** | 编码冗长（带类描述信息）、体积大、速度慢，不适合高性能 RPC |
| **跨语言** | 只有 Java 能读，异构系统之间不可用 |
| **兼容性脆弱** | 类结构一改就可能反序列化失败，跨版本升级风险高 |

**因此生产上普遍改用**：跨语言场景用 JSON（Jackson / Gson）或 Protobuf / Thrift；RPC 内部通信用 Protobuf / Hessian / Kryo。**判据是三条**：要不要跨语言、对体积与吞吐的要求、以及**数据可不可信**（不可信数据一定不要用「能执行代码」的序列化方案）。

五类方案的完整横评、IDL 的价值、以及**"改字段为什么不能改编号"的演进红线**，见 [序列化与 IDL](/middleware/rpc/serialization)。

## 七、常见坑速查 {#pitfalls}

| 坑 | 现象 | 根因 |
|---|---|---|
| 写完 Buffer 忘记 `flip()` | 读出来是 0 字节或读到垃圾 | `position` 还在末尾，`limit == position` |
| 没移除 `selectedKeys` 里的 key | 同一事件被反复处理 | 需要手动 `it.remove()` |
| 一上来就注册 `OP_WRITE` | CPU 空转 | `OP_WRITE` 通常一直就绪，应在写不完时才注册 |
| `FileReader` 用平台默认编码 | 跨环境乱码 | 应显式指定 `StandardCharsets.UTF_8` |
| 反复 `allocateDirect` | 内存持续增长、甚至 OOM | 直接缓冲区不受 GC 直接管理，靠 `Cleaner` 释放；**必须复用** |
| `transferTo` 只调用一次 | 大文件只复制了一部分 | 单次传输有上限，**必须循环 + 累加返回值** |
| 不声明 `serialVersionUID` | 升级后反序列化失败 | 自动生成的值随类结构变化 |
| 反序列化不可信数据 | 安全漏洞 | `readObject` 可执行任意逻辑，应改用 JSON 或加过滤器 |
| 用 `transient` 期望字段被初始化 | 反序列化后是 `null` | 反序列化不执行构造器与字段初始化 |
| IO 线程里写业务逻辑 | 该线程上的所有连接停摆 | IO 线程必须只做数据搬动，业务交给独立线程池 |

## 面试口径

- **五种 IO 模型**：阻塞、非阻塞、IO 多路复用、信号驱动、异步 IO。**分界线在「数据拷贝阶段是否阻塞」**——前四种都是同步 IO，只有异步 IO 连拷贝都不阻塞调用方。所以 **Java NIO 是「同步非阻塞（多路复用）」，不是异步**；AIO 才是异步。
- **BIO 的瓶颈与改进**：一请求一线程，线程是昂贵的 OS 资源且大部分时间阻塞在 `read` 上；改进路径是「线程池（只缓解）」→「**NIO 多路复用（主流）**」→「AIO（Linux 上未成主流）」。
- **BIO 流体系的设计价值**：`InputStream`/`Reader` 与各装饰器（`Buffered`/`Data`/`Object`）是**装饰器模式**最完整的 JDK 实例——用继承会造成「组合数量爆炸」，装饰器让每个类只加一种能力、可动态叠加。注意 `Buffered` 的 `close()` 会连带关闭被包装的流，所以只需关最外层（这也解释了 try-with-resources 逆序关闭）。
- **Buffer 的三个指针**：`capacity`（容量固定）、`position`（下一个读写位置）、`limit`（读写边界）。四个操作：`flip`（写转读，**最易漏**）、`clear`（重置为写）、`rewind`（重读）、`compact`（读一半继续写）。标准循环是 **read → flip → get → clear/compact**。
- **堆内 vs 直接缓冲区**：直接缓冲区在堆外、IO 时少一次拷贝更快，但**分配回收成本高、不受 GC 直接管理**（靠 `Cleaner`），所以必须复用而不是频繁创建。
- **Channel 与流的区别**：Channel 是**双向**的、**可非阻塞**。
- **`select`/`poll`/`epoll`**：`select` 有 1024 上限、`poll` 无上限，但两者都是「每次调用把全部 fd 传入内核 + 线性遍历」；`epoll` 把 fd 集合维护在内核（红黑树 + 就绪链表），一次注册长期有效、只返回就绪的 fd，因此**连接数越多优势越大**。`epoll` 支持水平触发与边缘触发。
- **Reactor 模式**：主从 Reactor = mainReactor 只做 accept、subReactor 做 read/write、业务再扔到独立线程池。**IO 线程数约等于 CPU 核数**，绝不能在 IO 线程里写阻塞业务逻辑。
- **零拷贝**：传统 `read`+`write` 是 **4 次拷贝 + 4 次上下文切换**；`mmap` 省掉一次 CPU 拷贝（适合需要读写内容）；`sendfile` 让数据不经过用户空间（适合纯转发），配合 SG-DMA 可做到「0 次 CPU 拷贝」；Java 侧对应 `FileChannel.map` 与 `transferTo`（**必须循环，单次有上限**）。Kafka 高吞吐的关键之一就是 `sendfile`；Nginx 静态服务用 `sendfile on`。
- **AIO 为什么没流行**：Linux 原生 AIO 长期不成熟、回调模型复杂、而 NIO + 虚拟线程能以同步写法拿到同等吞吐。**Netty 是基于 NIO 多路复用的工程化网络框架，不是 AIO 框架**。
- **Java 原生序列化的四个问题**：安全（`readObject` 可执行代码，是历史 RCE 漏洞的主要来源）、性能与体积（编码冗长）、不能跨语言、兼容性脆弱。**必须显式声明 `serialVersionUID`**；`transient` 字段反序列化后是默认值（不执行构造器）。生产上跨语言用 Protobuf/JSON，内部 RPC 用 Protobuf/Kryo。
