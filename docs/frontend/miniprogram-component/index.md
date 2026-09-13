---
order: 4
date: 2026-09-13
title: 组件化与工程化
desc: 自定义组件三要素与父子通信、数据监听器、npm 支持、mobx 全局共享、分包加载与 preloadRule、自定义 tabBar
---

# 组件化与工程化

## 一、自定义组件：创建与引用

每个组件一个目录四件套（js/json/wxml/wxss），json 里声明 `"component": true`。引用分两级：

```jsonc
// 页面.json —— 局部引用（默认方式）
{ "usingComponents": { "my-test": "/components/test/test" } }

// app.json —— 全局引用（注册一次，处处可用）
{ "usingComponents": { "my-test": "/components/test/test" } }
```

**选择依据**：通用组件（按钮、空状态、搜索框）全局注册省重复声明；业务组件（只服务一两个页面）局部引用，控制可见范围。和 Vue 的全局/局部组件注册是同一种取舍。

组件的 js 用 `Component()` 构造，`properties`（外部入参）、`data`（内部状态）、`methods` 三段式：

```js
Component({
  properties: { max: { type: Number, value: 10 } },  // 外部传入，尽量只读
  data: { count: 0 },
  methods: { add() { this.setData({ count: this.data.count + 1 }) } }
})
```

## 二、父子通信：四条通道

| 方向 | 方式 | 说明 |
|---|---|---|
| 父 → 子 | `properties` | 声明式传值，数据下行 |
| 子 → 父 | 自定义事件 | `this.triggerEvent('change', { value })`，父用 `bind:change` 接 |
| 父 → 子（方法级） | `selectComponent` | 父直接拿子实例调方法（强耦合，慎用） |
| 任意层级 | behaviors + 全局共享 | 复用逻辑段 / 跨层级状态（见下） |

**slot 与多 slot**：组件内 `<slot/>` 占位，父传结构进去；`multipleSlots: true` 后可用命名插槽 `<slot name="header"/>`——复杂布局组件（卡片头/体/尾分离）必备。

**数据监听器 observers**：同时监听多个数据字段做派生计算：

```js
Component({
  observers: {
    'count, max'(count, max) {           // 任一变化即触发
      this.setData({ percent: Math.min(count / max * 100, 100) })
    }
  }
})
```

**纯数据字段**：`pureDataPattern: /^_/` 声明正则，匹配的字段（如 `_rawList`）不送渲染层——省掉[通信桥](/frontend/miniprogram-start/)的序列化开销，纯逻辑中间态都该这么标。

**behaviors**：组件版的 mixin，封装可复用的 data/methods/生命周期段，多组件引用；同名段有合并与覆盖规则（覆盖时组件优先）。组件也能引用 behaviors，页面同样可以（` behaviors` 在 Page 里同样生效）。

## 三、样式隔离与外部类

组件默认样式隔离：页面样式影响不到组件内部，组件样式也影响不到外面。需要灵活换肤时用两条正路：

1. `externalClasses: ['my-class']` —— 父传类名进去（推荐，语义清晰）
2. `options: { styleIsolation: 'apply-shared' }` —— 页面样式单向穿透进组件（快捷但破坏隔离）

## 四、npm 支持：用第三方包的正确姿势

小程序内置 npm 支持，流程三步（对应开发者工具「工具 → 构建 npm」）：

```bash
npm init -y && npm install xxx
# 开发者工具：构建 npm → 生成 miniprogram_npm/ 目录
```

**构建的意义**：小程序只能识别 `miniprogram_npm/` 下的包结构，构建过程把 node_modules 里「能用于小程序」的产物抽出来。常踩的坑：装了包没点构建就 import（找不到模块）；包依赖 Node 特性（fs/path）则不可用——选包时认准「小程序可用」标识。

基础库 2.2.1 起 `project.config.json` 里 `packNpmManually` 可自定义构建位置，monorepo/云开发场景用得上。

## 五、全局状态共享：mobx-miniprogram

多页面共享登录态、购物车时，靠 `getApp().globalData` 裸奔缺乏响应式。社区标准方案是 **mobx-miniprogram + mobx-miniprogram-bindings**：

```js
// store/cart.js
import { observable, action } from 'mobx-miniprogram'
export const store = observable({
  cartList: [],
  get total() { return this.cartList.length },
  addToCart: action(function (item) { this.cartList.push(item) })
})

// 页面/组件里绑定（自动映射为字段和方法，store 变则视图变）
import { storeBindingsBehavior } from 'mobx-miniprogram-bindings'
Component({
  behaviors: [storeBindingsBehavior],
  storeBindings: { store, fields: ['total'], actions: ['addToCart'] }
})
```

比 globalData 强在**响应式**：状态变更自动驱动所有绑定它的页面/组件更新。轻量场景（就一两个全局标志）globalData 够用；状态一旦成网（购物车就是典型）必须上状态管理。uni-app 侧的对应物是 Vuex/Pinia，见[跨端项目实战](/frontend/uniapp-practice/)。

## 六、分包：2MB 主包限制的解法

主包限 2MB（tabBar 页必须在主包），整包 20MB。解法是按业务拆分包、**按需下载**：

```jsonc
// app.json
{
  "subPackages": [
    { "root": "pkgA", "pages": ["pages/cat/cat", "pages/goods/goods"] },
    { "root": "pkgB", "pages": ["pages/cart/cart"] }
  ],
  "preloadRule": {
    "pages/index/index": {            // 进入首页后
      "network": "all",               // wifi + 流量都预下载 pkgA
      "packages": ["pkgA"]
    }
  }
}
```

三条原则：

1. **按业务域拆**（首页主包 + 分类/购物车/我的分包），不要按技术分层拆；
2. `preloadRule` 把「用户下一步大概率去的包」提前拉——体验上接近无分包，代价是流量；
3. 分包里不能 require 主包没有的公共代码以外的引用关系要单向（主包↛分包）；独立分包（`"independent": true`）可不依赖主包单独启动，适合营销落地页。

分包的本质是**代码按需加载**，和后端服务的按需伸缩是同一个工程思想，只是粒度在「页面资源」。

## 七、自定义 tabBar

官方 tabBar 只能静态配置，做「中间凸起大按钮」「角标动画」就得自定义：`app.json` 里 `"custom": true` + 根目录 `custom-tab-bar/index` 组件。要点：

- 每个 tab 页**各自持有一份 tabBar 组件实例**，切 tab 不会自动高亮——需在每页 `onShow` 里 `this.getTabBar().setData({ selected: n })`；
- 角标数据（如购物车数量）走全局共享（mobx 绑定），各 tab 实例都绑同一 store 才能同步。

这是「每个页面独立实例」这一架构细节最典型的应用场景，也是自定义 tabBar 最常见的翻车点。

## 八、面试问答

**Q: 组件间通信有哪几种，分别什么时候用？**
父子用 properties + triggerEvent（常规）；跨层级用全局 store（状态成网时）；方法级强控用 selectComponent（表单取值类，少用）。原则：数据流方向单一化，避免双向纠缠。

**Q: 分包怎么设计？预下载呢？**
按业务域拆、tabBar 留主包、公共代码留主包（分包可引用主包）。preloadRule 按「当前页 → 下一步最可能的包」配置，network 区分 wifi/all。独立分包用于无宿主依赖的活动页。

**Q: 自定义 tabBar 高亮不同步的原因？**
每个 tab 页持有独立组件实例，切换后是另一份实例在渲染。标准解法是每页 onShow 里同步 selected；数据类状态（角标）绑定同一个全局 store。
