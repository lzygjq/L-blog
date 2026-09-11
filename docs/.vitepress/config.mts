import { defineConfig } from 'vitepress'

// 站点配置：导航 + 全局侧边栏
// 约定：目录名英文、侧边栏标题中文；每个板块 index.md 为导览页
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

    sidebar: [
      {
        text: 'Java 核心',
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
              {
                text: 'Spring Framework',
                collapsed: true,
                items: [
                  { text: '导览', link: '/java/spring/spring-framework/' },
                  { text: 'IoC 与生命周期', link: '/java/spring/spring-framework/ioc-container' },
                  { text: '循环依赖', link: '/java/spring/spring-framework/circular-dependency' },
                  { text: 'AOP 与代理', link: '/java/spring/spring-framework/aop' },
                  { text: '事务与传播', link: '/java/spring/spring-framework/transaction' },
                  { text: 'MyBatis 集成', link: '/java/spring/spring-framework/mybatis' }
                ]
              },
              { text: 'Spring Boot', link: '/java/spring/spring-boot/' },
              { text: 'Spring Cloud', link: '/java/spring/spring-cloud/' }
            ]
          },
          {
            text: '设计模式',
            collapsed: true,
            items: [
              { text: '导览', link: '/java/design-patterns/' },
              { text: '设计原则与 UML', link: '/java/design-patterns/principles/' },
              {
                text: '创建型（5 种）',
                collapsed: true,
                items: [
                  { text: '导览', link: '/java/design-patterns/creational/' },
                  { text: '单例模式', link: '/java/design-patterns/creational/singleton' },
                  { text: '工厂模式', link: '/java/design-patterns/creational/factory' },
                  { text: '原型模式', link: '/java/design-patterns/creational/prototype' },
                  { text: '建造者模式', link: '/java/design-patterns/creational/builder' }
                ]
              },
              {
                text: '结构型（7 种）',
                collapsed: true,
                items: [
                  { text: '导览', link: '/java/design-patterns/structural/' },
                  { text: '代理模式', link: '/java/design-patterns/structural/proxy' },
                  { text: '适配器模式', link: '/java/design-patterns/structural/adapter' },
                  { text: '装饰者模式', link: '/java/design-patterns/structural/decorator' },
                  { text: '桥接模式', link: '/java/design-patterns/structural/bridge' },
                  { text: '外观模式', link: '/java/design-patterns/structural/facade' },
                  { text: '组合模式', link: '/java/design-patterns/structural/composite' },
                  { text: '享元模式', link: '/java/design-patterns/structural/flyweight' }
                ]
              },
              {
                text: '行为型（11 种）',
                collapsed: true,
                items: [
                  { text: '导览', link: '/java/design-patterns/behavioral/' },
                  { text: '模板方法模式', link: '/java/design-patterns/behavioral/template-method' },
                  { text: '策略模式', link: '/java/design-patterns/behavioral/strategy' },
                  { text: '责任链模式', link: '/java/design-patterns/behavioral/chain-of-responsibility' },
                  { text: '命令模式', link: '/java/design-patterns/behavioral/command' },
                  { text: '状态模式', link: '/java/design-patterns/behavioral/state' },
                  { text: '观察者模式', link: '/java/design-patterns/behavioral/observer' },
                  { text: '中介者模式', link: '/java/design-patterns/behavioral/mediator' },
                  { text: '迭代器模式', link: '/java/design-patterns/behavioral/iterator' },
                  { text: '备忘录模式', link: '/java/design-patterns/behavioral/memento' },
                  { text: '访问者模式', link: '/java/design-patterns/behavioral/visitor' },
                  { text: '解释器模式', link: '/java/design-patterns/behavioral/interpreter' }
                ]
              }
            ]
          }
        ]
      },
      {
        text: '数据存储',
        collapsed: true,
        items: [
          { text: '板块导览', link: '/database/' },
          { text: 'MySQL', link: '/database/mysql/' },
          { text: 'Redis 缓存', link: '/database/redis/' },
          { text: '分库分表', link: '/database/sharding/' }
        ]
      },
      {
        text: '消息队列',
        collapsed: true,
        items: [
          { text: '板块导览', link: '/middleware/' },
          { text: 'RabbitMQ', link: '/middleware/rabbitmq/' },
          { text: 'RocketMQ', link: '/middleware/rocketmq/' },
          { text: '物联网 MQTT', link: '/middleware/mqtt/' }
        ]
      },
      {
        text: '数据仓库',
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
        text: 'AI 应用',
        collapsed: true,
        items: [
          { text: '板块导览', link: '/ai/' },
          {
            text: 'AI 辅助研发',
            collapsed: true,
            items: [
              { text: 'Vibe Coding', link: '/ai/vibe-coding/' },
              { text: 'Agent 与 Harness', link: '/ai/agent-harness/' }
            ]
          },
          {
            text: 'AI 能力集成',
            collapsed: true,
            items: [
              { text: 'Spring AI', link: '/ai/spring-ai/' },
              { text: 'Spring AI Alibaba', link: '/ai/spring-ai-alibaba/' },
              { text: '数字人导览', link: '/ai/digital-human/' },
              { text: '实时互动数字人', link: '/ai/digital-human/interactive-avatar' },
              { text: '集成清单', link: '/ai/digital-human/integration-checklist' }
            ]
          }
        ]
      },
      {
        text: '项目实战',
        collapsed: true,
        items: [
          { text: '板块导览', link: '/projects/' },
          {
            text: '绩效系统',
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
        text: '关于本站',
        collapsed: true,
        items: [{ text: '站点说明', link: '/about/' }]
      }
    ],

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
