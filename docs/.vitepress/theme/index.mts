// 扩展默认主题，加载全局自定义样式与自定义组件
// 当前自定义：
//   - custom.css：顶部导航 hover/选中态、品牌色、侧边栏宽度、滚动条、收起按钮
//   - SidebarToggle.vue：左侧侧边栏收起/展开开关（导航栏 nav-bar-content-before 插槽，
//     位置=站名右侧、搜索框左侧，后台管理系统常见的汉堡菜单按钮）
//   - AsideToggle.vue：右侧"本页目录"收起/展开开关（导航栏 nav-bar-content-after 插槽）
import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import SidebarToggle from './components/SidebarToggle.vue'
import AsideToggle from './components/AsideToggle.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-before': () => h(SidebarToggle),
      'nav-bar-content-after': () => h(AsideToggle)
    })
  }
}
