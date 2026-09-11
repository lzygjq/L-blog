import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"并发与 JUC","description":"","frontmatter":{},"headers":[],"relativePath":"java/concurrent/index.md","filePath":"java/concurrent/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "java/concurrent/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="并发与-juc" tabindex="-1">并发与 JUC <a class="header-anchor" href="#并发与-juc" aria-label="Permalink to &quot;并发与 JUC&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：Java 内存模型、synchronized/volatile、AQS 源码、线程池参数与调优、并发容器、CompletableFuture。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("java/concurrent/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
