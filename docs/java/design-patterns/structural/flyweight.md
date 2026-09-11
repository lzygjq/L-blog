---
order: 7
date: 2026-09-11
---

# 享元模式（Flyweight）

## 一、问题场景

系统里出现**海量细粒度对象**，且这些对象中有很大一部分状态是**重复的**：

- 一局围棋需要 361 个棋子对象，但真正变化的只有"颜色"和"位置"，棋子的外观、渲染规则完全相同；
- 文本编辑器里每个字符都是一个对象，但字体系列、字号、颜色这些属性在同类字符间大量重复；
- 活动页要给 10 万用户展示同样的 200 张商品图，图片字节是重复的。

每个对象都复制一份重复状态，结果是**内存被无意义地消耗**（大量对象头、大量重复字段），GC 压力上升，甚至触发 OOM。

享元模式的解法：**把对象状态拆成"可共享的"和"不可共享的"两部分**，共享部分只在内存里存一份，由工厂缓存复用；不可共享部分在调用时由客户端传入。

## 二、核心概念：内部状态与外部状态

| 状态类型 | 含义 | 存储位置 | 例子（围棋） |
|---|---|---|---|
| **内部状态（Intrinsic）** | 可共享、不随环境变化 | 存在享元对象内部，**一份** | 棋子的颜色、形状、渲染样式 |
| **外部状态（Unshared）** | 不可共享、随场景变化 | **不存**在享元里，由客户端传入 | 棋子当前的坐标 (x, y) |

**判断标准**：这个字段是否在所有同类型对象中取值相同？
- 是 → 内部状态，抽出来共享；
- 否 → 外部状态，从对象里**移出去**，作为方法参数传入。

这一步"把外部状态剥离出去"是关键——**享元的本质是用"每次调用多传参数"的空间换"对象数量减少"的空间**。

## 三、结构与角色

```
┌────────────────┐
│   Flyweight    │  ← 抽象享元：声明接收外部状态的方法
│ + op(extState) │
└───────┬────────┘
   ┌────┴──────────────┐
┌──┴─────────────┐  ┌──┴──────────────────────┐
│ConcreteFlyweight│ │UnsharedConcreteFlyweight│  ← 不需共享的享元（可选）
│ - intrinsic    │  │ - allState              │
└────────────────┘  └─────────────────────────┘
        ▲
        │ 产出并缓存
┌───────┴────────────┐
│  FlyweightFactory  │  ← 享元工厂：带缓存池，相同 key 返回同一实例
│ - pool : Map<K,V>  │
│ + getFlyweight(k)  │
└────────────────────┘
        ▲
   ┌────┴────┐
   │ Client  │  持有外部状态，调用时传入
   └─────────┘
```

## 四、实现

### 4.1 围棋棋子

```java
/** 抽象享元：外部状态（坐标）通过参数传入 */
public interface ChessPiece {
    void place(int x, int y);
}

/** 具体享元：只持有内部状态（颜色），可被大量复用 */
public class StonePiece implements ChessPiece {
    private final String color;          // 内部状态：只有两种取值

    public StonePiece(String color) { this.color = color; }

    @Override
    public void place(int x, int y) {     // 外部状态由调用方传入
        System.out.printf("%s棋落于 (%d, %d)%n", color, x, y);
    }
}

/** 享元工厂：缓存池 + 并发安全 */
public class PieceFactory {
    private static final Map<String, ChessPiece> POOL = new ConcurrentHashMap<>();

    public static ChessPiece get(String color) {
        // computeIfAbsent：HashMap 层面保证同 key 只创建一次
        return POOL.computeIfAbsent(color, StonePiece::new);
    }

    public static int poolSize() { return POOL.size(); }
}

/** 客户端：自己保存外部状态（棋盘格局） */
public class Board {
    public static void main(String[] args) {
        int[][] layout = {{0, 0}, {0, 1}, {1, 0}};         // 外部状态

        for (int[] p : layout) {
            ChessPiece black = PieceFactory.get("黑");
            black.place(p[0], p[1]);
            ChessPiece white = PieceFactory.get("白");
            white.place(p[1], p[0]);
        }
        System.out.println("享元对象总数: " + PieceFactory.poolSize());   // 2
    }
}
```

