---
order: 1
date: 2026-09-11
---

# 模板方法模式（Template Method）

## 一、问题场景

有一类流程，**骨架是固定的，只有中间某几步有差异**：

```java
// 导入任务：读取文件 → 解析 → 校验 → 入库 → 发送通知
public void importExcel() {
    List<Row> rows = readExcel("user.xlsx");     // 变化
    // ... 校验、入库、通知：逻辑完全一样
}
public void importCsv() {
    List<Row> rows = readCsv("user.csv");        // 变化
    // ... 校验、入库、通知：又抄了一遍
}
```

复制粘贴的结果是：改动"入库"逻辑时，N 个导入方法要同步改 N 遍，且很容易漏。这类"流程固定、步骤可变"的场景，就是模板方法的战场。

模板方法的解法：**把流程定义在父类的模板方法里，把变化的步骤抽象成方法交给子类实现。**

## 二、结构与角色

```
┌─────────────────────────────────────┐
│      AbstractClass（抽象类）        │
├─────────────────────────────────────┤
│ + templateMethod()  ← final 骨架    │  定义流程顺序，不允许覆写
│   ├─ step1()        ← abstract      │  必须由子类实现
│   ├─ step2()        ← abstract      │  必须由子类实现
│   └─ hook()         ← 有默认空实现  │  可选覆写（钩子）
└───────────────┬─────────────────────┘
                │ 继承
        ┌───────┴────────┐
┌───────┴──────┐  ┌──────┴───────┐
│ ConcreteA    │  │ ConcreteB    │
│ 实现两个步骤 │  │ 实现两个步骤 │
└──────────────┘  └──────────────┘
```

三个关键角色：

| 角色 | 职责 |
|---|---|
| **模板方法** | 定义算法骨架，声明为 `final` 防止子类篡改流程顺序 |
| **抽象方法** | 变化的、必须由子类填充的步骤 |
| **钩子方法（Hook）** | 有默认实现（通常是空方法），子类**按需**覆写，用来微调流程 |

**钩子方法是模板方法的精髓**：它让子类可以"参与决策"而不破坏骨架。典型用法是让钩子返回布尔值，反向控制模板流程是否执行某一步。

## 三、代码实现

以"数据导入"为例，两种数据源共用同一套处理流程：

```java
public abstract class DataImporter {

    /** 模板方法：定义固定流程，final 禁止覆写 */
    public final void importData(String source) {
        List<Row> rows = read(source);          // ① 变化：读取
        if (rows.isEmpty()) return;

        List<Row> valid = validate(rows);       // ② 固定：校验
        save(valid);                            // ③ 固定：入库
        if (needNotify()) {                     // ④ 钩子：是否通知
            notifyDone(valid.size());
        }
        afterImport();                          // ⑤ 钩子：收尾扩展点
    }

    // ---- 抽象方法：子类必须实现 ----
    protected abstract List<Row> read(String source);

    // ---- 固定步骤：final，不允许子类改动 ----
    protected final List<Row> validate(List<Row> rows) {
        return rows.stream().filter(Row::isValid).collect(Collectors.toList());
    }

    protected final void save(List<Row> rows) {
        System.out.println("批量入库 " + rows.size() + " 条");
    }

    // ---- 钩子方法：默认实现，子类可选覆写 ----
    protected boolean needNotify() { return true; }

    protected void afterImport() { }
}
```

子类只需关注"怎么读"：

```java
public class ExcelImporter extends DataImporter {
    @Override protected List<Row> read(String source) { return ExcelUtil.read(source); }

    @Override protected boolean needNotify() { return false; }   // 覆写钩子：Excel 导入不通知
}

public class CsvImporter extends DataImporter {
    @Override protected List<Row> read(String source) { return CsvUtil.read(source); }

    @Override protected void afterImport() { System.out.println("CSV 导入完成，生成对账文件"); }
}
```

调用方只依赖抽象类型：

```java
DataImporter importer = new ExcelImporter();
importer.importData("user.xlsx");     // 流程完全由父类掌控
```

### 好莱坞原则

模板方法体现的是**好莱坞原则**——"不要来找我们，我们会找你"（Don't call us, we'll call you）。父类调用子类的方法，而不是子类调用父类。控制权在父类，子类只提供零件。这正是**框架**与**库**的本质区别：用库时你调用它；用框架时它调用你。

