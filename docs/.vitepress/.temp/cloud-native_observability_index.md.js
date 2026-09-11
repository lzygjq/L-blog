import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"监控与可观测","description":"","frontmatter":{},"headers":[],"relativePath":"cloud-native/observability/index.md","filePath":"cloud-native/observability/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "cloud-native/observability/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="监控与可观测" tabindex="-1">监控与可观测 <a class="header-anchor" href="#监控与可观测" aria-label="Permalink to &quot;监控与可观测&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：Metrics/Logging/Tracing 三支柱、Prometheus + Grafana、链路追踪选型。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("cloud-native/observability/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
