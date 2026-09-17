<!-- 右侧竖栏文字入口（挂在 48px 工具栏顶部，由 RightRail 引用）
     站点两轴正交：6 个板块是领域轴（用来查），成长路线 / 架构路线是两条「用来走」的主线。
     左侧 sidebar 按路径前缀映射，在非 projects 板块里看不到这两条，所以要全站常驻入口。

     形态用文字而不是图标：栏只有 48px 宽，图标表意模糊；四个汉字排成 2×2
     （「成长」/「路线」、「架构」/「路线」）一眼可辨。 -->
<script setup>
import { computed } from 'vue'
import { useData } from 'vitepress'

const props = defineProps({
  href: { type: String, required: true },
  prefix: { type: String, required: true },
  line1: { type: String, required: true },
  line2: { type: String, required: true },
  ariaLabel: { type: String, required: true },
  title: { type: String, required: true }
})

const { page } = useData()

// 判据用 relativePath：cleanUrls=false 时地址栏形态不稳，relativePath 恒为 `projects/…`
const active = computed(() => page.value.relativePath.startsWith(props.prefix))
</script>

<template>
  <a
    class="roadmap-link"
    :class="{ active }"
    :href="href"
    :aria-label="ariaLabel"
    :title="title"
  >
    <span class="rn-line">{{ line1 }}</span>
    <span class="rn-line">{{ line2 }}</span>
  </a>
</template>

<style scoped>
.roadmap-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 8px;
  color: var(--vp-c-text-2);
  text-decoration: none;
  font-size: 11px;
  line-height: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: color 0.2s, background-color 0.2s;
}
.roadmap-link:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
}
.roadmap-link.active {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
.rn-line {
  display: block;
}
</style>
