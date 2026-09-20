<!-- 「最近阅读」入口（右侧竖栏「阅读工具」段第一位）
     按钮点开一个浮层面板，列出最近读过的页面 + 各自进度，点击即跳转。

     ⚠️ 浮层为什么 Teleport 到 body：.right-rail 是 fixed + 窄条（48px），
     浮层放里面会被裁掉。与 SidebarTip.vue 同一套做法，位置在打开时算一次。

     ⚠️ 本按钮是 .right-rail 的直接子元素，因此会被 custom.css 的
     `html.immersive .right-rail > *` 规则一并隐藏（沉浸模式只留退出按钮）——
     这是刻意的：沉浸模式的语义就是「只剩正文」，多一个入口就不叫沉浸了。
     浮层若在打开状态下进入沉浸模式，会由「点击 .immersive-toggle 属于外部点击」
     自动关掉，不需要额外联动。 -->
<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vitepress'
import { agoText, clearAll, recentList } from '../composables/useReadingLog.mjs'

const route = useRoute()

const open = ref(false)
const ready = ref(false) // SSR 期不渲染列表，避免水合不一致
const btnRef = ref(null)
const panelRef = ref(null)
const pos = ref({ top: 0, left: 0 })

const PANEL_W = 300
const GAP = 8
const LIMIT = 8

const items = computed(() => (ready.value ? recentList(LIMIT) : []))
const count = computed(() => (ready.value ? items.value.length : 0))

function place() {
  const r = btnRef.value?.getBoundingClientRect()
  if (!r) return
  const h = panelRef.value?.offsetHeight || 260
  pos.value = {
    // 顶部与按钮对齐；底部越界时上提
    top: Math.max(GAP, Math.min(r.top, window.innerHeight - h - GAP)),
    // 贴按钮左侧弹出（右栏在最右缘，左侧才是正文区）
    left: Math.max(GAP, r.left - PANEL_W - GAP)
  }
}

function toggle() {
  open.value = !open.value
  if (open.value) nextTick(place)
}

function close() {
  open.value = false
}

function onDocClick(e) {
  if (!open.value) return
  if (panelRef.value?.contains(e.target)) return
  if (btnRef.value?.contains(e.target)) return
  close()
}

function onKey(e) {
  if (e.key === 'Escape' && open.value) close()
}

onMounted(() => {
  ready.value = true
  document.addEventListener('click', onDocClick, true)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', close)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick, true)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', close)
})

// 换页即关：列表里的链接点了之后不该留一块浮层盖在新页上
watch(() => route.path, close)

const pctOf = (v) => Math.round((v.p || 0) * 100)
</script>

<template>
  <button
    ref="btnRef"
    class="reading-log-toggle"
    :class="{ active: open }"
    :aria-expanded="open"
    aria-haspopup="true"
    aria-label="最近阅读"
    title="最近阅读：回到上次读过的页面"
    @click="toggle"
  >
    <!-- 图标：时钟回溯（与「回到顶部」的箭头区分开） -->
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
      <path d="M10 5.4V10l3.2 1.9" />
      <path d="M3.4 10a6.6 6.6 0 1 1 2 4.7" />
      <path d="M3.2 10.6h3M3.2 10.6V7.8" />
    </svg>
    <span v-if="count" class="rl-dot" aria-hidden="true" />
  </button>

  <Teleport to="body">
    <Transition name="rl-fade">
      <div
        v-if="open"
        ref="panelRef"
        class="reading-log-panel"
        role="dialog"
        aria-label="最近阅读"
        :style="{ top: pos.top + 'px', left: pos.left + 'px', width: PANEL_W + 'px' }"
      >
        <div class="rl-head">
          <span class="rl-title">最近阅读</span>
          <button v-if="items.length" type="button" class="rl-clear" @click="clearAll">清空</button>
        </div>

        <p v-if="!items.length" class="rl-empty">
          还没有记录。读到页面中段再离开，这里就会出现「上次读到哪」。
        </p>

        <a v-for="it in items" :key="it.key" class="rl-item" :href="it.path">
          <span class="rl-item-title">{{ it.h1 || it.path }}</span>
          <span class="rl-item-meta">
            <span class="rl-pct" :class="{ done: (it.p || 0) >= 0.95 }">
              {{ (it.p || 0) >= 0.95 ? '已读完' : pctOf(it) + '%' }}
            </span>
            <span class="rl-time">{{ agoText(it.t) }}</span>
          </span>
        </a>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 与 .immersive-toggle / .sidebar-toggle 同款 36×36 圆角方块 */
.reading-log-toggle {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: color 0.2s ease, background-color 0.2s ease;
}

.reading-log-toggle:hover,
.reading-log-toggle.active {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
}

/* 有记录时的小圆点：告诉读者「这里存着东西」 */
.rl-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
}
</style>

<!-- 浮层样式不加 scoped：它被 Teleport 到 body 后不在组件子树内，
     scoped 属性选择器依赖 data-v 属性，Teleport 的内容仍带该属性，
     但为免踩坑（不同 Vue 版本行为差异），这里用全局类名 + 前缀隔离 -->
<style>
.reading-log-panel {
  position: fixed;
  z-index: 60;
  padding: 6px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
  font-size: 13px;
  line-height: 20px;
}

.reading-log-panel .rl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 6px;
}

.reading-log-panel .rl-title {
  color: var(--vp-c-text-3);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.reading-log-panel .rl-clear {
  border: none;
  background: transparent;
  padding: 2px 6px;
  border-radius: 5px;
  color: var(--vp-c-text-3);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.2s, background-color 0.2s;
}

.reading-log-panel .rl-clear:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
}

.reading-log-panel .rl-empty {
  margin: 0;
  padding: 6px 8px 10px;
  color: var(--vp-c-text-3);
  font-size: 12px;
  line-height: 1.6;
}

.reading-log-panel .rl-item {
  display: block;
  padding: 6px 8px;
  border-radius: 7px;
  text-decoration: none;
  transition: background-color 0.2s;
}

.reading-log-panel .rl-item:hover {
  background: var(--vp-c-bg-soft);
}

.reading-log-panel .rl-item-title {
  display: block;
  overflow: hidden;
  color: var(--vp-c-text-1);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.reading-log-panel .rl-item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 1px;
  color: var(--vp-c-text-3);
  font-size: 12px;
}

.reading-log-panel .rl-pct {
  color: var(--vp-c-brand-1);
  font-variant-numeric: tabular-nums;
}

.reading-log-panel .rl-pct.done {
  color: var(--vp-c-text-3);
}

.reading-log-panel .rl-time {
  font-variant-numeric: tabular-nums;
}

/* 过渡类也放全局块：浮层被 Teleport 到 body，与其赌 scoped 属性是否跟着过去，
   不如用这套（带 .reading-log-panel 之外的独立前缀，避免撞名） */
.rl-fade-enter-active,
.rl-fade-leave-active {
  transition: opacity 0.18s, transform 0.18s;
}

.rl-fade-enter-from,
.rl-fade-leave-to {
  opacity: 0;
  transform: translateX(6px);
}
</style>
