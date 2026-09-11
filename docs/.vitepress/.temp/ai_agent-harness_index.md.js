import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Agent 与 Harness","description":"","frontmatter":{},"headers":[],"relativePath":"ai/agent-harness/index.md","filePath":"ai/agent-harness/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "ai/agent-harness/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="agent-与-harness" tabindex="-1">Agent 与 Harness <a class="header-anchor" href="#agent-与-harness" aria-label="Permalink to &quot;Agent 与 Harness&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：Agent 循环（感知-规划-执行）、Harness 工具链机制、MCP 协议、多 Agent 协作。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("ai/agent-harness/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
