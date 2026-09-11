import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Java 板块导览","description":"","frontmatter":{},"headers":[],"relativePath":"java/index.md","filePath":"java/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "java/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="java-板块导览" tabindex="-1">Java 板块导览 <a class="header-anchor" href="#java-板块导览" aria-label="Permalink to &quot;Java 板块导览&quot;">​</a></h1><p>Java 是整个知识体系的主干，按「基础 → 并发 → JVM → Spring 生态 → 设计模式」的顺序递进。</p><h2 id="学习主线" tabindex="-1">学习主线 <a class="header-anchor" href="#学习主线" aria-label="Permalink to &quot;学习主线&quot;">​</a></h2><ol><li><a href="/java/basics/">Java 基础</a>：集合、泛型、反射、IO、新特性</li><li><a href="/java/concurrent/">并发与 JUC</a>：线程模型、AQS、并发容器、线程池</li><li><a href="/java/jvm/">JVM</a>：内存结构、类加载、GC 与调优</li><li><a href="/java/spring/">Spring 生态</a>：Framework 原理 → Boot → Cloud 微服务</li><li><a href="/java/design-patterns/">设计模式</a>：23 种模式的演进式讲解与实战运用</li></ol><h2 id="面试高频" tabindex="-1">面试高频 <a class="header-anchor" href="#面试高频" aria-label="Permalink to &quot;面试高频&quot;">​</a></h2><p>并发（AQS/线程池）、JVM（GC 调优实战）、Spring（IoC/AOP/循环依赖/事务传播）。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("java/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
