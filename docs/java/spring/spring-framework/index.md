---
date: 2026-09-11
title: Spring · 导览
desc: Spring 核心机制的四块分工——IoC 容器、Bean、AOP、MyBatis，以及贯穿全篇的四条主线
---

# Spring · 导览

Spring 是整个生态的地基。Boot 和 Cloud 都是在这一层之上做**约定与封装**——所以理解 Spring 的核心机制，是读懂一切上层现象的前提：为什么事务会失效、为什么循环依赖能被解决、为什么注解在同类内部调用时不起作用。

本菜单只放 **Spring Framework（核心容器）** 的内容，按主题分成四块。**Spring MVC 与 Spring Boot 是平级的独立菜单**（见左侧），因为它们各自有独立的请求链路和启动机制，混在一起反而不好找。

## 一、知识地图

| 子菜单 | 主题 | 回答的核心问题 | 面试权重 |
|---|---|---|---|
| **IoC** | [IoC 容器与依赖注入](/java/spring/spring-framework/ioc/) | 容器怎么组织、一行 `main()` 到容器就绪经历了什么、图纸怎么入库、依赖怎么注入 | ★★★★★ |
| **Bean** | [Bean 生命周期与扩展点](/java/spring/spring-framework/bean/) | Bean 从实例化到销毁经历什么、哪些环节能介入 | ★★★★★ |
| | ↳ [循环依赖与三级缓存](/java/spring/spring-framework/bean/circular-dependency) | A 依赖 B、B 依赖 A，Spring 凭什么能启动 | ★★★★★ |
| | ↳ [作用域与线程安全](/java/spring/spring-framework/bean/thread-safety) | 单例 Bean 能并发用吗、有状态对象怎么处理 | ★★★★★ |
| **AOP** | [AOP 与代理机制](/java/spring/spring-framework/aop/) | 横切逻辑怎么织入、JDK 代理与 CGLIB 如何选 | ★★★★★ |
| | ↳ [声明式事务与传播行为](/java/spring/spring-framework/aop/transaction) | `@Transactional` 怎么生效、为什么会失效 | ★★★★★ |
| **MyBatis** | [MyBatis 执行流程与集成](/java/spring/spring-framework/mybatis/) | SQL 怎么被执行、延迟加载和缓存有什么坑 | ★★★★ |

**四块的分工逻辑**（这也是它们为什么这样切分）：

- **IoC** 回答"对象从哪来"——容器的组织、启动、装配规则；
- **Bean** 回答"对象建出来之后怎么样"——生命周期、扩展点，以及**循环依赖**这个"实例化与属性填充之间留下的窗口"带来的特殊情况；
- **AOP** 回答"横切逻辑怎么织进去"——代理机制是理解一切"注解失效"的钥匙，而**事务是 AOP 最典型的应用**，所以归在这里；
- **MyBatis** 是持久层集成，与前三个机制层的关联度低于它们彼此之间的关联度，因此单独成块。

## 二、推荐阅读顺序

```
① IoC 容器与依赖注入      ← 一切的地基，必须先读
        │
        ├──▶ ② Bean 生命周期与扩展点    （容器的"施工过程"）
        │            │
        │            ├──▶ 循环依赖与三级缓存    （实例化与填充之间的窗口）
        │            └──▶ 作用域与线程安全      （Bean 被共享后会怎样）
        │
        └──▶ ③ AOP 与代理机制           （Bean 生命周期的"尾声"：代理在初始化后生成）
                     │
                     ▼
              ④ 声明式事务与传播行为    （AOP 最典型的应用，也是失效问题最多的场景）

⑤ MyBatis 执行流程与集成   ← 独立成块，但其中的事务协同部分依赖 ①②③④
```

**顺序不能跳的理由**：事务失效的八种场景，根因全部指向"代理"；循环依赖的解法，前提是知道"实例化与属性填充是两个阶段"；而 MyBatis 的 `SqlSessionTemplate` 之所以必要，取决于是否理解事务上下文与连接复用。**①②③④ 是一条链，断开任何一环，后面的结论都会变成死记硬背。**

**MyBatis 放在最后**，是因为它有一半内容（执行流程、缓存、延迟加载）是 MyBatis 自身的机制，与 Spring 无关；只有"与 Spring 集成"那部分需要前面三块的结论。**如果你时间紧，可以按 ①②③④ 先过一遍，MyBatis 单独看。**

## 三、几条贯穿全篇的主线

理解 Spring，比记住知识点更重要的是抓住这几条主线：

**主线一：一切都围绕"Bean 的生命周期"展开。**
`BeanPostProcessor`、Aware 回调、`InitializingBean`、AOP 代理、循环依赖的破解——**全部是生命周期链上某个环节的产物**。把生命周期的时间轴画出来，大部分问题都能定位到具体阶段。

**主线二：代理是理解"注解失效"的唯一钥匙。**
`@Transactional`、`@Async`、`@Cacheable`、`@PreAuthorize`——这些注解无一例外都靠代理生效。因此"同类内部调用失效""非 public 方法失效""final 类失效"是同一类问题的不同表现，而不是零散的知识点。

