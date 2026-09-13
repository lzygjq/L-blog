---
order: 0
date: 2026-09-13
desc: 大前端板块导览——小程序与 uni-app 的学习主线、内容地图与面试关注点
---

# 大前端 · 导览

后端工程师为什么要有这个板块？因为现代业务系统几乎都有小程序端（电商、点单、预约），后端要设计好登录态、接口幂等、支付回调，就必须理解前端这一跳是怎么跑的。本板块以「原生小程序 → uni-app 跨端」为主线，内容按「吸收消化后重写」的方式组织：课程只提供覆盖清单，正文按工程视角重讲，补齐课程没讲透的原理。

## 一、学习主线

| # | 主题 | 定位 | 状态 |
|---|---|---|---|
| 1 | [小程序起步](/frontend/miniprogram-start/) | 双线程模型、项目结构、配置体系、发布流程 | ✅ 已成篇 |
| 2 | [模板与样式](/frontend/miniprogram-template/) | WXML 数据绑定、WXSS 与 rpx 原理、全局/页面配置 | ✅ 已成篇 |
| 3 | [导航与生命周期](/frontend/miniprogram-logic/) | 页面导航传参、下拉刷新与触底加载、生命周期体系 | ✅ 已成篇 |
| 4 | [组件化与工程化](/frontend/miniprogram-component/) | 自定义组件、父子通信、npm、分包、自定义 tabBar | ✅ 已成篇 |
| 5 | [uni-app 核心](/frontend/uniapp-core/) | 编译期跨端、条件编译、easycom、与原生小程序的取舍 | ✅ 已成篇 |
| 6 | [跨端项目实战](/frontend/uniapp-practice/) | 请求封装、状态管理、分类联动、触底加载节流 | ✅ 已成篇 |
| 7 | [发布与多端打包](/frontend/release/) | 版本体系、双 AppID 环境切换、多端打包差异 | ✅ 已成篇 |

**推荐顺序**：1 → 4 打原生底子（理解双线程模型，uni-app 的一切行为才有解释）；5 → 7 上跨端实战。

## 二、和后端板块的交叉点

这个板块不是孤立的，几条线和后端知识直接咬合：

- **登录态**：小程序 `wx.login` 换 code → 服务端换 session —— 对应[Redis 板块](/database/redis/)的会话设计
- **支付**：小程序拉起支付 → 服务端统一下单 → 异步回调 —— 对应[消息队列](/middleware/)的最终一致
- **分包与性能**：包体积限制 → 静态资源上 CDN —— 对接[云原生](/cloud-native/)的部署链路

## 三、面试关注点

1. 小程序的双线程模型为什么这么设计（安全 + 性能，见[起步](/frontend/miniprogram-start/)）
2. `setData` 的性能边界，为什么大数据渲染要少用（见[模板与样式](/frontend/miniprogram-template/)）
3. 生命周期执行顺序：应用 → 页面 → 组件（见[导航与生命周期](/frontend/miniprogram-logic/)）
4. 分包加载的原理与 `preloadRule`（见[组件化与工程化](/frontend/miniprogram-component/)）
5. uni-app 的跨端原理与原生开发的取舍（见[uni-app 核心](/frontend/uniapp-core/)）
6. 小程序登录 + 支付的完整时序（后端视角，见[跨端项目实战](/frontend/uniapp-practice/)）
