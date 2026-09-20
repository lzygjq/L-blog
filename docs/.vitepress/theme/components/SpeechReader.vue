<!-- 语音朗读（右侧竖栏「阅读工具」段）
     把当前页正文读出来，做法是浏览器原生 Web Speech API（speechSynthesis）：
     零依赖、零成本、**零后端** —— 对纯静态站（GitHub Pages / 托管发布）这是唯一
     不需要 API key、不需要服务端中转的可行路径，且文本不离开本机。

     ⚠️ 三个必须守住的坑（都实测过）：
     ① **SSR 安全**：VitePress 会在 Node 里执行 setup 做预渲染，而 speechSynthesis
        只在浏览器存在 → 任何 `window/speechSynthesis` 访问都必须放在 onMounted 之后，
        组件顶层一个都不能碰。
     ② **getVoices() 是异步的**：首次调用常返回空数组（Chrome 尤其），必须监听
        `voiceschanged` 事件二次填充 —— 否则音色下拉框永远是空的。
     ③ **cancel() 后旧 utterance 的 onend 仍可能触发**：会造成队列错乱（跳段、连读）。
        用自增 token 守卫：每次开新的一轮就 token++，回调里先比对 token 再动作。

     ⚠️ 为什么要分段：Chrome 对单个 utterance 有长度上限，超长会**静默停止**
     （不报错、不触发 onend），表现为「读到一半突然没了」。所以按正文块切段，
     超长块再按句末标点切子句，逐条排队 speak()。

     ⚠️ 本按钮是 .right-rail 的直接子元素 → 沉浸模式下会被
     `html.immersive .right-rail > *` 一并隐藏（刻意的：沉浸的语义就是只剩正文）。
     但**面板是 Teleport 到 body 的**，若朗读进行中再进沉浸模式，语音不会中断
     （这是对的：进沉浸是为了专心听）。 -->
<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()

const open = ref(false)
const ready = ref(false) // SSR 期不渲染面板内容，避免水合不一致
const supported = ref(true)

const btnRef = ref(null)
const panelRef = ref(null)
const pos = ref({ top: 0, left: 0 })

const PANEL_W = 320
const GAP = 8

// 朗读状态
const segs = ref([]) // [{ text, el }]
const idx = ref(0)
const playing = ref(false)
const paused = ref(false)
const rate = ref(1)
const voices = ref([])
const voiceURI = ref('')
const activeEl = ref(null)

let token = 0 // 见头注释 ③
let startIdx = 0

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2]
const CHARS_PER_MIN = 240 // 中文朗读速率基准，用于估时长

// ---------- 段落切分 ----------
// 只取「值得听」的块：跳过代码块与表格（表格读成「表头 表头 值 值」毫无意义，
// 且本站表格极多，读起来会把播客体感毁掉）。同时候选里若有祖先-后代关系
// （li > p、blockquote > p），只留祖先，避免同一句话读两遍。
const CANDIDATE_SEL =
  '.vp-doc p, .vp-doc li, .vp-doc h1, .vp-doc h2, .vp-doc h3, .vp-doc h4, .vp-doc blockquote'

function textOf(el) {
  const clone = el.cloneNode(true)
  // 去掉锚点「#」、图标、隐藏文本 —— 否则会被念成「井号」
  clone.querySelectorAll('.header-anchor, .vp-link-icon, svg, button, .sr-only').forEach((n) => n.remove())
  return (clone.textContent || '').replace(/\s+/g, ' ').trim()
}

// 长块按句末标点切子句，限长 180 字（防 Chrome 静默截断）
function splitLong(text, max = 180) {
  if (text.length <= max) return [text]
  const clauses = text.match(/[^。！？；!?;]+[。！？；!?;]?/g) || [text]
  const out = []
  let buf = ''
  for (const c of clauses) {
    if (buf && (buf + c).length > max) {
      out.push(buf)
      buf = ''
    }
    buf += c
    if (buf.length >= max) {
      out.push(buf)
      buf = ''
    }
  }
  if (buf) out.push(buf)
  return out
}

