/**
 * 批量给 docs 目录下所有 .md 补 frontmatter：
 * - 无 frontmatter 的文件：注入 `---\ndate: YYYY-MM-DD\n---\n`
 *   date 取 git 首次提交时间（即写作时间），%as 为短日期格式
 * - 占位页（<800 字节）：额外注入 `draft: true`（归档页/数据加载器据此过滤）
 * - 已有 frontmatter 但缺 date 的：在 frontmatter 块内补 date
 * - 已有 date 的：跳过
 * 幂等：重复执行安全。用法：node scripts/add-frontmatter.mjs
 */
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('../', import.meta.url)), 'docs')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '.vitepress' || name === 'node_modules') continue
      walk(p, out)
    } else if (name.endsWith('.md')) {
      out.push(p)
    }
  }
  return out
}

function gitFirstDate(file) {
  const rel = relative(process.cwd(), file)
  try {
    const out = execSync(
      `git log --follow --diff-filter=A --format=%as -- "${rel}"`,
      { encoding: 'utf8' }
    ).trim()
    return out.split('\n').filter(Boolean).sort()[0] || null
  } catch {
    return null
  }
}

const files = walk(ROOT)
let injected = 0
let addedDate = 0
let skipped = 0

for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const lines = src.split('\n')
  const hasFm = lines[0] === '---'
  const isPlaceholder = statSync(f).size < 800

  if (hasFm) {
    // 找 frontmatter 结束行
    let end = -1
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') { end = i; break }
    }
    const block = lines.slice(1, end === -1 ? lines.length : end)
    if (block.some((l) => /^date:/.test(l))) { skipped++; continue }
    const date = gitFirstDate(f)
    if (!date) { console.warn('no git date, skip:', f); continue }
    let insertAt = end === -1 ? lines.length : end
    // draft 也可能缺：占位页补 draft
    const hasDraft = block.some((l) => /^draft:/.test(l))
    const add = []
    add.push(`date: ${date}`)
    if (isPlaceholder && !hasDraft) add.push('draft: true')
    lines.splice(insertAt, 0, ...add)
    writeFileSync(f, lines.join('\n'))
    addedDate++
    continue
  }

  const date = gitFirstDate(f)
  if (!date) { console.warn('no git date, skip:', f); continue }
  const fm = ['---', `date: ${date}`]
  if (isPlaceholder) fm.push('draft: true')
  fm.push('---', '')
  writeFileSync(f, [...fm, ...lines].join('\n'))
  injected++
}

console.log(`files=${files.length} injected=${injected} addedDate=${addedDate} skipped=${skipped}`)
