---
order: 4
date: 2026-09-11
---

# 命令模式（Command）

## 一、问题场景

有两种需求经常同时出现：

1. **把"一次操作"当作一等公民**——排队执行、延迟执行、异步执行、记录日志、跨进程传输；
2. **支持撤销/重做**——用户点了"撤销"要能回到上一步。

如果用普通的"直接调用方法"来实现：

```java
button.onClick(() -> editor.addText("hello"));    // 直接调用，无法撤销
```

问题在于：**调用被立即执行了，没有任何中间对象承载"这次操作"**，因此既无法排队，也无法记录，更无法反向执行。命令模式的解法正是**把"请求"本身封装成一个对象**——这个对象同时携带"做什么"和"怎么做"。

## 二、结构与角色

```
        ┌──────────┐        ┌──────────────────┐        ┌─────────────┐
        │  Client  │───────▶│     Invoker      │───────▶│  «Command»  │
        │ 组装命令 │        │ 触发者/遥控器     │ 持有   │ + execute() │
        └──────────┘        │ - history: 队列  │        │ + undo()    │
                            └──────────────────┘        └──────┬──────┘
                                                               │ 实现
                            ┌──────────────────────────────────┤
                    ┌───────┴────────┐              ┌──────────┴───────┐
                    │ConcreteCommand │──── 持有 ───▶│     Receiver     │
                    │+ execute()     │              │ 真正干活的业务类  │
                    │+ undo()        │              └──────────────────┘
                    └────────────────┘
```

| 角色 | 职责 |
|---|---|
| **Command（抽象命令）** | 声明 `execute()`，可选 `undo()` |
| **ConcreteCommand** | 绑定"一个接收者 + 一组动作参数"，是**请求的完整封装** |
| **Receiver（接收者）** | 真正执行逻辑的对象（如 `TextEditor`、`Light`） |
| **Invoker（触发者）** | 持有命令对象并按需触发（按钮、队列、调度器），**不知道命令的具体内容** |
| **Client** | 创建命令并绑定接收者 |

关键点：**Invoker 与 Receiver 完全解耦**。按钮不需要知道它控制的是灯还是空调，只管 `execute()`。

## 三、代码实现

以带撤销的文本编辑器为例：

```java
/** 接收者：真正干活的业务对象 */
public class TextEditor {
    private final StringBuilder content = new StringBuilder();

    public void append(String text) { content.append(text); }

    public void deleteLast(int length) {
        content.delete(content.length() - length, content.length());
    }

    public String getContent() { return content.toString(); }
    public int length() { return content.length(); }
}
```

```java
/** 抽象命令 */
public interface Command {
    void execute();
    void undo();
}
```

```java
/** 具体命令：新增文本。撤销 = 删除刚加的那段 */
public class AppendCommand implements Command {
    private final TextEditor editor;
    private final String text;

    public AppendCommand(TextEditor editor, String text) {
        this.editor = editor;
        this.text = text;
    }

    @Override public void execute() { editor.append(text); }
    @Override public void undo()    { editor.deleteLast(text.length()); }
}
```

```java
/** 触发者：维护历史栈，提供撤销能力 */
public class CommandInvoker {
    private final Deque<Command> history = new ArrayDeque<>();

    public void execute(Command cmd) {
        cmd.execute();
        history.push(cmd);              // 记录到历史，供撤销
    }

    public boolean undo() {
        if (history.isEmpty()) return false;
        history.pop().undo();           // 反向执行
        return true;
    }
}
```

调用：

```java
TextEditor editor = new TextEditor();
CommandInvoker invoker = new CommandInvoker();

invoker.execute(new AppendCommand(editor, "hello "));
invoker.execute(new AppendCommand(editor, "world"));
System.out.println(editor.getContent());   // hello world

invoker.undo();
System.out.println(editor.getContent());   // hello
```

### 撤销的两种实现策略

| 策略 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| **反向操作** | 记录"加了多少"，撤销时反向删掉 | 内存占用小 | 反向逻辑容易写错，不是所有操作都可逆 |
| **状态快照** | 执行前保存状态（备忘录模式） | 实现简单，一定可逆 | 内存占用大 |

