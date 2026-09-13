---
date: 2026-09-11
sidebar: IoC 容器
title: IoC 容器与依赖注入
desc: IoC 与 DI 的关系、BeanFactory 与 ApplicationContext、BeanDefinition、从 main() 到容器就绪、图纸分批注册、refresh() 十二步、注解式装配与候选注入优先级
---

# IoC 容器与依赖注入

## 一、问题场景

传统写法里，对象的创建与依赖装配由使用方负责：

```java
public class OrderService {
    // 自己 new 依赖 → 强耦合到实现类，无法替换、无法测试
    private UserDao userDao = new UserDaoImpl();
    private PayClient payClient = new AlipayClient("appId", "secret");
}
```

这段代码把三件事绑死在一起：**依赖的具体实现**（`UserDaoImpl`）、**构造参数**（密钥）、**生命周期**（何时创建、何时释放）。结果是无法单测（除非真连支付宝）、换实现要改源码、配置散落各处。

IoC（Inversion of Control，控制反转）的解法：**把"创建对象、装配依赖、管理生命周期"的控制权从业务代码移交容器**，业务类只声明"我需要什么"，容器负责"给什么、怎么给"。

> **本篇范围**：只讲**容器本身的机制**——容器怎么组织、怎么启动、Bean 的"图纸"从哪来、依赖怎么注入。**Bean 创建出来之后的生命周期**（实例化 → 初始化 → 销毁、扩展点、循环依赖、作用域）属于 Bean 话题，见 [Bean 生命周期与扩展点](/java/spring/spring-framework/bean/)。

## 二、IoC 与 DI 的关系

这两个概念常被混用，实际是**同一思想的不同侧面**：

| 概念 | 含义 |
|---|---|
| **IoC（控制反转）** | 一种设计原则：控制权从代码转向框架（好莱坞原则——"别找我，我会找你"） |
| **DI（依赖注入）** | IoC 的一种**具体实现方式**：容器把依赖注入到对象中 |

DI 的三种注入方式：

| 方式 | 写法 | 评价 |
|---|---|---|
| **构造器注入** | 构造方法接收依赖 | **官方推荐**：依赖不可变、可保证非空、便于单测；缺点是循环依赖无法解决 |
| **Setter 注入** | `setXxx()` | 适合可选依赖；可解决 setter 循环依赖 |
| **字段注入** | `@Autowired` 标在字段上 | 写法最简，但**隐藏依赖、无法 final、脱离容器无法实例化**——生产代码不推荐 |

## 三、容器体系：BeanFactory 与 ApplicationContext

```
                    ┌──────────────────────────────────────┐
                    │           BeanFactory                │  ← 顶层接口：IoC 容器的最小契约
                    │ + getBean(String)                    │
                    │ + getBean(Class<T>)                  │
                    │ + containsBean(String)               │
                    └───────────────┬──────────────────────┘
                                    │
      ┌──────────────┬──────────────┼──────────────┬─────────────────┐
      ▼              ▼              ▼              ▼                 ▼
 ListableBean    Hierarchical   AutowireCapable  Configurable    ...
 Factory         BeanFactory    BeanFactory      BeanFactory
（按类型列举）    （父子容器）    （支持注解注入）  （可配置）
                                    │
                                    ▼
                    ┌──────────────────────────────────────┐
                    │       ApplicationContext             │ ← 企业级容器
                    │ extends BeanFactory + 4 个能力接口     │
                    └──────────────────────────────────────┘
```

`ApplicationContext` 在 `BeanFactory` 基础上扩展了 4 个能力接口：

| 接口 | 提供的能力 |
|---|---|
| `MessageSource` | 国际化消息解析 |
| `ResourcePatternResolver` | 资源加载（`classpath:` / `file:` / `http:`） |
| `ApplicationEventPublisher` | 事件发布（观察者模式的载体） |
| `EnvironmentCapable` | 环境与配置（`Environment`） |

**两者的关键差异在于"装配时机"：**

| 维度 | BeanFactory | ApplicationContext |
|---|---|---|
| 装配时机 | **懒加载**：`getBean()` 时才创建 | **启动时**预实例化所有单例 |
| 启动速度 | 快 | 慢（但问题暴露早） |
| 是否支持 BeanPostProcessor 自动注册 | 需手动 `addBeanPostProcessor` | 自动注册 |
| 是否支持 AOP、事件、国际化 | 需额外配置 | 开箱即用 |
| 典型实现 | `DefaultListableBeanFactory` | `ClassPathXmlApplicationContext`、`AnnotationConfigApplicationContext` |

