# AI 应用 · 板块导览

本板块聚焦 AI 在工程中的**两条落地路径**：一条是"用 AI 来写系统"，另一条是"把 AI 能力接进系统"。前者改变开发方式，后者改变产品形态——两者都已成为后端/全栈工程师的必备技能。

## 一、两条主线

### 主线一：AI 辅助研发（用 AI 写系统）

| 主题 | 内容 |
|---|---|
| [Vibe Coding](/ai/vibe-coding/) | AI 辅助编程工作流、提示词工程、主流工具实测对比 |
| [Agent 与 Harness](/ai/agent-harness/) | Agent 循环（感知-规划-执行）、工具链机制、MCP 协议、多 Agent 协作 |

这条线的核心问题不是"AI 能不能写代码"，而是**如何把 AI 纳入可控的工程流程**——上下文怎么给、产出怎么验证、哪些环节可以放手、哪些必须人工把关。

### 主线二：AI 能力集成（把 AI 接进系统）

| 主题 | 内容 |
|---|---|
| [Spring AI](/ai/spring-ai/) | Chat / Embedding / VectorStore 抽象、RAG 落地、与 Spring Boot 集成 |
| [Spring AI Alibaba](/ai/spring-ai-alibaba/) | 通义系列模型接入、Graph 多 Agent 框架、国内落地实践 |
| [数字人](/ai/digital-human/) | 多模态 AI 能力的终端集成：形象与渲染模式、实时互动链路、落地清单 |

这条线的核心问题是**工程化**：AI 能力本身由平台提供，但把它变成稳定可运维的产品，靠的仍是后端的基本功——鉴权、配额、降级、监控、成本控制。

## 二、内容地图

```
AI 应用
├── AI 辅助研发
│   ├── Vibe Coding              开发范式与工具链
│   └── Agent 与 Harness         机制原理与协议
└── AI 能力集成
    ├── Spring AI                框架抽象与 RAG
    ├── Spring AI Alibaba        国内模型与多 Agent
    └── 数字人                    多模态终端集成
        ├── 数字人 · 导览          形态分类与选型维度
        ├── 实时互动数字人         选型与集成落地
        └── 集成清单               第三方 AI 能力接入方法论
```

## 三、阅读建议

| 你的关注点 | 建议路径 |
|---|---|
| 提升日常开发效率 | Vibe Coding → Agent 与 Harness |
| 在 Java 项目里用大模型 | Spring AI → Spring AI Alibaba |
| 做面向终端的 AI 产品 | 数字人导览 → 实时互动数字人 → 集成清单 |
| 只要一套通用接入方法 | 直接看[集成清单](/ai/digital-human/integration-checklist/) |

> 后一条路径中的「集成清单」虽然写在数字人板块下，但它与具体厂商无关：约束定义、能力边界盘点、凭证分层、供应商对接、验收标准——换任何第三方 AI 能力都适用。
