import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Spring Framework 与 MyBatis","description":"","frontmatter":{},"headers":[],"relativePath":"java/spring/spring-framework/index.md","filePath":"java/spring/spring-framework/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "java/spring/spring-framework/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="spring-framework-与-mybatis" tabindex="-1">Spring Framework 与 MyBatis <a class="header-anchor" href="#spring-framework-与-mybatis" aria-label="Permalink to &quot;Spring Framework 与 MyBatis&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：IoC 容器与 Bean 生命周期、AOP 动态代理、事务传播行为、循环依赖三级缓存、MyBatis 执行流程。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("java/spring/spring-framework/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