function collect() {
  if (typeof document === 'undefined') return []
  const root = document.querySelector('.vp-doc')
  if (!root) return []
  const nodes = Array.from(root.querySelectorAll(CANDIDATE_SEL))
  const picked = []
  for (const el of nodes) {
    if (el.closest('pre')) continue // 代码块
    if (el.closest('table')) continue // 表格
    // 祖先已在候选里 → 跳过（避免父子都读）
    let dup = false
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
      if (nodes.includes(p)) {
        dup = true
        break
      }
    }
    if (dup) continue
    const text = textOf(el)
    if (!text || !/[\u4e00-\u9fffA-Za-z]/.test(text)) continue
    picked.push({ el, text })
  }
  const out = []
  for (const seg of picked) for (const t of splitLong(seg.text)) out.push({ el: seg.el, text: t })
  return out
}

// ---------- 音色 ----------
function loadVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  const all = window.speechSynthesis.getVoices() || []
  // 只留中文音色：本站正文以中文为主，选英文音色会把汉字读成乱码
  const zh = all.filter((v) => /^zh/i.test(v.lang) || /中文|普通话|Chinese|Tingting|婷婷|Yaoyao/i.test(v.name))
  voices.value = zh
  if (!voiceURI.value && zh.length) voiceURI.value = zh[0].voiceURI
}

const pickedVoice = computed(() => voices.value.find((v) => v.voiceURI === voiceURI.value) || null)

// ---------- 播放 ----------
function estimateSec(fromIdx) {
  let chars = 0
  for (let i = fromIdx; i < segs.value.length; i++) chars += segs.value[i].text.length
  return (chars / CHARS_PER_MIN) * 60 / rate.value
}

function fmtSec(s) {
  if (!isFinite(s) || s <= 0) return '0 秒'
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  if (m >= 60) return `${Math.floor(m / 60)} 小时 ${m % 60} 分`
  return m ? `${m} 分 ${sec} 秒` : `${sec} 秒`
}

const remainText = computed(() => {
  if (!ready.value || !playing.value) return ''
  const cur = segs.value[idx.value]
  const rest = cur ? cur.text.length : 0
  let chars = rest
  for (let i = idx.value + 1; i < segs.value.length; i++) chars += segs.value[i].text.length
  return fmtSec((chars / CHARS_PER_MIN) * 60 / rate.value)
})

const progress = computed(() => {
  if (!ready.value || !segs.value.length) return 0
  return Math.min(100, Math.round(((idx.value + (playing.value ? 0.5 : 0)) / segs.value.length) * 100))
})

