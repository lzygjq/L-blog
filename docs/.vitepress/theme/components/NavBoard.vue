<!-- 开发者导航组件：分类锚点 + 即时筛选 + 卡片网格 + 全站可自定义排序
     数据源：../data/navData.mjs（增删条目只改数据文件）
     个性化排序（存 localStorage，见 ../composables/useNavOrder.mjs）：
       ① 高频常用：点卡片右上角星标标记/取消，拖拽卡片排序
       ② 分类内卡片：直接拖拽卡片调整该分类内的站点顺序
       ③ 分类整体：拖分类标题左侧把手，调整各分类之间的先后顺序（右侧分类栏同步）
       ④ 分类折叠：点标题行（或右侧箭头）收起/展开，长分类折叠后更好拖；存 nav-cat-collapsed
       ⑤ 一键全收/全展：工具条右侧按钮，分类多时先收成一行再重排 -->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { navCategories } from '../data/navData.mjs'
import faviconManifest from '../data/faviconManifest.json'
import {
  initNavOrder,
  itemId,
  itemOrder,
  normalCategories,
  orderCategories,
  orderItems,
  catOrder,
  persistCatOrder,
  persistItemOrder
} from '../composables/useNavOrder.mjs'

const keyword = ref('')

// ── 站点图标 ──────────────────────────────
// 三级策略：scripts/fetch-favicons.mjs 抓取到本地的图标（首选）
//   → 无本地文件时远程直连（icon 覆盖字段或 {origin}/favicon.ico）
//   → 加载失败回退为首字母圆形图标
const hostOf = (url) => {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return ''
  }
}
const faviconUrl = (item) => {
  const local = faviconManifest[hostOf(item.url)]
  if (local) return withBase(local)
  return item.url.replace(/^(https?:\/\/[^/]+).*$/, '$1') + '/favicon.ico'
}
const iconFailed = ref(new Set())
function onIconError(item) {
  if (!iconFailed.value.has(item.url)) {
    iconFailed.value.add(item.url)
    // Set 响应性：重新赋值触发更新
    iconFailed.value = new Set(iconFailed.value)
  }
}

// ── 条目池与收藏状态 ──────────────────────
// 条目唯一标识 itemId 复用 useNavOrder 里的实现（同站点在不同分类出现时视为同一条目）

// 全量条目池（含 virtual 高频分类，保证 DeepSeek 等仅在高频默认区的条目可被引用）
const itemPool = new Map()
const defaultFavIds = []
for (const cat of navCategories) {
  for (const it of cat.items) {
    if (!itemPool.has(itemId(it))) itemPool.set(itemId(it), it)
    if (cat.virtual && it.hot && !defaultFavIds.includes(itemId(it))) {
      defaultFavIds.push(itemId(it))
    }
  }
}
// 普通分类列表来自 useNavOrder（virtual 高频分类不参与静态渲染，改为收藏驱动）

// 收藏 id 列表：顺序即高频区展示顺序；SSR/首屏先渲染默认值，挂载后读 localStorage
const favIds = ref([...defaultFavIds])
const STORAGE_KEY = 'nav-favorites'
const REMOVED_KEY = 'nav-favorites-removed'
// 用户明确移除过的默认高频 id：防止数据文件新增默认项的迁移逻辑把用户删掉的又加回来
const removedDefaults = ref(new Set())

onMounted(() => {
  // 先恢复用户的分类 / 条目排序偏好（与 NavRail 共享的模块级状态）
  initNavOrder()
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    const removed = JSON.parse(localStorage.getItem(REMOVED_KEY) || '[]')
    if (Array.isArray(removed)) removedDefaults.value = new Set(removed)
    if (Array.isArray(saved)) {
      const valid = saved.filter((id) => itemPool.has(id))
      // 数据文件新增的默认高频条目追加到已保存列表尾部（老用户也能看到新条目）；
      // 用户明确移除过的除外
      for (const id of defaultFavIds) {
        if (!valid.includes(id) && !removedDefaults.value.has(id)) valid.push(id)
      }
      favIds.value = valid
    }
  } catch {
    /* localStorage 不可用时保持默认 */
  }
  // 恢复折叠状态（首次访问无记录＝全部展开）
  try {
    const collapsedSaved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]')
    if (Array.isArray(collapsedSaved)) collapsedIds.value = collapsedSaved
  } catch {
    /* 忽略 */
  }
})

