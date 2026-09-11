import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"AI 编程与 Agent 板块导览","description":"","frontmatter":{},"headers":[],"relativePath":"ai/index.md","filePath":"ai/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "ai/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="ai-编程与-agent-板块导览" tabindex="-1">AI 编程与 Agent 板块导览 <a class="header-anchor" href="#ai-编程与-agent-板块导览" aria-label="Permalink to &quot;AI 编程与 Agent 板块导览&quot;">​</a></h1><p>面向 AI 时代的工程实践：Vibe Coding 开发范式、Agent 与 Harness 机制原理、Spring AI / Spring AI Alibaba 落地。这是本站相对传统 Java 知识体系的差异化板块。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("ai/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
