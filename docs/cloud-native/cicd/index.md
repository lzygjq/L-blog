---
date: 2026-09-16
title: CI/CD 与发布 · 板块导览
sidebar: CI/CD 与发布
desc: 从提交与协作、到不可变制品、发布策略与不中断、GitOps 与渐进式交付、回滚与数据库变更五条线，加上对齐引擎与放量引擎的分层、与其他板块的分工，以及 60 题面试索引
---

# CI/CD 与发布 · 板块导览

这个板块原先只有一页——五个阶段、四种策略、GitOps、扩展-收缩各压几百字，**够回答"是什么"，不够回答"怎么配、会踩什么坑"**。而真实发布事故几乎全部发生在细节里：`preStop` 没睡、终止预算配反、回填脚本不幂等、观察窗口被跳过。

现在拆成五篇：**先从提交本身说起**（分支模型、提交粒度与可评审性），**再讲清从提交到制品的这条链**（CI 的节律与门禁、制品治理与供应链），**接着把四种发布策略与"不中断"的真实难度讲透**，**然后把"谁在同步状态、谁在决定放量"分成两层**，**最后收口到发布里唯一不可逆的部分——数据**。

> **主线：CI 的价值是"把反馈压到分钟级"，交付的价值是"把产物变成不可变的制品"，而发布的上限由"这一步能不能被撤销"决定。**
>
> 三句话对应三个失败模式：**反馈太慢**（人开始攒大批提交）、**产物不可追溯**（出事时不知道线上跑的是哪个版本）、**没给回滚留窗口**（要退时发现数据已经改过去了）。

## 一、一条主线：从代码提交到"出错能退" {#thread}

```
协作：这次提交可评审、可独立回退吗？ ────────▶ Git 协作（分支模型 · 提交粒度 · 评审规模）
   │
   ▼
代码提交
   │
   ├─① 反馈：多久知道"能不能合"？ ──────────▶ 流水线设计（节律 · 门禁 · 快慢排序）
   │
   ├─② 制品：这包能追溯、能验证吗？ ─────────▶ 流水线设计（不可变标签 · SBOM · 签名 · SLSA）
   │
   ├─③ 部署：集群现在是不是期望的样子？ ─────▶ 发布策略（滚动/蓝绿/金丝雀）
   │                                           GitOps 与渐进式交付（持续对齐 · 指标放量）
   │
   └─④ 退路：出错了多久能退、退得掉吗？ ─────▶ 回滚与数据库变更（扩展-收缩）
```

**四个环各自的失效表现**：

| 环 | 依赖 | 缺失时的表现 |
|---|---|---|
| 反馈快 | 门禁设计（快的在前、失败即停、红灯有人管） | 人开始攒大批提交，故障定位成本随批量线性上升 |
| 制品可追溯 | 不可变标签 + 来源可验证 | "回滚到哪一版"要靠人回忆；供应链风险无法回答"我们受影响吗" |
| 集群可收敛 | 声明式 + 持续对齐（GitOps） | 手工改动与 Git 永久分叉，且无人知道 |
| 退路可走 | 扩展-收缩 + 三者超时对齐 + 观察窗口 | 回滚后错误依旧，于是转向生产改数据——把小事故升级成数据事故 |

**所以这个板块不是"工具手册"**——它讲的是这条链上每一环**为什么会在真实环境里断掉**。

## 二、五篇地图 {#map}

| 篇 | 主题 | 一句话主线 | 关键落点 |
|---|---|---|---|
| [〇、Git 协作](/cloud-native/cicd/git-collaboration) | 分支模型 · 提交粒度 · 评审 · 可追溯 | **可追溯靠提交与制品的对应，可回退靠提交的粒度** | rebase 时 `ours` 与 `theirs` 的含义和 merge 相反；评审规模在 200~400 行以内缺陷发现率最高；`reset` 与 `revert` 的分界是「有没有推送」 |
| [一、流水线设计](/cloud-native/cicd/pipeline-design) | 节律 · 门禁 · 制品治理 | **CI 看的是节律，交付看的是制品** | 五个阶段的快慢排序；`COPY pom.xml` 必须在 `COPY src` 之前；SBOM 在**构建时**生成；**只签名不验证等于只写不读** |
| [二、发布策略](/cloud-native/cicd/release-strategies) | 四种策略 · 不中断发布 | **策略选的是"故障半径"，不中断靠"终止路径与摘流路径对齐"** | 蓝绿解决回滚速度、金丝雀解决变更风险；**`preStop` 为什么必须睡**；三者超时如何对齐；PDB 管的是另一类事件 |
| [三、GitOps 与渐进式交付](/cloud-native/cicd/progressive-delivery) | 对齐引擎 · 放量引擎 · 度量 | **GitOps 解决"状态被对齐"，不解决"流量怎么逐步切"** | 拉模式凭证不出集群；**手工改动会被自动纠偏**；Argo Rollouts ≠ Argo CD；金丝雀低峰期会因**样本量不足**误判；DORA 2025 取消 Elite 分档 |
| [四、回滚与数据库变更](/cloud-native/cicd/rollback-and-migration) | 回滚窗口 · 扩展-收缩 · 发布即故障 | **不是"怎么回滚数据库"，而是"设计一条不需要回滚数据库的路"** | 回滚窗口的分界是"数据是否已按新结构写入"；**回填脚本要能中途 kill 再重跑**；五类"发布即故障"；清单里最常被跳过的是**观察窗口** |

