# 循环依赖与三级缓存

## 一、问题场景

两个 Bean 互相依赖：

```java
@Service
public class AService {
    @Autowired private BService bService;      // A 需要 B
}

@Service
public class BService {
    @Autowired private AService aService;      // B 需要 A
}
```

按 [Bean 生命周期](/java/spring/spring-framework/ioc-container/) 的顺序：创建 A 需要先注入 B，创建 B 又需要先注入 A——**形成死循环**。

直觉上这必然失败，但 Spring 能正常启动。它依靠的机制就是**三级缓存 + 提前暴露引用**。这是 Spring 面试中出现频率最高的一个技术点，也是最能区分"背答案"和"真理解"的问题。

## 二、三级缓存

`DefaultSingletonBeanRegistry` 中定义了三个 Map：

| 层级 | 字段名 | 存放内容 | 用途 |
|---|---|---|---|
| **一级** | `singletonObjects` | **完整的单例对象**（含代理） | 最终成品，日常 `getBean` 直接命中这里 |
| **二级** | `earlySingletonObjects` | **半成品**（已实例化，未填充属性） | 提前暴露的引用，避免重复从三级缓存获取 |
| **三级** | `singletonFactories` | **`ObjectFactory`（lambda 工厂）** | 延迟决定"暴露原始对象还是代理对象" |

```java
// DefaultSingletonBeanRegistry 源码（字段）
private final Map<String, Object> singletonObjects = new ConcurrentHashMap<>(256);          // 一级
private final Map<String, Object> earlySingletonObjects = new ConcurrentHashMap<>(16);      // 二级
private final Map<String, ObjectFactory<?>> singletonFactories = new HashMap<>(16);         // 三级
```

**取单例的顺序是自上而下**：一级 → 二级 → 三级 → 创建。命中三级缓存时会调用工厂取出对象并升级到二级：

```java
// getSingleton(beanName, allowEarlyReference) 核心逻辑
protected Object getSingleton(String beanName, boolean allowEarlyReference) {
    Object singletonObject = this.singletonObjects.get(beanName);           // ① 查一级
    if (singletonObject == null && isSingletonCurrentlyInCreation(beanName)) {
        singletonObject = this.earlySingletonObjects.get(beanName);         // ② 查二级
        if (singletonObject == null && allowEarlyReference) {
            synchronized (this.singletonObjects) {
                // 双重检查（并发场景下防止重复创建）
                singletonObject = this.singletonObjects.get(beanName);
                if (singletonObject == null) {
                    singletonObject = this.earlySingletonObjects.get(beanName);
                    if (singletonObject == null) {
                        ObjectFactory<?> f = this.singletonFactories.get(beanName);   // ③ 查三级
                        if (f != null) {
                            singletonObject = f.getObject();                          // 调用工厂
                            this.earlySingletonObjects.put(beanName, singletonObject); // 升级到二级
                            this.singletonFactories.remove(beanName);                  // 移除三级
                        }
                    }
                }
            }
        }
    }
    return singletonObject;
}
```

**注意 `isSingletonCurrentlyInCreation(beanName)` 这个判断**——只有"正在创建中"的 Bean 才允许从早期缓存取，这防止了"半成品被误用"。

## 三、完整流程推演

以 A ↔ B 相互依赖为例，逐步跟踪：

```
① getBean("aService")
   → 一级缓存未命中，开始创建 A

② createBeanInstance(A)          ← A 已实例化，但属性未填充
   → addSingletonFactory("aService", () -> getEarlyBeanReference("aService", A))
   → 三级缓存中放入 A 的 ObjectFactory
   → 此时 A 是一个"空壳"（bService 字段还是 null）

③ populateBean(A)                ← 填充 A 的属性，发现需要 B
   → getBean("bService")

④ getBean("bService")
   → 一级缓存未命中，开始创建 B
   → createBeanInstance(B) → 三级缓存放入 B 的 ObjectFactory

⑤ populateBean(B)                ← 填充 B 的属性，发现需要 A
   → getBean("aService")
   → ① 一级未命中 → ② 二级未命中 → ③ 三级命中！
   → 调用 ObjectFactory.getObject() 拿到 A 的早期引用
   → A 的早期引用升级到二级缓存，三级缓存移除 A
   → B 拿到 A 的引用，populateBean(B) 完成

⑥ B 继续生命周期：初始化 → 后置处理 → 放入一级缓存
   → 此时 singletonObjects 中有 B

⑦ 回到步骤 ③，A 拿到 B（此时 B 已是完整对象）
   → populateBean(A) 完成

⑧ A 继续生命周期：初始化 → 后置处理（可能在此生成 AOP 代理）
   → 放入一级缓存，从二级/三级缓存中移除 A
```

