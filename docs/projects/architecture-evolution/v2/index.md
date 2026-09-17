---
date: 2026-09-17
title: 原 V2 主从（已按层拆开）
search: false
prev: false
next: false
---

# 原「V2 主从」已按层拆开

「主从」只属于数据和缓存；应用这一档叫父子聚合，文件没有主从。请按层读：

| 原锚点 | 现在去 |
|---|---|
| <span id="app">应用父子聚合</span> | [应用 · 父子聚合](/projects/architecture-evolution/app/#modular) |
| <span id="mysql">数据主从</span> | [数据 · 主从](/projects/architecture-evolution/data/#replica) |
| <span id="redis">缓存主从</span> | [缓存 · 主从](/projects/architecture-evolution/cache/#replica) |
| <span id="file">独立文件机（可跳过）</span> | [文件 · 独立文件机](/projects/architecture-evolution/file/#fileserver) |
| <span id="deploy">脚本 + 多实例（可跳）</span> | [部署 · 脚本多实例](/projects/architecture-evolution/deploy/#scripts) |
| 两个轴 | [数据 · 两个轴](/projects/architecture-evolution/data/#two-axes) |

[架构路线总览](/projects/architecture-evolution/)