## 三、两层分工：对齐引擎与放量引擎 {#layers}

这是本板块最容易被混淆的一处。**"上了 GitOps"和"有金丝雀"是两件事**：

| 层 | 回答的问题 | 代表工具 | 它不做的事 |
|---|---|---|---|
| **对齐引擎** | 集群的实际状态是不是我声明的样子？ | Argo CD、Flux | **不决定放量比例**——它同步的是一个普通 Deployment，滚动还是滚动 |
| **放量引擎** | 新版本该接多少流量、什么时候全量？ | Argo Rollouts、Flagger | 不负责"状态收敛"，它只管流量切换与指标判定 |
| **应用内开关** | 这个功能该对谁生效？ | Feature Flag | 不需要两套实例，但**开关本身会变成技术债** |

**三者的正确关系是分层而不是替代**：

```
对齐：Git 是唯一事实源，集群持续收敛到它
   ↓
放量：流量按 1% → 5% → 25% → 全量推进，指标越界则自动回退
   ↓
业务：新功能按租户 / 地区 / 套餐逐步开启（流量维度管不到的灰度）
```

> **注意最后一行存在的理由**：网关与网格只能按请求切分，**它们看不到业务语义**（"只放给免费用户"），也覆盖不了 MQ 消费、定时任务、CDC 同步这些非请求驱动的路径。**异步链路的灰度必须由应用内的开关承担。**

## 四、与其他板块的关系 {#relations}

