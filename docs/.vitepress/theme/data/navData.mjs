// 开发者导航数据：内容参考 pdai.tech 开发百宝箱 + cxy521（程序员521）分类体系
// 结构：categories[] { id, icon, title, desc?, virtual?, items[] { name, desc, url, hot?, icon? } }
// icon 字段可选：站点 /favicon.ico 直连失败时手动指定真实图标地址
// 维护约定：只改这个文件即可增删导航条目，页面自动渲染
// 「高频常用」是 virtual 分类：不再静态渲染，仅作为默认收藏来源（hot: true 的条目）；
//   用户在页面上点星标/拖拽排序后，选择保存在浏览器 localStorage（key: nav-favorites）

export const navCategories = [
  {
    id: 'hot',
    icon: '⭐',
    title: '高频常用',
    desc: '日常开发最常打开的入口，精选置顶',
    virtual: true,
    items: [
      { name: 'GitHub', desc: '全球最大的代码托管与开源协作平台', url: 'https://github.com', hot: true },
      { name: 'Gitee 码云', desc: '开源中国旗下代码托管，国内访问快', url: 'https://gitee.com', hot: true },
      { name: 'Stack Overflow', desc: '全球最大程序员问答社区，报错先搜它', url: 'https://stackoverflow.com', icon: 'https://cdn.sstatic.net/Sites/stackoverflow/Img/favicon.ico', hot: true },
      { name: 'Maven 仓库检索', desc: '查依赖坐标与版本，后端高频必备', url: 'https://mvnrepository.com', hot: true },
      { name: 'DeepSeek', desc: '国产大模型对话助手，代码与技术问答', url: 'https://chat.deepseek.com', icon: 'https://fe-static.deepseek.com/chat/favicon.svg', hot: true },
      { name: 'OSChina 开源中国', desc: '开源资讯与国内开源社区', url: 'https://www.oschina.net', hot: true },
      { name: '掘金', desc: '面向开发者的内容社区，技术干货多', url: 'https://juejin.cn', hot: true },
      { name: 'Spring 官方文档', desc: 'Spring Boot / Cloud 项目文档总入口', url: 'https://spring.io/projects', icon: 'https://spring.io/favicon-32x32.png', hot: true },
      { name: 'ToolFu 工具箱', desc: 'JSON 格式化、正则、编解码等综合工具箱', url: 'https://tool.lu', hot: true },
      { name: 'iconfont', desc: '阿里巴巴矢量图标库，找图标首选', url: 'https://www.iconfont.cn', hot: true },
      { name: '菜鸟教程', desc: '语法速查与入门教程大全', url: 'https://www.runoob.com', hot: true }
    ]
  },
  {
    id: 'ai',
    icon: '🤖',
    title: 'AI 工具',
    desc: '对话助手 / AI 编程 / 绘图与视频，参考 cxy521 AI 专区',
    items: [
      { name: 'DeepSeek', desc: '国产大模型对话助手，代码与技术问答', url: 'https://chat.deepseek.com', icon: 'https://fe-static.deepseek.com/chat/favicon.svg' },
      { name: 'ChatGPT', desc: 'OpenAI 出品，全球标杆大模型对话助手', url: 'https://chatgpt.com' },
      { name: 'Claude', desc: 'Anthropic 出品，长文本与代码能力强', url: 'https://claude.ai' },
      { name: 'Kimi', desc: '月之暗面出品，长上下文中文助手', url: 'https://kimi.moonshot.cn' },
      { name: '通义千问', desc: '阿里出品，配套 Spring AI Alibaba 生态', url: 'https://tongyi.aliyun.com' },
      { name: '豆包', desc: '字节出品，日常问答与写作', url: 'https://www.doubao.com' },
      { name: 'Gemini', desc: 'Google 出品，多模态能力突出', url: 'https://gemini.google.com' },
      { name: 'GitHub Copilot', desc: '代码补全与结对编程的鼻祖', url: 'https://github.com/features/copilot' },
      { name: 'Cursor', desc: 'AI 原生代码编辑器，仓库级上下文', url: 'https://www.cursor.com' },
      { name: '通义灵码', desc: '阿里出品 AI 编程助手，IDEA 插件', url: 'https://lingma.aliyun.com' },
      { name: '腾讯 CodeBuddy', desc: '腾讯云 AI 编程与全栈交付助手', url: 'https://copilot.tencent.com' },
      { name: '即梦 AI', desc: '字节出品 AI 绘图与视频生成', url: 'https://jimeng.jianying.com' },
      { name: '可灵 AI', desc: '快手出品 AI 视频生成', url: 'https://klingai.kuaishou.com' },
      { name: 'Midjourney', desc: 'AI 绘图标杆，出图质量高', url: 'https://www.midjourney.com' },
      { name: '百度智能云数字人', desc: '数字人平台，2D/3D 数字人视频生成', url: 'https://cloud.baidu.com/product/digitalhuman' },
      { name: 'AI 工具集', desc: '收录 1500+ AI 工具的导航大全', url: 'https://ai-bot.cn' }
    ]
  },
  {
    id: 'git',
    icon: '🗂️',
    title: '代码托管',
    desc: 'Git 仓库、CI/CD 与协作平台',
    items: [
      { name: 'GitHub', desc: '开源及私有项目托管平台，生态最全', url: 'https://github.com' },
      { name: 'Gitee 码云', desc: '国内代码托管，私有仓库免费额度高', url: 'https://gitee.com' },
      { name: 'Coding', desc: '腾讯云一站式 DevOps 研发平台', url: 'https://coding.net' },
      { name: 'GitLab', desc: '可自建的开源 DevOps 平台', url: 'https://gitlab.com' },
      { name: 'Gitee 开源推荐', desc: 'Gitee 优质开源项目发现页', url: 'https://gitee.com/explore/all' },
      { name: 'Git 官方文档', desc: 'Git 命令与原理权威文档（含中文）', url: 'https://git-scm.com/book/zh/v2' }
    ]
  },
  {
    id: 'community',
    icon: '💬',
    title: '技术社区',
    desc: '问答、博客与开源资讯',
    items: [
      { name: 'Stack Overflow', desc: '程序相关 IT 技术问答第一站', url: 'https://stackoverflow.com', icon: 'https://cdn.sstatic.net/Sites/stackoverflow/Img/favicon.ico' },
      { name: 'CSDN', desc: '国内最大 IT 技术社区与博客平台', url: 'https://www.csdn.net' },
      { name: '博客园', desc: '老牌开发者博客家园', url: 'https://www.cnblogs.com' },
      { name: '掘金', desc: '面向互联网技术人的内容平台', url: 'https://juejin.cn' },
      { name: 'SegmentFault 思否', desc: '开发者技术问答与专栏社区', url: 'https://segmentfault.com' },
      { name: 'OSChina 开源中国', desc: '开源资讯与国内开源社区', url: 'https://www.oschina.net' },
      { name: 'InfoQ', desc: '架构与工程实践深度内容', url: 'https://www.infoq.cn' },
      { name: 'V2EX', desc: '创意工作者社区，技术氛围浓', url: 'https://v2ex.com' }
    ]
  },
  {
    id: 'backend',
    icon: '☕',
    title: '后端开发（Java）',
    desc: '框架文档、构建工具与规范',
    items: [
      { name: 'Spring Projects', desc: 'Spring 全家桶项目入口', url: 'https://spring.io/projects', icon: 'https://spring.io/favicon-32x32.png' },
      { name: 'Spring Boot 文档', desc: 'Spring Boot Reference（含中文版）', url: 'https://spring.io/projects/spring-boot', icon: 'https://spring.io/favicon-32x32.png' },
      { name: 'Spring Cloud 文档', desc: '微服务框架官方文档', url: 'https://spring.io/projects/spring-cloud', icon: 'https://spring.io/favicon-32x32.png' },
      { name: 'MyBatis', desc: '持久层框架官方中文文档', url: 'https://mybatis.org/mybatis-3/zh/index.html' },
      { name: 'MyBatis Plus', desc: '只做增强不做改变的字段自动映射增强包', url: 'https://baomidou.com' },
      { name: 'Maven 官方文档', desc: '构建生命周期与 POM 配置文档', url: 'https://maven.apache.org/guides/index.html' },
      { name: 'Gradle 文档', desc: '灵活的构建工具官方文档', url: 'https://docs.gradle.org/current/userguide/userguide.html' },
      { name: 'Jackson / fastjson2', desc: 'fastjson2 GitHub 仓库与文档', url: 'https://github.com/alibaba/fastjson2' },
      { name: 'Alibaba Java 规约', desc: '《Java 开发手册（嵩山版）》专栏', url: 'https://github.com/alibaba/p3c' },
      { name: 'Java API 搜索', desc: '不知道某个类怎么用？搜 Java 代码示例', url: 'https://www.programcreek.com/java-api-examples/index.php' }
    ]
  },
  {
    id: 'db',
    icon: '🗄️',
    title: '数据库与中间件',
    desc: '存储、消息队列与数仓官方资源',
    items: [
      { name: 'MySQL 文档', desc: '官方参考手册（含中文版）', url: 'https://dev.mysql.com/doc/' },
      { name: 'Redis 文档', desc: '命令速查与数据结构文档', url: 'https://redis.io/docs/latest/' },
      { name: 'Apache RocketMQ', desc: '消息队列官方文档（Apache）', url: 'https://rocketmq.apache.org/docs/quickStart/01quickstart/' },
      { name: 'Apache Kafka', desc: '分布式流处理平台官方文档', url: 'https://kafka.apache.org/documentation/' },
      { name: 'RabbitMQ Tutorials', desc: '六大消息模型官方教程', url: 'https://www.rabbitmq.com/getstarted.html' },
      { name: 'Nacos', desc: '注册中心与配置中心官方文档', url: 'https://nacos.io/docs/latest/overview/' },
      { name: 'Canal', desc: 'MySQL binlog 增量订阅与同步组件', url: 'https://github.com/alibaba/canal' },
      { name: 'Apache Doris', desc: '实时数仓官方文档（中文友好）', url: 'https://doris.apache.org/zh-CN/docs/get-started/what-is-apache-doris' },
      { name: 'ShardingSphere', desc: '分库分表与分布式事务生态', url: 'https://shardingsphere.apache.org/document/current/cn/overview/' },
      { name: 'Elasticsearch Guide', desc: '搜索与日志分析引擎官方指南', url: 'https://www.elastic.co/guide/index.html' }
    ]
  },
  {
    id: 'frontend',
    icon: '🖥️',
    title: '前端开发',
    desc: '框架、组件库与兼容性查询',
    items: [
      { name: 'Vue 3 中文文档', desc: '渐进式 JavaScript 框架', url: 'https://cn.vuejs.org' },
      { name: 'React 中文文档', desc: '构建用户界面的 JavaScript 库', url: 'https://react.docschina.org' },
      { name: 'uni-app', desc: '一套代码多端运行的跨端框架', url: 'https://uniapp.dcloud.net.cn' },
      { name: 'Element Plus', desc: 'Vue 3 桌面端组件库', url: 'https://element-plus.org/zh-CN/' },
      { name: 'uView UI', desc: 'uni-app 生态 Vue2 组件库', url: 'https://v1.uviewui.com' },
      { name: 'MDN Web Docs', desc: 'Web 技术权威文档，源于开发者', url: 'https://developer.mozilla.org/zh-CN/' },
      { name: 'npm', desc: 'Node.js 包管理仓库', url: 'https://www.npmjs.com' },
      { name: 'Can I Use', desc: '浏览器兼容性查询，前端必备', url: 'https://caniuse.com' },
      { name: 'ECharts', desc: 'Apache 数据可视化图表库', url: 'https://echarts.apache.org/examples/zh/index.html' }
    ]
  },
  {
    id: 'tools',
    icon: '🧰',
    title: '在线工具',
    desc: '格式化、转换与调试的一站式工具箱',
    items: [
      { name: 'ToolFu 工具箱', desc: 'JSON / 正则 / 编解码 / 时间戳综合工具', url: 'https://tool.lu' },
      { name: 'OSChina 在线工具', desc: '开源中国常用开发工具集', url: 'https://tool.oschina.net' },
      { name: '菜鸟工具', desc: '菜鸟教程旗下在线编译与工具集', url: 'https://c.runoob.com' },
      { name: 'JSON 格式化', desc: 'JSON 校验、格式化与压缩', url: 'https://www.bejson.com' },
      { name: 'Regulex 正则可视化', desc: '正则表达式图形化解析，写正则利器', url: 'https://jex.im/regulex/' },
      { name: 'Crontab Guru', desc: '定时任务 Cron 表达式在线解析', url: 'https://crontab.guru' },
      { name: 'CloudConvert', desc: '在线转换压缩包、图片、视频、电子书', url: 'https://cloudconvert.com' },
      { name: 'CodeSandbox', desc: '在线 IDE，支持 Vue / React 等框架', url: 'https://codesandbox.io' },
      { name: 'CodePan', desc: '免翻墙在线代码运行与分享', url: 'https://codepan.net' },
      { name: '30 Seconds of Code', desc: '精选常用代码片段集', url: 'https://30secondsofcode.org' },
      { name: 'AST Explorer', desc: '在线查看代码 AST 生成结果', url: 'https://astexplorer.net' },
      { name: 'jsDelivr / unpkg', desc: '常用静态资源 CDN 服务', url: 'https://www.jsdelivr.com' }
    ]
  },
  {
    id: 'design',
    icon: '🎨',
    title: '图片与设计',
    desc: '图标、压缩与在线设计工具',
    items: [
      { name: 'iconfont 阿里图标', desc: '矢量图标管理与多格式下载', url: 'https://www.iconfont.cn' },
      { name: 'Font Awesome', desc: '最流行的图标字体库', url: 'https://fontawesome.com/icons' },
      { name: 'Squoosh', desc: '谷歌出品在线图片压缩，纯浏览器端', url: 'https://squoosh.app' },
      { name: '智图', desc: '腾讯出品图片压缩，支持转 WebP', url: 'https://zhitu.isux.us' },
      { name: 'Photopea', desc: '网页版 Photoshop，免安装很强大', url: 'https://www.photopea.com' },
      { name: '即时设计', desc: '国产在线 UI 设计工具（Figma 平替）', url: 'https://js.design' },
      { name: 'Figma', desc: '协同 UI 设计工具，设计稿转前端', url: 'https://www.figma.com' },
      { name: 'ProcessOn', desc: '在线画流程图、架构图、思维导图', url: 'https://www.processon.com' },
      { name: 'clippy 形状裁剪', desc: 'CSS clip-path 可视化生成器', url: 'https://bennettfeely.com/clippy/' }
    ]
  },
  {
    id: 'learn',
    icon: '📚',
    title: '学习与教程',
    desc: '教程网站、刷题与面试资源',
    items: [
      { name: '菜鸟教程', desc: '多语言入门教程集合', url: 'https://www.runoob.com' },
      { name: 'W3School 中文', desc: 'Web 开发教程与在线实例', url: 'https://www.w3school.com.cn' },
      { name: 'W3Cschool', desc: '在线教程与技术资料查询', url: 'https://www.w3cschool.cn' },
      { name: 'JavaGuide', desc: 'Java 面试与进阶知识体系开源仓库', url: 'https://javaguide.cn' },
      { name: '小林 coding', desc: '图解网络、图解系统，面试热门', url: 'https://xiaolincoding.com', icon: 'https://cdn.xiaolincoding.com/icon.webp' },
      { name: 'pdai.tech', desc: 'Java 全栈知识体系（本页导航参考来源）', url: 'https://pdai.tech' },
      { name: 'LeetCode 力扣', desc: '算法刷题与面试题库', url: 'https://leetcode.cn' },
      { name: 'B 站技术区', desc: '海量视频教程与公开课', url: 'https://www.bilibili.com' },
      { name: 'MDN Learn', desc: 'Web 标准学习路径（中文）', url: 'https://developer.mozilla.org/zh-CN/docs/Learn' }
    ]
  },
  {
    id: 'devops',
    icon: '☁️',
    title: '云与运维',
    desc: '容器、容器编排与云平台控制台',
    items: [
      { name: 'Docker Hub', desc: '容器镜像仓库，拉镜像首选', url: 'https://hub.docker.com' },
      { name: 'Docker 文档', desc: '容器引擎官方文档', url: 'https://docs.docker.com' },
      { name: 'Kubernetes 中文文档', desc: '容器编排权威文档（社区中文版）', url: 'https://kubernetes.io/zh-cn/docs/home/' },
      { name: 'GitHub Actions 文档', desc: 'GitHub 官方 CI/CD 工作流文档', url: 'https://docs.github.com/actions' },
      { name: 'Nginx 文档', desc: '反向代理与负载均衡官方文档', url: 'https://nginx.org/en/docs/' },
      { name: '阿里云', desc: '云产品控制台与文档', url: 'https://www.aliyun.com' },
      { name: '腾讯云', desc: '云产品控制台与文档', url: 'https://cloud.tencent.com' },
      { name: '宝塔面板', desc: '服务器运维面板，建站常用', url: 'https://www.bt.cn' }
    ]
  }
]

// 统计条目总数（页面头部展示用）
export const navTotal = navCategories.reduce((sum, c) => sum + c.items.length, 0)
