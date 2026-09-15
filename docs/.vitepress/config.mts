import { defineConfig } from 'vitepress'
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
    prefix: '/java/',
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
          { text: 'Java 虚拟机', dir: 'java/jvm', group: true }
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
              { text: 'MyBatis', dir: 'java/spring/spring-framework/mybatis' }
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
      }
    ]
  },
  {
    // 数据存储 + 消息队列合并板块：两个 URL 前缀共用同一份侧边栏
    prefix: ['/database/', '/middleware/'],
    items: [
      { text: '数据存储导览', link: '/database/' },
      { text: '消息队列导览', link: '/middleware/' },
      {
        text: '数据存储',
        children: [
          { text: 'MySQL', dir: 'database/mysql', group: true },
          { text: 'Redis', dir: 'database/redis', group: true },
          { text: '分库分表', dir: 'database/sharding' },
          { text: 'PostgreSQL（规划中）' }
        ]
      },
      {
        text: '消息队列',
        children: [
          { text: 'RabbitMQ', dir: 'middleware/rabbitmq', group: true },
          { text: 'Kafka', dir: 'middleware/kafka', group: true },
          { text: 'RocketMQ', dir: 'middleware/rocketmq' },
          { text: '物联网 MQTT', dir: 'middleware/mqtt' },
          { text: 'ELK（规划中）' }
        ]
      }
    ]
  },
  {
    prefix: '/frontend/',
    items: [
      { text: '板块导览', link: '/frontend/' },
      { text: '小程序起步', dir: 'frontend/miniprogram-start' },
      { text: '模板与样式', dir: 'frontend/miniprogram-template' },
      { text: '导航与生命周期', dir: 'frontend/miniprogram-logic' },
      { text: '组件化与工程化', dir: 'frontend/miniprogram-component' },
      { text: 'uni-app 核心', dir: 'frontend/uniapp-core' },
      { text: '跨端项目实战', dir: 'frontend/uniapp-practice' },
      { text: '发布与多端打包', dir: 'frontend/release' }
    ]
  },
  {
    prefix: '/bigdata/',
    items: [
      { text: '板块导览', link: '/bigdata/' },
      { text: 'Canal 数据同步', dir: 'bigdata/canal' },
      { text: 'Doris 数仓', dir: 'bigdata/doris' },
      { text: 'Lakehouse / 冷热分层', dir: 'bigdata/lakehouse' },
      { text: '数仓分层建模', dir: 'bigdata/warehouse-design' }
    ]
  },
  {
    prefix: '/cloud-native/',
    items: [
      { text: '板块导览', link: '/cloud-native/' },
      { text: 'Docker', dir: 'cloud-native/docker' },
      { text: 'Kubernetes', dir: 'cloud-native/kubernetes' },
      { text: 'CI/CD', dir: 'cloud-native/cicd' },
      { text: '监控与可观测', dir: 'cloud-native/observability' }
    ]
  },
  {
    prefix: '/ai/',
    items: [
      { text: '板块导览', link: '/ai/' },
      {
        text: 'AI 辅助研发',
        children: [
          { text: 'Vibe Coding', dir: 'ai/vibe-coding' },
          { text: 'Agent 与 Harness', dir: 'ai/agent-harness' }
        ]
      },
      {
        text: 'AI 能力集成',
        children: [
          { text: 'Spring AI', dir: 'ai/spring-ai' },
          { text: 'Spring AI Alibaba', dir: 'ai/spring-ai-alibaba' },
          { text: '数字人导览', dir: 'ai/digital-human' }
        ]
      }
    ]
  },
  {
    prefix: '/projects/',
    items: [
      { text: '板块导览', link: '/projects/' },
      { text: '架构师路线图', dir: 'projects/architect-roadmap' },
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
        text: '绩效系统',
        link: '/projects/perf-system/',
        children: [
          { text: '十万人组织架构同步', dir: 'projects/perf-system/org-sync-100k' },
          { text: '高峰期并发填报', dir: 'projects/perf-system/peak-filling' },
          { text: '多级审批实时推送', dir: 'projects/perf-system/approval-push' },
          { text: '报表预计算', dir: 'projects/perf-system/report-precompute' }
        ]
      },
      {
        text: '智慧物业 SaaS',
        link: '/projects/property-saas/',
        children: [
          { text: '微服务 → K8s 云原生演进', dir: 'projects/property-saas/microservice-to-k8s' },
          { text: '大数据架构方案 → 数仓', dir: 'projects/property-saas/data-warehouse' }
        ]
      }
    ]
  },
  {
    prefix: '/interview/',
    items: [{ text: '板块导览', link: '/interview/' }]
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

export default defineConfig({
  base,
  lang: 'zh-CN',
  title: 'L知识库',
  description: 'Java 后端与大前端知识库 —— 语言与框架原理 / 数据存储与消息队列 / 云原生与数据仓库 / 跨端开发 / AI 应用，附项目实战难点复盘',
  head: [['link', { rel: 'icon', href: base + 'favicon.svg' }]],

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
      // 导航页是单文件 docs/nav.md（不是 nav/index.md）→ 构建产物是 nav.html，
      // 线上（GitHub Pages）实测：/L-blog/nav.html 200、/L-blog/nav 200、**/L-blog/nav/ 404**。
      // 所以 link 必须写 `/nav`（不带尾斜杠），否则「在新标签页打开」会 404
      // （站内点击走客户端路由看不出来，只有硬加载/新标签页才暴露）。
      // activeMatch 用正则前缀：该页 relativePath 规范化后是 `/nav`（无尾斜杠），
      // 精确匹配 /nav/ 永远不成立。
      { text: '导航', link: '/nav', activeMatch: '^/nav' },
      { text: 'Java', link: '/java/', activeMatch: '^/java/' },
      { text: '大前端', link: '/frontend/', activeMatch: '^/frontend/' },
      // 数据存储 + 消息队列合并入口：两个前缀下都保持高亮
      { text: '存储与消息', link: '/database/', activeMatch: '^/(database|middleware)/' },
      { text: '数据仓库', link: '/bigdata/', activeMatch: '^/bigdata/' },
      { text: '云原生', link: '/cloud-native/', activeMatch: '^/cloud-native/' },
      { text: 'AI 应用', link: '/ai/', activeMatch: '^/ai/' },
      { text: '项目实战', link: '/projects/', activeMatch: '^/projects/' },
      {
        // 下拉分组自身没有 link，高亮靠 activeMatch + 「子项是否有命中的」两条
        // （VPNavBarMenuGroup：active = isActive(自身 activeMatch) || 任一子项命中）
        text: '其他',
        activeMatch: '^/(interview|archives|about)/',
        items: [
          { text: '面试专题', link: '/interview/' },
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
