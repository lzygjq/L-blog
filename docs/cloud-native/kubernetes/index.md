---
date: 2026-09-15
title: Kubernetes 编排
sidebar: Kubernetes
desc: 声明式 API 与控制器循环、核心对象选型（Pod/Deployment/StatefulSet/Service/Ingress）、调度与资源模型、探针与 HPA、滚动更新与多租户隔离
---

# Kubernetes 编排

## 一、问题场景：从"跑起来"到"一直跑着" {#why-k8s}

容器解决了"环境一致"，但没有解决集群问题。把应用丢到一台机器上跑容器之后，紧接着是四件躲不开的事：

| 问题 | 手工时代的做法 | 后果 |
|---|---|---|
| 机器挂了 | 人肉发现、人肉重启 | 半夜被告警叫醒 |
| 流量涨了 | 手动加机器、手动扩进程 | 扩容速度永远慢于流量 |
| 要发版 | 停服、换包、重启 | 有损发布，回滚靠手速 |
| 几百个应用 | 一张 Excel 记端口与部署位置 | 人走了就没人知道全貌 |

Kubernetes 的答案不是"更好的脚本"，而是**换一种交互方式**：你不再告诉系统"去启动一个容器"，而是声明"我要 3 个健康副本一直存在"，然后由一个循环不断把现实拉回这个目标。

## 二、核心机制：声明式与控制器循环 {#declarative}

```
        你：kubectl apply -f deploy.yaml
                    │
                    ▼
        ┌───────────────────────┐
        │  etcd：期望状态（3 副本）│
        └───────────┬───────────┘
                    │  watch
                    ▼
        ┌───────────────────────┐
        │  控制器：对比实际状态     │
        │  实际只有 2 个 → 创建 1 个 │
        └───────────────────────┘
                    ▲
                    │ 上报
        ┌───────────────────────┐
        │ 实际状态（当前 2 个 Pod） │
        └───────────────────────┘
```

三个推论，全都是面试高频：

1. **`apply` 是幂等的**——重复执行不会"多建几个"，因为写的是期望状态而非命令。
2. **人删掉一个 Pod，它会被重建**——不是"自愈魔法"，是控制器每轮循环都在纠偏。想真正停掉应用，得删上层对象（Deployment）或把副本数改 0。
3. **任何"没生效"先查控制器事件**——`kubectl describe` / `kubectl get events`，因为状态机是显式的。

## 三、核心对象 {#objects}

### 3.1 对象地图 {#object-map}

```
Ingress / Gateway ──┐
                    │ HTTP 路由（七层）
                    ▼
              Service ──────┐  ClusterIP / NodePort / LoadBalancer
                            │ 四层转发
                            ▼
Deployment ──▶ ReplicaSet ──▶ Pod ──▶ [容器 …]
StatefulSet ─────────────────▶ Pod（固定名字 + 独立存储）
DaemonSet ───────────────────▶ Pod（每节点一个）
Job / CronJob ───────────────▶ Pod（跑完即止）
```

| 对象 | 回答什么问题 |
|---|---|
| **Pod** | 最小调度单元，一组共享网络/存储的容器 |
| **Deployment** | 无状态应用的副本数与发布 |
| **StatefulSet** | 有状态应用：固定身份、独立存储、有序启停 |
| **DaemonSet** | 每个节点都要跑一份（日志采集、CNI、监控 agent） |
| **Service** | 一组 Pod 的稳定访问入口（Pod IP 会变，Service IP 不变） |
| **Ingress / Gateway** | 七层路由：域名、路径、TLS |
| **ConfigMap / Secret** | 配置与凭据注入 |
| **HPA / PDB** | 弹性伸缩与自愿中断保护 |

### 3.2 Pod 为什么是最小单元，而不是容器 {#pod}

因为有一类东西**必须与主容器共享同一个网络栈和文件系统**：边车代理、日志收集、配置热加载。Pod 内的容器共享 network namespace（因此可以互相用 `localhost`）、IPC 与挂载的卷，只隔离文件系统与进程。

**原生 sidecar（v1.28 alpha → v1.33 GA）**：把边车写成 `initContainers` 且 `restartPolicy: Always`，它会在主容器之前启动、主容器结束后率先退出。这个顺序在 **Job 场景**下是关键——普通容器形式的边车会让 Job 永远无法结束（因为边车还活着，Pod 不算完成）。

### 3.3 工作负载怎么选 {#workloads}

| 对象 | 适用 | 不适用 |
|---|---|---|
| **Deployment** | 无状态、副本可互换的 Web/API 服务 | 需要稳定网络标识或独立存储时 |
| **StatefulSet** | 数据库、消息队列、需要固定身份的集群成员 | 无状态服务（白白增加复杂度） |
| **DaemonSet** | 每个节点都要驻留的 agent | 只想跑固定份数的应用 |
| **Job / CronJob** | 批处理、数据迁移、定时任务 | 常驻服务 |

