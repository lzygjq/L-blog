import { defineConfig } from 'vitepress'

// 站点配置：导航 + 全局侧边栏
// 约定：目录名英文、侧边栏标题中文；每个板块 index.md 为导览页
export default defineConfig({
  lang: 'zh-CN',
  title: '志勇的知识体系',
  description: 'Java 后端 / 微服务与云原生 / 大数据 / AI 编程 — 个人知识沉淀与项目实战复盘',
  head: [['link', { rel: 'icon', href: '/favicon.svg' }]],

  markdown: {
    lineNumbers: true,
    theme: 'github-light'
  },

  themeConfig: {
    siteTitle: '志勇的知识体系',
    nav: [
      { text: '首页', link: '/' },
      { text: 'Java', link: '/java/' },
      { text: '数据库', link: '/database/' },
      { text: '中间件', link: '/middleware/' },
      { text: '大数据', link: '/bigdata/' },
      { text: '云原生', link: '/cloud-native/' },
      { text: 'AI 编程', link: '/ai/' },
      { text: '项目实战', link: '/projects/' },
      { text: '面试专题', link: '/interview/' },
      { text: '关于', link: '/about/' }
    ],

    sidebar: [
      {
        text: 'Java',
        collapsed: true,
        items: [
          { text: '板块导览', link: '/java/' },
          { text: 'Java 基础', link: '/java/basics/' },
          { text: '并发与 JUC', link: '/java/concurrent/' },
          { text: 'JVM', link: '/java/jvm/' },
          {
            text: 'Spring 生态',
            collapsed: true,
            items: [
              { text: '导览', link: '/java/spring/' },
              { text: 'Spring Framework 与 MyBatis', link: '/java/spring/spring-framework/' },
              { text: 'Spring Boot', link: '/java/spring/spring-boot/' },
              { text: 'Spring Cloud 微服务', link: '/java/spring/spring-cloud/' }
            ]
          },
          { text: '设计模式', link: '/java/design-patterns/' }
        ]
      },
      {
        text: '数据库',
        collapsed: true,
        items: [
          { text: '板块导览', link: '/database/' },
          { text: 'MySQL', link: '/database/mysql/' },
          { text: '分库分表', link: '/database/sharding/' }
        ]
      },
      {
        text: '中间件',
        collapsed: true,
        items: [
          { text: '板块导览', link: '/middleware/' },
          { text: 'Redis 缓存', link: '/middleware/redis/' },
          { text: 'RabbitMQ', link: '/middleware/rabbitmq/' },
          { text: 'RocketMQ', link: '/middleware/rocketmq/' },
          { text: '物联网 MQTT', link: '/middleware/mqtt/' }
        ]
      },
      {
        text: '大数据与数仓',
        collapsed: true,
        items: [
          { text: '板块导览', link: '/bigdata/' },
          { text: 'Canal 数据同步', link: '/bigdata/canal/' },
          { text: 'Doris 数仓', link: '/bigdata/doris/' },
          { text: 'Lakehouse：Iceberg / MinIO / 冷热分层', link: '/bigdata/lakehouse/' },
          { text: '数仓分层建模', link: '/bigdata/warehouse-design/' }
        ]
      },
      {
        text: '云原生',
        collapsed: true,
        items: [
          { text: '板块导览', link: '/cloud-native/' },
          { text: 'Docker', link: '/cloud-native/docker/' },
          { text: 'Kubernetes', link: '/cloud-native/kubernetes/' },
          { text: 'CI/CD', link: '/cloud-native/cicd/' },
          { text: '监控与可观测', link: '/cloud-native/observability/' }
        ]
      },
      {
        text: 'AI 编程与 Agent',
        collapsed: true,
        items: [
          { text: '板块导览', link: '/ai/' },
          { text: 'Vibe Coding', link: '/ai/vibe-coding/' },
          { text: 'Agent 与 Harness', link: '/ai/agent-harness/' },
          { text: 'Spring AI', link: '/ai/spring-ai/' },
          { text: 'Spring AI Alibaba', link: '/ai/spring-ai-alibaba/' }
        ]
      },
      {
        text: '项目实战',
        collapsed: true,
        items: [
          { text: '板块导览', link: '/projects/' },
          {
            text: '绩效系统（6 万人）',
            collapsed: true,
            items: [
              { text: '导览', link: '/projects/perf-system/' },
              { text: '十万人组织架构同步', link: '/projects/perf-system/org-sync-100k/' },
              { text: '高峰期并发填报', link: '/projects/perf-system/peak-filling/' },
              { text: '多级审批消息实时推送', link: '/projects/perf-system/approval-push/' },
              { text: '报表预计算', link: '/projects/perf-system/report-precompute/' }
            ]
          },
          {
            text: '智慧物业 SaaS',
            collapsed: true,
            items: [
              { text: '导览', link: '/projects/property-saas/' },
              { text: '微服务 → K8s 云原生演进', link: '/projects/property-saas/microservice-to-k8s/' },
              { text: '大数据架构方案 → 数仓', link: '/projects/property-saas/data-warehouse/' }
            ]
          }
        ]
      },
      {
        text: '面试专题',
        collapsed: true,
        items: [{ text: '板块导览', link: '/interview/' }]
      },
      {
        text: '关于',
        collapsed: true,
        items: [{ text: '关于本站', link: '/about/' }]
      }
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/your-name/tech-blog' }],

    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '最后更新' },
    search: { provider: 'local', options: { translations: { button: { buttonText: '搜索文章' } } } },

    footer: {
      message: '仅供学习交流使用',
      copyright: 'Copyright © 2026 志勇'
    }
  }
})
