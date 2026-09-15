---
date: 2026-09-11
desc: AI 应用板块导览——AI 辅助研发与 AI 能力集成两条主线、五篇正文的定位与阅读路径、高频考点速查
---

# AI 应用 · 板块导览

本板块聚焦 AI 在工程中的**两条落地路径**：一条是"用 AI 来写系统"，另一条是"把 AI 能力接进系统"。前者改变开发方式，后者改变产品形态——两者都已成为后端/全栈工程师的必备技能。

## 一、两条主线 {#two-lines}

### 主线一：AI 辅助研发（用 AI 写系统）

| 主题 | 定位 | 内容 |
|---|---|---|
| [**Vibe Coding 与 AI 辅助研发**](/ai/vibe-coding/) | 开发范式与协作流程 | 四种协作模式的分界、**上下文文件与 Skills 的工程化写法**、2026 工具格局、五道质量闸门 |
| [**Agent 与 Harness**](/ai/agent-harness/) | **机制原理与协议** | Agent 循环与终止判据、Harness 六个组成部分、工具调用机制、**MCP 协议最新规范**、上下文工程、多 Agent 边界 |

这条线的核心问题不是"AI 能不能写代码"，而是**如何把 AI 纳入可控的工程流程**——上下文怎么给、产出怎么验证、哪些环节可以放手、哪些必须人工把关。

> **两篇的分工**：`Vibe Coding` 回答"**人该怎么和 AI 协作**"（流程、闸门、工具选型）；`Agent 与 Harness` 往下走一层，回答"**Agent 内部是怎么运转的**"（工具、循环、上下文、协议）。

### 主线二：AI 能力集成（把 AI 接进系统）

| 主题 | 定位 | 内容 |
|---|---|---|
| [**Spring AI**](/ai/spring-ai/) | Java 侧的**原子能力** | ChatClient、**Advisor 中间件模型**、结构化输出、Tool Calling、RAG 全链路与调优优先级、版本时间线 |
| [**Spring AI Alibaba**](/ai/spring-ai-alibaba/) | Java 侧的**编排层 + 企业配套** | 与 Spring AI 的边界、**Graph 多智能体编排**、百炼与国产模型接入、Nacos MCP Registry、Human-in-the-Loop |
| [**数字人**](/ai/digital-human/) | 多模态能力的**终端集成** | 形态分类与选型维度、实时互动链路、第三方 AI 能力接入方法论 |

这条线的核心问题是**工程化**：AI 能力本身由平台提供，但把它变成稳定可运维的产品，靠的仍是后端的基本功——鉴权、配额、降级、监控、成本控制。

