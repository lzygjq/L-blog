---
order: 9
date: 2026-09-11
---

# 备忘录模式（Memento）

## 一、问题场景

需要**保存对象的某个时刻状态，并在之后恢复**——撤销、快照、回滚、存档：

```java
// 天真的做法：把内部状态暴露出去
public class Editor {
    public StringBuilder content;      // 为了能备份，字段被迫 public
    public int cursor;
}
// 备份方要自己 new 一个对象，逐个字段复制，且集合类型还要深拷贝
```

问题有两层：① **封装被破坏**（为了让外部备份，内部状态必须暴露）；② **备份逻辑散落**（每个备份方都要自己处理深浅拷贝，容易漏字段）。

备忘录模式的解法：**由对象自己负责"打包"和"还原"自己的状态，外部只持有一个不透明的快照对象（Caretaker），既看不到内部细节，也不需要理解如何恢复。**

## 二、结构与角色

```
┌────────────────┐  创建/恢复   ┌──────────────────┐
│  Originator    │─────────────▶│     Memento      │
│ (发起人/原对象) │◀─────────────│  快照（黑盒）     │
│ - state        │   save()     │ - state (private)│
│ + save()       │   restore()  │ 对外只暴露元信息   │
│ + restore(m)   │              └────────┬─────────┘
└────────────────┘                       │ 持有（但读不到内容）
                                 ┌───────┴────────┐
                                 │   Caretaker    │
                                 │ (管理者)        │
                                 │ - history: List│
                                 │ + push()/pop() │
                                 └────────────────┘
```

| 角色 | 职责 |
|---|---|
| **Originator（发起人）** | 拥有需要备份的状态；能生成自己的快照，也能从快照恢复 |
| **Memento（备忘录）** | 存储 Originator 的内部状态；**对外不暴露读取接口**（黑盒） |
| **Caretaker（管理者）** | 只负责保存/传递/管理快照，**不理解快照内容，也不修改它** |

**核心设计点是"窄接口"**：`Memento` 对 `Caretaker` 是黑盒（看不到字段），对 `Originator` 是透明的（能读写字段）。Java 中用**同一个包内的私有字段 + 内部类**可以近似实现这种"双重接口"。

## 三、代码实现

以带撤销能力的文档编辑器为例：

```java
/** 备忘录：只对 Originator 可见内部数据 —— 用 static 内部类 + private 字段实现 */
public final class Document {

    private StringBuilder content = new StringBuilder();
    private int cursor = 0;
    private final List<String> tags = new ArrayList<>();

    public void append(String text) {
        content.append(text);
        cursor = content.length();
    }

    public void addTag(String tag) { tags.add(tag); }

    public String getContent() { return content.toString(); }

    /** 创建快照 */
    public Memento save() {
        return new Memento(content.toString(), cursor, new ArrayList<>(tags));
    }

    /** 从快照恢复 */
    public void restore(Memento m) {
        this.content = new StringBuilder(m.content);
        this.cursor = m.cursor;
        this.tags.clear();
        this.tags.addAll(m.tags);
    }

    /**
     * 备忘录：final 类 + 私有构造 + 私有字段。
     * 只有 Document 能访问其内容（Caretaker 拿到引用也读不到数据）。
     */
    public static final class Memento {
        private final String content;
        private final int cursor;
        private final List<String> tags;

        private Memento(String content, int cursor, List<String> tags) {
            this.content = content;          // String 不可变，天然安全
            this.cursor = cursor;
            this.tags = tags;                // 已在外层复制，隔离内部集合
        }
    }
}
```

```java
/** 管理者：只管存取，不关心里面是什么 */
public class History {
    private final Deque<Document.Memento> stack = new ArrayDeque<>();
    private static final int MAX = 50;              // 限制历史深度，防内存无限增长

    public void push(Document.Memento memento) {
        if (stack.size() >= MAX) stack.removeLast();  // 丢弃最早的
        stack.push(memento);
    }

    public Document.Memento pop() {
        return stack.isEmpty() ? null : stack.pop();
    }
}
```

调用：

```java
Document doc = new Document();
History history = new History();

history.push(doc.save());        // 保存前先快照
doc.append("hello ");

history.push(doc.save());
doc.append("world");

System.out.println(doc.getContent());   // hello world
doc.restore(history.pop());
System.out.println(doc.getContent());   // hello
```

### 两个实现要点

**① 深拷贝是必须的。** 备忘录中若含可变对象（`List`、`Map`、自定义对象），必须在 `save()` 时**复制**。否则备忘录与 Originator 共享同一个集合引用，后续修改会同时改变"历史快照"——撤销就失效了。这正是原型模式（深克隆）的用武之地。

**② 快照的粒度与内存。** 全量快照在对象很大时内存开销惊人。优化方向：

