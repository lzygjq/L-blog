---
date: 2026-09-15
title: 云原生 · 板块导览
desc: 容器化 → 编排 → 交付 → 可观测的四段演进主线，加上 Helm、服务网格、Operator 三个横切能力，以及与其他板块的交叉点和面试高频清单
---

# 云原生 · 板块导览

云原生不是一堆工具的名字，而是**一条把"应用"从代码送到生产并让它稳定运行的流水线**。这个板块按这条流水线的四段来组织，每一段都在解决上一段遗留的问题。

## 一、四条主线 {#structure}

| # | 板块 | 解决的问题 | 关键概念 | 状态 |
|---|---|---|---|---|
| 1 | [**Docker 容器化**](/cloud-native/docker/) | 交付物**不一致** | namespace / cgroup、镜像分层与写时复制、多阶段构建、Compose | ✅ 已成篇 |
| 2 | [**Kubernetes 编排**](/cloud-native/kubernetes/) | 机器会挂、流量会涨、发布要停服 | 声明式 API 与控制器循环、对象选型、调度与 QoS、探针、HPA、多租户 | ✅ 已成篇 |
| 3 | [**CI/CD 与发布**](/cloud-native/cicd/) | 发布**不可重复、不可回滚** | 4 篇：流水线设计与制品治理 / 发布策略与不中断 / GitOps 与渐进式交付 / 回滚与数据库变更 | ✅ 已成篇 |
| 4 | [**监控与可观测**](/cloud-native/observability/) | 出问题**看不见、定位慢** | 5 篇：指标与 PromQL / 日志管道 / 链路与 OTel / SLO 与告警 / 成本与许可——三支柱靠 `service` + `traceId` 关联 | ✅ 已成篇 |

**四者的依赖关系**（顺序不能跳）：

```
① 容器化：先让"环境"成为交付物的一部分
        │  遗留问题：单机跑得再好，机器挂了怎么办？流量涨了怎么办？
        ▼
② 编排：把"副本数与健康"变成声明，由控制器持续纠偏
        │  遗留问题：每次发版还要人手工改清单、打镜像、盯着回滚
        ▼
③ 交付流水线：让"代码 → 镜像 → 集群"的每一步都自动且可追溯
        │  遗留问题：自动化发布让变更变快了，但出问题时看得见吗？
        ▼
④ 可观测：指标看趋势、日志看细节、链路看关系，三者用 traceId 串起来
```

> **一句话概括这条主线**：容器解决**一致性**，编排解决**可用性**，流水线解决**效率与可回滚**，可观测解决**可知性**。面试里被问"你怎么理解云原生"，按这四层答比背定义清楚得多。

### 1.1 三个横切能力 {#cross-cutting}

上面四段是**纵向的主干**（每一段都在解决上一段的遗留问题）。但真实集群里还有三类问题，它们不属于任何一段，而是**横切**的：

| 横切能力 | 它解决的那个"没人管"的问题 | 篇目 | 状态 |
|---|---|---|---|
| **Helm 与配置管理** | 清单**没被当成产物**：一个服务多个文件、环境差异靠复制、没有版本与回滚 | [Helm 与配置管理](/cloud-native/helm/) | ✅ 已成篇 |
| **服务网格** | 治理能力**长在应用里**：超时 / 重试 / 灰度 / mTLS 与编程语言绑定，升级要动业务 | [服务网格](/cloud-native/service-mesh/) | ✅ 已成篇 |
| **CRD 与 Operator** | 有状态中间件的**运维规程还在人脑里**：备份、扩缩容、故障切换靠人工 | [CRD 与 Operator](/cloud-native/operator/) | ✅ 已成篇 |

> **为什么叫"横切"而不是"第五、六、七段"**：Helm 把"清单"变成可版本化的产物，贯穿**编排 → 交付**；服务网格把通信治理与遥测下沉到基础设施层，贯穿**编排 → 可观测**；Operator 把运维规程固化成控制器，贯穿**编排 → 交付**。三者都是**每一段都要用到的能力**，不是流水线上顺序执行的一环。

## 二、阅读顺序与重点 {#reading-order}

