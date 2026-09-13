---
date: 2026-09-11
---

# Spring Framework · 导览

Spring Framework 是整个 Spring 生态的地基。Boot 和 Cloud 都是在这一层之上做**约定与封装**——所以理解 Framework 的核心机制，是读懂一切上层现象的前提：为什么事务会失效、为什么循环依赖能被解决、为什么注解在同类内部调用时不起作用。

## 一、知识地图

| 主题 | 回答的核心问题 | 面试权重 |
|---|---|---|
| [IoC 容器与 Bean 生命周期](/java/spring/spring-framework/ioc-container) | 对象由谁创建、依赖由谁装配、Bean 从生到死经历什么 | ★★★★★ |
| [循环依赖与三级缓存](/java/spring/spring-framework/circular-dependency) | A 依赖 B、B 依赖 A，Spring 凭什么能启动 | ★★★★★ |
| [AOP 与代理机制](/java/spring/spring-framework/aop) | 横切逻辑怎么织入、JDK 代理与 CGLIB 如何选 | ★★★★★ |
| [声明式事务与传播行为](/java/spring/spring-framework/transaction) | `@Transactional` 怎么生效、为什么会失效 | ★★★★★ |
| [MyBatis 执行流程与集成](/java/spring/spring-framework/mybatis) | SQL 怎么被执行、延迟加载和缓存有什么坑 | ★★★★ |
| [Bean 作用域与线程安全](/java/spring/spring-framework/bean-scope) | 单例 Bean 能并发用吗、有状态对象怎么处理 | ★★★★★ |
| [Spring MVC 执行流程](/java/spring/spring-framework/spring-mvc) | 一个请求怎么被路由到 Controller、组件为何这么拆 | ★★★★★ |
| [注解速查与辨析](/java/spring/spring-framework/annotations) | 常用注解分别解决什么问题、易混注解如何区分 | ★★★★ |

**两个层次**：前五篇是**核心机制**（容器、代理、事务、ORM），后三篇是**横向展开**——作用域回答"Bean 怎么被安全共享"，MVC 回答"Web 层怎么接住请求"，注解速查则是把前七篇的结论压缩成一张可查表。

## 二、推荐阅读顺序

```
① IoC 容器与 Bean 生命周期      ← 一切的地基，必须先读
        │
        ├──▶ ② 循环依赖与三级缓存        （生命周期的"破洞"：实例化与填充之间的窗口）
        │
        ├──▶ ③ AOP 与代理机制           （生命周期的"尾声"：代理在初始化后生成）
        │
        └──▶ ⑥ Bean 作用域与线程安全     （生命周期的"产物"：单例 Bean 究竟能不能共享）
                    │
                    ▼
             ④ 声明式事务与传播行为    （AOP 最典型的应用，也是失效问题最多的场景）
                    │
                    ▼
             ⑤ MyBatis 执行流程与集成  （与事务协同的部分依赖 ②③④ 的结论）

⑦ Spring MVC 执行流程    ← Web 层的请求链路，独立于上面的核心机制链，可单独读
        │
        ▼
⑧ 注解速查与辨析         ← 前七篇的结论压缩成可查表，建议最后通读一遍做收口
```

**顺序不能跳的理由**：事务失效的八种场景，根因全部指向"代理"；循环依赖的解法，前提是知道"实例化与属性填充是两个阶段"；而 MyBatis 的 `SqlSessionTemplate` 之所以必要，取决于是否理解事务上下文与连接复用。**①②③④⑤ 是一条链，断开任何一环，后面的结论都会变成死记硬背。**

**⑥ 为什么紧跟 ①**：作用域问题（单例能不能并发用）本质是问"Bean 被共享后会怎样"，而"共享"这个前提正是 ① 里"单例池 + 无状态设计"的直接推论。**⑦ 可以独立读**，但里面"拦截器与 AOP 通知顺序一致""`@ControllerAdvice` 也是横切"这两点，读过 ③ 会更容易理解。**⑧ 是索引页**，不要当教材从头背——先读前七篇建立理解，再回来用它做速查与辨析。

## 三、几条贯穿全篇的主线

理解 Spring，比记住知识点更重要的是抓住这几条主线：

**主线一：一切都围绕"Bean 的生命周期"展开。**
`BeanPostProcessor`、Aware 回调、`InitializingBean`、AOP 代理、循环依赖的破解——**全部是生命周期链上某个环节的产物**。把生命周期的时间轴画出来，大部分问题都能定位到具体阶段。

**主线二：代理是理解"注解失效"的唯一钥匙。**
`@Transactional`、`@Async`、`@Cacheable`、`@PreAuthorize`——这些注解无一例外都靠代理生效。因此"同类内部调用失效""非 public 方法失效""final 类失效"是同一类问题的不同表现，而不是零散的知识点。

**主线三：模板方法 + 策略 + 工厂，撑起了 Spring 的骨架。**
`AbstractApplicationContext.refresh()` 是模板方法，`PlatformTransactionManager` / `ResourceLoader` / `HandlerMapping` 是策略，`BeanFactory` 体系是工厂。**设计模式不是 Spring 的装饰，是它的组织方式**——相关内容见[设计模式板块](/java/design-patterns/)。

