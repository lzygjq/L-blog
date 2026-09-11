import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"物联网 MQTT","description":"","frontmatter":{},"headers":[],"relativePath":"middleware/mqtt/index.md","filePath":"middleware/mqtt/index.md","lastUpdated":1789109437000}');
const _sfc_main = { name: "middleware/mqtt/index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="物联网-mqtt" tabindex="-1">物联网 MQTT <a class="header-anchor" href="#物联网-mqtt" aria-label="Permalink to &quot;物联网 MQTT&quot;">​</a></h1><blockquote><p>写作中。计划覆盖：MQTT 协议（QoS/会话/遗嘱）、EMQX 部署、机器人/设备场景的主题设计。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("middleware/mqtt/index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
