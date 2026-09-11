# 解释器模式（Interpreter）

## 一、问题场景

需要**为一种简单语言定义文法并求值**——例如一段自定义表达式、一条过滤规则、一个公式：

```
要求实现： ( 10 + 20 ) * 2 - 5
或者规则： age > 18 AND city = '深圳'
或者公式： 单价 * 数量 * (1 - 折扣率)
```

如果每种表达式都硬编码解析，代码会变成一连串 `if-else` 加字符串切割，无法扩展也无法组合。当表达式的文法规则数量有限、结构不复杂时，可以把**文法中的每一条规则表示为一个类**，用对象树来表达表达式，这就是解释器模式。

## 二、结构与角色

```
                    ┌────────────────────────┐
                    │ «abstract» Expression  │
                    │ + interpret(ctx)       │
                    └───────────┬────────────┘
                    ┌───────────┴───────────┐
                    ▼                       ▼
      ┌──────────────────────────┐  ┌───────────────────────────┐
      │ TerminalExpression       │  │ NonterminalExpression     │
      │ （终结符：变量/字面量）    │  │ （非终结符：运算符组合）    │
      │ + interpret(ctx)         │  │ - left / right            │
      └──────────────────────────┘  │ + interpret(ctx)          │
                                    └───────────────────────────┘
```

| 角色 | 职责 |
|---|---|
| **AbstractExpression（抽象表达式）** | 声明 `interpret(Context)` |
| **TerminalExpression（终结符表达式）** | 叶子节点，直接返回值（变量、常量） |
| **NonterminalExpression（非终结符表达式）** | 组合子表达式并求值（加、减、乘、除、与、或） |
| **Context（上下文）** | 存放解释器需要的全局信息（变量表、环境） |

**结构上是组合模式的孪生兄弟**——两者都用递归的对象树；区别在于解释器的每个节点**定义了求值语义**，而组合模式的节点定义的是"部分-整体"关系。

## 三、代码实现

实现一个支持加减乘除四则运算和括号的表达式求值器：

### 3.1 抽象表达式与终结符

```java
/** 上下文：变量表 */
public class Context {
    private final Map<String, BigDecimal> variables = new HashMap<>();

    public void set(String name, BigDecimal value) { variables.put(name, value); }

    public BigDecimal get(String name) {
        BigDecimal v = variables.get(name);
        if (v == null) throw new IllegalArgumentException("未定义变量: " + name);
        return v;
    }
}
```

```java
/** 抽象表达式 */
public interface Expression {
    BigDecimal interpret(Context ctx);
}
```

```java
/** 终结符 ①：数字字面量 */
public class NumberExpression implements Expression {
    private final BigDecimal value;

    public NumberExpression(BigDecimal value) { this.value = value; }

    @Override public BigDecimal interpret(Context ctx) { return value; }
}

/** 终结符 ②：变量 */
public class VariableExpression implements Expression {
    private final String name;

    public VariableExpression(String name) { this.name = name; }

    @Override public BigDecimal interpret(Context ctx) { return ctx.get(name); }
}
```

### 3.2 非终结符

```java
/** 非终结符：二元运算基类 */
public abstract class BinaryExpression implements Expression {
    protected final Expression left;
    protected final Expression right;

    protected BinaryExpression(Expression left, Expression right) {
        this.left = left;
        this.right = right;
    }
}

public class AddExpression extends BinaryExpression {
    public AddExpression(Expression l, Expression r) { super(l, r); }

    @Override public BigDecimal interpret(Context ctx) {
        return left.interpret(ctx).add(right.interpret(ctx));      // 递归求值
    }
}

public class MultiplyExpression extends BinaryExpression {
    public MultiplyExpression(Expression l, Expression r) { super(l, r); }

    @Override public BigDecimal interpret(Context ctx) {
        return left.interpret(ctx).multiply(right.interpret(ctx));
    }
}
```

### 3.3 构建表达式树

```java
Context ctx = new Context();
ctx.set("price", new BigDecimal("100"));
ctx.set("qty", new BigDecimal("3"));

// 构建： price * qty * 0.9
Expression expr = new MultiplyExpression(
    new MultiplyExpression(
        new VariableExpression("price"),
        new VariableExpression("qty")
    ),
    new NumberExpression(new BigDecimal("0.9"))
);

System.out.println(expr.interpret(ctx));    // 270.000
```

表达式树的结构：

```
        MultiplyExpression
        ├── MultiplyExpression
        │   ├── VariableExpression(price)
        │   └── VariableExpression(qty)
        └── NumberExpression(0.9)
```

**每新增一种运算，只需新增一个非终结符类**（如 `DivideExpression`），已有类不用改动。

### 3.4 现实中不会手写语法解析

上面的例子是**手工构建**表达式树。真实场景需要从字符串解析出树，这一步与解释器模式本身无关（属于词法/语法分析），实践中直接用成熟工具：

| 工具 | 用途 |
|---|---|
| **SpEL**（Spring Expression Language） | `@Value("#{...}")`、`@PreAuthorize("hasRole('ADMIN')")` |
| **Aviator / QLExpress** | 高性能表达式求值，风控规则、指标计算 |
| **ANTLR / JavaCC** | 生成词法+语法分析器，适合完整 DSL |
| **Drools / Easy Rules** | 规则引擎，适合复杂业务规则编排 |
| **JEXL / MVEL** | 轻量表达式语言 |