**效果**：无论棋盘上落多少子，内存里只有 **2 个** `ChessPiece` 对象；坐标这种"每个子都不同"的状态留在外部（棋盘数组里）。

### 4.2 一个更贴近业务的变体：商品模板

```java
public class ProductTemplate {                     // 具体享元
    private final String categoryName;             // 内部状态：类目文案、默认规则
    private final String ruleJson;                 // 可与同类目商品共享

    // 构造代价大：读配置、查类目规则
    ProductTemplate(String categoryName) { ... }
}

public class ProductTemplateFactory {
    private static final Map<String, ProductTemplate> POOL = new ConcurrentHashMap<>();

    public static ProductTemplate of(String categoryId) {
        return POOL.computeIfAbsent(categoryId, ProductTemplateFactory::loadFromDb);
    }
}

// 使用时把"每个商品不同"的信息（价格、库存、图片）作为外部状态传入
template.renderOnShelf(product, sku);
```

> 注意：这里的 `ProductTemplate` 必须是**不可变**的。如果它持有可变状态，多个商品共享同一个实例会互相污染——**享元的正确性依赖内部状态的不可变性**。

## 五、JDK 中的实现

### 5.1 包装类的缓存池

```java
Integer a = 127, b = 127;
System.out.println(a == b);        // true  —— 命中 IntegerCache

Integer c = 128, d = 128;
System.out.println(c == d);        // false —— 超出缓存范围，各自 new

Integer e = new Integer(127), f = new Integer(127);
System.out.println(e == f);        // false —— 显式 new 不走 valueOf
```

原因是自动装箱实际调用 `Integer.valueOf(int)`：

```java
public static Integer valueOf(int i) {
    if (i >= IntegerCache.low && i <= IntegerCache.high)   // 默认 -128 ~ 127
        return IntegerCache.cache[i + (-IntegerCache.low)];  // 返回共享实例
    return new Integer(i);
}
```

各包装类的缓存范围：

| 类型 | 缓存范围 | 备注 |
|---|---|---|
| `Boolean` | `TRUE` / `FALSE` | 两个静态常量 |
| `Byte` | -128 ~ 127 | 全覆盖（byte 的全部取值） |
| `Short` / `Integer` / `Long` | -128 ~ 127 | 上限可用 `-XX:AutoBoxCacheMax=N` 调大（仅 Integer/Long） |
| `Character` | 0 ~ 127 | ASCII 范围 |
| `Float` / `Double` | **不缓存** | 浮点取值无限多，无法枚举 |

**实践含义**：包装类比较大小时**必须用 `equals()` 或先拆箱**。`==` 在小数值下"看起来能用"，一旦超过 127 就出错——这是最隐蔽的一类线上 bug。

### 5.2 字符串常量池

```java
String s1 = "abc";                    // 从常量池取
String s2 = "abc";                    // 同一个对象
String s3 = new String("abc");        // 堆上新对象
String s4 = s3.intern();              // 手工入池/取池

System.out.println(s1 == s2);         // true
System.out.println(s1 == s3);         // false
System.out.println(s1 == s4);         // true
```

字符串常量池是享元思想在 JVM 层面的实现：**字面量在池中只存一份，多个引用共享**。`intern()` 就是把一个堆上的字符串"加入或取出"池中实例。

> 其他例子：`java.lang.Character` 的 `CharacterCache`、`Boolean` 的 `TRUE`/`FALSE`、`java.util.logging` 的 `Level` 常量，以及各类枚举值（枚举常量天然是享元）。

