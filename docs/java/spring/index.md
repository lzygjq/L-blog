---
date: 2026-09-11
title: Spring 生态 · 导览
desc: Spring 核心 / Spring MVC / Spring Boot / Spring Cloud 四个菜单的分工与阅读顺序
---

# Spring 生态 · 导览

按演进主线组织：先理解 **Spring 核心**的容器与横切机制，再看它如何解决 **Web 层**的请求处理，然后用 **Boot** 消除配置，最后用 **Cloud** 微服务化。

## 一、四个菜单

左栏的四个菜单是**平级**的，各有独立的话题范围，互不重叠：

| 菜单 | 定位 | 解决的问题 | 状态 |
|---|---|---|---|
| **[Spring](/java/spring/spring-framework/)** | 核心容器 | 对象管理与横切逻辑：IoC、Bean、AOP、事务、ORM 集成 | **已成篇（7 篇）** |
| **[Spring MVC](/java/spring/spring-mvc/)** | Web 层 | 请求怎么被路由到 Controller、参数怎么绑定、响应怎么序列化 | 已成篇（1 篇） |
| **[Spring Boot](/java/spring/spring-boot/)** | 提效 | 消除配置：自动配置、Starter、启动流程 | 已成篇（2 篇） |
| [Spring Cloud](/java/spring/spring-cloud/) | 分布式 | 服务治理：注册发现、网关、配置中心、链路追踪 | 写作中 |

**为什么 Spring MVC 要单独成一个菜单**：它有自己的处理链路（`DispatcherServlet` → `HandlerMapping` → `HandlerAdapter`）和一套 Web 专属注解（`@RequestBody` / `@PathVariable` 等），与容器的机制层是"两层"关系。把两者混在一个菜单里，找东西时要先分清"这是容器的知识还是 Web 的知识"，反而更费力。

**为什么顺序不能反**：Boot 的自动配置本质是**条件化的 Bean 注册**，Cloud 的各个组件本质是**自动配置 + 声明式客户端**。不理解 Spring 核心的 IoC 容器与 Bean 生命周期，Boot 和 Cloud 只能停留在"背注解"的层次——面试官顺着追问一层就会露馅。

## 二、Spring（核心容器）的子菜单

| 子菜单 | 主题 |
|---|---|
| **IoC** | 容器体系、BeanDefinition、`refresh()` 十二步、依赖注入方式、注解式装配 |
| **Bean** | 生命周期与扩展点、循环依赖与三级缓存、作用域与线程安全 |
| **AOP** | 代理机制、切点表达式、声明式注解、声明式事务与传播行为 |
| **MyBatis** | 执行流程、`#{}` vs `${}`、延迟加载、两级缓存、Spring 集成 |

详见 [Spring · 导览](/java/spring/spring-framework/)。

## 三、Spring MVC 与 Spring Boot 的内容

| 菜单 | 已完成 |
|---|---|
| [Spring MVC](/java/spring/spring-mvc/) | **执行流程**：九大组件、一次请求的完整链路、`HandlerMapping` 与 `HandlerAdapter` 为何分离、参数绑定与 `HttpMessageConverter`、拦截器 vs 过滤器、Web 层注解速查 |
| [Spring Boot](/java/spring/spring-boot/) | **自动配置原理**：条件装配、`.imports` 清单演进、自定义 Starter<br>**启动流程**：`SpringApplication` 构造、`run()` 十一个阶段、七种启动事件、耗时优化与失败排查 |

## 四、待补内容

**Spring Cloud**（规划中）：

- **服务注册与发现**：Nacos / Eureka 的注册与心跳机制、CAP 取舍
- **网关**：Spring Cloud Gateway 的响应式模型、路由与过滤器
- **配置中心**：配置动态刷新的实现（`@RefreshScope` 与代理重建）
- **链路追踪**：TraceId 透传、与日志 MDC 的集成
- **容错**：Sentinel / Resilience4j 的熔断与限流策略
