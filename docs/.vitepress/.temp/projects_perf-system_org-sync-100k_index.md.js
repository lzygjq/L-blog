import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"十万人组织架构同步怎么做？","description":"","frontmatter":{},"headers":[],"relativePath":"projects/perf-system/org-sync-100k/index.md","filePath":"projects/perf-system/org-sync-100k/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "projects/perf-system/org-sync-100k/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="十万人组织架构同步怎么做" tabindex="-1">十万人组织架构同步怎么做？ <a class="header-anchor" href="#十万人组织架构同步怎么做" aria-label="Permalink to &quot;十万人组织架构同步怎么做？&quot;">​</a></h1><blockquote><p>待撰写。提纲：全量 vs 增量同步、树形结构存储与校验、一致性对账、失败重试与幂等。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("projects/perf-system/org-sync-100k/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