| 策略 | 做法 |
|---|---|
| **增量快照** | 只记录变化的部分（如命令模式的反向操作） |
| **限制深度** | 历史栈设上限（上面代码的 `MAX = 50`） |
| **持久化** | 大对象快照落盘（如数据库保存点） |
| **压缩/序列化** | 存二进制而非对象图 |

## 四、对比辨析

### 4.1 备忘录 vs 命令——两种撤销机制

两者都能实现撤销，这是最容易混淆的一组对比：

| 维度 | 备忘录 | 命令 |
|---|---|---|
| 撤销原理 | 恢复**状态快照** | 执行**反向操作** |
| 记录内容 | "当时整个对象是什么样" | "做了什么、参数是什么" |
| 内存占用 | 大（尤其对象庞大时） | 小（只存操作与参数） |
| 是否要求操作可逆 | 不要求 | **要求**（反向逻辑必须正确） |
| 实现难度 | 低（拷贝即可） | 高（每个命令都要写反向逻辑） |
| 适用 | 状态复杂但操作难逆（如图形编辑） | 操作简单且可逆（如文本增删） |

一句话：**备忘录是"拍照片"，命令是"记流水账"。** 实践中二者常混用——操作用命令组织（便于日志与重放），复杂操作的兜底用快照。

### 4.2 备忘录 vs 原型

原型模式提供"复制对象"的能力，**是备忘录的实现手段之一**（深克隆生成快照）。但两者意图不同：原型关注"如何高效创建对象"，备忘录关注"如何保存与恢复状态"。

### 4.3 备忘录 vs 序列化

序列化（`Serializable` / JSON）是**跨进程、跨时间的持久化快照**；备忘录是**进程内、短生命周期的内存快照**。工程上常用序列化实现备忘录（把对象转成字节数组存起来），好处是天然深拷贝、天然节省内存（对大对象）。

## 五、使用场景与面试问答

### 典型场景

| 场景 | Originator | Memento | Caretaker |
|---|---|---|---|
| 编辑器撤销 | 文档对象 | 内容 + 光标位置快照 | 撤销栈 |
| 游戏存档 | 角色/游戏世界 | 完整状态存档 | 存档管理器 |
| 数据库事务 | 数据行 | 保存点（`SAVEPOINT`） | 事务管理器 |
| 版本控制 | 工作区 | 提交快照 | Git 对象库 |
| 表单草稿 | 表单数据 | 草稿快照 | 本地存储 |
| 配置回滚 | 配置对象 | 历史版本 | 配置中心 |

数据库的 **`SAVEPOINT`** 是备忘录模式在存储层的经典实现：`SAVEPOINT sp1` 建立快照，`ROLLBACK TO sp1` 恢复——与 `save()` / `restore()` 一一对应。

### 面试问答

**Q1：备忘录模式如何保证封装性？**

通过**"窄接口"**：`Memento` 对外只暴露一个不透明的引用（不提供 getter），只有 `Originator` 能访问其内部数据。Java 中常用三种手法实现：① 把 `Memento` 做成 `Originator` 的**静态内部类**，字段声明为 `private`，外部拿到的引用读不到内容；② 把 `Memento` 与 `Originator` 放在**同一个包**内，用包级私有（default）访问权限；③ 用**接口分离**——对外返回空的 `Memento` 标记接口，`Originator` 内部强转成实现类访问字段。

**Q2：实现备忘录时最容易犯的错误是什么？**

**忘记深拷贝**。如果 `save()` 直接返回内部 `List` 的引用而不复制，那么后续对原对象的修改会"穿透"到历史快照里，撤销功能形同虚设——表现为"撤销之后数据没变回去"。这是拷贝语义类问题（同原型模式）最典型的坑。

**Q3：备忘录会占用大量内存吗？如何优化？**

会，这是它的主要代价。优化手段：① **限制历史深度**（栈设上限，超出丢弃最早的）；② **增量快照**——只记录变化的部分而非全量状态；③ **大对象落盘**（序列化到磁盘/分布式存储）；④ **记忆化替代**——如只需支持"撤销一步"，只存一份快照即可。

**Q4：备忘录和命令模式，生产环境里怎么选？**

判断标准是**操作是否容易反向**：文本编辑（增/删可逆）→ 命令模式，内存友好；图形编辑、复杂表单（拖拽、缩放、格式批量应用难逆）→ 备忘录，实现可靠。**复杂系统通常两者结合**：命令模式组织操作序列与日志，每个命令内部按需保存局部快照兜底。

**Q5：Git 是备忘录模式吗？**

**是备忘录模式 + 命令模式 + 有向无环图的结合**。每次 `commit` 生成一个不可变的完整快照（Memento，通过内容寻址存储去重复），`reset`/`checkout` 是恢复（restore），引用（分支/HEAD）是 Caretaker。Git 的巧妙之处在于用**内容寻址 + 增量压缩**把"全量快照"的内存问题化解掉了——这是工业级实现超越教科书模式的典型例子。
