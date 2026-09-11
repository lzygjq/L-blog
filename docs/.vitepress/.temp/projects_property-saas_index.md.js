import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"智慧物业 SaaS 导览","description":"","frontmatter":{},"headers":[],"relativePath":"projects/property-saas/index.md","filePath":"projects/property-saas/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "projects/property-saas/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="智慧物业-saas-导览" tabindex="-1">智慧物业 SaaS 导览 <a class="header-anchor" href="#智慧物业-saas-导览" aria-label="Permalink to &quot;智慧物业 SaaS 导览&quot;">​</a></h1><p>property-saas v4.0：Spring Cloud Alibaba + K8s 云原生架构，多租户三级混合隔离，账单/门禁/社区电商核心模块，Phase3 数仓方案。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("projects/property-saas/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
