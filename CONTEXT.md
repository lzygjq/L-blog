# CONTEXT.md —— 项目上下文与跨设备协同约定

> 本文件随仓库走（GitHub 私有仓库 L-blog）。任何一台电脑、任何新会话接手本项目时，**先读本文件**，即可恢复全部工作约定，不依赖本机记忆或历史会话。

## 一、项目定位

- 站点名：**「L知识库」**，以第三方视角对外展示（不暴露个人履历/公司名）。
- 核心价值：沉淀可验证产出（ADR/压测报告/架构图）—— 落位 `docs/projects/toolkit/`，方法层与项目案例分离，三篇均按**黄金圈（Why → What → How）**组织。
- 技术栈：VitePress + Markdown + Git。

## 二、目录约定

- 11 大板块：`fundamentals`（计算机基础：计算机网络 / 操作系统 / 算法与数据结构）/ `java` / `frontend`（大前端：小程序与 uni-app）/ `database` / `middleware` / `bigdata` / `cloud-native` / `ai` / `projects`（项目实战，含 `toolkit/` 产出工具方法层）/ `interview` / `about`（关于本站）。
- **顶部导航已达 10 项上限**（导航 / 计算机基础 / Java / 大前端 / 存储与消息 / 数据仓库 / 云原生 / AI 应用 / 项目实战 / 其他）—— 后续新领域**不再加顶层项**，挂进现有板块或塞进「其他」下拉。
- 每个板块目录放 `index.md` 作导览页；目录名英文、标题中文、命名统一 4 字（云原生例外）。
- 侧边栏（`docs/.vitepress/sidebar.mjs`）：**有子项的分组默认展开、右侧带可收起的 caret**；分组标题本身即该分组的导览入口（链到目录 `index.md`），**不再单独列「导览」子条目**。新增子目录用 `{ text, dir, group: true }`，层级不超过 2 层。
- 正文在 `docs/` 下，站点配置在 `docs/.vitepress/`。

## 三、内容原则（改稿红线）

1. **第三方视角、脱敏**：宝能/hobbit-cloud/property-saas/具体公司与人名/内部数据（如 6 万人规模）一律改通用表述。
2. **不整站搬运**三方课程或 pdai 内容，按框架自写原创。
3. 主色调蓝色（不用绿色），设计稿迭代到满意为止。

## 四、构建与验证（本机限制，各机通用）

- **构建可在沙箱内直接跑**（2026-09-15 实测：184 个 md 文件、19.3s、exit 0）。构建期死链检查是最有价值的一道验证，收尾时优先跑它；若某次被 safe-delete 拦截（提示批量删除），再改由用户在本机终端执行 `npm run build`。
- VitePress dev server 对任意路径都返回 200（SPA shell），**curl 不能用于验证内容**；须用 puppeteer-core 驱动系统 Chrome 抽查 DOM。
- dev 服务用户自己终端跑（`npm run dev`），AI 不探活/重启，写完代码直接交付。
- 验证强度=轻量：关键功能断言即可，不截图不读图，视觉用户自己看。

## 五、Git 约定

- 远端：`git@github.com:lzygjq/L-blog.git`（GitHub 私有仓库，SSH 直连，不依赖浏览器/代理）。
- SSH 密钥：本机为 `~/.ssh/id_ed25519_github`（ssh config 已配 Host github.com）。**新机器需自建密钥并添加到 GitHub 账号（554511322@qq.com / lzygjq）**。
- git 写操作后可能残留 `.git/index.lock`，提交前先 `mv .git/index.lock /tmp/`。
- **AI 完成修改后默认只在本机 `git commit`，不 push 远端**（2026-09-15 用户明确要求）。
  - 本地留档是默认动作：历史可回溯、改动不会丢、跨会话可查。
  - **推远端必须由用户显式指定**（如「推送」「push 一下」「同步到远端」）。没被指定就不要推。
  - 这条**同时覆盖 `workbuddy-sync`**（记忆与 skills 仓库）—— 同样本机 commit 留档即可；
    例外是用户说「同步 L知识库」这类口令，那本身就是显式指定。
  - 需要推时一条命令即可：`git push origin main`（私有仓库不受影响，见第七节）。

## 六、跨设备无缝对接（三机协同）

| 数据 | 同步方式 |
|------|---------|
| 博客代码/文章 | 本仓库（Git push/pull，唯一真源） |
| 长期记忆 MEMORY.md | `workbuddy-sync` 私有仓库（`memory/` 目录，开工 pull；收工**默认只本机 commit**，用户说「同步」才 push） |
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

**日常切换电脑的流程**：旧机收工 = AI 本机 `commit` 留档（**默认不 push**；要跨机同步时由用户说「推送」/「同步 L知识库」，那两句是显式指令）；新机开工 = `git pull` 两个仓库 → 读 CONTEXT.md → 继续干活。会话上下文不需要"搬"，用 conversation_search 检索摘要 + 本文件恢复约定即可。

## 七、发布状态（2026-09-15 起：暂停对外）

> **这一节决定了「push 之后会不会上线」，接手时务必先看。**

- **当前（2026-09-15 22:30 实测确认）：仓库 private、Pages 已下线、自动部署已停。** 站点没写完前不对外访问。
- **三项实测证据**：线上地址 **404**、无认证调 `api.github.com/repos/lzygjq/L-blog` **404**（私有仓库匿名读不到）、`git ls-remote origin` **正常返回** → 站点确实没了，而代码读写权限完好。
- **私有仓库不影响 AI 推送代码**：`push` 走 SSH 密钥（`~/.ssh/id_ed25519_github`），鉴权对象是仓库所有者的密钥，**与仓库可见性无关** —— 需要推时可直接 `git push origin main`，不需要任何额外操作，也不需要给 AI 任何 token。**但默认仍然只 commit 不 push**（见第五节）。
- 线上地址 `https://lzygjq.github.io/L-blog/` **已 404**（GitHub Free 账号下私有仓库不支持 Pages，转 private 时站点被自动下线），以前给出去的链接会失效。
- `.github/workflows/deploy.yml` 的 `push` 触发器**已注释掉**，只剩 `workflow_dispatch` 手动入口 —— 所以**现在 push 不会再发布任何东西**，本地 `npm run dev` 照常能看。
- **写完要恢复发布，三件事一起做（缺一不可）**：① 取消 `deploy.yml` 里 `push:` 两行的注释；② Settings → Pages → Source 选 GitHub Actions；③ Settings → General → Danger Zone → 可见性改回 **Public**。
- 注意两个概念不要混：**仓库私有 ≠ 站点私有**。GitHub Pages 的站点可见性跟仓库可见性无关，个人账号只有在 Enterprise Cloud 下才有「真·私有 Pages」；Pro 只是允许从私有仓库发布，站点本身依然公开。所以「不想别人看到」的正解是**先别发布**，而不是「发布 + 藏地址」。
- 百度统计 ID 仍留在 `config.mts`（`BAIDU_TONGJI_ID`），站点下线期间不会产生任何数据，恢复发布后自动继续采集。
