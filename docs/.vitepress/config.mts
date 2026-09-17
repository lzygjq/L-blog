import { defineConfig, type HeadConfig } from 'vitepress'
import { buildSidebar } from './sidebar.mjs'

// 站点配置：导航 + 多侧边栏
// 约定：目录名英文、侧边栏标题中文；每个板块 index.md 为导览页
// 布局约定：顶部 nav = 大分类；左侧 sidebar = 当前大分类下的子分类。
// sidebar 按路径前缀（prefix）映射，只展示对应板块的子分类，避免与顶部菜单重复；
// 未命中任何前缀的页面（首页 / 导航 / 归档 / 关于）回落到 '/' → 无侧边栏。
// 侧边栏由 sidebar.mjs 扫目录自动生成（新增 md 落对目录 + 重启 dev 即自动出现）：
//   - { text, link }             静态条目
//   - { text, dir }              目录型条目：标题链到目录 index，目录内其他 md 自动追加为兄弟条目
//   - { text, dir, group: true } 可折叠分组：标题链到 index，其余 md 作子项
//   - { text, children }         手写分组（可再加 link 让标题也可点，如「Spring 生态」）
// 分组约定：凡有子项的分组都渲染折叠箭头（默认展开、点 caret 收放）；
//   标题本身即该分组的导览入口，所以**不再单独列「导览」子条目**。
// 自动命名优先级：frontmatter.sidebar > sidebar.mjs OVERRIDES > frontmatter.title > H1 去英文括号 > 文件名
// 排序：frontmatter.order > date > 文件名

