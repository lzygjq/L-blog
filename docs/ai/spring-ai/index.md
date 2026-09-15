---
order: 3
date: 2026-09-15
title: Spring AI
desc: ChatClient 与 Advisor 中间件模型、结构化输出、Tool Calling、RAG 全链路与调优优先级、版本时间线
---

# Spring AI

上一篇讲的是 Agent 的通用机制（工具、循环、Harness）。这一篇落到 Java 上：**Spring AI 是 Spring 官方给 Java 后端提供的那层 AI 开发框架。**

先明确它的价值边界。如果目标只是"调一次大模型 API"，那用 `HttpClient` 手搓就够了，不需要框架。Spring AI 真正解决的是另外几件事：

| 问题 | 不用框架 | 用 Spring AI |
|---|---|---|
| 换模型厂商 | 改遍所有调用代码 | **改配置**，代码不动 |
| 提示词与会话管理 | 自己拼字符串 | `ChatClient` + `Advisor` 链 |
| 工具调用 | 自己实现协议与循环 | `@Tool` 注解 |
| 知识库检索（RAG） | 自己接向量库与切块 | `VectorStore` + ETL 抽象 |
| 可观测 / 鉴权 / 配额 | 自己包一层 | **复用 Spring 生态**（Micrometer、Security、AOP） |

一句话：**它的价值不是"能调模型"，而是把 AI 能力变成 Spring 容器里的一等公民。**

## 一、定位与版本时间线 {#positioning}

### 一组抽象

| 抽象 | 职责 |
|---|---|
| `ChatModel` | 底层对话模型接口（各厂商实现不同） |
| `ChatClient` | **推荐入口**：流式 API + Advisor 链 + 记忆 |
| `EmbeddingModel` | 文本向量化 |
| `VectorStore` | 向量库抽象（PGVector / Milvus / Redis / Elasticsearch / Qdrant…） |
| `ChatMemory` | 会话记忆（窗口 / 持久化 / 向量检索） |
| `Advisor` | **AI 调用的拦截器链**（记忆、RAG、日志、安全） |

### 版本时间线（务必按这条线判断网上的教程是否过期）

| 版本 | 时间 | 关键信息 |
|---|---|---|
| **1.0.0 GA** | 2025-05 | 首个生产可用版本，20+ 模型接入、RAG、`@Tool`、MCP |
| **1.1 GA** | 2025-11 | 累计 **850+ 项改进**；MCP 支持成为一等公民 |
| **2.0.0-M1** | 2025-12-11 | 转向 **Spring Boot 4 / Spring Framework 7** 基线 |
| **2.0.0 GA** | **2026-06-12** | 经历 M1~M8 + RC1/RC2 后 GA |
| **2.0.1** | 2026-08-20 | 构建于 **Spring Boot 4.1.1** |
| 维护线 | 2026-06-12 | `1.1.8` 与 `1.0.9` 同日发布，供存量项目继续用 |

**选版本的三条判据：**

```text
项目还在 Spring Boot 3.5 及以下      → 用 1.1.x（1.1.8），别硬上 2.0
项目要上 Spring Boot 4.x            → 用 2.0.x，因为 2.0 硬依赖 Boot 4.1
只要最稳、不追新                      → 用 LTS 风格维护线（1.1.x / 1.0.x）
```

### ⚠️ 2.0 的破坏性变化（升级前必须知道）

| 变化 | 影响 |
|---|---|
| **硬依赖 Spring Boot 4.1** | 无法在 Boot 3.x 上使用；Jackson 2 → **Jackson 3**（包名从 `com.fasterxml.jackson` 变成 `tools.jackson`） |
| **Tool Calling 一等公民化** | 工具调用循环从各 `ChatModel` 里剥离，统一由 `ChatClient` 通过 `ToolCallingAdvisor` 在外部处理 |
| **新增工具按需检索** | 工具数量多时不再全量下发：先按语义相关性检索出少量工具再给模型 |
| **JSpecify 空值安全注解** | 代码库全面采用，编译期就能发现部分空指针风险 |
| **MCP SDK 2.0** | MCP 客户端/服务端基于新版 SDK，部分 API 与 1.x 不同 |
| **移除了部分公开类型** | 升级时会遇到编译错误——这是**设计如此**，不是 bug |