const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favIds.value))
  } catch {
    /* 忽略隐私模式等写入失败 */
  }
}
const persistRemoved = () => {
  try {
    localStorage.setItem(REMOVED_KEY, JSON.stringify([...removedDefaults.value]))
  } catch {
    /* 忽略写入失败 */
  }
}

const isFav = (id) => favIds.value.includes(id)

function toggleFav(id) {
  const i = favIds.value.indexOf(id)
  if (i >= 0) {
    favIds.value.splice(i, 1)
    if (defaultFavIds.includes(id)) {
      removedDefaults.value.add(id)
      persistRemoved()
    }
  } else {
    favIds.value.push(id)
    if (removedDefaults.value.delete(id)) persistRemoved()
  }
  persist()
}

// 高频区渲染列表：按收藏顺序取条目
const favItems = computed(() =>
  favIds.value.map((id) => itemPool.get(id)).filter(Boolean)
)

// ── 分类折叠 ──────────────────────────────
// 长分类折叠后便于拖拽重排（不必拖着跨过整屏卡片）。存 nav-cat-collapsed，
// 键一律用区块的 DOM id（nav-hot / nav-ai / …），与模板 :id="'nav-' + cat.id" 同源 ——
// 不要混用 cat.id（裸 "ai"）和 "nav-ai"，否则存储键和 DOM 对不上、排查时白费劲。
// 用 id 数组而非 Set：10 来个分类下 includes 的开销可忽略，且数组的响应式最直白。
const COLLAPSED_KEY = 'nav-cat-collapsed'
const collapsedIds = ref([])

// 筛选态强制展开：否则命中的结果藏在折叠区块里，用户会以为"没匹配到"
const isCollapsed = (id) => !keyword.value && collapsedIds.value.includes(id)

const persistCollapsed = () => {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsedIds.value))
  } catch {
    /* 忽略隐私模式等写入失败 */
  }
}

function toggleCollapse(id) {
  const i = collapsedIds.value.indexOf(id)
  if (i >= 0) collapsedIds.value.splice(i, 1)
  else collapsedIds.value.push(id)
  persistCollapsed()
}

// 全部收起/展开：重排分类时最顺手的姿势是先把所有区块收成一行，再逐个拖。
// 判定覆盖「高频常用 + 所有分类」——与逐区块折叠同一套 id（DOM id），避免两套真相。
// 必须过滤掉 virtual 分类：navCategories[0] 就是 { id:'hot', virtual:true }，
// 而模板里「高频常用」是单独硬编码 id="nav-hot" 渲染的、不在分类循环里 ——
// 不过滤就会把 nav-hot 算两遍（顺序去重后看着没事，但存储里会多一条脏 id）。
const allSectionIds = computed(() => [
  'nav-hot',
  ...orderedAllCats.value.filter((c) => !c.virtual).map((c) => 'nav-' + c.id)
])

// 注意用 collapsedIds 而非 isCollapsed：筛选态 isCollapsed 恒为 false，
// 若按它算，筛选时按钮会一直显示"全部展开"，语义就错了。
const allCollapsed = computed(
  () =>
    allSectionIds.value.length > 0 &&
    allSectionIds.value.every((id) => collapsedIds.value.includes(id))
)

function toggleAllCollapse() {
  collapsedIds.value = allCollapsed.value ? [] : [...allSectionIds.value]
  persistCollapsed()
}

// ── 拖拽排序 ─────────────────────────────────
// 三套互相独立的拖拽，靠各自的 state 区分，互不抢事件：
//   ① dragIndex   高频常用卡片（顺序即收藏顺序，存 nav-favorites）
//   ② itemDrag    分类内卡片（存 nav-item-order）
//   ③ catDragId   整个分类区块（存 nav-cat-order）
// 关键：HTML5 DnD 里 dragover 必须 preventDefault，目标才算合法放置区，否则 drop 根本不触发。
// 同理，若某个位置不该接收当前拖拽物，就「不要」preventDefault —— 浏览器会自动显示禁止光标。

