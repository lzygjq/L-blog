// 构建时扫描数字人目录，供 index.md 的 AutoList 渲染
import { createContentLoader } from 'vitepress'

export default createContentLoader('/ai/digital-human/*.md', {
  transform(raw) {
    return raw
      .filter((p) => !p.frontmatter.draft && !p.url.endsWith('/digital-human/'))
      .sort((a, b) => (a.frontmatter.order ?? 999) - (b.frontmatter.order ?? 999))
  },
})