// 每项：{ prefix: URL 前缀, items: 该板块的侧边栏条目 }
const sidebarSpec = [
  {
    // 计算机基础：跨栈底座（网络 / 操作系统 / 算法与数据结构）
    // 三域都已有正文（network 5 / os 5 / algorithms 7）→ 全部 group 展开
    // （若某域只剩 index.md，则应去掉 group，让它自动退化为可点击条目，避免空折叠分组）
    prefix: '/fundamentals/',
    items: [
      { text: '板块导览', link: '/fundamentals/' },
      { text: '计算机网络', dir: 'fundamentals/network', group: true },
      { text: '操作系统', dir: 'fundamentals/os', group: true },
      { text: '算法与数据结构', dir: 'fundamentals/algorithms', group: true }
    ]
  },
  {
    // 板块 ②：语言与框架 = Java + 大前端
    // 2026-09-16 由两个独立板块合并 —— 二者同属「写代码的技术栈」维度。
    // 合并只动这里的前缀数组与分组，**目录与 URL 一律不动**（零链接改动）。
    prefix: ['/java/', '/frontend/'],
    items: [
      { text: '板块导览', link: '/java/' },
      {
        // 纯逻辑分组（没有 /java/core/ 这个导览页）：标题不可点，点标题即折叠
        text: 'Java 核心',
        children: [
          // 目录内只有 index.md → 「目录型条目」自动退化为一个可点击的条目，不再多包一层
          { text: 'Java 基础', dir: 'java/basics', group: true },
          { text: 'Java 集合', dir: 'java/collections', group: true },
          { text: 'Java 并发', dir: 'java/concurrent', group: true },
          { text: 'Java 虚拟机', dir: 'java/jvm', group: true },
          { text: '测试与质量', dir: 'java/testing', group: true }
        ]
      },
      {
        // 分组标题 = 导览入口（链到 /java/spring/），故不再单独列「导览」子条目
        text: 'Spring 生态',
        link: '/java/spring/',
        children: [
          {
            // Spring 核心：标题链到导览页，下挂四块子菜单
            text: 'Spring',
            link: '/java/spring/spring-framework/',
            children: [
              // 单篇目录（只有 index.md）→ 不加 group，自动退化为一个可点击条目
              { text: 'IoC', dir: 'java/spring/spring-framework/ioc' },
              { text: 'Bean', dir: 'java/spring/spring-framework/bean', group: true },
              { text: 'AOP', dir: 'java/spring/spring-framework/aop', group: true },
              { text: 'MyBatis', dir: 'java/spring/spring-framework/mybatis' },
              // 横切能力：缓存/异步/重试/校验/序列化五篇 + 导览（多篇 → group）
              { text: '横切能力', dir: 'java/spring/spring-framework/crosscutting', group: true }
            ]
          },
          // Spring MVC 与 Spring 平级：Web 层独立成菜单
          { text: 'Spring MVC', dir: 'java/spring/spring-mvc' },
          { text: 'Spring Boot', dir: 'java/spring/spring-boot', group: true },
          { text: 'Spring Cloud', dir: 'java/spring/spring-cloud', group: true }
        ]
      },
      {
        text: '设计模式',
        link: '/java/design-patterns/',
        children: [
          { text: '设计原则与 UML', dir: 'java/design-patterns/principles' },
          { text: '创建型（5 种）', dir: 'java/design-patterns/creational', group: true },
          { text: '结构型（7 种）', dir: 'java/design-patterns/structural', group: true },
          { text: '行为型（11 种）', dir: 'java/design-patterns/behavioral', group: true }
        ]
      },
      {
        // 大前端（uni-app / 小程序）：标题即导览入口（链到 /frontend/）
        text: '大前端',
        link: '/frontend/',
        children: [
          { text: '小程序起步', dir: 'frontend/miniprogram-start' },
          { text: '模板与样式', dir: 'frontend/miniprogram-template' },
          { text: '导航与生命周期', dir: 'frontend/miniprogram-logic' },
          { text: '组件化与工程化', dir: 'frontend/miniprogram-component' },
          { text: 'uni-app 核心', dir: 'frontend/uniapp-core' },
          { text: '跨端项目实战', dir: 'frontend/uniapp-practice' },
          { text: '发布与多端打包', dir: 'frontend/release' }
        ]
      }
    ]
  },
  {
    // 板块 ③：数据与存储 = 数据库 + 搜索检索 + 大数据
    // 2026-09-16 由「存储·消息·检索」拆合而来：把消息/RPC 移出给板块 ④，
    // 把 bigdata 移入（三者同属「数据怎么存、怎么算」）。
    // 三个 URL 前缀共用同一份侧边栏 —— 这是本文件既有的合并机制（prefix 支持数组）
    prefix: ['/database/', '/search/', '/bigdata/'],
    items: [
      {
        // 标题即导览入口：链到 /database/
        text: '数据存储',
        link: '/database/',
        children: [
          { text: 'MySQL', dir: 'database/mysql', group: true },
          { text: 'Redis', dir: 'database/redis', group: true },
          { text: '分库分表', dir: 'database/sharding' },
          { text: 'PostgreSQL', dir: 'database/postgresql', group: true },
          { text: 'MongoDB', dir: 'database/mongodb', group: true }
        ]
      },
      {
        // 搜索与检索：以检索为目的的存储（Elasticsearch），既非数据库也非消息队列
        // dir + group：分组标题链到 /search/ 导览，目录内 5 篇自动成为子项（加篇零配置改动）
        text: '搜索与检索',
        dir: 'search',
        group: true
      },
      {
        // 大数据与数仓：标题链到 /bigdata/ 导览
        text: '大数据与数仓',
        dir: 'bigdata',
        group: true
      }
    ]
  },
  {
    // 板块 ④：中间件与分布式 = 消息队列/RPC + 分布式理论
    // 2026-09-16 合并 —— 二者同属「服务之间怎么通信与协同」：
    // 前者是可选的落地组件，后者是它背后的机制与算法。
    prefix: ['/middleware/', '/distributed/'],
    items: [
      {
        text: '消息队列',
        link: '/middleware/',
        children: [
          { text: 'RabbitMQ', dir: 'middleware/rabbitmq', group: true },
          { text: 'Kafka', dir: 'middleware/kafka', group: true },
          { text: 'RocketMQ', dir: 'middleware/rocketmq' },
          { text: '物联网 MQTT', dir: 'middleware/mqtt' }
        ]
      },
      {
        // RPC 与协议：与「消息队列」平级 —— RPC 不是消息队列的子集
        text: 'RPC 与协议',
        dir: 'middleware/rpc',
        group: true
      },
      {
        // 分布式理论：机制与算法视角（与 java/spring/spring-cloud/cap-base 的取舍判据、
        // database/sharding 的落地视角分工，交叉引用不复制）
        text: '分布式理论',
        dir: 'distributed',
        group: true
      },
      {
        // 分布式协调：把共识机制服务化之后的形态（与 consensus 的协议原理、
        // redis/lock-and-mq 的实现细节、high-availability 的冗余切换分工，交叉引用不复制）
        text: '分布式协调',
        dir: 'distributed/coordination',
        group: true
      }
    ]
  },
  {
    // 板块 ⑤：架构与云原生 = 云原生落地 + 架构方法论 + 高可用 + 安全
    // 2026-09-16 合并 —— 四者是一条线：设计（方法论）→ 保障（高可用）→ 落地（云原生）→ 合规（安全）
    prefix: ['/cloud-native/', '/methodology/', '/high-availability/', '/security/'],
    items: [
      {
        text: '云原生',
        link: '/cloud-native/',
        children: [
          { text: 'Docker', dir: 'cloud-native/docker' },
          { text: 'Kubernetes', dir: 'cloud-native/kubernetes' },
          { text: 'Helm', dir: 'cloud-native/helm' },
          { text: '服务网格', dir: 'cloud-native/service-mesh' },
          { text: 'CRD 与 Operator', dir: 'cloud-native/operator' },
          { text: 'CI/CD 与发布', dir: 'cloud-native/cicd', group: true },
          { text: '监控与可观测', dir: 'cloud-native/observability', group: true }
        ]
      },
      {
        // 方法论：设计方法视角（与 architecture-evolution 的演进维度、spring-cloud 的实现层、
        // middleware 的投递机制、java/testing 的执行手段分工，交叉引用不复制）
        text: '架构方法论',
        dir: 'methodology',
        group: true
      },
      {
        // 高可用：架构层视角（与 java/spring/spring-cloud/resilience 的应用层实现、
        // capacity-and-perf 的容量与防护、architecture-evolution 的单库维度分工，交叉引用不复制）
        text: '高可用',
        dir: 'high-availability',
        group: true
      },
      {
        // 安全与合规：机制与取舍视角（与 projects/property-saas/release-and-ops 的落地视角分工，交叉引用不复制）
        text: '安全与合规',
        dir: 'security',
        group: true
      }
    ]
  },
  {
    // 板块 ⑥：实战与面试 = 项目案例 + AI 应用 + 面试专题
    // 2026-09-16 合并 —— 三者同属「怎么把能力讲出来」：案例是证据，AI 是增量，面试是出口。
    prefix: ['/projects/', '/ai/', '/interview/'],
    items: [
      { text: '板块导览', link: '/projects/' },
      {
        // 四级清单页放在子目录里，而构建器扫目录**不递归**（sidebar.mjs 的 listMd 只读当前层），
        // 所以子页必须显式列在 children 里；新增级别页时在此追加。
        text: '成长路线',
        link: '/projects/architect-roadmap/',
        children: [
          { text: 'L1 开发', link: '/projects/architect-roadmap/developer/' },
          { text: 'L2 高级开发', link: '/projects/architect-roadmap/senior/' },
          { text: 'L3 架构师', link: '/projects/architect-roadmap/architect/' },
          { text: 'L4 CIO', link: '/projects/architect-roadmap/cio/' }
        ]
      },
      { text: '架构演进地图', dir: 'projects/architecture-evolution' },
      {
        // 方法层：可验证产出三件套（先读方法，再看项目案例）
        text: '产出工具',
        link: '/projects/toolkit/',
        children: [
          { text: 'ADR 架构决策记录', dir: 'projects/toolkit/adr', group: true },
          { text: '压测报告', link: '/projects/toolkit/perf-report/' },
          { text: '架构图', link: '/projects/toolkit/arch-diagram/' }
        ]
      },
      {
        // 案例层 ①：单点性能与一致性（四篇专题 = 一条数据链路的四段）
        text: '大型集团绩效系统',
        link: '/projects/perf-system/',
        children: [
          { text: '十万人组织架构同步', dir: 'projects/perf-system/org-sync-100k' },
          { text: '高峰期并发填报', dir: 'projects/perf-system/peak-filling' },
          { text: '多级审批消息实时推送', dir: 'projects/perf-system/approval-push' },
          { text: '报表预计算', dir: 'projects/perf-system/report-precompute' }
        ]
      },
      {
        // 案例层 ②：架构演进与多租户
        text: '智慧物业 SaaS',
        link: '/projects/property-saas/',
        children: [
          { text: '核心业务链路', dir: 'projects/property-saas/core-business' },
          { text: '微服务 → K8s 云原生演进', dir: 'projects/property-saas/microservice-to-k8s' },
          { text: '大数据架构方案 → 数仓', dir: 'projects/property-saas/data-warehouse' },
          { text: '容量测算与压测方案', dir: 'projects/property-saas/capacity-and-perf' },
          { text: '发布、安全与运维', dir: 'projects/property-saas/release-and-ops' }
        ]
      },
      {
        // AI 应用：标题即导览入口（链到 /ai/）。原「AI 辅助研发 / AI 能力集成」两层
        // 在合并后拍平为一层，避免侧边栏出现第四层
        text: 'AI 应用',
        link: '/ai/',
        children: [
          { text: 'Vibe Coding', dir: 'ai/vibe-coding' },
          { text: 'Agent 与 Harness', dir: 'ai/agent-harness' },
          { text: 'Spring AI', dir: 'ai/spring-ai' },
          { text: 'Spring AI Alibaba', dir: 'ai/spring-ai-alibaba' },
          { text: '数字人', dir: 'ai/digital-human', group: true }
        ]
      },
      { text: '面试专题', link: '/interview/' }
    ]
  }
]