**实践结论**：业务开发一律用 `ApplicationContext`。懒加载看似省时，实则把错误推迟到运行时——"启动即把所有 Bean 装配好并暴露问题"才是更稳的策略。这也是 Spring Boot 启动较慢但运行期稳定的原因之一。

## 四、BeanDefinition：Bean 的"图纸"

容器不会直接管理对象，而是先管理**描述信息**——`BeanDefinition` 就是 Bean 的图纸：

| 属性 | 含义 |
|---|---|
| `beanClassName` | 全限定类名 |
| `scope` | 作用域：`singleton` / `prototype` / `request` / `session` |
| `lazyInit` | 是否懒加载 |
| `dependsOn` | 依赖的其它 Bean 名称（控制创建顺序） |
| `primary` / `autowireCandidate` | 候选优先级 / 是否参与自动装配 |
| `propertyValues` | 属性值（`MutablePropertyValues`） |
| `constructorArgumentValues` | 构造器参数 |
| `initMethodName` / `destroyMethodName` | 初始化 / 销毁方法名 |
| `factoryBeanName` / `factoryMethodName` | 工厂方式创建 |

围绕这张"图纸"，容器有三组职责清晰的组件：

```
┌───────────────────┐   读取配置    ┌──────────────────┐
│ BeanDefinition    │──────────────▶│    Registry      │
│ Reader            │  产出图纸     │ （注册表：存放图纸）│
│ · XmlBeanDef...   │               │ · BeanDefinition │
│ · Properties...   │               │   Registry       │
│ · Annotated...    │               │ · DefaultListable│
└───────────────────┘               │   BeanFactory    │
                                    └──────────────────┘
```

- **`BeanDefinitionReader`**：三种实现的对应关系——XML 配置用 `XmlBeanDefinitionReader`，注解配置用 `AnnotatedBeanDefinitionReader`，Properties 用 `PropertiesBeanDefinitionReader`。**这一步回答"配置从哪来"**。
- **`BeanDefinitionRegistry`**：负责"图纸入库"。**`DefaultListableBeanFactory` 本身实现了这个接口**——这一点很关键：IoC 容器同时是注册表，所以"容器"和"Bean 定义仓库"在实现上是同一个对象。

## 五、容器启动：从 `main()` 到容器就绪

前面讲了"图纸长什么样""仓库是谁"，这一节把它们串起来——**一行 `main()` 到容器可用，中间到底发生了什么**。以最常用的注解容器为例：

```java
public static void main(String[] args) {
    // 这一行里发生了：构造容器 → 注册配置类 → refresh()
    ApplicationContext ctx = new AnnotationConfigApplicationContext(AppConfig.class);
    ctx.getBean(OrderService.class);   // 此时业务 Bean 已经建好，直接命中单例
}
```

### 构造器只做了三件事

`refresh()` 还没进来之前，构造器先铺好地基：

| 阶段 | 动作 | 结果 |
|---|---|---|
| `this()` | 创建 `DefaultListableBeanFactory`、`AnnotatedBeanDefinitionReader`、`ClassPathBeanDefinitionScanner` | 容器 + 注册表就位（回顾 §四：**两者是同一个对象**） |
| `register(AppConfig.class)` | 把**配置类本身**注册为 `BeanDefinition` | 注册表里只有**第一张图纸**（种子） |
| 调 `refresh()` | 十二步启动流程（见下一节） | 图纸补齐 → 单例创建完毕 |

**关键点在这里**：此刻容器里只有 `AppConfig` 一张图纸，`OrderService`、`OrderDao` 这些业务类**一张图纸都没有**。那它们从哪来？

### 扫描发生在第 5 步：`ConfigurationClassPostProcessor`

答案在 `refresh()` 第 5 步。`invokeBeanFactoryPostProcessors()` 会执行容器里所有的 `BeanFactoryPostProcessor`，其中**优先级最高**的一个是 `ConfigurationClassPostProcessor`（由 `AnnotationConfigApplicationContext` 在构造阶段就注册进去）。它的职责就是把"注解"翻译成"图纸"：