// ① 高频常用
const dragIndex = ref(-1)

function onDragStart(i, e) {
  dragIndex.value = i
  e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(i, e) {
  if (dragIndex.value < 0 || dragIndex.value === i) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
}
function onDrop(i) {
  const from = dragIndex.value
  if (from < 0 || from === i) return
  favIds.value.splice(i, 0, favIds.value.splice(from, 1)[0])
  dragIndex.value = -1
  persist()
}
function onDragEnd() {
  dragIndex.value = -1
}

// ② 分类内卡片：只允许在本分类内部重排（分类归属由数据文件决定，跨分类移动无法持久化）
const itemDrag = ref({ catId: '', index: -1 })

function onItemDragStart(cat, i, e) {
  itemDrag.value = { catId: cat.id, index: i }
  e.dataTransfer.effectAllowed = 'move'
}
function onItemDragOver(cat, i, e) {
  const d = itemDrag.value
  if (!d.catId || d.catId !== cat.id || d.index === i) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
}
function onItemDrop(cat, i) {
  const d = itemDrag.value
  if (!d.catId || d.catId !== cat.id || d.index < 0 || d.index === i) return
  // 基于「完整顺序」重排：拖拽在筛选态下被禁用，故渲染下标 === 完整列表下标
  const list = orderItems(cat).slice()
  list.splice(i, 0, list.splice(d.index, 1)[0])
  itemOrder.value = { ...itemOrder.value, [cat.id]: list.map(itemId) }
  persistItemOrder()
  itemDrag.value = { catId: '', index: -1 }
}
function onItemDragEnd() {
  itemDrag.value = { catId: '', index: -1 }
}

// ③ 分类区块
const catDragId = ref('')
const catOverId = ref('')

function onCatDragStart(cat, e) {
  catDragId.value = cat.id
  e.dataTransfer.effectAllowed = 'move'
  // 拖拽影像用整行标题（默认会用小小的把手图标，看不出在搬哪一块）
  const head = e.target.closest?.('.nav-section-head')
  try {
    if (head) e.dataTransfer.setDragImage(head, 16, 16)
  } catch {
    /* 某些环境下 setDragImage 会抛错（如合成事件），失败不影响排序逻辑 */
  }
}
function onCatDragOver(cat, e) {
  if (!catDragId.value) return
  if (catDragId.value === cat.id) {
    e.preventDefault() // 自身也是合法区域（避免指针滑回原处时指示器乱跳）
    return
  }
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  catOverId.value = cat.id
}
function onCatDrop(cat) {
  const from = catOrder.value.indexOf(catDragId.value)
  const to = catOrder.value.indexOf(cat.id)
  catDragId.value = ''
  catOverId.value = ''
  if (from < 0 || to < 0 || from === to) return
  const list = catOrder.value.slice()
  list.splice(to, 0, list.splice(from, 1)[0])
  catOrder.value = list
  persistCatOrder()
}
function onCatDragEnd() {
  catDragId.value = ''
  catOverId.value = ''
}

// ── 筛选 ─────────────────────────────────
// 筛选：按名称/描述匹配；空关键字展示全部；过滤后为空的分类自动隐藏
// 分类顺序与分类内顺序都按用户偏好渲染（orderCategories / orderItems）
const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const cats = orderCategories(normalCategories)
  if (!kw) return cats.map((cat) => ({ ...cat, items: orderItems(cat) }))
  return cats
    .map((cat) => ({
      ...cat,
      items: orderItems(cat).filter(
        (it) => it.name.toLowerCase().includes(kw) || it.desc.toLowerCase().includes(kw)
      )
    }))
    .filter((cat) => cat.items.length > 0)
})

// 分类锚点 / 右侧分类栏用的完整顺序（含 virtual 高频常用）
const orderedAllCats = computed(() => orderCategories(navCategories))

