// 扩展默认主题，加载全局自定义样式与自定义组件
// 当前自定义：
//   - custom.css：品牌色、pdai 风格卡片式布局（灰底+白卡片+间隙）、
//     顶部导航居中/hover/选中态、侧边栏宽度、滚动条
//   - RightRail.vue：最右侧竖版工具栏（layout-bottom 插槽，fixed 定位），
//     内含侧边栏开关（原导航栏左上角）、本页目录开关（原导航栏右侧）、回到顶部
//   - SidebarToggle.vue / AsideToggle.vue：左栏/目录开关（由 RightRail 引用）
//   - NavRail.vue：导航页右侧分类导航（aside-outline-before 插槽，frontmatter navRail: true 时渲染）
//   - NavBoard.vue：导航页卡片主体（由 docs/nav.md 引用）
//   - BackToTop.vue：回到顶部（由 RightRail 引用）
//   - SidebarTip.vue：侧边栏长条目标题的单行缩略 + 悬停浮层（挂 layout-bottom）
import { h } from 'vue'
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import RightRail from './components/RightRail.vue'
import NavRail from './components/NavRail.vue'
import NavBoard from './components/NavBoard.vue'
import SidebarTip from './components/SidebarTip.vue'
import './custom.css'

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
      'layout-top': () => h(SidebarTip)
    })
  },
  enhanceApp({ app }) {
    app.component('NavBoard', NavBoard)
  }
}