function highlight(el) {
  if (activeEl.value === el) return
  if (activeEl.value) activeEl.value.classList.remove('speech-active')
  activeEl.value = el
  if (!el) return
  el.classList.add('speech-active')
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function clearHighlight() {
  if (activeEl.value) activeEl.value.classList.remove('speech-active')
  activeEl.value = null
}

function speakCurrent(myToken) {
  if (myToken !== token) return
  const seg = segs.value[idx.value]
  if (!seg) {
    stop()
    return
  }
  const u = new SpeechSynthesisUtterance(seg.text)
  u.lang = pickedVoice.value?.lang || 'zh-CN'
  u.rate = rate.value
  // ⚠️ 给 .voice 赋值**可能抛异常**（实测：传入非原生 SpeechSynthesisVoice 对象时抛
  // 「Failed to convert value to 'SpeechSynthesisVoice'」）。真实场景也会遇到 ——
  // 系统语音被卸载 / 更新 / 切换账户后，早先缓存的那份 voice 列表就可能失效。
  // 必须容错：异常会中断整个 speakCurrent，表现为「点了开始朗读毫无反应」且**完全静默**
  // （无提示、无报错弹窗）。这正是 2026-09-20 实测踩到的形态，不是理论风险。
  try {
    if (pickedVoice.value) u.voice = pickedVoice.value
  } catch {
    /* 退回只用 u.lang，交给浏览器按语言自选 */
  }
  u.onstart = () => {
    if (myToken !== token) return
    playing.value = true
    paused.value = false
    highlight(seg.el)
  }
  u.onend = () => {
    if (myToken !== token) return
    idx.value += 1
    speakCurrent(myToken)
  }
  u.onerror = (e) => {
    if (myToken !== token) return
    // interrupted / canceled 是主动打断，不是故障
    if (e?.error === 'interrupted' || e?.error === 'canceled') return
    stop()
  }
  try {
    window.speechSynthesis.speak(u)
  } catch (e) {
    // 不让任何异常静默吞掉整条链路：至少把状态复位、并在控制台留痕
    console.warn('[SpeechReader] speechSynthesis.speak 失败：', e)
    stop()
  }
}

// 从「当前视口可见的第一个段落」起读 —— 播客体验的关键：不必从页首重听
function resumeIndex() {
  const vh = window.innerHeight
  for (let i = 0; i < segs.value.length; i++) {
    const r = segs.value[i].el.getBoundingClientRect()
    if (r.bottom > 96) return i
  }
  return 0
}

function play() {
  if (!supported.value) return
  segs.value = collect()
  if (!segs.value.length) return
  token += 1
  const myToken = token
  idx.value = resumeIndex()
  window.speechSynthesis.cancel()
  speakCurrent(myToken)
}

function togglePause() {
  if (!window.speechSynthesis) return
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume()
    paused.value = false
  } else if (window.speechSynthesis.speaking) {
    window.speechSynthesis.pause()
    paused.value = true
  } else {
    play()
  }
}

function stop() {
  token += 1 // 作废所有在飞的回调
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
  playing.value = false
  paused.value = false
  clearHighlight()
}

function jump(delta) {
  if (!segs.value.length) return
  token += 1
  const myToken = token
  idx.value = Math.max(0, Math.min(segs.value.length - 1, idx.value + delta))
  window.speechSynthesis.cancel()
  speakCurrent(myToken)
}

// ---------- 面板 ----------
function place() {
  const r = btnRef.value?.getBoundingClientRect()
  if (!r) return
  const h = panelRef.value?.offsetHeight || 280
  pos.value = {
    top: Math.max(GAP, Math.min(r.top, window.innerHeight - h - GAP)),
    left: Math.max(GAP, r.left - PANEL_W - GAP)
  }
}

function toggle() {
  open.value = !open.value
  if (open.value) {
    loadVoices()
    nextTick(place)
  } else if (!playing.value) {
    segs.value = []
  }
}

function onDocClick(e) {
  if (!open.value) return
  if (panelRef.value?.contains(e.target)) return
  if (btnRef.value?.contains(e.target)) return
  // 例外：**朗读进行中**点击「沉浸阅读」开关时不关面板。
  // 理由：那个开关一旦生效，右栏整条（含本按钮）都会被隐藏 —— 面板若同时被
  // 外部点击关掉，读者就彻底失去了暂停/停止的控制权，只能按 Esc 退出沉浸才停得下来。
  // 未播放时照常关闭（走一般的外部点击语义，与 ReadingLog.vue 一致）。
  if (playing.value && e.target?.closest?.('.immersive-toggle')) return
  open.value = false
}

function onKey(e) {
  if (e.key === 'Escape' && open.value) open.value = false
}

// 语速变了要重读当前段才生效（speechSynthesis 的 rate 只在 speak 时读取）
watch(rate, () => {
  if (playing.value && !paused.value) jump(0)
})
watch(voiceURI, () => {
  if (playing.value && !paused.value) jump(0)
})

onMounted(() => {
  ready.value = true
  supported.value = typeof window !== 'undefined' && 'speechSynthesis' in window
  if (supported.value) {
    loadVoices()
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices)
  }
  document.addEventListener('click', onDocClick, true)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', () => {
    open.value = false
  })
})