const matchCount = computed(() =>
  filtered.value.reduce((sum, c) => sum + c.items.length, 0)
)

// 计数文案：注意插值表达式内不能再嵌套 {{ }}，统一在这里拼好
const countText = computed(() =>
  keyword.value
    ? `匹配 ${matchCount.value} / ${itemPool.size} 个站点`
    : `共 ${itemPool.size} 个站点`
)
</script>

<template>
  <div class="nav-board" :class="{ 'is-filtering': !!keyword }">
    <!-- 顶部工具条：第一行＝标题 + 计数（左）/ 全部收起 + 筛选框（右），第二行＝拖拽小字说明 -->
    <div class="nav-toolbar">
      <div class="nav-headline">
        <h2 class="nav-title">开发者导航</h2>
        <span class="nav-count">{{ countText }}</span>
      </div>
      <div class="nav-actions">
        <button
          v-if="!keyword"
          class="nav-collapse-all"
          :title="
            allCollapsed
              ? '展开全部分类'
              : '收起全部分类——重排分类时先收成一行更好拖'
          "
          @click="toggleAllCollapse"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path d="M8 1.6 12.2 5.6H3.8z" fill="currentColor" />
            <path d="M8 14.4 3.8 10.4h8.4z" fill="currentColor" />
          </svg>
          {{ allCollapsed ? '全部展开' : '全部收起' }}
        </button>
        <input
          v-model="keyword"
          class="nav-search"
          type="text"
          placeholder="输入关键字筛选，如：redis / 正则 / 图标…"
        />
      </div>
      <span class="nav-hint">拖拽卡片可调整分类内顺序，拖分类标题左侧把手可调整分类顺序</span>
    </div>

    <!-- 分类锚点（筛选时隐藏，避免锚点失效） -->
    <div v-if="!keyword" class="nav-anchor">
      <a
        v-for="cat in orderedAllCats"
        :key="cat.id"
        class="nav-anchor-item"
        :href="'#nav-' + cat.id"
      >
        <span class="nav-anchor-icon">{{ cat.icon }}</span>{{ cat.title }}
      </a>
    </div>

    <!-- 高频常用：收藏驱动，星标切换 + 拖拽排序（筛选时隐藏） -->
    <section v-if="!keyword" id="nav-hot" class="nav-section">
      <div class="nav-section-head" @click="toggleCollapse('nav-hot')">
        <span class="nav-section-icon">⭐</span>
        <h3 class="nav-section-title">高频常用</h3>
        <span class="nav-section-desc">点卡片右上角 ☆ 标记常用站点，拖拽卡片调整顺序</span>
        <span v-if="isCollapsed('nav-hot')" class="nav-section-count">{{ favItems.length }} 个站点</span>
        <button
          class="nav-collapse"
          :class="{ 'is-collapsed': isCollapsed('nav-hot') }"
          :title="isCollapsed('nav-hot') ? '展开「高频常用」' : '折叠「高频常用」'"
          :aria-expanded="!isCollapsed('nav-hot')"
          @click.stop="toggleCollapse('nav-hot')"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <div v-show="!isCollapsed('nav-hot')">
        <div v-if="favItems.length" class="nav-grid">
          <a
            v-for="(item, idx) in favItems"
            :key="itemId(item)"
            class="nav-card is-fav"
            :class="{ 'is-dragging': dragIndex === idx }"
            :href="item.url"
            target="_blank"
            rel="noopener noreferrer"
            draggable="true"
            @dragstart="onDragStart(idx, $event)"
            @dragover="onDragOver(idx, $event)"
            @drop.prevent="onDrop(idx)"
            @dragend="onDragEnd"
          >
            <button
              class="nav-star"
              :class="{ 'is-on': true }"
              title="取消高频常用"
              @click.prevent="toggleFav(itemId(item))"
            >★</button>
            <span class="nav-card-head">
              <img
                v-if="faviconUrl(item) && !iconFailed.has(item.url)"
                class="nav-card-icon"
                :src="faviconUrl(item)"
                alt=""
                loading="lazy"
                @error="onIconError(item)"
              />
              <span v-else class="nav-card-icon-fallback">{{ item.name[0] }}</span>
              <span class="nav-card-name">{{ item.name }}</span>
            </span>
            <span class="nav-card-desc">{{ item.desc }}</span>
            <span class="nav-card-link">
              {{ item.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') }}
              <svg class="nav-ext-icon" viewBox="0 0 24 24" width="11" height="11">
                <path
                  d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z"
                  fill="currentColor"
                />
              </svg>
            </span>
          </a>
        </div>
        <div v-else class="nav-hot-empty">
          高频常用已清空——点击下方任意卡片右上角的 ☆ 即可添加回来
        </div>
      </div>
    </section>

    <!-- 分类区块：整块可拖拽排序（拖标题左侧把手） -->
    <section
      v-for="cat in filtered"
      :id="'nav-' + cat.id"
      :key="cat.id"
      class="nav-section"
      :class="{
        'is-cat-dragging': catDragId === cat.id,
        'is-cat-over': catOverId === cat.id
      }"
      @dragover="onCatDragOver(cat, $event)"
      @drop.prevent="onCatDrop(cat)"
    >
      <div class="nav-section-head" @click="toggleCollapse('nav-' + cat.id)">
        <span
          v-if="!keyword"
          class="nav-drag-handle"
          draggable="true"
          title="拖拽调整分类顺序"
          @dragstart="onCatDragStart(cat, $event)"
          @dragend="onCatDragEnd"
          @click.stop
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <circle cx="5.5" cy="3" r="1.35" fill="currentColor" />
            <circle cx="10.5" cy="3" r="1.35" fill="currentColor" />
            <circle cx="5.5" cy="8" r="1.35" fill="currentColor" />
            <circle cx="10.5" cy="8" r="1.35" fill="currentColor" />
            <circle cx="5.5" cy="13" r="1.35" fill="currentColor" />
            <circle cx="10.5" cy="13" r="1.35" fill="currentColor" />
          </svg>
        </span>
        <span class="nav-section-icon">{{ cat.icon }}</span>
        <h3 class="nav-section-title">{{ cat.title }}</h3>
        <span class="nav-section-desc">{{ cat.desc }}</span>
        <span v-if="isCollapsed('nav-' + cat.id)" class="nav-section-count">{{ cat.items.length }} 个站点</span>
        <button
          class="nav-collapse"
          :class="{ 'is-collapsed': isCollapsed('nav-' + cat.id) }"
          :title="isCollapsed('nav-' + cat.id) ? `展开「${cat.title}」` : `折叠「${cat.title}」`"
          :aria-expanded="!isCollapsed('nav-' + cat.id)"
          @click.stop="toggleCollapse('nav-' + cat.id)"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <div class="nav-grid" v-show="!isCollapsed('nav-' + cat.id)">
        <a
          v-for="(item, idx) in cat.items"
          :key="itemId(item)"
          class="nav-card"
          :class="{ 'is-dragging': itemDrag.catId === cat.id && itemDrag.index === idx }"
          :href="item.url"
          target="_blank"
          rel="noopener noreferrer"
          :draggable="!keyword"
          @dragstart="onItemDragStart(cat, idx, $event)"
          @dragover="onItemDragOver(cat, idx, $event)"
          @drop.prevent="onItemDrop(cat, idx)"
          @dragend="onItemDragEnd"
        >
          <button
            class="nav-star"
            :class="{ 'is-on': isFav(itemId(item)) }"
            :title="isFav(itemId(item)) ? '取消高频常用' : '标记为高频常用'"
            @click.prevent="toggleFav(itemId(item))"
          >{{ isFav(itemId(item)) ? '★' : '☆' }}</button>
          <span class="nav-card-head">
            <img
              v-if="faviconUrl(item) && !iconFailed.has(item.url)"
              class="nav-card-icon"
              :src="faviconUrl(item)"
              alt=""
              loading="lazy"
              @error="onIconError(item)"
            />
            <span v-else class="nav-card-icon-fallback">{{ item.name[0] }}</span>
            <span class="nav-card-name">{{ item.name }}</span>
          </span>
          <span class="nav-card-desc">{{ item.desc }}</span>
          <span class="nav-card-link">
            {{ item.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') }}
            <svg class="nav-ext-icon" viewBox="0 0 24 24" width="11" height="11">
              <path
                d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z"
                fill="currentColor"
              />
            </svg>
          </span>
        </a>
      </div>
    </section>

    <!-- 筛选无结果 -->
    <div v-if="filtered.length === 0" class="nav-empty">
      没有匹配「{{ keyword }}」的站点，换个关键字试试～
    </div>
  </div>
</template>

<style scoped>
.nav-board {
  display: flex;
  flex-direction: column;
  gap: 36px;
}

/* ── 工具条 ─────────────────────────── */
/* 两行网格：第 1 行＝标题计数（左）+ 搜索框（右），第 2 行＝小字说明横跨整行 */
.nav-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 16px;
  row-gap: 8px;
}
.nav-headline {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}
.nav-title {
  margin: 0 !important;
  /* VitePress 默认 .vp-doc h2 带 border-top + padding-top:24px，会在标题上方画一条
     通栏细线（用户截图那根）。此处标题是自定义版式，不需要分隔线，两条都要清掉 ——
     只写 border-bottom 会漏掉上面那条。 */
  border-top: none !important;
  border-bottom: none !important;
  padding-top: 0 !important;
  font-size: 24px;
}
.nav-count {
  font-size: 13px;
  opacity: 0.65;
}
.nav-search {
  width: 280px;
  max-width: 100%;
  padding: 7px 14px;
  font-size: 13px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  outline: none;
  transition: border-color 0.2s;
}
.nav-search:focus {
  border-color: var(--vp-c-brand-1);
}
/* 右侧操作区：全部收起/展开 + 搜索框，作为一个整体贴容器右缘 */
.nav-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
/* 全部收起/展开：与搜索框同高的实体按钮。
   分类多的时候逐个点箭头太慢，重排前先一键收干净最顺手 */
.nav-collapse-all {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  padding: 7px 12px;
  font-size: 13px;
  white-space: nowrap;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.nav-collapse-all:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
.nav-collapse-all svg {
  flex: none;
}

/* ── 分类锚点：桌面端用右侧 NavRail，窄屏（aside 隐藏）才显示顶部锚点 ── */
.nav-anchor {
  display: none;
  flex-wrap: wrap;
  gap: 8px;
}
@media (max-width: 1279px) {
  .nav-anchor {
    display: flex;
  }
}
.nav-anchor-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: all 0.2s;
}
.nav-anchor-item:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

/* ── 分类区块 ───────────────────────── */
.nav-section {
  position: relative;
  scroll-margin-top: 96px;
}
.nav-section-head {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 14px;
  /* 给左侧拖拽把手留位：高频常用没有把手，靠这个 padding 保证所有分类标题对齐 */
  padding-left: 20px;
  /* 整行可点 = 折叠/展开（把手自己 stop 掉，见模板） */
  cursor: pointer;
  user-select: none;
}
/* 拖拽把手：默认低存在感，hover 才点亮，避免干扰阅读 */
.nav-drag-handle {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 20px;
  border-radius: 4px;
  color: var(--vp-c-text-3);
  opacity: 0.4;
  cursor: grab;
  user-select: none;
  transition: opacity 0.15s, color 0.15s, background-color 0.15s;
}
.nav-drag-handle:hover {
  opacity: 1;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
.nav-drag-handle:active {
  cursor: grabbing;
}
.nav-drag-handle svg {
  /* 让拖拽事件的 target 恒为把手本体（否则会是 svg/circle，取不到最近的 .nav-section-head） */
  pointer-events: none;
}
/* 正在搬动的分类：整块淡出 */
.nav-section.is-cat-dragging {
  opacity: 0.4;
}
/* 目标插入位：区块上方的品牌色横线（语义=放到这一块之前） */
.nav-section.is-cat-over::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: -18px;
  height: 2px;
  border-radius: 2px;
  background: var(--vp-c-brand-1);
}
.nav-section-icon {
  font-size: 20px;
}
.nav-section-title {
  margin: 0 !important;
  border-bottom: none !important;
  font-size: 18px;
}
.nav-section-desc {
  font-size: 12px;
  opacity: 0.6;
}
/* ── 折叠开关 ─────────────────────────
   贴在标题行右端（margin-left:auto 顶开），默认低存在感、hover 才点亮，
   与左侧拖拽把手同一套视觉语言；折叠时箭头转 -90°（朝右＝已收起） */
.nav-collapse {
  margin-left: auto;
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--vp-c-text-3);
  opacity: 0.5;
  cursor: pointer;
  transition: opacity 0.15s, color 0.15s, background-color 0.15s;
}
.nav-section-head:hover .nav-collapse {
  opacity: 1;
}
.nav-collapse:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
.nav-collapse svg {
  transition: transform 0.2s;
}
.nav-collapse.is-collapsed svg {
  transform: rotate(-90deg);
}
/* 折叠后补一个计数，避免"不知道里面有多少、要不要展开" */
.nav-section-count {
  font-size: 12px;
  color: var(--vp-c-text-3);
  white-space: nowrap;
}
.nav-hint {
  grid-column: 1 / -1;
  font-size: 12px;
  color: var(--vp-c-text-3);
}
@media (max-width: 1180px) {
  .nav-hint {
    display: none;
  }
}
/* 窄屏：搜索框换到标题下方占满整行 */
@media (max-width: 640px) {
  .nav-toolbar {
    grid-template-columns: minmax(0, 1fr);
  }
  /* 窄屏纵向堆叠：搜索框在上占满整行，按钮在下 */
  .nav-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }
  .nav-search {
    width: 100%;
  }
}