## 四、对比辨析

### 4.1 解释器 vs 组合模式

**结构完全相同，意图不同**：

| 维度 | 组合模式 | 解释器模式 |
|---|---|---|
| 树节点语义 | 部分-整体的层次关系 | 文法规则与求值语义 |
| 递归目的 | 统一对待单个与容器 | 递归计算表达式值 |
| 叶子节点 | 具体元素（文件、叶子菜单） | 终结符（变量、常量） |
| 使用频率 | 高（菜单、组织架构） | 低（仅 DSL 场景） |

可以说**解释器 = 组合模式 + 求值语义**。

### 4.2 解释器 vs 策略

- **策略**：从**有限的、预先定义好的**算法中选择一个，运行时可换；
- **解释器**：算法本身**由表达式动态组合而成**（表达式树可以来自用户输入）。

策略的选择空间是封闭的（枚举式的具体策略类），解释器的组合空间是开放的（任意嵌套）。

### 4.3 为什么解释器是 23 种模式里使用率最低的

| 问题 | 说明 |
|---|---|
| 类爆炸 | 文法复杂度增长 → 表达式类数量成倍增长 |
| 性能差 | 每个节点一次虚方法调用，深树效率低（需引入编译器优化技术） |
| 解析能力弱 | GoF 原始形式不含词法/语法分析，只有求值部分 |
| 有成熟替代 | ANTLR（生成解析器）、SpEL、规则引擎、DSL 内嵌语言 |

**GoF 原书中也直言**：解释器模式适用于"文法简单、效率不是关键"的场景；文法复杂时应改用编译器构造技术（词法分析器 + 语法分析器 + 抽象语法树 + 解释器/编译器）。

## 五、使用场景与面试问答

### 真实世界的应用形态

| 场景 | 实现 |
|---|---|
| Spring `@Value("#{...}")` 属性注入 | SpEL 表达式树 |
| `@PreAuthorize("hasRole('ADMIN') and #id > 0")` | SpEL 编译成表达式树求值 |
| MyBatis `<if test="status != null">` | OGNL 表达式 |
| 限流/风控规则 | Aviator / QLExpress 动态规则 |
| SQL 执行计划 | Calcite 把 SQL 解析为 RelNode 树后求值 |
| 正则表达式 | 内部编译为非确定有限自动机（DFA/NFA），本质是另一种解释器 |
| Cron 表达式解析 | 文法化时间规则 |
| Excel 公式（POI） | 公式 AST 求值 |

**Spring 的 SpEL 是最贴近日常的例子**：

```java
ExpressionParser parser = new SpelExpressionParser();
Expression exp = parser.parseExpression("price * qty * (1 - discount)");

StandardEvaluationContext ctx = new StandardEvaluationContext();
ctx.setVariable("price", 100);
ctx.setVariable("qty", 3);
ctx.setVariable("discount", 0.1);

System.out.println(exp.getValue(ctx, BigDecimal.class));   // 270.00
```

**安全提醒**：允许用户输入 SpEL 表达式是**高危操作**——`T(java.lang.Runtime).getRuntime().exec('rm -rf /')` 可以执行任意命令。生产环境必须用 `SimpleEvaluationContext` 限制可访问的类与方法，或改用不支持方法调用的表达式引擎。

### 面试问答

**Q1：解释器模式的核心思想是什么？**

**把文法规则对象化**——每条产生式对应一个类，表达式的结构对应对象树，求值就是递归遍历这棵树。它带来的收益是"新增文法规则 = 新增一个类"，与其他节点解耦；代价是文法一复杂，类的数量和维护成本就失控。

**Q2：解释器和组合模式的区别？**

结构一致（都是递归对象树），但组合模式组织的是"部分与整体"，解释器组织的是"文法规则"。组合模式的节点负责转发操作，解释器的节点负责**定义求值语义**。可以理解为解释器是在组合模式的基础上加了"语言"这一层抽象。

**Q3：什么时候该用解释器模式，什么时候不该用？**

**该用**：文法规则少（<10 条）、结构稳定、需要表达式动态组合、性能不敏感。典型场景是业务规则、简单公式计算。

**不该用**：文法复杂、有优先级与结合性要求、需要高性能、需要错误定位。这时应该用 **ANTLR 生成解析器**，或直接用现成的表达式引擎（SpEL / Aviator / QLExpress）；再复杂就该上规则引擎（Drools）或 DSL。

**Q4：如果说"解释器模式几乎不用"，这个模式还有学习价值吗？**

有，但价值不在"自己写实现"，而在**识别能力与选型判断**。当你需要"用户可自定义规则/公式"时，知道这类需求的本质就是"简单语言的解释执行"，从而做出正确决策：**别手写解释器，选 SpEL/Aviator/ANTLR/规则引擎**，同时识别出其中的安全风险（表达式注入）与性能风险。**面试中说明"这个模式我了解但实践中会选择成熟引擎替代"，比硬背实现更有说服力。**

**Q5：解释器模式与访问者模式有什么联系？**

**高度互补，常组合使用**。典型编译器架构分两步：① 用**解释器模式**（或 ANTLR 生成的 visit/listener）构建并求值 AST；② 用**访问者模式**在 AST 上实现各种分析操作（类型检查、常量折叠、代码生成）。**解释器负责"这是什么"，访问者负责"对它做什么"**。
