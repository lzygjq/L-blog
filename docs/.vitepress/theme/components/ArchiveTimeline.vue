<script setup>
// 归档时间轴：数据来自 /archives/index.data.js（createContentLoader 全站扫描）
// 按「年 → 月 → 日 → 文章」四级倒序展示，新文章只需落对目录 + 带 date frontmatter 即自动收录
//
// 2026-09-16 改版（用户：「太丑了」）。旧版把「日期 / 标题 / 摘要」塞进同一行，
// 标题在 flex 里被摘要挤到只剩约 100px、折成三四行；且 127 篇全在一个「年 月」
// 分组下平铺。现改为：摘要下移独占一行 + 按日拆分组 + 时间轴导轨 + 筛选框。
import { computed, ref } from 'vue'

const props = defineProps({
  items: { type: Array, required: true },
})

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const q = ref('')

// 兼容 frontmatter.date 被 YAML 解析成 Date 或保留为字符串两种形态。
// 不直接 new Date(str)：'2026-09-16' 会按 UTC 解析，东八区之外可能差一天。
function parseDate(v) {
  if (v instanceof Date && !Number.isNaN(+v)) return v
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''))
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  const d = new Date(v)
  return Number.isNaN(+d) ? null : d
}

const pad2 = (n) => String(n).padStart(2, '0')
const norm = (s) => String(s ?? '').toLowerCase()

// ① 归组：年 → 月 → 日，逐级倒序
const tree = computed(() => {
  const months = new Map()
  for (const it of props.items) {
    const d = parseDate(it.frontmatter?.date)
    if (!d) continue
    const y = d.getFullYear()
    const mo = d.getMonth() + 1
    const day = d.getDate()
    const mk = `${y}-${pad2(mo)}`
    if (!months.has(mk)) months.set(mk, { y, mo, days: new Map() })
    const month = months.get(mk)
    if (!month.days.has(day)) month.days.set(day, [])
    month.days.get(day).push({
      url: it.url,
      title: it.frontmatter?.title || it.url,
      desc: it.frontmatter?.desc || '',
      date: d,
    })
  }
  return [...months.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, m]) => ({
      key,
      label: `${m.y} 年 ${m.mo} 月`,
      days: [...m.days.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([day, posts]) => {
          const dt = posts[0].date
          return {
            key: `${key}-${pad2(day)}`,
            md: `${pad2(m.mo)}-${pad2(day)}`,
            week: WEEK[dt.getDay()],
            posts: posts.slice().sort((a, b) => b.date - a.date),
          }
        }),
    }))
})

// ② 筛选：命中标题或摘要；空掉的日/月分组自动隐藏
const keyword = computed(() => q.value.trim().toLowerCase())
const view = computed(() => {
  const k = keyword.value
  if (!k) return tree.value
  return tree.value
    .map((m) => ({
      ...m,
      days: m.days
        .map((d) => ({
          ...d,
          posts: d.posts.filter(
            (p) => norm(p.title).includes(k) || norm(p.desc).includes(k),
          ),
        }))
        .filter((d) => d.posts.length),
    }))
    .filter((m) => m.days.length)
})

const total = computed(() => props.items.length)
const monthCount = computed(() => tree.value.length)
const dayCount = computed(() =>
  tree.value.reduce((n, m) => n + m.days.length, 0),
)
const hit = computed(() =>
  view.value.reduce(
    (n, m) => n + m.days.reduce((s, d) => s + d.posts.length, 0),
    0,
  ),
)
</script>

<template>
  <div class="arc">
    <!-- 工具条：筛选 + 统计 -->
    <div class="arc-bar">
      <label class="arc-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.6-3.6" stroke-linecap="round" />
        </svg>
        <input
          v-model="q"
          type="search"
          placeholder="筛选标题或摘要…"
          aria-label="筛选归档文章"
        />
        <button v-if="q" class="arc-clear" type="button" aria-label="清空筛选" @click="q = ''">
          ×
        </button>
      </label>
      <span class="arc-meta">
        <template v-if="keyword">
          匹配 <b>{{ hit }}</b> / {{ total }} 篇
        </template>
        <template v-else>
          共 <b>{{ total }}</b> 篇 · {{ monthCount }} 个月 · {{ dayCount }} 天
        </template>
      </span>
    </div>

    <p v-if="!view.length" class="arc-empty">
      没有匹配「{{ q.trim() }}」的文章。
    </p>

    <section v-for="m in view" :key="m.key" class="arc-month">
      <h2 class="arc-month-title">{{ m.label }}</h2>
      <div class="arc-days">
        <div v-for="d in m.days" :key="d.key" class="arc-day">
          <div class="arc-day-head">
            <span class="arc-dot" aria-hidden="true" />
            <time class="arc-day-date">{{ d.md }}</time>
            <span class="arc-day-week">周{{ d.week }}</span>
            <span class="arc-day-count">{{ d.posts.length }} 篇</span>
          </div>
          <ul class="arc-posts">
            <li v-for="p in d.posts" :key="p.url" class="arc-post">
              <a :href="p.url">
                <span class="arc-post-title">{{ p.title }}</span>
                <span v-if="p.desc" class="arc-post-desc">{{ p.desc }}</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ---------- 工具条 ---------- */