**关键观察**：B 持有的 A 引用是**早期引用**（可能是原始对象，也可能是代理），而 A 最终放入一级缓存的是**初始化完成后的完整对象**。这正是下面两个问题的根源。

## 四、为什么必须是三级，两级够不够

这是最有价值的一问。**答案：取决于是否需要 AOP 代理。**

### 情形一：不需要代理（无 AOP）

如果 A 没有被任何切面增强，那么"提前暴露的原始对象"和"最终放入一级缓存的对象"**是同一个引用**。此时**二级缓存就足够**：

```
三级缓存的作用退化为：直接暴露原始对象即可
```

### 情形二：需要 AOP 代理

如果 A 需要被 AOP 增强（如 A 上有 `@Transactional`），就出现矛盾：

- A 的代理对象在**初始化阶段的后置处理**才生成（`postProcessAfterInitialization`）；
- 但 B 在**属性填充阶段**就需要拿到 A 的引用；
- 如果此时暴露的是**原始对象**，B 持有的就是原始对象，而容器里最终是代理对象——**B 拿到了"假 A"，AOP 增强对 B 完全失效**。

三级缓存的解法：**存入的不是对象，而是一个工厂 `ObjectFactory`**，把"要不要生成代理"这个决策**推迟到真正被需要的那一刻**：

```java
// AbstractAutowireCapableBeanFactory#getEarlyBeanReference
protected Object getEarlyBeanReference(String beanName, RootBeanDefinition mbd, Object bean) {
    Object exposedObject = bean;
    if (!mbd.isSynthetic() && hasInstantiationAwareBeanPostProcessors()) {
        for (SmartInstantiationAwareBeanPostProcessor bp : getBeanPostProcessorCache().smartInstantiationAware) {
            exposedObject = bp.getEarlyBeanReference(exposedObject, beanName);   // ← AOP 在此生成早期代理
        }
    }
    return exposedObject;
}
```

`AbstractAutoProxyCreator.getEarlyBeanReference()` 会在此刻生成代理，并把它登记到 `earlyProxyReferences` 中——**这样后续在 `postProcessAfterInitialization` 阶段就跳过一次重复代理**（见上一节 `postProcessAfterInitialization` 源码中的 `earlyProxyReferences.remove(cacheKey) != bean` 判断）。

**因此三级缓存解决的是两个问题：**

| 问题 | 只用二级缓存会怎样 |
|---|---|
| **保证代理对象只创建一次** | 提前暴露时创建一次代理，初始化后又创建一次，产生两个不同代理实例 |
| **保证注入的是代理而非原始对象** | B 持有原始对象，AOP（事务、缓存等）对 B 完全失效 |

一句话总结：**`singletonFactories` 存的是"决策延迟器"，不是对象本身。这让"是否需要代理"可以在被依赖的那一刻才决定，从而保证全容器持有的都是同一个（代理）对象。**

## 五、三种循环依赖与可行性

| 类型 | 能否解决 | 原因 |
|---|---|---|
| **单例 + Setter/字段注入** | ✅ 可以 | 实例化与属性填充分离，可在填充前暴露早期引用 |
| **单例 + 构造器注入** | ❌ 不可以 | 构造器参数必须在实例化时确定，**没有"提前暴露"的时机**——实例都还不存在 |
| **Prototype 作用域** | ❌ 不可以 | 原型 Bean 不缓存，无法提供早期引用；Spring 直接抛 `BeanCurrentlyInCreationException` |
| **`@Async` 方法造成的循环** | ❌ 通常不行 | 需代理的 Bean 在早期引用阶段就要确定代理，容易触发提前初始化 |

**构造器注入循环依赖的三种解法**：

```java
@Service
public class AService {
    private final BService bService;

    // ① @Lazy：注入一个代理占位，真正调用时才解析目标
    public AService(@Lazy BService bService) { this.bService = bService; }
}
```

```java
// ② 改为 Setter/字段注入（不推荐，只为兼容遗留代码）
@Autowired private BService bService;
```

```java
// ③ 重构：引入第三个类抽离共同依赖，或调整职责边界（真正的解法）
```

**第 ③ 种才是工程上正确的答案**。循环依赖通常意味着职责划分有问题——面试中给出这个判断，比列举技术绕过手段更有说服力。

## 六、Spring Boot 2.6+ 的默认变化

Spring Boot 2.6 起**默认禁止循环依赖**：

```yaml
# 需显式开启才能允许（不推荐）
spring:
  main:
    allow-circular-references: true
```

背景是 Spring Framework 5.3.17 引入了这个开关，理由是**循环依赖往往是设计问题的信号**。升级到 Boot 2.6+ 后启动报错的应对顺序建议为：

