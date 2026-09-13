---
date: 2026-09-11
---

# Spring 生态 · 导览

按演进主线组织：先理解 Framework 的核心机制（原 SSM 口径合并至此），再用 Boot 提效，最后用 Cloud 微服务化。

## 一、三个层次

| 层次 | 定位 | 解决的问题 | 状态 |
|---|---|---|---|
| **[Spring Framework](/java/spring/spring-framework/)** | 地基 | 对象管理与横切逻辑：IoC、AOP、事务、ORM 集成、Web 层 | **已成篇（8 篇）** |
| **[Spring Boot](/java/spring/spring-boot/)** | 提效 | 消除配置：自动配置、Starter、Actuator | 已成篇（自动配置原理） |
| [Spring Cloud](/java/spring/spring-cloud/) | 分布式 | 服务治理：注册发现、网关、配置中心、链路追踪 | 写作中 |

**为什么顺序不能反**：Boot 的自动配置本质是**条件化的 Bean 注册**，Cloud 的各个组件本质是**自动配置 + 声明式客户端**。不理解 Framework 的 IoC 容器与 Bean 生命周期，Boot 和 Cloud 只能停留在"背注解"的层次——面试官顺着追问一层就会露馅。

## 二、Spring Framework 已完成内容

<!-- 自动生成：数据来自同目录 index.data.js（createContentLoader），新文章落在 spring-framework/ 即自动出现 -->

<script setup>
import AutoList from '../../.vitepress/theme/components/AutoList.vue'
import { data } from './index.data.js'
</script>

<AutoList :items="data" />

## 三、Spring Boot 已完成内容

[**自动配置原理**](/java/spring/spring-boot/)：`@SpringBootApplication` 拆解、`AutoConfigurationImportSelector` 导入链路、`@Conditional` 条件装配家族、`spring.factories` → `AutoConfiguration.imports` 的演进、自定义 Starter 三段式结构、配置优先级、条件评估报告排查。

## 四、Spring Boot 待补内容

- **Starter 机制实战**：完整走一遍"设计 → 编码 → 测试 → 发布"的自定义 Starter
- **Actuator 监控**：健康检查、指标暴露、自定义 Endpoint
- **启动流程**：`SpringApplication.run()` 的完整阶段拆解

## 五、Spring Cloud 计划内容

- **服务注册与发现**：Nacos / Eureka 的注册与心跳机制、CAP 取舍
- **网关**：Spring Cloud Gateway 的响应式模型、路由与过滤器
- **配置中心**：配置动态刷新的实现（`@RefreshScope` 与代理重建）
- **链路追踪**：TraceId 透传、与日志 MDC 的集成
- **容错**：Sentinel / Resilience4j 的熔断与限流策略
