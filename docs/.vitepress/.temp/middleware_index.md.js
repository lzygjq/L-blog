import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"中间件板块导览","description":"","frontmatter":{},"headers":[],"relativePath":"middleware/index.md","filePath":"middleware/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "middleware/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="中间件板块导览" tabindex="-1">中间件板块导览 <a class="header-anchor" href="#中间件板块导览" aria-label="Permalink to &quot;中间件板块导览&quot;">​</a></h1><ul><li><a href="/middleware/redis/">Redis 缓存</a>：数据结构、持久化、主从哨兵集群、缓存三大问题</li><li><a href="/middleware/rabbitmq/">RabbitMQ</a> 与 <a href="/middleware/rocketmq/">RocketMQ</a>：事务/幂等/顺序消息对比</li><li><a href="/middleware/mqtt/">物联网 MQTT</a>：EMQX、主题设计与设备接入</li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("middleware/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
