<!-- 成长路线固定入口（挂在最右侧 48px 竖版工具栏顶部，由 RightRail 引用）
     为什么需要它：站点是**两轴正交**的 —— 6 个板块是「领域轴（用来查）」，L1→L4 是
     「深度轴（用来走）」；而左侧 sidebar 按**路径前缀**映射，只显示当前板块下的内容，
     所以在 `database/`、`java/` 等板块里根本看不到成长路线，缺一个**全站常驻**的入口。

     2026-09-17 的两个决策：
     ① 位置 —— 先试过提到顶部导航首项，同日撤回（用户口径：入口要在这条右侧竖栏里）。
        顶部导航的语义就是「6 个板块」，不该混入非板块项。
     ② 形态 —— 用**文字**而不是图标：栏只有 48px 宽，指南针/地图/台阶一类的图标
        表意模糊、还要靠 hover 才知道是什么；四个汉字排成 2×2（「成长」/「路线」）
        在这个尺寸下反而一眼可辨，也不必依赖 tooltip。 -->
<script setup>
import { computed } from 'vue'
import { useData } from 'vitepress'

const { page } = useData()

// 当前在成长路线（含 L1–L4 子页）时高亮。
// 判据用 `relativePath` 而不是地址栏 / href：本站 cleanUrls=false，地址栏既有
// 带尾斜杠的目录形态、也可能出现 index.html，拿路径字符串比容易漏判；
// relativePath 恒为 `projects/architect-roadmap/…` 这种稳定形态。
const active = computed(() =>
  page.value.relativePath.startsWith('projects/architect-roadmap/')
)
</script>

<template>
  <a
    class="roadmap-link"
    :class="{ active }"
    href="/projects/architect-roadmap/"
    aria-label="成长路线"
    title="成长路线：开发 → 高级开发 → 架构师 → CIO"
  >
    <span class="rn-line">成长</span>
    <span class="rn-line">路线</span>
  </a>
</template>

<style scoped>
/* 尺寸与 hover 态对齐同栏的 BackToTop（36×36 / 圆角 8 / 静默色 → 品牌色 + 软底） */
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
/* 选中态：品牌色 + 软底（与顶部导航、NavRail 的高亮口径一致） */
.roadmap-link.active {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
.rn-line {
  display: block;
}
</style>
