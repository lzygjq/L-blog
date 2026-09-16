---
date: 2026-09-16
title: CRD 与 Operator
sidebar: CRD 与 Operator
desc: K8s 的三层扩展点、CRD 只是类型定义而行为来自控制器、调谐循环的三条设计铁律、Finalizer 与孤儿资源、Operator 五个能力级别，以及 Operator 与 Helm 的分工判据
---

# CRD 与 Operator

## 一、问题场景：声明式管得住无状态，管不住"运维" {#why-operator}

前几篇讲的是"怎么把应用装上去、怎么让服务互相通信"。但只要涉及**有状态中间件**，还有第三类问题没人回答：

| 场景 | 用 Helm 能做什么 | 做不了什么 |
|---|---|---|
| 一个 MySQL 主从集群 | 把 3 个 Pod、Service、PVC **装一次** | 主库挂了**自动切换**、从库落后**自动重建**、每天**定时备份并校验** |
| 一个 Kafka 集群 | 把 broker 装上 | 加一个 broker 时的**分区再均衡**、磁盘满了**扩卷** |
| 一套大数据组件 | 把组件部署出来 | 组件的**版本升级、参数调优、健康巡检** |

区别在于：**Helm 是"单向、一次性"的动作，而运维是"持续、闭环"的过程**。换句话说——安装完之后，那套运维规程还写在人的脑子里或者某个 Wiki 上。

K8s 自己是怎么做的？它对无状态应用天生就懂："声明 3 副本，控制器持续纠偏"。**既然如此，能不能把"中间件的运维知识"也写成这样一个控制器？** 这就是 Operator。

> **一句话定义**：Operator = **CRD（自定义 API 类型）+ 控制器（调谐循环）+ 封装在其中的领域运维知识**。它把"人工运维规程"变成"集群里持续运行的控制逻辑"。

## 二、K8s 的三层扩展点 {#extension-points}

| 层次 | 手段 | 能做什么 | 不能做什么 |
|---|---|---|---|
| ① 配置扩展 | ConfigMap / Secret / 环境变量 | 改参数 | 改行为 |
| ② **API 扩展** | **CRD**（CustomResourceDefinition） | **给 API Server 加一个新类型** | 加了类型**不会带来任何行为** |
| ③ **控制逻辑扩展** | **控制器 / Operator** | 观察、决策、执行、再观察 | — |
| ④（旁路）调度扩展 | 调度器插件 / 设备插件 | 影响 Pod 落在哪 | 一般业务用不到 |

**第 ② 层与第 ③ 层的分离是理解 Operator 的关键**，也是最常见的面试陷阱：

> **写了 CRD，`kubectl apply` 一个自定义资源会成功，但什么都不会发生。** 因为 apiserver 只是把它存进 etcd 并做 schema 校验——**它没有"想干这件事"的意图**。行为来自控制器。

## 三、CRD：给 apiserver 加一个新类型 {#crd}

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: mysqlclusters.database.example.com     # 必须等于 plural.group
spec:
  group: database.example.com
  scope: Namespaced                            # Namespaced 还是 Cluster 级
  names:
    kind: MySQLCluster
    plural: mysqlclusters
    singular: mysqlcluster
    shortNames: [mysqlc]                       # kubectl get mysqlc 也能用
  versions:
    - name: v1
      served: true                             # 是否对外提供该版本
      storage: true                            # 唯一一个版本可标 true（存 etcd 的格式）
      schema:
        openAPIV3Schema:                       # v1 起强制要求结构化 schema
          type: object
          properties:
            spec:
              type: object
              required: [replicas, version]
              properties:
                replicas:  { type: integer, minimum: 1, maximum: 9 }
                version:   { type: string }
                backupSchedule: { type: string }
            status:
              type: object
              properties:
                phase: { type: string }
      subresources:
        status: {}                             # 开启 status 子资源
      additionalPrinterColumns:                # kubectl get 时显示的列
        - { name: Replicas, type: integer, jsonPath: .spec.replicas }
        - { name: Phase,    type: string,  jsonPath: .status.phase }
