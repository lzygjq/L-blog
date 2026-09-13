---
order: 2
date: 2026-09-13
title: 模板与样式
desc: WXML 数据绑定与事件体系、rpx 自适应原理、wxss 样式作用域、全局与页面配置、网络请求与合法域名
---

# 模板与样式

## 一、WXML：数据驱动的模板

### 数据绑定三原则

1. `data` 里定义数据
2. WXML 里用 `{{ }}`（Mustache 语法）引用
3. 运行期改动必须走 `setData`（声明在 data 之外的属性不会触发渲染）

```xml
<view>{{ message }}</view>
<image src="{{ imgSrc }}" />
<view>{{ count > 5 ? '多' : '少' }}</view>
<view>{{ fullName.first + ' ' + fullName.last }}</view>
```

Mustache 里可以放表达式（运算、三元、拼接），但不能放语句（if/for）——分支循环用下面的指令语法。

### 条件渲染

```xml
<view wx:if="{{ type === 1 }}">男</view>
<view wx:elif="{{ type === 2 }}">女</view>
<view wx:else>保密</view>

<view hidden="{{ flag }}">隐藏但保留节点</view>
```

**`wx:if` vs `hidden` 的取舍**：`wx:if` 是真创建/销毁（初始 `false` 时不渲染，切换开销大），`hidden` 是永远渲染只是 `display:none`（切换零开销，但节点常驻）。低频切换用 `wx:if`，高频切换用 `hidden`——和 Vue 的 `v-if`/`v-show` 完全同构。

### 列表渲染

```xml
<view wx:for="{{ list }}" wx:key="id">
  {{ index }} - {{ item.name }}
</view>
```

**`wx:key` 不是可选项**：不写会有警告，且列表变动时框架按顺序就地复用节点，可能引发状态错乱（比如输入框内容串行）。有唯一 id 用 id，没有才退化为 `*this` 或 index（仅限静态列表）。

### 事件系统

```xml
<button bind:tap="onTap" data-id="{{ item.id }}">点我</button>
```

```js
onTap(e) {
  // dataset 是传参的标准姿势：data-* 属性 → e.currentTarget.dataset
  console.log(e.currentTarget.dataset.id)
}
```

辨析 `e.target` vs `e.currentTarget`：事件冒泡时 `target` 是**触发源**，`currentTarget` 是**绑定处理器的那一层**。给容器绑事件、内部元素点击时想拿容器上的 data，必须用 `currentTarget`——这是新手最常踩的坑。另有 `catch:tap`（阻止冒泡）与 `capture-bind:tap`（捕获阶段）。

## 二、WXSS 与 rpx：小程序的样式方案

### rpx 自适应原理

rpx（responsive pixel）：规定**任何屏幕宽度 = 750rpx**。原理是框架按 `实际设备宽度 / 750` 动态换算——iPhone 6（375px 宽）下 `1rpx = 0.5px`。

设计稿 750px 宽的话，量出的 px 数值直接写 rpx 就能等比适配所有机型。这本质是「以设计稿宽度为基准的百分比换算」，比手写 rem/vw 方案省心。

### 样式作用域

- 页面 wxss 只对本页面生效；app.wxss 全局生效，页面可覆盖。
- **组件默认样式隔离**（见[组件化](/frontend/miniprogram-component/)），需要穿透时用 `styleIsolation` 配置。
- 只支持部分选择器：类、id、element、`::before/::after`——**不支持通配符 `*` 和属性选择器**（渲染层不是完整浏览器 CSS 引擎）。
- 字体图标与本地大图片不能直接引（包体积），本地背景图建议 base64 或上 CDN。

## 三、全局配置与页面配置

`app.json` 里最高频的三块：

```jsonc
{
  "pages": ["pages/index/index"],      // 路由注册，第一项为首页
  "window": {                          // 全局窗口外观
    "navigationBarTitleText": "L知识库",
    "navigationBarBackgroundColor": "#ffffff",
    "enablePullDownRefresh": false
  },
  "tabBar": {                          // 底部导航 2~5 个
    "list": [
      { "pagePath": "pages/index/index", "text": "首页", "iconPath": "...", "selectedIconPath": "..." }
    ]
  }
}
```

页面级 `.json` 只能覆盖 window 相关字段（就近覆盖）。注意 tabBar 图标**只支持本地图片**（81×81px 建议），不能引网络图。

## 四、网络请求：白名单与封装

```js
wx.request({
  url: 'https://api.example.com/list',
  method: 'GET',
  data: { page: 1 },
  success: ({ data }) => console.log(data),
  fail: (err) => console.error(err)
})
```

三条上线前必须满足的硬约束：

1. **HTTPS + 备案域名**，且在后台「服务器域名」白名单里登记（request/uploadFile/downloadFile 各自独立配置）；开发期勾「不校验合法域名」只是本地豁免。
2. **并发上限 10 个**（`wx.request`），超出的排队——列表页并发拉多个接口时要注意，或后端做聚合接口。
3. 没有拦截器机制——**token 注入、错误统一处理、loading 收敛都要自己封装**，裸调 `wx.request` 散落各处是维护灾难。实战封装见[跨端项目实战](/frontend/uniapp-practice/)。

## 五、面试问答

**Q: 数据绑定后页面没更新，常见原因？**
① 绕过 `setData` 直接 `this.data.x = y`；② `setData` 的 key 路径写错；③ 修改了 data 之外挂的属性。核心只有一句：渲染层只认 `setData` 送过来的数据。

**Q: 列表渲染警告 unique key，影响是什么？**
影响的是 diff 复用策略：无 key 时按索引复用，插入/删除会导致后续节点状态错位（如带输入态的子组件内容漂移）。有稳定唯一 id 就用 id。

**Q: 长列表渲染卡顿怎么优化？**
① 分页 + 触底加载，控制单次 `setData` 数据量；② 长列表用虚拟化思路（只渲染可视区，recycler-view 类组件）；③ 图片懒加载（`lazy-load`）；④ 纯样式计算下沉 WXS。本质都是省通信桥带宽和渲染 diff 量。
