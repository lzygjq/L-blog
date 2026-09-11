import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"分库分表","description":"","frontmatter":{},"headers":[],"relativePath":"database/sharding/index.md","filePath":"database/sharding/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "database/sharding/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="分库分表" tabindex="-1">分库分表 <a class="header-anchor" href="#分库分表" aria-label="Permalink to &quot;分库分表&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：ShardingSphere 分片策略、扩容方案、跨片查询与分布式事务。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("database/sharding/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
