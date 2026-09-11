import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Spring AI Alibaba","description":"","frontmatter":{},"headers":[],"relativePath":"ai/spring-ai-alibaba/index.md","filePath":"ai/spring-ai-alibaba/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "ai/spring-ai-alibaba/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="spring-ai-alibaba" tabindex="-1">Spring AI Alibaba <a class="header-anchor" href="#spring-ai-alibaba" aria-label="Permalink to &quot;Spring AI Alibaba&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：通义系列模型接入、Graph 多 Agent 框架、国内落地案例。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("ai/spring-ai-alibaba/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