| 板块 | 分工 | 边界 |
|---|---|---|
| [监控与可观测](/cloud-native/observability/)（5 篇） | 指标与 PromQL、日志管道、链路与 OTel、SLO 与告警 | **渐进式交付的判定与告警同源**（都查 PromQL）；本板块只讲"怎么用指标做放量判定"，指标本身怎么算不重复 |
| [Kubernetes](/cloud-native/kubernetes/) | 探针语义、滚动更新、QoS、HPA | 本板块的发布策略篇**只讲"四种策略的取舍与不中断的前提"**，对象语义回链那边 |
| [Helm](/cloud-native/helm/#helm-in-cicd) | Chart 打包、`--wait --atomic`、release 生命周期 | **GitOps 模式下 `helm rollback` 不再是回滚手段**（控制器会拉回 Git 状态），这个衔接点在 Helm 篇已埋好 |
| [服务网格](/cloud-native/service-mesh/) | Sidecar 层做流量切分与 mTLS | 网格是**金丝雀流量切分的三个层次之一**；本板块讲"什么时候需要它"，网格本身怎么配不重复 |
| [优雅停机](/high-availability/redundancy-failover#graceful) | `SIGTERM`、连接排空、就绪摘除的完整语义 | 本板块从**发布视角**讲"三者超时怎么对齐"，停机语义本身回链那边 |
| [可用性目标](/high-availability/availability-targets#budget) | 几个 9 的换算、RTO/RPO、错误预算 | **发布是可用性风险最大的来源**；错误预算是"停止发布转稳定性"的客观触发条件 |
| [Docker](/cloud-native/docker/) | 镜像分层与写时复制、多阶段构建 | 本板块的流水线篇从**缓存命中率**角度讲 Dockerfile 分层，机制不回重复 |
| [依赖管理与构建](/java/basics/dependency-build)（Java 基础板块） | 依赖解析、多模块与可复现构建 | **流水线的「构建」阶段依赖它**：依赖未锁定、插件未钉版本会让同一份代码构建出不同产物——**这不是流水线能修的** |
| [项目实战 · 发布与运维](/projects/property-saas/release-and-ops/#release) | 具体系统的发布方案与检查清单 | 那边是**落地视角**（这个系统怎么做），本板块是**通用判据**（为什么这样做） |

## 五、版本与许可现状 {#versions}

| 组件 | 现状（2026-09） | 需要注意 |
|---|---|---|
| **Argo CD** | **v3.5.3（2026-09-14）**，CNCF 毕业项目；Apache-2.0 | **v3.0 的主要动作是收紧 RBAC 默认值**，升级前先核对 RBAC；v3.5 是 3.0 以来最大版本（ApplicationSet 提升为一等公民） |
| **Flux** | **v2.9.5（2026-08-31）**；Apache-2.0 | **Weaveworks 在 2024-02 倒闭**后控制权转社区（ControlPlane 提供商业支持）；**镜像自动化是内置能力**（image-reflector + image-automation），不需要独立组件 |
| **Argo Rollouts** | **v1.10.0（2026-08-27）**；Apache-2.0 | **它不是 Argo CD 的一部分，必须单独安装**；**Gateway API 的支持走社区插件** |
| **Flagger** | 与 Flux 生态配对；Apache-2.0 | 指标驱动的金丝雀分析（Prometheus / Datadog）；先于 Argo Rollouts 出现，成熟度相当 |
| **Kubernetes** | **1.37.0（2026-08-26）**；维护 1.37 / 1.36 / 1.35 三条线 | **1.34 于 2026-10-27 EOL**；**1.34 起 `preStop` 的原生 `sleep` 动作 GA**（`lifecycle.preStop.sleep.seconds`），distroless 镜像不再需要 `sh` 与 `sleep` 二进制 |
| **SBOM 格式** | **SPDX**（Linux Foundation，**ISO/IEC 5962:2021**）/ **CycloneDX**（OWASP） | SPDX 偏许可与合规；**CycloneDX 在容器与安全场景更主流**，漏洞元数据更丰富 |
| **供应链签名** | **Sigstore**（cosign + Fulcio + Rekor），Apache-2.0 | keyless 免密钥；**SLSA L3 是务实目标**（L4 的可复现构建实际极罕见） |
| **合规时点** | 欧盟 CRA：**2026-09 起漏洞报告义务生效**，**2027-12 起 SBOM 强制提供** | 美国 EO 14028 早已把 SBOM 作为联邦采购条件——**这已从"加分项"变成"硬要求"** |
| 构建工具链（Jenkins / GitLab CI / GitHub Actions） | 均活跃维护；Actions 与 GitLab CI 走"配置即代码"路线，Jenkins 靠插件生态 | 选型的关键不是"哪个更现代"，而是**有没有必须接入的内部系统**（这是 Jenkins 仍然活着的主要原因） |

## 六、面试高频索引（60 题） {#interview}

按"被问到的概率 × 答不好会暴露功底"排序，前 12 条：

| # | 问题 | 一句话答案 | 展开 |
|---|---|---|---|
| 1 | 为什么配了探针、也做了优雅停机，发布还是掉请求？ | 因为**摘流路径是最终一致且不受控的**——kubelet 的终止路径与 EndpointSlice 的路由同步并行，存在"路由表还指向已终止 Pod"的窗口 | [发布策略篇 Q2](/cloud-native/cicd/release-strategies#interview) |
| 2 | `preStop` 为什么用 sleep？睡多久？ | 它的唯一目的是**等路由表同步完成**（`preStop` 执行完才发 `SIGTERM`，期间进程仍在服务）。时长 5~15 秒，**贪大只会加长发布总时长** | [发布策略篇 Q3](/cloud-native/cicd/release-strategies#interview) |
| 3 | 蓝绿和金丝雀的区别？ | **蓝绿解决"回滚速度"**（两套环境 + 整体切换，秒级回退、双倍资源）；**金丝雀解决"变更风险"**（同环境按比例引流，需要指标观察） | [发布策略篇 Q1](/cloud-native/cicd/release-strategies#interview) |
| 4 | 数据库怎么回滚？ | **基本不能"回滚"，只能设计成不需要回滚**——走**扩展-收缩**五步，每一步都是一次独立可回滚的发布 | [回滚篇 Q2](/cloud-native/cicd/rollback-and-migration#interview) |
| 5 | 为什么生产不能用 `latest`？ | 它是**浮动**标签：内容会变，于是"回滚到上一版"和"当前跑的是哪一版"都无法确定 | [流水线篇 Q2](/cloud-native/cicd/pipeline-design#interview) |
| 6 | 用了 Argo CD 就有金丝雀了吗？ | **没有**。Argo CD 是**对齐引擎**，同步的是普通 Deployment，滚动还是滚动；要金丝雀必须再引入**放量引擎** | [GitOps 篇 Q6](/cloud-native/cicd/progressive-delivery#interview) |
| 7 | GitOps 的"回滚"为什么是 `git revert`？ | 因为控制器会持续把集群拉回 Git 描述的状态。**不 revert Git，任何集群内的回滚都只是临时的** | [GitOps 篇 Q2](/cloud-native/cicd/progressive-delivery#interview) |
| 8 | 回滚窗口是什么？ | 发布后过了某个点回滚不再首选——**典型分界是"数据是否已按新结构写入"**。所以观察期内不做数据迁移 | [回滚篇 Q4](/cloud-native/cicd/rollback-and-migration#interview) |
| 9 | 回填脚本要做到什么？ | **幂等、可断点续跑、限速、可观测、可回退、不对抗在线流量**。验收标准：**中途 kill 掉再重跑，数据仍然正确** | [回滚篇 Q5](/cloud-native/cicd/rollback-and-migration#interview) |
| 10 | 金丝雀在低峰期为什么会误判？ | **样本量不足**——1% 流量在低峰只有几个请求，分母太小，一次偶发失败就让比率飙到 20%。策略里必须有**最小样本量**条件 | [GitOps 篇 Q9](/cloud-native/cicd/progressive-delivery#interview) |
| 11 | 为什么要写 SBOM？ | 为了回答"刚公布的 CVE 我们受不受影响"，尤其对埋在多层传递依赖里的组件。**必须在构建时生成**（事后扫描会漏传递依赖） | [流水线篇 Q8](/cloud-native/cicd/pipeline-design#interview) |
| 12 | 发布清单里最容易漏哪一项？ | **观察窗口**。多数流程在"部署完成 + 冒烟通过"就结束，而真问题常在 10~30 分钟后才显形（连接池渐进增长、消息渐进积压） | [回滚篇 Q11](/cloud-native/cicd/rollback-and-migration#interview) |

> 五篇内容页共 **60 题**，上面只列了最该先背的 12 条；各篇末尾都有自己的完整题单——**Git 协作篇的 12 题里，第 1~5 题值得优先看**（它们问的不是概念，而是会不会在真实操作中丢掉代码）。

## 七、边界与阅读建议 {#todo}

**本板块不覆盖**：

- **K8s 对象语义与探针机制**（liveness/readiness 的判定细节、QoS、HPA 公式）→ 见 [Kubernetes](/cloud-native/kubernetes/)；
- **镜像分层与写时复制的原理**→ 见 [Docker](/cloud-native/docker/)；
- **指标怎么算、告警怎么设计**→ 见[监控与可观测](/cloud-native/observability/)；
- **服务网格的部署与 mTLS 配置**→ 见[服务网格](/cloud-native/service-mesh/)；
- **具体系统的发布方案**（某项目的发布检查清单）→ 见[项目实战 · 发布与运维](/projects/property-saas/release-and-ops/#release)。

**阅读顺序按处境**：

| 你的处境 | 建议顺序 |
|---|---|
| 第一次系统接触 | 导览 → Git 协作 → 流水线设计 → 发布策略 → GitOps 与渐进式交付 → 回滚与数据库变更 |
| 正在被"发布掉请求"困扰 | [发布策略篇 §6 `preStop` 的双路径竞态](/cloud-native/cicd/release-strategies#prestop-race) → [§5 滚动更新的三件事](/cloud-native/cicd/release-strategies#rolling-safe) |
| 要上 GitOps / 渐进式交付 | [GitOps 篇 §3 稳态与门槛](/cloud-native/cicd/progressive-delivery#gitops-cost) → [§5 Argo Rollouts 与 Flagger](/cloud-native/cicd/progressive-delivery#rollouts-flagger) |
| 正在做一次带 DDL 的发布 | [回滚篇 §3 扩展-收缩](/cloud-native/cicd/rollback-and-migration#expand-contract) → [§7 发布检查清单](/cloud-native/cicd/rollback-and-migration#checklist) |
| 面试准备 | 上面 12 条索引 → 各篇末尾题单（尤其 Git 协作篇的撤销题与发布策略篇的探针/超时题） |

> 下一篇：[监控与可观测](/cloud-native/observability/) —— 发布做完只是开始，能"看见"系统才是长期稳定的前提。
