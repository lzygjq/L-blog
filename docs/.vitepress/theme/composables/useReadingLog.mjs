// 阅读记录（续读）状态层
//
// 职责：把「每个页面读到哪」持久化到 localStorage，供两处消费 ——
//   ① ReadingResume.vue：重新打开某页时，在正文顶部提示「继续上次阅读 · 62%」
//   ② ReadingLog.vue：右侧竖栏的「最近阅读」列表（跨页面的入口）
//
// 为什么落 localStorage 而不是服务端：
//   本站是纯静态站（GitHub Pages / 托管发布），没有账号体系，也就没有存放
//   「个人阅读进度」的服务端位置。localStorage 恰好匹配真实场景 ——
//   同一台机器、同一个浏览器。代价是换设备 / 换浏览器 / 清缓存会丢。
//   这是刻意的取舍，不是遗漏。
//
// ⚠️ 路径形态：本项目 cleanUrls=false，产物里地址是 /x.html、dev 里可能是 /x。
//   「键」必须归一化（否则同一个物理页会在两种形态下裂成两条记录）；
//   「值里存的路径」保持原样 —— 它要用来生成跳转链接，必须与当前环境的地址
//   形态一致。所以键和路径是两件事，不要合并。
import { ref } from 'vue'

const STORAGE_KEY = 'vp-reading-log'

/** 记录条数上限：超出按时间淘汰最旧的，避免 localStorage 无限膨胀 */
const MAX_ENTRIES = 120

/** 页面可滚动高度低于此值 → 不记录（短页无需续读，记了只会污染最近列表） */
export const MIN_SCROLL = 400

/** 低于此进度视为「刚打开、还没读」→ 不写入。见 ReadingRecorder 里的说明 */
export const ARM_PCT = 0.04

/** 高于此进度视为「已读完」→ 不再提示续读 */
export const DONE_PCT = 0.95

/** { [归一化键]: { path, p, t, h1 } } */
export const readingLog = ref({})

let loaded = false

/** 归一化路径 → 存储键。`/a/index.html`、`/a/`、`/a` 视为同一页 */
export const pageKey = (p) =>
  (p || '/')
    .replace(/(^|\/)index\.html$/, '$1')
    .replace(/\.html$/, '')
    .replace(/\/+$/, '') || '/'

/** 惰性加载：只有客户端首次取数时才碰 localStorage（SSR 期没有 window） */
export function ensureLoaded() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    // 只认「普通对象」：手工改坏、或存成了数组 / null 时一律重建，
    // 不做半吊子的字段修补 —— 这份数据丢得起，读者不该为此看到报错。
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      readingLog.value = raw
      return
    }
  } catch {
    /* JSON 坏了 → 落到下面重建 */
  }
  readingLog.value = {}
}

function persist() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(readingLog.value))
  } catch {
    // 隐私模式 / 配额满：静默降级为「本次会话内有效」，绝不打断阅读
  }
}

/** 写入一条阅读位置。p 为 0~1 的进度 */
export function record(path, p, h1) {
  ensureLoaded()
  const key = pageKey(path)
  const prev = readingLog.value[key]
  const next = { ...readingLog.value }
  next[key] = {
    path,
    p: Math.round(p * 1000) / 1000, // 千分位足够，能省一半字节
    t: Date.now(),
    h1: h1 || (prev && prev.h1) || ''
  }

  const keys = Object.keys(next)
  if (keys.length > MAX_ENTRIES) {
    keys.sort((a, b) => (next[a].t || 0) - (next[b].t || 0))
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete next[k]
  }

  readingLog.value = next
  persist()
}

/** 忘掉某页的记录（续读横幅上的「从头开始」） */
export function forget(path) {
  ensureLoaded()
  const key = pageKey(path)
  if (!(key in readingLog.value)) return
  const next = { ...readingLog.value }
  delete next[key]
  readingLog.value = next
  persist()
}

/** 清空全部记录（「最近阅读」面板里的清空） */
export function clearAll() {
  ensureLoaded()
  readingLog.value = {}
  persist()
}

/** 取某页的记录，无则 null */
export function entryOf(path) {
  ensureLoaded()
  return readingLog.value[pageKey(path)] || null
}

/** 最近阅读：按时间倒序，带归一化键 */
export function recentList(limit = 8) {
  ensureLoaded()
  return Object.entries(readingLog.value)
    .map(([key, v]) => ({ key, ...v }))
    .filter((v) => v && v.path)
    .sort((a, b) => (b.t || 0) - (a.t || 0))
    .slice(0, limit)
}

/** 相对时间文案（列表与横幅共用） */
export function agoText(t) {
  const diff = Date.now() - (t || 0)
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  return new Date(t).toLocaleDateString('zh-CN')
}
