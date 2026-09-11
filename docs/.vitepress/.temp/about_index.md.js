import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"关于本站","description":"","frontmatter":{},"headers":[],"relativePath":"about/index.md","filePath":"about/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "about/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="关于本站" tabindex="-1">关于本站 <a class="header-anchor" href="#关于本站" aria-label="Permalink to &quot;关于本站&quot;">​</a></h1><p>13 年+ Java/PHP 后端开发者的个人知识体系站，定位：<strong>对抗碎片化学习，用可验证产出沉淀技术成长</strong>。</p><h2 id="内容规划" tabindex="-1">内容规划 <a class="header-anchor" href="#内容规划" aria-label="Permalink to &quot;内容规划&quot;">​</a></h2><ul><li>知识板块：Java / 数据库 / 中间件 / 大数据 / 云原生 / AI 编程</li><li>项目复盘：绩效系统、智慧物业 SaaS —— 技术难点专题化</li><li>面试专题：横向串联的高频题索引</li></ul><h2 id="更新节奏" tabindex="-1">更新节奏 <a class="header-anchor" href="#更新节奏" aria-label="Permalink to &quot;更新节奏&quot;">​</a></h2><p>以板块导览页的「写作中」清单为准，持续滚动更新。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("about/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