onUnmounted(() => {
  stop()
  if (supported.value) window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices)
  document.removeEventListener('click', onDocClick, true)
  document.removeEventListener('keydown', onKey)
})

// 换页必须停：否则会接着读上一页的内容（DOM 已经换掉了，el 引用全失效）
watch(
  () => route.path,
  () => {
    stop()
    segs.value = []
    open.value = false
  }
)
</script>

<template>
  <button
    ref="btnRef"
    class="speech-toggle"
    :class="{ active: open, speaking: playing }"
    :aria-expanded="open"
    aria-haspopup="true"
    aria-label="语音朗读"
    title="语音朗读：把本页正文读出来（浏览器原生，文本不上传）"
    @click="toggle"
  >
    <svg
      class="icon"
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M3.6 7.6h2.5L9.6 4.4v11.2L6.1 12.4H3.6z" />
      <path d="M12.3 7.6a3.4 3.4 0 0 1 0 4.8" />
      <path d="M14.6 5.6a6.2 6.2 0 0 1 0 8.8" />
    </svg>
  </button>

  <Teleport to="body">
    <Transition name="sr-fade">
      <div
        v-if="open"
        ref="panelRef"
        class="speech-panel"
        role="dialog"
        aria-label="语音朗读"
        :style="{ top: pos.top + 'px', left: pos.left + 'px', width: PANEL_W + 'px' }"
      >
        <div class="sr-head">
          <span class="sr-title">语音朗读</span>
          <button v-if="playing" type="button" class="sr-link" @click="stop">停止</button>
        </div>

        <p v-if="!supported" class="sr-note">
          当前浏览器不支持语音合成（Web Speech API）。
        </p>

        <template v-else>
          <p v-if="!playing" class="sr-note">
            点「开始朗读」会从 <strong>当前屏幕位置</strong> 往下读，不用从页首重听。<br />
            代码块与表格会被跳过。
          </p>

          <template v-else>
            <div class="sr-status">
              <span>第 {{ idx + 1 }} / {{ segs.length }} 段</span>
              <span v-if="remainText">剩余约 {{ remainText }}</span>
            </div>
            <div class="sr-bar" aria-hidden="true">
              <div class="sr-bar-fill" :style="{ width: progress + '%' }" />
            </div>
          </template>

          <div class="sr-actions">
            <button type="button" class="sr-btn sr-btn-icon" :disabled="!playing" title="上一段" @click="jump(-1)">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path d="M13.5 5.5v9L7 10z" /><path d="M6 5.5v9" />
              </svg>
            </button>

            <button type="button" class="sr-btn sr-btn-main" @click="playing ? togglePause() : play()">
              <svg v-if="!playing" viewBox="0 0 20 20" width="15" height="15" fill="currentColor">
                <path d="M6.5 4.4v11.2L15 10z" />
              </svg>
              <svg v-else-if="paused" viewBox="0 0 20 20" width="15" height="15" fill="currentColor">
                <path d="M6.5 4.4v11.2L15 10z" />
              </svg>
              <svg v-else viewBox="0 0 20 20" width="15" height="15" fill="currentColor">
                <rect x="5.6" y="4.4" width="3.2" height="11.2" rx="1" />
                <rect x="11.2" y="4.4" width="3.2" height="11.2" rx="1" />
              </svg>
              <span>{{ !playing ? '开始朗读' : paused ? '继续' : '暂停' }}</span>
            </button>

            <button type="button" class="sr-btn sr-btn-icon" :disabled="!playing" title="下一段" @click="jump(1)">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6.5 5.5v9L13 10z" /><path d="M14 5.5v9" />
              </svg>
            </button>
          </div>

          <div class="sr-row">
            <span class="sr-label">语速</span>
            <input
              class="sr-range"
              type="range"
              min="0"
              :max="RATES.length - 1"
              step="1"
              :value="RATES.indexOf(rate)"
              @input="rate = RATES[Number($event.target.value)]"
            />
            <span class="sr-val">{{ rate }}×</span>
          </div>

          <div class="sr-row">
            <span class="sr-label">音色</span>
            <select class="sr-select" v-model="voiceURI" :disabled="!voices.length">
              <option v-if="!voices.length" value="">（系统未提供中文语音）</option>
              <option v-for="v in voices" :key="v.voiceURI" :value="v.voiceURI">
                {{ v.name }}
              </option>
            </select>
          </div>

          <p class="sr-tip">音色取自本机系统，各设备可能不同。</p>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.speech-toggle {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: color 0.2s ease, background-color 0.2s ease;
}

