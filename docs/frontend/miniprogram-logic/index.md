---
order: 3
date: 2026-09-13
title: 导航与生命周期
desc: 页面导航两种方式与传参、下拉刷新与触底加载、应用/页面/组件三层生命周期全表、WXS 脚本
---

# 导航与生命周期

## 一、页面导航：两种方式与传参规则

| 方式 | 写法 | 特点 |
|---|---|---|
| 声明式 | `<navigator url="/pages/detail/detail?id=1">` | 组件标签，简单跳转 |
| 编程式 | `wx.navigateTo` / `wx.redirectTo` / `wx.switchTab` / `wx.navigateBack` | 可携带逻辑（登录拦截后再跳） |

四个 API 的关键差异，一张表说清：

| API | 效果 | 能否跳 tabBar | 栈变化 |
|---|---|---|---|
| `wx.navigateTo` | 保留当前页，压入新页 | ❌ | 栈 +1（上限 **10 层**） |
| `wx.redirectTo` | 关闭当前页，替换新页 | ❌ | 栈不变 |
| `wx.switchTab` | 切到 tabBar 页 | ✅（唯一选择） | 清到只剩目标 tab |
| `wx.navigateBack` | 返回（`delta` 指定层数） | — | 栈 -1 |

**两个高频坑**：

1. **栈上限 10 层**——详情页套详情页的交互设计会撞墙，跳转前应判断栈深（`getCurrentPages().length`），到顶改用 `redirectTo`。
2. **传参只有 query 字符串**：`url + '?id=1&type=2'`，接收方在 `onLoad(options)` 里拿，**全是字符串**（`options.id === '1'`，注意 `'1' == 1` 的隐式转换陷阱）；对象参数要么序列化 + `encodeURIComponent`，要么走全局状态/事件通道（见[组件化](/frontend/miniprogram-component/)）。

返回传参不能用 query（返回时目标页已存在），标准解法是事件通道 `EventChannel` 或全局状态。

## 二、页面事件：下拉刷新与触底加载

列表页两大标配，都以「开配置 → 绑事件 → 关状态」三步走：

```js
// json: "enablePullDownRefresh": true（或 wx.stopPullDownRefresh 动态控制）
onPullDownRefresh() {
  this.reloadData().finally(() => wx.stopPullDownRefresh())  // 必须手动停，否则转圈不停
}

onReachBottom() {
  if (this.data.loading || !this.data.hasMore) return   // 节流阀 + 终止条件
  this.loadNextPage()
}
```

工程要点：**节流阀（loading 标志位）+ hasMore 终止条件**缺一不可，否则弱网下重复请求、到底后无限请求。完整封装模式见[跨端项目实战](/frontend/uniapp-practice/)。

另有页面滚动位置监听 `onPageScroll`（节流使用，高频触发会掉帧）与转发分享 `onShareAppMessage`。

## 三、生命周期：三层体系全表

### 应用级（app.js）

| 钩子 | 时机 | 典型用途 |
|---|---|---|
| `onLaunch` | 首次启动一次 | 初始化全局配置、静默登录、埋点上报启动 |
| `onShow` | 启动或从后台切入前台 | 刷新角标/授权状态（切后台再回来要重查） |
| `onHide` | 进入后台 | 暂停轮询、保存状态 |

### 页面级

```
onLoad → onShow → onReady → (后台切换: onHide/onShow) → onUnload
```

| 钩子 | 时机 | 关键差异 |
|---|---|---|
| `onLoad` | 页面加载一次 | **拿路由参数**（`options`），只执行一次 |
| `onShow` | 每次展示 | 从详情页返回时刷新列表数据放这里 |
| `onReady` | 首次渲染完成 | 操作节点/动效从这里开始 |
| `onUnload` | 页面销毁 | 清理定时器、EventChannel 监听 |

**`onLoad` vs `onShow` 是面试最常问的一对**：`onLoad` 一次性的初始化（参数解析、首次请求），`onShow` 每次可见都触发（返回刷新、前台恢复）——把本该放 `onShow` 的刷新逻辑放 `onLoad`，就会出现「详情页改完返回列表没更新」的经典 bug。

### 组件级

```
created → attached → ready → (moved/detached)
```

组件没有 onLoad/onShow；`attached` ≈ 页面 `onLoad`（初始化 data），`ready` ≈ `onReady`（可查节点）。综合执行顺序：**应用 onLaunch → 页面 onLoad → 页面 onShow → 组件 created/attached → 页面 onReady → 组件 ready**——理解「页面先加载壳、组件随渲染挂载」即可推出整条链。

## 四、WXS：跑在渲染层的脚本

WXS（WeiXin Script）是唯一运行在**渲染层**的 JS 方言，用于模板内的展示计算：

```xml
<wxs module="fmt">
  module.exports = {
    price: function (fen) { return (fen / 100).toFixed(2) }
  }
</wxs>
<view>{{ fmt.price(item.priceFen) }}</view>
```

**为什么存在**：逻辑层函数不能在 `{{ }}` 里调用（跨线程桥不允许），每个列表项绑定一次逻辑层函数 = 每次渲染都过桥 N 次。WXS 直接在渲染层执行，**零通信开销**——长列表的格式化（价格、时间、状态文案）下沉 WXS 是标准性能优化，呼应[起步篇](/frontend/miniprogram-start/)的通信模型。

限制要有预期：语法是 ES5 子集、不能调用小程序 API、每个 `<wxs>` 标签独立模块。

## 五、面试问答

**Q: navigateTo 连点几次报错跳不动了？**
页面栈到 10 层上限。防御式处理：跳转前查 `getCurrentPages().length >= 10` 则改 `redirectTo`；产品层面避免「同类页面自套娃」。

**Q: onShow 里该做什么、不该做什么？**
该做：返回刷新、前后台切换时的授权/登录态复查。不该做：重接口全量重拉（应比对时间戳或增量刷新）——onShow 触发频率远比想象高（分享回来、切后台回来都触发），无脑重拉就是性能事故。

**Q: WXS 和普通 JS 的区别？**
运行位置不同：WXS 在渲染层 WebView 里跑，普通 JS 在逻辑层。代价是 ES5 子集、无 API 能力；收益是模板内调用零跨线程开销，专治长列表格式化。
