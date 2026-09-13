---
order: 5
date: 2026-09-13
title: uni-app 核心
desc: 编译期跨端的原理与代价、条件编译、目录与生命周期映射、easycom、与原生小程序的选型对比
---

# uni-app 核心

## 一、uni-app 是什么：编译期跨端

uni-app（DCloud 出品）用 **Vue 语法写一套代码，编译期转换到多个端**：微信/支付宝/字节小程序、H5、iOS/Android App。

```
        ┌─ 编译 → 微信小程序（WXML/WXSS/JS）
.vue 源码 ├─ 编译 → H5（标准 DOM + Vue）
        ├─ 编译 → App（webview 渲染 / nvue 原生渲染）
        └─ 编译 → 其他小程序（支付宝/字节/快手…）
```

**关键认知：它是编译期方案，不是运行期方案。** 写的时候是 Vue，产物是各端各自的代码。这意味着：

- 每个端的产物就是该端的原生代码，没有跨端运行时层，性能上限 = 原生小程序；
- 编译器抹不平的部分（端差异 API、组件、CSS 表现）就是跨端的摩擦成本，靠条件编译兜底。

## 二、条件编译：跨端的逃生门

不同端的差异代码用注释指令包裹，编译时按平台裁剪：

```js
// #ifdef MP-WEIXIN
wx.login({ success: ({ code }) => console.log(code) })
// #endif

// #ifdef H5
console.log('仅 H5 执行')
// #endif

// #ifndef MP-WEIXIN   ← 非微信小程序才编译
console.log('排除某端')
// #endif
```

模板、样式、配置文件（pages.json）同样支持。**工程纪律**：条件编译是「差异收敛点」，散落太多 `#ifdef` 说明抽象没做好——标准做法是把端差异封装进统一的适配层（如 `utils/platform.js` 的 `login()` / `pay()`），业务代码只调适配层，`#ifdef` 集中在一处。

## 三、目录结构与 pages.json

```
uni-app 项目
├── pages/            # 页面（.vue 单文件组件）
├── static/           # 静态资源（不放编译处理，直接拷贝）
├── uni_modules/      # uni_modules 生态插件（组件/工具，跨项目复用）
├── pages.json        # ≈ app.json：页面路由、窗口、tabBar、分包
├── manifest.json     # ≈ project.config.json：各端配置（AppID、App 图标、模块权限）
├── App.vue           # 全局生命周期（onLaunch/onShow/onHide）
├── main.js           # 入口：创建应用、注册全局状态/组件
└── uni.scss          # 全局样式变量
```

从原生小程序迁移过来的心智映射：`app.json → pages.json`、`project.config.json → manifest.json`、页面四件套 → 单个 `.vue`。Vue 的 SFC 模式把四件套合到一起，开发体验显著收敛。

## 四、生命周期：Vue 与小程序两套的融合

uni-app 页面的生命周期是**两套并存**：

| 来源 | 钩子 | 用途 |
|---|---|---|
| Vue 标准 | `beforeCreate/created/mounted/...` | 组件视角，跨端通用 |
| 小程序系 | `onLoad/onShow/onReady/onReachBottom/onPullDownRefresh...` | 页面级能力（参数、下拉、触底） |

要点：**页面参数在 `onLoad(options)` 里拿**（Vue 的 created 拿不到路由参数）；下拉刷新、触底加载这些小程序特有能力只在页面级钩子里有。写法上 `export default { onLoad(options) {...}, methods: {...} }`——Vue2 选项式风格（uni-app 也支持 Vue3 + 组合式，主流存量项目是 Vue2）。

## 五、easycom：组件自动注册

传统方式每个页面都要 `import + components` 注册组件；uni-app 的 **easycom** 约定「组件放规范路径就自动可用」：

```
components/my-card/my-card.vue   →  模板里直接写 <my-card/>
uni_modules/xxx-components/...   →  uni_modules 插件自动注册
```

编译器按需引入——页面里没用到就不打包。这是「约定优于配置」的典型：牺牲一点点目录自由，换掉全项目数百行样板注册代码。

## 六、与原生小程序的选型对比

| 维度 | 原生小程序 | uni-app |
|---|---|---|
| 目标端 | 单一小程序 | 小程序 + H5 + App 多端 |
| 语法 | WXML/WXSS/JS（自有壳） | Vue（主流生态、SFC、npm 生态完整） |
| 性能 | 上限即原生 | 编译期转换，小程序端≈原生（Vue 层有轻微开销） |
| 生态 | 微信官方组件/API 即时支持 | 依赖 uni 编译器跟进新 API（略滞后） |
| 工程化 | 原生较弱（要靠第三方方案补） | 完整（Vue CLI/Vite、npm、状态管理开箱即用） |
| 调试 | 微信开发者工具 | HBuilderX → 转投微信工具（部分调试能力降级） |

**选型判断**：只做微信一个小程序、深度使用最新特性（如 Skyline）→ 原生更稳；要多端投放、团队有 Vue 基础、要完整的工程化 → uni-app。**不要用「跨端」的需求去啃「单端」的边界**（如 uni-app 侧跟着微信新特性等编译器更新），反之亦然。

## 七、面试问答

**Q: uni-app 跨端的原理？**
编译期转换：Vue 模板按目标端编译成对应代码（小程序端 → WXML/WXSS/JS，H5 → DOM 渲染，App → webview/nvue）。运行期不依赖跨端虚拟层，所以小程序端性能接近原生；端差异由条件编译收敛。

**Q: 条件编译用多了有什么问题？**
差异点扩散到业务代码各处，可维护性崩坏。正确姿势是把端差异封装到平台适配层（login/pay/storage 等统一接口），`#ifdef` 只出现在适配层内部。

**Q: uni-app 页面里 onLoad 和 mounted 的区别？**
onLoad 是小程序系页面钩子，拿路由参数、执行一次；mounted 是 Vue 渲染钩子，确保首次渲染完成。页面初始化逻辑放 onLoad，需要操作节点的放 mounted（或 onReady）。
