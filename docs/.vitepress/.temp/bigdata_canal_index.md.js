import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Canal 数据同步","description":"","frontmatter":{},"headers":[],"relativePath":"bigdata/canal/index.md","filePath":"bigdata/canal/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "bigdata/canal/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="canal-数据同步" tabindex="-1">Canal 数据同步 <a class="header-anchor" href="#canal-数据同步" aria-label="Permalink to &quot;Canal 数据同步&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：binlog 原理、Canal Server/Client 部署、MySQL → Doris 同步链路设计。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("bigdata/canal/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