| 动作 | 做什么 |
|---|---|
| 解析 `@Configuration` | 为配置类生成 CGLIB 子类（`@Bean` 方法互调返回单例的底层机制，详见 §七） |
| 处理 `@ComponentScan` | 交给 `ClassPathBeanDefinitionScanner.doScan()` → **扫包 → 过滤 → 注册 `BeanDefinition`** |
| 处理 `@Import` / `@Bean` 方法 | `@Import` 的三种形态在此生效；`@Bean` 方法被登记成 `BeanDefinition`（`factoryBeanName` + `factoryMethodName`） |

**扫包的具体链路**（`@ComponentScan("com.foo")` 最终落到这里）：

```
@ComponentScan("com.foo")
        ↓  由 ConfigurationClassPostProcessor 触发（refresh() 第 5 步）
ClassPathBeanDefinitionScanner.doScan(basePackages)
        ↓
  ① 找到 basePackages 下所有 .class        ← PathMatchingResourcePatternResolver
  ② 用 MetadataReader 读字节码元数据        ← 不触发类加载，速度快
  ③ 按 includeFilters 判断是否候选          ← @Component 已被 @ComponentScan 默认收进 includeFilters
  ④ 生成 ScannedGenericBeanDefinition      ← 校验 Bean 名称唯一性
  ⑤ 注册进 BeanDefinitionRegistry          ← 即 DefaultListableBeanFactory
```

> **`@ComponentScan` 的默认值是启动类所在包**。这就是 Spring Boot 启动类必须放在根包的原因——放在子包里，上层和兄弟包下的类全都扫不到。跨模块时需显式声明 `@ComponentScan({"com.foo.a", "com.foo.b"})`。

### 由此得出：图纸是分两批入库的

| 批次 | 时机 | 内容 |
|---|---|---|
| 第一批（种子） | 构造器 `register()` | 配置类（`AppConfig` / Boot 启动类）本身 |
| 第二批（主体） | `refresh()` 第 5 步 | `@ComponentScan` 扫出的业务类 + `@Import` 导入的类 + `@Bean` 方法 |

**这也顺带解释了 §六 里"第 5、6 步顺序不能颠倒"的深层原因**：`@Bean` 方法可能定义一个 `BeanPostProcessor`，而它必须先被**扫描登记**（第 5 步），第 6 步才能把它注册进容器。扫描必然在第 6 步之前完成。

> 顺带一提，MyBatis 的 `@MapperScan` 走的是**同一位置但更早**的一步——`MapperScannerConfigurer` 实现的是 `BeanDefinitionRegistryPostProcessor`，它的执行时机早于所有普通 `BeanFactoryPostProcessor`。这是 Mapper 接口能被当成 Bean 注入的原因，详见 [MyBatis 集成](/java/spring/spring-framework/mybatis/)。

### 一张图看清全流程

```
main()
  │
  ├─ new AnnotationConfigApplicationContext(AppConfig.class)
  │     ├─ this()                → new DefaultListableBeanFactory（容器 + 注册表）
  │     ├─ register(AppConfig)   → 注册配置类 BeanDefinition              ← 种子图纸
  │     └─ refresh()
  │          ① prepareRefresh               准备环境、记录启动时间
  │          ② obtainFreshBeanFactory       拿到 ① 建好的 BeanFactory
  │          ③ prepareBeanFactory           装配容器自身基础设施
  │          ④ postProcessBeanFactory       子类扩展点
  │          ⑤ invokeBeanFactoryPostProcessors
  │               └─ ConfigurationClassPostProcessor
  │                     ├─ 解析 @Configuration（CGLIB 增强）
  │                     ├─ @ComponentScan → 扫包 → 注册业务 BeanDefinition  ← 主体图纸
  │                     └─ @Import / @Bean 方法 → 注册 BeanDefinition
  │          ⑥ registerBeanPostProcessors   注册（注意：不执行）
  │          ⑦ initMessageSource            国际化
  │          ⑧ initApplicationEventMulticaster
  │          ⑨ onRefresh                    Boot 在这里创建 Web 服务器
  │          ⑩ registerListeners
  │          ⑪ finishBeanFactoryInitialization  实例化所有非懒加载单例 ← 单个 Bean 生命周期起点
  │          ⑫ finishRefresh                发布 ContextRefreshedEvent
  │
  └─ 容器就绪，getBean() 直接命中单例
```

