---
date: 2026-09-11
---

# 归档

全站文章按时间倒序排列，构建时自动按「年 → 月 → 日」分组生成。新文章只需落对目录并带上 `date` frontmatter 即自动收录；再补一行 `desc`（一句话摘要）会在标题下方显示摘要 —— **它是列表疏密均匀的前提**，缺了就只有标题、行高与相邻条目对不齐。

<script setup>
import ArchiveTimeline from '../.vitepress/theme/components/ArchiveTimeline.vue'
import { data } from './index.data.js'
</script>

<ArchiveTimeline :items="data" />
