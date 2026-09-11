import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"RocketMQ（含 MQ 通用专题）","description":"","frontmatter":{},"headers":[],"relativePath":"middleware/rocketmq/index.md","filePath":"middleware/rocketmq/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "middleware/rocketmq/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="rocketmq-含-mq-通用专题" tabindex="-1">RocketMQ（含 MQ 通用专题） <a class="header-anchor" href="#rocketmq-含-mq-通用专题" aria-label="Permalink to &quot;RocketMQ（含 MQ 通用专题）&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：架构与消息模型、事务消息、顺序消息、幂等设计 —— 与 RabbitMQ/Kafka 横向对比。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("middleware/rocketmq/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
