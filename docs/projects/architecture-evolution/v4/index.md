---
date: 2026-09-17
title: 原 V4 横向（已按层拆开）
search: false
prev: false
next: false
---

# 原「V4 横向」已按层拆开

分片和 Cluster 可不到；CDN 可提前，不必等库分片。请按层读：

| 原锚点 | 现在去 |
|---|---|
| <span id="app">应用微服务</span> | [应用 · 微服务](/projects/architecture-evolution/app/#microservice) |
| <span id="mysql">数据分片</span> | [数据 · 分片](/projects/architecture-evolution/data/#shard) |
| <span id="redis">缓存 Cluster</span> | [缓存 · Cluster](/projects/architecture-evolution/cache/#cluster) |
| <span id="file">CDN（可提前）</span> | [文件 · CDN](/projects/architecture-evolution/file/#cdn) |
| <span id="deploy">云原生</span> | [部署 · 云原生](/projects/architecture-evolution/deploy/#cloud) |

[架构路线总览](/projects/architecture-evolution/)
