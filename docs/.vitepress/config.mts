import { defineConfig } from 'vitepress'
import { buildSidebar } from './sidebar.mjs'

// 站点配置：导航 + 全局侧边栏
// 约定：目录名英文、侧边栏标题中文；每个板块 index.md 为导览页
// 侧边栏由 sidebar.mjs 扫目录自动生成（新增 md 落对目录 + 重启 dev 即自动出现）：
//   - { text, link }            静态条目
//   - { text, dir }             目录型条目：index 为条目，目录内其他 md 自动追加为兄弟条目
//   - { text, dir, indexLabel } 折叠子组：整个目录扫描展开，index 显示为 indexLabel
//   - { text, children }        手写子组
// 自动命名优先级：frontmatter.sidebar > sidebar.mjs OVERRIDES > frontmatter.title > H1 去英文括号 > 文件名
// 排序：frontmatter.order > date > 文件名

const sidebarSpec = [
  {
    text: 'Java 核心',
    children: [
      { text: '板块导览', link: '/java/' },
      { text: 'Java 基础', dir: 'java/basics' },
      { text: '并发与 JUC', dir: 'java/concurrent' },
      { text: 'JVM', dir: 'java/jvm' },
      {
        text: 'Spring 生态',
        children: [
          { text: '导览', link: '/java/spring/' },
          { text: 'Spring Framework', dir: 'java/spring/spring-framework', indexLabel: '导览' },
          { text: 'Spring Boot', dir: 'java/spring/spring-boot' },
          { text: 'Spring Cloud', dir: 'java/spring/spring-cloud' }
        ]
      },
      {
        text: '设计模式',
        children: [
          { text: '导览', link: '/java/design-patterns/' },
          { text: '设计原则与 UML', dir: 'java/design-patterns/principles' },
          { text: '创建型（5 种）', dir: 'java/design-patterns/creational', indexLabel: '导览' },
          { text: '结构型（7 种）', dir: 'java/design-patterns/structural', indexLabel: '导览' },
          { text: '行为型（11 种）', dir: 'java/design-patterns/behavioral', indexLabel: '导览' }
        ]
      }
    ]
  },
  {
    text: '数据存储',
    children: [
      { text: '板块导览', link: '/database/' },
      { text: 'MySQL', dir: 'database/mysql' },
      { text: 'Redis 缓存', dir: 'database/redis' },
      { text: '分库分表', dir: 'database/sharding' }
    ]
  },
  {
    text: '消息队列',
    children: [
      { text: '板块导览', link: '/middleware/' },
      { text: 'RabbitMQ', dir: 'middleware/rabbitmq' },
      { text: 'RocketMQ', dir: 'middleware/rocketmq' },
      { text: '物联网 MQTT', dir: 'middleware/mqtt' }
    ]
  },
  {
    text: '数据仓库',
    children: [
      { text: '板块导览', link: '/bigdata/' },
      { text: 'Canal 数据同步', dir: 'bigdata/canal' },
      { text: 'Doris 数仓', dir: 'bigdata/doris' },
      { text: 'Lakehouse：Iceberg / MinIO / 冷热分层', dir: 'bigdata/lakehouse' },
      { text: '数仓分层建模', dir: 'bigdata/warehouse-design' }
    ]
  },
  {
    text: '云原生',
    children: [
      { text: '板块导览', link: '/cloud-native/' },
      { text: 'Docker', dir: 'cloud-native/docker' },
      { text: 'Kubernetes', dir: 'cloud-native/kubernetes' },
      { text: 'CI/CD', dir: 'cloud-native/cicd' },
      { text: '监控与可观测', dir: 'cloud-native/observability' }
    ]
  },
  {
    text: 'AI 应用',
    children: [
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
    text: '项目实战',
    children: [
      { text: '板块导览', link: '/projects/' },
      {
        text: '绩效系统',
        children: [
          { text: '导览', link: '/projects/perf-system/' },
          { text: '十万人组织架构同步', dir: 'projects/perf-system/org-sync-100k' },
          { text: '高峰期并发填报', dir: 'projects/perf-system/peak-filling' },
          { text: '多级审批实时推送', dir: 'projects/perf-system/approval-push' },
          { text: '报表预计算', dir: 'projects/perf-system/report-precompute' }
        ]
      },
      {
        text: '智慧物业 SaaS',
        children: [
          { text: '导览', link: '/projects/property-saas/' },
          { text: '微服务 → K8s 云原生演进', dir: 'projects/property-saas/microservice-to-k8s' },
          { text: '大数据架构方案 → 数仓', dir: 'projects/property-saas/data-warehouse' }
        ]
      }
    ]
  },
  { text: '面试专题', children: [{ text: '板块导览', link: '/interview/' }] },
  { text: '关于本站', children: [{ text: '站点说明', link: '/about/' }] }
]

export default defineConfig({
  lang: 'zh-CN',
  title: 'L知识库',
  description: 'Java 后端知识库 —— 语言与框架原理 / 数据存储与消息队列 / 云原生与数据仓库 / AI 应用，附项目实战难点复盘',
  head: [['link', { rel: 'icon', href: '/favicon.svg' }]],

  markdown: {
    lineNumbers: true,
    theme: 'github-light'
  },

  themeConfig: {
    siteTitle: 'L知识库',
    nav: [
      { text: '首页', link: '/' },
      { text: 'Java 核心', link: '/java/' },
      { text: '数据存储', link: '/database/' },
      { text: '消息队列', link: '/middleware/' },
      { text: '数据仓库', link: '/bigdata/' },
      { text: '云原生', link: '/cloud-native/' },
      { text: 'AI 应用', link: '/ai/' },
      { text: '项目实战', link: '/projects/' },
      { text: '面试专题', link: '/interview/' },
      { text: '关于本站', link: '/about/' }
    ],

    sidebar: buildSidebar(sidebarSpec),

    socialLinks: [{ icon: 'github', link: 'https://github.com/your-name/tech-blog' }],

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