**优先反向操作，不可逆或计算复杂时用快照**。两者可混用：简单的用反向，复杂的（如批量格式化）用快照。

### 宏命令（组合的变体）

把多个命令组合成一个命令，可以对整个宏做撤销：

```java
public class MacroCommand implements Command {
    private final List<Command> commands;

    public MacroCommand(List<Command> commands) { this.commands = commands; }

    @Override public void execute() { commands.forEach(Command::execute); }

    @Override public void undo() {
        // 注意：撤销顺序与执行顺序相反
        for (int i = commands.size() - 1; i >= 0; i--) {
            commands.get(i).undo();
        }
    }
}
```

**撤销必须逆序**——这是实现撤销功能时最容易出错的地方。

## 四、对比辨析

### 4.1 命令 vs 策略

两者都把"行为"封装在对象里，区别在**封装的对象是什么、有没有接收者**：

| 维度 | 命令 | 策略 |
|---|---|---|
| 封装的内容 | **一个请求**（含参数、接收者、时序） | **一个算法** |
| 是否有 Receiver | 有，命令要调用它 | 通常没有（策略自己算） |
| 是否有 Invoker / 历史记录 | 有，支持排队、撤销、日志 | 无 |
| 支持撤销 | 是（核心能力） | 否 |
| 关注点 | 请求的**生命周期管理** | 算法的**可替换性** |

一句话：**策略关心"用哪种算法"，命令关心"这个请求何时、由谁、如何被执行，以及如何回退"。**

### 4.2 命令 vs 备忘录

两者都能实现撤销，但机制不同：

- **命令**：记录"做了什么"，撤销时**执行反向操作**；
- **备忘录**：记录"当时是什么状态"，撤销时**整体恢复快照**。

命令更省内存但要求操作可逆；备忘录反之。**复杂编辑器通常两者结合**：命令负责组织操作，快照负责兜底。

### 4.3 命令 vs 回调

`Runnable` 本质上就是一种命令——把"要做的事"封装成对象。差别在于命令模式进一步引入了 Invoker（队列/历史）和 undo，**为请求提供了完整的管理能力**；回调只是"一个可传递的函数"。

## 五、源码剖析

上一节看的是**它与备忘录、策略的边界**；本节看**框架里的"命令"长什么样**。哪些框架用了它，速查表在下一节——这里只回答一个问题：**如果命令的本质是"把请求封装成对象"，那 JDK 里最日常的实现叫什么。**

### 5.1 JDK · `Runnable`：命令模式，但没有撤销

```java
// java.lang.Runnable
@FunctionalInterface
public interface Runnable {
    void run();                      // ① 只有一个方法，没有 undo()
}
```

**结构差异**：这就是命令模式的最小形态——**把"要做什么"封装成一个对象，交由执行者择机执行**。`ThreadPoolExecutor.execute(Runnable)` 接收的就是一个封装好的请求，至于何时执行、在哪个线程执行，提交方完全不需要知道。

关键反直觉点：**`Runnable` 没有 `undo()`**。而几乎所有教科书讲命令模式都会从"撤销"切入，导致很多人把"支持撤销"当成命令模式的必要条件。实际上命令模式的**核心意图是"把请求对象化"**，它带来三个能力，撤销只是其中之一：

| 能力 | 靠命令对象的什么特性实现 | 典型例子 |
|---|---|---|
| **参数化调用方** | 请求成了对象，可作为参数传递 | `execute(Runnable)` |
| **排队与延迟执行** | 请求可被存入队列、延后取出 | 线程池任务队列、消息队列 |
| **撤销 / 重放 / 日志** | 请求携带了完备的参数，可反向操作或重复执行 | 编辑器 undo、ES 的 reindex |

**只有第三项需要额外的接口设计**（`undo()`），前两项靠"对象化"本身就能拿到。`Runnable` 选择了只保留前两项——这是绝大多数异步框架的取舍。

