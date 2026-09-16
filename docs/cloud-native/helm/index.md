---
date: 2026-09-16
title: Helm 与配置管理
sidebar: Helm
desc: 从 kubectl apply 的三个缺口讲到 Chart 结构、values 覆盖优先级、release 与 revision 的回滚语义、三向合并，以及 Helm 与 Kustomize 的取舍判据
---

# Helm 与配置管理

## 一、问题场景：`kubectl apply` 差了什么 {#why-helm}

上一篇把 K8s 的对象讲清楚了，但真要把一个服务部署上去，你会发现 `kubectl apply -f` 有三个缺口：

| 缺口 | 具体表现 | 后果 |
|---|---|---|
| **一服务多文件** | 一个 API 服务通常要 apply Deployment + Service + Ingress + ConfigMap + HPA + PDB | 10 个服务 = 50 个 YAML，谁改了哪个靠人记 |
| **环境差异无解** | 测试/预发/生产的镜像标签、副本数、域名、资源规格都不同 | 复制三份 YAML → 三份会**各自漂移**，改一处忘了另两处 |
| **没有"一次发布"的概念** | apply 到一半失败，集群停在半截状态 | 没有版本、没有原子性、没有回滚——只能靠人回忆"上次改了哪几个文件" |

Helm 的答案不是"更好的 YAML 工具"，而是引入一个**新的抽象单位**：把"一组 K8s 资源"当成**一个可参数化、可版本化、可回滚的安装包**。

> **一句话定位**：Helm 是**集群侧的包管理器**——它的对标物不是 `kubectl`，而是 `apt` / `npm` / `maven`。理解这一点，"为什么要用 Helm"就不用再解释了。

## 二、五个核心概念 {#concepts}

| 概念 | 是什么 | 类比 |
|---|---|---|
| **Chart** | 一组模板 + 默认值 + 元数据 | 安装包（`.deb` / `.jar`） |
| **values** | 渲染模板时的参数 | 配置文件 |
| **Template** | Go template 语法 + Sprig 函数，渲染成原生 YAML | 编译前的源码 |
| **Release** | 一个 Chart 在集群里**的一次安装实例**（有名字） | 进程实例 |
| **Revision** | Release 的版本号，每次 upgrade / rollback 递增 | 提交记录 |

两个最容易被追问的推论：

1. **同一个 Chart 可以安装多次**，靠 Release 名区分——前提是模板里的资源名都带上了 Release 名（见 §三）。
2. **Helm 是客户端工具**。Helm 3 移除了 Helm 2 的集群内组件 **Tiller**：
   - Helm 2 的 Tiller 拥有**集群级权限**，任何能访问它的人都能提权，且与 K8s 的 RBAC 模型冲突；
   - Helm 3 改为**以当前 kubeconfig 身份直接操作**，权限遵循 RBAC，多租户场景下才安全；
   - Release 记录从 ConfigMap 改为存在**同命名空间的 Secret** 里（可加密）。
   > 面试问"Helm 3 和 2 的区别"，答这一条就够——**去掉 Tiller 是安全模型的修复，不只是架构简化**。

## 三、Chart 的结构 {#chart-structure}

```
mychart/
├── Chart.yaml          # 元数据：name / version / appVersion / dependencies
├── values.yaml         # 默认参数（可被覆盖）
├── templates/          # 模板目录
│   ├── _helpers.tpl    # 命名模板（define / include）——下划线开头不会被渲染成资源
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   └── NOTES.txt       # 安装完成后打印的提示
├── charts/             # 依赖的子 Chart
├── Chart.lock          # 依赖版本锁（必须提交，见 §七）
└── .helmignore
```

### 3.1 四个内置对象 {#builtin-objects}

| 对象 | 提供什么 | 典型用法 |
|---|---|---|
| `.Values` | values.yaml + 命令行覆盖后的值 | 镜像标签、副本数、各类开关 |
| `.Release` | 本次安装的元信息 | `.Release.Name` / `.Release.Namespace` / `.Release.IsInstall` |
| `.Chart` | Chart.yaml 的内容 | `.Chart.Name` / `.Chart.AppVersion` |
| `.Capabilities` | 集群能力 | `.Capabilities.KubeVersion.Minor`（按版本启用不同字段） |

模板里用**双花括号**包裹取值，四个内置对象的完整写法：

```yaml
replicas: {{ .Values.replicaCount | default 2 }}        # .Values：参数
name:     {{ .Release.Name }}-{{ .Chart.Name }}         # .Release / .Chart
minor:    {{ .Capabilities.KubeVersion.Minor }}         # .Capabilities
```

### 3.2 资源名必须带 Release 名 {#naming}

