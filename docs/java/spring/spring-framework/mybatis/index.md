---
order: 5
date: 2026-09-11
title: MyBatis 执行流程与集成
desc: 四大对象、#{} vs ${}、延迟加载的代理原理、两级缓存的坑、SqlSessionTemplate
---

# MyBatis 执行流程与 Spring 集成

## 一、问题场景

JDBC 的原始写法要求手写大量样板代码：

```java
String sql = "SELECT id, name FROM user WHERE id = ?";
PreparedStatement ps = conn.prepareStatement(sql);
ps.setLong(1, id);
ResultSet rs = ps.executeQuery();
User user = null;
if (rs.next()) {
    user = new User();
    user.setId(rs.getLong("id"));
    user.setName(rs.getString("name"));
}
// 每个查询都要复制这一套参数绑定 + 结果映射
```

MyBatis 解决两个核心痛点：**参数绑定**与**结果集映射**。而它与 Spring 集成后，进一步解决了"SqlSession 线程不安全"和"与事务协同"的问题——这部分比 MyBatis 本身的执行流程更容易被问倒。

## 二、核心执行流程

```
Mapper 接口方法调用
      │  JDK 动态代理（MapperProxy）
      ▼
   SqlSession
      │
      ▼
┌──────────────┐
│  Executor    │  ① 一级缓存 / 二级缓存查找
│              │  ② 生成 BoundSql（解析动态 SQL、绑定参数）
└──────┬───────┘
       ▼
┌──────────────┐
│StatementHandler│ ③ 创建 Statement、设置参数、执行 SQL
└──┬────────┬──┘
   ▼        ▼
Parameter  ResultSet
Handler    Handler      ④ 参数绑定 / 结果集映射
   │        │
   └───┬────┘
       ▼
  TypeHandler           ⑤ 类型转换（Java 类型 ↔ JDBC 类型）
```

### 用文字走一遍

上面这张图是"结构图"，下面按执行顺序把链路讲清楚——**关键在于搞明白每一步是谁在干活、以及为什么需要这一层**。

**第 1 步：代理把"方法调用"翻译成"SQL 指令"。**
业务代码调用 `userMapper.selectById(1L)`，但注入的 `userMapper` 并不是实现类，而是 `MapperProxyFactory` 生成的 JDK 动态代理。调用先被 `MapperProxy.invoke()` 拦截，它做一件核心的事：**把"接口名 + 方法名"拼成一个字符串作为 `MappedStatement` 的 id**（如 `com.example.mapper.UserMapper.selectById`），再从 `Configuration` 这个"注册表"里取出对应的 `MappedStatement`。

`MappedStatement` 是这一步的关键产物——它把一条 SQL 的**全部元信息**打包在一起：SQL 文本、参数映射、结果映射（`resultMap`）、缓存配置、超时设置等。**所以代理层完成的是"语义转换"：把面向对象的方法调用，转成了面向 SQL 的执行请求。**

**第 2 步：代理把请求委托给 `SqlSession`。**
代理自己不执行 SQL，它把 `MappedStatement` 和参数交给 `SqlSession`。这里有个容易被忽略的点：**`SqlSession` 是线程不安全的**（内部持有 `Executor` 和事务状态），不能直接做成单例 Bean。所以在 Spring 环境下，实际交付的是一个 `SqlSessionTemplate`——它内部持有 `SqlSession` 的动态代理，每次调用时通过 `TransactionSynchronizationManager` 取"当前事务绑定的 `SqlSession`"，没有事务才新建。**这一步是 MyBatis 与 Spring 事务能够协同的接缝**（详见第七节）。

**第 3 步：`Executor` 做调度——查缓存 + 生成最终 SQL。**
`SqlSession` 把执行权交给 `Executor`，它是真正的"执行调度者"，按顺序做三件事：

1. **查缓存**：先查二级缓存（`namespace` 级，跨会话），再查一级缓存（`SqlSession` 级）。命中就直接返回，**整条 JDBC 链路都不会走到**；
2. **生成 `BoundSql`**：解析动态标签（`<if>` / `<foreach>` / `<where>` 等），把条件拼装成最终可执行的 SQL 文本，同时建立"参数对象 ↔ SQL 中每个 `?`"的对应关系；
3. **选定执行器**：`SimpleExecutor`（默认，每次新建 Statement）、`ReuseExecutor`（复用 Statement）、`BatchExecutor`（批量提交）——这是**策略模式**，由配置或调用时指定。

