---
order: 6
date: 2026-09-11
---

# 组合模式（Composite）

## 一、问题场景

树形结构在业务里无处不在：组织架构、菜单权限、商品类目、多级审批、文件目录、评论盖楼、SQL 条件树。

处理树形结构时，调用方通常会陷入**两套逻辑分支**：

```java
// 反例：调用方必须区分"叶子"和"容器"，递归里到处是 if
public int countMembers(Object node) {
    if (node instanceof Department) {
        int total = ((Department) node).getDirectCount();
        for (Object child : ((Department) node).getChildren()) {
            total += countMembers(child);       // 递归
        }
        return total;
    } else if (node instanceof Employee) {
        return 1;
    }
    throw new IllegalArgumentException("未知节点类型");
}
```

每一处要处理树的地方，都要重复写这段"类型判断 + 递归"。一旦新增节点类型（比如"虚拟部门"），所有递归方法都要改。

组合模式的解法：**让叶子节点和容器节点实现同一个接口**，调用方统一对待，递归的差异被封装在节点内部。

## 二、结构与角色

```
                  ┌──────────────────┐
                  │    Component     │  ← 统一接口：叶子与容器共同实现
                  │ + show()         │
                  │ + count()        │
                  └────────┬─────────┘
             ┌─────────────┴──────────────┐
      ┌──────┴──────┐              ┌──────┴────────┐
      │    Leaf     │              │   Composite   │
      │ + count()   │              │ - children[]  │  ← 容器：持有子节点列表
      └─────────────┘              │ + add()       │
                                   │ + count()     │  ← 递归汇总
                                   └───────┬───────┘
                                           │ 组合（可包含 Leaf 或其他 Composite）
                                           └──▶ 形成树
```

| 角色 | 职责 |
|---|---|
| Component | 为叶子与容器声明的统一接口 |
| Leaf | 叶子节点，无子节点，实现基本行为 |
| Composite | 容器节点，持有子节点集合，**实现中递归调用子节点** |

**核心机制**：`Composite.count()` 内部遍历 `children` 并调用 `child.count()`。由于 `child` 的静态类型是 `Component`，**递归不需要任何类型判断**——这是组合模式最优雅的地方。

## 三、实现

以组织架构为例（部门可包含子部门与员工）：

```java
public abstract class OrgNode {                       // Component
    protected final String name;
    protected final String id;

    protected OrgNode(String id, String name) { this.id = id; this.name = name; }

    public abstract int memberCount();                // 统一能力
    public abstract void print(String indent);        // 统一能力
}

public class Employee extends OrgNode {               // Leaf
    public Employee(String id, String name) { super(id, name); }

    @Override public int memberCount() { return 1; }

    @Override public void print(String indent) {
        System.out.println(indent + "- 员工: " + name);
    }
}

public class Department extends OrgNode {             // Composite
    private final List<OrgNode> children = new ArrayList<>();

    public Department(String id, String name) { super(id, name); }

    public void add(OrgNode node)    { children.add(node); }
    public void remove(OrgNode node) { children.remove(node); }

    @Override
    public int memberCount() {
        int total = 0;
        for (OrgNode child : children) {
            total += child.memberCount();             // 递归，无类型判断
        }
        return total;
    }

    @Override
    public void print(String indent) {
        System.out.println(indent + "+ 部门: " + name + "（" + memberCount() + " 人）");
        for (OrgNode child : children) {
            child.print(indent + "  ");
        }
    }
}
```

客户端使用——**对整棵树和单个节点用同一套代码**：

```java
Department root = new Department("D0", "集团总部");
Department dev  = new Department("D1", "研发中心");
dev.add(new Employee("E1", "张三"));
dev.add(new Employee("E2", "李四"));

Department sub = new Department("D11", "平台组");
sub.add(new Employee("E3", "王五"));
dev.add(sub);

root.add(dev);
root.add(new Employee("E9", "总经理"));

System.out.println(root.memberCount());   // 5，一行搞定，无需判断节点类型
root.print("");
```

## 四、透明组合 vs 安全组合

`add()` / `remove()` 这两个方法放在哪一层，是组合模式唯一需要设计决策的地方：

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| **透明组合** | 在 `Component` 中声明 `add`/`remove`，叶子提供空实现或抛异常 | 客户端可统一对待所有节点，完全透明 | 叶子拥有无意义的方法，**违反接口隔离原则** |
| **安全组合** | 只在 `Composite` 中声明 `add`/`remove` | 接口干净，叶子没有多余方法 | 客户端必须区分类型才能调用 `add`，**牺牲透明性** |

**推荐安全组合**（上方示例即此方案）：因为"往员工下面加子节点"本身就是非法操作，让它在编译期就不可能出现，比运行时抛异常更好。