**主线三：模板方法 + 策略 + 工厂，撑起了 Spring 的骨架。**
`AbstractApplicationContext.refresh()` 是模板方法，`PlatformTransactionManager` / `ResourceLoader` / `HandlerMapping` 是策略，`BeanFactory` 体系是工厂。**设计模式不是 Spring 的装饰，是它的组织方式**——相关内容见[设计模式板块](/java/design-patterns/)。

**主线四：默认行为往往是最危险的。**
`@Transactional` 默认只回滚运行时异常、Spring 默认强制 CGLIB 代理、MyBatis 一级缓存默认开启且无法关闭、`prototype` 注入单例会静默失效——**这些"默认"制造了绝大多数生产事故**。审阅代码时，对每一个"用默认值"的地方都要问一句"默认值是什么"。

## 四、常见误区速查

| 误区 | 事实 |
|---|---|
| `@PostConstruct` 在 `afterPropertiesSet` 之后 | **在前**。前者由 `BeanPostProcessor` 驱动，后者由 `invokeInitMethods` 驱动 |
| 所有 Aware 回调都在同一阶段执行 | 只有 `BeanNameAware` 等在实例化后回调；`ApplicationContextAware` 由 `BeanPostProcessor` 处理，**晚一个阶段** |
| 循环依赖靠二级缓存解决 | 关键在**三级**：存的是 `ObjectFactory`，用于延迟决定是否生成代理 |
| 构造器注入也能解决循环依赖 | **不能**。构造参数必须在实例化时确定，没有"提前暴露"的窗口 |
| Spring AOP 就是 AspectJ | Spring 只借用其**注解与切点语法**，织入用的是自研动态代理 |
| `@Transactional` 对所有异常回滚 | **只对 `RuntimeException` 和 `Error`**，受检异常默认不回滚 |
| 单例 Bean 是线程安全的 | **容器不保证**。只保证"实例唯一"，安不安全取决于有没有**可变状态** |
| `prototype` 能解决"注入到单例"的共享问题 | **不能**。依赖注入只执行一次，需 `ObjectProvider` 或 `@Lookup` 才能真正每次新建 |
| `@Service` 和 `@Component` 功能不同 | **完全相同**，纯语义标签；只有 `@Repository` 有额外能力（异常翻译） |
| `@Configuration` 和 `@Component` 里定义 `@Bean` 等价 | **不等价**。前者有 CGLIB 代理，`@Bean` 方法互相调用返回同一个单例；后者会**重复创建** |
| 一级缓存可以关闭 | 默认开启且**只能改作用域为 `STATEMENT`**，不能真正关闭 |
| MyBatis 二级缓存可以放心用 | 跨 namespace 的关联更新**无法感知**，易产生脏数据 |
| MyBatis 延迟加载一定能减少查询 | 循环中访问关联属性会**退化成 1+N**；序列化实体时会**隐式全量触发** |
| `readOnly = true` 能阻止写操作 | 它是**声明与优化**，不是强制约束 |

## 五、面试高频问题（按出现频率排序） {#interview}

**IoC 容器**
1. `BeanFactory` 和 `ApplicationContext` 的区别？
2. Spring 容器启动经历哪些步骤（`refresh()` 十二步）？
3. 为什么推荐构造器注入？三种注入方式如何选择？
4. 同类型多个 Bean，`@Autowired` 注入哪个？`@Autowired` 和 `@Resource` 有什么区别？
5. `@Component` 和 `@Bean` 怎么选？`@Configuration` 和 `@Component` 有什么区别？

**Bean**
6. Bean 的完整生命周期？
7. `BeanFactoryPostProcessor` 和 `BeanPostProcessor` 的区别？
8. `@Autowired` 是在哪个阶段处理的？
9. 单例 Bean 是线程安全的吗？为什么无状态 Bean 就安全？
10. `prototype` 能解决线程安全吗？注入到单例里为什么失效？
11. Spring 如何解决循环依赖？为什么需要三级缓存而不是两级？
12. 构造器注入的循环依赖为什么无法解决？

**AOP**
13. Spring AOP 和 AspectJ 的区别？
14. JDK 动态代理和 CGLIB 怎么选？
15. `@Around` 和 `@Before` 的区别？
16. `@Transactional` 的实现原理？为什么会失效？
17. `REQUIRES_NEW` 和 `NESTED` 的区别？

**MyBatis**
18. MyBatis 的执行流程？
19. `#{}` 和 `${}` 的区别？
20. Mapper 接口没有实现类为什么能注入？
21. 一级缓存和二级缓存的区别与坑？
22. 延迟加载怎么实现的？有哪些坑？

> **答题提醒**：Spring 的问题几乎都能追溯到"生命周期 + 代理"两条主线。回答时先定位到具体阶段（如"这发生在属性填充阶段"），再展开细节——比直接背结论更有说服力，也更容易自证理解。

## 六、相关联的菜单

| 菜单 | 与这里的关联 |
|---|---|
| [Spring MVC](/java/spring/spring-mvc/) | Web 层的请求链路；其中"拦截器顺序"与 AOP 通知模型一致，"`@ControllerAdvice` 统一异常"也是横切思路 |
| [Spring Boot](/java/spring/spring-boot/) | 自动配置是"条件化的 Bean 注册"，启动流程驱动容器的 `refresh()`——两者都建立在本菜单的机制之上 |
| [设计模式](/java/design-patterns/) | Spring 自身就是模板方法、策略、工厂、代理等模式的教科书级应用 |
