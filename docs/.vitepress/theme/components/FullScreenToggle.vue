<!-- 全屏阅读开关（参考 pdai.tech 右侧悬浮条的全屏图标）：
     调用浏览器原生 Fullscreen API 让整个文档进入全屏，隐藏浏览器标签栏/地址栏，
     阅读区域最大化；再点一次或按 Esc 退出。
     说明：不用 F11 那种「浏览器全屏」，而是 Fullscreen API —— 这样才能用按钮控制、
     并且能通过 fullscreenchange 事件同步图标状态（用户按 Esc 退出时图标也要跟着变） -->
<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const isFull = ref(false)
const supported = ref(true)

// Safari 用 webkit 前缀，统一取一个当前的全屏元素
const currentEl = () =>
  document.fullscreenElement || document.webkitFullscreenElement || null

const sync = () => {
  isFull.value = !!currentEl()
}

async function toggle() {
  try {
    if (currentEl()) {
      if (document.exitFullscreen) await document.exitFullscreen()
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
    } else {
      const el = document.documentElement
      if (el.requestFullscreen) await el.requestFullscreen()
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
    }
  } catch {
    // 浏览器策略拒绝（如非用户手势触发）时静默失败，不改动图标
  }
  // requestFullscreen 是异步的，fullscreenchange 会再同步一次；这里先兜底一次
  sync()
}

onMounted(() => {
  supported.value = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled)
  document.addEventListener('fullscreenchange', sync)
  document.addEventListener('webkitfullscreenchange', sync)
  sync()
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', sync)
  document.removeEventListener('webkitfullscreenchange', sync)
})
</script>

<template>
  <button
    v-if="supported"
    class="fullscreen-toggle"
    :class="{ active: isFull }"
    :aria-label="isFull ? '退出全屏' : '全屏阅读'"
    :title="isFull ? '退出全屏（Esc）' : '全屏阅读'"
    @click="toggle"
  >
    <!-- 未全屏：四个朝外的直角（展开）；全屏中：四个朝内的直角（收起） -->
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
      <template v-if="!isFull">
        <path d="M3.2 7.4V4.7c0-.83.67-1.5 1.5-1.5h2.7" />
        <path d="M12.6 3.2h2.7c.83 0 1.5.67 1.5 1.5v2.7" />
        <path d="M16.8 12.6v2.7c0 .83-.67 1.5-1.5 1.5h-2.7" />
        <path d="M7.4 16.8H4.7c-.83 0-1.5-.67-1.5-1.5v-2.7" />
      </template>
      <template v-else>
        <path d="M7.4 3.2v2.7c0 .83-.67 1.5-1.5 1.5H3.2" />
        <path d="M16.8 7.4h-2.7c-.83 0-1.5-.67-1.5-1.5V3.2" />
        <path d="M12.6 16.8v-2.7c0-.83.67-1.5 1.5-1.5h2.7" />
        <path d="M3.2 12.6h2.7c.83 0 1.5.67 1.5 1.5v2.7" />
      </template>
    </svg>
  </button>
</template>
