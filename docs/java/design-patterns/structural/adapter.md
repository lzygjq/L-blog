# 适配器模式（Adapter）

## 一、问题场景

系统里已经有一个（或多个）**不能改、也不该改**的类：第三方 SDK、老系统遗留接口、外部硬件协议。它的方法名、参数形态与你系统内部的接口约定不一致。

```java
// 现有系统统一依赖这个接口
public interface PayChannel {
    void pay(String orderNo, long amountInCents);
}

// 三方 SDK 提供的是完全不同的签名，且不能修改它的源码
public class WechatPaySdk {
    public String unifiedOrder(String outTradeNo, String totalFeeYuan, String sign) { ... }
}
```

三条常见的死路：① 改三方 SDK——不可行；② 改现有接口去迁就三方——污染整个系统；③ 在每个调用点写转换代码——重复且散乱。

适配器的方案：**加一个中间类做接口转换**，让不兼容的两边能协作。

## 二、结构与角色

```
┌──────────────┐      ┌─────────────────┐
│   Client     │─────▶│     Target      │  ← 目标接口：系统内部依赖的抽象
└──────────────┘      │ + request()     │
                      └────────┬────────┘
                               │ implements
                      ┌────────┴────────┐        ┌───────────────┐
                      │     Adapter     │───────▶│   Adaptee     │  ← 被适配者：已有的、不兼容的类
                      │ + request()     │ 持有/继承 │ + specificRequest()
                      └─────────────────┘        └───────────────┘
```

| 角色 | 职责 |
|---|---|
| Target | 系统内部使用的接口（客户端只认识它） |
| Adaptee | 需要被接入的已有类（接口不兼容） |
| Adapter | 转换层：实现 Target，内部调用 Adaptee |
| Client | 调用方，只依赖 Target |

## 三、类适配器（继承被适配者）

```java
public interface PayChannel {                       // Target
    void pay(String orderNo, long amountInCents);
}

public class WechatPaySdk {                         // Adaptee（不可修改）
    public String unifiedOrder(String outTradeNo, String totalFeeYuan, String sign) {
        return "wechat-pay-result";
    }
}

public class WechatPayAdapter extends WechatPaySdk implements PayChannel {   // Adapter
    @Override
    public void pay(String orderNo, long amountInCents) {
        // 转换：分 → 元、补齐签名参数
        String yuan = BigDecimal.valueOf(amountInCents, 2).toPlainString();
        String result = unifiedOrder(orderNo, yuan, signOf(orderNo));
        if (result == null) throw new IllegalStateException("微信下单失败");
    }
}
```

**关键机制**：通过**继承**获得 `Adaptee` 的方法，同时**实现** `Target` 接口——这在 C++ 里是多重继承，在 Java 里靠"继承类 + 实现接口"模拟。

**缺点**：Java 单继承，适配器继承 `Adaptee` 后就**不能再继承其他类**；同时因为继承了 `Adaptee`，`Adaptee` 的全部方法会被暴露给客户端（接口污染）。

## 四、对象适配器（持有被适配者）—— 推荐

```java
public class WechatPayAdapter implements PayChannel {      // 只实现 Target
    private final WechatPaySdk sdk;                        // 用组合持有 Adaptee

    public WechatPayAdapter(WechatPaySdk sdk) { this.sdk = sdk; }

    @Override
    public void pay(String orderNo, long amountInCents) {
        String yuan = BigDecimal.valueOf(amountInCents, 2).toPlainString();
        sdk.unifiedOrder(orderNo, yuan, signOf(orderNo));
    }
}
```

**优势**：不受单继承限制（可以再继承别的类）；不暴露 `Adaptee` 的多余方法；**可以适配多个 Adaptee**（想同时兼容支付宝和微信，持有两个引用即可）。符合合成复用原则，是工程中的默认选择。

## 五、两种写法对比

| 维度 | 类适配器 | 对象适配器 |
|---|---|---|
| 复用方式 | **继承** Adaptee | **组合** Adaptee |
| 继承限制 | 受 Java 单继承约束 | 无限制 |
| 适配多个 Adaptee | 不可能 | 可以 |
| 覆写 Adaptee 行为 | 可以（能重写父类方法） | 需要子类化 Adaptee 才能改 |
| 接口污染 | 会暴露 Adaptee 全部方法 | 只暴露 Target 的方法 |
| 耦合度 | 高（编译期绑定） | 低 |
| 推荐度 | 低 | **高** |

## 六、两个实用变体

### 6.1 缺省适配器（Default Adapter）

当一个接口方法很多、但实现类通常只关心其中一两个时，先提供一个**空实现的抽象类**作为适配层：

```java
public interface ApplicationListener {          // 方法很多的历史接口
    void onStarted();
    void onStopped();
    void onFailed(Throwable t);
    // ... 还有 10 个方法
}

public abstract class DefaultApplicationListener implements ApplicationListener {
    public void onStarted() {}                  // 全部空实现
    public void onStopped() {}
    public void onFailed(Throwable t) {}
}

// 使用方只覆写关心的那个
public class MyListener extends DefaultApplicationListener {
    @Override public void onFailed(Throwable t) { log.error("启动失败", t); }
}
```

