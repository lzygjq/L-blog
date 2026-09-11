import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"JVM","description":"","frontmatter":{},"headers":[],"relativePath":"java/jvm/index.md","filePath":"java/jvm/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "java/jvm/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="jvm" tabindex="-1">JVM <a class="header-anchor" href="#jvm" aria-label="Permalink to &quot;JVM&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：内存结构、类加载机制、垃圾回收算法与收集器、GC 调优案例、Arthas 实战。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("java/jvm/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
