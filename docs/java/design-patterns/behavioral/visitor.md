---
order: 10
date: 2026-09-11
---

# 访问者模式（Visitor）

## 一、问题场景

有一组**稳定不变的对象结构**（如语法树的各类节点、文档的各种元素），却需要**频繁新增操作**（导出 PDF、导出 Excel、统计、校验、脱敏）：

```java
// 每新增一种导出格式，就要给所有节点类加方法
class TextNode {
    String renderPdf() { ... }
    String renderExcel() { ... }     // 每加一种格式，所有节点类都要改
    String renderHtml() { ... }
}
class ImageNode {
    String renderPdf() { ... }
    String renderExcel() { ... }
    String renderHtml() { ... }
}
```

问题在于：**变化的是"操作"（导出格式），稳定的却是"数据类型"（节点种类）**。把这些操作写进数据类，等于让数据结构承担了它不该承担的职责——每次新增格式，所有节点类都要重新编译、测试。

访问者模式的解法：**把"操作"从数据结构中抽出来，做成独立的访问者类；节点只提供 `accept(visitor)` 作为入口，把自己交回给访问者。**

## 二、结构与角色（含双分派）

```
┌────────────────┐   accept(visitor)   ┌────────────────────┐
│ «interface»    │◀────────────────────│   «interface»      │
│    Element     │                     │      Visitor       │
│ + accept(v)    │─────────────────────▶│ + visit(TextNode)  │
└───────┬────────┘   回调 visit()      │ + visit(ImageNode) │
        │ 实现                          │ + visit(TableNode) │
┌───────┴──────┐                       └─────────┬──────────┘
│ TextNode     │                                 │ 实现
│ ImageNode    │                       ┌─────────┴─────────┐
│ TableNode    │                       │ PdfVisitor        │
└──────────────┘                       │ ExcelVisitor      │
                                       │ StatisticsVisitor │
                                       └───────────────────┘
```

| 角色 | 职责 |
|---|---|
| **Visitor（抽象访问者）** | 为每个具体元素类型声明一个 `visit` 重载方法 |
| **ConcreteVisitor** | 实现某个具体操作（导出 PDF、统计字数……） |
| **Element（抽象元素）** | 声明 `accept(Visitor)` |
| **ConcreteElement** | 实现 `accept`，调用 `visitor.visit(this)` 把自己传回去 |
| **ObjectStructure（对象结构）** | 元素集合，提供遍历入口（通常是 `List` + 组合模式） |

### 双分派——访问者的技术核心

理解访问者，必须理解**双分派（Double Dispatch）**：

```java
// 单分派：调用哪个方法只看"方法接收者"的运行时类型
element.accept(visitor);        // 第一次分派：由 element 的实际类型决定
                                //   → TextNode.accept() 还是 ImageNode.accept()？

// 双分派：再加一层，由 visitor 的实际类型决定走哪个重载
visitor.visit(this);            // 第二次分派：由 visitor 的实际类型决定
                                //   → visit(TextNode) 还是 visit(ImageNode)？
```

**关键在 `accept` 内部的 `visitor.visit(this)` 这一行**——`this` 的静态类型是具体节点类，因此 Java 的重载解析会精确选中对应的 `visit` 方法。这就是为什么元素类型和访问者类型**可以组合出 n × m 种行为，却不需要 n × m 个类或方法**。

Java 是单分派语言（重载在编译期解析），访问者模式用"两次方法调用"巧妙地模拟出了双分派。

## 三、代码实现

以文档导出为例：

```java
/** 抽象访问者：为每种元素类型声明一个 visit 重载 */
public interface DocVisitor {
    String visit(TextNode node);
    String visit(ImageNode node);
    String visit(TableNode node);
}
```

```java
/** 抽象元素 */
public interface DocElement {
    /** 接受访问者；由元素决定把自己交给访问者的哪个方法 */
    String accept(DocVisitor visitor);
}
```

```java
public class TextNode implements DocElement {
    private final String text;

    public TextNode(String text) { this.text = text; }
    public String getText() { return text; }

    @Override public String accept(DocVisitor visitor) { return visitor.visit(this); }
}

public class ImageNode implements DocElement {
    private final String url;
    private final int width;

    public ImageNode(String url, int width) { this.url = url; this.width = width; }
    public String getUrl() { return url; }
    public int getWidth() { return width; }

    @Override public String accept(DocVisitor visitor) { return visitor.visit(this); }
}
```

