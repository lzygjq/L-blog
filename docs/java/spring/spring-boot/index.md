---
date: 2026-09-13
title: Spring Boot · 导览
desc: 自动配置与启动流程两块，以及"约定优于配置"背后的取舍
---

# Spring Boot · 导览

Spring Boot 解决的问题可以用一句话概括：**把"搭一个能跑的 Spring 应用"从配置工作变成依赖声明**。

它的能力全部建立在 Spring Framework 的 IoC 容器之上——**自动配置本质是"条件化的 Bean 注册"，启动流程本质是"按顺序驱动容器"**。所以本板块的两块内容是互补的：

| 主题 | 回答的核心问题 | 前置知识 |
|---|---|---|
| [自动配置原理](/java/spring/spring-boot/auto-configuration) | 为什么引个 starter 就能用？条件装配怎么裁决？自己怎么写 starter？ | [IoC 容器](/java/spring/spring-framework/ioc/) |
| [启动流程](/java/spring/spring-boot/startup) | 一行 `SpringApplication.run()` 背后发生了什么？配置、Web 服务器、Runner 分别在哪个阶段？ | [IoC 容器](/java/spring/spring-framework/ioc/)、[Bean 生命周期](/java/spring/spring-framework/bean/) |

**推荐顺序：先自动配置，再启动流程。** 因为启动流程里的 `refreshContext` 阶段会调用容器的 `refresh()`，而 `@Conditional` 的裁决正是发生在这个过程之中——先理解"装配规则"，再看"装配在何时被触发"，两者才能互相印证。

## 一条贯穿的主线：约定优于配置

| 表面现象 | 背后的机制 |
|---|---|
| 引了 starter 就自动有 `RedisTemplate` | `AutoConfiguration.imports` 清单 + `@ConditionalOnClass` |
| 我自定义的 Bean 能覆盖默认实现 | `@ConditionalOnMissingBean` |
| 换个数据库只改配置不改代码 | `@ConfigurationProperties` + 外部化配置优先级 |
| 启动报错信息比原生 Spring 友好 | `FailureAnalyzer` |
| 启动慢可以调 | `refreshContext` 第 11 步是耗时大头 |

**这条主线的实用价值**：Boot 的所有"魔法"都是可解释、可干预的——每个默认行为背后都有一个 `@Conditional` 或一个扩展点，找到它就能改掉它。

## 计划补充

- **`spring-boot-starter` 开发实战**：完整走一遍"设计 → 编码 → 测试 → 发布"
- **Actuator 监控**：健康检查、指标暴露、自定义 Endpoint、`/actuator/startup` 启动耗时分析
- **AOT 与原生镜像**：GraalVM native image 的构建流程与反射配置
