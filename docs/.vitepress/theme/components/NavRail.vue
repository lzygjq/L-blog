<!-- 导航页右侧分类栏：挂在主题 aside-outline-before 插槽，sticky 跟随滚动 -->
<script setup>
import { useData } from 'vitepress'
import { navCategories } from '../data/navData.mjs'

// 只在声明了 navRail: true 的页面渲染
const { frontmatter } = useData()
</script>

<template>
  <nav v-if="frontmatter.navRail" class="nav-rail">
    <p class="nav-rail-title">分类导航</p>
    <a
      v-for="cat in navCategories"
      :key="cat.id"
      class="nav-rail-item"
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
