import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"","description":"","frontmatter":{"layout":"home","hero":{"name":"L知识体系","text":"夯实基础 · 构建体系 · 沉淀实战","tagline":"13 年 Java/PHP 后端 — 微服务与云原生 / 大数据数仓 / AI 编程，用可验证的产出对抗遗忘","actions":[{"theme":"brand","text":"知识体系总览","link":"/about/"},{"theme":"alt","text":"项目实战","link":"/projects/"},{"theme":"alt","text":"面试专题","link":"/interview/"}]},"features":[{"icon":"☕","title":"Java 深水区","details":"基础、并发与 JUC、JVM、Spring 全家桶源码理解、23 种设计模式实战笔记","link":"/java/"},{"icon":"🗄️","title":"数据与中间件","details":"MySQL 原理与分库分表、Redis、RabbitMQ / RocketMQ / 物联网 MQTT","link":"/database/"},{"icon":"📊","title":"大数据与数仓","details":"Canal 同步、Doris、Iceberg / MinIO 冷热分层、数仓分层建模方法论","link":"/bigdata/"},{"icon":"☸️","title":"云原生","details":"Docker、Kubernetes、CI/CD、监控可观测 — 从微服务到 K8s 的演进实录","link":"/cloud-native/"},{"icon":"🤖","title":"AI 编程与 Agent","details":"Vibe Coding、Agent 与 Harness 机制、Spring AI / Spring AI Alibaba 实践","link":"/ai/"},{"icon":"🎯","title":"项目实战复盘","details":"6 万人绩效系统四大技术难点、智慧物业 SaaS 云原生与数仓落地 — 面试弹药库","link":"/projects/"}]},"headers":[],"relativePath":"index.md","filePath":"index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
