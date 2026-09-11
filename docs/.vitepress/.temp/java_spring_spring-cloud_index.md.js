import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Spring Cloud 微服务","description":"","frontmatter":{},"headers":[],"relativePath":"java/spring/spring-cloud/index.md","filePath":"java/spring/spring-cloud/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "java/spring/spring-cloud/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="spring-cloud-微服务" tabindex="-1">Spring Cloud 微服务 <a class="header-anchor" href="#spring-cloud-微服务" aria-label="Permalink to &quot;Spring Cloud 微服务&quot;">​</a></h1><blockquote><p>写作中。素材来源：hobbit-cloud 从零搭建笔记（阶段 1-6）。 计划覆盖：Gateway 网关、Redis Stream MQ、多租户、数据权限、操作日志。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("java/spring/spring-cloud/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
