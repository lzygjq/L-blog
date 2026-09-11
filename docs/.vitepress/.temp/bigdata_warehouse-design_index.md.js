import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"数仓分层建模","description":"","frontmatter":{},"headers":[],"relativePath":"bigdata/warehouse-design/index.md","filePath":"bigdata/warehouse-design/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "bigdata/warehouse-design/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="数仓分层建模" tabindex="-1">数仓分层建模 <a class="header-anchor" href="#数仓分层建模" aria-label="Permalink to &quot;数仓分层建模&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：ODS/DWD/DWS/ADS 分层、维度建模、指标体系设计。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("bigdata/warehouse-design/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
