import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"面试专题导览","description":"","frontmatter":{},"headers":[],"relativePath":"interview/index.md","filePath":"interview/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "interview/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="面试专题导览" tabindex="-1">面试专题导览 <a class="header-anchor" href="#面试专题导览" aria-label="Permalink to &quot;面试专题导览&quot;">​</a></h1><p>横向串联各板块的高频面试题索引：每道题给出「一句话答案 + 深度文章链接」。</p><blockquote><p>待建设：按 Java 基础 / 并发 / JVM / Spring / MySQL / Redis / MQ / 分布式 / 云原生 / AI 分类补全。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("interview/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