> **升级策略**：Boot 4 迁移和 Spring AI 2.0 迁移**不要同时做**。先把 Boot 升到 3.5 清掉所有弃用警告，再升 Boot 4，最后上 Spring AI 2.0——三件事分开做，出问题才知道是谁的锅。

## 二、ChatClient 与 ChatModel：为什么推荐前者 {#chatclient}

`ChatModel` 是底层接口，`ChatClient` 是面向使用者的门面。差别不在"能不能用"，而在**你要自己写多少东西**：

| 维度 | `ChatModel` | `ChatClient` |
|---|---|---|
| API 复杂度 | 高（手动构建 `Prompt`） | 低（流式 DSL） |
| Advisor 支持 | ❌ 不支持 | ✅ 内置 |
| 会话记忆 | 需手动拼历史消息 | ✅ Advisor 自动处理 |
| 流式输出 | 需额外封装 | ✅ `.stream()` 一行 |
| 结构化管理 | 手动 | ✅ 内置转换器 |
| **推荐度** | 特殊场景 | **默认选择** |

```java
@RestController
public class ChatController {

    private final ChatClient chatClient;

    // 注入 Builder 而不是 ChatClient —— Builder 由自动配置提供，
    // 这样才能按需叠加 defaultSystem / defaultAdvisors
    public ChatController(ChatClient.Builder builder) {
        this.chatClient = builder
                .defaultSystem("你是一个 Java 后端技术助手")
                .build();
    }

    @PostMapping("/chat")
    public String chat(@RequestBody String message) {
        return chatClient.prompt().user(message).call().content();
    }

    // 流式：直接返回 Flux，配合 SSE 就能做打字机效果
    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> stream(@RequestBody String message) {
        return chatClient.prompt().user(message).stream().content();
    }
}
```

**为什么注入 `Builder` 而不是 `ChatClient`？** 因为 `ChatClient` 不是自动配置的 Bean——它是你用 Builder 构建出来的。而 `Builder` 由 starter 的自动配置提供。**所以业务里到处注入的是 Builder，然后各自 `build()`，这是正常写法**，不是设计缺陷。

> ⚠️ **一个常见的起不来问题**：类路径上同时存在多个模型 starter 时，`ChatClient.Builder` 会有多个候选 Bean，注入会歧义报错。解法是用 `@Qualifier` 指定，或者干脆手动构建。这和 [Spring Boot 自动配置](/java/spring/spring-boot/auto-configuration) 里的条件装配规则是同一回事——**条件装配的前提是"恰好一个"**。

## 三、Advisor：把中间件思想搬进 AI 调用链 {#advisors}

**这是 Spring AI 最"Spring"的设计。** AI 调用也有一堆横切关注点——记会话、检索知识、打日志、过滤敏感词、限流配额——如果每处都手写，业务代码会被淹没。Advisor 就是 AI 版的拦截器链：

```text
ChatClient.prompt().user(问题).call()
        │
        ▼
   ┌─────────────────────────────────────────┐
   │         Advisor 链（有序）               │
   │  ┌───────────────────────────────────┐  │
   │  │ ① 记忆 Advisor                     │  │  ← 把历史消息拼进 prompt
   │  ├───────────────────────────────────┤  │
   │  │ ② RAG Advisor                      │  │  ← 检索相关文档，注入上下文
   │  ├───────────────────────────────────┤  │
   │  │ ③ 日志 Advisor                     │  │  ← 记录请求/响应/token
   │  ├───────────────────────────────────┤  │
   │  │ ④ 安全过滤 Advisor                  │  │  ← 拦截敏感词、脱敏
   │  └───────────────────────────────────┘  │
   └────────────────────┬────────────────────┘
                        ▼
                  模型调用
                        │
                        ▼
              逆序返回，逐层处理响应
```

### 常用 Advisor

