<!-- 最右侧竖版工具栏（参考 pdai.tech 右侧悬浮条）：
     - 侧边栏显示/隐藏（原导航栏左上角汉堡按钮移到这里）
     - 本页目录显示/隐藏（原导航栏右侧按钮移到这里）
     - 回到顶部（滚动超过 400px 出现）
     整条 fixed 在视口右缘、导航栏以下；Layout 预留 padding-right 让内容不压住工具栏 -->
<script setup>
import SidebarToggle from './SidebarToggle.vue'
import AsideToggle from './AsideToggle.vue'
import BackToTop from './BackToTop.vue'
</script>

<template>
  <div class="right-rail">
    <SidebarToggle />
    <AsideToggle />
    <div class="rail-divider" aria-hidden="true"></div>
    <BackToTop />
  </div>
</template>

<style scoped>
.right-rail {
  position: fixed;
  right: 0;
  /* 与顶栏脱开：顶部留 8px 灰缝（与内容区各处缝隙一致），底部同样留缝，
     整条变成圆角浮动卡片（左侧圆角，右缘贴屏幕边） */
  top: calc(var(--vp-nav-height) + var(--lp-gap));
  bottom: var(--lp-gap);
  width: 48px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-right: none;
  border-radius: 10px 0 0 10px;
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