## 五、源码剖析

### 5.1 MyBatis 动态 SQL：`SqlNode` 树

`<if>` / `<foreach>` / `<choose>` 在启动时被解析成一棵 `SqlNode` 树——这是组合模式在整个 Java 生态里最完整的一次应用：

```
MixedSqlNode           ← Composite：持有 List<SqlNode> contents
├── StaticTextSqlNode  ← Leaf：纯文本片段
├── IfSqlNode          ← Composite（带条件）：test 成立才把请求转发给子节点
│   └── StaticTextSqlNode
├── ForEachSqlNode     ← Composite（带循环）：对集合每个元素重复应用子节点
│   └── ...
└── TextSqlNode        ← Leaf：含 ${} 占位符的文本
```

容器 `MixedSqlNode` 的 `apply` 就是标准递归：

```java
public class MixedSqlNode implements SqlNode {
    private final List<SqlNode> contents;

    @Override
    public boolean apply(DynamicContext context) {
        contents.forEach(node -> node.apply(context));   // 递归，无类型判断
        return true;
    }
}
```

**与教科书写法的三处差异：**

1. **统一接口里放的不是「业务能力」，而是一个「传递上下文」的方法。** 教科书示例通常是 `count()` / `print()` 这类返回结果的方法；`SqlNode` 只有一个 `apply(DynamicContext)`——**接口的职责是「让递归能走下去」，结果被累积进 `context`**。设计组合接口时不要把「聚合结果」写进签名，否则容器的实现会很别扭。
2. **容器可以有条件地转发。** `IfSqlNode#apply` 先算 `expressionEvaluator.evaluateBoolean(test, context.getBindings())`，为假时**直接返回、不遍历子节点**。教科书里 Composite 是无条件遍历，真实容器常常是「有条件遍历」。
3. **叶子的数量远多于容器。** `SqlNode` 的实现里只有 `MixedSqlNode` / `ForEachSqlNode` 算容器，其余全是叶子——**组合模式的维护成本主要花在叶子族的扩张上**。

> **模式边界提醒**：这棵树同时是本站[解释器模式](/java/design-patterns/behavioral/interpreter)的主例。同一份代码，「统一递归处理」是组合视角，「按语法规则求值」是解释器视角——**两个模式在真实代码里经常重合**，判据是你看重它的结构还是它的求值语义。

### 5.2 `java.io.File`：一个类同时是叶子和容器

`File` 没有 `Leaf` / `Composite` 之分——同一个类，`isDirectory()` 为真时它就是容器：

```java
File dir = new File("/tmp");
File[] children = dir.listFiles();        // 容器能力
```

这看起来是「透明组合」的极致，但它**并不是完整的组合模式**，缺的正是最核心的一环：

| 判据 | 组合模式的要求 | `File` |
|---|---|---|
| 叶子与容器同一接口 | ✅ | ✅ 一个类兼任两种角色 |
| **行为统一** | 递归封装在容器的方法内部 | ❌ `listFiles()` 只返回一层，**递归由调用方自己写** |

**所以 `File` 是「树形数据结构」，不是组合模式。** 判断一个树状 API 有没有用组合模式，只看一件事：**递归是封装在节点里，还是暴露给调用方**。前者是模式，后者只是数据结构。

`Files.walkFileTree(path, visitor)` 是 JDK 里更接近组合形态的版本——递归被收进 `FileTreeWalker`，调用方只实现 `visitFile` / `postVisitDirectory`（这也正是[访问者模式](/java/design-patterns/behavioral/visitor)的用法）。

### 5.3 Jackson 的 `JsonNode`：为什么它反而选了「透明组合」

本站第四节推荐的是「安全组合」（`add` / `remove` 只声明在容器上）。但 Jackson 恰恰相反：

```java
public abstract class JsonNode {
    public JsonNode get(int index) { return null; }        // 叶子也实现，返回 null
    public JsonNode get(String fieldName) { return null; }
}

public class ObjectNode extends JsonNode {                 // Composite
    public ObjectNode put(String fieldName, String v) { ... }
}

public class TextNode extends JsonNode {                   // Leaf
    ...
}
```

客户端拿到一个 `JsonNode` 时**无法从类型上知道它是容器还是叶子**，所以只能在基类上声明 `get()`、用 `elements()` 统一遍历（叶子返回空迭代器）。

**这不是设计失误，而是「调用方信息不足」的必然结果。** JSON 是通用数据格式，处理它的代码拿到的永远是 `JsonNode`；如果 `put` 只声明在 `ObjectNode` 上，每个调用点都要先 `instanceof` 一次——**透明组合的收益（免除类型判断）压过了接口污染的代价**。