**不懂会误判**：因为教科书总讲撤销，容易以为"不支持撤销的场景就不算命令模式"，从而在讲线程池、消息队列时不敢归因到命令模式。**判断标准是"请求有没有被对象化"，而不是"能不能撤销"。**

### 5.2 JDK · `FutureTask`：命令 + 状态，以及"重复提交只跑一次"的真相

`FutureTask` 不只是"可取消的任务"，它内部有一个完整的状态机：

```java
// 精简自 java.util.concurrent.FutureTask
public class FutureTask<V> implements RunnableFuture<V> {
    private volatile int state;                  // ② 用 int 常量表达 7 种状态
    private static final int NEW          = 0;
    private static final int COMPLETING   = 1;
    private static final int NORMAL       = 2;
    private static final int EXCEPTIONAL  = 3;
    private static final int CANCELLED    = 4;
    private static final int INTERRUPTING = 5;
    private static final int INTERRUPTED  = 6;

    private Callable<V> callable;

    public void run() {
        if (state != NEW ||
            !RUNNER.compareAndSet(this, null, Thread.currentThread()))
            return;                              // ③ 非 NEW 状态，或抢不到执行权 → 直接返回
        try {
            Callable<V> c = callable;
            if (c != null && state == NEW) {
                V result;
                boolean ran;
                try {
                    result = c.call();
                    ran = true;
                } catch (Throwable ex) {
                    result = null;
                    ran = false;
                    setException(ex);
                }
                if (ran) set(result);            // ④ CAS 把 state 推到 NORMAL / EXCEPTIONAL
            }
        } finally {
            runner = null;
            int s = state;
            if (s >= INTERRUPTING) handlePossibleCancellationInterrupt(s);
        }
    }
}
```

**结构差异**：`FutureTask` 是**命令 + 状态 + 备忘录**的合体——它封装了请求（`callable`），用一个 `state` 字段表达生命周期，并把**执行结果保存下来供反复查询**（备忘录的语义）。

三个值得记住的点：

1. **`state` 用 `int` 常量 + CAS，不用状态类对象**。原因很实际：这是并发热路径，每次状态转移都分配一个对象是不可接受的。**状态模式的"一个状态一个类"在这里是负收益。**
2. **`run()` 开头那两行解释了一个经典现象**：同一个 `FutureTask` 提交两次，**只会执行一次**。因为第一次执行后 `state != NEW`，第二次进入 `run()` 时会在第一行直接 `return`。这不是线程池去重，而是任务**自己**用状态做了幂等保护。
3. **`RUNNER` 的 CAS 是防"重复执行"的第一道闸**：`state` 检查与 CAS 抢执行权是两道独立的保护——即使两个线程同时看到 `state == NEW`，也只有抢到 `RUNNER` 的那个会往下走。

**不懂会误判**：把 `FutureTask` 当成"只是 `Runnable` + `get()`"，会无法解释两个常见现象——① 重复提交为什么只执行一次；② `cancel()` 之后 `run()` 为什么进不去。**这两个行为都由 `state` 一个字段决定**，而 `state` 的存在正是"命令可以有自己的生命周期"这一模式思想的产物。

### 5.3 MyBatis · `BatchExecutor`：命令的"排队"能力落到 SQL 上

```java
// 精简自 org.apache.ibatis.executor.BatchExecutor
@Override
public int doUpdate(MappedStatement ms, Object parameterObject) throws SQLException {
    // ...
    final Statement stmt = stmtList.get(lastSql).get(...);
    applyTransactionTimeout(stmt);
    handler.parameterize(stmt);
    BatchResult batchResult = batchResultList.get(lastSql);
    // ...
    return handler.update(stmt);                 // ⑤ 只把参数塞进 Statement，不提交
}

@Override
public List<BatchResult> doFlushStatements(boolean isRollback) throws SQLException {
    List<BatchResult> results = new ArrayList<>();
    if (isRollback) return results;
    for (int i = 0, n = statementList.size(); i < n; i++) {
        Statement stmt = statementList.get(i);
        // ...
        results.add(handler.getBatchResult(ms, parameterObject, stmt));   // ⑥ 此刻才真正执行
    }
    return results;
}
```

