import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Spring Boot","description":"","frontmatter":{},"headers":[],"relativePath":"java/spring/spring-boot/index.md","filePath":"java/spring/spring-boot/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "java/spring/spring-boot/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="spring-boot" tabindex="-1">Spring Boot <a class="header-anchor" href="#spring-boot" aria-label="Permalink to &quot;Spring Boot&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：自动配置原理（@AutoConfiguration）、Starter 开发、Actuator 监控、配置优先级。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("java/spring/spring-boot/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