.speech-toggle:hover,
.speech-toggle.active {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
}

/* 朗读进行中：图标常亮，给出「正在播」的持续反馈 */
.speech-toggle.speaking {
  color: var(--vp-c-brand-1);
}
</style>

<!-- 面板样式不加 scoped（Teleport 到 body 后的既有约定，见 ReadingLog.vue） -->
<style>
.speech-panel {
  position: fixed;
  z-index: 60;
  padding: 10px 12px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
  font-size: 13px;
  line-height: 20px;
}

.speech-panel .sr-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.speech-panel .sr-title {
  color: var(--vp-c-text-3);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.speech-panel .sr-link {
  border: none;
  background: transparent;
  padding: 2px 6px;
  border-radius: 5px;
  color: var(--vp-c-text-3);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.2s, background-color 0.2s;
}

.speech-panel .sr-link:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
}

.speech-panel .sr-note {
  margin: 0 0 10px;
  color: var(--vp-c-text-3);
  font-size: 12px;
  line-height: 1.7;
}

.speech-panel .sr-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.speech-panel .sr-bar {
  height: 3px;
  margin-bottom: 12px;
  border-radius: 2px;
  background: var(--vp-c-divider);
  overflow: hidden;
}

.speech-panel .sr-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--vp-c-brand-1);
  transition: width 0.25s ease;
}

.speech-panel .sr-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.speech-panel .sr-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background-color 0.2s;
}

.speech-panel .sr-btn:hover:not(:disabled) {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.speech-panel .sr-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.speech-panel .sr-btn-icon {
  width: 38px;
  flex-shrink: 0;
}

.speech-panel .sr-btn-main {
  flex: 1;
  gap: 6px;
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: #fff;
  font-weight: 500;
}

.speech-panel .sr-btn-main:hover:not(:disabled) {
  color: #fff;
  opacity: 0.88;
}

.speech-panel .sr-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.speech-panel .sr-label {
  flex-shrink: 0;
  width: 30px;
  color: var(--vp-c-text-3);
  font-size: 12px;
}

.speech-panel .sr-range {
  flex: 1;
  accent-color: var(--vp-c-brand-1);
}

.speech-panel .sr-val {
  flex-shrink: 0;
  width: 34px;
  text-align: right;
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.speech-panel .sr-select {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-family: inherit;
  font-size: 12px;
}

.speech-panel .sr-tip {
  margin: 10px 0 0;
  color: var(--vp-c-text-3);
  font-size: 11px;
  line-height: 1.6;
}

/* 正在朗读的正文块：左侧品牌色竖条 + 极淡底色，滚动跟随时的视觉锚点 */
.vp-doc .speech-active {
  position: relative;
  background: var(--vp-c-brand-soft);
  border-radius: 4px;
  transition: background-color 0.3s ease;
}

.vp-doc .speech-active::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 2px;
  bottom: 2px;
  width: 3px;
  border-radius: 2px;
  background: var(--vp-c-brand-1);
}

/* 过渡类放全局块（与 ReadingLog 同一约定） */
.sr-fade-enter-active,
.sr-fade-leave-active {
  transition: opacity 0.18s, transform 0.18s;
}

.sr-fade-enter-from,
.sr-fade-leave-to {
  opacity: 0;
  transform: translateX(6px);
}
</style>
