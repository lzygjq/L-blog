<!-- 开发者导航组件：分类锚点 + 即时筛选 + 卡片网格 + 可自定义高频常用
     数据源：../data/navData.mjs（增删条目只改数据文件）
     高频常用：点击卡片右上角星标标记/取消，拖拽卡片排序，选择存 localStorage -->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { navCategories, navTotal } from '../data/navData.mjs'

const keyword = ref('')

// ── 条目池与收藏状态 ──────────────────────
// 条目唯一标识：name + url（同站点在不同分类出现时视为同一条目）
const itemId = (it) => it.name + '|' + it.url

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

// 普通分类（virtual 高频分类不参与静态渲染，改为收藏驱动）
const normalCategories = navCategories.filter((cat) => !cat.virtual)

// 收藏 id 列表：顺序即高频区展示顺序；SSR/首屏先渲染默认值，挂载后读 localStorage
const favIds = ref([...defaultFavIds])
const STORAGE_KEY = 'nav-favorites'
const REMOVED_KEY = 'nav-favorites-removed'
// 用户明确移除过的默认高频 id：防止数据文件新增默认项的迁移逻辑把用户删掉的又加回来
const removedDefaults = ref(new Set())

onMounted(() => {
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

// ── 拖拽排序（仅高频区）────────────────────
const dragIndex = ref(-1)

function onDragStart(i, e) {
  dragIndex.value = i
  e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(i, e) {
  if (dragIndex.value < 0 || dragIndex.value === i) return
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

// ── 筛选 ─────────────────────────────────
// 筛选：按名称/描述匹配；空关键字展示全部；过滤后为空的分类自动隐藏
const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return normalCategories
  return normalCategories
    .map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (it) => it.name.toLowerCase().includes(kw) || it.desc.toLowerCase().includes(kw)
      )
    }))
    .filter((cat) => cat.items.length > 0)
})

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
  <div class="nav-board">
    <!-- 顶部工具条：标题 + 计数 + 筛选框 -->
    <div class="nav-toolbar">
      <div class="nav-headline">
        <h2 class="nav-title">开发者导航</h2>
        <span class="nav-count">{{ countText }}</span>
      </div>
      <input
        v-model="keyword"
        class="nav-search"
        type="text"
        placeholder="输入关键字筛选，如：redis / 正则 / 图标…"
      />
    </div>

    <!-- 分类锚点（筛选时隐藏，避免锚点失效） -->
    <div v-if="!keyword" class="nav-anchor">
      <a
        v-for="cat in navCategories"
        :key="cat.id"
        class="nav-anchor-item"
        :href="'#nav-' + cat.id"
      >
        <span class="nav-anchor-icon">{{ cat.icon }}</span>{{ cat.title }}
      </a>
    </div>

    <!-- 高频常用：收藏驱动，星标切换 + 拖拽排序（筛选时隐藏） -->
    <section v-if="!keyword" id="nav-hot" class="nav-section">
      <div class="nav-section-head">
        <span class="nav-section-icon">⭐</span>
        <h3 class="nav-section-title">高频常用</h3>
        <span class="nav-section-desc">点卡片右上角 ☆ 标记常用站点，拖拽卡片调整顺序</span>
      </div>

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
          <span class="nav-card-name">{{ item.name }}</span>
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
    </section>

    <!-- 分类区块 -->
    <section
      v-for="cat in filtered"
      :id="'nav-' + cat.id"
      :key="cat.id"
      class="nav-section"
    >
      <div class="nav-section-head">
        <span class="nav-section-icon">{{ cat.icon }}</span>
        <h3 class="nav-section-title">{{ cat.title }}</h3>
        <span class="nav-section-desc">{{ cat.desc }}</span>
      </div>

      <div class="nav-grid">
        <a
          v-for="item in cat.items"
          :key="itemId(item)"
          class="nav-card"
          :href="item.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          <button
            class="nav-star"
            :class="{ 'is-on': isFav(itemId(item)) }"
            :title="isFav(itemId(item)) ? '取消高频常用' : '标记为高频常用'"
            @click.prevent="toggleFav(itemId(item))"
          >{{ isFav(itemId(item)) ? '★' : '☆' }}</button>
          <span class="nav-card-name">{{ item.name }}</span>
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
.nav-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.nav-headline {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.nav-title {
  margin: 0 !important;
  border-bottom: none !important;
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
  scroll-margin-top: 96px;
}
.nav-section-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 14px;
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
  transition: all 0.2s;
}
.nav-card:hover {
  transform: translateY(-2px);
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}
/* 高频区卡片：金色描边 + 可拖拽光标 */
.nav-card.is-fav {
  border-color: rgba(234, 179, 8, 0.45);
  cursor: grab;
}
.nav-card.is-fav:active {
  cursor: grabbing;
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
.nav-card-name {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  padding-right: 40px;
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