```java
/** 具体访问者 ①：导出 Markdown —— 新增格式只需新增一个类，节点类全部不动 */
public class MarkdownVisitor implements DocVisitor {
    @Override public String visit(TextNode n)  { return n.getText(); }
    @Override public String visit(ImageNode n) { return "![](" + n.getUrl() + ")"; }
    @Override public String visit(TableNode n) { return n.toMarkdown(); }
}

/** 具体访问者 ②：字数统计 —— 完全不同的操作，节点类依然不动 */
public class WordCountVisitor implements DocVisitor {
    @Override public String visit(TextNode n)  { return String.valueOf(n.getText().length()); }
    @Override public String visit(ImageNode n) { return "0"; }        // 图片不计字数
    @Override public String visit(TableNode n) { return String.valueOf(n.cellCount()); }
}
```

统一驱动：

```java
public class Document {
    private final List<DocElement> elements = new ArrayList<>();

    public void add(DocElement e) { elements.add(e); }

    /** 同一个结构，可以接不同访问者 */
    public String export(DocVisitor visitor) {
        return elements.stream()
            .map(e -> e.accept(visitor))
            .collect(Collectors.joining("\n"));
    }
}

// 使用
Document doc = new Document();
doc.add(new TextNode("设计模式"));
doc.add(new ImageNode("uml.png", 600));

String md = doc.export(new MarkdownVisitor());       // 换访问者 = 换操作
String count = doc.export(new WordCountVisitor());
```

**对比一下收益**：如果要支持 5 种元素 × 8 种操作，不用访问者需要 40 个方法散落在 5 个类里；用访问者只需 5 个 `accept` + 8 个访问者类，且新增操作时**元素类一行不改**。

## 四、对比辨析

### 4.1 访问者的"双刃剑"——开闭原则的两个方向

这是访问者模式最重要的认知：

| 变化方向 | 不用访问者 | 用访问者 |
|---|---|---|
| **新增操作**（如加导出格式） | ✗ 要改所有元素类 | ✓ 新增一个访问者类即可 |
| **新增元素类型**（如加 `VideoNode`） | ✓ 只改该类 | ✗ **所有访问者都要加 `visit` 重载** |

**访问者模式把"开闭"从"操作维度"换到了"元素维度"**：它在"操作易变、结构稳定"时收益巨大，在"结构也常变"时反而成为负担。**这是选择使用访问者的唯一判断标准。**

如果两个维度都在变，说明需要重新审视设计（通常意味着元素类型应该抽象成统一的属性集合，而不是各自成类）。

### 4.2 访问者 vs 迭代器

| 维度 | 迭代器 | 访问者 |
|---|---|---|
| 目的 | 遍历元素 | 对元素施加**类型相关**的操作 |
| 是否需要元素类型信息 | 不需要 | 必需（靠类型选 `visit` 重载） |
| 新增操作 | 不涉及 | 核心场景 |
| 组合方式 | 访问者内部可用迭代器遍历 | — |

### 4.3 访问者 vs 策略

- **策略**：一个算法在运行时可替换，**作用于单一类型**的上下文；
- **访问者**：一个操作**横跨多种类型**，需要按类型分派不同逻辑。

策略是"换算法"，访问者是"换操作 + 按类型分发"。

### 4.4 访问者的代价

| 代价 | 说明 |
|---|---|
| 破坏封装 | 元素需要暴露足够的状态供访问者读取（通常要加 getter） |
| 类数量增加 | 每个操作一个访问者类 |
| 结构变更成本高 | 新增元素类型牵动所有访问者 |
| 抽象复杂度 | 双分派不易理解，调试跳转层级深 |

## 五、源码剖析

上一节看的是**双分派的结构**；本节看**工业代码里那些叫 Visitor 的类，有几个真的是访问者**。哪些场景用了它，速查表在下一节——这里要回答两个问题：**真实实现为什么要加"链"和"钩子"，以及怎么一眼识破"名字叫 Visitor 但不是访问者"的类。**

### 5.1 ASM · `ClassVisitor`：访问者 + 转发链

ASM 是字节码操作库（Spring、CGLIB、Lombok 都间接用它）。它的核心抽象是访问者，但形态比 GoF 复杂：

```java
// 精简自 org.objectweb.asm.ClassVisitor
public abstract class ClassVisitor {
    protected ClassVisitor cv;                    // ① 下一个访问者

    public void visit(int version, int access, String name, String signature,
                      String superName, String[] interfaces) {
        if (cv != null) {
            cv.visit(version, access, name, signature, superName, interfaces);   // ② 转发
        }
    }

    public MethodVisitor visitMethod(int access, String name, String descriptor,
                                     String signature, String[] exceptions) {
        MethodVisitor mv = cv == null ? null
                : cv.visitMethod(access, name, descriptor, signature, exceptions);
        return mv == null ? null : new MyMethodVisitor(mv);    // ③ 包装后返回
    }
}
```

**结构差异**：ASM 的 `ClassVisitor` 是**访问者 + 责任链**的合体。两处与教科书不同：

