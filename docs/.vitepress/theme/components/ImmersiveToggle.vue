<script setup>
// 沉浸阅读模式开关（右侧竖栏「阅读工具」段）
//
// 目标：一键只剩正文 —— 顶部导航、左侧目录、右侧「本页目录」全部隐藏，
// 正文列吃掉腾出的宽度。
//
// ⚠️ 为什么挂在右侧竖栏、而不是顶部导航栏里：
//   本模式会整条隐藏顶部导航（.VPNav）。开关若挂在其中，进入后按钮本身
//   也一起消失 —— **点了就退不出来**。右侧竖栏在沉浸模式下收缩为
//   「只剩这一颗按钮」的小卡片、贴右上角常驻（见 custom.css），是唯一自洽的落点。
//
// 实现与 SidebarToggle / AsideToggle 同构：切换 html 上的 .immersive 类，
// 由 custom.css 驱动布局，状态存 localStorage 刷新后保持。
import { onMounted, onUnmounted, ref } from 'vue'

const KEY = 'vp-immersive'
const on = ref(false)

function apply(v) {
  on.value = v
  document.documentElement.classList.toggle('immersive', v)
  if (v) localStorage.setItem(KEY, '1')
  else localStorage.removeItem(KEY)
}

const toggle = () => apply(!on.value)

// Esc 也可退出。正在全屏时不拦 —— 浏览器要用 Esc 退全屏，
// 两者叠加时按两次 Esc 依次退出（先全屏、后沉浸），不互相抢。
function onKey(e) {
  if (e.key !== 'Escape' || !on.value) return
  if (document.fullscreenElement || document.webkitFullscreenElement) return
  apply(false)
}

onMounted(() => {
  apply(localStorage.getItem(KEY) === '1')
  document.addEventListener('keydown', onKey)
})
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <button
    class="immersive-toggle"
    :class="{ active: on }"
    :aria-pressed="on"
    :aria-label="on ? '退出沉浸阅读' : '沉浸阅读，只留正文'"
    :title="on ? '退出沉浸阅读（Esc）' : '沉浸阅读：只留正文，隐藏顶栏与左侧目录'"
    @click="toggle"
  >
    <!-- 图标：摊开的书。进入沉浸后整颗按钮品牌色常亮（见 custom.css），
         与 FullScreenToggle 的 active 表达一致 -->
    <svg
      class="icon"
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M10 5.4C8.7 4.3 7.1 3.8 5.3 3.8H2.6v11h2.7c1.8 0 3.4.5 4.7 1.6" />
      <path d="M10 5.4c1.3-1.1 2.9-1.6 4.7-1.6h2.7v11h-2.7c-1.8 0-3.4.5-4.7 1.6" />
      <path d="M10 5.4v11" />
    </svg>
  </button>
</template>
