---
date: 2026-09-15
title: 注解：从编译期到运行期
sidebar: 注解
desc: 注解编译后到底是什么、五个元注解的作用、保留策略决定谁能读到它、注解处理器与运行期反射两条路线的分工，以及 JDK 23 之后 javac 默认不再自动跑注解处理器这个新坑
order: 6
---

# 注解：从编译期到运行期

几乎每个 Java 开发者每天都在写注解，但「注解到底是什么」这个问题能答准的人不多。最常见的错误认知是「加上注解就有功能」——**注解本身只是一个标记，它不产生任何行为**。真正干活的是**读它的那个东西**：可能是编译器、可能是注解处理器、可能是字节码增强工具、也可能是运行期的反射。

这一篇就按「**谁在读它**」这条线索把注解讲透。

## 一、注解的本质：一个带标记的接口 {#what-is-annotation}

先把最反直觉的一点说清：**注解在编译之后就是一个接口**。

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface Loggable {
    String value() default "";
    int level() default 1;
}
```

用 `javap -v` 反编译它对应的 class 文件，会看到一个：

```java
public interface Loggable extends java.lang.annotation.Annotation {
    public abstract String value();
    public abstract int level();
}
```

**注解的元素被编译成了抽象方法**，注解的使用处（比如 `@Loggable("x")`）在字节码里是作为**属性（RuntimeVisibleAnnotations）**挂在被标注的元素上的。由此推出注解的四条语法限制：

| 限制 | 原因 |
|---|---|
| 元素只能有类型，**不能有参数** | 它是接口方法，但不需要实现（由 JVM 动态实现代理） |
| 返回值类型受限：**基本类型、`String`、`Class`、枚举、注解、以及它们的数组** | 这些类型能直接编码进 class 文件的常量池 |
| 不能继承别的注解 | 接口单继承给了 `Annotation`，继承位已被占用（语义上的「注解继承」要靠框架实现，见第五节） |
| 不能 `new`、不能抛异常、不能有方法体 | 它不是普通类，实例由 JVM 代理生成 |

**「注解不产生行为」这句话的三个推论**（这是本节最该带走的）：

1. 自定义了一个注解但没写「读它」的代码 → **什么都没发生**。这是新手最常困惑的点。
2. `@Retention` 决定了**谁能读到它**，读不到就等于没写。
3. 框架的「魔法」全部来自「读注解 + 做点什么」，没有例外。理解 Spring 的过程本质上是搞清楚**哪个阶段读了哪些注解**。

## 二、五个元注解：用注解来修饰注解 {#meta-annotation}

| 元注解 | 作用 | 默认值 |
|---|---|---|
| `@Retention` | 注解保留到哪个阶段 | **`RetentionPolicy.CLASS`** |
| `@Target` | 能标注在哪些位置 | 未指定时可用于除类型参数外的所有声明位置 |
| `@Inherited` | 是否随**类继承**传递 | 否 |
| `@Documented` | 是否出现在 javadoc 里 | 否 |
| `@Repeatable` | 是否可在同一位置重复标注（JDK 8+） | 否 |

`@Retention` **默认是 `CLASS` 而不是 `RUNTIME`**，这是自定义注解最经典的一个坑：写了一个注解想用反射读，结果永远读到 `null`——就是因为忘了写 `@Retention(RUNTIME)`。

`@Target` 的常用取值（JDK 8 扩充了后两个，JDK 9 加了 `MODULE`，JDK 16 加了 `RECORD_COMPONENT`）：

| 取值 | 位置 |
|---|---|
| `TYPE` | 类、接口、枚举、注解 |
| `FIELD` | 字段（含枚举常量） |
| `METHOD` | 方法 |
| `PARAMETER` | 方法/构造器参数 |
| `CONSTRUCTOR` | 构造器 |
| `LOCAL_VARIABLE` | 局部变量 |
| `ANNOTATION_TYPE` | 注解类型本身（元注解用这个） |
| `PACKAGE` | 包声明 |
| `TYPE_PARAMETER` | 类型参数（`<@NonNull T>`，JDK 8+） |
| `TYPE_USE` | 类型使用处（`List<@NonNull String>`，JDK 8+） |
| `MODULE` | 模块声明（JDK 9+） |
| `RECORD_COMPONENT` | record 组件（JDK 16+） |

`@Inherited` 的语义比多数人以为的窄，两点必须说清：

- **只对「类继承」有效，对接口实现无效**。子类不会「继承」到从接口上来的注解。
- **只影响 `getAnnotations()`**，不影响 `getDeclaredAnnotations()`。即：反射能查到父类上带 `@Inherited` 的注解，但查不到「自己声明的」。

```java
@Inherited @Retention(RUNTIME) @interface Tagged {}