**主线四：默认行为往往是最危险的。**
`@Transactional` 默认只回滚运行时异常、Spring 默认强制 CGLIB 代理、MyBatis 一级缓存默认开启且无法关闭——**这些"默认"制造了绝大多数生产事故**。审阅代码时，对每一个"用默认值"的地方都要问一句"默认值是什么"。

## 四、常见误区速查

| 误区 | 事实 |
|---|---|
| `@PostConstruct` 在 `afterPropertiesSet` 之后 | **在前**。前者由 `BeanPostProcessor` 驱动，后者由 `invokeInitMethods` 驱动 |
| 循环依赖靠二级缓存解决 | 关键在**三级**：存的是 `ObjectFactory`，用于延迟决定是否生成代理 |
| 构造器注入也能解决循环依赖 | **不能**。构造参数必须在实例化时确定，没有"提前暴露"的窗口 |
| Spring AOP 就是 AspectJ | Spring 只借用其**注解与切点语法**，织入用的是自研动态代理 |
| `@Transactional` 对所有异常回滚 | **只对 `RuntimeException` 和 `Error`**，受检异常默认不回滚 |
| `readOnly = true` 能阻止写操作 | 它是**声明与优化**，不是强制约束 |
| 一级缓存可以关闭 | 默认开启且**只能改作用域为 `STATEMENT`**，不能真正关闭 |
| MyBatis 二级缓存可以放心用 | 跨 namespace 的关联更新**无法感知**，易产生脏数据 |
| 单例 Bean 是线程安全的 | **容器不保证**。只保证"实例唯一"，安不安全取决于有没有**可变状态** |
| `prototype` 能解决"注入到单例"的共享问题 | **不能**。依赖注入只执行一次，需 `ObjectProvider` 或 `@Lookup` 才能真正每次新建 |
| `@Service` 和 `@Component` 功能不同 | **完全相同**，纯语义标签；只有 `@Repository` 有额外能力（异常翻译） |
| `@Configuration` 和 `@Component` 里定义 `@Bean` 等价 | **不等价**。前者有 CGLIB 代理，`@Bean` 方法互相调用返回同一个单例；后者会**重复创建** |
| 不加 `@RequestBody` 也能收 JSON | **不能**。会走"属性绑定"路径从请求参数取值，结果字段全 null 或 400 |
| MyBatis 延迟加载一定能减少查询 | 循环中访问关联属性会**退化成 1+N**；序列化实体时会**隐式全量触发** |
| `spring.factories` 在 3.x 仍用于自动配置 | **已移除**。2.7 起改用 `AutoConfiguration.imports`，每行一个类名 |

## 五、面试高频问题（按出现频率排序）

**Bean 与容器**
1. Bean 的完整生命周期？
2. `BeanFactory` 和 `ApplicationContext` 的区别？
3. `BeanFactoryPostProcessor` 和 `BeanPostProcessor` 的区别？
4. `@Autowired` 是在哪个阶段处理的？三种注入方式如何选择？

**作用域与线程安全**
5. 单例 Bean 是线程安全的吗？为什么无状态 Bean 就安全？
6. `prototype` 能解决线程安全吗？注入到单例里为什么失效？
7. `ThreadLocal` 有什么风险？线程池下为什么会串数据？

**循环依赖**
8. Spring 如何解决循环依赖？为什么需要三级缓存而不是两级？
9. 构造器注入的循环依赖为什么无法解决？
10. Spring Boot 2.6 为什么默认禁止循环依赖？

**AOP**
11. Spring AOP 和 AspectJ 的区别？
12. JDK 动态代理和 CGLIB 怎么选？
13. `@Around` 和 `@Before` 的区别？

**事务**
14. `@Transactional` 的实现原理？为什么会失效？
15. `REQUIRES_NEW` 和 `NESTED` 的区别？
16. Spring 事务默认回滚哪些异常？

**MyBatis**
17. `#{}` 和 `${}` 的区别？
18. Mapper 接口没有实现类为什么能注入？
19. 一级缓存和二级缓存的区别与坑？
20. 延迟加载怎么实现的？有哪些坑？

**Spring MVC**
21. Spring MVC 的完整执行流程？
22. `HandlerMapping` 和 `HandlerAdapter` 为什么要拆开？
23. 拦截器和过滤器有什么区别？
24. `@ResponseBody` 做了什么？为什么能跳过视图解析？

**注解**
25. `@Component` 和 `@Bean` 怎么选？
26. 同类型多个 Bean，`@Autowired` 注入哪个？
27. `@Configuration` 和 `@Component` 定义 `@Bean` 有什么区别？

> **答题提醒**：Spring 的问题几乎都能追溯到"生命周期 + 代理"两条主线。回答时先定位到具体阶段（如"这发生在属性填充阶段"），再展开细节——比直接背结论更有说服力，也更容易自证理解。
