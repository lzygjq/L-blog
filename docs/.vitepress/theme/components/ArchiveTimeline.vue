<script setup>
// 归档时间轴：数据来自 /archives/index.data.js（createContentLoader 全站扫描）
// 按「年-月」分组倒序展示，新文章只需落对目录 + 带 date frontmatter 即自动收录
import { computed } from 'vue'

const props = defineProps({
  items: { type: Array, required: true },
})

const groups = computed(() => {
  const map = new Map()
  for (const it of props.items) {
    const d = new Date(it.frontmatter.date)
    const key = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
    if (!map.has(key)) map.set(key, [])
    map.get(key).push({
      ...it,
      monthDay: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    })
  }
  return [...map.entries()].map(([month, posts]) => ({ month, posts, count: posts.length }))
})
</script>

<template>
  <div class="archive-timeline">
    <section v-for="g in groups" :key="g.month" class="month-group">
      <h2>{{ g.month }} <span class="count">{{ g.count }} 篇</span></h2>
      <ul>
        <li v-for="p in g.posts" :key="p.url">
          <span class="day">{{ p.monthDay }}</span>
          <a :href="p.url">{{ p.frontmatter.title }}</a>
          <span v-if="p.frontmatter.desc" class="desc">{{ p.frontmatter.desc }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.month-group h2 {
  margin-top: 2rem;
  border-bottom: 1px solid var(--vp-c-divider);
  padding-bottom: 0.4rem;
}
.count {
  font-size: 0.85em;
  color: var(--vp-c-text-3);
  font-weight: normal;
  margin-left: 0.5rem;
}
.month-group ul {
  list-style: none;
  padding-left: 0;
  margin: 0.5rem 0;
}
.month-group li {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.3rem 0;
}
.day {
  flex: none;
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.8em;
  color: var(--vp-c-text-3);
}
.desc {
  color: var(--vp-c-text-3);
  font-size: 0.85em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 767px) {
  .desc {
    display: none;
  }
}
</style>