1. **访问者持有"下一个访问者"并转发**。教科书里访问者是无状态的处理器，处理完就完；ASM 里每个访问者都可以**只处理关心的部分、其余转发给下一个**（如"只统计方法数"的访问者不必实现其余方法）。
2. **`visitMethod()` 返回的是包装过的子访问者**。注意第 ③ 行：它返回的不是原样透传的 `mv`，而是 `new MyMethodVisitor(mv)` —— **链的建立是通过返回值完成的**，而不是通过构造函数传入。这样做的收益是：子结构（方法）的处理也可以被逐层包装，形成"**类级 → 方法级 → 指令级**"的多层访问链。

**这条能给出一条规律**：**任何需要在"结构树的每个层级都插入处理逻辑"的场景，访问者都会自然演化出转发链。** 因为访问者的 `visitXxx()` 返回值恰好是"下一层的访问者"，这正是链式组装的天然接口。

### 5.2 JDK · `FileVisitor`：多出来的 pre/post 钩子与遍历控制

```java
// 精简自 java.nio.file.FileVisitor
public interface FileVisitor<T> {
    FileVisitResult preVisitDirectory(T dir, BasicFileAttributes attrs) throws IOException;
    FileVisitResult visitFile(T file, BasicFileAttributes attrs) throws IOException;
    FileVisitResult visitFileFailed(T file, IOException exc) throws IOException;
    FileVisitResult postVisitDirectory(T dir, IOException exc) throws IOException;      // ④ 退出时
}

// 返回值控制遍历走向
public enum FileVisitResult {
    CONTINUE,          // 继续
    TERMINATE,         // 全部终止
    SKIP_SUBTREE,      // 跳过当前目录的子树
    SKIP_SIBLINGS      // 跳过同级的后续节点
}
```

**结构差异**：这比 GoF 访问者多了两样东西——

1. **成对的进入/退出钩子**：`preVisitDirectory()` 与 `postVisitDirectory()`。为什么需要？因为**有些计算必须在子树处理完之后才能做**。典型例子是统计目录大小：进入目录时无法知道大小，必须等所有子文件都访问完（`postVisitDirectory`）才能汇总。**GoF 的 `visit(element)` 只能表达"访问到某个元素"，表达不了"离开一个容器"。**
2. **返回值控制遍历**：`SKIP_SUBTREE` / `SKIP_SIBLINGS` / `TERMINATE`。这也不是 GoF 访问者的能力——教科书里访问者只负责"处理"，不负责"要不要继续遍历"。

**这条同样能推广**：**当遍历本身有成本（要跳过某些分支）或需要"离开容器"的语义时，访问者必然进化出成对钩子 + 遍历控制。** 这两样东西在"只处理扁平集合"的场景里用不上，但在"处理树"的场景里是刚需。

### 5.3 Spring · `BeanDefinitionVisitor`：名字叫 Visitor，但不是访问者

```java
// 精简自 org.springframework.beans.factory.config.BeanDefinitionVisitor
public class BeanDefinitionVisitor {
    public void visitBeanDefinition(BeanDefinition beanDefinition) {
        visitParentName(beanDefinition);
        visitBeanClassName(beanDefinition);
        visitFactoryBeanName(beanDefinition);
        visitFactoryMethodName(beanDefinition);
        visitScope(beanDefinition);
        if (beanDefinition.hasPropertyValues()) {
            visitPropertyValues(beanDefinition.getPropertyValues());
        }
        // ...
    }

    protected void visitPropertyValues(MutablePropertyValues pvs) {
        PropertyValue[] pvArray = pvs.getPropertyValues();
        for (PropertyValue pv : pvArray) {
            Object newVal = resolveValue(pv.getValue());          // ⑤ 对每个值做解析
            if (!ObjectUtils.nullSafeEquals(newVal, pv.getValue())) {
                pvs.add(pv.getName(), newVal);
            }
        }
    }
}
```

**结构差异**：这个类的名字里带 Visitor，做的事也像"遍历一个结构并处理每个部分"，但**它不是 GoF 访问者模式**。判据只有一条——**有没有双分派**：

| 判据 | 教科书访问者 | `BeanDefinitionVisitor` |
|---|---|---|
| 元素是否提供 `accept(visitor)` | **有** | **没有** |
| 访问方法是否随元素类型分派 | 有（`visitConcreteElementA/B`） | 没有（`visitParentName` / `visitScope` 是**按字段**分的） |
| 增加元素类型的成本 | 要改所有访问者 | 不涉及（字段是固定的） |
| 增加操作的成本 | 加一个访问者类 | 加一个方法 |

它实际是**"对固定结构的逐字段处理"**——`BeanDefinition` 的字段是框架自己定义的、几乎不变的结构，没有"元素类型会增长"的问题。因此它既不需要双分派，也不需要 `accept()`。

