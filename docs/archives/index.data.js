// 构建时扫描全站文章，供 /archives/ 时间轴页渲染
// 规则：排除 draft、排除目录索引页（url 以 / 结尾）、排除首页；按日期倒序
import { createContentLoader } from 'vitepress'

export default createContentLoader('/**/*.md', {
  transform(raw) {
    return raw
      .filter(
        (p) =>
          !p.frontmatter.draft &&
          !p.url.endsWith('/') &&
          p.url !== '/' &&
          p.frontmatter.title &&
          p.frontmatter.date
      )
      .sort((a, b) => +new Date(b.frontmatter.date) - +new Date(a.frontmatter.date))
  },
})
