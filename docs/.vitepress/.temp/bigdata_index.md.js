import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"大数据与数仓板块导览","description":"","frontmatter":{},"headers":[],"relativePath":"bigdata/index.md","filePath":"bigdata/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "bigdata/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="大数据与数仓板块导览" tabindex="-1">大数据与数仓板块导览 <a class="header-anchor" href="#大数据与数仓板块导览" aria-label="Permalink to &quot;大数据与数仓板块导览&quot;">​</a></h1><p>围绕 property-saas Phase3 数仓方案沉淀：MySQL binlog → Canal → Doris 的实时数仓链路，Iceberg/MinIO 冷归档与冷热分层，以及数仓分层建模方法论。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("bigdata/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
