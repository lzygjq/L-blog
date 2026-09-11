import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Vibe Coding","description":"","frontmatter":{},"headers":[],"relativePath":"ai/vibe-coding/index.md","filePath":"ai/vibe-coding/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "ai/vibe-coding/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="vibe-coding" tabindex="-1">Vibe Coding <a class="header-anchor" href="#vibe-coding" aria-label="Permalink to &quot;Vibe Coding&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：AI 辅助编程工作流、提示词工程、CodeBuddy/Qoder 等工具实测对比。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("ai/vibe-coding/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
