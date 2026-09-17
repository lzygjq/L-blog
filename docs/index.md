---
layout: home
date: 2026-09-17

hero:
  name: L知识库
  text: 领域轴用来查 · 两条路线用来走
  tagline: "中高级 Java 后端知识库。<strong>成长路线管人的深度（L1–L4），架构路线管系统的形态（L1–L6）</strong>——两把不同的尺子，别读成同一级。"
  actions:
    - theme: brand
      text: 成长路线
      link: /projects/architect-roadmap/
    - theme: alt
      text: 架构路线
      link: /projects/architecture-evolution/

features:
  - icon: 🧭
    title: 成长路线
    details: 人的深度轴：开发 → 高级开发 → 架构师 → CIO。每级给页清单与「读到哪一层就停」。
    link: /projects/architect-roadmap/
    linkText: 进入成长路线
  - icon: 📐
    title: 架构路线
    details: 系统的形态轴：共址与拆机之后，应用 / 数据 / 缓存 / 文件 / 部署各走各的，档位记在层账。
    link: /projects/architecture-evolution/
    linkText: 进入架构路线
  - icon: 🎯
    title: 面试专题
    details: 检索层。先卡一包，不要刷 1236 题——答案落在正文锚点。
    link: /interview/
    linkText: 看这一包
  - icon: 📋
    title: 可验证产出
    details: 把「做过」变成可对照的证据：ADR、压测口径、架构图。没有实测就标假设。
    link: /projects/toolkit/
    linkText: 看三件套
---

## 六块仓库：按领域查 {#domains}

顶部六个板块是**手册**，不是路线。同一篇会被不同级别拿走不同深度——成长 L1 读「会用」，成长 L3 读「代价是什么」。**别把某一板块从头读到尾当成一条成长路线。**

| 板块 | 收录什么 |
|---|---|
| [计算机基础](/fundamentals/) | 网络（TCP / HTTP）、操作系统（进程线程 / Linux 排查）、算法 |
| [语言与框架](/java/) | Java 语言与集合、Spring 全家桶、测试；[大前端](/frontend/) 按方向选读 |
| [数据与存储](/database/) | MySQL、Redis；[搜索](/search/) 与[数仓](/bigdata/) 独立成块 |
| [中间件与分布式](/middleware/) | 消息队列、RPC；[分布式理论](/distributed/) 在后 |
| [架构与云原生](/cloud-native/) | 容器与编排、CI/CD、可观测；方法论 / 高可用 / 安全 |
| [实战与面试](/projects/) | 两条路线、工具箱、两个案例；[AI](/ai/)、[面试](/interview/) |

### 第一次来，按这个顺序 {#how-to-start}

1. **先定位**——在[成长路线](/projects/architect-roadmap/#levels-as-relation)上找到自己那一级，看五维判据（交付 / 代码 / 数据 / 问题 / 验证）里哪一维是真空白。
2. **再走级**——从[成长 L1 开发](/projects/architect-roadmap/developer/)起步，每一步只读到那一层的边界就停；越界去读 L2 不算加分。
3. **卡住就查**——回上面六块仓库按领域翻；要面试走[面试专题](/interview/)；做过的系统按[层账](/projects/architecture-evolution/ledger/)记档位。

站点怎么组织、读到哪停、哪里故意不写，见[关于本站](/about/)。不覆盖零基础入门。
