// 扩展默认主题，加载全局自定义样式与自定义组件
// 当前自定义：
//   - custom.css：顶部导航 hover/选中态、品牌色、侧边栏宽度、滚动条、收起按钮
//   - SidebarToggle.vue：左侧侧边栏收起/展开开关（导航栏 nav-bar-content-before 插槽，
//     位置=站名右侧、搜索框左侧，后台管理系统常见的汉堡菜单按钮）
//   - AsideToggle.vue：右侧"本页目录"收起/展开开关（导航栏 nav-bar-content-after 插槽）
//   - NavRail.vue：导航页右侧分类导航（aside-outline-before 插槽，frontmatter navRail: true 时渲染）
//   - NavBoard.vue：导航页卡片主体（由 docs/nav.md 引用）
//   - BackToTop.vue：全局回到顶部按钮（layout-bottom 插槽）
import { h } from 'vue'
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import SidebarToggle from './components/SidebarToggle.vue'
import AsideToggle from './components/AsideToggle.vue'
import NavRail from './components/NavRail.vue'
import NavBoard from './components/NavBoard.vue'
import BackToTop from './components/BackToTop.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    const { frontmatter } = useData()
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-before': () => h(SidebarToggle),
      'nav-bar-content-after': () => h(AsideToggle),
      // 右侧边栏：导航页渲染分类导航
      'aside-outline-before': () => (frontmatter.value.navRail ? h(NavRail) : null),
      // 全局回到顶部
      'layout-bottom': () => h(BackToTop)
    })
  },
  enhanceApp({ app }) {
    app.component('NavBoard', NavBoard)
  }
}