> JDK 中的例子：`java.awt.event.WindowAdapter`、`MouseAdapter`——它们就是 `WindowListener` / `MouseListener` 的缺省适配器。

### 6.2 双向适配器

同时实现 `Target` 与 `Adaptee` 两套接口，使两边都能互相调用。用于"过渡期新旧系统并存、双向往来"的场景，实现复杂度较高，通常只在迁移窗口期临时使用。

## 七、JDK 与框架中的实现

| 实现 | Target | Adaptee | 说明 |
|---|---|---|---|
| `InputStreamReader` | `Reader` | `InputStream` | **最经典的适配器**：把字节流适配成字符流 |
| `OutputStreamWriter` | `Writer` | `OutputStream` | 同上，输出方向 |
| `Arrays.asList(T[])` | `List` | 数组 | 把数组适配成 List（**注意：它是视图，不支持增删**） |
| `Collections.list(Enumeration)` | `ArrayList` | `Enumeration` | 老式枚举 → 新式集合 |
| `Collections.enumeration(Collection)` | `Enumeration` | `Collection` | 反向适配 |
| `Executors.callable(Runnable)` | `Callable` | `Runnable` | 内部类 `RunnableAdapter` |
| **Spring MVC `HandlerAdapter`** | 统一的 `handle()` 调用协议 | 各种形态的 Handler | 见下文 |

### Spring MVC 中的 HandlerAdapter（面试高频）

`DispatcherServlet` 需要支持多种 Handler：实现了 `Controller` 接口的、用 `@RequestMapping` 注解的方法、`HttpRequestHandler`、静态资源处理器……它们的调用方式各不相同。

`HandlerAdapter` 就是适配器族：

```
DispatcherServlet ──▶ HandlerAdapter（Target）
                          ├── RequestMappingHandlerAdapter   ← 适配 @RequestMapping 方法
                          ├── HttpRequestHandlerAdapter     ← 适配 HttpRequestHandler
                          └── SimpleControllerHandlerAdapter← 适配 Controller 接口
```

`DispatcherServlet` 只做一件事：遍历已注册的 `HandlerAdapter`，问 `supports(handler)`，找到能处理当前 Handler 的那个，调用统一的 `handle()`。**新增一种 Handler 类型时，只需新增一个 HandlerAdapter，DispatcherServlet 完全不用改**——这是适配器模式在框架层面的教科书用法。

## 八、与相邻模式的边界

| 对比 | 区别 |
|---|---|
| 适配器 vs 装饰者 | 适配器**改变接口**（不同接口之间转换），装饰者**不改变接口**（同一接口上叠功能） |
| 适配器 vs 代理 | 适配器是"让 A 能用 B"，不改变功能；代理是"控制对 A 的访问"，同接口 |
| 适配器 vs 外观 | 适配器面向**单个**不兼容接口做转换；外观面向**一整个子系统**收拢入口，不转换接口 |
| 适配器 vs 桥接 | 适配器是**事后补救**（已有类不兼容）；桥接是**事前设计**（预留两个维度独立变化） |

## 九、使用场景

- **接入第三方**：支付（微信/支付宝/银联）、短信、物流、地图、OCR、对象存储——每家 SDK 一套签名，统一用适配器收口为内部接口；
- **老系统迁移**：新接口逐步替换旧接口期间的兼容层；
- **硬件与协议**：串口/扫码枪/打印机的驱动差异；
- **框架扩展点**：`HandlerAdapter`、`RowMapper`、`TypeHandler` 等都是"用适配器消化差异"的思路。

## 十、面试问答

**Q1：类适配器和对象适配器的区别，你会选哪个？**
类适配器靠**继承** Adaptee，受 Java 单继承限制、会暴露 Adaptee 的多余方法；对象适配器靠**组合**持有 Adaptee，可适配多个目标、不污染接口。**优先对象适配器**，类适配器只在需要覆写 Adaptee 行为时才有优势。

**Q2：适配器模式和装饰者模式怎么区分？**
看**接口是否改变**。适配器让客户端通过一个**不同的接口**访问对象（接口转换）；装饰者让客户端通过**同一个接口**访问被层层包装的对象（功能增强）。实践中 `InputStreamReader` 是适配器，`BufferedInputStream` 是装饰者。

**Q3：`Arrays.asList()` 是适配器吗？使用时有什么坑？**
是——把数组适配成 `List` 接口。坑在于它返回的是 `Arrays` 的内部类 `ArrayList`（不是 `java.util.ArrayList`），**底层仍是原数组的视图**：`add` / `remove` 会抛 `UnsupportedOperationException`，而 `set` 会**直接修改原数组**。要真正的列表必须 `new ArrayList<>(Arrays.asList(arr))`。

**Q4：Spring MVC 的 `HandlerAdapter` 解决了什么问题？**
它解决了"`DispatcherServlet` 如何统一调用形态各异的 Handler"的问题。`DispatcherServlet` 不关心 Handler 是接口实现还是注解方法，只认 `HandlerAdapter` 的 `supports()` + `handle()`。新增 Handler 类型只需加一个适配器，符合开闭原则。

**Q5：什么时候不该用适配器？**
当你**有权修改**被适配对象的接口时。适配器是给"不可改"的代码准备的补救层，是有成本的抽象——如果两边都是自己的代码，直接改接口比加适配器更干净。