**一句话总结**：`main()` 里那行 `new` 触发的 `refresh()`，前半程（①~⑤）在**造图纸**，中期（⑥~⑩）在**装基础设施**，后半程（⑪）才**照图纸造对象**。启动耗时集中在第 11 步，根源就在这个分工上。

## 六、`refresh()` 十二步：容器启动骨架

`AbstractApplicationContext.refresh()` 是容器启动的模板方法（**模板方法模式的教科书级应用**）。上一节讲的注解扫描就发生在第 5 步，十二个步骤各司其职：

| 序号 | 方法 | 职责 |
|---|---|---|
| 1 | `prepareRefresh()` | 记录启动时间、初始化属性源、校验必需属性 |
| 2 | `obtainFreshBeanFactory()` | 创建 `DefaultListableBeanFactory`。**注意**：XML 容器在此解析配置文件注册 BeanDefinition；**注解容器不在这里扫包**，扫包要等到第 5 步（见上一节） |
| 3 | `prepareBeanFactory()` | 装配容器自身的基础设施（`ClassLoader`、`Environment`、`ApplicationContextAwareProcessor` 等） |
| 4 | `postProcessBeanFactory()` | 子类扩展点（如 Web 容器注册 request/session 作用域） |
| 5 | `invokeBeanFactoryPostProcessors()` | **执行所有 `BeanFactoryPostProcessor`**：修改/补齐 BeanDefinition——**注解扫描、`@Import`、`@Bean` 登记全在这一步**（见上一节） |
| 6 | `registerBeanPostProcessors()` | **注册所有 `BeanPostProcessor`**（注意：只是注册，尚未执行） |
| 7 | `initMessageSource()` | 初始化国际化支持 |
| 8 | `initApplicationEventMulticaster()` | 初始化事件广播器 |
| 9 | `onRefresh()` | 子类扩展点（Boot 的 Web 服务器创建在此） |
| 10 | `registerListeners()` | 注册事件监听器 |
| 11 | `finishBeanFactoryInitialization()` | **实例化所有非懒加载单例** ← 耗时的主要来源 |
| 12 | `finishRefresh()` | 发布 `ContextRefreshedEvent`、启动生命周期处理器 |

**两个高频追问点的答案就藏在这里**：

- 第 5 步和第 6 步的**顺序不能颠倒**：必须先让 `BeanFactoryPostProcessor` 改完图纸，才能注册 `BeanPostProcessor`——因为 `@Configuration` 类可能通过 `@Bean` 定义 `BeanPostProcessor`。
- 第 11 步是"实例化"而非"注册"：前面十步处理的是**元数据**，到这里才真正 `new` 对象。

> 第 11 步之后的**单个 Bean 内部**发生了什么，就是 [Bean 生命周期](/java/spring/spring-framework/bean/) 的内容。

## 七、注解式装配

第五节讲的是**机制**（扫描器怎么把类变成图纸），日常开发接触到的却是**注解本身**——扫描器靠注解判断谁是 Bean，靠注解决定依赖怎么给。这一节把装配相关的注解集中讲清，按"注册 → 注入 → 配置"三类组织。

### 把对象交给容器

| 注解 | 作用 | 为什么需要它 |
|---|---|---|
| **`@Component`** | 通用组件标记，被组件扫描发现后注册为 Bean | 最基础的"注册"手段 |
| **`@Controller`** | `@Component` 的语义化特化 | 标记 Web 层；让 `DispatcherServlet` 知道它是 Handler 来源 |
| **`@Service`** | `@Component` 的语义化特化 | 标记业务层，**纯语义**，功能上与 `@Component` 无差别 |
| **`@Repository`** | `@Component` 的语义化特化 | 标记持久层，**额外能力：把持久层异常翻译为 `DataAccessException`** |
| **`@Bean`** | 标在**方法**上，返回值注册为 Bean | 注册**第三方类**（无法改源码加 `@Component`）或需手工构造的对象 |
| **`@Import`** | 导入配置类 / `ImportSelector` / `ImportBeanDefinitionRegistrar` | 框架作者用它把"不该被扫到的类"装配进来（`@EnableXxx` 的底层机制） |
| **`@ComponentScan`** | 指定扫描的包路径 | 默认只扫启动类所在包及子包，跨模块时需显式声明 |