```yaml
metadata:
  name: {{ .Release.Name }}-{{ .Chart.Name }}   # ✅ 同一 Chart 可重复安装
  labels:
    {{- include "mychart.labels" . | nindent 4 }}   # 公共标签抽到 _helpers.tpl
```

反例是写死 `name: my-app`——**同一个集群装第二次就会因为资源已存在而失败**，"同一套清单支持多环境多实例"这个前提直接崩塌。同理，所有跨资源引用（Service 的 `selector`、Ingress 的 `serviceName`、ConfigMap 引用的名字）都必须走同一个命名模板，否则改一处名字就会断链。

### 3.3 三个常用模板技巧 {#template-tips}

```yaml
# ① 条件渲染：某环境才需要 Ingress
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
{{- end }}

# ② 带默认值的取值：values 里没写也不会渲染出 <no value>
replicas: {{ .Values.replicaCount | default 2 }}

# ③ 必填校验：缺参数时安装直接失败，而不是渲染出空字符串
{{- required "image.tag 必填（通常是 Git SHA）" .Values.image.tag }}
```

> **`required` 是最值得养成的习惯**：Helm 渲染失败的信息，比"部署成功后 Pod 起不来（因为镜像 tag 是空的）"要好定位得多——**把错误提前到渲染阶段**。

## 四、values 的覆盖优先级 {#values-layering}

从低到高，后面的覆盖前面的：

```
① Chart 自带 values.yaml（默认值）
      ▼
② 父 Chart 的 values.yaml 里以子 Chart 名为 key 的覆盖
      ▼
③ -f values-dev.yaml / -f values-prod.yaml（可传多个，后者覆盖前者）
      ▼
④ --set / --set-string / --set-file
```

三个实践要点：

| 要点 | 说明 |
|---|---|
| **`--set` 只用于少量动态值** | 复杂结构（列表、含逗号或点的字符串）在 CI 里极易出错；`--set-string` 强制字符串、`--set-file` 从文件读内容（适合塞证书） |
| **环境差异写在 `-f` 文件里** | `values-prod.yaml` 提交进 Git，与 Chart 同源可追溯 |
| **镜像 tag 由流水线注入** | 用提交 SHA 覆写，而不是把 tag 提交回主干（见 §八） |

**安全红线**：密码、Token、私钥**不要写进 values.yaml**。它会被提交到 Git、出现在 `helm get values` 的输出里。做法是让 Secret 由外部系统产生——Sealed Secrets / External Secrets Operator / Vault CSI Driver，Chart 只引用 Secret 名。

## 五、release 生命周期与"回滚"的真实语义 {#release-lifecycle}

```bash
helm install   my-app ./mychart -f values-prod.yaml   # 创建 release，revision=1
helm upgrade   my-app ./mychart -f values-prod.yaml   # revision=2
helm history   my-app                                 # 查看历史
helm rollback  my-app 1                               # 回到 revision 1
helm uninstall my-app                                 # 删除 release 及其资源
helm get manifest my-app                              # 看本次实际 apply 的 YAML
helm diff upgrade my-app ./mychart                    # 预览差异（需插件）
```

### 5.1 `rollback` 不是"撤销"，而是"用旧版本再发一次" {#rollback-semantics}

```
revision 1  初次安装
revision 2  升级到 v2（出问题）
revision 3  ← rollback 到 revision 1 产生的**新** revision
```

**因此历史只会前进、不会后退**：`helm history` 能看到"回滚"这个动作本身，这比"撤销操作、历史无从查起"更符合审计要求。记法：**rollback = 把旧 manifest 重新 apply 一遍**。

### 5.2 默认不等待，是最大的误判来源 {#wait-atomic}

| 参数 | 作用 | 不加会怎样 |
|---|---|---|
| `--wait` | 等到所有资源 Ready（Deployment 的副本就绪、PVC 绑定）才返回 | **只要 apiserver 接受就算成功**——Pod 还在 `ImagePullBackOff`，流水线却报绿 |
| `--atomic` | 失败（含超时）自动回滚到上一个 revision | 失败后集群停在半截状态，需要人工收拾 |
| `--timeout` | 等待超时（默认 5m） | 卡住时长时间占用流水线 |

> **流水线里的标准写法**：`helm upgrade --install --atomic --wait --timeout 5m`。**没有 `--wait` 的 upgrade 等于"提交了意图"，不等于"部署成功"**——这是初学 Helm 最容易踩的坑。

### 5.3 三向合并与"手工改动会被清掉" {#three-way-merge}

Helm 3 升级时采用**三向策略合并**：拿「上一版 manifest」「新版 manifest」「集群当前状态」三方比对，算出该打的 patch。

