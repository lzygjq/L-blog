<!-- 「继续上次阅读」横幅（doc-before 插槽，落在正文容器顶部、标题之上）
     行为：只在「本页有可用的历史位置」时出现；读者一旦滚到记录点附近就自动消失
     ——它的职责是提示「你上次停在这」，不是常驻横幅。

     ⚠️ 挂 doc-before 而不是做浮动胶囊：doc-before 在 .content-container 内部、
     正常文档流里，不会与右栏、回到顶部、沉浸模式退出按钮抢位置，
     也不需要 z-index / 定位计算。 -->
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vitepress'
import { ARM_PCT, DONE_PCT, agoText, entryOf, forget } from '../composables/useReadingLog.mjs'

const route = useRoute()

/** SSR 期不渲染：记录只在客户端存在，先渲染再补会触发水合不一致 */
const ready = ref(false)

/** 本次访问是否已处理（点过跳转 / 点过从头开始） */
const handled = ref(false)
/** 读者已自行滚到记录点之后 */
const caughtUp = ref(false)

/** 本次访问开始时取到的记录快照。刻意不跟着滚动实时更新 —— 否则
     一边读、横幅上的百分比一边跳，反而干扰 */
const saved = ref(null)

function refresh() {
  saved.value = entryOf(window.location.pathname)
  handled.value = false
  caughtUp.value = false
}

const pct = computed(() => (saved.value ? Math.round(saved.value.p * 100) : 0))

const show = computed(
  () =>
    ready.value &&
    !handled.value &&
    !caughtUp.value &&
    !!saved.value &&
    saved.value.p >= ARM_PCT &&
    saved.value.p < DONE_PCT
)

function jump() {
  if (!saved.value) return
  const max = document.documentElement.scrollHeight - window.innerHeight
  window.scrollTo({ top: Math.max(0, saved.value.p * max - 80), behavior: 'smooth' })
  handled.value = true
}

function restart() {
  forget(window.location.pathname)
  handled.value = true
}

/** 读者已经读到（或越过）上次的位置 → 提示自动退场 */
function onScroll() {
  if (!saved.value || handled.value) return
  const max = document.documentElement.scrollHeight - window.innerHeight
  if (max <= 0) return
  caughtUp.value = window.scrollY / max >= saved.value.p - 0.01
}

onMounted(() => {
  refresh()
  ready.value = true
  window.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => window.removeEventListener('scroll', onScroll))

// 兜底：SPA 换页时若插槽内容被复用（未重新挂载），靠它刷新
watch(() => route.path, refresh)
</script>

<template>
  <Transition name="rr-fade">
    <div v-if="show" class="reading-resume">
      <svg
        class="rr-icon"
        viewBox="0 0 20 20"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M10 5.2v5l3 1.8" />
        <path d="M10 2.6a7.4 7.4 0 1 1-7.4 7.4" />
      </svg>

      <span class="rr-text">
        上次读到 <b>{{ pct }}%</b>
        <span class="rr-ago">{{ agoText(saved.t) }}</span>
      </span>

      <span class="rr-actions">
        <button type="button" class="rr-jump" @click="jump">跳到该处</button>
        <button type="button" class="rr-restart" @click="restart">从头开始</button>
      </span>
    </div>
  </Transition>
</template>

<style scoped>
.reading-resume {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 7px 10px 7px 12px;
  border: 1px solid var(--vp-c-divider);
  border-left: 3px solid var(--vp-c-brand-1);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  font-size: 13px;
  line-height: 20px;
  color: var(--vp-c-text-2);
}

.rr-icon {
  flex-shrink: 0;
  color: var(--vp-c-brand-1);
}

.rr-text {
  flex: 1 1 auto;
  min-width: 0;
}

.rr-text b {
  color: var(--vp-c-text-1);
  font-weight: 600;
}

.rr-ago {
  margin-left: 6px;
  color: var(--vp-c-text-3);
  font-size: 12px;
}

.rr-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.rr-jump,
.rr-restart {
  border: none;
  background: transparent;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: color 0.2s, background-color 0.2s;
}

.rr-jump {
  color: var(--vp-c-brand-1);
  font-weight: 500;
}

.rr-jump:hover {
  background: var(--vp-c-brand-soft);
}

.rr-restart:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-default-soft, var(--vp-c-bg-soft));
}

.rr-fade-enter-active,
.rr-fade-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.rr-fade-enter-from,
.rr-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 窄屏：动作按钮换行到第二行，避免挤压正文列 */
@media (max-width: 640px) {
  .reading-resume {
    flex-wrap: wrap;
  }

  .rr-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
