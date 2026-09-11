// 死链修复第二轮：VitePress 解析规则 = 无斜杠找 path.md，有斜杠找 path/index.md
// 对无尾斜杠的站内链接：若不存在 path.md 但存在 path/index.md → 补回尾斜杠
// 两者都不存在的列出来人工处理（真死链）
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'

const ROOT = fileURLToPath(new URL('../docs/', import.meta.url))
const files = execSync('find . -name "*.md" -not -path "./.vitepress/*"', { cwd: ROOT, encoding: 'utf8' })
  .trim()
  .split('\n')

let fixed = 0
const missing = new Map() // link -> [来源文件]
for (const f of files) {
  const p = join(ROOT, f)
  const src = readFileSync(p, 'utf8')
  const out = src.replace(/\]\((\/[^)#\s]+)(#[^)]*)?\)/g, (m, path, anchor = '') => {
    // 已有尾斜杠（目录链接）或带扩展名的，跳过
    if (path.endsWith('/')) return m
    const mdFile = join(ROOT, path.slice(1) + '.md')
    const dirIndex = join(ROOT, path.slice(1), 'index.md')
    if (existsSync(mdFile)) return m // 页面链接，保持
    if (existsSync(dirIndex)) {
      fixed++
      return '](' + path + '/' + anchor + ')'
    }
    // 真死链：目标不存在
    if (!missing.has(path)) missing.set(path, [])
    missing.get(path).push(f)
    return m
  })
  if (out !== src) writeFileSync(p, out)
}
console.log('补回目录斜杠:', fixed)
if (missing.size) {
  console.log('真死链（目标文件不存在）:')
  for (const [link, srcs] of missing) console.log(' -', link, '<-', [...new Set(srcs)].join(', '))
} else console.log('真死链: 无')
