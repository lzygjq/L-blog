import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Doris 数仓","description":"","frontmatter":{},"headers":[],"relativePath":"bigdata/doris/index.md","filePath":"bigdata/doris/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "bigdata/doris/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="doris-数仓" tabindex="-1">Doris 数仓 <a class="header-anchor" href="#doris-数仓" aria-label="Permalink to &quot;Doris 数仓&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：Doris 架构（FE/BE）、表模型、物化视图、与 MySQL 冷热分层配合。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("bigdata/doris/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