由此产生一个必须知道的行为：**如果你在集群里手工 `kubectl edit` 改过资源，下次 `helm upgrade` 有可能把它改回去**（因为新版 manifest 里没有这个改动，协调结果以 manifest 为准）。

| 版本 | 合并方式 | 症状 |
|---|---|---|
| Helm 2 | 两向（旧 manifest + 新 manifest） | 手工新增的字段被无视，删除时也可能误删 |
| Helm 3 | **三向**（引入集群现状作为第三方） | 能识别手工变更，但**仍会在冲突时以 manifest 为准** |

结论：**集群里的东西要以 Chart 为唯一事实源**，临时改动要么回写进模板，要么准备好它在下次发布时被覆盖。

## 六、Helm / Kustomize / 纯 YAML 的取舍 {#helm-vs-kustomize}

| 维度 | 纯 YAML + kubectl | **Kustomize** | **Helm** |
|---|---|---|---|
| 参数化方式 | 手工复制多份 | **overlay + patch**（不改原始 YAML） | **模板 + values** |
| 表达能力 | 无 | 受限，刻意不做逻辑判断 | 强（条件、循环、函数、命名模板） |
| 学习成本 | 最低 | 低 | 高（Go template 语法是真实门槛） |
| **产物可见性** | 直接可读 | `kustomize build` 可见 | **渲染前看不到最终 YAML** ← 主要代价 |
| 版本与回滚 | ❌ | ❌ | ✅ release / revision |
| 是否内置 | ✅ | ✅（`kubectl -k`） | ❌ 需单独安装 |
| 适合 | 单环境小项目 | **同一套东西的环境差异** | **分发与复用**（一份 Chart 装 N 次） |

**判据只有一句话**：

- 你要**把同一套东西装 N 次、或者给别人装** → 用 **Helm**（它的本质是"分发格式"）；
- 你只是**同一套东西在几个环境里略有差异** → 用 **Kustomize**（更简单、更透明、渲染结果一眼可见）。

> 两者的组合（`helm template | kustomize build`）技术上可行，但会**绕过 release 机制**、失去 `helm rollback`——所以更常见的做法是 Chart 内部用 values 分环境，而不是套两层工具。

## 七、Chart 的版本与依赖 {#chart-version}

### 7.1 `version` 与 `appVersion` 是两个东西 {#two-versions}

```yaml
apiVersion: v2
name: mychart
version: 1.4.0        # Chart 自身的版本：随**模板**变化，依赖解析与升级判断用它
appVersion: "2.7.3"   # 被部署**应用**的版本：仅供展示，Helm 不解析它
```

最常见的误解：以为改了 `appVersion` 就能让下游拿到新版本。**下游的依赖判断只看 `version`**——只改了 appVersion 而不动 version，`helm dependency update` 会认为"没有更新"。

### 7.2 依赖与锁文件 {#dependencies}

```yaml
# Chart.yaml
dependencies:
  - name: redis
    version: "19.x.x"
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled        # 用 values 控制是否安装该依赖
```

```bash
helm dependency update ./mychart    # 解析依赖并生成/更新 Chart.lock
helm dependency build  ./mychart    # 按 Chart.lock 精确还原
```

**`Chart.lock` 必须提交到 Git**——它的作用与 `package-lock.json` / `pom.xml` 完全一致：**锁定传递依赖的精确版本，保证任何人、任何时候构建出的 Chart 是同一个**。不提交锁文件是团队里非常常见的一个错。

### 7.3 不要 fork 上游 Chart 直接改 {#do-not-fork}

改第三方 Chart 的正确姿势，按推荐度排序：

| 方式 | 做法 | 代价 |
|---|---|---|
| **父 Chart 包一层**（推荐） | 把自己的 Chart 定义为父，上游作为 dependency，只覆盖 values | 无法改模板结构，只能改参数 |
| **post-renderer** | `helm install --post-renderer ./patch.sh`，对渲染结果做二次加工 | 需维护脚本，调试链路变长 |
| 复制到自己的仓库 | 全盘接管 | 上游升级要人工 merge，长期必然脱节 |

## 八、Helm 在流水线里的位置 {#helm-in-cicd}

```
代码提交 → 构建镜像（不可变标签，通常用 Git SHA）→ 更新 values 里的 image.tag → helm upgrade --install
```

三个要点：

