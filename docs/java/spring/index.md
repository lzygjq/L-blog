# Spring 生态 · 导览

按演进主线组织：先理解 Framework 的核心机制（原 SSM 口径合并至此），再用 Boot 提效，最后用 Cloud 微服务化。

## 一、三个层次

| 层次 | 定位 | 解决的问题 | 状态 |
|---|---|---|---|
| **[Spring Framework](/java/spring/spring-framework/)** | 地基 | 对象管理与横切逻辑：IoC、AOP、事务、ORM 集成 | **已成篇（5 篇）** |
| [Spring Boot](/java/spring/spring-boot/) | 提效 | 消除配置：自动配置、Starter、Actuator | 写作中 |
| [Spring Cloud](/java/spring/spring-cloud/) | 分布式 | 服务治理：注册发现、网关、配置中心、链路追踪 | 写作中 |

**为什么顺序不能反**：Boot 的自动配置本质是**条件化的 Bean 注册**，Cloud 的各个组件本质是**自动配置 + 声明式客户端**。不理解 Framework 的 IoC 容器与 Bean 生命周期，Boot 和 Cloud 只能停留在"背注解"的层次——面试官顺着追问一层就会露馅。

## 二、Spring Framework 已完成内容

| 主题 | 一句话价值 |
|---|---|
| [IoC 容器与 Bean 生命周期](/java/spring/spring-framework/ioc-container/) | 容器体系、`BeanDefinition`、`refresh()` 十二步、Bean 生命周期八阶段、扩展点对照 |
| [循环依赖与三级缓存](/java/spring/spring-framework/circular-dependency/) | 三级缓存的逐层推演，以及"为什么必须是三级"的核心答案 |
| [AOP 与代理机制](/java/spring/spring-framework/aop/) | JDK 代理 vs CGLIB、代理生成时机、切点表达式、失效根因 |
| [声明式事务与传播行为](/java/spring/spring-framework/transaction/) | 七种传播行为、`REQUIRES_NEW` vs `NESTED`、失效清单十项、事务与连接池 |
| [MyBatis 执行流程与集成](/java/spring/spring-framework/mybatis/) | 四大对象、`#{}` vs `${}`、两级缓存的坑、`SqlSessionTemplate` |

## 三、Spring Boot 计划内容

- **自动配置原理**：`@SpringBootApplication` 的复合注解结构、`@Conditional` 系列条件装配、`spring.factories` 到 `AutoConfiguration.imports` 的演进
- **Starter 机制**：自定义 Starter 的三段式结构，以及"为什么需要 `xxx-spring-boot-starter` 与 `xxx-spring-boot-autoconfigure` 拆分"
- **配置优先级**：命令行参数 → 环境变量 → profile 配置文件 → 默认配置的完整顺序
- **Actuator 监控**：健康检查、指标暴露、自定义 Endpoint

## 四、Spring Cloud 计划内容

- **服务注册与发现**：Nacos / Eureka 的注册与心跳机制、CAP 取舍
- **网关**：Spring Cloud Gateway 的响应式模型、路由与过滤器
- **配置中心**：配置动态刷新的实现（`@RefreshScope` 与代理重建）
- **链路追踪**：TraceId 透传、与日志 MDC 的集成
- **容错**：Sentinel / Resilience4j 的熔断与限流策略