> **`Spring AI` 与 `Spring AI Alibaba` 的分工**是一条容易混淆的边界，记住一句就够：**前者给的是砖头和水泥（模型、向量库、工具、记忆的原子抽象），后者给的是精装修方案（流程编排 + 国产模型 + 可观测配套）。** 单点能力用前者，流程需要编排时再引入后者——详见 [Spring AI Alibaba · 什么时候用哪个](/ai/spring-ai-alibaba/#when-to-use)。

## 二、内容地图 {#map}

```text
AI 应用
├── 【用 AI 写系统】AI 辅助研发
│   ├── Vibe Coding 与 AI 辅助研发    协作流程 · 上下文工程 · 五道闸门
│   └── Agent 与 Harness             循环 · 工具 · MCP 协议 · 多 Agent
│
└── 【把 AI 接进系统】AI 能力集成
    ├── Spring AI                    原子抽象 · Advisor · RAG
    ├── Spring AI Alibaba            Graph 编排 · 国产模型 · 企业配套
    └── 数字人                        多模态终端集成
        ├── 数字人 · 导览             形态分类与选型维度
        ├── 实时互动数字人            选型与集成落地
        └── 集成清单                 第三方 AI 能力接入方法论

横向依赖：
  Vibe Coding ──▶ Agent 与 Harness     （先懂协作方式，再懂内部机制）
  Agent 与 Harness ──▶ Spring AI       （先懂机制，再看 Java 侧怎么实现）
  Spring AI ──▶ Spring AI Alibaba      （先会用原子能力，再上编排）
  Spring AI Alibaba ──▶ 数字人          （编排能力用于多模态链路）
```

**为什么把 `Agent 与 Harness` 放在 `Spring AI` 前面？** 因为框架会把机制藏起来。**先理解"工具调用本质是宿主侧执行一个 Java 方法"、"MCP 是协议而非库"，再看 Spring AI 的 `@Tool` 与 MCP starter，才知道它在帮你做什么**——否则很容易把框架当成魔法。

## 三、阅读建议 {#reading}

| 你的关注点 | 建议路径 |
|---|---|
| **提升日常开发效率** | [Vibe Coding](/ai/vibe-coding/) → [Agent 与 Harness](/ai/agent-harness/) |
| **在 Java 项目里用大模型** | [Agent 与 Harness](/ai/agent-harness/) → [Spring AI](/ai/spring-ai/) → [Spring AI Alibaba](/ai/spring-ai-alibaba/) |
| **要做多智能体 / 流程编排** | [Agent 与 Harness · 多 Agent](/ai/agent-harness/#multi-agent) → [Spring AI Alibaba · Graph](/ai/spring-ai-alibaba/#graph) |
| **做面向终端的 AI 产品** | [数字人导览](/ai/digital-human/) → [实时互动数字人](/ai/digital-human/interactive-avatar) → [集成清单](/ai/digital-human/integration-checklist) |
| **要对接 MCP / 外部工具** | [Agent 与 Harness · MCP](/ai/agent-harness/#mcp) → [Spring AI · MCP](/ai/spring-ai/#mcp) → [Spring AI Alibaba · Nacos MCP Registry](/ai/spring-ai-alibaba/#enterprise) |
| **面试前突击** | [高频考点速查](#faq) → 回正文看推导 |

> 路径中的「[集成清单](/ai/digital-human/integration-checklist)」虽然写在数字人板块下，但它与具体厂商无关：约束定义、能力边界盘点、凭证分层、供应商对接、验收标准——换任何第三方 AI 能力都适用。

## 四、高频考点速查 {#faq}

| 高频问题 | 一句话答案 | 详见 |
|---|---|---|
| AI 辅助开发最大的瓶颈是什么？ | **上下文，不是模型**——模型不知道你的约定与禁止项，就会持续产出"看起来对"的代码 | [Vibe Coding](/ai/vibe-coding/#context-files) |
| Vibe coding 和 Spec-driven 的本质区别？ | **规格的生命周期**：前者只活在对话历史里，后者是持久、可执行、进版本库的契约 | [Vibe Coding](/ai/vibe-coding/#four-modes) |
| 什么样的任务可以放手交给 AI？ | **产物能被自动验证的**；架构决策与资金/权限边界逻辑必须人把关 | [Vibe Coding](/ai/vibe-coding/#human-gates) |
| Agent 和一次 LLM 调用的本质区别？ | **有无闭环**：能通过工具改变外部世界、看到结果、据此自我修正 | [Agent 与 Harness](/ai/agent-harness/#agent-loop) |
| 什么是 Harness？ | 模型之外让它能安全稳定干活的全部设施：工具、循环控制、上下文、权限沙箱、记忆、可观测 | [Agent 与 Harness](/ai/agent-harness/#what-is-harness) |
| Agent 的终止条件该怎么定？ | 由**外部可验证信号**判定（测试/断言），不要采信模型自评 | [Agent 与 Harness](/ai/agent-harness/#agent-loop) |
| 工具调用的机制是什么？ | 签名转 JSON Schema → 随 prompt 发出 → 模型返回调用请求 → **宿主侧执行** → 结果回注 | [Agent 与 Harness](/ai/agent-harness/#tool-calling) |
| 为什么需要 MCP？ | 把 M×N 份适配代码变成 **M+N**：一次实现，任何合规客户端都能用 | [Agent 与 Harness](/ai/agent-harness/#mcp) |
| MCP 最新规范有什么重大变化？ | 2026-07-28 版**移除协议级会话与 GET 流端点**、引入多轮往返请求（MRTR）、结果可缓存、扩展成为一等公民 | [Agent 与 Harness](/ai/agent-harness/#mcp) |
| 什么时候该上多 Agent？ | 子任务真独立 + 单 Agent 装不下 + 能承受更高成本与更差可观测性，**三条同时满足**才值得 | [Agent 与 Harness](/ai/agent-harness/#multi-agent) |
| Spring AI 的 Advisor 是什么？ | AI 调用的**拦截器链**：记忆、RAG、日志、安全过滤统一收口；**顺序即语义** | [Spring AI](/ai/spring-ai/#advisors) |
| ChatMemory 的会话 ID 能由前端传吗？ | **绝对不能**——必须从鉴权上下文取，否则改个 ID 就能读别人的对话历史 | [Spring AI](/ai/spring-ai/#memory) |
| RAG 效果不好先调什么？ | 先调**切块策略**，再查检索（元数据过滤、Top-K、阈值）；调 prompt 收益最小 | [Spring AI](/ai/spring-ai/#rag) |
| 为什么 RAG 必须做元数据过滤？ | 除了提准确率，更是**安全底线**——不加过滤会造成跨租户数据泄露 | [Spring AI](/ai/spring-ai/#rag) |
| Spring AI 2.0 有什么重大变化？ | 硬依赖 Boot 4.1、Jackson 3、JSpecify、MCP SDK 2.0；**工具调用循环统一由 `ToolCallingAdvisor` 处理** | [Spring AI](/ai/spring-ai/#positioning) |
| Spring AI 和 Spring AI Alibaba 怎么分工？ | 前者是原子抽象（砖头水泥），后者是编排 + 国产模型 + 企业配套（精装修） | [Spring AI Alibaba](/ai/spring-ai-alibaba/#when-to-use) |
| Graph 编排的核心价值？ | 把流程**从模型手里收回到开发者手里**：路径由边决定 → 可复现、可测试、可插人工确认 | [Spring AI Alibaba](/ai/spring-ai-alibaba/#graph) |
| Human-in-the-Loop 为什么重要？ | 技术上是一个"等人确认"节点，**组织上是 AI 决策失控的兜底与免责边界** | [Spring AI Alibaba](/ai/spring-ai-alibaba/#graph) |
| 评估一个 AI 框架该问什么？ | 三问：能接我的模型吗（合规）、能看见它干了什么吗（可观测）、流程能被约束吗（编排） | [Spring AI Alibaba](/ai/spring-ai-alibaba/#enterprise) |

## 五、与相邻板块的边界 {#boundary}

| 相邻板块 | 分工 |
|---|---|
| [Java 并发](/java/concurrent/) | AI 调用是**阻塞式外部依赖**，批量调用要用并发编排控制超时与线程池——`CompletableFuture` 与虚拟线程在这条线上高频出现 |
| [Spring Boot](/java/spring/spring-boot/) | 模型参数的配置绑定、AI 服务的可观测（Micrometer 进 Actuator）、启动与优雅停机，都复用 Boot 的机制 |
| [消息队列](/middleware/) | AI 任务适合异步化（推理是秒级），Agent 编排与任务分发可以走 MQ；RocketMQ 5.5 的 Lite Mode 就是朝这个方向做的 |
| [云原生](/cloud-native/) | Agent 服务是长耗时服务，扩缩容、超时、资源限额要按这个前提设计 |
