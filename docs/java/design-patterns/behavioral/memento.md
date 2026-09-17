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

## 五、源码剖析

上一节看的是**它和命令这两种撤销机制的边界**；本节看**工业级的"保存与恢复"是怎么做到几乎零成本的**。哪些场景用了它，速查表在下一节——这里要回答一个问题：**为什么数据库可以随便开保存点，而内存里的快照却很贵。**

### 5.1 数据库 · `SAVEPOINT`：备忘录可以不是"状态副本"

前面说过"备忘录 = 拍照片"，那是**内存实现**的直觉。数据库的保存点走的是另一条路：

```sql
START TRANSACTION;
UPDATE account SET balance = balance - 100 WHERE id = 1;
SAVEPOINT sp1;                       -- ① 建立保存点
UPDATE account SET balance = balance + 100 WHERE id = 2;
ROLLBACK TO sp1;                     -- ② 只回滚第二条
COMMIT;                              -- ③ 第一条仍然生效
```

**结构差异**：InnoDB 的 `SAVEPOINT` **不复制任何数据行**，它只在 **undo log 上记一个位置标记**（内部用 `trx_savepoints` 数组保存对应的 undo 记录号）。`ROLLBACK TO sp1` 的执行方式是**沿 undo log 回退到那个标记**。

这个实现的成本结构与内存备忘录**完全不同**：

| 实现 | 建立快照的成本 | 恢复的成本 | 能否"跳回去读" |
|---|---|---|---|
| 内存深拷贝（教科书） | **O(对象大小)**，可能很大 | O(对象大小) | 能，快照就是完整数据 |
| 数据库 SAVEPOINT | **O(1)**，只记一个位置 | O(改动量) | **不能**，只能回滚 |

**两条结论**：① **保存点的建立几乎免费**（与表大小无关），因为要回滚的"历史"本来就被 undo log 记着了——备忘录复用的是事务机制已有产物；② 代价是**它只是一张"回程车票"，不是可查阅的快照**：你没法 `SELECT` 出 sp1 时刻的数据。**要不要"能读"这个能力，是选哪种实现的分水岭。**

**不懂会误判**：把保存点理解成"数据库帮你复制了一份数据"，于是担心"事务里开太多保存点会不会把磁盘写满"。实际开销在 undo log 的增长上，与保存点数量近似线性但**每点极小**。

### 5.2 Spring · `PROPAGATION_NESTED` 就是保存点的包装

```java
// 精简自 org.springframework.jdbc.datasource.JdbcTransactionObjectSupport
@Override
public Savepoint createSavepoint() throws TransactionException {
    this.savepointCounter++;
    return getConnectionHolder().createSavepointWithName(
            SAVEPOINT_NAME_PREFIX + this.savepointCounter);      // ④ 名字就是"SAVEPOINT_1" 这样拼出来的
}
```

**结构差异**：Spring 事务传播行为里最容易被误解的是 `NESTED`（嵌套事务）。看这段源码就清楚了——**JDBC 并不支持真正的嵌套事务，Spring 的 `NESTED` 是"一个物理事务 + 若干保存点"**。

这与 `REQUIRES_NEW` 有本质区别，而两者的行为差异全部由此决定：

| 维度 | `REQUIRES_NEW` | `NESTED` |
|---|---|---|
| 物理事务数 | **2 个**（挂起外层、开新连接） | **1 个**（同一连接） |
| `NESTED` 内层提交后 | — | 并未真正提交，只是释放保存点 |
| 外层回滚时，内层的结果 | **保留**（内层已独立提交） | **一起回滚** |
| 内层回滚时，外层的操作 | 不受影响 | 不受影响（回滚到保存点） |
| 连接占用 | 需要**第二个连接** | 复用当前连接 |
| 适用 | 日志、审计等"无论主流程成败都要留下"的记录 | 主流程中的可选步骤（失败不拖累主流程，但成功与否也不独立） |

**最常见的误用**：为了让"写日志"不被主事务回滚拖累，选了 `NESTED`——**这是错的，外层回滚时日志一样会没**。该用 `REQUIRES_NEW`。反过来，如果只是想"某一步失败不影响前面已做的操作"，用 `NESTED` 才是对的。

**不懂会误判**：把 `NESTED` 理解成"事务里的子事务"，进而以为它有独立的提交语义。**它是"局部回滚点"，不是"子事务"** —— 名字里的 nested 描述的是**代码的嵌套结构**，不是事务的嵌套层级。

### 5.3 Git：用"内容寻址"绕开备忘录的内存问题

Git 每次 `commit` 生成的是**全量快照**（不是 diff）——这听起来是备忘录模式最糟的用法。但真实存储量远小于"版本数 × 仓库大小"：

```
一个文件的第 1 版 blob = sha1(内容A)        ← 内容相同 → 哈希相同 → 只存一份
一个文件的第 2 版 blob = sha1(内容B)        ← 只有这一个文件变了
未变更的文件                              ← 指向【同一个 blob 对象】，零新增存储
```

**结构差异**：Git 用**内容寻址（`sha1(内容)` 作为对象 ID）+ 对象去重**，实现了"**语义上是全量快照、存储上是增量**"。后面再用 packfile 对相似对象做增量压缩，把体积进一步压小。

对照前面三种实现，可以看出一张完整的取舍表：

| 实现 | 快照语义 | 存储成本 | 恢复粒度 |
|---|---|---|---|
| 内存深拷贝 | 完整副本 | 高（与对象大小成正比） | 任意时刻可读 |
| 命令的反向操作 | 无快照，只有操作 | 低 | 依赖操作可逆 |
| 数据库 `SAVEPOINT` | 只有位置标记 | **极低** | 只能回滚，不能读 |
| Git commit | **逻辑全量**，物理去重 | 低 | 任意版本可读 |

**这张表的读法**：**"要不要能读历史"决定了结构，"内容会不会重复"决定了成本。** Git 之所以能同时拿到"全量语义"和"低成本"，是因为它把一部分复杂度推给了存储层的去重与压缩——这是工程上非常典型的一类解法：**保持上层语义简单，把优化做在下层。**

**不懂会误判**：以为"Git 不做 diff 所以很占空间"。恰恰相反——**它把"要不要 diff"这个决策从"快照语义"里拿掉了**。这也解释了为什么 Git 的 `commit` 能如此廉价（不需要计算差异），而 `git diff` 反而要现场算。

## 六、使用场景与面试问答

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
