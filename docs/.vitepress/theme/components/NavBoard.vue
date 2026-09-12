<!-- 开发者导航组件：分类锚点 + 即时筛选 + 卡片网格
     数据源：../data/navData.mjs（增删条目只改数据文件） -->
<script setup>
import { computed, ref } from 'vue'
import { navCategories, navTotal } from '../data/navData.mjs'

const keyword = ref('')

// 筛选：按名称/描述匹配；空关键字展示全部；过滤后为空的分类自动隐藏
const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return navCategories
  return navCategories
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
    ? `匹配 ${matchCount.value} / ${navTotal} 个站点`
    : `共 ${navTotal} 个站点`
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
          :key="item.name"
          class="nav-card"
          :href="item.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span v-if="item.hot" class="nav-hot-badge">常用</span>
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
.nav-hot-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 1px 7px;
  font-size: 11px;
  border-radius: 999px;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
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

.nav-empty {
  padding: 40px 0;
  text-align: center;
  font-size: 14px;
  opacity: 0.7;
}
</style>