**第 4 步：`StatementHandler` 落到 JDBC。**
`Executor` 通过 `StatementHandler` 与 JDBC 打交道。它拿着 `BoundSql` 创建 `PreparedStatement`（顺带设置 `fetchSize`、`queryTimeout` 等），然后**把参数绑定这件事委托给 `ParameterHandler`**——`StatementHandler` 自己不管参数细节，这就是"职责单一"的体现。

**第 5 步：`ParameterHandler` 完成参数绑定。**
它遍历 `BoundSql` 中记录的参数映射，为 SQL 里的每一个 `?` 调用对应的 `TypeHandler`，把 Java 值写进 `PreparedStatement`——例如 `ps.setLong(1, 1L)`。**这一步就是 `#{id}` 最终变成 `?` 并被赋值的时刻**，也是"预编译天然防注入"的落点：参数始终以"值"的形式绑定，不会被拼进 SQL 文本。

**第 6 步：执行 SQL，并把结果集映射回对象。**
`PreparedStatement.execute()` 把 SQL 交给数据库，返回的 `ResultSet` 由 `ResultSetHandler` 处理：按 `resultMap` / `resultType` 声明的规则，把结果集的每一行映射成一个 Java 对象（复杂关联还会递归调用嵌套映射）。字段级别的 JDBC 类型 → Java 类型转换，同样由 `TypeHandler` 完成。

**第 7 步：回写缓存并返回。**
`Executor` 把查询结果放进一级缓存（若开启了二级缓存则同时写入），然后沿调用链原路返回。在 Spring 环境下，若无事务，`SqlSessionTemplate` 会在这一步**自动 commit 并归还会话**；有事务时则交由 `PlatformTransactionManager` 统一控制提交时机。

### 一句话抓住主线

把七步压缩成一句话：

```
MapperProxy 把「方法」翻译成「MappedStatement」
     ↓
Executor   负责「查缓存 + 生成最终 SQL」（调度层）
     ↓
StatementHandler + ParameterHandler  负责「落到 JDBC」（执行层）
     ↓
ResultSetHandler                     负责「把结果搬回来」（映射层）
```

**这条链的设计意图是"三层责任分离"**：代理层只做语义转换（不知道 SQL 怎么写），调度层只做缓存与 SQL 生成（不碰 JDBC API），执行层只做 JDBC 操作与类型转换（不关心业务语义）。**理解了这三层边界，`Executor` 为什么不直接执行 SQL、`ParameterHandler` 为什么独立存在、四大对象为什么都是插件拦截点——这些问题就都能自己推出来了。**

| 组件 | 职责 |
|---|---|
| **`SqlSessionFactory`** | 全局单例，持有 `Configuration`（所有 MappedStatement 的注册表） |
| **`SqlSession`** | 一次数据库会话，**线程不安全**，负责执行 SQL、管理事务 |
| **`Executor`** | SQL 执行调度者，负责缓存与懒加载（`SimpleExecutor` / `ReuseExecutor` / `BatchExecutor`） |
| **`StatementHandler`** | 创建并操作 `PreparedStatement` |
| **`ParameterHandler`** | 把 Java 参数绑定到 SQL 占位符 |
| **`ResultSetHandler`** | 把 `ResultSet` 映射为 Java 对象 |
| **`TypeHandler`** | 单个字段的类型转换（可用 `TypeHandlerRegistry` 自定义） |

**四大对象（`Executor`、`StatementHandler`、`ParameterHandler`、`ResultSetHandler`）都是插件（`@Intercepts`）的拦截点**——这是分页插件（PageHelper）、多租户插件、数据权限插件的实现基础。

## 三、Mapper 接口为什么没有实现类

```java
public interface UserMapper {          // 没有 UserMapperImpl
    User selectById(Long id);
}

// 却能直接注入使用
@Autowired private UserMapper userMapper;
```

因为 MyBatis 用 **JDK 动态代理**在运行时生成了实现：