**四个"语义化特化"注解的功能差异极小**——`@Service` 与 `@Component` 在容器看来完全等价。它们存在的意义是**分层语义**：让代码自解释，也让 AOP 切点可以用 `@within(org.springframework.stereotype.Service)` 精确匹配某一层。**`@Repository` 是唯一有额外功能的**（异常翻译）。

**`@Component` vs `@Bean`——最高频的对比题：**

| 维度 | `@Component` | `@Bean` |
|---|---|---|
| 标注位置 | **类**上 | **方法**上（通常在 `@Configuration` 类中） |
| 生效方式 | 组件扫描发现 | 方法被调用时返回对象 |
| 适用对象 | **自己写的类** | **第三方类**、需要复杂构造逻辑的对象 |
| Bean 名称 | 类名首字母小写（可指定 `value`） | **方法名** |
| 能否条件化 | 需配合 `@Conditional`（作用在类上，粒度粗） | 可精确控制（方法级、可读参数、可写逻辑） |

**判断标准**：类是自己写的、能被扫描到 → 用 `@Component`；类是第三方的（如 `RedisTemplate`、`DataSource`）、或创建过程需要条件判断和复杂装配 → 用 `@Bean`。

### 向容器要依赖

| 注解 | 作用 |
|---|---|
| **`@Autowired`** | **按类型**注入；可标在构造器、Setter、字段上。`required = false` 允许找不到时留空 |
| **`@Qualifier`** | 配合 `@Autowired` **按名称**筛选，解决"同类型多个候选" |
| **`@Resource`** | JSR-250 标准注解，**默认按名称**注入，找不到再退化为按类型 |
| **`@Value`** | 注入配置值（`${...}` 占位符）或 SpEL 表达式（`#{...}`） |
| **`@Primary`** | 标在 Bean 定义上，同类型多候选时**默认优先选它** |

**同类型多个候选时，Spring 怎么选**——这是 `@Autowired` 最核心的追问，优先级从高到低：

```
① @Primary 标记的 Bean                      ← 显式声明的"默认选择"
      ↓ 没有 @Primary
② @Priority 数值最小的                       ← JSR-250 标准，少用
      ↓ 没有
③ @Qualifier 指定的名称                      ← 调用方显式筛选
      ↓ 没有
④ 字段名 / 参数名 与 Bean 名称匹配            ← 隐式约定，靠"名字对上了"
      ↓ 都没有
⑤ 抛 NoUniqueBeanDefinitionException        ← 必须显式指定，否则启动失败
```

**第 ④ 条容易被忽略但很实用**：`private UserDao userDao;` 会优先匹配名为 `userDao` 的 Bean。**但它也是隐患**——重命名字段就可能悄悄改变注入目标。生产代码建议**显式用 `@Qualifier`**，让意图清晰。

**`@Autowired` vs `@Resource`：**

| 维度 | `@Autowired` | `@Resource` |
|---|---|---|
| 来源 | Spring 自有 | **JSR-250 标准**（`jakarta.annotation`） |
| 匹配策略 | **先按类型** | **先按名称**，找不到再按类型 |
| 支持 `@Qualifier` | ✅ | ✅（但部分行为不一致） |
| 推荐度 | **官方推荐**（与 Spring 生态一致） | 需要"按名字"语义时可用 |

**实践中统一用 `@Autowired` 即可**——Spring 团队的立场是 `@Resource` 的"按名称优先"语义容易与类型注入混淆。**唯一需要 `@Resource` 的场景是框架无关性要求**（如代码要在非 Spring 容器中复用）。

### 构造器注入：唯一可以省掉 `@Autowired` 的写法

```java
@Service
public class OrderService {
    private final OrderDao orderDao;

    // ✓ 单构造器时 @Autowired 可省略（Spring 4.3+）
    public OrderService(OrderDao orderDao) { this.orderDao = orderDao; }
}
```

**为什么推荐构造器注入**：依赖可 `final`（不可变 + 线程安全）、对象创建即完成装配（**不存在"半初始化"状态**，避免 NPE）、依赖关系显式暴露在构造签名上、脱离容器也能 `new` 出来做单测。代价是无法解决构造器循环依赖——但这通常说明设计本身有环，暴露出来是好事（见 [循环依赖](/java/spring/spring-framework/bean/circular-dependency)）。

