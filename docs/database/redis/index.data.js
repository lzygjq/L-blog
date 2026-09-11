// 构建时扫描 Redis 目录，供 index.md 的 AutoList 渲染
// 新增文章落在本目录即自动出现，无需手更导览表
import { createContentLoader } from 'vitepress'

export default createContentLoader('/database/redis/*.md', {
  transform(raw) {
    return raw
      .filter((p) => !p.frontmatter.draft && !p.url.endsWith('/redis/'))
      .sort((a, b) => (a.frontmatter.order ?? 999) - (b.frontmatter.order ?? 999))
  },
})
