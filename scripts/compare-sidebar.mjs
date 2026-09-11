/**
 * 侧边栏结构比对：旧 config（git HEAD 版本，手写数组） vs 新 sidebar.mjs 生成结果
 * 用法：node scripts/compare-sidebar.mjs
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = '/Users/echo/程序/tech-blog'

function toModule(src, absSidebarPath) {
  let code = src
    .replace(/import \{ defineConfig \} from 'vitepress'/, "const defineConfig = (x) => x")
    .replace(
      /import \{ buildSidebar \} from '\.\/sidebar\.mjs'/,
      `const { buildSidebar } = await import('file://${absSidebarPath}')`
    )
  const b64 = Buffer.from(code, 'utf8').toString('base64')
  return import('data:text/javascript;base64,' + b64)
}

function flatten(items, out = [], depth = 0) {
  for (const it of items || []) {
    out.push(`${depth}|${it.text}|${it.link || 'GROUP'}|${it.collapsed ?? '-'}`)
    if (it.items) flatten(it.items, out, depth + 1)
  }
  return out
}

const oldSrc = execSync(`git -C "${ROOT}" show HEAD:docs/.vitepress/config.mts`, { encoding: 'utf8' })
const newSrc = readFileSync(join(ROOT, 'docs/.vitepress/config.mts'), 'utf8')
const sidebarAbs = join(ROOT, 'docs/.vitepress/sidebar.mjs')

const oldCfg = (await toModule(oldSrc, sidebarAbs)).default
const newCfg = (await toModule(newSrc, sidebarAbs)).default

const oldFlat = flatten(oldCfg.themeConfig.sidebar)
const newFlat = flatten(newCfg.themeConfig.sidebar)

console.log('old lines:', oldFlat.length, ' new lines:', newFlat.length)
let diff = 0
const max = Math.max(oldFlat.length, newFlat.length)
for (let i = 0; i < max; i++) {
  if (oldFlat[i] !== newFlat[i]) {
    diff++
    console.log('DIFF @' + i)
    console.log('  old:', oldFlat[i])
    console.log('  new:', newFlat[i])
    if (diff > 30) { console.log('...too many'); break }
  }
}
console.log(diff === 0 ? 'IDENTICAL ✔' : `total diff lines: ${diff}`)
