<!-- 最右侧竖版工具栏（参考 pdai.tech 右侧悬浮条）：
     - 成长路线 / 架构路线固定入口（跳转链接，非开关；全站常驻，见 RoadmapLink.vue）
     - 侧边栏显示/隐藏（原导航栏左上角汉堡按钮移到这里）
     - 本页目录显示/隐藏（原导航栏右侧按钮移到这里）
     - 全屏阅读（参考 pdai.tech 的全屏图标，浏览器原生 Fullscreen API）
     - 回到顶部（滚动超过 400px 出现）
     整条 fixed 在视口右缘、导航栏以下；Layout 预留 padding-right 让内容不压住工具栏

     排列取「导航 / 面板开关 / 阅读工具」三段式：两条路线叠在顶部、下面用 1px 分隔线隔开，
     与原有那条（分隔开关与工具）一致。 -->
<script setup>
import RoadmapLink from './RoadmapLink.vue'
import SidebarToggle from './SidebarToggle.vue'
import AsideToggle from './AsideToggle.vue'
import FullScreenToggle from './FullScreenToggle.vue'
import BackToTop from './BackToTop.vue'
</script>

<template>
  <div class="right-rail">
    <RoadmapLink
      href="/projects/architect-roadmap/"
      prefix="projects/architect-roadmap/"
      line1="成长"
      line2="路线"
      ariaLabel="成长路线"
      title="成长路线（人）：成长 L1 开发 → 成长 L2 高级开发 → 成长 L3 架构师 → 成长 L4 CIO"
    />
    <RoadmapLink
      href="/projects/architecture-evolution/"
      prefix="projects/architecture-evolution/"
      line1="架构"
      line2="路线"
      ariaLabel="架构路线"
      title="架构路线（系统）：架构 L1 共址与拆机 → 架构 L2 应用 → 架构 L3 数据 → 架构 L4 缓存 → 架构 L5 文件 → 架构 L6 部署"
    />
    <div class="rail-divider" aria-hidden="true"></div>
    <SidebarToggle />
    <AsideToggle />
    <div class="rail-divider" aria-hidden="true"></div>
    <FullScreenToggle />
    <BackToTop />
  </div>
</template>

<style scoped>
.right-rail {
  position: fixed;
  /* 四边都留 8px 灰缝（与内容区各处缝隙一致），不再贴屏幕右缘——
     整条是一张独立浮动卡片（参考 pdai.tech 右侧悬浮条） */
  right: var(--lp-gap);
  top: calc(var(--vp-nav-height) + var(--lp-gap));
  bottom: var(--lp-gap);
  width: 48px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 0;
  gap: 10px;
  z-index: 40;
}

.rail-divider {
  width: 24px;
  height: 1px;
  background: var(--vp-c-divider);
  flex-shrink: 0;
}

/* 移动端整条隐藏（侧边栏是抽屉模式、目录也不显示） */
@media (max-width: 767px) {
  .right-rail {
    display: none;
  }
}
</style>
