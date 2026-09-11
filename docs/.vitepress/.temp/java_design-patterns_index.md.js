import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"设计模式","description":"","frontmatter":{},"headers":[],"relativePath":"java/design-patterns/index.md","filePath":"java/design-patterns/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "java/design-patterns/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="设计模式" tabindex="-1">设计模式 <a class="header-anchor" href="#设计模式" aria-label="Permalink to &quot;设计模式&quot;">​</a></h1><p>23 种设计模式的演进式学习笔记（Day01 起步），每个模式按「问题场景 → 演进重构 → 模式结构 → 对比辨析 → 实战运用」展开。</p><h2 id="已整理" tabindex="-1">已整理 <a class="header-anchor" href="#已整理" aria-label="Permalink to &quot;已整理&quot;">​</a></h2><ul><li>Day01：单例模式（多种写法与线程安全演进）</li><li>Day02-06：工厂族（工厂方法 / 抽象工厂）、适配器模式等</li></ul><blockquote><p>待迁移：day01–day06 PDF 笔记逐篇迁入本目录。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("java/design-patterns/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