## 四、对比辨析

### 4.1 模板方法 vs 策略

两者都在处理"变化的部分"，但复用机制相反：

| 维度 | 模板方法 | 策略 |
|---|---|---|
| 复用手段 | **继承**（子类覆写钩子） | **组合**（注入算法对象） |
| 变化粒度 | 算法的**部分步骤** | **整个算法** |
| 绑定时机 | 编译期静态绑定 | 运行期动态替换 |
| 类关系 | 子类与父类强耦合 | 策略与被调用方松耦合 |
| 适用判断 | 流程骨架稳定、只有个别步骤变 | 整个算法都要能替换 |

选择标准很简单：**"整个算法换掉"用策略；"算法骨架不变、只换其中一两步"用模板方法。** 如果两者都行，优先策略（组合优于继承）。

### 4.2 模板方法 vs 工厂方法

**工厂方法是模板方法的特例**。工厂方法把"创建哪个产品"这一步延迟到子类，本质上是模板方法在"创建对象"这一特定步骤上的应用。

### 4.3 与回调（Callback）的关系

回调是模板方法的"轻量替代"：JDK 8 之后，如果只有一个变化步骤，把 `Runnable` / `Consumer` 作为参数传进去，比继承一个抽象类更灵活，也避免了类爆炸。

```java
// 模板方法风格：为每种变化定义一个子类
new ExcelImporter().importData(path);

// 回调解法：一行搞定，无需新增类型
processFile(path, content -> parse(content));
```

## 五、使用场景与面试问答

### 框架与 JDK 中的实例

| 位置 | 模板方法 | 子类要实现的步骤 |
|---|---|---|
| `JdbcTemplate` | `execute()` / `query()` | `RowMapper`、`PreparedStatementSetter`（用回调实现的变体） |
| `AbstractApplicationContext` | `refresh()` | `onRefresh()`、`postProcessBeanFactory()`（钩子） |
| `HttpServlet` | `service()` | `doGet()`、`doPost()`（钩子） |
| `InputStream` | `read(byte[], int, int)` | `read()`（子类实现单字节读，父类基于它实现批量读） |
| `AbstractList` | `addAll()` 等 | `get()`、`size()` |
| MyBatis `BaseExecutor` | `query()` | `doQuery()`、`doUpdate()` |

`AbstractApplicationContext.refresh()` 是最经典的一例——Spring 容器启动的十二个步骤全部写死在 `refresh()` 里，MyBatis、AOP、事件多播器等扩展点全部通过钩子方法留出。

### 面试问答

**Q1：为什么模板方法用抽象类而不是接口？**

模板方法需要**定义具体流程代码**（模板方法本身有方法体）和**保存状态**（如 `AbstractList` 的 `modCount`）。JDK 8 之前接口不能有方法体；JDK 8 之后虽有 `default` 方法可以写流程，但接口不能有实例字段，无法保存状态。所以"定义骨架 + 保留扩展点"的职责天然属于抽象类。

**Q2：钩子方法和抽象方法的区别？**

抽象方法没有实现，子类**必须**实现；钩子方法有默认实现（通常为空），子类**可选**覆写。钩子的价值在于提供"可选的参与点"，不强制子类关心所有扩展点。

**Q3：模板方法违反了开闭原则吗？**

不违反，反而是开闭原则的体现：**流程对修改关闭**（`final` 模板方法不可改），**扩展对新增开放**（新增子类即可换掉某些步骤）。但要注意，如果子类需要修改流程顺序，模板方法就无能为力了——这时该换成策略或责任链。

**Q4：`final` 修饰模板方法的意义？**

防止子类覆写模板方法从而破坏算法骨架。这是**"框架控制反转"的技术保障**——控制权必须留在父类，否则子类可以随意调整流程顺序，模板方法就退化成普通方法了。

**Q5：什么时候不该用模板方法？**

- 流程本身会变 → 用责任链或状态模式；
- 只有一两个步骤变化且无状态需求 → 用回调（`Function`/`Consumer`）更轻；
- 变化维度是多维的（如"数据源 × 输出格式"）→ 用桥接模式拆成两个继承体系，避免子类数量爆炸。
