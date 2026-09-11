<script setup>
// 侧边栏收起/展开开关（仅桌面端显示，见 custom.css 的媒体查询）
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
    <svg class="icon" viewBox="0 0 16 16" width="12" height="12">
      <path
        :d="collapsed ? 'M5.5 2.5 11 8l-5.5 5.5' : 'M10.5 2.5 5 8l5.5 5.5'"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>
</template>
