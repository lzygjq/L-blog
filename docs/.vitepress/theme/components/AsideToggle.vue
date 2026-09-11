<script setup>
// 右侧"本页目录"（aside）收起/展开开关（导航栏右侧图标按钮，仅 ≥1280px 显示）
// 原理：切换 html 元素上的 .aside-collapsed 类，
// 由 CSS（html.aside-collapsed .VPDoc .aside { display:none }）驱动面板隐藏，
// 同时 --vp-aside-extra 变量让正文阅读列吃掉腾出的空间。
// 状态存 localStorage，刷新后保持。
import { onMounted, ref } from 'vue'

const KEY = 'vp-aside-collapsed'
const collapsed = ref(false)

onMounted(() => {
  collapsed.value = localStorage.getItem(KEY) === '1'
  document.documentElement.classList.toggle('aside-collapsed', collapsed.value)
})

function toggle() {
  collapsed.value = !collapsed.value
  document.documentElement.classList.toggle('aside-collapsed', collapsed.value)
  if (collapsed.value) localStorage.setItem(KEY, '1')
  else localStorage.removeItem(KEY)
}
</script>

<template>
  <button
    class="aside-toggle"
    :class="{ collapsed }"
    :aria-label="collapsed ? '展开本页目录' : '收起本页目录'"
    :title="collapsed ? '展开本页目录' : '收起本页目录'"
    @click="toggle"
  >
    <!-- 目录面板图标：文档 + 右侧面板线，收起态右面板线消失 -->
    <svg class="icon" viewBox="0 0 20 20" width="18" height="18">
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M13.5 3.5v13" fill="none" stroke="currentColor" stroke-width="1.5" :opacity="collapsed ? 0.25 : 1" />
      <path d="M5.5 7.5h5M5.5 10.5h5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  </button>
</template>
