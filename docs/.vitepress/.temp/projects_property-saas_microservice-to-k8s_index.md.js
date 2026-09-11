import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"微服务 → K8s 云原生演进","description":"","frontmatter":{},"headers":[],"relativePath":"projects/property-saas/microservice-to-k8s/index.md","filePath":"projects/property-saas/microservice-to-k8s/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "projects/property-saas/microservice-to-k8s/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="微服务-→-k8s-云原生演进" tabindex="-1">微服务 → K8s 云原生演进 <a class="header-anchor" href="#微服务-→-k8s-云原生演进" aria-label="Permalink to &quot;微服务 → K8s 云原生演进&quot;">​</a></h1><blockquote><p>待撰写。提纲：为什么云原生、property-framework 聚合设计、多租户三级隔离与部署形态、迁移路线图。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("projects/property-saas/microservice-to-k8s/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
