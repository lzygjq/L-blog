import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"项目实战导览（面试弹药库）","description":"","frontmatter":{},"headers":[],"relativePath":"projects/index.md","filePath":"projects/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "projects/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="项目实战导览-面试弹药库" tabindex="-1">项目实战导览（面试弹药库） <a class="header-anchor" href="#项目实战导览-面试弹药库" aria-label="Permalink to &quot;项目实战导览（面试弹药库）&quot;">​</a></h1><p>按「项目 → 技术难点专题」组织，每个专题独立成文：背景 → 方案对比 → 落地实现 → 压测/效果数据 → 复盘。</p><h2 id="绩效系统-6-万人规模" tabindex="-1">绩效系统（6 万人规模） <a class="header-anchor" href="#绩效系统-6-万人规模" aria-label="Permalink to &quot;绩效系统（6 万人规模）&quot;">​</a></h2><ul><li><a href="/projects/perf-system/org-sync-100k/">十万人组织架构同步</a></li><li><a href="/projects/perf-system/peak-filling/">高峰期并发填报</a></li><li><a href="/projects/perf-system/approval-push/">多级审批消息实时推送</a></li><li><a href="/projects/perf-system/report-precompute/">报表预计算</a></li></ul><h2 id="智慧物业-saas" tabindex="-1">智慧物业 SaaS <a class="header-anchor" href="#智慧物业-saas" aria-label="Permalink to &quot;智慧物业 SaaS&quot;">​</a></h2><ul><li><a href="/projects/property-saas/microservice-to-k8s/">微服务 → K8s 云原生演进</a></li><li><a href="/projects/property-saas/data-warehouse/">大数据架构方案 → 数仓落地</a></li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("projects/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
