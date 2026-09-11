import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"绩效系统（6 万人规模）导览","description":"","frontmatter":{},"headers":[],"relativePath":"projects/perf-system/index.md","filePath":"projects/perf-system/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "projects/perf-system/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="绩效系统-6-万人规模-导览" tabindex="-1">绩效系统（6 万人规模）导览 <a class="header-anchor" href="#绩效系统-6-万人规模-导览" aria-label="Permalink to &quot;绩效系统（6 万人规模）导览&quot;">​</a></h1><p>宝能集团总部绩效系统技术复盘。四大难点专题：组织架构同步（量级挑战）、并发填报（高峰洪峰）、审批推送（实时性）、报表预计算（查询性能）。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("projects/perf-system/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
