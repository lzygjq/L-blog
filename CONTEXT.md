# CONTEXT.md —— 项目上下文与跨设备协同约定

> 本文件随仓库走（GitHub 私有仓库 L-blog）。任何一台电脑、任何新会话接手本项目时，**先读本文件**，即可恢复全部工作约定，不依赖本机记忆或历史会话。

## 一、项目定位

- 站点名：**「L知识库」**，以第三方视角对外展示（不暴露个人履历/公司名）。
- 核心价值：沉淀可验证产出（ADR/压测报告/架构图）—— 落位 `docs/projects/toolkit/`，方法层与项目案例分离，三篇均按**黄金圈（Why → What → How）**组织。
- 技术栈：VitePress + Markdown + Git。

## 二、目录约定

- 9 大板块：`java` / `database` / `middleware` / `bigdata` / `cloud-native` / `ai` / `projects`（项目实战，含 `toolkit/` 产出工具方法层）/ `interview` / `about`（关于本站）。
- 每个板块目录放 `index.md` 作导览页；目录名英文、标题中文、命名统一 4 字（云原生例外）。
- 正文在 `docs/` 下，站点配置在 `docs/.vitepress/`。

## 三、内容原则（改稿红线）

1. **第三方视角、脱敏**：宝能/hobbit-cloud/property-saas/具体公司与人名/内部数据（如 6 万人规模）一律改通用表述。
2. **不整站搬运**三方课程或 pdai 内容，按框架自写原创。
3. 主色调蓝色（不用绿色），设计稿迭代到满意为止。

## 四、构建与验证（本机限制，各机通用）

- **构建请用户在本机终端执行** `npm run build`（沙箱内 safe-delete 拦截会导致构建跑不完）。
- VitePress dev server 对任意路径都返回 200（SPA shell），**curl 不能用于验证内容**；须用 puppeteer-core 驱动系统 Chrome 抽查 DOM。
- dev 服务用户自己终端跑（`npm run dev`），AI 不探活/重启，写完代码直接交付。
- 验证强度=轻量：关键功能断言即可，不截图不读图，视觉用户自己看。

## 五、Git 约定

- 远端：`git@github.com:lzygjq/L-blog.git`（GitHub 私有仓库，SSH 直连，不依赖浏览器/代理）。
- SSH 密钥：本机为 `~/.ssh/id_ed25519_github`（ssh config 已配 Host github.com）。**新机器需自建密钥并添加到 GitHub 账号（554511322@qq.com / lzygjq）**。
- git 写操作后可能残留 `.git/index.lock`，提交前先 `mv .git/index.lock /tmp/`。
- AI 完成修改后自动 commit + push（成本低、双机/多机同步必需）。

## 六、跨设备无缝对接（三机协同）

| 数据 | 同步方式 |
|------|---------|
| 博客代码/文章 | 本仓库（Git push/pull，唯一真源） |
| 长期记忆 MEMORY.md | `workbuddy-sync` 私有仓库（`memory/` 目录，开工 pull、收工 push） |
| WorkBuddy skills | 同上（`skills/` 目录） |
| API Key（WEREAD_API_KEY 等） | 各机手动配置一次，不入库 |
| 历史会话 | 换机后用 WorkBuddy 内 `conversation_search`（30 天窗口、返回结构化摘要）；更早/全文以本文件 + MEMORY.md 为准 |
| 重大决策/清单 | 资料库（账号级，如《设备清单与三机分工评估》） |

**新机首次接入清单（以 Mac mini 为例）**：
1. 装 WorkBuddy 并登录同一账号（会话云端检索自动生效）。
2. 生成 SSH 密钥并添加到 GitHub；`git clone git@github.com:lzygjq/L-blog.git` 到统一路径 **`~/WorkBuddy/tech-blog`**。
3. 克隆 `workbuddy-sync`，把 `memory/MEMORY.md` 拷到 `~/.workbuddy/MEMORY.md`、skills 拷到 `~/.workbuddy/skills/`。
4. 装 Node 22+（arm64），`npm install` 装依赖。
5. 修改前先读本文件 + `git pull`。

**日常切换电脑的流程**：旧机收工 = AI 自动 `git push` + workbuddy-sync push；新机开工 = `git pull` 两个仓库 → 读 CONTEXT.md → 继续干活。会话上下文不需要"搬"，用 conversation_search 检索摘要 + 本文件恢复约定即可。