```java
// MapperProxyFactory#newInstance（简化）
public T newInstance(SqlSession sqlSession) {
    final MapperProxy<T> mapperProxy = new MapperProxy<>(sqlSession, mapperInterface, methodCache);
    return (T) Proxy.newProxyInstance(
        mapperInterface.getClassLoader(),
        new Class[]{mapperInterface},
        mapperProxy);                          // ← 代理实现接口
}
```

调用时 `MapperProxy.invoke()` 的逻辑是：**把"接口方法"翻译成"`MappedStatement` 的 id"（即 `接口全限定名.方法名`），然后委托 `SqlSession` 执行**。

```java
public Object invoke(Object proxy, Method method, Object[] args) {
    // Object 方法（toString/equals/hashCode）直接反射调用
    if (Object.class.equals(method.getDeclaringClass())) {
        return method.invoke(this, args);
    }
    // 其它方法包装成 MapperMethod 并执行
    return cachedInvoker(method).invoke(proxy, method, args, sqlSession);
}
```

**这解释了两个常见疑问**：① 为什么 Mapper 接口可以重载但要小心（方法名相同会映射到同一个 `MappedStatement` id，导致冲突）；② 为什么 Mapper 方法的入参超过一个时必须用 `@Param`（否则 MyBatis 只能用 `arg0` / `param1` 这样的默认名，且无法区分）。

## 四、`#{}` 与 `${}`——必考的安全点

| 写法 | 处理方式 | 安全性 | 适用场景 |
|---|---|---|---|
| **`#{}`** | 生成 `?` 占位符，通过 `PreparedStatement` 预编译绑定 | ✅ **安全**，天然防注入 | **默认选择**，所有参数 |
| **`${}`** | **字符串直接拼接**进 SQL | ❌ **有 SQL 注入风险** | 表名、字段名、`ORDER BY` 等无法用占位符的位置 |

```xml
<!-- ✓ 安全：参数以占位符传入 -->
<select id="selectByName" resultType="User">
    SELECT * FROM user WHERE name = #{name}
</select>

<!-- ✗ 危险：直接拼接，输入 "' OR '1'='1" 即可绕过条件 -->
<select id="selectByNameUnsafe" resultType="User">
    SELECT * FROM user WHERE name = '${name}'
</select>

<!-- 合理使用：动态排序字段无法用占位符，但必须做白名单校验 -->
<select id="selectByOrder" resultType="User">
    SELECT * FROM user ORDER BY ${orderColumn}
</select>
```

**为什么排序字段只能用 `${}` ？** 因为 SQL 预编译时，`?` 只能替代**值**，不能替代**标识符**（表名、列名、关键字）。数据库在解析阶段就需要知道完整的 SQL 结构。

**使用 `${}` 的安全底线：白名单校验。** 绝不能把用户输入直接传入：

```java
private static final Set<String> ALLOWED = Set.of("id", "name", "create_time");

public List<User> list(String orderBy) {
    if (!ALLOWED.contains(orderBy)) {
        throw new IllegalArgumentException("非法排序字段");
    }
    return userMapper.selectByOrder(orderBy);
}
```

## 五、延迟加载：关联数据的按需触发

### 要解决的问题

一对多关联查询里，主表数据几乎一定会被用到，**关联数据却未必**：

```java
List<Order> orders = orderMapper.selectAll();       // 查 100 个订单
for (Order o : orders) {
    // 如果这里只需要订单号，却把 100 个订单的明细一起查出来 —— 白干
    System.out.println(o.getOrderNo());
}
```

**如果关联数据在查询时就一并取出，等于为"可能不用的数据"付了查询代价。** 延迟加载（懒加载）的思路是：**关联属性先留空，等真正 `get` 的时候再查库**。

### 实现原理：代理 + 拦截器

MyBatis 用 **CGLIB 为目标对象生成代理子类**（`JavassistProxyFactory` 是另一种可选实现）：

```
orderMapper.selectAll()
      ▼
ResultSetHandler 映射结果 → 对每个 Order 对象
      ├─ 立即填充普通字段（id / orderNo / amount ...）
      └─ 关联字段 orderItems 保持为 null，但对象已被包成代理
                ▼
        返回给业务代码的是「Order 的 CGLIB 代理子类」
      ▼
业务调用 order.getOrderItems()
      ▼
进入代理的拦截逻辑（MapMethodProxy / lazyLoader）
      ├─ 判断 orderItems 是否已加载？
      │     ├─ 已加载 → 直接返回字段值
      │     └─ 未加载 → 执行预先登记的关联 SQL（ResultLoader）
      │                   → 查询结果 setOrderItems(list)
      │                   → 返回
      └─ 标记为已加载（同一对象只触发一次）
```

