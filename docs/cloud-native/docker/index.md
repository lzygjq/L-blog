---
date: 2026-09-15
title: Docker 容器化
sidebar: Docker
desc: 容器不是"轻量虚拟机"——从 namespace 与 cgroup、镜像分层与写时复制，到多阶段构建的 Dockerfile、镜像瘦身与 Compose 本地环境编排
---

# Docker 容器化

## 一、问题场景：容器解决的不是"部署"，是"一致" {#why-container}

「代码在我机器上跑得好好的」这句话背后是一个工程问题：**应用依赖的不只是代码，还有操作系统、JRE 版本、时区、字符集、系统库、环境变量、目录结构**。交付物只有 JAR 时，这些差异靠"运维照着文档配一遍"来抹平，于是每次上线都在赌。

两种收敛差异的办法：

| 思路 | 做法 | 代价 |
|---|---|---|
| **把环境做成机器**（虚拟机） | 每个应用一台带完整 OS 的虚机，虚拟化层（Hypervisor）模拟硬件 | 每台 GB 级、分钟级启动、OS 本身要打补丁 |
| **把环境做成进程**（容器） | 应用连同它的文件系统一起打包成镜像，复用宿主机内核，只做隔离 | 需要接受"与宿主机共享内核"这一前提 |

所以容器真正的定位是：**一个被装了笼子的普通进程**。它比虚拟机轻，不是因为"优化得好"，而是因为它**没有虚拟化硬件**——隔离靠的是 Linux 内核本来就有的两套机制。

## 二、容器到底是什么 {#what-is-container}

### 2.1 隔离的两半：namespace 与 cgroup {#namespace-cgroup}

| 机制 | 管什么 | 一句话 |
|---|---|---|
| **namespace** | 能**看见**什么 | 让进程以为自己是机器上唯一的进程、独占网络与文件系统 |
| **cgroup** | 能**用多少** | 给 CPU、内存、块设备 IO 设上限，超了被限流或 OOM Kill |

常见的 namespace 类型与它们造成的"假象"：

| namespace | 隔离对象 | 容器内的表现 |
|---|---|---|
| `pid` | 进程号 | 容器内是 PID 1，看不到宿主机其他进程 |
| `net` | 网络设备、端口、路由表 | 有自己的 `eth0`、自己的端口空间，端口不与宿主机冲突 |
| `mnt` | 挂载点 | 看到的是镜像那套文件系统，而非宿主机根目录 |
| `uts` | 主机名与域名 | 容器可以有自己的 hostname |
| `ipc` | 共享内存、信号量 | 跨容器不串 |
| `user` | 用户与 UID 映射 | 容器内 root 可映射为宿主机普通用户（**重要安全手段**，K8s v1.34 起逐步走向稳定） |

> **最常被问倒的一句**：「容器内的 root 和宿主机的 root 是同一个吗？」——**默认情况下是**（不开启 `user` namespace 时 UID 不做映射），所以"容器逃逸"才有意义。这正是生产上要开 user namespace、要以非 root 运行、要禁 `--privileged` 的原因。

### 2.2 镜像与分层：为什么"容器一删数据就没了" {#image-layers}

镜像是**一组只读层 + 一份元数据**：

```
镜像 = [底座层] + [依赖层] + [应用层]   ← 全部只读，可被多个容器共享
                        ↓
容器 = 上述只读层（共享） + [一个可写层]（容器独有）
```

写时复制（Copy-on-Write）：容器要修改一个来自镜像的文件时，内核先把该文件**复制到可写层**再改，镜像层永远不动。由此推出三条必须记住的结论：

1. **可写层随容器生命周期存在**——`docker rm` 之后里面的数据一起消失。要持久化必须用卷或绑定挂载。
2. **改文件不会改镜像**——想固化成镜像得重新构建（`docker commit` 能做到，但生产上不推荐：不可复现、不受审查）。
3. **联合文件系统（overlay2 等）是"合并视图"**，不是真把层拷贝到一起；层数越多，路径查找越长，所以仍建议控制层数。

### 2.3 分层如何决定构建速度 {#layer-cache}

**每条会改变文件系统的指令产生一层**（`RUN` / `COPY` / `ADD`）；只改元数据的指令（`ENV` / `LABEL` / `CMD` / `ENTRYPOINT` / `EXPOSE` / `WORKDIR`）不产生层。

构建缓存的判定规则很粗暴：**某层失效，它之后的所有层全部失效**。于是最优写法只有一条原则：

> **把"变化频率低"的东西放在 Dockerfile 前面，把"每次都变"的放在最后。**