## 六、与相邻概念的区别

| 对比 | 区别 |
|---|---|
| 享元 vs 单例 | 单例**全局只有一个**实例；享元**每个 key 一个**（可以有多个），共享的是"同 key"的实例 |
| 享元 vs 对象池 | 享元共享的是**不可变的内部状态**，对象会被长期复用；对象池管理的是**可变对象**的借还（如连接池），用完必须归还 |
| 享元 vs 缓存 | 缓存目的是**加速访问**（避免重复计算/查询），享元目的是**省内存**（避免重复对象）。二者常同时出现，但目标不同 |
| 享元 vs 原型 | 原型是"复制出独立副本"，享元是"共享同一份"——方向相反 |

## 七、优缺点

**优点**

1. **显著降低内存占用**：对象的重复部分只存一份；
2. 减少对象数量，降低 GC 频率与停顿；
3. 外部状态由调用方管理，享元对象可以做到完全不可变、天然线程安全。

**缺点**

1. **增加复杂度**：需要拆分内外状态，外部状态的管理责任转移给了客户端；
2. **用时间换空间**：每次调用要多传参数，可能增加 CPU 开销；
3. **生命周期管理困难**：享元长期驻留，缓存池只增不减时会变成内存泄漏（需要弱引用或定期清理）；
4. 拆分不当会把本该内聚的数据打散，降低可读性。

## 八、使用场景

判定信号：**同类对象数量极大（10⁴ 以上）+ 大部分字段取值重复 + 内存是瓶颈。**

- **游戏**：棋类棋子、地图瓦片、场景树木/草地的共享模型；
- **文本 / 排版**：字符的字体、字号、颜色属性；
- **图形与地图**：标注图标、路径样式、瓦片图；
- **业务配置**：类目规则、活动模板、费率模板（多个业务对象共享同一份规则）；
- **数据字典**：状态码、枚举文案在内存中的共享；
- **JVM 层面**：字符串常量池、包装类缓存。

## 九、面试问答

**Q1：享元模式的核心思想是什么？**
**把对象状态拆成内部状态与外部状态。** 内部状态可共享、不可变，只存一份并由工厂缓存；外部状态随场景变化，从对象中剥离，由客户端在调用时传入。本质是"用多传参数换更少的对象"，属于空间与时间的权衡。

**Q2：内部状态和外部状态怎么区分？**
看这个字段在同类型对象间是否取值相同：相同 → 内部状态，抽出来共享；不同 → 外部状态，移出去当参数。以围棋为例，"颜色"是内部状态，"坐标"是外部状态。

**Q3：为什么 `Integer a = 128; Integer b = 128;` 时 `a == b` 是 false？**
自动装箱调用 `Integer.valueOf()`，该方法只对 **-128 ~ 127** 返回缓存中的共享实例，超出范围会 `new` 新对象。因此小数值比较"碰巧"相等，超过 127 就不等。**结论：包装类比较必须用 `equals()`。**

**Q4：享元模式和单例、对象池的区别？**
单例全局只有一个实例，享元每个 key 一个（可以有多个）；对象池管理的是**可变对象**的借还（用完归还、可重用），享元共享的是**不可变状态**（长期驻留、不需要归还）。享元是"省内存"，对象池是"省创建成本 + 控制资源上限"。

**Q5：享元模式的正确性依赖什么？**
依赖**内部状态的不可变性**。如果享元对象持有可变状态，多个使用方共享同一实例就会互相污染数据。所以享元对象应设计为字段全部 `final`、不提供 setter。此外缓存池要控制生命周期（弱引用或容量上限），否则会退化成内存泄漏。

**Q6：什么时候不该用享元？**
当对象数量不大、或状态几乎没有重复时——引入享元只会增加复杂度而省不下多少内存。**优化要先有度量**：先用 MAT / JProfiler 确认是重复对象占用了内存，再考虑享元，而不是凭感觉引入。
