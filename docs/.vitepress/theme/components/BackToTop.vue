<!-- 全局回到顶部按钮：滚动超过一屏后出现在右下角，平滑滚回顶部 -->
<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const visible = ref(false)

const onScroll = () => {
  visible.value = window.scrollY > 400
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
})
onUnmounted(() => window.removeEventListener('scroll', onScroll))

function toTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <Transition name="btt-fade">
    <button v-if="visible" class="back-to-top" aria-label="回到顶部" title="回到顶部" @click="toTop">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 19V5" />
        <path d="M5 12l7-7 7 7" />
      </svg>
    </button>
  </Transition>
</template>

<style scoped>
/* 回到顶部：挂在 RightRail 竖版工具栏内（static 布局，占位随排列） */
.back-to-top {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: color 0.2s, background-color 0.2s;
}
.back-to-top:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
}

.btt-fade-enter-active,
.btt-fade-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.btt-fade-enter-from,
.btt-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
