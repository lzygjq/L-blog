import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"高峰期并发填报","description":"","frontmatter":{},"headers":[],"relativePath":"projects/perf-system/peak-filling/index.md","filePath":"projects/perf-system/peak-filling/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "projects/perf-system/peak-filling/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="高峰期并发填报" tabindex="-1">高峰期并发填报 <a class="header-anchor" href="#高峰期并发填报" aria-label="Permalink to &quot;高峰期并发填报&quot;">​</a></h1><blockquote><p>待撰写。提纲：流量预估与削峰、提交链路异步化、防重复提交、DB 写入热点打散、压测数据。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("projects/perf-system/peak-filling/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