| 你的关注点 | 建议路径 |
|---|---|
| **面试冲刺** | [Docker 的容器原理](/cloud-native/docker/#namespace-cgroup) → [K8s 的 requests/limits 与 QoS](/cloud-native/kubernetes/#qos) → [HPA 公式](/cloud-native/kubernetes/#hpa) → [三支柱](/cloud-native/observability/#three-pillars) |
| **要落地一套环境** | Dockerfile 多阶段构建 → [Compose 本地依赖环境](/cloud-native/docker/#compose) → K8s 对象选型与探针 → [滚动更新与 PDB](/cloud-native/kubernetes/#rolling-update) |
| **要讲项目经历** | [多租户隔离](/cloud-native/kubernetes/#multi-tenant) → [发布策略取舍](/cloud-native/cicd/release-strategies#strategies) → [数据库变更与扩展-收缩](/cloud-native/cicd/rollback-and-migration#expand-contract) |
| **评估"要不要上服务网格"** | [取舍判据](/cloud-native/service-mesh/#tradeoffs) → [与 Spring Cloud 的分工](/cloud-native/service-mesh/#vs-spring-cloud) → [mTLS 与零信任](/cloud-native/service-mesh/#mtls) |
| **在排查线上问题** | [黄金信号与告警设计](/cloud-native/observability/slo-and-alerting#signals) → [PromQL 速查](/cloud-native/observability/metrics-prometheus#promql) → [一次慢请求怎么定位](/cloud-native/observability/slo-and-alerting#incident) |

## 三、与其他板块的交叉点 {#cross-links}

| 交叉主题 | 云原生侧的关注点 | 另一侧的关注点 |
|---|---|---|
| **微服务架构** | 每个服务一个镜像、一套部署清单，集群内用 Service 通信 | [Spring Cloud](/java/spring/spring-cloud/)：注册中心、网关、服务保护 |
| **微服务治理** | 网格在**基础设施层**统一做超时 / 重试 / 灰度 / mTLS，业务零改动、语言无关 | [Spring Cloud](/java/spring/spring-cloud/)：**应用内**熔断、业务语义降级（代理表达不了） |
| **配置与密钥** | ConfigMap / Secret 注入、环境变量、变更不重建镜像 | [Spring Boot](/java/spring/spring-boot/)：配置优先级、外部化配置 |
| **JVM 与容器** | `requests`/`limits` 与堆的关系、OOM Kill 与 `ExitOnOutOfMemoryError` | [JVM 调优](/java/jvm/tuning)：堆大小、GC 选择、内存排查 |
| **数据与状态** | StatefulSet、PVC、存储类；有状态服务为何难上云 | [MySQL](/database/mysql/) 主从、[Redis](/database/redis/) 集群 |
| **消息与异步** | 有状态中间件的部署与持久化 | [消息队列](/middleware/) 的可靠性与堆积 |
| **数据链路** | 数仓组件（同步、调度）在集群上的编排 | [数据仓库](/bigdata/)：Canal 同步、Doris、冷热分层 |

## 四、面试高频清单 {#interview-questions}

| # | 问题 | 篇目 |
|---|---|---|
| 1 | 容器和虚拟机的区别？容器内的 root 和宿主机 root 是同一个吗？ | [Docker · 隔离的两半](/cloud-native/docker/#namespace-cgroup) |
| 2 | 镜像为什么分层？构建缓存什么时候失效？ | [Docker · 分层与缓存](/cloud-native/docker/#layer-cache) |
| 3 | 容器里 JVM 堆怎么设？为什么被 OOMKilled？ | [Docker · 容器内的 JVM](/cloud-native/docker/#jvm-in-container) |
| 4 | Pod 里为什么可以有多个容器？边车为什么要用原生 sidecar？ | [K8s · Pod](/cloud-native/kubernetes/#pod) |
| 5 | requests 和 limits 的区别？超了会怎样？驱逐顺序是什么？ | [K8s · QoS](/cloud-native/kubernetes/#qos) |
| 6 | liveness 和 readiness 的区别？为什么要分开？ | [K8s · 三种探针](/cloud-native/kubernetes/#probes) |
| 7 | Deployment 的滚动更新过程？怎么做到不中断？ | [K8s · 滚动更新](/cloud-native/kubernetes/#rolling-update) |
| 8 | HPA 是怎么算副本数的？为什么缩容比扩容慢？ | [K8s · HPA](/cloud-native/kubernetes/#hpa) |
| 9 | Service 怎么做负载均衡？为什么长连接会不均？ | [K8s · Service 与 Ingress](/cloud-native/kubernetes/#service-ingress) |
| 10 | 多租户隔离怎么做？Namespace 是安全边界吗？ | [K8s · 多租户](/cloud-native/kubernetes/#multi-tenant) |
| 11 | 为什么生产不能用 latest 标签？ | [流水线设计 · 标签策略](/cloud-native/cicd/pipeline-design#tag-strategy) |
| 12 | 蓝绿和金丝雀的区别？各自什么时候用？ | [发布策略 · 四种策略](/cloud-native/cicd/release-strategies#strategies) |
| 13 | 回滚怎么做？数据库变更怎么回滚？ | [回滚篇 · 扩展-收缩](/cloud-native/cicd/rollback-and-migration#expand-contract) |
| 14 | 指标、日志、链路三者怎么关联？ | [可观测 · 三支柱](/cloud-native/observability/#three-pillars) |
| 15 | Histogram 和 Summary 怎么选？ | [可观测 · 指标类型](/cloud-native/observability/metrics-prometheus#types) |
| 16 | 什么样的告警算好告警？SLO 与错误预算怎么用？ | [可观测 · 告警原则](/cloud-native/observability/slo-and-alerting#principles) |
| 17 | 为什么需要 Helm？`upgrade` 报成功但服务没起来是怎么回事？ | [Helm · `--wait` 与常见误判](/cloud-native/helm/#wait-atomic) |
| 18 | Helm 和 Kustomize 怎么选？Chart 的 `version` 和 `appVersion` 有何区别？ | [Helm · 取舍判据](/cloud-native/helm/#helm-vs-kustomize) |
| 19 | 服务网格解决了什么问题？应用没改代码，流量为什么经过代理？ | [服务网格 · 流量劫持](/cloud-native/service-mesh/#traffic-hijack) |
| 20 | 服务网格会替代 Spring Cloud 吗？什么情况下不该上网格？ | [服务网格 · 与 Spring Cloud 分工](/cloud-native/service-mesh/#vs-spring-cloud) |
| 21 | CRD 和 CR 的区别？为什么创建了 CRD 还需要控制器？ | [CRD 与 Operator · 三层扩展点](/cloud-native/operator/#extension-points) |
| 22 | Operator 和 Helm 是什么关系？什么时候该写 Operator？ | [CRD 与 Operator · 与 Helm 分工](/cloud-native/operator/#vs-helm) |

> **各篇末尾都有「面试问答」小节**，包含上面的问题与口径化答案，可直接当复习清单用。