```

四个必须知道的细节：

| 细节 | 为什么 |
|---|---|
| **`openAPIV3Schema` 强制** | apiserver 要在**没有控制器参与**的情况下校验与剪枝（剔除未知字段），否则用户写错字段名会静默丢失 |
| **`subresources: status`** | 让 **spec 与 status 分离**：用户/控制器写 spec（期望），控制器写 status（实际）。不开启时 status 也走主资源，会产生无意义的更新冲突 |
| **`storage: true` 只有一个版本** | 多版本时，只有一个作为 etcd 中的存储格式，其余是转换后的视图（支持 `conversion` webhook 做版本转换） |
| **`names.plural.group` 必须与 metadata.name 一致** | 不一致时 CRD 会被 apiserver 拒绝 |

**一个易错点**：CRD 里的 `schema` 是**对用户输入的限制**。如果 `spec` 下没有声明某个字段，用户即使写了也会被**静默剪枝掉**——这会造成"我明明设了参数却不生效"的诡异现象，排查时先 `kubectl get crd xxx -o yaml` 看 schema。

## 四、控制器：调谐循环 {#reconcile}

```
        ┌───────────────────────────────────────────────┐
        │                                               │
        ▼                                               │
  ① watch 自定义资源（或它管理的子资源）                  │
        │                                               │
        ▼                                               │
  ② 读取 spec（期望状态）                                 │
        │                                               │
        ▼                                               │
  ③ 查询集群实际状态（Pod / PVC / Service ...）           │
        │                                               │
        ▼                                               │
  ④ 计算差异并执行：创建 / 更新 / 删除 子资源              │
        │                                               │
        ▼                                               │
  ⑤ 把实际进度写进 status ──────────────────────────────┘
                                    变更事件触发下一轮
```

### 4.1 三条设计铁律 {#three-rules}

| 铁律 | 原因 | 违反后的症状 |
|---|---|---|
| **调谐必须幂等** | 同一事件可能被投递**多次**（重试、resync、多个 watch 事件） | 每轮都创建一个新 Pod，数量指数增长 |
| **不要相信"上一次的记忆"** | 决策必须基于**当前观测到的实际状态**，不能基于"我以为上轮做过什么" | 集群被外部改动后，控制器状态与现实永久脱节 |
| **用 status 暴露进度，不要阻塞等待** | K8s 的哲学是**异步、最终一致**；阻塞会占满 worker | 控制器卡死，其他资源得不到处理 |

> **第 2 条常被误解为"不要用缓存"**：准确说法是——**可以读 informer 缓存加速，但决策结论要来自"实际状态与期望状态的对比"这个纯粹函数**。控制器应该写成 `reconcile(desired, actual) → actions`，而不是 `if 我上次做过了 then 跳过`。

### 4.2 Finalizer：删除时先做清理 {#finalizer}

```
用户 kubectl delete mysqlcluster/my-db
        │
        ▼
① apiserver 看到 .metadata.finalizers 非空 → 不真正删除，只打 deletionTimestamp
        │
        ▼
② 控制器被唤醒：执行清理（最后一次备份、摘流量、删外部资源、删 PVC）
        │
        ▼
③ 移除自己加的那个 finalizer
        │
        ▼
