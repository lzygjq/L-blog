---
date: 2026-09-11
---

# 原型模式（Prototype）

## 一、问题场景

有两类需求用"重新 `new`"解决不划算：

1. **创建成本高**——对象构造过程要查数据库、读文件、跑复杂计算，而你需要的是它的一个副本；
2. **需要一个高度相似的副本**——大量对象只有少数字段不同（如报表模板、活动规则），逐个 set 既啰嗦又容易漏。

```java
// 反例：为了得到"和 template 只差一个字段"的对象，重新走了一遍昂贵构造
Report r = new Report();
r.setTitle(template.getTitle());
r.setColumns(template.getColumns());     // 逐个字段拷贝，字段一多就漏
r.setFilters(template.getFilters());
// ... 20 个字段
```

原型模式的方案：**让对象自己负责复制自己**。

## 二、结构与角色

```
┌──────────────────────┐
│  <<interface>>       │
│     Prototype        │
│  + clone() : Prototype│  ← 声明复制自身的接口
└──────────┬───────────┘
           │ implements
┌──────────┴────────────┐
│  ConcretePrototype    │
│  - field              │
│  + clone() : Prototype│  ← 返回自身的副本
└───────────────────────┘
           ▲
           │ 调用 clone()
      ┌────┴────┐
      │  Client │
      └─────────┘
```

三个角色：**抽象原型**（声明 clone）、**具体原型**（实现 clone）、**客户端**（通过 clone 获得副本而非 new）。

## 三、实现

### 3.1 基础写法

```java
public class Report implements Cloneable {
    private String title;
    private List<String> columns;
    private Map<String, Object> filters;

    @Override
    public Report clone() {
        try {
            return (Report) super.clone();      // Object.clone()：按位复制（浅克隆）
        } catch (CloneNotSupportedException e) {
            throw new AssertionError("实现了 Cloneable 不应抛出此异常", e);
        }
    }
    // getter/setter 省略
}
```

两个易错点：① `Cloneable` 是**标记接口**，不实现它时 `super.clone()` 会抛 `CloneNotSupportedException`；② `Object.clone()` 返回 `Object`，需要强转，且它做的是**浅克隆**。

### 3.2 浅克隆的问题

```java
Report origin = new Report();
origin.setColumns(new ArrayList<>(List.of("姓名", "工号")));

Report copy = origin.clone();
copy.getColumns().add("部门");           // 修改副本的集合

System.out.println(origin.getColumns()); // [姓名, 工号, 部门] ← 原对象被污染了
```

原因：`super.clone()` 只复制字段的**引用值**，`origin` 与 `copy` 指向**同一个 `List` 对象**。

```
origin ──┐
         ├──▶ List 实例（共享）
copy ────┘
```

### 3.3 深克隆的三种实现

**方式一：逐层递归 clone**（可控但繁琐）

```java
@Override
public Report clone() {
    try {
        Report copy = (Report) super.clone();
        copy.columns = new ArrayList<>(this.columns);          // 集合重新建
        copy.filters = new HashMap<>(this.filters);            // Map 重新建
        return copy;
    } catch (CloneNotSupportedException e) {
        throw new AssertionError(e);
    }
}
```

触发条件：需要嵌套对象的**每一层**都实现 `Cloneable` 并重写 `clone()`。对象图深时很容易漏。

**方式二：序列化克隆**（省事，但要求全链路可序列化）

```java
@SuppressWarnings("unchecked")
public static <T extends Serializable> T deepClone(T obj) {
    try (ByteArrayOutputStream bos = new ByteArrayOutputStream();
         ObjectOutputStream oos = new ObjectOutputStream(bos)) {
        oos.writeObject(obj);
        try (ObjectInputStream ois = new ObjectInputStream(new ByteArrayInputStream(bos.toByteArray()))) {
            return (T) ois.readObject();
        }
    } catch (IOException | ClassNotFoundException e) {
        throw new IllegalStateException("深克隆失败", e);
    }
}
```

**方式三：JSON 序列化克隆**（工程中最常用）

```java
Report copy = JSON.parseObject(JSON.toJSONString(origin), Report.class);
```

优点：代码最少、不要求实现 `Serializable`（fastjson2/Jackson 均可）。缺点：**有性能开销**，且对循环引用、泛型复杂结构需要额外配置。适合"需要副本但不在热点路径"的场景。

> 反序列化注意：用 `readObject()` 得到的对象**不会走构造器**——这也是"序列化能破坏单例"的原因（见[单例模式](/java/design-patterns/creational/singleton/)）。

## 四、优缺点

**优点**

1. 隐藏创建细节，客户端不需要知道对象怎么造出来的；
2. 对"创建成本高"的对象，克隆比重新构造快得多；
3. 可以动态增加/减少产品种类——注册一个原型实例即可，无需新增工厂类（对比工厂方法需要成对加类）。

**缺点**

1. **深克隆实现复杂**，尤其对象图嵌套深、存在循环引用时；
2. 每个具体原型都必须实现 `clone()`，侵入性强；
3. 与 `final` 字段、`Cloneable` 语义容易踩坑。

## 五、使用场景与边界

**适用**：报表/单据模板复制、游戏中的对象实例化（子弹、敌人）、大量相似但少数字段不同的配置对象、需要"快照 + 回滚"的场景（与[备忘录模式](/java/design-patterns/behavioral/)配合）。

**一个高频误解**：**Spring 的 `@Scope("prototype")` 不是原型模式**。它是"每次请求容器都创建新实例"，走的是反射构造，并未使用 `clone()`。名字相同，机制不同——面试被问到要主动拆开说。

**另一个真实用例**：`ArrayList` / `HashMap` 的 `clone()` 都是**浅克隆**（`ArrayList.clone()` 内部 `Arrays.copyOf` 复制元素引用），集合嵌套集合时同样需要自己处理深拷贝。

## 六、面试问答

**Q1：浅克隆和深克隆的区别？**
浅克隆只复制字段的引用值，引用类型成员与原对象**共享同一实例**；深克隆会递归复制引用指向的对象，副本与原对象完全独立。`Object.clone()` 默认是浅克隆。

**Q2：实现深克隆有哪几种方式，怎么选？**
① 逐层递归 `clone()`——可控、无额外依赖，但对象图复杂时容易漏；② Java 序列化——省事但要求全链路 `Serializable`，性能差；③ JSON 序列化（fastjson2/Jackson）——代码最少，工程中最常用，适合非热点路径。**若对象结构简单且性能敏感，用手写递归；否则用 JSON 序列化。**

**Q3：原型模式为什么要实现 `Cloneable`？**
`Object.clone()` 会检查 `this instanceof Cloneable`，否则抛 `CloneNotSupportedException`。它是一个**标记接口**（无方法），作用是告知 JVM 该对象允许被按位复制。

**Q4：原型模式和工厂模式怎么选？**
工厂关注"造**什么类型**"，适合产品种类需要扩展的场景；原型关注"**复制哪个已有实例**"，适合创建成本高或需要动态注册产品的场景。原型可以免去工厂继承体系——用"原型注册表"（`Map<String, Prototype>`）在运行时注册即可。