1. **优先重构**——理清依赖方向，把双向依赖改为单向，或抽离出共享的第三方组件；
2. 次选 `@Lazy`——在依赖注入点上延迟解析；
3. 最后才考虑全局开启开关（并在代码评审中标记为技术债）。

## 七、常见误区澄清

**误区一："三级缓存是为了性能，二级缓存不够快"。**
不是。三级缓存解决的是**代理对象的语义一致性**问题，与性能无关。若只考虑性能，一级缓存就够了。

**误区二："二级缓存的存在是因为三级缓存的对象需要缓存"。**
这个说法只对了一半。二级缓存的直接作用是**避免同一个 Bean 被多次调用 `ObjectFactory`**（否则每次依赖注入都会触发一次工厂调用，可能生成多个代理实例）。它本质是三级缓存的"缓存结果"。

**误区三："循环依赖被解决了，说明这样写没问题"。**
能被解决 ≠ 应该这样写。循环依赖意味着类之间职责边界不清，会导致可测试性下降、AOP 行为难以预测（注入的是代理还是原始对象取决于创建顺序）、维护成本上升。**Spring 容忍它是为了兼容存量，不是鼓励这种设计。**

**误区四："`@Lazy` 真正解决了循环依赖"。**
`@Lazy` 只是**把问题推迟到调用时**——注入的是一个代理，首次调用才真正解析目标 Bean。如果两个 Bean 在运行期互相调用形成无限递归，`@Lazy` 什么也解决不了。它是症状缓解，不是病因治疗。

## 八、面试问答

**Q1：Spring 如何解决循环依赖？**

通过**三级缓存 + 提前暴露引用**。创建 A 时，在实例化完成后立刻把 A 的 `ObjectFactory` 放入三级缓存 `singletonFactories`，然后才去填充属性；填充时发现需要 B，转而创建 B；B 填充属性时又需要 A，此时从三级缓存取出工厂拿到 A 的早期引用（注入给 B），B 得以完成并放入一级缓存；A 随后拿到完整的 B 完成填充，走完生命周期后放入一级缓存。

**Q2：为什么需要三级缓存？两级不行吗？**

**关键在 AOP 代理**。如果 A 需要被增强，其代理对象在初始化后才生成，但 B 在属性填充阶段就要拿到 A。如果三级缓存直接存原始对象，B 拿到的就是原始对象，导致 A 上的事务/缓存等增强对 B 完全不生效，且可能存在两份代理实例。

三级缓存存的是 `ObjectFactory`——**把"是否生成代理"的决策延迟到被依赖的那一刻**，从而保证全容器拿到的都是同一个代理对象。如果项目里完全没有 AOP，理论上二级缓存就够用。

**Q3：构造器注入的循环依赖为什么无法解决？**

因为**构造器参数必须在实例化时确定**，而三级缓存是在"实例化完成之后"才能存入的。构造器循环依赖连"实例化的时机"都排不出来——A 要构造就要先拿到 B，B 要构造又要先拿到 A，形成无解的先后顺序依赖。字段/Setter 注入之所以可以解决，正是因为"实例化"和"属性填充"被拆分成了两步，中间留出了暴露早期引用的窗口。

**Q4：三级缓存中的对象是什么状态？**

半成品——**已完成实例化，但尚未填充属性和执行初始化**。字段还是默认值（null / 0）。因此如果此时通过早期引用调用了它的方法，可能读到 null 字段导致 NPE。**这也是为什么"在构造函数中调用依赖 Bean 的方法"是危险操作**。

**Q5：为什么 `@Async` 和循环依赖容易冲突？**

`@Async` 需要 AOP 代理，而代理在早期引用阶段就要确定。如果一个被 `@Async` 代理的 Bean 参与循环依赖，Spring 可能被迫提前完成它的初始化以确定代理类型，从而打破"先实例化、后填充"的窗口，导致 `BeanCurrentlyInCreationException`。规避方式：避免在同一个 Bean 上同时使用 `@Async`（或其它的强制代理特性）与循环依赖注入，或用 `@Lazy` 延迟解析。

**Q6：Spring Boot 2.6 之后为什么默认禁止循环依赖？**

官方立场是**循环依赖应当被视为设计缺陷**。它可以被框架"兜住"，但代价是：AOP 行为不确定（注入代理还是原始对象取决于 Bean 创建顺序）、可测试性差（无法单独实例化）、启动期报错信息更难定位。默认禁止是把这个隐性问题显式化，逼迫开发者正视依赖结构。合理应对顺序是：**重构 > `@Lazy` > 全局开关**。