@Tagged class Base {}
class Sub extends Base {}

Sub.class.getAnnotation(Tagged.class);            // 非 null —— @Inherited 生效
Sub.class.getDeclaredAnnotations().length;        // 0      —— 自己没声明
```

`@Repeatable` 的机制值得单独讲：**Java 不允许同一个注解在同一位置出现两次**，`@Repeatable` 是靠「容器注解」实现的语法糖：

```java
@Repeatable(Schedules.class)
@interface Schedule { String cron(); }

@interface Schedules { Schedule[] value(); }     // 容器注解，必须叫 value()
```

编译器会把 `@Schedule(...) @Schedule(...)` 自动包装成 `@Schedules({...})`。**代价是读取方式变了**：反射里 `getAnnotation(Schedule.class)` 拿不到（因为实际挂的是容器），必须用 **`getAnnotationsByType(Schedule.class)`**——它会自动展开容器。这是「可重复注解为什么读不到」的标准答案。

## 三、保留策略决定「谁」能读到它 {#retention}

这一节是理解整个注解体系的关键：**三个阶段，三种读取者，三种典型用途**。

| `@Retention` | 存在于哪里 | 谁读得到 | 典型注解 |
|---|---|---|---|
| **`SOURCE`** | 只在源码，编译后**消失** | 编译器、注解处理器 | `@Override`、`@SuppressWarnings`、Lombok 的 `@Data`、各类代码生成注解 |
| **`CLASS`** | 类文件中，但**不被 JVM 加载进内存** | 字节码工具（ASM / ByteBuddy / Javassist） | 部分 AOP、字节码增强框架的标记 |
| **`RUNTIME`** | 类文件中，且**被 JVM 保留** | **运行期反射** | Spring 的 `@Component`/`@Autowired`、JUnit 的 `@Test`、Jackson 的 `@JsonProperty`、MyBatis 的 `@Select` |

三个值得记住的判断：

- **为什么 `@Override` 是 `SOURCE`**：它的价值**只在编译期**——让编译器检查「这里真的重写了父类方法吗」。编译完成后没有任何人需要它，保留到运行期纯属浪费。`@SuppressWarnings` 同理。
- **`CLASS` 是最尴尬的一档**：默认值，但「不是 `SOURCE`（所以会进 class 文件）、又不是 `RUNTIME`（所以反射读不到）」。如果没有任何字节码工具在处理它，它等同于不存在。**因此自定义注解基本只有两个合理选择：`SOURCE`（给 APT 或编译器用）或者 `RUNTIME`（给反射用）。**
- **Lombok 属于 `SOURCE` 档**：它在编译期读注解、直接修改抽象语法树（AST），把 `@Data` 展开成 getter/setter/构造器/`equals`/`hashCode`，然后注解本身被丢掉。这也解释了**为什么 Lombok 升级 JDK 容易不兼容**——它用的是编译器内部 API，不是标准的注解处理器接口。

## 四、编译期增强：注解处理器（APT） {#apt}

注解处理器（Annotation Processing Tool）让注解能**在编译期生成新的源码**。它是很多「零反射」框架的实现方式。

```java
@SupportedAnnotationTypes("com.example.Builder")
@SupportedSourceVersion(SourceVersion.RELEASE_17)
public class BuilderProcessor extends AbstractProcessor {
    @Override
    public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment env) {
        for (Element e : env.getElementsAnnotatedWith(Builder.class)) {
            // 通过 Filer 生成新的 .java 源文件，它会参与后续编译
            try {
                JavaFileObject f = processingEnv.getFiler()
                        .createSourceFile(e.toString() + "Builder");
                // 写入生成的代码...
            } catch (IOException ex) { throw new UncheckedIOException(ex); }
        }
        return true;   // 声明已处理，避免其他处理器重复处理
    }
}
```

**运行机制的两个要点**：

- **多轮处理（Round）**：处理器生成的新源码会被再次编译，从而触发下一轮处理，直到没有新的源文件产生。所以「处理器生成的代码里再带注解」也能被处理，但要注意别写出无限生成。
- **`return true` 表示「已处理」**，会阻止后面的处理器再处理这些注解。

**APT 与运行期反射的分工**——这是面试里最能体现理解深度的一问：

| | 注解处理器（APT） | 运行期反射 |
|---|---|---|
| 时机 | **编译期** | 运行期 |
| 产物 | 生成新的源码/字节码 | 读取注解并执行逻辑 |
| 运行期开销 | **零**（生成的代码就是普通代码） | 有（反射查找 + 调用，见 [反射](/java/basics/reflection#performance)） |
| 对注解的保留策略要求 | `SOURCE` 或 `CLASS` 都能拿到 | **必须 `RUNTIME`** |
| 代表 | Lombok（走内部 AST）、MapStruct、Dagger、部分 IDE 插件 | Spring、JUnit、Jackson |
| 局限 | 无法读取运行期的动态信息（配置、环境变量） | 有性能与模块化访问限制 |

**⚠️ 一个很新的变化（容易踩坑）**：**从 JDK 23 起，`javac` 默认不再主动搜索并运行注解处理器**。原因是历史上的默认行为会「无意中扫到类路径上的处理器」，既慢又有隐患。要让处理器继续工作，必须显式声明，例如：

```bash
javac -proc:full ...
```

Maven 侧对应 `-Dmaven.compiler.proc=full`（较新版本的 compiler 插件已支持）。JDK 21/22 会打印一条提示告诉你这个行为即将改变。

**这意味着：用老版本构建工具 + 新 JDK 编译依赖 Lombok / MapStruct 的项目，可能突然发现生成的代码不见了。** 排查这类「升 JDK 后代码生成失效」的问题，就要想到这条改动。

## 五、运行期注解与组合注解 {#runtime}

### 5.1 反射读取的基本形态 {#read-api}

| API | 范围 |
|---|---|
| `getAnnotation(X.class)` | 单个注解，不存在返回 `null` |
| `getAnnotations()` | **包含**父类上带 `@Inherited` 的注解 |
| `getDeclaredAnnotations()` | **只含**自己声明的 |
| `getAnnotationsByType(X.class)` | 处理**可重复注解**，自动展开容器 |
| `isAnnotationPresent(X.class)` | 存在性判断 |

```java
Method m = UserService.class.getMethod("save", User.class);
if (m.isAnnotationPresent(Loggable.class)) {
    Loggable l = m.getAnnotation(Loggable.class);
    System.out.println(l.value() + " / " + l.level());
}
```

### 5.2 组合注解：Java 没有注解继承，框架自己造了一个 {#composed}

**Java 语言的注解是不支持继承的**——把一个注解标在另一个注解上，那个注解的语义**不会**自动传递过来。但你在 Spring 里天天用到这种「传递」：

```java
@SpringBootApplication         // 只看这一行，它凭什么能启动整个应用？
public class App { }
```

打开它的定义会发现：

```java
@SpringBootConfiguration
@EnableAutoConfiguration
@ComponentScan(excludeFilters = ...)
public @interface SpringBootApplication { /* ... */ }
```

`@SpringBootApplication` 自己什么都没做，它就是**三个注解的组合**（Spring 里叫「组合注解 / 元注解」，meta-annotation）。**这个「传递」是 Spring 自己实现的**，不是 Java 语言的能力：

- 读取时用 `AnnotationUtils.findAnnotation()` 或 `MergedAnnotations`，它们会**递归查找元注解**（注解 → 注解上的注解 → …），找到就返回。
- 属性还能「覆盖」：`@SpringBootApplication(scanBasePackages = "...")` 实际上是覆写了组合进来的 `@ComponentScan` 的属性，这叫**属性别名/合并**（`@AliasFor`）。

```java
// 自己写一个组合注解
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Loggable          // 把能力「组合」进来
public @interface AuditLog {
    String action() default "";
}
```

**三个必须知道的边界**：

1. **必须用框架的查找工具，不能直接用 JDK 的 `getAnnotation`**。`method.getAnnotation(Loggable.class)` 对上面这个 `@AuditLog` 返回 `null`——因为 JDK 只查直接标注。**这是「自定义组合注解不生效」的头号原因。**
2. **自己写的框架要自己实现递归查找**，JDK 没有现成 API。手写递归要注意处理循环（注解 A 标 B、B 标 A）。
3. **`@Inherited` 与组合注解是两件不相干的事**：前者管类的继承链，后者管注解之间的引用关系。

### 5.3 注解是怎么在 Spring 里生效的 {#spring-flow}

把「谁在读它」这条线索走完，就得到了 AOP 类注解的完整链路：

```
启动扫描阶段：ClassPathScanningCandidateComponentProvider
            读 @Component → 识别出 Bean → 反射实例化 → 读 @Autowired 完成注入
                    ↓
