import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Java 基础","description":"","frontmatter":{},"headers":[],"relativePath":"java/basics/index.md","filePath":"java/basics/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "java/basics/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="java-基础" tabindex="-1">Java 基础 <a class="header-anchor" href="#java-基础" aria-label="Permalink to &quot;Java 基础&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：集合框架（HashMap/ConcurrentHashMap 源码）、泛型、反射、注解、IO/NIO、Java 8~21 新特性。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("java/basics/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
