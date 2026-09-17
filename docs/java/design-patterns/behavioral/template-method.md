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

## 五、源码剖析

上一节看的是**它和策略的边界**；本节看**框架里那段代码到底怎么写的**。哪些框架用了它，速查表在下一节——这里只回答一个问题：**教科书里的"父类定骨架、子类填步骤"，与真实框架之间差了哪几步。**

### 5.1 Spring · `refresh()`：骨架里嵌着的那些东西

`AbstractApplicationContext.refresh()` 是 Spring 容器启动的总骨架，也是模板方法最标准的形态：

```java
// 精简自 AbstractApplicationContext#refresh()（省略部分 step）
@Override
public void refresh() throws BeansException, IllegalStateException {
    synchronized (this.startupShutdownMonitor) {        // ① 骨架自带并发控制
        prepareRefresh();
        ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory();
        prepareBeanFactory(beanFactory);
        try {
            postProcessBeanFactory(beanFactory);        // ② 空实现的钩子
            invokeBeanFactoryPostProcessors(beanFactory);
            registerBeanPostProcessors(beanFactory);
            initMessageSource();
            initApplicationEventMulticaster();
            onRefresh();                                // ③ 留给子类覆写
            registerListeners();
            finishBeanFactoryInitialization(beanFactory);
            finishRefresh();
        } catch (BeansException ex) {
            destroyBeans();                             // ④ 失败即回滚
            cancelRefresh(ex);
            throw ex;
        } finally {
            resetCommonCaches();
        }
    }
}
```

**结构差异**：教科书只强调"父类编排、子类填步骤"，`refresh()` 多做了三件事——

1. **把不变式写进骨架**：`synchronized` 加锁、`try/catch` 失败即 `destroyBeans()` 回滚、`finally` 清缓存，全部在父类里，子类**无法绕过**。这才是模板方法相对策略的真正优势：**流程中的强制约束被继承给了所有子类**。
2. **钩子多为空实现**：`postProcessBeanFactory()` 与 `onRefresh()` 在父类里是**空方法**（可选覆写），而不是抽象方法。真实框架里钩子数量往往远多于必须覆写的抽象步骤——因为框架要保证"最小实现成本"。
3. **步骤数远超教科书**：这里是 12 步。步骤越多，模板方法越划算，因为**任意两步之间的顺序约束**只在一处维护。

**不懂会误判**：不了解模板方法的人看 `refresh()`，会当成"一个很长的初始化方法"，进而觉得 Spring 启动流程乱。实际上这 12 步的**顺序本身就是规格**——`registerBeanPostProcessors()` 必须早于 `finishBeanFactoryInitialization()`（否则 Bean 创建时后置处理器还没就位）。按"普通长方法"去读，这些约束会全部丢失。

### 5.2 `JdbcTemplate`：模板方法在 Java 8 之后的形态

`JdbcTemplate` 是"模板方法"这个名字的来源之一（Spring 的 `XxxTemplate` 家族），但它的形态值得单独拎出来：

```java
// 精简自 JdbcTemplate#execute(StatementCallback<T>)
@Override
@Nullable
public <T> T execute(StatementCallback<T> action) throws DataAccessException {
    Assert.notNull(action, "Callback object must not be null");
    Connection con = DataSourceUtils.getConnection(obtainDataSource());
    Statement stmt = null;
    try {
        stmt = con.createStatement();
        applyStatementSettings(stmt);
        T result = action.doInStatement(stmt);      // ⑤ 变化点：回调，而非子类覆写
        handleWarnings(stmt);
        return result;
    } catch (SQLException ex) {
        throw translateException("StatementCallback", getSql(action), ex);  // ⑥ 统一异常翻译
    } finally {
        JdbcUtils.closeStatement(stmt);
        DataSourceUtils.releaseConnection(con, getDataSource());
    }
}
```

**结构差异**：这是模板方法的**回调化变体**。教科书把变化点交给**继承**（`protected abstract void step()`），这里交给**入参**（`StatementCallback`）。骨架方法不开放继承，只开放参数。

这个演化在 Java 8 之后成了主流：

| 框架 | 骨架 | 变化点（回调） |
|---|---|---|
| `JdbcTemplate` | `execute()` | `StatementCallback` / `RowMapper` |
| `TransactionTemplate` | `execute()` | `TransactionCallback` |
| `RedisTemplate` | `execute()` | `RedisCallback` |
| `RestTemplate` | `execute()` | `RequestCallback` / `ResponseExtractor` |

两个继承版做不到的收益：**① 免去建子类**——每种查询不必对应一个类；**② 异常翻译只写一处**——`translateException()` 在骨架里调用一次，所有回调都自动获得 `SQLException → DataAccessException` 的转换，用继承写这坨 try-catch 会散落到每个子类。

**不懂会误判**：只背"模板方法 = 继承"的人，会认为 `JdbcTemplate` **不是**模板方法（它没有任何抽象父类要继承）。但模式的定义是"**父类固定算法骨架，把可变步骤延迟**"——延迟给子类还是给回调只是手段。**能识别这个变形，读框架源码时才能把 `XxxTemplate` 一眼归类。**

### 5.3 JDK · `AbstractList`：父类反过来调用子类

```java
// 精简自 java.util.AbstractList
public abstract class AbstractList<E> extends AbstractCollection<E> implements List<E> {
    public abstract E get(int index);        // 子类必须提供
    public abstract int size();              // 子类必须提供

    public Iterator<E> iterator() {          // 父类提供完整实现
        return new Itr();
    }

    private class Itr implements Iterator<E> {
        int cursor = 0;
        public boolean hasNext() { return cursor != size(); }   // ⑦ 调的是子类的 size()
        public E next() {
            E next = get(cursor);                                // ⑧ 调的是子类的 get()
            cursor += 1;
            return next;
        }
    }
}
```

**结构差异**：这是模板方法的**倒置形态**。父类提供了一个**完整可用**的 `iterator()`，而它依赖的 `get()` / `size()` 由子类实现——调用方向是"父类的方法调用子类的方法"，即所谓**好莱坞原则**（Don't call us, we'll call you）。

收益很直接：`ArrayList` 只要实现 `get(int)` 与 `size()` 两个方法，就免费得到了 `iterator()`、`indexOf()`、`subList()`、`equals()`、`hashCode()` 一整套能力。**父类不是"骨架待填"，而是"用子类的原语组合出新能力"。**

**不懂会误判**：在 `ArrayList` 源码里找不到 `iterator()` 的实现，容易误以为"迭代器由 `Collection` 统一提供"。实际它来自 `AbstractList`，而 `AbstractList` 的实现又建立在 `ArrayList` 自己的 `get()`/`size()` 之上——**这是三层协作，不是一层继承。**

### 5.4 一句话收束

模板方法在框架里有**三种面孔**：`refresh()` 是"骨架 + 强制约束"，`JdbcTemplate` 是"骨架 + 回调参数"，`AbstractList` 是"父类用子类原语组合新能力"。判断标准始终是那一条——**这段代码有没有把"不变的顺序"和"可变的步骤"分离**，而不是"有没有抽象父类"。

## 六、使用场景与面试问答

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
