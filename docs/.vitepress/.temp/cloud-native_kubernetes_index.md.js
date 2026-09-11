import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Kubernetes","description":"","frontmatter":{},"headers":[],"relativePath":"cloud-native/kubernetes/index.md","filePath":"cloud-native/kubernetes/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "cloud-native/kubernetes/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="kubernetes" tabindex="-1">Kubernetes <a class="header-anchor" href="#kubernetes" aria-label="Permalink to &quot;Kubernetes&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：核心对象（Pod/Deployment/Service/Ingress）、调度、HPA、多租户隔离方案。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("cloud-native/kubernetes/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