| Advisor | 作用 |
|---|---|
| `MessageChatMemoryAdvisor` | 会话记忆：按 `conversationId` 存取历史 |
| `QuestionAnswerAdvisor` | RAG：检索向量库并增强 prompt |
| `SimpleLoggerAdvisor` | 打印请求与响应，排查问题用 |
| `SafeGuardAdvisor` | 屏蔽词过滤（命中直接拒绝） |

### ⚠️ 顺序是语义的一部分

Advisor 顺序决定数据流经的顺序。**顺序不对，结果就是错的**，而且不报错：

```text
记忆 → RAG    ：先拼历史，再检索并追加知识
RAG  → 记忆   ：检索时看不到历史的补充信息，可能检索出与上下文无关的内容
安全 → 记忆   ：安全检查只看当轮输入，**用户历史里的敏感信息会被漏过**
记忆 → 安全   ：安全能看到完整历史，防注入能力更强  ← 通常更合理
```

**经验规则：日志放最外层（要看到最终发给模型的完整内容），安全过滤放在"能看到完整上下文"的位置，RAG 与记忆的相对顺序按业务判断。**

### 自研 Advisor 的实际场景

| 场景 | 做法 |
|---|---|
| 多租户隔离 | 从鉴权上下文取 `tenantId`，注入到 prompt 与检索过滤条件 |
| 配额限流 | 进入时扣减额度，超限直接抛出 |
| 审计留痕 | 记录"谁在什么时候问了大模型什么"，满足合规要求 |
| 降级 | 模型不可用时返回兜底答案，而不是抛异常 |

**这就是 Advisor 的价值：所有 AI 调用的横切逻辑，用同一种模式统一收口。**

## 四、结构化输出 {#structured-output}

大模型天生输出文本，但下游代码要的是**对象**。Spring AI 内置了转换器：

```java
record OrderInfo(String orderNo, String status, BigDecimal amount) {}

OrderInfo info = chatClient.prompt()
        .user("从这段客服对话里抽取订单信息：" + rawText)
        .call()
        .entity(OrderInfo.class);       // 直接得到强类型对象
```

**但必须清醒地认识它的可靠性边界：**

| 风险 | 应对 |
|---|---|
| 模型返回的 JSON 不符合 schema | 转换失败要**捕获并重试**，不能假定一次就对 |
| 字段缺失或类型错 | 校验（`@Valid` / JSpecify）后决定重试还是降级 |
| 枚举值不在范围内 | 让模型返回受限枚举，或在代码里做映射兜底 |
| 纯文本里混了解释 | 提示词明确"只输出 JSON"，并接受偶发失败 |

> **一句话判据**：结构化输出是"**提高成功率**"，不是"**保证正确性**"。把它当成一个可能失败的外部调用，而不是一个可靠的类型转换。

**该用哪个？** 想让模型**产出**结构化数据用 output converter；想让模型**去取**数据（要触发一次动作）用 Tool Calling——两者的语义完全不同，别混用。

## 五、Tool Calling {#tool-calling}

```java
@Component
public class OrderTools {

    // 描述写得好不好，直接决定模型会不会用、用得对不对
    @Tool(description = "根据订单号查询订单的支付状态与金额，仅支持已支付订单")
    public OrderInfo queryOrder(
            @ToolParam(description = "订单号，格式：ORD + 13 位数字") String orderNo) {
        return orderService.find(orderNo);
    }
}

String answer = chatClient.prompt()
        .user("帮我看看 ORD2026091500001 付款了没")
        .tools(orderTools)            // 注册工具
        .call()
        .content();
```

