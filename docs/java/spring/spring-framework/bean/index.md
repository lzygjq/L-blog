---
order: 1
date: 2026-09-11
sidebar: 生命周期与扩展点
title: Bean 生命周期与扩展点
desc: 生命周期八阶段、Aware 回调层级、扩展点总览与执行时机、BeanFactoryPostProcessor 对比 BeanPostProcessor
---

# Bean 生命周期与扩展点

## 一、本菜单范围

「Bean」这一块只讲**对象被创建出来之后发生的事**——容器怎么创建它、在哪些环节留出扩展点、多个 Bean 互相依赖时会出什么问题。

| 主题 | 回答的核心问题 |
|---|---|
| **生命周期与扩展点**（本篇） | Bean 从实例化到销毁经历哪些步骤？每一步有哪些钩子可以介入？ |
| [循环依赖与三级缓存](/java/spring/spring-framework/bean/circular-dependency) | A 依赖 B、B 依赖 A，Spring 凭什么能启动？为什么必须是三级缓存？ |
| [作用域与线程安全](/java/spring/spring-framework/bean/thread-safety) | 单例 Bean 能并发使用吗？有状态对象怎么处理？ |

**前置知识**：容器怎么启动、`BeanDefinition` 是什么、依赖怎么注入，属于 [IoC 容器](/java/spring/spring-framework/ioc/) 的内容。本篇从"容器已经拿到图纸、开始创建 Bean"讲起。

## 二、Bean 生命周期（核心）

这是 Spring 面试出现频率最高的知识点。完整链路如下：

```
 ① 实例化          createBeanInstance()
    │              构造器推断 / 工厂方法 / Supplier
    ▼
 ② 属性填充        populateBean()
    │              @Autowired / @Value 注入，依赖在此解析
    ▼
 ③ Aware 回调      invokeAwareMethods()
    │              BeanNameAware → BeanClassLoaderAware → BeanFactoryAware
    ▼
 ④ 前置处理        applyBeanPostProcessorsBeforeInitialization()
    │              @PostConstruct 在这里执行（CommonAnnotationBeanPostProcessor）
    ▼
 ⑤ 初始化          invokeInitMethods()
    │              InitializingBean.afterPropertiesSet() → 自定义 init-method
    ▼
 ⑥ 后置处理        applyBeanPostProcessorsAfterInitialization()
    │              ★ AOP 代理在此生成（AbstractAutoProxyCreator）
    ▼
 ⑦ 使用
    ▼
 ⑧ 销毁            DisposableBean.destroy() → @PreDestroy → destroy-method
```

**几个必须理解的细节：**

**① Aware 接口的层级**。`BeanNameAware`、`BeanClassLoaderAware`、`BeanFactoryAware` 由 `invokeAwareMethods` 直接回调；而 `ApplicationContextAware`、`EnvironmentAware` 等由 `ApplicationContextAwareProcessor` 这个 `BeanPostProcessor` 处理——**所以它们的执行时机在 ④ 而非 ③**。这个差异说明：并非所有 Aware 回调都在同一阶段，取决于由谁负责回调。

**② `@PostConstruct` 早于 `afterPropertiesSet`**。因为前者由 `BeanPostProcessor` 的 `postProcessBeforeInitialization` 驱动，后者由 `invokeInitMethods` 驱动，而 ④ 在 ⑤ 之前。三种初始化写法的执行顺序：

```
@PostConstruct  →  InitializingBean.afterPropertiesSet()  →  init-method
```

同样的顺序规律适用于销毁：`@PreDestroy` → `DisposableBean.destroy()` → `destroy-method`。

**③ AOP 代理生成在 ⑥**。这一点直接决定了事务、缓存、异步注解能否生效——**代理替换的是 Bean 的最终形态**，之后放入单例池的已经是代理对象。理解这一点，才能解释"为什么同类内部方法调用导致 `@Transactional` 失效"（见 [AOP 与代理机制](/java/spring/spring-framework/aop/)）。

**④ 循环依赖的破解点在 ① 与 ② 之间**。`createBeanInstance` 完成后就把"早期引用"暴露到三级缓存，使得其它 Bean 在 ② 阶段能拿到一个尚未填充属性的对象——这是 [循环依赖](/java/spring/spring-framework/bean/circular-dependency) 的机制基础。

**⑤ 实例化与初始化是两个阶段**，这是理解 Bean 话题的一条主线。官方文档把它们分开命名（instantiation vs initialization），差别就在"属性填了没有"：实例化完成后对象是"空壳"（字段全是默认值），初始化完成后才可用。循环依赖能解决、`@PostConstruct` 里能安全用到注入的依赖，根因都在这个拆分上。

## 三、扩展点总览（面试高分项）

Spring 的"可扩展性"来自这些扩展点，**能说清它们的执行时机与用途差异，是区分"用过 Spring"与"懂 Spring"的分水岭**：

