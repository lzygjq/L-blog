import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"数据库板块导览","description":"","frontmatter":{},"headers":[],"relativePath":"database/index.md","filePath":"database/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "database/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="数据库板块导览" tabindex="-1">数据库板块导览 <a class="header-anchor" href="#数据库板块导览" aria-label="Permalink to &quot;数据库板块导览&quot;">​</a></h1><p>关系型持久化存储为主战场：MySQL 原理与调优、分库分表（ShardingSphere）。缓存（Redis）见<a href="/middleware/redis/">中间件板块</a>。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("database/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
