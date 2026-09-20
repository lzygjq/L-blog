<!-- 阅读位置记录器（无 UI，挂在 layout-top 插槽，全站常驻）
     只做一件事：把当前页的滚动进度定期写进 localStorage。

     ⚠️ 为什么不做「离开页面时精确保存」：
     换页那一刻 VitePress 已经把滚动位置改过了（新页多半是 0），此时读到的值
     属于新页却会被记到旧页名下 —— 顺序不可控。改成**滚动中节流写**（≤800ms
     一次）后，最后一次写入最多滞后 0.8 秒，误差远小于一屏，而且没有时序陷阱。
     真正需要「立刻写」的只有两个时机：切标签页、页面卸载，它们各自补一次。 -->
<script setup>
import { onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vitepress'
import { ARM_PCT, MIN_SCROLL, record } from '../composables/useReadingLog.mjs'

const route = useRoute()

/** 节流窗口：同一页最多每 800ms 落一次盘 */
const THROTTLE = 800

let raf = 0
let lastWrite = 0

const h1Of = () => document.querySelector('.vp-doc h1')?.textContent?.trim() || ''

function save(immediate = false) {
  // 只记录「文档页」。
  // ⚠️ 闸门不能用「有没有 .vp-doc」来判（2026-09-20 实测踩到）：VitePress 的
  //    VPHome 会把首页正文那段 markdown 也渲染成 <Content class="vp-doc">，
  //    拿它当闸门会把首页一起放进来 —— 而落地页没有「读到哪」可言。
  //    正确的判据是**布局**：home 布局直接跳过。
  if (document.querySelector('.VPHome')) return
  if (!document.querySelector('.vp-doc')) return

  const max = document.documentElement.scrollHeight - window.innerHeight
  if (max < MIN_SCROLL) return

  const p = Math.min(1, Math.max(0, window.scrollY / max))

  // 还没真正读起来（刚打开、或读完后滚回了顶部）→ 不写。
  // 少了这道闸，一次「点进来马上退出」就会把上次 62% 的记录冲成 0，
  // 续读功能等于白做。
  if (p < ARM_PCT) return

  const now = Date.now()
  if (!immediate && now - lastWrite < THROTTLE) return
  lastWrite = now

  // 存 window.location.pathname 而不是 route.path：前者已含 base 与 .html，
  // 是能直接拿去当 href 的真实地址形态（见 useReadingLog 的路径形态说明）。
  record(window.location.pathname, p, h1Of())
}

function onScroll() {
  if (raf) return
  raf = window.requestAnimationFrame(() => {
    raf = 0
    save()
  })
}

function onHide() {
  save(true)
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pagehide', onHide)
  document.addEventListener('visibilitychange', onHide) // 切标签 / 关页面时补一次
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('pagehide', onHide)
  document.removeEventListener('visibilitychange', onHide)
  if (raf) window.cancelAnimationFrame(raf)
})

// 换页只重置节流窗口，**不在这里保存** —— 此刻滚动位置已经属于新页，
// 按旧页的路径写下去会得到一条张冠李戴的记录。
watch(
  () => route.path,
  () => {
    lastWrite = 0
  }
)
</script>

<template>
  <span class="reading-recorder" aria-hidden="true" />
</template>

<style scoped>
.reading-recorder {
  display: none;
}
</style>
