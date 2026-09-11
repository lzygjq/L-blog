// 扩展默认主题，加载全局自定义样式与自定义组件
// 当前自定义：
//   - custom.css：顶部导航 hover/选中态、品牌色、侧边栏宽度、滚动条、收起按钮
//   - SidebarToggle.vue：侧边栏收起/展开开关（挂在 sidebar-nav-before 插槽）
import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import SidebarToggle from './components/SidebarToggle.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'sidebar-nav-before': () => h(SidebarToggle)
    })
  }
}