**三个关键点：**

**① 延迟加载只对"嵌套查询"生效。** 触发的前提是关联是通过**独立的子查询**（`<association select="...">` / `<collection select="...">`）完成的——只有这时才有"待执行"的 SQL 可以推迟。如果用的是 **join 查询**（一条 SQL 用 `LEFT JOIN` 把数据全取回来），关联数据已经随主查询一起返回了，**没有可延迟的余地**：

```xml
<!-- ✓ 可延迟：嵌套查询，子 SQL 等被调用时才执行 -->
<resultMap id="orderMap" type="Order">
    <id column="id" property="id"/>
    <collection property="items" column="id"
                select="com.example.mapper.ItemMapper.selectByOrderId"/>
</resultMap>

<!-- ✗ 不可延迟：join 一次性取回，数据已在手上了 -->
<resultMap id="orderJoinMap" type="Order">
    <id column="id" property="id"/>
    <collection property="items" resultMap="itemMap"/>
</resultMap>
<select id="selectAll" resultMap="orderJoinMap">
    SELECT o.*, i.* FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
</select>
```

**② 代理会在"关联属性被加载"后正常返回字段值**，不重复查库——所以同一对象的 `getOrderItems()` 调用多次也只执行一次 SQL。

**③ 代理对象会影响 `equals` / `hashCode` 与类型判断。** 返回对象的实际类型是 CGLIB 子类（如 `Order$$EnhancerByCGLIB$$xxx`），在需要按类名做逻辑分支、或用 `instanceof` 严格匹配时要注意。序列化（如转 JSON 返回前端）也可能触发全量加载——**这是"接口明明只查了订单，数据库却突然多出一堆子查询"的常见原因**。

### 配置

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `lazyLoadingEnabled` | **`false`** | 全局开关，**默认关闭**，需显式打开 |
| `aggressiveLazyLoading` | `false`（3.4.1+；此前为 `true`） | `true` 时"调用任一 getter 就加载全部延迟属性"，通常需要保持 `false` |
| `fetchType`（`<association>` / `<collection>` 上） | `lazy` | **局部覆盖**全局配置，取 `lazy` / `eager` |

```xml
<settings>
    <setting name="lazyLoadingEnabled" value="true"/>
    <setting name="aggressiveLazyLoading" value="false"/>   <!-- 按需加载单个属性 -->
</settings>
```

```yaml
# Spring Boot application.yml 等价写法
mybatis:
  configuration:
    lazy-loading-enabled: true
    aggressive-lazy-loading: false
```

**关于 `aggressiveLazyLoading`**：它的语义容易被误解——不是说"更积极地加载"，而是"**任一属性的访问都会触发该对象身上所有延迟属性的加载**"。值为 `true` 时，读一次 `orderNo` 就会连带把 `orderItems` 全查出来，等于废掉了按需加载的意义（但仍比全量立即加载多一次判断开销）。**所以绝大多数情况下应显式设为 `false`。**

### 三个真实的坑

**坑一：循环中访问延迟属性 → 退化成 N+1 查询。** 延迟加载的初衷是减少查询，但如果代码在循环里访问了关联属性，每个对象各触发一次 SQL，总查询次数 = 1 + N：

```java
List<Order> orders = orderMapper.selectAll();        // 1 次 SQL
for (Order o : orders) {
    System.out.println(o.getItems().size());         // ✗ N 次 SQL —— N+1 问题
}
```

**正确做法**：确实要遍历关联数据时，**改用 join 一次性查回**（或批量查询后手工组装）。**判断标准是"关联数据的使用比例"**——少量对象会用到才用延迟加载；大部分都要用就直接 join。

**坑二：事务/会话关闭后访问延迟属性 → 抛 `LazyInitializationException`。** 延迟加载依赖 `SqlSession` 仍然可用——它要靠会话去执行那条子 SQL。一旦会话关闭，代理就失去了执行能力：

