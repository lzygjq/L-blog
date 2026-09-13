// 导航页个性化排序状态：①分类之间的顺序 ②每个分类内部条目的顺序
// NavBoard（内容区卡片）与 NavRail（右侧分类栏）共用同一份模块级响应式状态，
// 所以在内容区拖动分类后，右侧分类导航会自动同步。
//
// 数据源仍是 data/navData.mjs，这里只叠加「用户的顺序偏好」：
//   nav-cat-order  分类顺序   ['db','ai',...]      （只含非 virtual 分类）
//   nav-item-order 条目顺序   { ai: ['name|url', ...], ... }
// 「高频常用」是 virtual 分类，恒为第一区块，不参与排序。
import { ref } from 'vue'
import { navCategories } from '../data/navData.mjs'

const CAT_KEY = 'nav-cat-order'
const ITEM_KEY = 'nav-item-order'

/** 条目唯一标识：name + url（与高频常用收藏的 id 规则保持一致） */
export const itemId = (it) => it.name + '|' + it.url

/** 参与排序的分类（排除 virtual 的高频常用）*/
export const normalCategories = navCategories.filter((c) => !c.virtual)

const defaultCatIds = normalCategories.map((c) => c.id)
const defaultItemIds = Object.fromEntries(
  normalCategories.map((c) => [c.id, c.items.map(itemId)])
)

export const catOrder = ref([...defaultCatIds])
export const itemOrder = ref({})

/**
 * 合并策略：以用户保存的顺序为准，剔除数据文件里已删除的条目；
 * 数据文件新增的分类 / 条目一律补到末尾 —— 老访客也能看到新内容，不会被旧顺序挡住。
 */
function merge(saved, defaults) {
  if (!Array.isArray(saved)) return [...defaults]
  const kept = saved.filter((id) => defaults.includes(id))
  for (const id of defaults) if (!kept.includes(id)) kept.push(id)
  return kept
}

let initialized = false

/** 挂载后调用一次：从 localStorage 读取用户顺序（幂等） */
export function initNavOrder() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  try {
    catOrder.value = merge(JSON.parse(localStorage.getItem(CAT_KEY)), defaultCatIds)
    const saved = JSON.parse(localStorage.getItem(ITEM_KEY))
    if (saved && typeof saved === 'object') {
      const next = {}
      for (const id of defaultCatIds) next[id] = merge(saved[id], defaultItemIds[id])
      itemOrder.value = next
    }
  } catch {
    /* localStorage 不可用（隐私模式等）时保持数据文件的默认顺序 */
  }
}

export function persistCatOrder() {
  try {
    localStorage.setItem(CAT_KEY, JSON.stringify(catOrder.value))
  } catch {
    /* 忽略写入失败 */
  }
}

export function persistItemOrder() {
  try {
    localStorage.setItem(ITEM_KEY, JSON.stringify(itemOrder.value))
  } catch {
    /* 忽略写入失败 */
  }
}

/**
 * 把用户顺序套到分类列表上：virtual 分类（高频常用）固定占住自己原来的位置，
 * 其余名额按 catOrder 依次填充 —— 这样即使将来数据文件在高频后面加新分类也不会错位。
 */
export function orderCategories(all) {
  const byId = new Map(all.map((c) => [c.id, c]))
  const queue = catOrder.value.map((id) => byId.get(id)).filter(Boolean)
  let i = 0
  return all.map((c) => (c.virtual ? c : queue[i++])).filter(Boolean)
}

/** 单个分类的条目顺序：用户顺序优先，数据文件新增的条目补到末尾 */
export function orderItems(cat) {
  const saved = itemOrder.value[cat.id]
  const items = cat.items || []
  if (!Array.isArray(saved)) return items
  const byId = new Map(items.map((it) => [itemId(it), it]))
  const out = saved.map((id) => byId.get(id)).filter(Boolean)
  for (const it of items) if (!saved.includes(itemId(it))) out.push(it)
  return out
}