**机制本身在 [Agent 与 Harness](/ai/agent-harness/#tool-calling) 里已经拆过**：模型只是返回"要调用哪个函数、参数是什么"，**真正执行的是你的 Java 方法**。所以：

| 工程要点 | 说明 |
|---|---|
| **描述质量** | 模型看不到方法体，只能看描述——写清"何时用、边界、参数格式" |
| **工具数量** | 全量下发会撑爆 prompt 并降低准确率；2.0 起支持按需检索下发 |
| **幂等** | 模型会重试，工具必须能安全重复执行 |
| **超时与异常** | 工具内部的超时要自己控，异常要转成模型能理解的错误信息 |
| **不返回敏感数据** | 工具返回值会进入 prompt 与日志——**别把密钥、全量用户信息塞进去** |

> **2.0 的一个结构性变化值得单独记住**：工具调用循环不再藏在各个 `ChatModel` 实现里，而是**由 `ChatClient` 通过 `ToolCallingAdvisor` 在外部统一处理**。好处是所有模型实现共享同一套循环逻辑，工具检索、循环上限、异常处理都能统一配置。

### MCP：把工具接入标准化 {#mcp}

`@Tool` 解决的是"**我这个应用内部的**方法怎么被模型调用"。而当一个工具要**被多个客户端复用**（或者反过来，你的应用要用别人写好的工具）时，私有注解就不够了——这就是 [MCP（Model Context Protocol）](/ai/agent-harness/#mcp) 的位置。

Spring AI 把两侧都做成了 starter：

| 方向 | 作用 | 典型场景 |
|---|---|---|
| **MCP Client** | 连到外部 MCP Server，把它的工具当成自己的工具用 | 接入现成的文件系统/搜索/数据库 MCP Server，不用自己写适配 |
| **MCP Server** | 把本应用的 `@Tool` 方法暴露成 MCP Server | 让公司内部的工具被所有合规客户端复用 |

支持 `stdio` 与 **Streamable HTTP** 两种传输，服务端 starter 还能配合 Spring Security 做 OAuth 鉴权。

> ⚠️ **落地时的两个提醒**：① MCP 规范在 **2026-07-28** 有过不兼容变更（移除协议级会话、移除 GET 流端点），选型时先确认你的客户端与服务端支持的是同一版规范；② 本地起的 MCP Server 必须**只绑 `127.0.0.1` 并校验 `Origin`**，否则本机的高权限工具可能被任意网页通过 DNS rebinding 调用。

## 六、RAG：全链路与调优优先级 {#rag}

RAG（Retrieval-Augmented Generation）的本质是**把"检索"和"生成"拆开**：检索负责"找到相关信息"，生成负责"用这些信息回答问题"。它解决的是大模型的两个硬伤——**不知道你的私有数据**、**会一本正经地编**。

```text
【离线：建索引】
  原始文档（PDF / Word / 网页 / 数据库）
        │  DocumentReader   ← 解析成文本
        ▼
      切块（Splitter）      ← ★ 效果的分水岭在这一步
        │
        ▼
    向量化（EmbeddingModel）
        │
        ▼
   存入 VectorStore（含元数据）

【在线：问答】
  用户问题 → 向量化 → 相似度检索（可加元数据过滤）→ Top-K 片段
        │
        ▼
  拼进 prompt（"基于以下资料回答…"）→ 模型生成 → 返回
```

### 组件对照

| 环节 | 抽象 | 说明 |
|---|---|---|
| 读取 | `DocumentReader` | 支持本地文件、S3、MongoDB 等；PDF 解析走 Apache Tika |
| 切块 | `TextSplitter` | 按 token / 按语义切，**最影响效果** |
| 向量化 | `EmbeddingModel` | 与检索模型必须匹配（同一模型） |
| 存储 | `VectorStore` | PGVector / Redis / Elasticsearch / Milvus / Chroma / Qdrant / Pinecone / Weaviate… |
| 检索增强 | `QuestionAnswerAdvisor` | 一行接入 |

### 四个调优点，按优先级排

| 优先级 | 调什么 | 怎么调 | 为什么排这个位置 |
|---|---|---|---|
| **1** | **切块策略** | 块大小、重叠、按标题/段落切而不是按字数硬切 | **块切错了，后面怎么调都救不回来**——语义被切断的块，检索出来也没用 |
| **2** | **元数据过滤** | 入库时打上租户/部门/时间/密级标签，检索时强制过滤 | 既提准确率，**更是安全底线**（见下方警告） |
| 3 | Top-K 与相似度阈值 | 增大 K 会引入噪声，加阈值过滤掉低相关片段 | 噪声会误导模型，比"少给一点"更糟 |
| 4 | 重排（Rerank） | 粗排召回后用小模型精排 | 收益真实但要额外成本与延迟，前三项没做好时先别上 |

> ⚠️ **一个必须强调的安全问题**：如果系统里存了多个租户/部门的数据，而检索时**没有强制加上元数据过滤**，那么 A 部门的人就能问出 B 部门的资料。**这是数据泄露，不是效果问题。** 把过滤条件放在 Advisor 里、从鉴权上下文取，不要依赖调用方自觉传参。

**一个反直觉但正确的结论：RAG 效果不好，八成不是模型的问题，而是切块和检索的问题。** 花时间调 prompt 的收益，通常远小于花时间改切块策略。

## 七、ChatMemory {#memory}

| 方式 | 机制 | 用在哪 |
|---|---|---|
| `MessageWindowChatMemory` | 滑动窗口，保留最近 N 条 | 常规多轮对话，**默认选择** |
| 持久化版本 | 窗口 + JDBC / Cassandra / Neo4j 存储 | 会话要跨实例、跨重启 |
| `VectorStoreChatMemoryAdvisor` | 按语义相似度检索历史消息 | 超长会话、需要"想起很久前提过的事" |

### 两个必须注意的点

**① `conversationId` 必须来自鉴权上下文，绝不能由前端直接传。**

```text
❌ chatClient.prompt().user(msg)
        .advisors(a -> a.param("chat_memory_conversation_id", request.getConversationId()))
                          ↑ 前端传什么就用什么 → 改个 ID 就能读到别人的对话历史

✅ 从 SecurityContext / 登录态里取当前用户 + 会话标识，拼成 conversationId
```

这和"越权查询"是同一类漏洞——**凡是"标识资源归属"的参数，都不能信客户端。**

**② 窗口大小是成本与效果的交换：**

```text
窗口太小 → 记不住上下文，用户要重复说
窗口太大 → 每轮都把全量历史重发一遍，token 成本线性增长，且容易失真
```

**经验做法**：窗口控制在最近若干轮；更早的信息不要靠"塞得更多"来解决，而应该**沉淀到外部（RAG 知识库 / 结构化摘要）**，需要时再检索回来——这和 [上下文工程](/ai/agent-harness/#context-engineering) 讲的是同一件事。

## 八、接 Spring 生态与 Boot 4 注意点 {#ecosystem}

Spring AI 最大的结构性优势，是**它能直接复用你已经有的那些基础设施**：

| 能力 | 怎么复用 |
|---|---|
| **可观测** | 自动接入 **Micrometer**：模型调用耗时、token 用量、工具调用次数都成了指标，直接进 [Actuator](/java/spring/spring-boot/actuator#metrics) 与现有监控 |
| **鉴权与配额** | 用 Advisor 做配额扣减、权限校验，和 `Spring Security` 串起来 |
| **配置管理** | 模型参数走 `@ConfigurationProperties`，纳入 [配置体系](/java/spring/spring-boot/configuration#binding) |
| **测试** | 只依赖 `ChatModel` 接口 → 测试里注入假实现，不真调模型 |
| **切模型** | 换厂商 = 换 starter + 改配置，业务代码不动 |

**Boot 4 环境下的三个注意点：**

1. **Jackson 3**：包名变了（`com.fasterxml.jackson` → `tools.jackson`）。如果你在自定义序列化或直接操作 Jackson 类型，迁移时必然要改；
2. **模块化**：Boot 4 把原先的大 autoconfigure 模块拆开了，starter 依赖名有调整——**1.0/1.1 时代的 starter 名（如 `spring-ai-openai-spring-boot-starter`）与 1.0 之后的命名（`spring-ai-starter-model-*`）不一样，抄代码前先确认版本**；
3. **Java 基线**：Boot 4 本身的 Java 基线是 17，但 AI 项目普遍建议 21+（虚拟线程、结构化并发都在这个方向），生产环境别贴着最低线走。

## 九、常见坑 {#pitfalls}

| # | 坑 | 正确做法 |
|---|---|---|
| 1 | 在 Boot 3.5 上硬上 Spring AI 2.0 | 2.0 硬依赖 Boot 4.1；Boot 3.x 用 1.1.x |
| 2 | Boot 4 迁移 + Spring AI 2.0 升级一起做 | 分三步走：Boot 3.5 清弃用 → Boot 4 → AI 2.0 |
| 3 | 用 2025 年的教程抄 starter 名 | starter 命名在 1.0 前后不同，先核对版本 |
| 4 | 直接注入 `ChatClient` 报错 | 注入 `ChatClient.Builder` 自己构建 |
| 5 | 多个模型 starter 导致 Builder 歧义 | `@Qualifier` 指定，或手动构建 |
| 6 | Advisor 顺序随意 | 顺序即语义：日志最外层、安全要能看到完整上下文 |
| 7 | 把结构化输出当可靠类型转换 | 当成可能失败的外部调用：校验 + 重试 + 降级 |
| 8 | `conversationId` 由前端传 | 必须从鉴权上下文取——否则能读别人的会话 |
| 9 | RAG 检索不加元数据过滤 | 强制按租户/密级过滤，**这是数据泄露不是效果问题** |
| 10 | RAG 效果差先调 prompt | 先调切块策略与检索，收益差一个数量级 |
| 11 | Top-K 越大越好 | 噪声比"少给"更糟，配相似度阈值 |
| 12 | 工具返回值包含敏感数据 | 工具返回值会进 prompt 与日志，先脱敏 |
| 13 | 窗口设很大以求"记得住" | 成本线性增长且会失真；早前信息沉淀到外部按需检索 |
| 14 | 没有可观测就上线 | 接 Micrometer，先能看到耗时与 token 用量 |

## 十、高频问答 {#interview}

| 问题 | 一句话答案 |
|---|---|
| Spring AI 解决的核心问题？ | 把各家模型的差异收敛成一组抽象，并把 AI 能力变成 Spring 容器里的一等公民——换模型改配置不动代码 |
| `ChatModel` 和 `ChatClient` 怎么选？ | 默认 `ChatClient`（DSL、Advisor、记忆、流式都内置）；`ChatModel` 只在需要精细控制时用 |
| 为什么注入的是 `ChatClient.Builder`？ | `ChatClient` 不是自动配置的 Bean，Builder 才是；业务侧各自 `build()` 是正常写法 |
| Advisor 是什么？ | AI 调用的**拦截器链**：记忆、RAG、日志、安全过滤都用它统一收口 |
| Advisor 的顺序重要吗？ | 非常重要且**不会报错**——顺序即语义；日志放最外层、安全要能看见完整上下文 |
| ChatMemory 的 `conversationId` 能由前端传吗？ | **绝对不能**。必须从鉴权上下文取，否则改个 ID 就能读别人的对话历史（越权漏洞） |
| RAG 效果不好先调什么？ | 先调**切块策略**，再查检索（元数据过滤、Top-K、阈值）。调 prompt 收益最小 |
| RAG 为什么要做元数据过滤？ | 除了提准确率，更是**安全底线**——不加过滤会造成跨租户数据泄露 |
| 结构化输出可靠吗？ | 是"提高成功率"不是"保证正确性"：必须校验、重试、降级，当成可能失败的外部调用 |
| 工具调用和结构化输出怎么分工？ | 要模型**产出**结构化数据用 output converter；要模型**去取**数据（触发动作）用 Tool Calling |
| Spring AI 2.0 有什么重大变化？ | 硬依赖 Boot 4.1、Jackson 3、JSpecify、MCP SDK 2.0；**工具调用循环统一由 `ToolCallingAdvisor` 处理**并支持工具按需检索 |
| 升级顺序该怎么排？ | Boot 3.5 清弃用 → Boot 4 → Spring AI 2.0，**三件事分开做**，否则出问题定位不了 |
| Spring AI 怎么复用现有基础设施？ | 可观测走 Micrometer（自动进 Actuator）、鉴权配额走 Advisor + Security、配置走 `@ConfigurationProperties` |
| 怎么测试 AI 相关的代码？ | 业务只依赖 `ChatModel` 接口 → 注入假实现；不真调模型就能跑 CI |
