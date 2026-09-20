// 扩展默认主题，加载全局自定义样式与自定义组件
// 当前自定义：
//   - custom.css：品牌色、pdai 风格卡片式布局（灰底+白卡片+间隙）、
//     顶部导航居中/hover/选中态、侧边栏宽度、滚动条
//   - RightRail.vue：最右侧竖版工具栏（layout-bottom 插槽，fixed 定位），
//     内含成长路线 / 架构路线入口、侧边栏开关（原导航栏左上角）、本页目录开关（原导航栏右侧）、
//     最近阅读、沉浸阅读、全屏阅读、回到顶部
//   - RoadmapLink.vue：成长路线 / 架构路线固定入口（全站常驻的跳转链接，由 RightRail 引用）。
//     2026-09-17 立：左侧 sidebar 按路径前缀映射，在非 projects 板块里看不到这两条路线，
//     需要一个跨板块常驻的入口；架构路线叠在成长路线下面。
//   - SidebarToggle.vue / AsideToggle.vue：左栏/目录开关（由 RightRail 引用）
//   - ImmersiveToggle.vue：沉浸阅读开关（由 RightRail 引用）—— 隐藏顶栏 + 左栏 +
//     右侧目录，只留正文；Esc 亦可退出。挂右栏而非顶栏的原因见组件头注释
//   - ReadingLog.vue：最近阅读入口（由 RightRail 引用）—— 浮层列出最近读过的页面
//   - ReadingRecorder.vue：阅读位置记录器（无 UI，挂 layout-top，全站常驻）
//   - ReadingResume.vue：继续上次阅读横幅（挂 doc-before，落在正文标题之上）
//     三者共用 composables/useReadingLog.mjs（localStorage 持久化）
//   - NavRail.vue：导航页右侧分类导航（aside-outline-before 插槽，frontmatter navRail: true 时渲染）
//   - NavBoard.vue：导航页卡片主体（由 docs/nav.md 引用）
//   - BackToTop.vue：回到顶部（由 RightRail 引用）
//   - SidebarTip.vue：侧边栏长条目标题的单行缩略 + 悬停浮层（挂 layout-bottom）
//   - 百度统计：站内跳转的 PV 上报（router.onAfterRouteChange），ID 在 config.mts 顶部
import { h } from 'vue'
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import RightRail from './components/RightRail.vue'
import NavRail from './components/NavRail.vue'
import NavBoard from './components/NavBoard.vue'
import SidebarTip from './components/SidebarTip.vue'
import ReadingRecorder from './components/ReadingRecorder.vue'
import ReadingResume from './components/ReadingResume.vue'
import './custom.css'

// 百度统计的 SPA 页面上报
//
// 为什么必须自己上报：VitePress 是单页应用，站内跳转不刷新页面，而 hm.js 自带的
// 「落地页」上报只在整页加载时发生一次 —— 之后站内翻 10 页，后台也只记到 1 次 PV。
// 更要紧的是，百度统计的「停留时长」是拿相邻两次 PV 的时间戳相减算出来的，
// 缺了后续 PV 就只剩 0，等于「停留多久」这一项直接废掉。
//
// 时序（vitepress 1.6.4 实测）：enhanceApp 先执行，之后才 router.go() 拉取当前页，
// 而 router.go() 同样会触发 onAfterRouteChange。所以这里先记下落地页路径：
// 它已经被 hm.js 报过一次了，钩子里遇到同一路径必须跳过，否则落地页会被记两次。
//
// 上报路径取 window.location.pathname，而不是钩子入参：入参是 normalizeHref 归一化后的值，
// 而地址栏在同一时刻已由 history.pushState 更新完毕，取它才与读者所见一致。
//
// 为什么**不**顺手把 .html 去掉：本项目 cleanUrls=false，站内链接本身就带 .html
// （侧边栏 href 形如 /java/basics/oop-object.html），而落地页那一次由 hm.js 自动上报、
// 报的就是带 .html 的地址栏原值。若这里去掉扩展名，同一个物理页面会在报表里裂成两行
// （落地进来的记 xxx.html、站内点进来的记 xxx），所以上报口径必须与自动上报对齐、原样上报。
//
// 去扩展名只用于**去重**，不做上报：忽略 .html 差异后比较，避免极少数情况下
// （地址栏无扩展名、客户端又 pushState 补上 .html）把落地页重复计一次。
const pageKey = (p: string) =>
  p.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '')

let lastKey = ''

export default {
  extends: DefaultTheme,
  Layout() {
    const { frontmatter } = useData()
    return h(DefaultTheme.Layout, null, {
      // 右侧边栏：导航页渲染分类导航
      'aside-outline-before': () => (frontmatter.value.navRail ? h(NavRail) : null),
      // 最右侧竖版工具栏（侧边栏开关 / 目录开关 / 回到顶部）
      'layout-bottom': () => h(RightRail),
      // 侧边栏长标题的悬停浮层（Teleport 到 body，与布局无关）
      // + 阅读位置记录器（无 UI，须全站常驻 —— 换页时 Layout 不重建，它才活得过导航）
      'layout-top': () => [h(SidebarTip), h(ReadingRecorder)],
      // 「继续上次阅读」横幅：落在 .content-container 内、正文标题之上
      'doc-before': () => h(ReadingResume)
    })
  },
  enhanceApp({ app, router }) {
    app.component('NavBoard', NavBoard)

    // SSR 构建期没有 window，直接退出；否则 build 会崩
    if (typeof window === 'undefined') return

    lastKey = pageKey(window.location.pathname + window.location.search)

    router.onAfterRouteChange = () => {
      const path = window.location.pathname + window.location.search
      const key = pageKey(path)
      if (key === lastKey) return // 落地页 / 页内锚点 / 重复跳转，不重复计数
      lastKey = key
      // 只有 window._hmt 存在才上报：dev 模式不注入脚本、ID 未填时也不注入，
      // 两种情况都不该产生任何请求或报错。
      const hmt = (window as any)._hmt
      if (hmt && typeof hmt.push === 'function') hmt.push(['_trackPageview', path])
    }
  }
}
