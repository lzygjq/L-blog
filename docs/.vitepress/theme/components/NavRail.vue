<!-- 导航页右侧分类栏：挂在主题 aside-outline-before 插槽，sticky 跟随滚动；
     内置 scroll-spy：滚动时高亮当前浏览到的分类 -->
<script setup>
import { useData } from 'vitepress'
import { onMounted, onUnmounted, ref } from 'vue'
import { navCategories } from '../data/navData.mjs'

// 只在声明了 navRail: true 的页面渲染
const { frontmatter } = useData()

// ── scroll-spy：高亮当前滚动所在分类 ──────
// activeId 与模板中分类一一对应；筛选态下区块被 v-if 移除时自动置空
const activeId = ref('')

// 判定阈值：区块标题越过视口顶部 160px 即认为进入
// （锚点跳转后区块 top 实测停在 ~134px：VitePress 导航栏 + scroll-margin 叠加，阈值需大于它）
const THRESHOLD = 160

let ticking = false

function updateActive() {
  ticking = false
  const sections = document.querySelectorAll('section[id^="nav-"]')
  if (!sections.length) {
    activeId.value = ''
    return
  }
  let current = ''
  for (const sec of sections) {
    if (sec.getBoundingClientRect().top <= THRESHOLD) {
      current = sec.id
    } else {
      break
    }
  }
  // 滚动到底部时强制高亮最后一个可见分类（短区块会被顶过阈值）
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
    current = sections[sections.length - 1].id
  }
  // 页面顶部（尚无区块越过阈值）默认高亮第一个分类，避免空选态
  if (!current) current = sections[0].id
  activeId.value = current.replace(/^nav-/, '')
}

function onScroll() {
  if (!ticking) {
    ticking = true
    requestAnimationFrame(updateActive)
  }
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  updateActive()
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
})
</script>

<template>
  <nav v-if="frontmatter.navRail" class="nav-rail">
    <p class="nav-rail-title">分类导航</p>
    <a
      v-for="cat in navCategories"
      :key="cat.id"
      class="nav-rail-item"
      :class="{ 'is-active': activeId === cat.id }"
      :href="'#nav-' + cat.id"
    >
      <span class="nav-rail-icon">{{ cat.icon }}</span>
      <span class="nav-rail-text">{{ cat.title }}</span>
    </a>
  </nav>
</template>

<style scoped>
.nav-rail {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 2px;
}
.nav-rail-title {
  margin: 0 0 8px !important;
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.nav-rail-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 8px;
  font-size: 13px;
  line-height: 22px;
  border-radius: 6px;
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color 0.15s, background-color 0.15s;
}
.nav-rail-item:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
/* 选中态：品牌色文字 + 浅色底 + 左侧指示条 */
.nav-rail-item.is-active {
  color: var(--vp-c-brand-1);
  font-weight: 600;
  background: var(--vp-c-brand-soft);
}
.nav-rail-item.is-active::before {
  content: '';
  position: absolute;
  left: -2px;
  top: 5px;
  bottom: 5px;
  width: 3px;
  border-radius: 2px;
  background: var(--vp-c-brand-1);
}
.nav-rail-icon {
  flex-shrink: 0;
  font-size: 14px;
}
.nav-rail-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