### `@Configuration` vs `@Component`——一个容易被低估的差异

两者都能注册 `@Bean` 方法，但有一个**行为差异**：

```java
@Configuration                              // proxyBeanMethods = true（默认）
public class AppConfig {
    @Bean public A a() { return new A(); }
    @Bean public B b() { return new B(a()); }   // ✓ 返回的是容器中的同一个 A（CGLIB 拦截）
}
```

```java
@Component                                  // 不生成 CGLIB 代理
public class BadConfig {
    @Bean public A a() { return new A(); }
    @Bean public B b() { return new B(a()); }   // ✗ 直接调方法 → 又 new 了一个 A！
}
```

`@Configuration` **默认会用 CGLIB 生成子类**，拦截 `@Bean` 方法的调用并转发给容器——因此 `a()` 在类内部被调用时返回的仍是**容器中的单例**。`@Component` 没有这层代理，内部调用就是普通方法调用，会**创建出多个实例**。

**实践建议**：需要 `@Bean` 方法之间互相调用时必须用 `@Configuration`；如果确定不会互相调用，可用 `@Configuration(proxyBeanMethods = false)` 关闭代理以**加快启动**（Spring Boot 内部的自动配置类全部这么做了）。

## 八、手写一个最小 IoC 容器

理解原理最有效的方式是自己实现一遍。以下是简化版的核心骨架（保留设计结构，去掉工程复杂度）：

```java
/** 图纸：描述一个 Bean 的定义 */
public class BeanDefinition {
    private Class<?> type;
    private String scope = "singleton";
    private boolean lazy = false;
    // getter / setter 省略
}

/** 注册表：存放图纸 */
public interface BeanDefinitionRegistry {
    void register(String name, BeanDefinition bd);
    BeanDefinition get(String name);
    List<String> getBeanNames();
}

/** 解析器：从配置读取图纸（这里是扫包+反射的简化版） */
public class AnnotatedBeanDefinitionReader {
    private final BeanDefinitionRegistry registry;

    public AnnotatedBeanDefinitionReader(BeanDefinitionRegistry registry) {
        this.registry = registry;
    }

    /** 扫描包下所有带 @Component 的类并注册 */
    public void scan(String basePackage) { /* 类扫描 + 注册，略 */ }

    public void register(Class<?>... classes) {
        for (Class<?> c : classes) {
            BeanDefinition bd = new BeanDefinition();
            bd.setType(c);
            registry.register(c.getSimpleName(), bd);
        }
    }
}
```

```java
/** 容器：负责实例化与缓存 */
public class SimpleBeanFactory implements BeanDefinitionRegistry {
    private final Map<String, BeanDefinition> definitions = new HashMap<>();
    private final Map<String, Object> singletons = new ConcurrentHashMap<>();
    private final List<BeanPostProcessor> postProcessors = new ArrayList<>();

    @Override public void register(String name, BeanDefinition bd) { definitions.put(name, bd); }
    @Override public BeanDefinition get(String name) { return definitions.get(name); }
    @Override public List<String> getBeanNames() { return new ArrayList<>(definitions.keySet()); }

    public void addBeanPostProcessor(BeanPostProcessor p) { postProcessors.add(p); }

    @SuppressWarnings("unchecked")
    public <T> T getBean(String name) {
        // ① 单例命中则直接返回
        Object cached = singletons.get(name);
        if (cached != null) return (T) cached;

        BeanDefinition bd = definitions.get(name);
        if (bd == null) throw new NoSuchBeanDefinitionException(name);

        // ② 实例化
        Object instance = instantiate(bd.getType());

        // ③ 属性填充（简化：仅演示时机，实际需处理 @Autowired 解析）
        populate(instance);

        // ④ Aware 回调
        if (instance instanceof BeanNameAware aware) aware.setBeanName(name);

        // ⑤ 前置处理（@PostConstruct 由实现该接口的处理器负责）
        for (BeanPostProcessor p : postProcessors) instance = p.postProcessBeforeInitialization(instance, name);

        // ⑥ 初始化回调
        if (instance instanceof InitializingBean bean) bean.afterPropertiesSet();

        // ⑦ 后置处理（AOP 代理在这里生成）
        for (BeanPostProcessor p : postProcessors) instance = p.postProcessAfterInitialization(instance, name);

        // ⑧ 缓存单例
        singletons.put(name, instance);
        return (T) instance;
    }

    private Object instantiate(Class<?> type) { /* 反射 newInstance + 构造器注入，略 */ return null; }
    private void populate(Object instance)     { /* 字段注入，略 */ }
}
```