| 扩展点 | 执行时机 | 典型用途 | 执行次数 |
|---|---|---|---|
| `BeanDefinitionRegistryPostProcessor` | `refresh()` 第 5 步最早期 | 动态注册 BeanDefinition（`@MapperScan`） | 一次 |
| `BeanFactoryPostProcessor` | `refresh()` 第 5 步 | 修改 BeanDefinition（`PropertySourcesPlaceholderConfigurer`） | 一次 |
| `BeanPostProcessor` | 每个 Bean 初始化前后 | 代理生成、属性注入（`@Autowired`） | 每个 Bean 两次 |
| `InstantiationAwareBeanPostProcessor` | 实例化前后 | 自定义实例化策略、属性填充增强 | 每个 Bean |
| `InitializingBean` / `@PostConstruct` | 初始化阶段 | 资源准备 | 每个 Bean |
| `DisposableBean` / `@PreDestroy` | 容器关闭 | 资源释放 | 每个 Bean |
| `ApplicationListener` | 事件发布时 | 解耦的业务响应 | 按事件次数 |

### 最高频的对比题：`BeanFactoryPostProcessor` vs `BeanPostProcessor`

| 维度 | BeanFactoryPostProcessor | BeanPostProcessor |
|---|---|---|
| 作用对象 | **BeanDefinition**（图纸） | **Bean 实例**（成品） |
| 执行时机 | 所有 Bean 实例化**之前** | 每个 Bean 初始化**前后** |
| 执行次数 | 一次 | 每个 Bean 各两次 |
| 典型实现 | `ConfigurationClassPostProcessor`、`PropertySourcesPlaceholderConfigurer` | `AutowiredAnnotationBeanPostProcessor`、`AbstractAutoProxyCreator` |

一句话记忆：**前者改图纸，后者改成品；前者只跑一次，后者每个 Bean 都跑。**

## 四、面试问答

**Q1：Bean 的完整生命周期？**

实例化 → 属性填充（依赖注入）→ Aware 回调 → `BeanPostProcessor.postProcessBeforeInitialization`（`@PostConstruct` 在此）→ `InitializingBean.afterPropertiesSet()` → `init-method` → `BeanPostProcessor.postProcessAfterInitialization`（**AOP 代理在此生成**）→ 使用 → 销毁（`@PreDestroy` → `DisposableBean.destroy()` → `destroy-method`）。

三个易错点：`@PostConstruct` 早于 `afterPropertiesSet`；AOP 代理在初始化完成后才创建；循环依赖的破解发生在实例化与属性填充之间。

**Q2：`BeanFactoryPostProcessor` 和 `BeanPostProcessor` 的区别？**

核心区别是作用对象与执行时机：`BeanFactoryPostProcessor` 作用于 `BeanDefinition`（图纸），在所有 Bean 实例化之前执行一次；`BeanPostProcessor` 作用于 Bean 实例（成品），每个 Bean 初始化前后各执行一次。典型代表分别是 `ConfigurationClassPostProcessor`（解析 `@Configuration`）与 `AutowiredAnnotationBeanPostProcessor`（处理 `@Autowired`）。

**Q3：`@Autowired` 是在哪个阶段被处理的？**

在 Bean 生命周期的两个不同阶段：**属性填充阶段**（`populateBean` → `AutowiredAnnotationBeanPostProcessor.postProcessProperties`）完成字段/Setter 注入；而该处理器同时实现了 `postProcessBeforeInitialization`，用于处理 `@PostConstruct` 等注解。所以 `@Autowired` 注入完成后才会执行 `@PostConstruct`——这也是 `@PostConstruct` 中能安全使用注入依赖的原因。

**Q4：为什么所有 Aware 回调不在同一阶段执行？**

因为**回调的驱动者不同**。`BeanNameAware`、`BeanClassLoaderAware`、`BeanFactoryAware` 由 `AbstractAutowireCapableBeanFactory.invokeAwareMethods()` 在实例化之后直接回调（阶段 ③）；而 `ApplicationContextAware`、`EnvironmentAware`、`ResourceLoaderAware` 等由 `ApplicationContextAwareProcessor` 这个 `BeanPostProcessor` 在 `postProcessBeforeInitialization` 中回调（阶段 ④）。**理解这一点就不会把 Aware 当成一个整体来记**——判断某个 Aware 何时执行，要看它由谁负责回调。

**Q5：Bean 的创建和初始化为什么要分成两步？**

因为**两步之间留出的窗口解决了一批问题**。实例化只负责"把对象在堆上建出来"（此时字段还是默认值），属性填充与初始化负责"让它变成可用状态"。这个拆分带来三个能力：① **循环依赖可解**——实例化后立刻暴露早期引用，其它 Bean 就能先拿到"半成品"；② **代理可延后**——AOP 代理在初始化后才确定，避免"代理对象还需要依赖注入"的自举问题；③ **扩展点有位置**——`populateBean` 与 `initializeBean` 分别对应不同的 `BeanPostProcessor` 回调，`@Autowired` 与 `@PostConstruct` 才能各就各位。