// 前缀映射 → VitePress 多侧边栏（prefix 支持数组：多前缀共用同一份侧边栏）；
// '/' 为兜底：首页 / 导航 / 归档 / 关于等不显示侧边栏
const sidebar = Object.fromEntries([
  ...sidebarSpec.flatMap((s) =>
    (Array.isArray(s.prefix) ? s.prefix : [s.prefix]).map((p) => [p, buildSidebar(s.items)])
  ),
  ['/', []]
])

// 部署 base：GitHub Actions 上构建时仓库部署在 /L-blog/ 子路径，本地构建/dev 用根路径
const base = process.env.GITHUB_ACTIONS ? '/L-blog/' : '/'

// 百度统计（tongji.baidu.com）站点 ID —— 填 hm.js? 后面那串字符串。
// 留空 = 完全不注入脚本，站点照常构建与运行，只是没有统计数据。
// 该 ID 会明文出现在页面源码里，这是所有前端统计的共同特征，属正常；
// 但百度账号密码绝不要写进仓库。
const BAIDU_TONGJI_ID = 'a32b56a960928758f68787b9dc75ce33'

// 统计脚本只在生产构建注入：npm run dev 不带，避免本地刷新污染线上数据。
// 注意 npm run preview 服务的是生产产物、会带上脚本，自测时到百度统计后台把自己 IP 排除即可。
const analyticsHead: HeadConfig[] =
  process.env.NODE_ENV === 'production' && BAIDU_TONGJI_ID
    ? [
        [
          'script',
          {},
          `var _hmt = _hmt || [];(function(){var hm=document.createElement("script");hm.src="https://hm.baidu.com/hm.js?${BAIDU_TONGJI_ID}";var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(hm,s);})();`
        ]
      ]
    : []