```java
@Transactional
public Order getOrder(Long id) {
    return orderMapper.selectById(id);      // 事务结束、SqlSession 关闭
}

// 调用方（事务之外）
Order o = service.getOrder(1L);
o.getItems().size();                        // ✗ LazyInitializationException
```

**这是最典型的生产事故**：Service 内查完数据返回，Controller 层（或转 JSON 序列化时）才访问关联属性。**三种解法**：① 在事务内就访问完需要的数据（或用 DTO 装配好再返回）；② 该关联改为 `fetchType="eager"` 或 join 查询；③ 保持 `OpenSessionInView`（Spring Boot 默认开启 `spring.jpa.open-in-view` 之于 JPA；MyBatis 侧则依赖 `SqlSessionTemplate` 在请求内的会话保持）——**但这会把数据库会话一直挂到视图渲染结束，是不推荐的做法**。

**推荐 ①**：在 Service 层把需要的数据装配成 DTO 返回，让返回对象**不再携带任何"待加载"状态**——这既消除了异常风险，也避免了把持久层结构泄漏到上层。

**坑三：序列化触发隐式全量加载。** 直接把实体对象返回并转 JSON 时，Jackson 会遍历所有 getter，**每个延迟属性都被触发一次**——表面上"只查了订单"，实际执行了 1 + N 条 SQL。**这也是"延迟加载反而变慢"的常见原因**。

> **生产建议**：MyBatis 的延迟加载在实际项目中使用率不高，原因是它与会话生命周期强耦合、隐性触发点难以预测。**更可控的替代方案是显式装配**——在 Mapper 层用 join 或批量查询把需要的数据一次取回，在 Service 层组装成 DTO；或用 `<collection>` 的 `select` 配合"批量查询 + 内存分组"（把 N 次单条查询改成 1 次 `IN` 查询）来消除 N+1。

## 六、一级缓存与二级缓存

| 维度 | 一级缓存 | 二级缓存 |
|---|---|---|
| 作用域 | **`SqlSession` 级**（同一次会话） | **`namespace` 级**（跨会话） |
| 默认状态 | **默认开启**，无法关闭（只能改作用域为 `STATEMENT`） | **默认关闭**，需 `<cache/>` 显式开启 |
| 存储位置 | `Executor` 持有的 `PerpetualCache`（本地 `HashMap`） | 可配置（内存 / Redis / Ehcache） |
| 失效时机 | 会话关闭、执行增删改、手动 `clearCache()` | namespace 内任何增删改、事务提交 |

### 一级缓存的陷阱

**在 Spring 集成环境下，一级缓存的实际命中率很低**——因为 `SqlSessionTemplate` 每次操作都获取新的（或绑定到事务的）SqlSession，跨方法调用通常不在同一会话中。**更要警惕的是它在事务内的行为**：

```java
@Transactional
public void demo() {
    User u1 = mapper.selectById(1L);      // 查库
    User u2 = mapper.selectById(1L);      // 命中一级缓存，不查库
    System.out.println(u1 == u2);         // true —— 同一个对象引用！

    u1.setName("被修改了");                 // ✗ 直接修改了缓存中的对象
    // 后续查询拿到的都是被污染的对象
}
```

**一级缓存返回的是对象引用而非拷贝**，因此在事务内修改查询结果会污染缓存。这也是"为什么不要在事务里改查询出来的实体然后不 save"的原因之一。

### 二级缓存的风险

二级缓存跨会话共享，因此面临**多表关联更新无法感知**的问题：

```xml
<!-- UserMapper.xml 开启二级缓存 -->
<cache/>
```

**典型事故**：`UserMapper` 的查询结果被缓存；另一处通过 `OrderMapper` 的 SQL 直接 `UPDATE user SET ...`（跨 namespace 的关联更新），MyBatis 无法感知，导致 `UserMapper` 返回**脏数据**。

**生产建议**：二级缓存**慎用**。主要原因：① 跨 namespace 的关联更新导致脏读；② 分布式环境下本地缓存不一致（需换成 Redis 等集中式实现）；③ 缓存粒度粗（按 namespace 整体失效）。**业务层面的缓存（Redis + 明确的 key 设计 + 主动失效）通常比 MyBatis 二级缓存更可控。**

## 七、Spring 集成：`SqlSessionTemplate` 解决什么

