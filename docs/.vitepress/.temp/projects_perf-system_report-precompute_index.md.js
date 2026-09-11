import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"报表预计算","description":"","frontmatter":{},"headers":[],"relativePath":"projects/perf-system/report-precompute/index.md","filePath":"projects/perf-system/report-precompute/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "projects/perf-system/report-precompute/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="报表预计算" tabindex="-1">报表预计算 <a class="header-anchor" href="#报表预计算" aria-label="Permalink to &quot;报表预计算&quot;">​</a></h1><blockquote><p>待撰写。提纲：实时计算 vs 预计算权衡、调度与分层汇总、结果表设计与查询加速。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("projects/perf-system/report-precompute/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