/* ── 卡片网格 ───────────────────────── */
.nav-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
}
.nav-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 14px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  text-decoration: none;
  cursor: grab;
  transition: all 0.2s;
}
.nav-card:active {
  cursor: grabbing;
}
/* 筛选态下拖拽被禁用（顺序变更无法与筛选结果对应），光标回归普通链接 */
.nav-board.is-filtering .nav-card {
  cursor: pointer;
}
.nav-card:hover {
  transform: translateY(-2px);
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}
/* 高频区卡片：金色描边 */
.nav-card.is-fav {
  border-color: rgba(234, 179, 8, 0.45);
}
.nav-card.is-dragging {
  opacity: 0.45;
  border-style: dashed;
}

/* ── 星标按钮 ───────────────────────── */
.nav-star {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 3px;
  border: none;
  background: transparent;
  font-size: 16px;
  line-height: 1;
  color: var(--vp-c-text-3);
  opacity: 0.55;
  cursor: pointer;
  transition: all 0.15s;
}
.nav-star:hover {
  opacity: 1;
  color: var(--vp-c-brand-1);
  transform: scale(1.15);
}
.nav-star.is-on {
  color: #eab308;
  opacity: 1;
}
.nav-star.is-on:hover {
  color: #ca8a04;
}
/* 卡片头部：图标 + 名称同行 */
.nav-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 28px;
  min-height: 22px;
}
.nav-card-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 4px;
  object-fit: contain;
  background: var(--vp-c-bg-soft);
}
.nav-card-icon-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  border-radius: 4px;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
.nav-card-name {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-card-desc {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 39px;
}
.nav-card-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  opacity: 0.55;
  word-break: break-all;
  color: var(--vp-c-text-2);
}
.nav-card:hover .nav-card-link {
  color: var(--vp-c-brand-1);
}
.nav-ext-icon {
  flex-shrink: 0;
}

/* ── 高频区空状态 ───────────────────── */
.nav-hot-empty {
  padding: 28px 0;
  text-align: center;
  font-size: 13px;
  color: var(--vp-c-text-2);
  border: 1px dashed var(--vp-c-divider);
  border-radius: 10px;
}

.nav-empty {
  padding: 40px 0;
  text-align: center;
  font-size: 14px;
  opacity: 0.7;
}
</style>