最常见的踩坑是 `COPY . .` —— 本地任何一次改动（哪怕只改了一个测试文件）都会让后面所有层重建。正确姿势是先 `COPY pom.xml` 装依赖，再 `COPY src`。

## 三、Dockerfile：从"能跑"到"敢上生产" {#dockerfile}

### 3.1 一个反面教材 {#bad-dockerfile}

```dockerfile
FROM eclipse-temurin:21-jdk
COPY target/app.jar app.jar
ENTRYPOINT ["java", "-jar", "app.jar"]
```

这段能跑，但四个问题一个都不少：

| 问题 | 后果 |
|---|---|
| 用 **JDK** 而非 JRE | 镜像白白多出 250~350 MB（编译工具链运行时用不到） |
| 整个 fat jar 一层 | 改一行代码，几十 MB 的层全部重建，CI 每次都从头推镜像 |
| 默认 **root** 运行 | 容器被攻破即等于宿主机 root（叠加未开 user namespace） |
| 无 **HEALTHCHECK** | 编排层只能靠"进程还活着"判断，进程僵死但没退出时会一直漏流量 |

### 3.2 分层 jar + 多阶段构建 {#layered-jar}

Spring Boot 的 jar 自带**层索引**，支持按"变化频率"拆成四层：

| 层 | 内容 | 变化频率 |
|---|---|---|
| `dependencies` | 第三方依赖（非 SNAPSHOT） | 几乎不变 |
| `spring-boot-loader` | 启动引导类 | 几乎不变 |
| `snapshot-dependencies` | SNAPSHOT 依赖 | 偶尔变 |
| `application` | 自己的类与资源 | **每次都变** |

> **版本口径（2026-09）**：Spring Boot 3.3 起 `-Djarmode=layertools extract` 已弃用，改为 `-Djarmode=tools extract --layers`（旧写法仍可用，但新项目不要再用）。另外 **Boot 3.2 起 Jar 启动类的包路径**由 `org.springframework.boot.loader.JarLauncher` 变为 `org.springframework.boot.loader.launch.JarLauncher` —— 照抄老教程的 Dockerfile 会在这里报 `ClassNotFoundException`。

```dockerfile
# ---------- 构建阶段：JDK 与 Maven 只出现在这里 ----------
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /build
# 先拷 pom，让"下载依赖"单独成层（pom 不变即命中缓存）
COPY pom.xml ./
COPY .mvn/ .mvn/
COPY mvnw ./
RUN ./mvnw -q dependency:go-offline
# 再拷源码
COPY src/ src/
RUN ./mvnw -q clean package -DskipTests
# 拆层：产物在 target/extracted/{dependencies,spring-boot-loader,snapshot-dependencies,application}
RUN java -Djarmode=tools -jar target/*.jar extract --layers --destination target/extracted

# ---------- 运行阶段：只有 JRE ----------
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN addgroup --system --gid 1001 appgroup \
 && adduser  --system --uid 1001 --ingroup appgroup appuser
# 按"最不容易变"到"最容易变"的顺序拷贝
COPY --from=builder --chown=appuser:appgroup /build/target/extracted/dependencies/        ./
COPY --from=builder --chown=appuser:appgroup /build/target/extracted/spring-boot-loader/ ./
COPY --from=builder --chown=appuser:appgroup /build/target/extracted/snapshot-dependencies/ ./
COPY --from=builder --chown=appuser:appgroup /build/target/extracted/application/        ./
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/actuator/health/readiness || exit 1
ENTRYPOINT ["java", \
  "-XX:MaxRAMPercentage=70", \
  "-XX:+ExitOnOutOfMemoryError", \
  "org.springframework.boot.loader.launch.JarLauncher"]
```

> **每条 `COPY` 都要带 `--chown`**：漏掉一个，那一层解出来的文件属主就是 root，运行时会以"读得到、写不了"的形式暴露，而**构建期不报任何错**。这类"静默不一致"是 Dockerfile 审核最该盯的地方。

### 3.3 JVM 在容器里必须显式声明的几件事 {#jvm-in-container}

| 参数 | 为什么必须写 |
|---|---|
| `-XX:MaxRAMPercentage=70` | 不写就按默认比例算堆上限。**写百分比而不是 `-Xmx` 硬编码**：同一个镜像在不同规格的 Pod 上不用改；留 30% 给元空间、线程栈、直接内存与 JVM 自身 |
| `-XX:+ExitOnOutOfMemoryError` | 否则 OOM 后进程可能半死不活地卡着，编排层不会重启它 |
| 容器感知（`UseContainerSupport`） | JDK 10+ 默认开启（JDK 8 自 8u191 起回移）。**JDK 8 老版本会读到宿主机内存**——这是"堆明明设了还是被 OOMKilled"的经典原因 |

