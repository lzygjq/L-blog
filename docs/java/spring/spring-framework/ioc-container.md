# IoC 容器与 Bean 生命周期

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

## 五、容器启动流程：`refresh()` 十二步

`AbstractApplicationContext.refresh()` 是容器启动的模板方法（**模板方法模式的教科书级应用**），十二个步骤各司其职：

| 序号 | 方法 | 职责 |
|---|---|---|
| 1 | `prepareRefresh()` | 记录启动时间、初始化属性源、校验必需属性 |
| 2 | `obtainFreshBeanFactory()` | 创建 `DefaultListableBeanFactory`，**加载并注册所有 BeanDefinition** |
| 3 | `prepareBeanFactory()` | 装配容器自身的基础设施（`ClassLoader`、`Environment`、`ApplicationContextAwareProcessor` 等） |
| 4 | `postProcessBeanFactory()` | 子类扩展点（如 Web 容器注册 request/session 作用域） |
| 5 | `invokeBeanFactoryPostProcessors()` | **执行所有 `BeanFactoryPostProcessor`**：修改 BeanDefinition（`@Configuration` 的解析、占位符替换在此发生） |
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

## 六、Bean 生命周期（核心）

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

**④ 循环依赖的破解点在 ① 与 ② 之间**。`createBeanInstance` 完成后就把"早期引用"暴露到三级缓存，使得其它 Bean 在 ② 阶段能拿到一个尚未填充属性的对象——这是 [循环依赖](/java/spring/spring-framework/circular-dependency/) 的机制基础。

## 七、扩展点总览（面试高分项）

Spring 的"可扩展性"来自这些扩展点，**能说清它们的执行时机与用途差异，是区分"用过 Spring"与"懂 Spring"的分水岭**：

| 扩展点 | 执行时机 | 典型用途 | 执行次数 |
|---|---|---|---|
| `BeanDefinitionRegistryPostProcessor` | 第 5 步最早期 | 动态注册 BeanDefinition（`@MapperScan`） | 一次 |
| `BeanFactoryPostProcessor` | 第 5 步 | 修改 BeanDefinition（`PropertySourcesPlaceholderConfigurer`） | 一次 |
| `BeanPostProcessor` | 每个 Bean 初始化前后 | 代理生成、属性注入（`@Autowired`） | 每个 Bean 两次 |
| `InstantiationAwareBeanPostProcessor` | 实例化前后 | 自定义实例化策略、属性填充增强 | 每个 Bean |
| `InitializingBean` / `@PostConstruct` | 初始化阶段 | 资源准备 | 每个 Bean |
| `DisposableBean` / `@PreDestroy` | 容器关闭 | 资源释放 | 每个 Bean |
| `ApplicationListener` | 事件发布时 | 解耦的业务响应 | 按事件次数 |

**最高频的对比题：`BeanFactoryPostProcessor` vs `BeanPostProcessor`**

| 维度 | BeanFactoryPostProcessor | BeanPostProcessor |
|---|---|---|
| 作用对象 | **BeanDefinition**（图纸） | **Bean 实例**（成品） |
| 执行时机 | 所有 Bean 实例化**之前** | 每个 Bean 初始化**前后** |
| 执行次数 | 一次 | 每个 Bean 各两次 |
| 典型实现 | `ConfigurationClassPostProcessor`、`PropertySourcesPlaceholderConfigurer` | `AutowiredAnnotationBeanPostProcessor`、`AbstractAutoProxyCreator` |

一句话记忆：**前者改图纸，后者改成品；前者只跑一次，后者每个 Bean 都跑。**

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

这个骨架与真实 Spring 的差异在于：真实实现有三级缓存处理循环依赖、有 `BeanDefinition` 合并、有作用域管理、有 `FactoryBean` 支持、有并发控制（`DefaultSingletonBeanRegistry` 的双重检查加锁）。但**主干流程完全一致**——这份骨架的价值是让你在面试中能画出上面的流程图并解释每一步的意图。

## 九、面试问答

**Q1：`BeanFactory` 和 `ApplicationContext` 的区别？**

① `ApplicationContext` 是 `BeanFactory` 的子接口，额外提供国际化、资源加载、事件发布、环境配置四项企业级能力；② **装配时机不同**——`BeanFactory` 懒加载，`ApplicationContext` 启动时预实例化所有单例（`AbstractApplicationContext` 的 `refresh()` 第 11 步）；③ `ApplicationContext` 会自动注册 `BeanPostProcessor`，`BeanFactory` 需手动添加。实践中用 `ApplicationContext`，因为"启动即暴露问题"优于"运行时才发现"。

**Q2：Bean 的完整生命周期？**

实例化 → 属性填充（依赖注入）→ Aware 回调 → `BeanPostProcessor.postProcessBeforeInitialization`（`@PostConstruct` 在此）→ `InitializingBean.afterPropertiesSet()` → `init-method` → `BeanPostProcessor.postProcessAfterInitialization`（**AOP 代理在此生成**）→ 使用 → 销毁（`@PreDestroy` → `DisposableBean.destroy()` → `destroy-method`）。

三个易错点：`@PostConstruct` 早于 `afterPropertiesSet`；AOP 代理在初始化完成后才创建；循环依赖的破解发生在实例化与属性填充之间。

**Q3：`BeanFactoryPostProcessor` 和 `BeanPostProcessor` 的区别？**

核心区别是作用对象与执行时机：`BeanFactoryPostProcessor` 作用于 `BeanDefinition`（图纸），在所有 Bean 实例化之前执行一次；`BeanPostProcessor` 作用于 Bean 实例（成品），每个 Bean 初始化前后各执行一次。典型代表分别是 `ConfigurationClassPostProcessor`（解析 `@Configuration`）与 `AutowiredAnnotationBeanPostProcessor`（处理 `@Autowired`）。

**Q4：`@Autowired` 是什么时候被处理的？**

在 Bean 生命周期的两个不同阶段：**属性填充阶段**（`populateBean` → `AutowiredAnnotationBeanPostProcessor.postProcessProperties`）完成字段/Setter 注入；而该处理器同时实现了 `postProcessBeforeInitialization`，用于处理 `@PostConstruct` 等注解。所以 `@Autowired` 注入完成后才会执行 `@PostConstruct`——这也是 `@PostConstruct` 中能安全使用注入依赖的原因。

**Q5：为什么推荐构造器注入？**

① 依赖可声明为 `final`，保证不可变与线程安全；② 对象创建即完成装配，**不存在"半初始化"状态**，避免 NPE；③ 依赖关系显式暴露在构造签名上，依赖过多时一眼可见（提示该类职责可能过重）；④ 脱离 Spring 容器也能直接 `new` 出来做单元测试。代价是无法解决构造器循环依赖——但这通常说明设计本身有环，暴露出来是好事。

**Q6：Spring 容器启动慢，可能是什么原因？**

主要耗时在第 11 步 `finishBeanFactoryInitialization`——实例化所有非懒加载单例。常见原因：① Bean 数量多且初始化逻辑重（如连接池、缓存预热）；② `@PostConstruct` 中有阻塞操作（远程调用、大批量查询）；③ 组件扫描范围过大（扫描到无关包）；④ AOP 代理创建量大。排查手段：开 `debug` 日志观察 Bean 创建耗时，或对可疑 Bean 设置 `@Lazy` 延迟初始化验证。**注意**：`spring.main.lazy-initialization=true` 能显著加快启动，但会把问题推迟到运行期，只在开发环境开启比较稳妥。