这个骨架与真实 Spring 的差异在于：真实实现有三级缓存处理循环依赖、有 `BeanDefinition` 合并、有作用域管理、有 `FactoryBean` 支持、有并发控制（`DefaultSingletonBeanRegistry` 的双重检查加锁）。但**主干流程完全一致**——这份骨架的价值是让你在面试中能画出上面的流程图并解释每一步的意图。②~⑦ 每一步的细节展开见 [Bean 生命周期](/java/spring/spring-framework/bean/)。

## 九、面试问答

**Q1：`BeanFactory` 和 `ApplicationContext` 的区别？**

① `ApplicationContext` 是 `BeanFactory` 的子接口，额外提供国际化、资源加载、事件发布、环境配置四项企业级能力；② **装配时机不同**——`BeanFactory` 懒加载，`ApplicationContext` 启动时预实例化所有单例（`AbstractApplicationContext` 的 `refresh()` 第 11 步）；③ `ApplicationContext` 会自动注册 `BeanPostProcessor`，`BeanFactory` 需手动添加。实践中用 `ApplicationContext`，因为"启动即暴露问题"优于"运行时才发现"。

**Q2：为什么推荐构造器注入？**

① 依赖可声明为 `final`，保证不可变与线程安全；② 对象创建即完成装配，**不存在"半初始化"状态**，避免 NPE；③ 依赖关系显式暴露在构造签名上，依赖过多时一眼可见（提示该类职责可能过重）；④ 脱离 Spring 容器也能直接 `new` 出来做单元测试。代价是无法解决构造器循环依赖——但这通常说明设计本身有环，暴露出来是好事。

**Q3：Spring 容器启动慢，可能是什么原因？**

主要耗时在 `refresh()` 第 11 步 `finishBeanFactoryInitialization`——实例化所有非懒加载单例。常见原因：① Bean 数量多且初始化逻辑重（如连接池、缓存预热）；② `@PostConstruct` 中有阻塞操作（远程调用、大批量查询）；③ 组件扫描范围过大（扫描到无关包）；④ AOP 代理创建量大。排查手段：开 `debug` 日志观察 Bean 创建耗时，或对可疑 Bean 设置 `@Lazy` 延迟初始化验证。**注意**：`spring.main.lazy-initialization=true` 能显著加快启动，但会把问题推迟到运行期，只在开发环境开启比较稳妥。

**Q4：`@Component`、`@Service`、`@Repository`、`@Controller` 有什么区别？**

`@Service` 和 `@Controller` 是 `@Component` 的**语义化别名**，功能上完全等价（容器一视同仁），作用是表达分层语义、并让 AOP 切点可以按层匹配。`@Repository` 除语义外**还有实际功能：它会启用持久层异常翻译**，把 JDBC / JPA 的原生异常转成 Spring 统一的 `DataAccessException` 体系——这是它与其他三个的实质差异。

**Q5：`@Component` 和 `@Bean` 怎么选？**

`@Component` 标在**类**上，靠组件扫描生效，适用于**自己写的类**；`@Bean` 标在**方法**上，适用于**第三方类**（无法在源码上加注解）或**需要复杂构造逻辑、条件判断**的对象。另外 `@Bean` 的 Bean 名称是方法名，粒度更细、可条件化（配合 `@ConditionalOnXxx`），而 `@Component` 的条件只能作用在类级。

**Q6：同类型的多个 Bean，`@Autowired` 会注入哪个？**

按优先级：① `@Primary` 标记的；② `@Priority` 数值最小的；③ `@Qualifier` 显式指定的名称；④ 字段名/参数名与 Bean 名称匹配的；⑤ 都不满足则抛 `NoUniqueBeanDefinitionException`。**建议显式用 `@Qualifier`**——依赖字段名的隐式匹配一旦重命名就可能改变注入目标。

**Q7：`@Autowired` 和 `@Resource` 的区别？**

