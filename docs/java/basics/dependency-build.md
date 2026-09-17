---
date: 2026-09-17
title: 依赖管理与构建：从"能打包"到"可复现"
sidebar: 依赖与构建
order: 10
desc: GAV 坐标与仓库解析、最近优先与最高版本优先两条冲突调解规则、NoSuchMethodError 三类症状的定位、生命周期与插件绑定、聚合与继承的区别、BOM 与依赖锁定、多模块工程与构建加速
---

# 依赖管理与构建：从"能打包"到"可复现"

Java 项目里第一行真正会咬人的配置不是代码，是 `pom.xml`。

它是唯一一份**没有编译器、没有单测、也常常没有评审**的配置——但它决定了你的运行时里到底装着哪些 jar、哪个版本。一个依赖被传递进来、版本被别人顶掉，症状是运行期的 `NoSuchMethodError`，而不是编译错误：**问题在构建期埋下，在运行期爆炸，中间隔着几周。**

> **主线：依赖管理要回答的不是"怎么把包打出来"，而是"这份构建在明天、在别人的机器上、在 CI 里，能不能产出完全相同的结果"。**
>
> "完全相同"这个词对应三个具体的敌人：**传递依赖被顶版本**、**SNAPSHOT 会变**、**构建工具与插件版本没锁**。这一篇的三到七节分别处理它们。

## 一、问题场景：为什么"本地能跑、CI 挂" {#why}

这类问题的归因通常有三种，而且**它们都不是"代码有问题"**：

| 现象 | 常见根因 | 为什么本地看不出来 |
|---|---|---|
| 本地能跑，CI 编译不过 | 依赖在本地仓库里"恰好在"（历史遗留），CI 是干净环境 | 本地 `~/.m2` 是长期累积的，从未被验证过是否"仅靠 pom 就能拉到" |
| 本地能跑，CI 跑出不同结果 | **依赖版本未锁定**——同一份 pom 在不同时间解析出不同版本 | 中央仓库里 SNAPSHOT 与版本区间（`[1.0,)`）会变 |
| 测试环境的包与生产不一致 | 构建工具 / JDK / 插件的版本不同 | 只锁了依赖，没锁**构建工具自身** |

**一个可复现性自检**，跑一次就知道仓库有没有"隐形依赖"：

```bash
# 把本地仓库换个位置重新构建（不删原仓库，避免影响其他项目）
mvn -Dmaven.repo.local=/tmp/m2-fresh -B clean package

# 如果失败了，说明 pom 里缺东西 —— 而这些东西一直在你本地仓库里"恰好存在"
```