代理创建阶段：读 @Transactional / @Cacheable / 自定义切面注解
            → 匹配切点 → 为目标 Bean 生成代理（JDK 动态代理或 CGLIB）
                    ↓
调用阶段：    进入代理 → 执行切面逻辑 → 反射调用真实方法（剥 InvocationTargetException）
```

两个由这条链路直接推出来的结论：

- **注解不生效，先问「这一步有没有人读它」**：注解标在 `private` 方法或静态方法上 → 代理拦截不到（Spring AOP 只能拦公开、可覆盖的方法）；同类内部自调用 → 走 `this` 不走代理；Bean 不是由容器管理的（自己 `new` 的）→ 压根没经过扫描。这三条覆盖了绝大多数「注解失效」的工单。
- **`@Retention` 忘了写 `RUNTIME`**，就等于这一整条链路从一开始就读不到。

## 六、常见坑速查 {#pitfalls}

| 坑 | 现象 | 根因 |
|---|---|---|
| 自定义注解忘写 `@Retention(RUNTIME)` | 反射读出 `null` | `@Retention` 默认是 `CLASS`，JVM 不保留 |
| 只写了注解没写处理逻辑 | 完全没反应 | **注解本身不产生行为**，必须有人读它 |
| 组合注解用 JDK 的 `getAnnotation` 读 | 拿不到 | JDK 不查元注解，必须用 `AnnotationUtils` / `MergedAnnotations` |
| 可重复注解用 `getAnnotation` 读 | 返回 `null` | 实际挂的是容器注解，要用 `getAnnotationsByType` |
| 以为 `@Inherited` 对接口实现有效 | 子类查不到注解 | `@Inherited` 只作用于**类继承** |
| 注解标在 `private` / `static` 方法上希望被拦截 | 切面不执行 | Spring AOP 基于代理，拦不到非公开方法与静态方法 |
| 同类内部调用带注解的方法 | 事务/缓存不生效 | 自调用走 `this`，不经过代理（见 [反射](/java/basics/reflection#dynamic-proxy)） |
| 升级 JDK 23 后 Lombok / MapStruct 生成代码消失 | 编译成功但缺少生成类 | **JDK 23 起 `javac` 默认不搜索注解处理器**，需 `-proc:full` 或 `-Dmaven.compiler.proc=full` |
| Lombok 在某个 JDK 版本编译报错 | 编译器内部 API 变了 | Lombok 直接改 AST，依赖编译器实现细节 |
| 注解元素写了包装类或自定义对象 | 编译报错 | 元素类型仅限基本类型、`String`、`Class`、枚举、注解及其数组 |
| 注解里用数组默认值 | 收到共享的可变数组 | 不要修改从注解取到的数组（可能被共享） |

## 面试口径

- **注解的本质**：编译后是一个 `extends java.lang.annotation.Annotation` 的接口，元素变成抽象方法，使用处作为 `RuntimeVisibleAnnotations` 属性挂在字节码上。**注解本身不产生任何行为，必须有「读者」**——编译器、注解处理器、字节码工具、或运行期反射。
- **五个元注解**：`@Retention`（**默认 `CLASS`**）、`@Target`、`@Inherited`（只作用于类继承，且只影响 `getAnnotations()`）、`@Documented`、`@Repeatable`（靠容器注解 + `getAnnotationsByType` 读取）。
- **三种保留策略的分工**：`SOURCE` 给编译器与注解处理器（`@Override`、Lombok）——编译后消失；`CLASS` 只留给字节码工具（ASM/ByteBuddy），反射读不到，是「最尴尬的一档」；`RUNTIME` 才能被反射读取（Spring、JUnit、Jackson）。**自定义注解基本只在 `SOURCE` 与 `RUNTIME` 之间选。**
- **APT vs 反射**：APT 在**编译期**生成源码，运行期零开销，`SOURCE` 级别就能用，代表是 Lombok、MapStruct；反射在**运行期**读取并执行，要求 `RUNTIME`，代表是 Spring。**注意 JDK 23 起 `javac` 默认不再自动运行注解处理器**，需显式 `-proc:full` / `-Dmaven.compiler.proc=full`——这是升级 JDK 后「生成代码消失」类故障的根因。
- **注解继承**：**Java 语言的注解不支持继承**。Spring 的 `@SpringBootApplication` 那种「组合注解」是框架用 `AnnotationUtils.findAnnotation` / `MergedAnnotations` **递归查元注解**实现的，还能用 `@AliasFor` 做属性覆写。**自己写组合注解必须用框架的查找 API，用 JDK 的 `getAnnotation` 一定拿不到。**
- **注解失效的排查顺序**（答这类问题要给出方法论，而不是列举）：① `@Retention` 是不是 `RUNTIME`；② 有没有人读它（框架是否扫描到这个类 / 这个位置）；③ 有没有被代理绕过（`private`、`static`、同类自调用、自己 `new` 的对象）。
- **为什么 Lombok 用 `SOURCE`**：它需要的信息（AST）只在编译期存在，产出是展开后的代码，注解本身没有保留价值；也因此它绑定编译器内部实现，JDK 升级容易不兼容。