**这条最有价值**：**框架代码里的 `Visitor` 常常只表示"遍历者"，不代表 GoF 访问者。** 判别标准永远是那两个问题——**谁发起分派（元素还是访问者）、元素类型会不会增长。** 用"类名里有 Visitor"去认模式，会在读框架源码时频繁误判。

### 5.4 什么时候该用，什么时候是反模式

访问者模式解决的是**表达式问题（Expression Problem）**的一个方向：

| 变化方向 | 用继承 + 多态 | 用访问者 |
|---|---|---|
| 增加**类型**（新子类） | **容易**（加一个类） | 困难（所有访问者都要加方法） |
| 增加**操作**（新算法） | 困难（所有子类都要改） | **容易**（加一个访问者类） |

所以访问者的**适用前提是"类型维度已经稳定、操作维度还在增长"**：

- ✅ **适合**：编译器 / 解释器的 AST（节点类型被语言规范固定，但分析趟数不断新增：类型检查、常量折叠、代码生成）、字节码处理（`ClassVisitor`）、文件树扫描。
- ❌ **反模式**：节点类型还在频繁新增的业务树（如还在迭代的表单结构、刚设计的规则引擎）。此时每加一个节点类型，都要回头改所有访问者——**访问者会把"加类型"的成本推到最高。**

**一句话收束**：访问者不是"更好的多态"，而是一次**押注**——**押"操作会不断新增，类型不会"**。押对了收益极大（ASM、编译器都建立在此之上），押错了就是灾难。**判断该不该用，只要问一句：这个结构的元素类型，还会变吗？**

## 六、使用场景与面试问答

### 典型场景

| 场景 | 元素 | 访问者 |
|---|---|---|
| 编译器 / 静态分析 | AST 节点（表达式、语句、声明） | 类型检查、代码生成、优化 |
| 字节码处理 | 类/字段/方法节点 | ASM `ClassVisitor`、`MethodVisitor` |
| Spring | `BeanDefinition` | `BeanDefinitionVisitor`（属性占位符解析） |
| 文档导出 | 文档元素 | PDF / Word / Markdown 导出器 |
| 报表统计 | 报表节点 | 汇总、校验、脱敏 |
| 规则引擎 | 规则 AST | 条件求值、可视化 |

ASM 框架是访问者模式的教科书级应用：`ClassReader.accept(ClassVisitor)` 遍历字节码，每种结构（类、字段、方法、注解）都对应一个 `visitXxx` 方法。**Java 生态中所有字节码操作、AST 处理类库都以访问者模式为骨架。**

### 面试问答

**Q1：什么是双分派？为什么访问者需要它？**

**单分派**指方法调用只根据"接收者的运行时类型"决定（Java 的实例方法）；**双分派**指方法的选择同时取决于"接收者类型"和"参数类型"。Java 是单分派语言（重载在编译期按静态类型解析），因此需要两次调用：第一次 `element.accept(visitor)` 由元素的运行时类型分派，第二次 `visitor.visit(this)` 由 `this` 的静态类型（即具体元素类）分派到正确的重载。

**没有双分派，就只能写出 `if (element instanceof TextNode)` 这样的类型判断**——这正是访问者要消除的东西。

**Q2：访问者模式破坏了开闭原则吗？**

**取决于你从哪个维度看**。对"新增操作"是开闭的（新增访问者类，元素类不动）；对"新增元素类型"是破坏的（所有访问者都要改）。所以它的适用前提非常明确：**对象结构稳定、操作频繁变化**。反过来说，如果元素类型经常增加，就不该用访问者。

**Q3：访问者模式和 instanceof + 强转有什么区别？**

本质逻辑相同（都是按类型分发行为），但访问者用**多态**替代了显式类型判断，带来三点收益：① **编译期类型安全**——新增元素类型时，未实现对应 `visit` 的访问者会编译报错，`instanceof` 则会被静默漏掉；② **职责分离**——元素类只保留数据与结构，操作集中在访问者；③ **避免顺序耦合**——不需要在中心化的 `if-else` 链里维护类型顺序。

**Q4：为什么访问者要在元素上暴露 getter，这不是破坏封装吗？**

是的，这是访问者的固有代价。设计上要控制暴露范围：只暴露访问者必需的数据，避免把可变引用直接暴露出去（否则访问者可以篡改元素状态，破坏不变式）。若元素状态敏感，可考虑把访问者放在同包内、或改用"元素主动把数据打包传给访问者"的方式。

**Q5：访问者模式在现代框架中还常用吗？**

在**编译器、字节码、AST、DSL 解析**领域是基础设施（ASM、JavaParser、Calcite、ANTLR 生成的 visitor 都是），因为那里"语法结构稳定、分析操作不断新增"的前提完全成立。在**业务系统**中较少直接使用——业务的数据结构和操作都在变，收益不成立。取而代之的是更轻量的方案：策略 + Map 分发、规则引擎、或者用函数式接口把"操作"作为参数传入。