1. **镜像 tag 不落主干**。用 `--set image.tag=$GIT_SHA` 或由 CI 写一份临时 values，避免"每次发布都产生一个只改 tag 的提交"——那种提交会让主干历史变成发布日志，还会制造无意义的 merge 冲突。
2. **`--atomic --wait --timeout` 三个参数一起上**，让流水线感知的是**真实部署结果**，而不是"YAML 被接受了"。
3. **GitOps 模式下的分工**：CI 只负责把新的 image tag 写回 Git 仓库，由集群内的 Argo CD 拉取并渲染（`helm template`），**此时回滚的手段从 `helm rollback` 变成 `git revert`**。两种模式的差别与取舍，见 [GitOps 与渐进式交付](/cloud-native/cicd/progressive-delivery#gitops)。

> **判断用哪种**：CI 系统能安全持有集群凭证（内网、单集群）→ 流水线直接 `helm upgrade`；集群凭证不宜外放、或多集群多环境要统一审计 → GitOps 拉模式。

## 九、对比辨析 {#compare}

| 对比 | 差别 | 何时选后者 |
|---|---|---|
| **Helm / kubectl** | 安装包管理 vs 单资源操作 | 资源超过一两个、或需要环境差异与回滚 |
| **Helm / Kustomize** | 模板 + values vs overlay + patch | 只需环境差异（不需分发）时用 Kustomize |
| **`--wait` / 默认** | 等就绪 vs 提交即返回 | 流水线里**永远**选 `--wait` |
| **`install` / `upgrade`** | 建 release vs 更新 release | 用 `--install` 兼容两者（幂等） |
| **`rollback` / `uninstall` + `install`** | 旧 manifest 再 apply 一次 vs 全删重装 | 回滚用前者（保留历史、动作最小） |
| **`version` / `appVersion`** | 模板版本 vs 应用版本 | 依赖解析看前者，人看后者 |

## 十、使用场景与面试问答 {#interview}

**Q1：Helm 解决了什么问题？为什么不用纯 YAML？**
纯 YAML 无法处理三件事：**环境差异**（复制多份必然漂移）、**版本与回滚**（没有"这次发布"的概念）、**分发复用**（一份清单装多次）。Helm 把一组资源打包成可参数化、可版本化、可回滚的 Chart，本质是**集群侧的包管理器**——对标的是 `apt` / `npm`，而不是 `kubectl`。

**Q2：Helm 3 相比 Helm 2 最大的变化是什么？**
**移除了集群内的 Tiller**。Helm 2 的 Tiller 以高权限运行在集群里，任何能访问它的人都能提权，与 RBAC 模型冲突；Helm 3 改为以当前 kubeconfig 身份直接操作集群，权限完全交给 RBAC，release 记录也存在同命名空间的 Secret 中，多租户下才可用。

**Q3：`helm upgrade` 显示成功，但服务没起来，为什么？**
因为 Helm **默认不等待** Ready——只要 apiserver 接受资源就算成功，Pod 可能还在 `ImagePullBackOff` 或 CrashLoop。加 `--wait`（等就绪）+ `--atomic`（失败自动回滚）+ `--timeout`，让流水线拿到真实结果。

**Q4：`helm rollback` 做了什么？**
它**不是撤销操作**，而是**把指定 revision 的 manifest 重新 apply 一次**，并产生一个**新的 revision**。所以历史只前进不后退，`helm history` 里能看到回滚这个动作本身——这对审计是加分项。

**Q5：Helm 和 Kustomize 怎么选？**
看**是否需要分发复用**：要把同一套东西装 N 次或交付给别人 → Helm（模板 + values + release 版本管理）；只是同一套东西的环境差异 → Kustomize（overlay + patch，更简单且渲染结果可见）。Helm 的主要代价是**模板渲染前看不到最终 YAML**。

**Q6：为什么 `helm upgrade` 会把我手工改的配置改回去？**
Helm 3 使用**三向策略合并**（旧 manifest + 新 manifest + 集群现状），能识别手工变更但在冲突时**以 manifest 为准**。所以集群要以 Chart 为唯一事实源——临时改动要么回写进模板，要么准备好被覆盖。

**Q7：`Chart.yaml` 里 `version` 和 `appVersion` 的区别？**
`version` 是 **Chart 自身版本**，随模板变化，**依赖解析和升级判断只看它**；`appVersion` 是被部署应用的版本，仅供展示，Helm 不解析。只改 appVersion 不动 version，下游 `helm dependency update` 会认为没有更新。

**Q8：怎么避免 values.yaml 泄露密码？**
不要用 values 承载密钥。让 Secret 由外部系统产生——Sealed Secrets / External Secrets Operator / Vault CSI Driver——Chart 里只引用 Secret 名。因为 values 会进 Git，也会出现在 `helm get values` 的输出里。

> **下一篇**：[服务网格](/cloud-native/service-mesh/) —— 清单管好了、部署自动化了，服务之间的通信治理（超时、重试、灰度、mTLS）还散在各语言的应用代码里，这件事需要在基础设施层解决。