export default defineConfig({
  base,
  // srcExclude 的用途：把「不该进构建产物」的页面挡在外面。
  // ⚠️ 它会**覆盖**默认值，所以 node_modules / dist 必须显式带上。
  // 历史用途（2026-09-16 已撤）：VitePress 1.6.x **不原生支持 frontmatter `draft`**
  // （那是 Nuxt 的行为），页面级 draft 只能靠 srcExclude 实现 —— 否则标了 draft 的
  // 提纲页照样进构建产物、照样出现在侧边栏，等于对外的空壳页（2026-09-16 实测确认）。
  // 「大型集团绩效系统」那组曾用 '**/perf-system/**' 这样挡过；四篇专题写完并接线后
  // 该项已移除。**将来再出现成组未成篇的目录，按同样方式临时加一行即可。**
  srcExclude: ['**/node_modules/**', '**/dist/**'],

  lang: 'zh-CN',
  title: 'L知识库',
  description: 'Java 后端与大前端知识库 —— 语言与框架原理 / 数据存储、消息队列与搜索检索 / 云原生与数据仓库 / 跨端开发 / AI 应用，附项目实战难点复盘',
  head: [
    ['link', { rel: 'icon', href: base + 'favicon.svg' }],
    ...analyticsHead
  ],

  markdown: {
    lineNumbers: true,
    theme: 'github-light'
  },

  themeConfig: {
    siteTitle: 'L知识库',
    nav: [
      // 首页不占用菜单位置：访问根路径 / 即是首页，站名（VPNavBarTitle）本身链回首页
      // activeMatch 是**正则**（VitePress 源码：isActive(path, match, asRegex=true)），
      // 不写就退化为「与 link 精确相等」——那样只有板块首页会高亮，
      // 进到任何子页面顶部大模块就灭掉。所以每个板块都要用 ^/前缀/ 的形式。
      // 2026-09-16 起导航按「6 个板块」组织：一个板块可覆盖多个物理目录前缀，
      // 与 sidebarSpec 的前缀数组一一对应（导航分组 == 侧边栏分组，两处必须同步改）。
      //
      // ⚠️ 2026-09-17 曾把「成长路线」提为导航**首项**（理由：站点两轴正交 —— 6 个板块是
      // 「领域轴（用来查）」，L1→L4 是「深度轴（用来走）」，深度轴缺常驻入口），**同日撤回**。
      // 原因：用户要的固定入口是**最右侧那条竖版工具栏**（48px，现有侧栏/目录/全屏/回顶四个按钮），
      // 不是顶部导航。→ 入口落在 `theme/components/RoadmapLink.vue`，由 RightRail 引用；
      // 此处导航恢复为「只有 6 个板块」。**别再往这里加非板块项**：顶部导航的语义就是板块。
      { text: '计算机基础', link: '/fundamentals/', activeMatch: '^/fundamentals/' },
      { text: '语言与框架', link: '/java/', activeMatch: '^/(java|frontend)/' },
      { text: '数据与存储', link: '/database/', activeMatch: '^/(database|search|bigdata)/' },
      { text: '中间件与分布式', link: '/middleware/', activeMatch: '^/(middleware|distributed)/' },
      { text: '架构与云原生', link: '/cloud-native/', activeMatch: '^/(cloud-native|methodology|high-availability|security)/' },
      {
        // 「实战与面试」= 项目案例 + AI 应用 + 面试专题。
        // （2026-09-17 曾因「成长路线」占据导航首项而需要 `projects(?!\/architect-roadmap)`
        //  负向先行断言把路线页排除掉；首项同日撤回后已不需要，恢复为普通前缀正则。）
        text: '实战与面试',
        link: '/projects/',
        activeMatch: '^/(projects|ai|interview)/'
      },
      {
        // 下拉分组自身没有 link，高亮靠 activeMatch + 「子项是否有命中的」两条
        // （VPNavBarMenuGroup：active = isActive(自身 activeMatch) || 任一子项命中）
        // 导航页是单文件 docs/nav.md（不是 nav/index.md）→ 构建产物是 nav.html，
        // 线上（GitHub Pages）实测：/L-blog/nav.html 200、/L-blog/nav 200、**/L-blog/nav/ 404**。
        // 所以 link 必须写 `/nav`（不带尾斜杠），否则「在新标签页打开」会 404
        // （站内点击走客户端路由看不出来，只有硬加载/新标签页才暴露）。
        // activeMatch 用正则前缀：该页 relativePath 规范化后是 `/nav`（无尾斜杠），
        // 精确匹配 /nav/ 永远不成立。
        text: '更多',
        activeMatch: '^/(nav|archives|about)',
        items: [
          { text: '全站导航', link: '/nav' },
          { text: '归档', link: '/archives/' },
          { text: '关于本站', link: '/about/' }
        ]
      }
    ],

    sidebar,

    socialLinks: [{ icon: 'github', link: 'https://github.com/lzygjq/L-blog' }],

    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '最后更新' },
    search: { provider: 'local', options: { translations: { button: { buttonText: '搜索文章' } } } },

    footer: {
      message: '仅供学习交流使用',
      copyright: 'Copyright © 2026 L'
    }
  }
})