`SqlSession` **线程不安全**（内部持有 `Executor` 和事务状态）。而 Spring 的 Bean 默认是单例——如果直接把 `SqlSession` 注入为单例 Bean，多线程下必然出错。

Spring 的解法是 **`SqlSessionTemplate`**：

```java
// SqlSessionTemplate 构造时生成动态代理
public SqlSessionTemplate(SqlSessionFactory sqlSessionFactory, ExecutorType executorType,
                          PersistenceExceptionTranslator exceptionTranslator) {
    this.sqlSessionProxy = (SqlSession) newProxyInstance(
        SqlSessionFactory.class.getClassLoader(),
        new Class[]{SqlSession.class},
        new SqlSessionInterceptor());              // ← 每次调用都走拦截器
}
```

`SqlSessionInterceptor` 的核心逻辑：

```java
public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
    // ① 获取 SqlSession：有事务则用事务绑定的，否则新建
    SqlSession sqlSession = getSqlSession(
        SqlSessionTemplate.this.sqlSessionFactory,
        SqlSessionTemplate.this.executorType,
        SqlSessionTemplate.this.exceptionTranslator);
    try {
        Object result = method.invoke(sqlSession, args);
        // ② 无事务则自动提交
        if (!isSqlSessionTransactional(sqlSession, SqlSessionTemplate.this.sqlSessionFactory)) {
            sqlSession.commit(true);
        }
        return result;
    } finally {
        // ③ 归还/关闭
        if (sqlSession != null) closeSqlSession(sqlSession, SqlSessionTemplate.this.sqlSessionFactory);
    }
}
```

**三个关键结论**：

| 结论 | 说明 |
|---|---|
| **线程安全** | 单例的 `SqlSessionTemplate` 内部持有的只是代理，真正的 `SqlSession` 每次从 `TransactionSynchronizationManager` 获取或新建 |
| **事务协同** | 有事务时复用事务绑定的 `SqlSession`（同一连接），保证同一事务内的操作在同一个连接上 |
| **自动提交** | 无事务时每次操作后自动 commit；有事务时交由 `PlatformTransactionManager` 统一控制 |

**`@MapperScan` 的实现**：`MapperScannerConfigurer` 是 `BeanDefinitionRegistryPostProcessor`——在容器启动的最早期扫描指定包下的接口，为每个 Mapper 接口注册一个 `MapperFactoryBean` 类型的 `BeanDefinition`。这就是"Mapper 接口能作为 Bean 被注入"的原因（结合 [IoC 容器](/java/spring/spring-framework/ioc/) 的扩展点顺序理解：它在第 5 步最早执行，早于所有 Bean 实例化）。

## 八、面试问答

**Q1：MyBatis 的执行流程？**

Mapper 接口方法调用被 `MapperProxy`（JDK 动态代理）拦截 → 把方法签名翻译成 `MappedStatement` 的 id → 交由 `SqlSession` → `Executor` 先查缓存，未命中则生成 `BoundSql`（解析动态 SQL、绑定参数）→ `StatementHandler` 创建并执行 `PreparedStatement` → `ParameterHandler` 完成参数绑定、`ResultSetHandler` 完成结果映射 → 全程由 `TypeHandler` 处理 Java 与 JDBC 类型转换。

**Q2：`#{}` 和 `${}` 的区别？**

`#{}` 生成 `?` 占位符，走 `PreparedStatement` 预编译，参数以值的形式绑定，**天然防 SQL 注入**；`${}` 直接把字符串拼接进 SQL 文本，**存在注入风险**。默认一律用 `#{}`；只有在占位符无法覆盖的位置（表名、列名、`ORDER BY` 字段）才用 `${}`，且**必须做白名单校验**。原因是 SQL 预编译阶段无法用 `?` 替代标识符——数据库必须知道完整的 SQL 结构。

**Q3：Mapper 接口没有实现类，为什么能注入使用？**

MyBatis 在运行时用 JDK 动态代理生成了实现类（`MapperProxyFactory` + `MapperProxy`）。Spring 集成时，`@MapperScan` 对应的 `MapperScannerConfigurer` 在容器启动早期扫描接口并注册 `MapperFactoryBean` 的 BeanDefinition，该 FactoryBean 在 `getObject()` 时创建代理对象。所以注入的本质是**一个由 MyBatis 生成的动态代理实例**。