StatefulSet 提供三样 Deployment 给不了的东西：

1. **稳定网络标识**：Pod 名为 `db-0`、`db-1`，配合 **Headless Service**（`clusterIP: None`）拿到可解析的独立域名。
2. **稳定存储**：`volumeClaimTemplates` 让每个副本绑定自己的 PVC，Pod 重建后仍挂回同一块盘。
3. **有序启停**：默认按序号从小到大创建/更新，从大到小删除；就绪一个才继续下一个。

### 3.4 Service 与 Ingress {#service-ingress}

| 类型 | 暴露范围 | 适用 |
|---|---|---|
| `ClusterIP` | 集群内 | 绝大多数服务间调用（默认） |
| `NodePort` | 每个节点开一个端口 | 测试环境、四层代理的上游 |
| `LoadBalancer` | 云厂商 LB | 生产对外入口（依赖云控制器） |
| `ExternalName` | 无代理，只做 CNAME | 引用集群外服务 |

三个容易被追问的点：

- **Service 的负载均衡是四层的、连接级的**。`kube-proxy` 靠 iptables/IPVS 规则转发，一条 TCP 连接选定一个 Pod 后不再变——所以"长连接导致负载不均"是这个机制的正常结果，要按请求级均衡得靠七层（Ingress / 服务网格）。
- **kube-proxy 的实现演进**：iptables（规则数随 Service 数线性增长）→ IPVS（哈希表，大规模更优）→ **nftables（v1.33 GA）**。选型问题答"规模大时 IPVS/nftables 更有优势"即可。
- **Ingress 的功能已经冻结**，继任者是 **Gateway API**（已 GA，用角色化的 `GatewayClass` / `Gateway` / `HTTPRoute` 拆分基础设施与应用团队的职责）。新项目选 Gateway API，存量环境用 Ingress 也没问题。

## 四、调度与资源 {#scheduling}

### 4.1 requests / limits 与 QoS {#qos}

| 字段 | 作用 | 由谁消费 |
|---|---|---|
| `requests` | **调度依据**与"保证量" | 调度器挑节点、cgroup 设权重 |
| `limits` | 运行上限 | cgroup 设硬上限 |

CPU 与内存的"超限后果"完全不同，这是必背点：

| 资源 | 超 `limits` 的后果 | 原因 |
|---|---|---|
| **CPU** | 被限流（throttle），变慢但不死 | CPU 是**可压缩资源**，时间片可以少给 |
| **内存** | **OOM Kill**，容器被杀重启 | 内存是**不可压缩资源**，给出去就收不回 |

由此产生三级 QoS，**它决定节点资源紧张时谁先被驱逐**：

| QoS | 条件 | 驱逐顺序 |
|---|---|---|
| `Guaranteed` | 所有容器的 CPU/内存都设了 `requests == limits` | 最后（最稳） |
| `Burstable` | 至少一个容器设了 requests，但不满足上一条 | 中间 |
| `BestEffort` | 全都没设 requests/limits | **最先被驱逐** |

> 生产实践：**核心服务设 Guaranteed 或接近的 Burstable**（requests 略低于 limits 以留弹性）；`BestEffort` 只适合可随时牺牲的任务。另注意 JVM 的 `-XX:MaxRAMPercentage` 必须与 `limits` 对齐，否则"堆没超、容器超了"一样被 OOM Kill。

### 4.2 调度控制手段 {#scheduling-control}

| 手段 | 表达的意思 | 典型用途 |
|---|---|---|
| `nodeSelector` | 最简单的标签匹配 | 指定 GPU 节点 |
| `nodeAffinity` | 带表达式的节点选择（硬/软） | "优先 SSD 机型，不行也要能调" |
| `podAffinity` / `podAntiAffinity` | 与其他 Pod 靠近或远离 | **同一 Deployment 的副本必须打散到不同节点** |
| `taints` / `tolerations` | 节点拒绝、Pod 声明容忍 | 专用节点（只给某类服务用） |
| `topologySpreadConstraints` | 按拓扑域均匀分布 | 跨可用区均衡，比反亲和更精细 |

> **一句话区分**：亲和是"**我想去哪**"，污点是"**你别来**"（要来得先报名容忍）。生产上常用的组合是"核心服务跨可用区打散 + 节点池用污点独占"。

### 4.3 三种探针各管什么 {#probes}

| 探针 | 失败后 | 该探什么 |
|---|---|---|
| `livenessProbe` | **重启容器** | 进程是否真的卡死（死锁、无限等待） |
| `readinessProbe` | **从 Service 摘除**，不重启 | 能否接流量（依赖是否就绪、连接池是否预热完） |
| `startupProbe` | 在成功前抑制上面两个 | 启动慢的应用，避免被 liveness 误杀 |

