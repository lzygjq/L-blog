---
date: 2026-09-16
title: RPC 与协议 · 板块导览
desc: RPC 的全部复杂度都来自"把跨网络调用伪装成本地调用"这个前提——从这句判据出发的五篇：边界与故障模式、序列化与 IDL、协议与传输、Dubbo 机制、可靠性治理
---

# RPC 与协议 · 板块导览

这是[消息队列](/middleware/)的同题兄弟：同一个"服务之间怎么说话"的问题，**消息队列的答案是异步的事件，RPC 的答案是同步的调用**。两者不是替代关系，而是"必须立刻知道结果"与"可以事后再处理"的分工。

先说清它**不做什么**：

- 不重复 IO 与网络层原理（[IO 与 NIO](/java/basics/io-nio)、[零拷贝](/fundamentals/os/io-model#zero-copy)、[TCP 粘包与拆包](/fundamentals/network/tcp#sticky-packet) 都已有专节），只讲这些机制在 RPC 里怎么落成字节；
- 不重复注册中心与负载均衡的组件用法（[Spring Cloud](/java/spring/spring-cloud/) 已成篇 9 篇），只讲 Dubbo 这一侧的服务发现演进；
- 不重复熔断限流的落地配置（[服务保护](/java/spring/spring-cloud/resilience) 已成篇），只讲**超时、重试、优雅上下线**这三件 RPC 特有的事。

## 一、一条主线：它假装自己不是网络调用 {#thread}

RPC 的全部复杂度，都来自一句话：

> **RPC 让"调用一个远程方法"看起来和"调用一个本地方法"一模一样 —— 而这两件事在八个维度上根本不同。**

本地方法天然成立的八个假设，一旦跨了网络就全部失效：

| # | 本地调用的假设 | 跨网络之后的事实 |
|---|---|---|
| 1 | 延迟可以忽略 | 毫秒到秒级，且**抖动**；P99 常常是 P50 的几十倍 |
| 2 | 调用一定会返回 | 可能超时、可能连接断开，**结果未知**（不是失败） |
| 3 | 参数传的是引用 | 只能传值，且**必须序列化** |
| 4 | 方法恰好执行一次 | 只能保证**至少一次**或**至多一次**，做不到恰好一次 |
| 5 | 中间没有第三方 | 网关、代理、服务网格都可能改行为、加延迟 |
| 6 | 地址是固定的 | 对方 IP 随扩缩容、重启、发版而变 |
| 7 | 两侧时间一致 | 时钟不同步，**不能用时间戳判断先后** |
| 8 | 失败可以整体回滚 | **局部失败是常态**，没有全局回滚 |

把这八条按"错在哪一层"归类，整个板块的地图就出来了：

| 失效的假设 | 谁来补 | 落在哪一篇 |
|---|---|---|
| 3（传值 + 序列化） | 序列化协议与 IDL | [序列化](/middleware/rpc/serialization) |
| 1、5、6（延迟、第三方、地址） | 协议设计、连接管理、服务发现 | [协议与传输](/middleware/rpc/protocol-and-transport)、[Dubbo 机制](/middleware/rpc/dubbo-internals) |
| 2、4、7（结果未知、重复、时钟） | 超时、幂等、重试纪律 | [可靠性治理](/middleware/rpc/rpc-reliability) |
| 8（无全局回滚） | 分布式事务 / 消息最终一致 | [分布式事务](/java/spring/spring-cloud/transaction)（已成篇） |

**第 2 条与第 4 条是这个板块最值钱的两条**：它们说明 RPC 的"失败"不是二元的——**超时不等于失败，只等于"不知道"**。理解了这一点，超时值怎么设、重试该不该开、幂等为什么不是可选项，全部都能自己推出来。

## 二、五篇地图 {#map}

| # | 篇 | 解决什么问题 | 一句话结论 |
|---|---|---|---|
| 1 | [RPC 的边界](/middleware/rpc/rpc-essentials) | 它到底替换掉了什么、什么时候不该用它 | 它替换掉的是"自己写网络编解码"，**替换不掉网络本身的不可靠**；四种故障模式里最危险的是"结果未知" |
| 2 | [序列化与 IDL](/middleware/rpc/serialization) | 同一份数据，凭什么有的方案小十倍、有的方案改字段就崩 | 序列化的评价维度是**体积 / 速度 / 跨语言 / 兼容性 / 安全**五项，**没有一项全占**；Protobuf 的兼容性来自"只认编号不认名字" |
| 3 | [协议与传输](/middleware/rpc/protocol-and-transport) | 一次调用在字节层经历了什么 | 自定义协议的必备字段都是为了解决**两件事**：粘包拆包（长度字段）与并发复用（请求 ID）；gRPC 用 HTTP/2 换来的通用性，代价是多了一层它不需要的东西 |
| 4 | [Dubbo 的机制](/middleware/rpc/dubbo-internals) | Java 生态里最该会的 RPC 框架是怎么搭起来的 | 它的可扩展性来自 **SPI + URL 总线 + 责任链**三件套；Dubbo 3 最根本的变化是**把服务发现的聚合单位从接口换成了应用** |
| 5 | [RPC 的可靠性](/middleware/rpc/rpc-reliability) | 为什么线上事故大多是"自己把自己打死的" | **超时是唯一的止损开关**，重试必须同时满足"幂等 + 有界 + 退避"；优雅下线要解决的是"注册中心通知还没到，进程已经没了" |

## 三、与其他板块的关系 {#relations}

| 板块 | 关系 |
|---|---|
| [消息队列](/middleware/)（同板块） | **同一问题的另一条路线**：RPC 是同步请求-响应，MQ 是异步事件；[什么时候必须换成 MQ](/middleware/rpc/rpc-essentials#vs-mq) 是本板块的一道独立题 |
| [IO 与 NIO](/java/basics/io-nio) | **下层机制**：Netty 的定位、序列化的 Java 原生方案都在那边；本板块承接它们的**生产用法** |
| [TCP](/fundamentals/network/tcp#sticky-packet) | **粘包的根源**：TCP 是字节流不是消息流，所以"一条消息的边界"必须由应用层协议自己定义 |
| [HTTP](/fundamentals/network/http#http2) | **gRPC 的传输层**：多路复用、头部压缩、流都是 HTTP/2 给的 |
| [Spring Cloud](/java/spring/spring-cloud/) | **另一套服务化方案**：[OpenFeign](/java/spring/spring-cloud/loadbalancer#openfeign) 走 HTTP + 动态代理，Dubbo 走二进制协议 + 接口级治理；两者的**注册中心、负载均衡、容错思想是通的** |
| [分布式协调](/distributed/coordination/) | **姊妹篇**：协调解决"**谁说了算**"，RPC 解决"**话怎么传**"；Dubbo 的注册中心可以就是 ZooKeeper / Nacos |
| [服务保护](/java/spring/spring-cloud/resilience#circuit-breaker) | **熔断与限流的组件层**：那边讲断路器状态机与 Sentinel 规则，这边讲**这些组件的摆放位置**（客户端容错 vs 服务端保护） |
| [幂等](/java/spring/spring-cloud/idempotency) | **重试的前提条件**：四类幂等方案在那边已成篇，这里只讲"**为什么没有幂等就不能重试**" |
| [链路追踪](/java/spring/spring-cloud/tracing) | **跨进程上下文**：traceId 靠 RPC 的**附加属性**透传，这是协议设计的一部分 |
| [高可用](/high-availability/#interview) | **优雅下线的上位话题**：那边讲容量与故障域，这边讲"进程退出前该做什么" |
| [云原生](/cloud-native/) | **落地形态**：K8s 里 Pod 的 IP 随时变，这直接推着 Dubbo 3 换成了应用级服务发现 |

## 四、面试高频索引 {#interview-index}

| 主题 | 高频问法 | 出处 |
|---|---|---|
| RPC 的本质 | "RPC 到底解决了什么问题" | [它替换掉了什么](/middleware/rpc/rpc-essentials#assumptions) |
| 超时与失败的区别 | "调用超时了，到底成功没有" | [四种故障模式](/middleware/rpc/rpc-essentials#failures) |
| 投递语义 | "RPC 能保证只执行一次吗" | [三种语义](/middleware/rpc/rpc-essentials#semantics) |
| RPC vs REST | "内部服务为什么不直接用 HTTP 接口" | [三者的定位差异](/middleware/rpc/rpc-essentials#vs-rest) |
| RPC vs MQ | "什么时候必须用消息队列" | [同步与异步的分界](/middleware/rpc/rpc-essentials#vs-mq) |
| 序列化选型 | "为什么不用 JDK 原生序列化" | [五类方案横评](/middleware/rpc/serialization#five-families) |
| Protobuf 为什么小 | "同一个对象为什么能小好几倍" | [varint 与 tag-length-value](/middleware/rpc/serialization#protobuf) |
| 改字段的兼容性 | "删掉一个字段会不会出事" | [演进红线与 `reserved`](/middleware/rpc/serialization#evolution) |
| 序列化安全 | "反序列化为什么会 RCE" | [类检查与白名单](/middleware/rpc/serialization#security) |
| 粘包拆包 | "TCP 粘包怎么解决" | [三种分帧方式](/middleware/rpc/protocol-and-transport#framing) |
| 协议头字段 | "为什么要魔数和请求 ID" | [必备要素](/middleware/rpc/protocol-and-transport#header-fields) |
| gRPC 为什么用 HTTP/2 | "它不能自己造协议吗" | [多路复用与流](/middleware/rpc/protocol-and-transport#grpc) |
| 线程模型 | "RPC 的业务逻辑为什么不能写在 IO 线程" | [IO 线程与业务线程池](/middleware/rpc/protocol-and-transport#thread-model) |
| Dubbo SPI | "Dubbo 的 SPI 和 JDK 的差在哪" | [三个缺陷与三个注解](/middleware/rpc/dubbo-internals#spi) |
| 一次调用的链路 | "消费者发起调用后框架做了哪些事" | [从代理到 Invoker](/middleware/rpc/dubbo-internals#refer) |
| 集群容错策略 | "调用失败了框架默认怎么办" | [六种策略与默认值](/middleware/rpc/dubbo-internals#cluster) |
| 负载均衡 | "随机和最少活跃怎么选" | [六种策略](/middleware/rpc/dubbo-internals#loadbalance) |
| 应用级服务发现 | "Dubbo 3 为什么改注册模型" | [接口数 × 实例数](/middleware/rpc/dubbo-internals#app-level) |
| 超时怎么设 | "整条链路 1 秒，每跳给多少" | [超时预算](/middleware/rpc/rpc-reliability#budget) |
| 重试的前提 | "什么情况下绝对不能重试" | [幂等 + 有界 + 退避](/middleware/rpc/rpc-reliability#retry) |
| 重试风暴 | "一次故障为什么会变成雪崩" | [放大系数](/middleware/rpc/rpc-reliability#retry-storm) |
| 优雅下线 | "发版时为什么会有少量 503" | [反注册与在途请求](/middleware/rpc/rpc-reliability#graceful-shutdown) |

## 五、版本现状 {#versions}

| 组件 | 当前版本 | 关键事实（截至 2026-09） |
|---|---|---|
| **Dubbo** | **3.3.x** | **默认协议仍是 `dubbo`**（TCP，端口 20880），官方**推荐新项目直接用 `triple`**（HTTP/2，端口 50051）；`dubbo` 协议默认序列化是 **Hessian2**，`triple` + IDL 模式默认是 **Protobuf** |
| **Dubbo 安全** | 同上 | 3.1.6 起引入反序列化**类检查**（类黑白名单，只覆盖 Hessian2 / Fastjson2 与泛化调用），**3.2 起检查级别默认 STRICT**（拒绝非白名单类）——升级后突然报检查失败大多源于此 |
| **Dubbo 发现模型** | 同上 | `register-mode` 默认 `all`（接口级 + 应用级双注册）；从 Dubbo 2 迁移必须配**元数据中心**，否则消费者无法解析接口到应用的映射 |
| **gRPC** | **1.8x** | HTTP/2 + Protobuf 是它的固定组合；四种调用模式（一元 / 服务端流 / 客户端流 / 双向流）；**浏览器需 gRPC-Web**，不能直接调 |
| **Protobuf** | **v3x** | 官方正在推进 **Editions**（Edition 2023 起）把 proto2 / proto3 的语法统一；**主流项目仍在用 proto3 语法** |
| **Java 原生序列化** | 随 JDK | JDK 17 引入 `ObjectInputFilter` 过滤器；官方持续收紧，**生产 RPC 一律不用** |

## 六、阅读建议 {#reading}

| 你的情况 | 建议顺序 |
|---|---|
| 面试前突击 | 第 5 篇（超时与重试）→ 第 1 篇（故障模式）→ 第 2 篇（序列化选型） |
| 正在选型（Dubbo / gRPC / HTTP） | 第 1 篇（[RPC vs REST](/middleware/rpc/rpc-essentials#vs-rest)）→ 第 3 篇（[gRPC 与 HTTP/2](/middleware/rpc/protocol-and-transport#grpc)） |
| 线上出过超时 / 雪崩 | 第 5 篇整篇 |
| 要把这一块学透 | 按 1 → 2 → 3 → 4 → 5 顺序读，第 4 篇可先只读[应用级服务发现](/middleware/rpc/dubbo-internals#app-level) |

> **本板块 5 篇正文 / 52 题。** 与[消息队列](/middleware/)的分工是「同步调用 vs 异步事件」，与 [Spring Cloud](/java/spring/spring-cloud/) 的分工是「二进制 RPC + 接口级治理 vs HTTP + 声明式客户端」，与[分布式协调](/distributed/coordination/)的分工是「话怎么传 vs 谁说了算」，各处交叉引用而不复制正文。
