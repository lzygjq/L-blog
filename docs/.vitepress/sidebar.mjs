/**
 * 自动侧边栏构建器（借鉴 vuepress-theme-vdoing 的"目录即结构"思路）
 *
 * 用法：config.mts 里 `import { buildSidebar } from './sidebar'`，`sidebar: buildSidebar()`。
 * 新增文章：md 落对目录 → 重启 dev server（或直接 build）→ 自动出现在侧边栏。
 *
 * 条目命名优先级：
 *   frontmatter.sidebar > OVERRIDES[相对路径] > frontmatter.title > H1（去掉结尾"（英文）"）> 文件名
 * 目录内条目排序：frontmatter.order 升序 > date 升序 > 文件名
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// sidebar.mjs 位于 docs/.vitepress/，上级即 docs/
const DOCS = fileURLToPath(new URL('../', import.meta.url))

/** 手工命名覆盖：自动命名不理想的条目在这里改（key = 相对 docs 的路径，不含 .md） */
const OVERRIDES = {
  'java/design-patterns/principles': '设计原则与 UML',
  'database/redis': 'Redis 缓存',
  'database/sharding': '分库分表',
  'middleware/mqtt': '物联网 MQTT',
  'bigdata/canal': 'Canal 数据同步',
  'bigdata/doris': 'Doris 数仓',
  'bigdata/lakehouse': 'Lakehouse：Iceberg / MinIO / 冷热分层',
  'bigdata/warehouse-design': '数仓分层建模',
  'cloud-native/cicd': 'CI/CD',
  'cloud-native/observability': '监控与可观测',
  'ai/agent-harness': 'Agent 与 Harness',
  'ai/digital-human/interactive-avatar': '实时互动数字人',
  'ai/digital-human/web-vs-native': 'Web 与原生 App',
  'ai/digital-human/integration-checklist': '集成清单',
  'projects/perf-system/org-sync-100k': '十万人组织架构同步',
  'projects/perf-system/peak-filling': '高峰期并发填报',
  'projects/perf-system/approval-push': '多级审批实时推送',
  'projects/perf-system/report-precompute': '报表预计算',
  'projects/property-saas/microservice-to-k8s': '微服务 → K8s 云原生演进',
  'projects/property-saas/data-warehouse': '大数据架构方案 → 数仓'
}

/* ---------- frontmatter / H1 极简解析（只取需要的字段，不引依赖） ---------- */

function parseFrontmatter(src) {
  if (!src.startsWith('---')) return {}
  const end = src.indexOf('\n---', 3)
  if (end === -1) return {}
  const block = src.slice(3, end).split('\n')
  const fm = {}
  for (const line of block) {
    const m = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if (v === 'true') v = true
    else if (v === 'false') v = false
    else v = v.replace(/^['"]|['"]$/g, '')
    fm[m[1]] = v
  }
  return fm
}

function h1Of(src) {
  const m = src.match(/^#\s+(.+)$/m)
  return m ? m[1].trim() : null
}

function displayName(relNoExt, dir) {
  const abs = join(DOCS, relNoExt + '.md')
  if (existsSync(abs)) {
    const src = readFileSync(abs, 'utf8')
    const fm = parseFrontmatter(src)
    if (fm.sidebar) return String(fm.sidebar)
    if (OVERRIDES[relNoExt]) return OVERRIDES[relNoExt]
    if (fm.title) return String(fm.title)
    const h1 = h1Of(src)
    if (h1) return h1.replace(/（[^）]*）\s*$/, '').trim()
  }
  return relNoExt.slice(dir.length + 1)
}

function listMd(dir) {
  const abs = join(DOCS, dir)
  try {
    return readdirSync(abs).filter((f) => f.endsWith('.md')).sort()
  } catch {
    return []
  }
}

/** 目录下的 index.md 链接（不存在返回 null）——「分组标题本身可点击」靠它 */
function indexLink(dir) {
  return existsSync(join(DOCS, dir, 'index.md')) ? '/' + dir + '/' : null
}

/** 目录 → 子条目列表：非 index 的 md，按 order → date → 文件名排序 */
function listEntries(dir) {
  return listMd(dir)
    .filter((f) => f !== 'index.md')
    .map((f) => {
      const relNoExt = dir + '/' + f.replace(/\.md$/, '')
      const src = readFileSync(join(DOCS, dir, f), 'utf8')
      const fm = parseFrontmatter(src)
      return { relNoExt, fm, name: displayName(relNoExt, dir) }
    })
    .sort((a, b) =>
      ((a.fm.order || 1e9) - (b.fm.order || 1e9)) ||
      String(a.fm.date || '').localeCompare(String(b.fm.date || '')) ||
      a.relNoExt.localeCompare(b.relNoExt)
    )
    .map((e) => ({ text: e.name, link: '/' + e.relNoExt }))
}

/**
 * 条目节点类型（children 数组里混用）：
 *   { text, link }                       静态条目（如「板块导览」）
 *   { text, dir }                        目录型条目：标题链到目录 index（若有），目录内其他 md 平铺为同级条目
 *   { text, dir, group: true }           可折叠分组：标题链到 index，其余 md 作子项
 *   { text, children }                   手写分组（可再带 link，让标题也可点）
 *   { text }                             纯文本占位（如「PostgreSQL（规划中）」）
 *
 * 折叠约定（2026-09-13 用户改版）：
 *   1. **有子项的分组一律输出 `collapsed: false`**。VitePress 的
 *      `collapsible = (item.collapsed != null)` 决定是否渲染右侧 caret 箭头，
 *      而 `collapsed: false` 同时保证「默认展开」。
 *   2. **不再生成「导览」子条目**——分组标题本身就是导览入口，链到目录的 index.md。
 *      VPSidebarItem 的两种交互是分开的：有 link 时「点标题=跳转 / 点 caret=折叠」，
 *      无 link 时「点标题=折叠」（见其 onItemInteraction / onCaretClick）。
 */
function buildNode(node) {
  // 有子项的分组：手写 children，或 dir + group（扫描目录、排除 index 自身）
  const kids = node.children
    ? node.children.map(buildNode).flat()
    : node.dir && node.group
      ? listEntries(node.dir)
      : null

  if (kids) {
    const out = { text: node.text, collapsed: false, items: kids }
    const link = node.link || (node.dir ? indexLink(node.dir) : null)
    if (link) out.link = link
    return out
  }

  if (node.dir) {
    // 目录型条目：标题条目 + 目录内其余 md 平铺为兄弟（目录里只剩 index.md 时自然退化为单条）
    const link = indexLink(node.dir)
    return [link ? { text: node.text, link } : { text: node.text }, ...listEntries(node.dir)]
  }

  return node.link ? { text: node.text, link: node.link } : { text: node.text }
}

/** 顶层入口：spec = [{ text, children }, ...] */
export function buildSidebar(spec) {
  return spec.map((g) => buildNode(g)).flat()
}