于是「安全 or 透明」的判据可以写得比第四节更准确：

> **调用方能不能知道节点的具体类型？** 能（业务自己构建的树，如组织架构）→ 用安全组合，让非法操作在编译期就消失；不能（通用格式解析、插件式扩展点）→ 用透明组合，把判断推迟到运行时。

---

## 六、优缺点

**优点**

1. 统一对待叶子与容器，**消除调用方的类型判断分支**；
2. 递归结构被封装在节点内部，客户端代码极简；
3. 新增节点类型只需实现 `Component`，符合开闭原则；
4. 树形结构的遍历、汇总、渲染都能用同一套接口表达。

**缺点**

1. **接口被"泛化"**——`Component` 中的方法对某些节点没有意义（如叶子的 `add`），设计上需要权衡；
2. 树过深时递归可能栈溢出（需要改成显式栈迭代）；
3. 节点数量大时，每次都从头递归计算会有性能问题（需配合缓存，见下节）。

## 七、工程中的关键权衡

组合模式在真实系统里的难点不是结构，而是**性能与存储形态**——这两点面试常被追问：

### 7.1 递归计算 vs 缓存

`root.memberCount()` 每次都遍历全树。组织架构上万人时，频繁调用会成为瓶颈。常见解法：

- **在容器节点缓存汇总值**，子节点变化时向上冒泡更新（写少读多时最优）；
- **读多写多的场景**改用异步预计算 + 结果表（本质是把递归计算从查询路径移到离线路径）；
- 对超深树（层级 > 10）考虑**路径枚举**（`path = /D0/D1/D11/`）配合前缀查询替代递归。

### 7.2 内存树 vs 数据库树

组合模式描述的是**内存中的对象结构**，而数据通常存在关系库里。两种映射方式的取舍：

| 存储方案 | 结构 | 查询子树 | 移动子树 | 适用 |
|---|---|---|---|---|
| `parent_id` 邻接表 | 一列指向父节点 | 需递归（或 `WITH RECURSIVE`） | 改一行 | 写多、深度浅 |
| 路径枚举 `path` | 存全路径串 | `LIKE '/D0/D1/%'` 一次查出 | 批量更新前缀 | 读多、深度固定 |
| 闭包表 | 单独存祖先-后代关系 | JOIN 一次查出 | 需重算关系行 | 读极多写少 |

组合模式与这三种存储方案是正交的：**对象结构用组合模式表达，持久化方案按读写比例另选。**

## 八、使用场景

- **组织架构 / 部门树**：人员统计、权限继承、汇报线；
- **菜单与权限树**：前端菜单渲染、后端权限校验（父子节点权限传递）；
- **多级审批流**：审批节点树，支持条件分支与并行网关；
- **商品类目树**：类目属性继承、类目下商品数汇总；
- **文件系统 / 目录**：`java.io.File` 的 `listFiles()` 本身就是组合结构；
- **表达式树 / SQL 条件树**：`AND`/`OR` 节点组合叶子条件（与[解释器模式](/java/design-patterns/behavioral/)配合）。

## 九、面试问答

**Q1：组合模式的核心价值是什么？**
**让客户端统一处理单个对象和对象组合。** 叶子和容器实现同一接口，递归逻辑封装在容器内部，调用方不需要写 `instanceof` 判断和显式递归。本质是用多态替代类型分支。

**Q2：透明组合和安全组合的区别？**
`add`/`remove` 声明在 `Component`（透明）还是只声明在 `Composite`（安全）。透明组合让客户端一视同仁，但叶子被迫实现无意义方法，违反接口隔离；安全组合接口更干净，但客户端需要区分类型。**工程中一般选安全组合。**

**Q3：组合模式和递归有什么关系？**
组合模式是**递归结构在对象模型上的表达**：容器的行为定义为"对每个子节点调用相同行为，再合并结果"。它能避免显式递归中的一个常见错误——漏掉对子容器的处理。对超深树要注意栈溢出，可改为显式栈迭代。

**Q4：组合模式和装饰者模式都用到"持有同类型对象"，区别在哪？**
目的与结构都不同。装饰者通常是**链式**（单子节点，逐层增强，深度 = 装饰层数）；组合是**树形**（多子节点，分层聚合，节点数可任意）。装饰者改变行为，组合改变结构。

**Q5：树的性能怎么优化？**
三个方向：① **缓存汇总值**——写时向上冒泡更新，读时 O(1)；② **存储换算法**——用路径枚举或闭包表把递归查询变成范围查询；③ **异步预计算**——把耗时的递归汇总搬到离线任务，查询只读结果表。选择依据是**读写比例与树的深度**。