④ finalizers 为空 → 资源真正被删除
```

**不加 Finalizer 的后果是"孤儿资源"**：CR 删掉了，但它创建的外部资源（云上的负载均衡、对象存储里的备份、集群外的 DNS 记录）还在，且**再也没人知道它们属于谁**。

> 反面教训：Finalizer 里的清理逻辑**必须有超时与幂等保护**。如果清理中途永久失败且不移除 finalizer，这个资源会**永远卡在 Terminating 状态**，`kubectl delete` 也删不掉——事后的解锁手段是手工 `kubectl patch` 去掉 finalizers 字段。

## 五、Operator 的能力级别 {#capability-levels}

| 级别 | 能力 | 判断标准 |
|---|---|---|
| **L1** 基础安装 | 一键部署 | 能用声明式清单把组件装起来 |
| **L2** 无缝升级 | 版本升级自动化 | 能滚动升级、能在升级中保持可用 |
| **L3** 全生命周期 | 备份 / 恢复 / 故障转移 / 扩缩容 | 主库挂掉能自动切换，能按需扩缩 |
| **L4** 深度洞察 | 指标、告警、**自动伸缩** | 暴露业务指标，能按负载调规格 |
| **L5** 自动巡航 | 自动调优、异常自愈 | 能根据运行状况自行调整参数 |

> 别被"Operator"这个词吓到——**L1/L2 的 Operator 与一个封装良好的 Helm Chart 差别不大**。级别越高，投入越大；多数团队真正需要的是 L2~L3。

### 5.1 技术选型 {#tech-stack}

| 方案 | 语言 | 适合 |
|---|---|---|
| **Kubebuilder / controller-runtime** | Go | 社区主流，生态最全（云厂商与中间件官方 Operator 多用它） |
| **Java Operator SDK**（或 Quarkus Operator SDK） | Java | Java 团队复用既有技能栈，不用为了写 Operator 引入 Go |
| **Operator Framework（OLM）** | — | 面向**分发**：把 Operator 打包、版本化、在集群里订阅式安装 |
| **Helm + CronJob + 脚本** | 任意 | ⚠️ 不是 Operator，但**若运维规程简单，这套组合往往更划算**（见 §六） |

## 六、该不该写 Operator：一张判据表 {#when-not}

**先问一个前置问题：你的运维逻辑是否"必须持续观察并主动决策"？**

| 不该写的四种情形 | 为什么 |
|---|---|
| 只是"装一次" | Helm 就够了，Operator 是杀鸡用牛刀 |
| 逻辑能用 CronJob + kubectl 表达 | 定时备份、定时清理这类**周期性动作**不需要控制器（除非要处理失败重试与状态） |
| 决策需要人的判断（如"看业务量决定是否扩容"） | 半自动 + 告警 + 人工确认更合适，自动化错判的代价更高 |
| 团队没有 K8s 开发能力 | 维护一个写坏的 Operator，比人工运维更危险——**它会持续地把集群推向错误状态** |

| 该写的判据 | 说明 |
|---|---|
| **有状态的、需要反复执行的** | 数据库、消息队列、大数据组件 |
| **有成套运维规程** | 备份/恢复/升级/扩缩容/故障转移，且规程稳定、可形式化 |
| **运维频率高到人工成本显著** | 每天手工操作 vs 一次投入把规程固化 |
| **需要对外交付** | 给客户/其他团队提供"一键装上就能自愈"的中间件能力 |

## 七、Operator 与 Helm 的分工 {#vs-helm}

| 维度 | **Helm** | **Operator** |
|---|---|---|
| 职责 | **安装**（一次性、单向） | **运行**（持续、闭环） |
| 有无状态 | 无状态（release 记录在 Secret 里） | **有状态**（status 反映现实） |
| 能做的事 | 渲染 YAML 并 apply | 观察 → 决策 → 执行 → 再观察 |
| 升级语义 | 重新渲染并 apply | 按业务语义滚动升级（含数据兼容、主从切换） |
| 失败处理 | 停在半截或 `--atomic` 回滚 | **持续重试直到收敛** |
| 典型对象 | 无状态应用、一次性组件 | 有状态中间件、需要自愈的系统 |

**两者不是替代关系，而是配合关系**，这句可以直接作为面试答案：

> **用 Helm 安装 Operator 自身**（Operator 的 Deployment、RBAC、CRD 用 Chart 分发），**用 Operator 管理它负责的应用**。实践中大量 Operator 就是通过 Helm Chart 交付安装的。

## 八、对比辨析 {#compare}

| 对比 | 差别 | 何时选后者 |
|---|---|---|
| **CRD / CR** | **类型定义**（集群级，一份） vs **类型的实例**（命名空间级，可多份） | 想创建对象用 CR |
| **CRD / 控制器** | 只加类型，无行为 vs 赋予行为 | 任何"要真的发生点事"的场景都必须有控制器 |
| **Operator / Helm** | 持续闭环 vs 一次性安装 | 需要自愈与日常运维时用 Operator |
| **Operator / CronJob** | 事件驱动、最终一致 vs 定时触发、无状态 | 周期性任务用后者，需状态与重试用前者 |
| **Finalizer / 直接删除** | 先清理再删 vs 立即删 | 有外部资源或数据要清理时必须用 Finalizer |
| **`spec` / `status`** | 期望（用户/控制器写） vs 实际（控制器写） | 永远不要在控制器里改 spec 来表达"实际状态" |

## 九、使用场景与面试问答 {#interview}

**Q1：CRD 和 CR 的区别？**
**CRD 是"类型的定义"**（`CustomResourceDefinition`，集群级，声明 kind、schema、版本），**CR 是这个类型的实例**（用户创建的 `kind: MySQLCluster` 对象，通常命名空间级）。类比：CRD 是类，CR 是对象；CRD 是表结构，CR 是行。

**Q2：创建了 CRD，为什么 apply 一个自定义资源什么都不会发生？**
因为 CRD **只是给 apiserver 加了一个新类型**——它会存进 etcd、按 schema 校验，但**没有任何"意图"**。行为来自**控制器**：控制器 watch 这类资源，把 `spec`（期望）与集群实际状态对比，再执行动作并写 `status`。**类型与行为分离**，这是 Operator 架构的核心。

**Q3：Operator 是什么？和 Helm 有什么区别？**
Operator = **CRD + 控制器 + 领域运维知识**，把人工运维规程固化成集群里持续运行的调谐循环。与 Helm 的区别在**职责与状态**：Helm 管**一次性安装**（无状态、单向），Operator 管**持续运行**（有状态、观察-决策-执行闭环，失败持续重试直到收敛）。两者是配合关系——**用 Helm 安装 Operator 自身，用 Operator 管理它负责的应用**。

**Q4：为什么控制器的调谐逻辑必须幂等？**
因为**同一个事件可能被投递多次**（网络重试、informer resync、多个 watch 事件触发同一对象）。若调谐不是幂等的，重试就会重复创建资源——典型症状是 Pod 数量指数级增长。写法上应把它当成**纯函数**：`reconcile(期望状态, 实际状态) → 动作序列`，而不是依赖"我上轮做过什么"的记忆。

**Q5：控制器为什么不直接阻塞等待资源就绪？**
因为 K8s 的整体哲学是**异步、最终一致**——阻塞等待会占满控制器的并发 worker，导致其他资源得不到处理。正确做法是：**执行创建动作后立即返回，把进度写进 `status`**，等子资源变化再触发下一轮调谐。

**Q6：Finalizer 是干什么的？**
保证**"先清理、再删除"**。加了自己的 finalizer 后，`kubectl delete` 只会给资源打上 `deletionTimestamp`，控制器执行完清理（备份、摘流量、删外部资源）并移除 finalizer，资源才真正消失。不加的话会留下**孤儿资源**——比如云上还在计费的负载均衡、对象存储里的备份。注意清理逻辑必须有超时与幂等保护，否则资源会**永久卡在 Terminating**。

**Q7：什么时候该写 Operator，什么时候不该？**
**该写**：有状态的、需要反复运维的（数据库、MQ、大数据组件），有成套且可形式化的运维规程，或需要把中间件能力对外交付。**不该写**：只是装一次（Helm 够）、能用 CronJob 表达、决策需要人的判断、团队没有 K8s 开发能力——**一个写坏的 Operator 比人工运维更危险，因为它会持续把集群推向错误状态**。

**Q8：怎么给 K8s 加一个自定义资源？完整链路是什么？**
① 定义 **CRD**（kind、group、scope、OpenAPI schema、`status` 子资源、可选 printer columns）；② 实现**控制器**：watch 该类型 → 对比期望与实际 → 创建/更新子资源 → 写 status；③ 注册 **RBAC**（控制器要能读写它管理的所有资源）；④ 用 **Helm 或 OLM** 把 CRD + 控制器 Deployment + RBAC + ServiceAccount 一起分发；⑤ 用户 `kubectl apply` 一个 CR 即可获得自愈能力。

> **下一篇**：[CI/CD 流水线](/cloud-native/cicd/) —— 从清单（Helm）到通信（网格）到运维（Operator）都齐了，剩下最后一环：让"代码 → 镜像 → 集群"的每一步自动且可追溯。
