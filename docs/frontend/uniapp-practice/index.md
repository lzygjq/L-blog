---
order: 6
date: 2026-09-13
title: 跨端项目实战
desc: 以电商项目为样本的工程要点——请求封装与登录态、状态管理、左右联动、触底加载节流、组件封装与分包
---

# 跨端项目实战

以一个完整的电商项目为样本（首页轮播 → 分类联动 → 商品列表 → 购物车 → 结算，Vue2 + Vuex + uni-ui），抽掉具体业务后，剩下的是一套可复用的跨端工程模式。这些模式在原生小程序同样成立，只是 API 名不同。

## 一、请求封装：拦截器 + token 刷新

裸调 `uni.request` 散落各处是维护灾难。标准封装三件事：

```js
// utils/request.js
const BASE_URL = 'https://api.example.com'

const request = (options) => {
  return new Promise((resolve, reject) => {
    uni.request({
      ...options,
      url: BASE_URL + options.url,
      header: { ...options.header, token: uni.getStorageSync('token') },  // ① 统一注入登录态
      success: (res) => {
        if (res.data.code === 401) {          // ② 登录态过期统一处理
          uni.reLaunch({ url: '/pages/login/login' })
          return reject(res)
        }
        res.data.code === 200 ? resolve(res.data) : reject(res.data)
      },
      fail: reject                             // ③ 网络层失败兜底
    })
  })
}
```

配套的登录链路是前后端咬合点，时序如下（后端视角见[Redis 板块](/database/redis/)的会话设计）：

```
wx.login() 拿 code（一次性，5 分钟有效）
  → POST /login  code + 用户信息
  → 服务端调 code2Session 换 openid → 生成自定义 token 返回
  → 前端 storage 存 token → 后续请求 header 携带
  → 401 时静默重登（onLaunch 兜底 + 请求拦截触发）
```

**静默登录**（无感续期）是体验分水岭：`onLaunch` 时先静默登录，接口 401 再触发一次，用户全程无感。

## 二、状态管理：Vuex 的跨端用法

购物车是状态成网的典型（勾选状态、总价、角标、结算页互相依赖），必须上集中式状态：

```js
// store/cart.js
export default {
  namespaced: true,
  state: () => ({ list: uni.getStorageSync('cart') || [] }),   // ① 持久化初始化
  getters: {
    checkedCount: (s) => s.list.filter(i => i.checked).length,
    total: (s) => s.list.filter(i => i.checked).reduce((n, i) => n + i.price * i.count, 0)
  },
  mutations: {
    toggle(s, id) { /* ... */ uni.setStorageSync('cart', s.list) }  // ② 每次变更落盘
  }
}
```

两条工程纪律：

1. **持久化跟随每次 mutation**（storage 同步写），杀掉小程序后购物车不丢；
2. **派生数据用 getters**（总价、已选数量），不要在 mutation 里冗余存——单一数据源，派生值随动。

tabBar 购物车角标：`uni.setTabBarBadge` 在 mutation 后调用（或 watch 总数），各 tab 实例都会生效。

## 三、分类页：左右联动（scroll-view 双区滚动）

左侧一级分类（固定高 scroll-view），右侧二三级列表（独立 scroll-view），联动双向：

```
点左侧 → 改 activeIndex → 右侧 scrollTop = 对应区块 offsetTop（配合 :scroll-top 单向）
滑右侧 → scroll 事件比对 scrollTop 区间 → 反写 activeIndex（注意节流）
```

实现要点：右侧每个区块用 `uni.createSelectorQuery()` 批量量取 `offsetTop` 缓存为数组；`scroll` 事件节流（WXS 响应事件更佳，见[模板与样式](/frontend/miniprogram-template/)）；点击左项置标志位防止 scroll 反写造成「选中项抖动」——联动类交互的核心复杂度全在**回环防抖**。

## 四、商品列表：触底加载与节流阀

无限滚动的标准骨架（和原生小程序的[页面事件](/frontend/miniprogram-logic/)同构）：

```js
export default {
  data: () => ({ list: [], pagenum: 1, total: 0, loading: false }),
  onReachBottom() {
    if (this.loading || this.list.length >= this.total) return   // 节流阀 + 终止
    this.loading = true
    this.fetch(++this.pagenum).finally(() => this.loading = false)
  }
}
```

配套细节：**下拉刷新重置**（`pagenum=1` 清列表后停刷新动画）、**图片懒加载**（image `lazy-load`）、**默认占位图**（部分商品图 404 时兜底）、触底加载失败要支持「点我重试」而非静默丢失一页。

## 五、组件封装：goods-item 的抽取标准

什么时候把列表项抽成组件？出现**同一 UI 结构在两个以上页面复用**（列表页 + 购物车都要渲染商品卡片）就抽。封装边界：

- `properties` 只收数据（item 对象 + 所需标志位如 `showRadio/showNumberBox`），**组件内部不发请求**；
- 交互通过 `triggerEvent` 上抛（勾选、数量变更），逻辑归页面/store——组件保持「哑组件」；
- 结合 easycom 免注册直接用。

购物车里的 NumberBox（步进器）用 uni-ui 的现成组件，注意其 change 事件与 store 的 mutation 打通后，**输入非法值（0/空）要回弹到上次合法值**——表单类组件集成的通用防御。

## 六、分包与体验优化清单

电商项目体积膨胀快，上线前过一遍：

1. **主包瘦身**：tabBar 三页留主包，分类/购物车/结算按业务拆分包（见[分包详解](/frontend/miniprogram-component/)），`preloadRule` 预载下一步；
2. **静态资源上 CDN**：static 目录只留 tabBar 图标等必需本地资源，商品图全部走远端 URL；
3. **骨架屏**：首页/列表页加载态用骨架屏替代白屏（体验分权重项）；
4. **低端机降级**：长列表关闭大图模式开关交给用户，动画用 CSS 而非 JS 驱动。

## 七、面试问答

**Q: 小程序登录为什么设计成 code 换 session，前端不直接拿 openid？**
安全边界：openid/openkey 是身份凭证，走前端等于暴露给客户端可伪造；code 是一次性短期票据，服务端用 AppSecret 去 code2Session 兑换，秘钥永不出服务端。前端只持有自定义 token。

**Q: 触底加载的防重怎么做？**
节流阀（loading 标志）挡住并发重入，list.length >= total 挡住越界请求，失败态要有重试入口而不是吞掉页码。三者组成完整的分页状态机。

**Q: 购物车状态为什么用集中式 store 而不是页面 data？**
购物车状态被列表、购物车、结算、tabBar 角标四处消费，页面 data 是孤岛无法联动；集中式 store 单一数据源 + getters 派生，变更自动广播到所有绑定处，且便于整体持久化。
