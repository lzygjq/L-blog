// 抓取导航站点图标到本地自托管：docs/public/favicons/
// 策略：item.icon 覆盖字段 → {origin}/favicon.ico → 首页 <link rel="icon"> 解析
// 产出：docs/public/favicons/<host>.<ext> + docs/.vitepress/theme/data/faviconManifest.json
// 运行：node scripts/fetch-favicons.mjs（网络受限环境下部分域名会 MISS，MISS 的走字母兜底）
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { navCategories } from '../docs/.vitepress/theme/data/navData.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(root, 'docs/public/favicons')
const MANIFEST = join(root, 'docs/.vitepress/theme/data/faviconManifest.json')
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

mkdirSync(OUT_DIR, { recursive: true })

// 去重收集全部站点 host（同 host 多条目只抓一次）
const hosts = new Map()
for (const cat of navCategories) {
  for (const it of cat.items) {
    try {
      const u = new URL(it.url)
      const host = u.host.replace(/^www\./, '')
      if (!hosts.has(host)) hosts.set(host, it)
    } catch {
      console.warn('BAD URL:', it.url)
    }
  }
}

const extOf = (contentType, url) => {
  const ct = contentType || ''
  if (ct.includes('svg')) return 'svg'
  if (ct.includes('png')) return 'png'
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('jpeg')) return 'jpg'
  if (ct.includes('gif')) return 'gif'
  if (/\.(svg|png|webp|jpg|jpeg|gif|ico)(\?|$)/i.test(url)) return RegExp.$1.toLowerCase().replace('jpeg', 'jpg')
  return 'ico'
}

async function download(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'image/*,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000)
  })
  if (!res.ok) return null
  const type = res.headers.get('content-type') || ''
  if (!type.startsWith('image/') && !type.includes('octet-stream')) return null
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 100) return null // 过小视为无效（空文件/占位）
  return { buf, type, url }
}

function save(host, { buf, type, url }) {
  const ext = extOf(type, url)
  const file = `${host}.${ext}`
  writeFileSync(join(OUT_DIR, file), buf)
  return `/favicons/${file}`
}

const manifest = {}
for (const [host, item] of hosts) {
  const candidates = []
  if (item.icon) candidates.push(item.icon)
  try {
    candidates.push(new URL('/favicon.ico', item.url).href)
  } catch {}

  let saved = null
  for (const cu of candidates) {
    try {
      const dl = await download(cu)
      if (dl) {
        saved = save(host, dl)
        break
      }
    } catch {}
  }

  // 兜底：解析首页 <link rel="icon">
  if (!saved) {
    try {
      const res = await fetch(item.url, {
        headers: { 'user-agent': UA },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000)
      })
      const html = await res.text()
      const m =
        html.match(/<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i) ||
        html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*icon[^"']*["']/i)
      if (m) {
        const dl = await download(new URL(m[1], item.url).href)
        if (dl) saved = save(host, dl)
      }
    } catch {}
  }

  manifest[host] = saved
  console.log((saved ? 'OK   ' : 'MISS ') + host)
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
const ok = Object.values(manifest).filter(Boolean).length
console.log(`\n完成：${ok}/${hosts.size} 个图标已本地化，清单写入 faviconManifest.json`)
