---
date: 2026-09-11
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

## 五、一级缓存与二级缓存

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

## 六、Spring 集成：`SqlSessionTemplate` 解决什么

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

**`@MapperScan` 的实现**：`MapperScannerConfigurer` 是 `BeanDefinitionRegistryPostProcessor`——在容器启动的最早期扫描指定包下的接口，为每个 Mapper 接口注册一个 `MapperFactoryBean` 类型的 `BeanDefinition`。这就是"Mapper 接口能作为 Bean 被注入"的原因（结合 [IoC 容器](/java/spring/spring-framework/ioc-container/) 的扩展点顺序理解：它在第 5 步最早执行，早于所有 Bean 实例化）。

## 七、面试问答

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