最常见的误用：**把依赖健康写进 liveness**。数据库抖动时，所有实例的 liveness 同时失败 → 全部重启 → 重启后依赖仍未恢复 → **雪崩**。依赖检查应该放在 readiness（摘流量、等恢复即可）。

> 这两个端点对应 Spring Boot 的 `/actuator/health/liveness` 与 `/actuator/health/readiness`，开启方式与"为什么 liveness 不要查数据库"见[指标与 Prometheus → Spring Boot 接入](/cloud-native/observability/metrics-prometheus#micrometer)。

## 五、弹性与发布 {#scaling-release}

### 5.1 HPA：副本数是怎么算出来的 {#hpa}

```
期望副本数 = ceil[ 当前副本数 × (当前指标值 / 目标指标值) ]
```

并且带 **10% 的容差**：比值在 `0.9 ~ 1.1` 之间就不动，避免在阈值附近来回抖动。几个关键行为：

| 行为 | 默认 | 为什么 |
|---|---|---|
| 扩容 | 立即（受窗口聚合影响） | 要快，抗突发 |
| **缩容** | **有稳定窗口（默认 5 分钟）** | 要慢，避免指标一抖就把副本砍掉，随后又得扩回来 |
| 指标来源 | 资源指标走 Metrics Server；QPS、队列长度等走自定义指标（Prometheus Adapter） | 只用 CPU 往往不够贴近业务 |

> **必须和 requests 一起考虑**：HPA 按"**占 requests 的百分比**"算利用率，requests 设得过小会让利用率虚高、疯狂扩容。这也是 HPA 与 VPA 不能同时对同一指标生效的原因。

### 5.2 滚动更新：不中断发布靠三件事 {#rolling-update}

| 参数 | 含义 | 调优方向 |
|---|---|---|
| `maxSurge` | 允许超出期望副本数的上限（多起几个） | 调大换更快，但更吃资源 |
| `maxUnavailable` | 允许不可用的副本数上限 | 调 0 可做到"零不可用"，前提是资源够 |
| `minReadySeconds` | Pod 就绪后还要观察多久才算可用 | 防止"刚就绪就崩"的实例被算作成功 |
| **PDB**（`minAvailable` / `maxUnavailable`） | 约束**自愿中断**（节点排空、升级）时的可用下限 | 集群维护时防止一次驱逐太多 |

一次平滑的发布，其实是三段的配合：**readiness 决定"什么时候开始接流量"**（就绪前不进 Endpoints）→ **`preStop` + 优雅停机决定"怎么退出"**（先从 Endpoints 摘除，再等应用处理完在途请求）→ **`terminationGracePeriodSeconds` 决定"等多久"**（超时才 SIGKILL）。

### 5.3 原地扩缩容（K8s v1.35 GA）{#in-place-resize}

以往改 Pod 的 CPU/内存 requests/limits 必须**重建 Pod**，对有状态负载（数据库热缓存、长任务）代价很大。**原地调整**允许不重启就改：

- 版本节点：**v1.27 alpha → v1.33 beta → v1.35 GA**（并放开了此前"只能升内存 limit"的限制，允许下调）。

这解决的是"垂直扩缩容必须重启"的老问题，与 HPA（加副本）互补：**横向靠 HPA，纵向靠原地调整**。

## 六、多租户与隔离 {#multi-tenant}

集群被多个团队/业务共用时，"隔离"要落到四个维度，缺一不可：

| 维度 | 手段 | 拦不住什么 |
|---|---|---|
| **计算** | `ResourceQuota`（命名空间总量）+ `LimitRange`（单 Pod 默认值与上下限） | 拦不住"占满配额让别人无法发布" |
| **网络** | `NetworkPolicy`（默认全通，**必须显式 deny 后再放行**） | 需要 CNI 支持，否则策略不生效 |
| **权限** | `RBAC` + `ServiceAccount` + `RoleBinding`（**最小权限**，禁挂 `cluster-admin`） | 拦不住容器内提权（要配合 Pod Security） |
| **存储** | `StorageClass` + 配额 | 拦不住"把数据写到共享目录" |

> **最重要的一句认知**：**Namespace 不是安全边界**。它提供命名与配额的逻辑隔离，但同一集群内的 Pod 默认可互相访问、共享同一个内核。要真正的强隔离只有两条路：**独立集群**（成本最高、最强）或**沙箱容器**（Kata / gVisor 这类带独立内核的运行时的方案，或者开启 user namespace 做 UID 映射）。

实践中常见的**三级混合**策略：

| 级别 | 做法 | 适合 |
|---|---|---|
| 共享命名空间 | 单集群 + Namespace + 配额，团队间靠规范约束 | 内部系统、信任度高 |
| 独立命名空间 + 网络隔离 | 各自 Namespace + NetworkPolicy + 独立存储类 | 多业务线共集群 |
| 独立集群 | 物理隔离，各自升级节奏 | 强合规、强隔离要求 |

数据档位（共享库 / Schema / 独立库）与横切传播是另一条轴，方法见[多租户](/methodology/multi-tenancy)；**数据库分开但应用还混在一个 Deployment 里，等于档位只买了一半。**

## 七、对比辨析 {#compare}

| 对比 | 差别 | 何时选后者 |
|---|---|---|
| **Deployment / StatefulSet** | 副本可互换 vs 有固定身份与独立存储 | 需要稳定域名或每副本独立数据 |
| **ClusterIP / NodePort / LoadBalancer** | 集群内 / 节点端口 / 云 LB | 看暴露范围与是否依赖云厂商 |
| **Ingress / Gateway API** | 单体资源、功能冻结 vs 角色化、可扩展 | 新项目，或需要多团队共用一个网关 |
| **liveness / readiness** | 重启 vs 摘流量 | 依赖问题用 readiness，只有真卡死才用 liveness |
| **HPA / VPA** | 加/减副本 vs 改单副本资源 | 突发流量靠 HPA，长期规格不合理靠 VPA 出建议 |
| **Service / Headless Service** | 有 ClusterIP、四层转发 vs 无 IP、直接返回 Pod 列表 | StatefulSet 或客户端自己做负载均衡 |

## 八、使用场景与面试问答 {#interview}

**Q1：Pod 里为什么可以放多个容器？**
为了让**必须共享网络和存储的进程**部署在一起（边车代理、日志采集、配置热加载）。它们共享 network namespace（可用 `localhost` 互访）与卷，但文件系统和进程相互隔离。注意：边车要用**原生 sidecar**（init container + `restartPolicy: Always`），否则 Job 永远无法完成。

**Q2：requests 和 limits 的区别？超了会怎样？**
`requests` 用于**调度与保证**，`limits` 是**运行上限**。CPU 超 limits 被限流（变慢不死），内存超 limits 被 **OOM Kill**——因为 CPU 可压缩、内存不可压缩。两者的配比决定 QoS 等级，也决定节点资源紧张时的**驱逐顺序**：BestEffort → Burstable → Guaranteed。

**Q3：描述一次 Deployment 的滚动更新。**
新建一个 ReplicaSet（新版本），按 `maxSurge` / `maxUnavailable` 逐步把新 RS 扩容、旧 RS 缩容，直到旧 RS 为 0（保留以便回滚）。判定"可用"要看**就绪探针 + `minReadySeconds`**；Pod 终止时先走 `preStop`（通常是从 Endpoints 摘除并等待在途请求结束），超过 `terminationGracePeriodSeconds` 才 SIGKILL。回滚就是 `kubectl rollout undo`（切回旧 RS）。

**Q4：Service 怎么做负载均衡？**
`kube-proxy` 在每个节点上写转发规则（iptables / IPVS / nftables），把发往 ClusterIP 的流量分发到后端 Pod。**这是四层的、连接级的**：一条连接选定 Pod 后不再变，所以长连接场景容易负载不均——要按请求均衡必须上七层。

**Q5：HPA 怎么算副本数？**
`ceil(当前副本 × 当前指标 / 目标指标)`，并带 10% 容差防止抖动；扩容快、**缩容有稳定窗口（默认 5 分钟）**。指标默认取 CPU/内存利用率（相对 `requests` 的百分比），业务指标要接自定义指标。注意 requests 设太小会让利用率虚高、扩容失控。

**Q6：多租户隔离怎么做？**
四个维度：计算（Quota + LimitRange）、网络（NetworkPolicy）、权限（RBAC 最小权限 + 独立 ServiceAccount）、存储（StorageClass）。**Namespace 只是逻辑隔离，不是安全边界**——真正的强隔离要靠独立集群，或用带独立内核的沙箱容器方案。

**Q7：一个 Pod 一直 Pending，怎么排查？**
按"调度链"逐段查：`kubectl describe pod` 看 `Events`（多数答案就在最后一行）。常见原因：资源不足（requests 超过任何节点可分配量）、节点选择器/亲和性无匹配、污点无容忍、PVC 未绑定（存储类不存在或容量不足）、超过 `ResourceQuota`、镜像拉取失败（`ImagePullBackOff` 与 Pending 是不同阶段）。

> 下一篇：[CI/CD 与发布](/cloud-native/cicd/) —— 把上面这些对象"跑起来"之后，怎么让每一次代码提交都能自动、可回滚地走到集群里。
