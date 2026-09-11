import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"云原生板块导览","description":"","frontmatter":{},"headers":[],"relativePath":"cloud-native/index.md","filePath":"cloud-native/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "cloud-native/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="云原生板块导览" tabindex="-1">云原生板块导览 <a class="header-anchor" href="#云原生板块导览" aria-label="Permalink to &quot;云原生板块导览&quot;">​</a></h1><p>从微服务到 K8s 云原生的演进路径：Docker 容器化 → Kubernetes 编排 → CI/CD 流水线 → 监控可观测。素材来源：hobbit-cloud 与 property-saas v4.0 架构设计实践。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("cloud-native/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
