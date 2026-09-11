import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Spring 生态导览","description":"","frontmatter":{},"headers":[],"relativePath":"java/spring/index.md","filePath":"java/spring/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "java/spring/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="spring-生态导览" tabindex="-1">Spring 生态导览 <a class="header-anchor" href="#spring-生态导览" aria-label="Permalink to &quot;Spring 生态导览&quot;">​</a></h1><p>按演进主线组织：先理解 Framework 核心机制（原 SSM 口径合并至此），再上 Boot 提效，最后 Cloud 微服务化。</p><ul><li><a href="/java/spring/spring-framework/">Spring Framework 与 MyBatis</a>：IoC、AOP、事务、MyBatis 集成</li><li><a href="/java/spring/spring-boot/">Spring Boot</a>：自动配置原理、Starter 机制、监控</li><li><a href="/java/spring/spring-cloud/">Spring Cloud 微服务</a>：注册中心、网关、配置中心、链路追踪</li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("java/spring/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
