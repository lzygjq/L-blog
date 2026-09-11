import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"多级审批消息实时推送","description":"","frontmatter":{},"headers":[],"relativePath":"projects/perf-system/approval-push/index.md","filePath":"projects/perf-system/approval-push/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "projects/perf-system/approval-push/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="多级审批消息实时推送" tabindex="-1">多级审批消息实时推送 <a class="header-anchor" href="#多级审批消息实时推送" aria-label="Permalink to &quot;多级审批消息实时推送&quot;">​</a></h1><blockquote><p>待撰写。提纲：推送通道选型（WebSocket/SSE/长轮询）、审批流状态机、消息可达性保障。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("projects/perf-system/approval-push/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