**结构差异**：`BatchExecutor` 把 `doUpdate()` 与"真正执行 SQL"**拆开了**——`doUpdate()` 只是把参数攒起来，`doFlushStatements()` 才批量下发。这是命令模式最实用的那个能力：**控制执行的时机与批次**。

为什么值得这么设计：JDBC 的 `addBatch()` / `executeBatch()` 本身就有这个语义，但 `BatchExecutor` 把它提升到了**会话级别**——业务代码只管调 `insert()`，攒批与下发由 Executor 决定。**这正是"调用者与执行者解耦"**：调用者不需要知道"什么时候会真的写库"。

**代价**：`doUpdate()` 返回值在攒批阶段**不可信**（此时还没执行，拿不到影响行数）。这是命令模式"延迟执行"换取批量吞吐时必然付出的代价——**返回值语义被削弱**。

**不懂会误判**：在 `BatchExecutor` 下用 `insert()` 的返回值做业务判断（如"插入成功则继续"），会得到错误结论。**识别"这个 executor 是延迟执行的"，比记住返回值是 int 重要得多。**

## 六、使用场景与面试问答

### JDK 与框架中的实例

| 位置 | 命令对象 | Invoker |
|---|---|---|
| `Runnable` / `Callable` | 被封装的任务 | `Thread` / `ExecutorService` |
| `ExecutorService.submit(task)` | 任务对象进队列等待 | 线程池 |
| Spring `TransactionSynchronization` | 事务同步回调（`afterCommit` 等） | 事务管理器 |
| JDBC 批处理 `addBatch()` / `executeBatch()` | 累积的 SQL 语句 | `Statement` |
| 数据库 undo log | 记录反向操作 | 事务回滚器 |
| MQ 消息 | 序列化的请求对象 | Broker 与消费者 |
| Swing `Action` | UI 动作 | 按钮/菜单 |

`Runnable` 提交到线程池是命令模式最朴素的形态：**任务被封装成对象放入队列，由线程池这个 Invoker 决定何时执行**。区别只在于它没有 undo。

### 面试问答

**Q1：命令模式的本质价值是什么？**

把"请求"**对象化**，从而获得对象的全部能力：可存储（日志）、可传输（网络/MQ）、可排队（异步、削峰）、可组合（宏命令）、可回退（撤销）、可审计（操作记录）。**没有对象化，这些能力都无从谈起**——这是它存在的唯一理由。

**Q2：撤销功能怎么设计？**

两条路：① **反向操作**——每个命令实现 `undo()`，执行相反的逻辑（`append` 对应 `deleteLast`）；② **状态快照**——执行前保存完整状态，撤销时整体恢复。工程上按操作复杂度选择，并注意：**撤销要逆序执行**（宏命令中最容易出错）、**历史栈要有上限**（防止内存无限增长，超出时丢弃最早的记录）。

**Q3：命令模式和消息队列有什么关系？**

命令模式是 MQ 的**思想源头**：一条 MQ 消息就是"被序列化的命令对象"（包含要做什么、参数、幂等键），Broker 是 Invoker（决定何时投递给谁），消费者是 Receiver。理解了命令模式，就理解了为什么 MQ 天然支持削峰、重放、死信——**因为请求被对象化了**。

**Q4：`Runnable` 是命令模式吗？**

是，且是最简化的一种——只保留了 `execute()`（即 `run()`），**去掉了 Receiver 显式引用、去掉了 undo、去掉了历史记录**。这正是设计模式的现实形态：框架往往只取用模式的某一部分能力。

**Q5：命令模式会不会导致类爆炸？**

会，这是它的主要代价——每个操作一个类。缓解手段：① **Lambda 替代**——无状态命令直接用 `Runnable`/`Consumer`，`invoker.execute(() -> editor.append("x"))` 一行即可；② **泛型化命令**——把命令参数抽出来做成一个通用 `GenericCommand<T>`，减少类数量；③ 只在**确实需要撤销/排队/日志**时才上命令模式，只为"解耦"而用属于过度设计。
