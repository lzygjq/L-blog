---
date: 2026-09-16
title: 安全与合规 · 板块导览
---

# 安全与合规 · 板块导览

先说清这个板块**不做什么**：它不是渗透测试的工具教程（扫描器、Burp 的用法不在这里），不是法务合规咨询（具体义务的判定要走专业渠道），也不是框架 API 手册。这里只做一件事：**把「安全」从"上线前找个工具扫一遍"变成设计阶段就要做出的选择**——因为绝大多数安全问题的根因是一次架构选择，而不是一行代码写错了。

## 一、为什么这不是「加分项」而是「必需项」 {#why}

功能缺陷和安全缺陷的性质完全不同，这个差别决定了投入方式：

| 维度 | 功能缺陷 | 安全缺陷 |
|---|---|---|
| 何时暴露 | 使用时立刻暴露 | **可能长期静默**——没有反馈、不报错 |
| 可逆性 | 通常可修 | **数据泄露出去就收不回**（尤其身份信息、密钥、支付数据） |
| 责任 | 内部问题 | **外部化**：客户审计、监管检查、事故通报 |
| 测试方式 | 正向用例（该能做的能做） | **必须补否定式用例（不该能做的能不能做）** |

**第三行是这一整块最实际的价值**：常规测试用例是从需求文档来的，而需求文档只写"管理员能删除用户"，不写"普通用户不能删除用户"。所以**越权、注入、绕过这类缺陷在功能测试里天然不会被发现**——必须专门设计"否定的"用例，这本身就是一种测试思想（见 [授权模型与权限落地](/security/authorization#negative-testing)）。

还有一个成本视角值得记住：**安全设计的成本在前端（设计期）极低，在后端（已上线）极高**。例如"令牌放 Cookie 还是 localStorage"在写第一行代码时是一个十分钟的决定，等系统上线、前端已全面依赖某个存储方式之后再改，就是一次全端改造。

## 二、六篇地图 {#map}

| # | 篇 | 解决什么问题 | 一句话结论 |
|---|---|---|---|
| 1 | [认证方式全景与选择](/security/authentication) | 怎么确认"你是谁"，会话还是令牌 | 多端现实下选令牌，但必须用**短命访问令牌 + 可撤销刷新令牌 + 复用检测**把"无法主动失效"补回来 |
| 2 | [授权模型与权限落地](/security/authorization) | 怎么确认"你能做什么"，越权从哪来 | **只控前端等于没控**；水平越权的唯一解是把归属条件写进查询 |
| 3 | [OAuth2 与开放授权](/security/oauth2) | 第三方接入怎么做才不出事 | OAuth2 **不是认证协议**；`redirect_uri` 的精确匹配是整个模型的地基 |
| 4 | [Web 攻击防护](/security/web-attack) | 注入、XSS、CSRF、SSRF 怎么根治 | 让数据永远无法成为代码；转义在**输出点**、校验在**服务端** |
| 5 | [加密、脱敏与合规边界](/security/crypto-compliance) | 加密怎么用才有效、合规怎么落到代码 | 加盐还不够，**必须慢**；删除数据的难点在副本不在主库 |
| 6 | [合规体系：等保、数据出境与开源许可治理](/security/compliance-system) | 做到了怎么证明；外部要求怎么变成内部机制 | **安全是「防住」、合规是「证明」**；定级是唯一不能返工的一步；**AGPL 对 SaaS 特别危险** |

## 三、一条主线：把「信任」收窄 {#thread}

六篇讲的是六件不同的事，但底层是同一条原则的六个应用——**默认不信任，把信任范围缩到最小**：

```
① 不信任客户端          → 服务端独立校验；身份从令牌来，不从参数来
② 不信任输入            → 数据永不成为代码（参数化）；输出点按上下文转义
③ 不信任凭据的长期有效   → 短命令牌 + 可撤销刷新 + 轮换复用检测
④ 不信任网络             → 全链路加密；内部服务间也不裸奔
⑤ 不信任"删了就等于没了" → 列出数据的全部落脚点（备份/数仓/日志/索引）
⑥ 不信任"做到了就等于证明了" → 每一处措施都要留下可被第三方复核的证据（审计日志、测评报告、例外审批）
```

这五条可以直接当作评审清单用：**任何一处"因为前端已经拦了"或"内部服务不用加密"的论证，都是这条主线的破口。**

## 四、与其他板块的关系 {#relations}

| 板块 | 关系 |
|---|---|
| [计算机网络](/fundamentals/network/) | **机制层**：TLS 握手、HTTP 头部语义（`SameSite`、`Origin`、`HSTS`）、DNS 劫持与证书校验 |
| [发布、安全与运维](/projects/property-saas/release-and-ops/) | **落地层**：接口数据安全九项（其中六项落在框架层）、四条合规边界、审计与监控。**本板块讲机制与取舍，那篇讲项目怎么落** |
| [Java 核心 · Spring](/java/spring/) | 过滤器链挂载、`@PreAuthorize` 的表达式能力、Actuator 端点保护 |
| [Spring Cloud](/java/spring/spring-cloud/) | 接口幂等、去重存储——与"重放防护"是同一套基础设施 |
| [数据存储](/database/) | 敏感字段落库加密、会话与令牌的存储选型（Redis 的过期与淘汰策略会影响会话可靠性） |
| [面试专题](/interview/) | 检索层：跨板块连线题与题单索引 |

## 五、面试高频索引 {#interview}

| 主题 | 高频问法 | 出处 |
|---|---|---|
| 会话 vs 令牌 | "JWT 能主动失效吗" | [认证方式全景](/security/authentication#interview) |
| JWT 安全 | "为什么不能把敏感信息放进 payload" | [JWT 的完整剖析](/security/authentication#jwt) |
| 令牌存储 | "存 localStorage 还是 Cookie" | [存储位置权衡](/security/authentication#jwt-storage) |
| 单点登录 | "OAuth2 和 OIDC 什么关系" | [OAuth2 与开放授权](/security/oauth2#oidc) |
| PKCE | "PKCE 解决什么问题" | [两道防线](/security/oauth2#state-vs-pkce) |
| RBAC | "RBAC 什么时候该换" | [授权的三代模型](/security/authorization#models) |
| 越权 | "水平越权和垂直越权的防护有什么不同" | [越权的两类](/security/authorization#broken-access) |
| 租户与权限 | "租户隔离和数据权限为什么不能合并" | [数据权限](/security/authorization#scope-vs-tenant) |
| XSS | "为什么在输出点转义而不是输入过滤" | [XSS](/security/web-attack#xss-escape-where) |
| CSRF | "什么情况下不需要担心 CSRF" | [CSRF 的成立条件](/security/web-attack#csrf-conditions) |
| SQL 注入 | "参数化有什么覆盖不到的地方" | [参数化的缺口](/security/web-attack#sqli-gaps) |
| SSRF | "不跟随重定向为什么重要" | [SSRF](/security/web-attack#ssrf) |
| 密码存储 | "SHA-256 加盐存密码行不行" | [密码存储](/security/crypto-compliance#password-storage) |
| 签名与重放 | "只做签名会不会被重放" | [验签配套项](/security/crypto-compliance#verify-checklist) |
| 数据脱敏 | "脱敏怎么选手段" | [脱敏四级](/security/crypto-compliance#masking) |
| 等保与定级 | "等保二级和三级差在哪" | [定级与一个中心三重防护](/security/compliance-system#djbh) |
| 数据出境 | "什么情况下要申报安全评估" | [三条路径与两个阈值](/security/compliance-system#cross-border) |
| 开源许可 | "AGPL 为什么对 SaaS 特别危险" | [开源许可治理](/security/compliance-system#oss-license) |
| 合规留痕 | "等保要求日志保留多久" | [审计与留痕](/security/compliance-system#audit) |

> **本板块 6 篇正文 / 7 页。** 与 [发布、安全与运维](/projects/property-saas/release-and-ops/) 的分工是「机制 vs 落地」，两边交叉引用而不复制正文。
