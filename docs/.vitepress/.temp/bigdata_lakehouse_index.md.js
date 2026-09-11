import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Lakehouse：Iceberg / MinIO / 冷热分层","description":"","frontmatter":{},"headers":[],"relativePath":"bigdata/lakehouse/index.md","filePath":"bigdata/lakehouse/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "bigdata/lakehouse/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="lakehouse-iceberg-minio-冷热分层" tabindex="-1">Lakehouse：Iceberg / MinIO / 冷热分层 <a class="header-anchor" href="#lakehouse-iceberg-minio-冷热分层" aria-label="Permalink to &quot;Lakehouse：Iceberg / MinIO / 冷热分层&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：Iceberg 表格式、MinIO 对象存储、TTL 自动迁移与归档策略。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("bigdata/lakehouse/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
