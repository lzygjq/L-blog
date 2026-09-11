<script setup>
// 侧边栏收起/展开开关（导航栏内的汉堡菜单按钮，仅桌面端显示，见 custom.css 的媒体查询）
// 原理：切换 html 元素上的 .sidebar-collapsed 类，
// 由 CSS 变量 --vp-sidebar-width（0px / 240px）驱动整体布局收缩。
// 状态存 localStorage，刷新后保持。
import { onMounted, ref } from 'vue'

const KEY = 'vp-sidebar-collapsed'
const collapsed = ref(false)

onMounted(() => {
  collapsed.value = localStorage.getItem(KEY) === '1'
  document.documentElement.classList.toggle('sidebar-collapsed', collapsed.value)
})

function toggle() {
  collapsed.value = !collapsed.value
  document.documentElement.classList.toggle('sidebar-collapsed', collapsed.value)
  if (collapsed.value) localStorage.setItem(KEY, '1')
  else localStorage.removeItem(KEY)
}
</script>

<template>
  <button
    class="sidebar-toggle"
    :class="{ collapsed }"
    :aria-label="collapsed ? '展开侧边栏' : '收起侧边栏'"
    :title="collapsed ? '展开侧边栏' : '收起侧边栏'"
    @click="toggle"
  >
    <!-- 汉堡图标：三横线（上/中/下），收起态中间线缩短 -->
    <svg class="icon" viewBox="0 0 18 18" width="18" height="18">
      <path
        d="M2 4.5h14M2 9h14M2 13.5h9"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
      />
    </svg>
  </button>
</template>
