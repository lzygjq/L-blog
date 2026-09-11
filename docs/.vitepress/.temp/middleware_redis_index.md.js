import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Redis 缓存","description":"","frontmatter":{},"headers":[],"relativePath":"middleware/redis/index.md","filePath":"middleware/redis/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "middleware/redis/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="redis-缓存" tabindex="-1">Redis 缓存 <a class="header-anchor" href="#redis-缓存" aria-label="Permalink to &quot;Redis 缓存&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：数据结构与底层实现、持久化（RDB/AOF）、主从+Sentinel（本地 Compose 环境）、缓存穿透/击穿/雪崩。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("middleware/redis/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