.arc-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: 20px 0 4px;
}

.arc-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 240px;
  max-width: 340px;
}

.arc-search svg {
  position: absolute;
  left: 11px;
  width: 15px;
  height: 15px;
  color: var(--vp-c-text-3);
  pointer-events: none;
}

.arc-search input {
  width: 100%;
  padding: 7px 30px 7px 33px;
  font-size: 14px;
  line-height: 20px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  outline: none;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.arc-search input::placeholder {
  color: var(--vp-c-text-3);
}

.arc-search input:focus {
  background: var(--vp-c-bg);
  border-color: var(--vp-c-brand-1);
}

/* 去掉 WebKit 自带的搜索框清除按钮，用下面自绘的 */
.arc-search input::-webkit-search-cancel-button {
  display: none;
}

.arc-clear {
  position: absolute;
  right: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 15px;
  line-height: 1;
  color: var(--vp-c-text-3);
  background: transparent;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  transition: color 0.16s ease, background-color 0.16s ease;
}

.arc-clear:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-default-soft);
}

.arc-meta {
  margin-left: auto;
  font-size: 13px;
  color: var(--vp-c-text-3);
  white-space: nowrap;
}

.arc-meta b {
  color: var(--vp-c-text-1);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* ---------- 月份标题：文字 + 右侧延伸细线 ---------- */
.arc-month-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 36px 0 16px;
  padding: 0;
  font-size: 19px;
  font-weight: 600;
  line-height: 30px;
  letter-spacing: 0.01em;
  color: var(--vp-c-text-1);
  border-top: none;
}

.arc-month-title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--vp-c-divider);
}

.arc-month-title:first-of-type {
  margin-top: 24px;
}

/* ---------- 时间轴导轨 ---------- */
.arc-days {
  position: relative;
}

.arc-days::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 14px;
  bottom: 6px;
  width: 1px;
  background: var(--vp-c-divider);
}

.arc-day {
  position: relative;
  padding-left: 28px;
}

.arc-day + .arc-day {
  margin-top: 20px;
}

.arc-day-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 22px;
}

.arc-dot {
  position: absolute;
  left: 1px;
  top: 6px;
  width: 9px;
  height: 9px;
  background: var(--vp-c-bg);
  border: 2px solid var(--vp-c-divider);
  border-radius: 50%;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.arc-day:hover .arc-dot {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.arc-day-date {
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
}

.arc-day-week {
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.arc-day-count {
  padding: 0 7px;
  font-size: 12px;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-3);
  background: var(--vp-c-default-soft);
  border-radius: 999px;
}

/* ---------- 文章列表：标题一行、摘要另起一行 ---------- */
.arc-posts {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.arc-post a {
  display: block;
  margin-left: -10px;
  padding: 6px 10px 7px;
  border-radius: 8px;
  font-weight: inherit;
  color: inherit;
  text-decoration: none;
  transition: background-color 0.16s ease;
}

.arc-post a:hover {
  background-color: var(--vp-c-default-soft);
}

.arc-post-title {
  display: block;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.55;
  color: var(--vp-c-text-1);
  transition: color 0.16s ease;
}

.arc-post a:hover .arc-post-title {
  color: var(--vp-c-brand-1);
}

.arc-post-desc {
  display: block;
  margin-top: 1px;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-3);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- 空态 ---------- */
.arc-empty {
  margin: 24px 0;
  padding: 22px;
  font-size: 14px;
  color: var(--vp-c-text-3);
  text-align: center;
  border: 1px dashed var(--vp-c-divider);
  border-radius: 10px;
}

/* ---------- 窄屏 ---------- */
@media (max-width: 767px) {
  .arc-search {
    flex: 1 1 100%;
    max-width: none;
  }

  .arc-meta {
    margin-left: 0;
  }

  /* 窄屏摘要折两行，比"整行省略"更有信息量 */
  .arc-post-desc {
    display: -webkit-box;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .arc-day {
    padding-left: 22px;
  }

  .arc-post a {
    margin-left: -8px;
    padding-left: 8px;
  }
}
</style>
