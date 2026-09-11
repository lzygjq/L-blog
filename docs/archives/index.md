---
date: 2026-09-11
---

# 归档

全站文章按时间倒序排列，构建时自动生成——新文章落对目录并带上 `date` frontmatter 即自动收录。

<script setup>
import ArchiveTimeline from '../.vitepress/theme/components/ArchiveTimeline.vue'
import { data } from './index.data.js'
</script>

<ArchiveTimeline :items="data" />