`@Autowired` 是 Spring 自有注解，**按类型注入**，可配合 `@Qualifier` 按名称筛选；`@Resource` 是 JSR-250 标准注解，**默认按名称注入**，找不到同名的再按类型兜底。实践中统一用 `@Autowired`（与 Spring 生态一致）；只有需要框架无关性时才选 `@Resource`。

**Q8：`@Configuration` 和 `@Component` 都能定义 `@Bean`，有区别吗？**

有实际差别。`@Configuration` **默认（`proxyBeanMethods = true`）会用 CGLIB 生成子类**，拦截类内部对 `@Bean` 方法的调用并转发给容器，因此 `b()` 里调用 `a()` 拿到的是**容器中的同一个单例**；`@Component` 没有这层代理，内部调用就是普通方法调用，会**重复创建实例**。所以需要 `@Bean` 方法互相调用时必须用 `@Configuration`；确定不互相调用时可用 `@Configuration(proxyBeanMethods = false)` 关闭代理加快启动。

**Q9：`@Autowired` 是在哪个阶段被处理的？**

在 Bean 生命周期的**属性填充阶段**（`populateBean` → `AutowiredAnnotationBeanPostProcessor.postProcessProperties`）完成字段/Setter 注入；而该处理器同时实现了 `postProcessBeforeInitialization`，用于处理 `@PostConstruct` 等注解——所以 `@Autowired` 注入完成后才会执行 `@PostConstruct`，这也是 `@PostConstruct` 中能安全使用注入依赖的原因。完整时序见 [Bean 生命周期](/java/spring/spring-framework/bean/)。

**Q10：完整说一下 IoC 容器的初始化流程。**

按"入口 → 十二步 → 就绪"三段说：**① 入口**——`new AnnotationConfigApplicationContext(AppConfig.class)`（或 Boot 的 `SpringApplication.run()`）在构造器里创建 `DefaultListableBeanFactory`（容器即注册表），把**配置类本身**注册为 `BeanDefinition`，此时容器里只有这一张种子图纸；**② 主干**——随后调用 `refresh()` 十二步：①② 准备环境、拿到 BeanFactory，③④ 装配容器基础设施与子类扩展点，**⑤ `invokeBeanFactoryPostProcessors()` 执行 `ConfigurationClassPostProcessor`，完成 `@ComponentScan` 扫包与 `@Import`/`@Bean` 登记**，⑥ 注册 `BeanPostProcessor`（只注册不执行），⑦⑧ 初始化国际化与事件广播器，⑨ `onRefresh`（Boot 在此创建 Web 服务器），⑩ 注册事件监听器，⑪ `finishBeanFactoryInitialization()` **实例化所有非懒加载单例**，⑫ `finishRefresh()` 发布 `ContextRefreshedEvent`；**③ 结果**——容器就绪，`getBean()` 直接命中单例。一句话收口：**①~⑤ 造图纸，⑥~⑩ 装基础设施，⑪ 照图纸造对象**——启动耗时几乎全在第 11 步。

**Q11：`@Component` 标注的类，是在哪一步被扫描并注册成 `BeanDefinition` 的？**

在 `refresh()` 的**第 5 步 `invokeBeanFactoryPostProcessors()`**，由 `ConfigurationClassPostProcessor` 触发（它是 `BeanDefinitionRegistryPostProcessor`，优先级最高，在所有普通 `BeanFactoryPostProcessor` 之前执行）。链路是：解析配置类上的 `@ComponentScan` → `ClassPathBeanDefinitionScanner.doScan()` → 找到候选 `.class` → 用 `MetadataReader` 读字节码元数据（不触发类加载）→ 按 `includeFilters` 过滤（`@Component` 默认已在其中）→ 生成 `ScannedGenericBeanDefinition` → 注册进 `DefaultListableBeanFactory`。所以 `BeanDefinition` 是**分两批**入库的：**构造阶段**先注册配置类本身（种子），**第 5 步**再扫出业务类（主体）。顺带一提，`@MapperScan` 走的是**同一位置但更早**的 `BeanDefinitionRegistryPostProcessor` 阶段，这是 MyBatis Mapper 接口能作为 Bean 注入的原因（见 [MyBatis 集成](/java/spring/spring-framework/mybatis/)）。