**优雅停机**是另一个必配项：`ENTRYPOINT` 用 **exec 形式**（JSON 数组）才能让 Java 进程以 PID 1 收到 `SIGTERM`；再配合 Spring Boot 的 `server.shutdown=graceful`，正在处理的请求才有机会跑完。

### 3.4 镜像瘦身的常规手段 {#slim-image}

| 手段 | 收益 | 注意 |
|---|---|---|
| 运行阶段换 `-jre` / `-jre-alpine` / `distroless` | 省 200~400 MB | Alpine 用 musl libc，涉及 JNI、glibc 依赖的组件可能出问题，需实测 |
| `jlink` / `jdeps` 裁剪 JRE | 再省 50~80 MB | 对反射、动态代理不友好，Spring 生态慎用 |
| 合并 `RUN` + 清理包管理缓存 | 少几十 MB | `apt-get install` 后必须**同层** `rm -rf /var/lib/apt/lists/*`，跨层删不掉 |
| `.dockerignore` | 构建上下文从几百 MB 降到几 MB | 至少排除 `target/`、`.git/`、`node_modules/` |
| 多阶段构建 | 编译工具链不进最终镜像 | 见本篇 3.2 |

## 四、数据与网络 {#storage-network}

### 4.1 三种"挂载"怎么选 {#volume-types}

| 形态 | 谁管理 | 适合 | 典型场景 |
|---|---|---|---|
| **匿名卷** | Docker（随机名） | 不想管 | 基本不用 |
| **命名卷** | Docker（有名字） | 生产数据、需要备份迁移 | 数据库数据目录 |
| **绑定挂载** | 你自己（宿主机路径） | 开发期改配置、挂源码 | 把 `application.yml` 挂进容器 |

> 命名卷的数据在宿主机 `/var/lib/docker/volumes/` 下，**`docker rm` 容器不会删卷**（要显式 `docker volume rm`）；绑定挂载的目录跟着宿主机走，容器删了数据还在。

### 4.2 网络：为什么容器里 `localhost` 连不上宿主机的库 {#network}

| 模式 | 行为 | 用在哪 |
|---|---|---|
| `bridge`（默认） | 每个容器一块 veth 接在 `docker0` 上，出网走 NAT | 绝大多数场景 |
| **自定义 bridge** | 额外提供 DNS：**容器之间可用服务名互访** | Compose、多容器应用 |
| `host` | 直接用宿主机网络栈，没有独立端口空间 | 极高性能要求，或需要监听特定端口 |
| `none` | 只有 loopback | 纯计算任务 |

两个必须记住的点：

- **容器内的 `localhost` 是容器自己**。访问宿主机服务要用 `host.docker.internal`（Docker Desktop）或宿主机内网 IP；在 Compose 里则直接用**服务名**。
- **默认 `bridge` 不做名字解析**，容器间只能写 IP。Compose 之所以能用服务名，是因为它给每个项目建了一个自定义网络。

## 五、Compose：把本地依赖环境变成一行命令 {#compose}

本地开发最耗时的环节是"装齐 MySQL / Redis / 消息队列并配好"。Compose 把它压成一个文件：

```yaml
# compose.yaml —— Compose V2 起不再需要顶层 version 字段（写了会告警）
services:
  mysql:
    image: mysql:8.4
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: demo
    ports: ["3306:3306"]
    volumes:
      - mysql-data:/var/lib/mysql        # 命名卷：容器删了数据还在
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-proot"]
      interval: 5s
      timeout: 3s
      retries: 20

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 20

  app:
    build: .
    depends_on:
      mysql: { condition: service_healthy }   # 关键：等"就绪"，不是等"启动"
      redis: { condition: service_healthy }
    environment:
      SPRING_DATASOURCE_URL: jdbc:mysql://mysql:3306/demo   # 服务名即域名
      SPRING_DATA_REDIS_HOST: redis
    ports: ["8080:8080"]

volumes:
  mysql-data:
```

三个高频坑：

| 坑 | 现象 | 解法 |
|---|---|---|
| `depends_on` 只等"启动" | 应用启动报 `Connection refused`，过几秒自己又好了 | 配 `healthcheck` + `condition: service_healthy` |
| 容器内写 `localhost` | 连不上宿主机的服务 | 改用服务名 / `host.docker.internal` |
| 数据"莫名丢了" | 删容器重建后库是空的 | 卷没声明（用了匿名卷或容器内路径） |

## 六、对比辨析 {#compare}

### 6.1 容器 vs 虚拟机 {#container-vs-vm}