**Q4：MyBatis 的一级缓存和二级缓存有什么区别？**

一级缓存是 `SqlSession` 级、默认开启、不可关闭（只能把作用域调成 `STATEMENT`），本质是 `Executor` 里的一个 `HashMap`；二级缓存是 `namespace` 级、默认关闭、需 `<cache/>` 显式开启，可换成 Redis 等集中式实现。**注意两个坑**：一级缓存返回对象引用，事务内修改会污染缓存；二级缓存无法感知跨 namespace 的关联更新，容易产生脏数据。生产环境建议慎用二级缓存，业务缓存用 Redis 更可控。

**Q5：为什么需要 `SqlSessionTemplate`？**

因为**`SqlSession` 不是线程安全的**，而 Spring Bean 默认单例。`SqlSessionTemplate` 内部持有一个 `SqlSession` 的动态代理，每次方法调用都通过拦截器从 `TransactionSynchronizationManager` 获取"当前事务绑定的 SqlSession"（无事务则新建），用完后归还或关闭。这样既保证线程安全，又保证**同一事务内的所有操作复用同一个连接**——这是 MyBatis 与 Spring 事务能正确协同的关键。

**Q6：MyBatis 插件是怎么工作的？**

MyBatis 允许拦截四大对象（`Executor`、`StatementHandler`、`ParameterHandler`、`ResultSetHandler`）的方法。插件类用 `@Intercepts` + `@Signature` 声明要拦截的类、方法与参数类型，MyBatis 在创建这些对象时用**动态代理包装**它们，从而插入自定义逻辑。典型应用：PageHelper（拦截 `Executor.query` 改写 SQL 加分页）、多租户插件（拦截后拼接 `tenant_id` 条件）、数据权限插件、SQL 性能监控。**注意多个插件叠加时的顺序**：`InterceptorChain` 按注册顺序包装，因此**最先注册的插件在最外层**（执行顺序与注册顺序相反）。

**Q7：`@Param` 什么时候必须用？**

Mapper 方法有**多个参数**时必须用（否则 MyBatis 只能用 `arg0`/`param1` 这类默认名，SQL 里无法明确引用）；参数是**集合或数组**且需要在 `<foreach>` 中引用时建议用；单个参数且类型是普通对象时可省略（MyBatis 会自动展开属性）。**建议统一都加 `@Param`**——可读性更好，也避免后续加参数时遗漏导致的隐性错误。

**Q8：MyBatis 的延迟加载是怎么实现的？**

**代理 + 拦截器**。对"嵌套查询"方式（`<association select="...">` / `<collection select="...">`）映射出的结果对象，MyBatis 用 CGLIB 生成**代理子类**，关联属性初始为 `null` 并登记好待执行的子 SQL（`ResultLoader`）。当业务代码调用该属性的 getter 时，进入代理的拦截逻辑：若尚未加载则执行子 SQL、把结果 set 回属性并标记为已加载，之后再次调用直接返回字段值。

开启方式：全局 `lazyLoadingEnabled = true`（**默认 false**），或用 `fetchType="lazy"` 局部声明。**它只对嵌套查询生效**——join 查询的数据已随主查询返回，没有延迟的余地。

**Q9：延迟加载有哪些坑？**

① **N+1 退化成 1+N**——在循环中访问关联属性，每个对象各触发一次子查询；② **`LazyInitializationException`**——延迟属性依赖 `SqlSession` 可用，事务/会话关闭后再访问就会抛异常，这是最典型的生产事故（Service 查完返回、Controller 才触碰关联数据）；③ **序列化隐式触发**——直接把实体转 JSON 会遍历所有 getter，导致延迟属性全量加载，"只查了订单却多出一堆子查询"。另外 `aggressiveLazyLoading` 为 `true` 时任一 getter 都会触发全部延迟属性加载，通常需显式设为 `false`。

**实践建议**：延迟加载与会话生命周期强耦合、触发点难预测，生产项目使用率不高。更可控的做法是**显式装配**——需要关联数据时用 join 一次取回，或批量查询后在内存分组（把 N 次单条查询合并为 1 次 `IN` 查询），再在 Service 层组装 DTO。
