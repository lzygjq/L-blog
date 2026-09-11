// 修复构建死链：把指向 .md 页面的尾斜杠链接改为无斜杠形式
// 如 ](/java/spring/spring-framework/ioc-container/) → ](/java/spring/spring-framework/ioc-container)
// 仅处理 markdown 链接语法 ](/...)，不动代码块、图片外链等；带锚点 # 的同样兼容
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('../docs/', import.meta.url))
const files = execSync('find . -name "*.md" -not -path "./.vitepress/*"', { cwd: ROOT, encoding: 'utf8' })
  .trim()
  .split('\n')

let totalFixes = 0
const detail = []
for (const f of files) {
  const p = join(ROOT, f)
  const src = readFileSync(p, 'utf8')
  // ](/some/path/) 或 ](/some/path/#anchor)，把 path 结尾的 / 去掉
  const out = src.replace(/\]\((\/[^)\s]*)\/([)#])/g, (m, path, tail) => {
    totalFixes++
    return '](' + path + tail
  })
  if (out !== src) {
    writeFileSync(p, out)
    detail.push(f)
  }
}
console.log('fixed files:', detail.length, 'links:', totalFixes)
detail.forEach((f) => console.log(' -', f))
