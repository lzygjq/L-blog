import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"大数据架构方案 → 数仓落地","description":"","frontmatter":{},"headers":[],"relativePath":"projects/property-saas/data-warehouse/index.md","filePath":"projects/property-saas/data-warehouse/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "projects/property-saas/data-warehouse/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="大数据架构方案-→-数仓落地" tabindex="-1">大数据架构方案 → 数仓落地 <a class="header-anchor" href="#大数据架构方案-→-数仓落地" aria-label="Permalink to &quot;大数据架构方案 → 数仓落地&quot;">​</a></h1><blockquote><p>待撰写。提纲：选型结论（Doris + RocketMQ + MinIO/Iceberg，不用 Hadoop）、Canal 同步链路、冷热分层与 TTL 迁移。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("projects/property-saas/data-warehouse/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