| 维度 | 容器 | 虚拟机 |
|---|---|---|
| 隔离层 | 内核的 namespace + cgroup | Hypervisor 虚拟硬件 |
| 内核 | **共享宿主内核** | 各自独立内核 |
| 启动 | 毫秒~秒级 | 数十秒~分钟级 |
| 体积 | MB 级 | GB 级 |
| 密度 | 单机可跑上百个 | 单机十几个 |
| 隔离强度 | 较弱（内核漏洞即逃逸面） | 强 |
| 跑异构内核 | 不能（Linux 容器必须跑在 Linux 内核上） | 能 |

> 结论不是"容器取代虚拟机"，而是**分层**：虚拟机做租户级强隔离，容器做应用级快速交付。云上常见组合正是"虚机池 + 容器编排"。

### 6.2 几组容易混的指令 {#instruction-diff}

| 对比 | 区别 | 记忆点 |
|---|---|---|
| `COPY` / `ADD` | `ADD` 额外支持自动解压 tar 与远程 URL | **一律用 `COPY`**：需要解压就在 `RUN` 里显式做，`ADD` 的隐式行为是审查盲区 |
| `ENV` / `ARG` | `ARG` 只在构建期可见；`ENV` 会写进镜像、运行时也在 | 密钥不要用 `ENV`（`docker inspect` 一眼可见） |
| `RUN` shell 形式 / exec 形式 | shell 形式走 `/bin/sh -c`，实际进程是 sh 的子进程 | 需要准确传信号就用 exec 形式 |
| `VOLUME` / 绑定挂载 | 前者声明由 Docker 管理的卷，后者挂宿主机路径 | 生产用卷、开发用绑定挂载 |

`CMD` 与 `ENTRYPOINT` 的四种组合，最实用的其实是最后一种：

| 写法 | `docker run img` | `docker run img foo` |
|---|---|---|
| 只有 `CMD ["a"]` | 执行 `a` | 执行 `foo`（CMD 被完全覆盖） |
| 只有 `ENTRYPOINT ["a"]` | 执行 `a` | 执行 `a foo`（参数追加） |
| `ENTRYPOINT ["a"]` + `CMD ["b"]` | 执行 `a b` | 执行 `a foo` |
| `ENTRYPOINT ["java","-jar","app.jar"]` | 启动应用 | **追加 JVM 参数**：`docker run img -Dfoo=bar` |

## 七、使用场景与面试问答 {#interview}

**Q1：容器和虚拟机的区别？**
隔离层次不同：虚机靠 Hypervisor 虚拟硬件、每台有独立内核；容器靠宿主机内核的 namespace（隔离可见性）与 cgroup（隔离资源），共享内核、秒级启动、MB 级体积。所以容器轻但不"硬"——**内核漏洞是共同的攻击面**。

**Q2：镜像为什么分层？**
为了**复用与缓存**。层是只读的，多个镜像可共享底层，构建时未变更的层直接命中缓存。**失效规则是"某层失效则其后全部失效"**，所以 Dockerfile 要把变化频率低的指令写在前、把 `COPY src` 写在最后。

**Q3：容器里 JVM 堆该怎么设？**
优先 `-XX:MaxRAMPercentage` 而不是 `-Xmx` 硬编码，让同一个镜像适配不同规格；比例留出余量（常见 60%~75%）给元空间、线程栈、直接内存。前提是 JVM 能感知容器 limit——**JDK 10+ 默认开启**，JDK 8 需 8u191+。

**Q4：容器删了，数据库数据还在吗？**
**默认不在**。可写层随容器销毁而消失，数据必须落在命名卷或绑定挂载上；命名卷不会因 `docker rm` 被删，要显式 `docker volume rm`。

**Q5：为什么优雅停机没生效，请求还是被切断？**
先查两处：① `ENTRYPOINT` 是不是 **shell 形式**——那样 PID 1 是 `/bin/sh`，它不转发 `SIGTERM`，Java 进程收不到；② 应用侧有没有开优雅停机（Spring Boot 的 `server.shutdown=graceful`）。编排层发的是 `SIGTERM`，之后有 `terminationGracePeriodSeconds` 的窗口，超时才 `SIGKILL`。

**Q6：Docker 和 Kubernetes 是什么关系？**
Docker 解决"**打成一个一致的包、按单机习惯跑起来**"，K8s 解决"**在几百台机器上调度、扩缩、自愈、暴露服务**"。K8s 早已不依赖 Docker Engine——**dockershim 在 v1.24 被移除**，现在通过 CRI 直接对接 containerd / CRI-O。所以"本地开发用 Docker"和"集群里跑的是 containerd"并不矛盾。

> 下一篇：[Kubernetes](/cloud-native/kubernetes/) —— 从单机容器到集群编排，要补的是声明式 API、调度与多租户三件事。
