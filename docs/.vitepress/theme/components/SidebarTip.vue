<script setup>
// 侧边栏长条目标题：单行缩略（CSS 省略号）+ 悬停浮层展示全文
//
// 浮层位置（2026-09-13 第二版，用户反馈"把原来的菜单挡住了"后改）：
//   默认贴侧边栏**右侧**弹出，竖向居中于被截断的那一条，左缘带箭头指向它 —— 菜单一条都不遮。
//   右侧空间不足（窄视口）时才回退到侧边栏内部（此时隐藏箭头）。
//
// 为什么不用另外两种做法：
//   ① 纯 CSS ::after 浮层 —— .VPSidebar 是 position:fixed + overflow:auto，
//      浮层会被裁掉（列表底部的条目首当其冲）。
//   ② 悬停就地展开 —— 会把下方条目整体推下去，鼠标扫过列表时菜单跳动、容易误点。
// 所以浮层 Teleport 到 body、用 fixed 定位：不裁切、不推动布局。
//
// 触发规则：只有「被 CSS 省略号截断」的条目才弹（scrollWidth > clientWidth），
// 未截断的短条目保持原样，不会无端冒出一个浮层。
// 隐藏时机：鼠标移出侧边栏 / 滚动 / 换页 / 卸载。
import { onMounted, onBeforeUnmount, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()

const show = ref(false)
const ready = ref(false)
const inside = ref(false) // 回退到侧边栏内部（右侧没空间）
const text = ref('')
const tipRef = ref(null)
const style = ref({})

const GAP = 8
const MAX_W = 320

let current = null

const hide = () => {
  show.value = false
  ready.value = false
  current = null
}

// 分组标题的文本是 .item > .text，条目的文本是 .item > .link > .text
const textOf = (item) =>
  item.querySelector(':scope > .text') || item.querySelector(':scope > .link > .text')

const place = () => {
  const el = tipRef.value
  if (!current || !el) return
  const h = el.offsetHeight
  const r = current.getBoundingClientRect()
  const sb = document.querySelector('.VPSidebar')?.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const sidebarRight = sb ? sb.right : 0
  // 右侧可用宽度（含与右侧内容的留白）
  const roomRight = vw - sidebarRight - GAP * 2

  if (roomRight >= 200) {
    inside.value = false
    style.value = {
      left: `${sidebarRight + GAP}px`,
      maxWidth: `${Math.min(MAX_W, roomRight)}px`
    }
  } else {
    inside.value = true
    style.value = {
      left: `${(sb ? sb.left : 0) + GAP}px`,
      maxWidth: `${Math.max(180, (sb ? sb.width : 240) - GAP * 2)}px`
    }
  }

  // 竖向：居中于该条目，并夹在视口内
  const center = r.top + r.height / 2
  let top = center - h / 2
  top = Math.max(GAP, Math.min(top, vh - h - GAP))
  style.value = { ...style.value, top: `${top}px` }
  // 箭头指向该条目的中线（相对浮层顶端）
  style.value = { ...style.value, '--tip-arrow-top': `${Math.round(center - top)}px` }
  ready.value = true
}

const onOver = (e) => {
  const item = e.target?.closest?.('.VPSidebar .VPSidebarItem > .item')
  if (!item) {
    hide()
    return
  }
  if (item === current) return

  const t = textOf(item)
  // 没被截断就不弹，避免短条目也冒浮层
  if (!t || t.scrollWidth <= t.clientWidth + 1) {
    hide()
    return
  }

  current = item
  text.value = (t.textContent || '').trim()
  ready.value = false
  show.value = true

  nextTick(() => {
    if (current !== item) return
    place()
  })
}

onMounted(() => {
  document.addEventListener('mouseover', onOver, true)
  document.addEventListener('scroll', hide, true)
  window.addEventListener('resize', hide)
})

onBeforeUnmount(() => {
  document.removeEventListener('mouseover', onOver, true)
  document.removeEventListener('scroll', hide, true)
  window.removeEventListener('resize', hide)
})

watch(() => route.path, hide)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      ref="tipRef"
      class="sidebar-tip"
      :class="{ 'is-ready': ready, 'sidebar-tip--inside': inside }"
      :style="style"
      aria-hidden="true"
    >
      {{ text }}
    </div>
  </Teleport>
</template>