**这不是洁癖**：它对应的是[流水线设计](/cloud-native/cicd/pipeline-design#build-speed)里那条最容易踩的规则——CI 每次都是干净环境。**只有"仅凭仓库里的文件就能构建"的项目，才能在 CI 与别人的机器上得到相同结果。**

## 二、坐标与仓库：一个依赖是怎么被找到的 {#coordinates}

Maven 世界里每个构件由**三元组唯一确定**：

```
groupId : artifactId : version
com.example : order-service : 1.7.3
```

**三者缺一不可，且 version 必须是个确定值**——这一条是全篇的地基。

### 2.1 解析顺序

```
① 本地仓库 ~/.m2/repository          ← 找到就用，不做任何远端校验
② 私服（Nexus / Artifactory）        ← settings.xml 的 <mirror> 决定
③ 中央仓库 repo.maven.apache.org
```

**私服的 `<mirror><mirrorOf>*</mirrorOf>` 是最常见的配置**：它把中央仓库也代理进来，于是所有下载都经过私服。这带来两个实际效果：**内部构件有地方放**，以及**外网断掉时构建仍能工作**（私服有缓存）。

### 2.2 三个版本标识的性质差异

| 标识 | 例子 | 内容会不会变 | 能否用于生产 |
|---|---|---|---|
| **RELEASE** | `1.7.3` | **不会** | ✅ 唯一选择 |
| **SNAPSHOT** | `1.7.3-SNAPSHOT` | **会**——同一个坐标每天可能是不同字节 | ⚠️ 仅限开发/联调 |
| **版本区间** | `[1.0,2.0)` | 会（随仓库内容变化） | ❌ 禁止 |

> **SNAPSHOT 是"不可复现"的典型来源**：它每天的构建可能指向不同内容，且你的本地仓库里那一份**可能是三天前的**（`-U` 才会强制更新）。所以"我这儿是好的"这句话在 SNAPSHOT 场景下没有信息量。
>
> 对应的纪律与[制品标签不可变](/cloud-native/cicd/pipeline-design#tag-strategy)是同一条：**能被别人依赖的东西，内容不能变。**

### 2.3 作用域：一个依赖在哪些阶段可见

| scope | 编译期 | 测试期 | 运行期 | 会被传递吗 | 典型用途 |
|---|---|---|---|---|---|
| `compile`（默认） | ✅ | ✅ | ✅ | **会** | 绝大多数依赖 |
| `provided` | ✅ | ✅ | ❌ | 不会 | Servlet API（容器提供）、Lombok |
| `runtime` | ❌ | ✅ | ✅ | 会 | JDBC 驱动（编译期只需要接口） |
| `test` | ❌ | ✅ | ❌ | 不会 | JUnit、Mockito、H2 |
| `optional` | ✅ | ✅ | ✅ | **不会**（下游需自己声明） | 只给部分场景用的功能模块 |
| `import` | — | — | — | — | 只在 `dependencyManagement` 里导入 BOM |

**两个高频误用**：

- **把驱动写成 `compile` 不是错，但混淆了"编译期"与"运行期"的边界**。`runtime` 的语义是"编译时我用不到你，但跑起来需要你"——这也是 SPI 机制能成立的原因（`Class.forName` 在运行期加载实现）。
- **`optional` 是库作者控制"依赖传染"的工具**。你写一个库，某个功能依赖 Redis，但多数使用者不用它——标 `optional`，使用者自己按需引入。**不标，所有人都会被动拉进 Redis 客户端。**

## 三、依赖解析：两条规则决定你拿到哪个版本 {#resolution}

**传递依赖是依赖冲突的全部来源。** 你声明了 A，A 声明了 C-1.0，你同时声明了 B，B 声明了 C-2.0——最终用哪个 C？

### 3.1 两个工具的规则正好相反

| 工具 | 规则 | 记忆 |
|---|---|---|
| **Maven** | **路径最短优先**；路径长度相同时，**先声明的优先** | "离我近的说话" |
| **Gradle** | **版本最高优先**（默认策略） | "新的说话" |

**Maven 的两步调解**，举个具体例子：

```
你的项目
├── A ── C-1.0        （路径长度 2）
└── B ── D ── C-2.0   （路径长度 3）

结果：C-1.0 —— 因为 A→C 更短
```

```
你的项目
├── A ── C-1.0        （长度 2，先声明）
└── B ── C-2.0        （长度 2，后声明）

结果：C-1.0 —— 路径等长时，先声明者胜
```

**这就解释了一个常见的困惑**："我在 pom 里写了 C-2.0，为什么运行时是 C-1.0？"——如果你的声明路径比传递路径更长，**你的声明会被忽略**（你甚至可能没意识到自己是通过某个依赖间接引入了 C）。

### 3.2 三个必须会的诊断命令

```bash
mvn dependency:tree                          # 完整依赖树（冲突调解后的结果）
mvn dependency:tree -Dincludes=com.google.guava   # 只看某个构件从哪来的
mvn dependency:tree -Dverbose                # 显示被省略的分支（知道"什么被顶掉了"）
mvn dependency:analyze                       # 声明了但没用到 / 用到了但没声明
mvn dependency:list -Dsort=true              # 最终确定的版本清单
```

> **`dependency:analyze` 的"用到了但没声明"最有价值**：它暴露的是"你在吃某个传递依赖"，而那个依赖**随时可能因为上游升级而消失**——这类隐患在升级时会集中爆发。

### 3.3 控制手段：从"解一时之痛"到"从根上管住"

| 手段 | 写法 | 适用 |
|---|---|---|
| 排除传递依赖 | `<exclusions>` | 精确切断某条路径（**知道是哪一个**时用） |
| 声明式覆盖 | 在 `dependencyManagement` 里钉版本 | 统一管理某一组件的版本 |
| **导入 BOM** | `<type>pom</type><scope>import</scope>` | **首选**：整套组件的版本矩阵一次钉住 |
| 强制 | Gradle `resolutionStrategy.force` / Maven Enforcer | 需要绝对确定时 |

**BOM 是这里最值得掌握的一个**——Spring Boot 项目里 `spring-boot-starter-parent` 或 `spring-boot-dependencies` 就是一个巨型 BOM，它把 Spring 全家桶、Jackson、Tomcat、日志实现等几百个组件的版本一次钉死。**你要升级 Spring Boot，只需改一个版本号，其余全部联动。**

```xml
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-dependencies</artifactId>
      <version>3.5.0</version>
      <type>pom</type>
      <scope>import</scope>          <!-- 注意：这是 import，不是普通依赖 -->
    </dependency>
  </dependencies>
</dependencyManagement>
```

**顺带一个边界**：BOM 只管 `<dependencyManagement>`，**不管插件版本**。所以 `spring-boot-maven-plugin` 这类插件仍需要显式写版本（用 parent 继承时会自动带上）。

## 四、依赖冲突的三类症状 {#conflicts}

冲突在运行期的表现只有三种，**每一种都对应一个明确的根因**：

| 症状 | 含义 | 根因 |
|---|---|---|
| **`NoSuchMethodError`** | 方法在编译期存在、运行期找不到 | **运行期版本低于编译期版本**（低版本里还没有这个方法） |
| **`NoClassDefFoundError`** | 编译期有、运行期类不存在 | 依赖**根本没进包**（被 exclusion 掉了 / scope 写错 / 打包插件漏了） |
| **`AbstractMethodError`** | 接口方法没有实现 | **接口与实现在两个版本上**（接口升级加了方法，实现还是旧的） |
| **`LinkageError` / `IncompatibleClassChangeError`** | 类结构不兼容 | 同一个类被两个类加载器加载、或字段由静态变实例 |

> **`NoSuchMethodError` 有一条非常好用的判据**：看报错信息里的**类全名与版本线索**。出错方法"明明在 IDE 里能点进去"，说明 IDE 用的是**编译期依赖树**，而运行用的是**打包后的实际依赖**——两者不一致。**先跑 `dependency:tree` 找出实际打进包里的版本，再看它和你编译时用的是不是同一个。**

**定位流程**（从症状倒推到声明）：

```
① 看报错的类全名 → 确定是哪个构件（groupId 通常能从包名反推）
② mvn dependency:tree -Dincludes=<groupId>:<artifactId> → 看有几条路径、各自版本
③ 找出"路径最短且版本低"的那一条 → 它就是赢家
④ 判断策略：
   ├─ 只需要排除这一条 → <exclusions>
   ├─ 需要统一一组组件 → 用 BOM / dependencyManagement 钉版本
   └─ 是第三方库的已知不兼容 → 看它的 release notes，别硬顶版本
```

**"升级"不是万能的**：让两个库都用一个更高的版本，前提是**那个高版本对双方都兼容**。最危险的做法是"把版本从 1.0 直接跳到 3.0"，因为大版本跨越通常伴随**破坏性变更**——这时 `NoSuchMethodError` 会变成一个更难查的 `IncompatibleClassChangeError` 或行为差异。**版本升级的范围越小越好，且必须跑测试。**

## 五、生命周期与插件 {#lifecycle}

**Maven 的构建是一串有序阶段（phase），插件负责绑定到阶段上执行。**理解这一点，就不需要背命令了。

```
clean 生命周期：  pre-clean → clean → post-clean

default 生命周期：
  validate → initialize → generate-sources → process-sources
  → generate-resources → process-resources → compile
  → process-classes → generate-test-sources → process-test-sources
  → generate-test-resources → process-test-resources → test-compile
  → process-test-classes → test → prepare-package → package
  → pre-integration-test → integration-test → post-integration-test
  → verify → install → deploy

site 生命周期：   pre-site → site → post-site → site-deploy
```

| 命令 | 实际跑到哪里 | 产出物落在哪 |
|---|---|---|
| `mvn compile` | `compile` | `target/classes/` |
| `mvn test` | `test`（会先跑完 compile 前的全部阶段） | `target/test-classes/`、`surefire-reports/` |
| `mvn package` | `package` | `target/*.jar`（**未进本地仓库**） |
| `mvn install` | `install` | 打包 + 放进 `~/.m2/repository` |
| `mvn deploy` | `deploy` | 打包 + 推到远端私服 |
| `mvn verify` | `verify` | 集成测试之后（**CI 里最该跑的阶段**） |

**三个实用点：**

1. **跑某阶段会先执行它之前的全部阶段**，所以 `mvn install` 会重新编译、重新跑测试。要跳过用 `-DskipTests`（编译测试代码但不跑）或 `-Dmaven.test.skip=true`（连测试代码都不编译——**后者更快，但会漏掉"测试代码编译不过"这类问题**）。
2. **`package` 与 `install` 的差别是"给谁用"**：本机构建只需 `package`；多模块本地联调需要 `install`（否则别的模块拉不到）。
3. **`verify` 是 CI 的推荐终点**：它包含 `package` 之后的集成测试与质量检查，而 `install` 会污染 CI 机器的本地仓库（多次构建可能命中旧产物——**这正是 [构建缓存](/cloud-native/cicd/pipeline-design#build-speed)那条"缓存错了东西是灾难"的一个实例**）。

### 插件：绑定与配置

```xml
<build>
  <plugins>
    <plugin>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-maven-plugin</artifactId>
      <executions>
        <execution>
          <goals><goal>repackage</goal></goals>   <!-- 把普通 jar 改造成可执行 fat jar -->
        </execution>
      </executions>
    </plugin>
  </plugins>
</build>
```

**`repackage` 做的事**：原来 `package` 产出的 jar 只含你自己的类；`repackage` 把它替换成"包含全部依赖 + `MANIFEST.MF` 里有 `Main-Class` 与 `Start-Class`"的可执行 jar，并把原始 jar 保留为 `*.jar.original`。

**分层 jar（layered jar）值得开启**：它把依赖、快照依赖、资源、应用代码分成不同目录，于是[Dockerfile 分层缓存](/cloud-native/cicd/pipeline-design#build-speed)能真正命中——**业务代码改了不会让依赖层失效**。这是构建速度与镜像体积两个账本同时受益的一处配置。

## 六、多模块工程：聚合与继承 {#multi-module}

**"聚合"和"继承"是两个独立的机制，只是常由同一个 POM 承担**——这是被问得最多、也最容易被混淆的一组概念：

| 机制 | 方向 | 写在谁身上 | 作用 |
|---|---|---|---|
| **聚合**（aggregation） | 父 → 子 | 父 POM 的 `<modules>` | 一次命令构建多个模块（"一起建"） |
| **继承**（inheritance） | 子 → 父 | 子 POM 的 `<parent>` | 子模块继承配置（"配置复用"） |

**关键点：两者可以分开存在。**

- 只聚合不继承：父 POM 只列 `<modules>`，子模块不写 `<parent>` —— "一起构建，但配置各写各的"；
- 只继承不聚合：子模块写 `<parent>` 指向一个不属于自己构建组的 POM —— "复用配置，但单独构建"。

**目录结构**（Java 生态最常见的一种）：

```
order-platform/                 ← 父 POM：既聚合又提供继承
├── pom.xml                     （<packaging>pom</packaging> + <modules> + <dependencyManagement>）
├── order-api/                  ← 只放 DTO 与接口，供别的服务依赖
├── order-biz/                  ← 业务实现
├── order-web/                  ← 启动模块 + 控制器
└── order-test/                 ← 测试支持（测试基类、测试数据构造器）
```

**分模块的判据不是"文件多"，而是"有没有人需要只依赖其中一部分"**：

| 拆出来的理由 | 反例（不必拆） |
|---|---|
| 别人只需要 DTO（`api` 包要独立发布） | "因为类太多了"（同一职责拆模块只增加构建复杂度） |
| 编译期不想依赖某个重组件（如把 Redis 客户端隔离） | "按 layer 平均切"（controller/service/dao 各一个模块，是最常见的过度设计） |

### 版本集中管理

**父 POM 负责三件事，子模块只写 `<groupId>:<artifactId>`，不写版本**：

```xml
<!-- 父 POM -->
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>com.example</groupId>
      <artifactId>order-api</artifactId>
      <version>${project.version}</version>   <!-- 兄弟模块用工程版本，一起升 -->
    </dependency>
    <!-- 第三方组件在这一层钉住，子模块按需声明、不写版本 -->
  </dependencies>
</dependencyManagement>

<build>
  <pluginManagement>          <!-- 注意：是 pluginManagement，不是 plugins -->
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <configuration>
          <release>17</release>
        </configuration>
      </plugin>
    </plugins>
  </pluginManagement>
</build>
```

**`<plugins>` 与 `<pluginManagement>` 的差别**和 `<dependencies>` 与 `<dependencyManagement>` 完全同构：**`*Management` 只声明"配置长什么样"，不激活；子模块要用必须显式在 `<plugins>` / `<dependencies>` 里引用。**

> **一个常见的"继承不生效"困惑**：父 POM 里写了 `<plugins>`，子模块**会**继承（`<plugins>` 是继承的）；父 POM 里写了 `<pluginManagement>`，子模块**不会**自动生效（必须显式引用）。这两条规则的差异非常容易记反，而症状是"配置写了但没跑"。

### 选择性构建

```bash
mvn -pl order-biz -am clean package     # 只构建 order-biz，以及它依赖的模块
mvn -pl order-web -amd clean package    # 构建 order-web，以及依赖它的模块
mvn -pl order-biz,order-web clean install
mvn -rf order-biz install               # 从某个模块继续（前一个失败后重跑）
```

`-am`（also make）与 `-amd`（also make dependents）是**大仓构建提速**的第一手段：几十个模块的工程，只构建变更波及的子集能省掉大部分时间。

**循环依赖**：模块 A 依赖 B、B 又依赖 A（常见于"api 模块里有实现代码"）。Maven 会直接报错，解法只有一个——**把双方共用的部分下沉到第三个模块**（`order-common`），让依赖图重新变成有向无环。这和 [Spring 循环依赖](/java/spring/spring-framework/ioc/) 的治本手段是同一个思路：**不是想办法绕过，而是找出并消灭那个环。**

## 七、可复现构建：锁定与加速 {#reproducible}

"可复现"要求**所有输入都被钉住**。依赖只是其中一项：

| 输入 | 钉住它 | 不钉住的后果 |
|---|---|---|
| **依赖版本** | BOM / `dependencyManagement`；Gradle 用锁定文件或 platform | 上游发新版后行为变化（可能无任何报错） |
| **依赖内容** | Gradle 的 verification metadata（校验和） | 私服被投毒 / 同版本内容被替换 |
| **构建工具自身** | `mvnw` / `gradlew`（Wrapper 提交进仓库） | 同事用 3.6、CI 用 3.9，插件行为不同 |
| **JDK 版本** | `maven.compiler.release` + CI 镜像固定 JDK | "本地能跑" —— 编译目标与运行 JDK 不一致 |
| **插件版本** | 在 `pluginManagement` 里全部钉住 | 插件更新后构建结果变化（**这处最常被漏**） |

**Wrapper 是最容易被跳过的一项**，但它便宜且有效：

```bash
mvn -N wrapper:wrapper -Dmaven=3.9.9      # 生成 mvnw / mvnw.cmd / .mvn/
# 之后所有人（含 CI）都用 ./mvnw 而不是 mvn
```

**Gradle 侧的对应机制**：

| 需求 | 手段 |
|---|---|
| 版本集中管理 | **version catalog**（`gradle/libs.versions.toml`），替代散落的 `ext` |
| 锁定依赖 | `dependencyLocking` + `./gradlew dependencies --write-locks` |
| 校验依赖内容 | `./gradlew --write-verification-metadata sha256` |
| 构建缓存 | `org.gradle.caching=true`（本地 + 远程构建缓存） |

**构建加速的四条主线**（与[流水线篇的缓存](/cloud-native/cicd/pipeline-design#build-speed)一致，这里是本地视角）：

| 手段 | 命令 / 配置 | 效果 |
|---|---|---|
| **只构建受影响模块** | `-pl ... -am` | 大仓收益最大 |
| **并行构建** | `-T 1C`（每核一线程） | 多模块工程接近线性提速 |
| **跳过不必要的阶段** | `-DskipTests` / `-o`（离线） | **CI 里慎用**，本地联调可用 |
| **缓存** | Gradle 构建缓存 / `mvn` 的 `~/.m2` 缓存 | 依赖下载接近归零 |

> **`-T` 有个前提**：模块之间不能有"隐式依赖"（比如通过共享目录写文件）。真正独立的模块才能并行，否则会出现**只在并行构建时才失败的偶发 bug**——这类问题排查成本极高，因为它在本地单线程下永远不复现。

**最后一条纪律**：**不要在 pom 里写"依赖中央仓库的某个时间点"这类隐式约束**（版本区间、`LATEST`、`RELEASE` 关键字）。它们今天能跑通，明天可能拉到不同内容，而且**不会有任何提示**——这正是[流水线篇](/cloud-native/cicd/pipeline-design#artifacts)里"缓存了不该缓存的东西，它会安静地通过所有测试"同一个形状的问题。

## 八、面试口径 {#interview}

| # | 问题 | 一句话答案 |
|---|---|---|
| 1 | Maven 的依赖调解规则？ | **两步**：① **路径最短优先**——离你更近的声明胜出；② 路径等长时**先声明者优先**。所以"我在 pom 里写了 2.0，为什么运行时是 1.0"的答案通常是"你的声明路径比传递路径更长，被忽略了" |
| 2 | Gradle 和 Maven 的冲突解决区别？ | **默认规则相反**：Maven 是**路径最短优先**，Gradle 是**版本最高优先**。所以同一份依赖图，两个工具可能产出不同结果——**从 Maven 迁到 Gradle 时，必须重新跑一遍 `dependency:tree` 式的核对** |
| 3 | `NoSuchMethodError` 怎么排查？ | 含义是"编译期有这个方法、运行期没有"，根因通常是**运行期版本低于编译期版本**。步骤：看报错的类全名 → `mvn dependency:tree -Dincludes=g:a` 找出实际打进包的版本 → 定位那条"路径最短且版本低"的路径 → 用 `<exclusions>` 切断或用 BOM 统一 |
| 4 | `NoClassDefFoundError` 和 `NoSuchMethodError` 的区别？ | 前者是**类整体不存在**（依赖没进包：被 exclude / scope 写错 / 打包漏了）；后者是**类在、方法不在**（版本被顶掉了）。一个查"有没有"，一个查"哪个版本" |
| 5 | 聚合和继承有什么区别？ | **聚合是父 POM 用 `<modules>` 组织"一起构建"（父 → 子）；继承是子模块用 `<parent>` 复用配置（子 → 父）**。两者独立，只是常由同一个 POM 承担。只聚合不继承是合法的 |
| 6 | `<dependencies>` 和 `<dependencyManagement>` 的区别？ | `dependencyManagement` **只声明版本与配置，不引入依赖**；子模块声明依赖时可以不写版本，从管理段继承。`<plugins>` 与 `<pluginManagement>` 同构——**但注意 `<plugins>` 是会被子模块继承并执行的，`<pluginManagement>` 不会** |
| 7 | BOM 是什么，解决什么问题？ | 一份"版本矩阵"POM，用 `<type>pom</type><scope>import</scope>` 导入。它一次钉住一整套组件的版本（Spring Boot 的 `spring-boot-dependencies` 就是），使升级变成"改一个版本号"。**注意它只管依赖，不管插件版本** |
| 8 | `package`、`install`、`deploy` 的区别？ | 依次是：打包到 `target/`、再放进本地仓库 `~/.m2`、再推到远端私服。**CI 通常停在 `verify`**——`install` 会污染 CI 机器的本地仓库，可能让后续构建命中"上一轮构建的产物" |
| 9 | 什么是可复现构建，要锁哪些东西？ | 要锁**五项**：依赖版本（BOM/锁定文件）、依赖内容（校验和）、**构建工具自身**（`mvnw`/`gradlew`）、JDK 版本、**插件版本**（最常被漏）。判据是"换个干净环境重建，产物与依赖集合完全一致" |
| 10 | 怎么验证项目没有"隐形依赖"？ | `mvn -Dmaven.repo.local=/tmp/m2-fresh clean package`——用空仓库重建。**能构建成功，才说明 pom 是完整的**；失败则说明有依赖只是"恰好存在于你的本地仓库" |
| 11 | 多模块工程怎么加速构建？ | 四条：`-pl <模块> -am` 只构建受影响子集、`-T 1C` 并行、构建缓存与依赖缓存、避免不必要的阶段（如本地不跑集成测试）。**并行有前提**：模块间不能有隐式依赖，否则会出现只在并行时才复现的偶发失败 |
| 12 | 为什么生产环境不能用 SNAPSHOT？ | 它是**浮动版本**：同一坐标的内容会变，且本地仓库里那份可能是几天前的（要 `-U` 才更新）。于是"测试通过的版本"与"上线的版本"不是同一份产物——与[镜像不能用 `latest`](/cloud-native/cicd/pipeline-design#tag-strategy) 是同一条理由 |

> **这一篇在[成长路线](/projects/architect-roadmap/)里的位置**：它是 [L1 开发](/projects/architect-roadmap/developer/)的"开发第一天就要用"的清单里的一项。L1 只需要会**看 `dependency:tree` 并解决冲突**；L2 再往上要能设计**多模块的依赖边界与版本治理**（见 [L2 高级开发](/projects/architect-roadmap/senior/)）。

> 回到：[Java 基础 · 导览](/java/basics/)　|　相关：[流水线设计：构建提速与制品治理](/cloud-native/cicd/pipeline-design#build-speed)　|　相关：[Spring Boot 的自动配置与依赖管理](/java/spring/spring-boot/)
