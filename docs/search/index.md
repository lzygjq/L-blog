---
date: 2026-09-16
title: 搜索与检索 · 板块导览
desc: 搜索与检索板块导览——一条主线「段不可变」推出的全部行为、五篇地图（倒排与分词 / 写入与近实时 / DSL 与算分 / 分片与分页 / 运维与日志栈）、三条贯穿判据、与 Doris 倒排索引和可观测性的边界、90 题分组索引
---

# 搜索与检索 · 板块导览

这个板块只讲一个组件：**Elasticsearch**。它被放在「存储与消息」这个合并大类的第三个分组里（原本错挂在「消息队列」下）——因为**它既不是数据库，也不是消息队列，而是"以检索为目的的存储"**。

先说清它**不做什么**：

| 不在这里讲 | 在哪里 |
|---|---|
| 关系型数据库的索引、事务、锁 | [MySQL](/database/mysql/) |
| 缓存穿透击穿雪崩、分布式锁 | [Redis](/database/redis/) |
| 列式聚合与数仓分层 | [Doris 数仓](/bigdata/doris/)、[数仓方案选型](/projects/property-saas/data-warehouse/) |
| 日志与指标与链路的三件套划分 | [监控与可观测](/cloud-native/observability/) |
| 数据同步管道本身（binlog、位点） | [Canal 数据同步](/bigdata/canal/) |
| 读模型与投影的一致性语义 | [事件驱动与 CQRS](/methodology/event-driven-cqrs) |

这个板块的问题是：**当一个系统"看起来很会用"但一遇到"搜不到/搜得慢"就束手无策时，缺的到底是哪一层知识。**

## 一、一条主线：所有"奇怪"的行为都来自"段不可变" {#thread}

ES 的复杂度**大部分不在分布式，而在 Lucene**。而 Lucene 索引有一条根本性质：

> **段（segment）一旦写入就不可变。**

**从这一条出发，ES 里几乎所有让人困惑的行为都能推出来**——这是本板块组织的唯一线索：

| 由"不可变"推出 | 现象 | 在哪一篇 |
|---|---|---|
| 不能往已写的段里插数据 | 写入先进内存缓冲，攒批再建新段 → **要 refresh** | [写入链路](/search/write-and-read#refresh-flush) |
| refresh 不是实时的 | **"近实时"**：默认最多 1 秒可见 | [写入链路](/search/write-and-read#near-realtime) |
| 段会越攒越多 | 查询要扫遍所有段 → **必须有段合并** | [写入链路](/search/write-and-read#merge) |
| 不能真正删除/修改段内数据 | 删除只是**标记**、更新 = **标记删除 + 写新文档**；空间要等合并才回收 | [写入链路](/search/write-and-read#delete-update) |
| 字段的存储方式在写入时就定了 | **字段类型不可改**、**主分片数不可改** → 只能 reindex | [倒排与分词](/search/inverted-index#mapping)、[分片与分页](/search/sharding-and-scale#why-primary-immutable) |
| 按词存储，没有"行"的概念 | 正排要另存一份 → **`doc_values`**，所以 `text` 字段默认不能聚合排序 | [DSL 与算分](/search/query-and-scoring#doc-values) |
| 数据被词而非行切开 | 分布式统计（IDF）无法全局 → **算分在多分片下会偏** | [DSL 与算分](/search/query-and-scoring#dfs) |

> **这张表值得单独背下来**。面试里回答"ES 为什么是近实时的""为什么删除不释放空间""为什么字段类型不能改"，**正确答案都指向同一句话："因为 Lucene 的段不可变。"** 给出这一句，比罗列三个独立现象高一档。

## 二、五篇地图 {#map}

| # | 篇 | 回答什么问题 | 一句话结论 |
|---|---|---|---|
| 1 | [倒排索引与分词](/search/inverted-index) | **一个词是怎么被存进去、又怎么被找出来的** | "搜不到"**几乎总是分词问题**；索引期细粒度、查询期粗粒度；`text` 能搜不能聚合、`keyword` 能聚合不能搜——**要两个就给一个 `.keyword` 子字段** |
| 2 | [写入链路与近实时](/search/write-and-read) | 写进去之后发生了什么、为什么"刚写完搜不到" | **1 秒的近实时不是延迟缺陷，而是为了攒批建段**；`refresh` 管可见性、`flush` 管持久性、`translog` 管进程崩溃 |
| 3 | [查询 DSL 与相关性算分](/search/query-and-scoring) | 怎么问、怎么排序、算分是怎么回事 | **先问"要不要打分"**：不算分的条件一律进 `filter`（可缓存，常见收益 30%~70%）；`_score` 的绝对值没有意义 |
| 4 | [分片、路由与深分页](/search/sharding-and-scale) | 分布式之后多出哪些代价 | 分片数 = 查询扇出数，且**不可改**；深分页的代价是 `分片数 × (from+size)`——**用户在翻页用 `search_after`，跑批用 `scroll`，要跳页就改产品** |
| 5 | [运维、调优与日志检索栈](/search/operations-and-log-stack) | 怎么让它稳定跑在生产 | **内存先分对**（堆 ≤ 一半且 ≤ 31GB，另一半留给 page cache）；**指标盯 `rejected` 与磁盘水位**；数据不一致**先怀疑上游同步** |

**阅读顺序不可颠倒**：不先懂"词"（第 1 篇）就会把"搜不到"误判为查询写法问题；不先懂"段"（第 2 篇）就会把"近实时"当成 bug 去调参；不懂"算分"（第 3 篇）就会把所有条件塞进 `must`，然后抱怨 ES 慢。

## 三、三条贯穿判据 {#criteria}

五篇的技术点很多，但可以被三条判据串起来——**它们可以直接当评审问题用**：

**① 「这个字段，是要"搜"还是要"筛"？」**

来自第 1 篇，但贯穿全篇。**"搜"（用户输入、可能拼错、需要相关度）用 `text` + `match`；"筛"（状态、ID、枚举、时间）用 `keyword` + `term`，且放进 `filter`。**

```text
搜  → text   + match/multi_match  + 提权    （要算分，接受慢一点）
筛  → keyword + term/range        + filter  （不算分、可缓存）
```

**这一条判据的收益是复利的**：字段定义对了，mapping 就不用改（因为改不了）；查询写法对了，性能自然就上去了。

**② 「这个是"索引问题"还是"查询问题"还是"资源问题"？」**

来自第 3、5 篇。**ES 的问题排查有一条固定顺序，跳步就会浪费大量时间：**

```text
① 数据有没有进来？   GET /index/_count          ← 同步链路（最常见的真因）
② 词切得对不对？     GET /index/_analyze        ← 分词器 / mapping
③ 查询怎么写？       profile: true              ← filter 上下文 / 深分页 / 聚合
④ 集群够不够？       _nodes/stats 的 rejected    ← 最后才看资源
```

**"先怀疑上游、再怀疑写法、最后才怀疑集群"**——这个顺序破坏不得，因为前三步都比第四步便宜。

**③ 「这个查询，真的需要"相关性排序"吗？」**

这是与技术选型直接相关的一条。**不需要相关性排序时，ES 未必是最佳选择。**

| 需求 | 需要的引擎 |
|---|---|
| 用户输入 + "最相关的在前" | **ES**（这是它唯一不可替代的能力） |
| 按条件筛 + 全文匹配 + 聚合，不关心排序 | **Doris 倒排索引可能就够了**——省一个组件、一套运维 |
| 亿级多维聚合报表 | **Doris**（列存 + MPP） |

完整边界见第 5 篇的[与 Doris 倒排索引的边界](/search/operations-and-log-stack#boundary)。

## 四、与其他板块的关系 {#relations}

| 板块 | 关系 |
|---|---|
| [Doris 数仓](/bigdata/doris/#indexes) | **最直接的交界**：Doris 3.1 的倒排索引"替代的是**日志检索**这类场景，不是复杂的相关性排序"。**判据：能不能接受"没有相关性排序"** |
| [MySQL 索引设计](/database/mysql/index-design) | **对照层**：`LIKE '%abc%'` 索引失效 → 这正是倒排索引存在的理由。**"排序用 B+ 树、包含用倒排"** |
| [分库分表](/database/sharding/) | **同类问题**：跨节点分页与深分页是两块引擎上的同一个难题 |
| [Canal 数据同步](/bigdata/canal/) | **上游**：ES 极少做唯一数据源，数据几乎都要从 MySQL 同步过来 |
| [监控与可观测](/cloud-native/observability/#logging) | **交界**：那边讲"日志怎么产生与采集"，这边讲"日志存到 ES 之后怎么检索" |
| [链路追踪](/java/spring/spring-cloud/tracing) | **配套**：ES 是链路数据的常用存储后端；`traceId` 是日志与链路关联的钥匙 |
| [事件驱动与 CQRS](/methodology/event-driven-cqrs) | **语义层**：ES 是典型的"读模型"落点，投影要可重放 |
| [海量数据算法](/fundamentals/algorithms/high-volume) | **底座**：posting list 的压缩（差值编码 / Roaring Bitmap）与 `cardinality` 的 HyperLogLog++ 都是通用算法 |
| [JVM 调优](/java/jvm/tuning) | **关联**：ES 是 Java 进程，堆内存与 GC 的判读方法通用（注意它还有大量堆外内存） |
| [面试专题](/interview/) | 检索层：跨板块连线题与题单索引 |

## 五、面试高频索引（90 题） {#interview}

**第 1 篇 · 倒排索引与分词**（17 题）

| # | 高频问法 | 出处 |
|---|---|---|
| 1 | 倒排索引是什么？为什么比 B+ 树适合全文检索？ | [正排与倒排](/search/inverted-index#fundamental) |
| 2 | 为什么 MySQL 有索引还要上 ES？ | [正排与倒排](/search/inverted-index#fundamental) |
| 3 | ES 凭什么能装下上亿个词？ | [内部结构](/search/inverted-index#structure) |
| 4 | posting list 里为什么不只存文档 ID？ | [内部结构](/search/inverted-index#structure) |
| 5 | 分词器包含哪几部分？ | [三件套](/search/inverted-index#analyzer) |
| 6 | 为什么写入和查询要用同一个分析器？ | [两次分析](/search/inverted-index#analyzer) |
| 7 | `ik_smart` 和 `ik_max_word` 怎么选？ | [中文分词](/search/inverted-index#chinese) |
| 8 | 中文搜索不准，先查什么？ | [排查链](/search/inverted-index#debug) |
| 9 | `text` 和 `keyword` 的区别？ | [text 与 keyword](/search/inverted-index#text-keyword) |
| 10 | `text` 字段做聚合报 `Fielddata is disabled` 怎么办？ | [text 与 keyword](/search/inverted-index#text-keyword) |
| 11 | 一个字段既要全文搜又要聚合怎么办？ | [text 与 keyword](/search/inverted-index#text-keyword) |
| 12 | `ignore_above` 是干什么的？ | [text 与 keyword](/search/inverted-index#text-keyword) |
| 13 | 邮箱字段该用什么类型？ | [text 与 keyword](/search/inverted-index#text-keyword) |
| 14 | ES 能改字段类型吗？ | [Mapping](/search/inverted-index#mapping) |
| 15 | 开了 dynamic mapping 有什么风险？ | [dynamic mapping](/search/inverted-index#mapping) |
| 16 | ES 支持数组和嵌套对象吗？ | [数组与嵌套](/search/inverted-index#mapping) |
| 17 | `keyword` 能大小写不敏感吗？ | [normalizer](/search/inverted-index#mapping) |

**第 2 篇 · 写入链路与近实时**（16 题）

| # | 高频问法 | 出处 |
|---|---|---|
| 18 | 一条文档写入 ES 经历了什么？ | [写入链路](/search/write-and-read#write-path) |
| 19 | 为什么刚写完的数据搜不到？ | [近实时](/search/write-and-read#near-realtime) |
| 20 | `refresh` 和 `flush` 有什么区别？ | [refresh / flush](/search/write-and-read#refresh-flush) |
| 21 | `translog` 是干什么的？ | [refresh / flush](/search/write-and-read#refresh-flush) |
| 22 | ES 会丢数据吗？ | [refresh / flush](/search/write-and-read#refresh-flush) |
| 23 | 写入性能怎么优化？ | [写入调优](/search/write-and-read#write-tuning) |
| 24 | `refresh=true` 和 `refresh=wait_for` 怎么选？ | [三种语义](/search/write-and-read#near-realtime) |
| 25 | 删除一条文档，磁盘空间会立刻释放吗？ | [删除与更新](/search/write-and-read#delete-update) |
| 26 | 更新一个字段的底层动作是什么？ | [删除与更新](/search/write-and-read#delete-update) |
| 27 | 段合并是什么？为什么要合并？ | [段合并](/search/write-and-read#merge) |
| 28 | force merge 能提升性能吗？ | [段合并](/search/write-and-read#merge) |
| 29 | 并发更新同一条文档会怎样？ | [并发控制](/search/write-and-read#concurrency) |
| 30 | 为什么用乐观锁不用悲观锁？ | [并发控制](/search/write-and-read#concurrency) |
| 31 | 为什么主分片数不能改？ | [写入链路](/search/write-and-read#write-path) |
| 32 | 指定 `_id` 和不指定有什么区别？ | [写入链路](/search/write-and-read#write-path) |
| 33 | `refresh_interval` 一般设多少？ | [近实时](/search/write-and-read#near-realtime) |

**第 3 篇 · 查询 DSL 与相关性算分**（19 题）

| # | 高频问法 | 出处 |
|---|---|---|
| 34 | `query` 和 `filter` 上下文有什么区别？ | [两种上下文](/search/query-and-scoring#context) |
| 35 | `term` 和 `match` 的区别？ | [四种基础查询](/search/query-and-scoring#basic-queries) |
| 36 | 为什么 `term` 查 `text` 字段搜不到？ | [四种基础查询](/search/query-and-scoring#basic-queries) |
| 37 | `match` 的默认语义是什么？ | [四种基础查询](/search/query-and-scoring#basic-queries) |
| 38 | `match_phrase` 和 `match` 的区别？ | [四种基础查询](/search/query-and-scoring#basic-queries) |
| 39 | bool 四个子句的区别？ | [bool 查询](/search/query-and-scoring#bool) |
| 40 | `should` 什么时候不是硬要求？ | [bool 查询](/search/query-and-scoring#bool) |
| 41 | BM25 比 TF-IDF 好在哪？ | [相关性算分](/search/query-and-scoring#scoring) |
| 42 | `_score` 能当匹配度百分比用吗？ | [相关性算分](/search/query-and-scoring#scoring) |
| 43 | 指定排序字段后还算分吗？ | [相关性算分](/search/query-and-scoring#scoring) |
| 44 | 多分片时算分会不准吗？ | [分片与算分](/search/query-and-scoring#dfs) |
| 45 | `dfs_query_then_fetch` 是什么？ | [分片与算分](/search/query-and-scoring#dfs) |
| 46 | `doc_values` 和 `fielddata` 的区别？ | [doc_values](/search/query-and-scoring#doc-values) |
| 47 | `text` 字段能排序吗？ | [doc_values](/search/query-and-scoring#doc-values) |
| 48 | `terms` 聚合结果准确吗？ | [聚合的坑](/search/query-and-scoring#aggregation) |
| 49 | `terms` 聚合为什么只返回 10 个？ | [聚合的坑](/search/query-and-scoring#aggregation) |
| 50 | `cardinality` 去重计数准吗？ | [聚合的坑](/search/query-and-scoring#aggregation) |
| 51 | 什么时候不需要 ES？ | [与 Doris 的边界](/search/query-and-scoring#aggregation) |
| 52 | `wildcard` 前缀通配为什么慢？ | [速查表](/search/query-and-scoring#cheatsheet) |

**第 4 篇 · 分片、路由与深分页**（18 题）

| # | 高频问法 | 出处 |
|---|---|---|
| 53 | ES 的分片是什么？ | [分片是什么](/search/sharding-and-scale#concept) |
| 54 | 分片越多越好吗？ | [分片是什么](/search/sharding-and-scale#concept) |
| 55 | 为什么主分片数不可改？ | [主分片不可改](/search/sharding-and-scale#why-primary-immutable) |
| 56 | 副本数能改吗？ | [副本](/search/sharding-and-scale#replica) |
| 57 | 副本能提升写入性能吗？ | [副本](/search/sharding-and-scale#replica) |
| 58 | `wait_for_active_shards` 是干什么的？ | [副本](/search/sharding-and-scale#replica) |
| 59 | `_routing` 有什么用？代价是什么？ | [路由](/search/sharding-and-scale#routing) |
| 60 | 深分页为什么慢？ | [深分页](/search/sharding-and-scale#deep-paging) |
| 61 | `max_result_window` 是什么？ | [深分页](/search/sharding-and-scale#deep-paging) |
| 62 | 深分页怎么解决？ | [深分页](/search/sharding-and-scale#deep-paging) |
| 63 | `search_after` 和 `scroll` 的区别？ | [三种方案](/search/sharding-and-scale#deep-paging) |
| 64 | `search_after` 的排序要求是什么？ | [三种方案](/search/sharding-and-scale#deep-paging) |
| 65 | 集群有哪些节点角色？ | [节点角色](/search/sharding-and-scale#nodes) |
| 66 | 专用 master 为什么要 3 个？ | [节点角色](/search/sharding-and-scale#nodes) |
| 67 | 脑裂是怎么产生的？ | [脑裂](/search/sharding-and-scale#split-brain) |
| 68 | `cluster.initial_master_nodes` 要注意什么？ | [脑裂](/search/sharding-and-scale#split-brain) |
| 69 | 怎么改分片数或 mapping 而不停机？ | [扩容](/search/sharding-and-scale#scale) |
| 70 | `_reindex` 有什么坑？ | [扩容](/search/sharding-and-scale#scale) |

**第 5 篇 · 运维、调优与日志检索栈**（20 题）

| # | 高频问法 | 出处 |
|---|---|---|
| 71 | ES 堆内存怎么设？ | [内存怎么分](/search/operations-and-log-stack#memory) |
| 72 | 为什么堆不是越大约好？ | [内存怎么分](/search/operations-and-log-stack#memory) |
| 73 | `bootstrap.memory_lock` 是干什么的？ | [内存怎么分](/search/operations-and-log-stack#memory) |
| 74 | `green` / `yellow` / `red` 分别代表什么？ | [集群健康](/search/operations-and-log-stack#monitoring) |
| 75 | 集群是 `yellow` 要紧吗？ | [集群健康](/search/operations-and-log-stack#monitoring) |
| 76 | 怎么判断 ES 是否过载？ | [监控指标](/search/operations-and-log-stack#monitoring) |
| 77 | 查询慢怎么排查？ | [查询慢](/search/operations-and-log-stack#slow-query) |
| 78 | 怎么精确定位查询慢在哪？ | [查询慢](/search/operations-and-log-stack#slow-query) |
| 79 | `query_time` 高和 `fetch_time` 高分别说明什么？ | [监控指标](/search/operations-and-log-stack#monitoring) |
| 80 | MySQL 数据怎么同步到 ES？ | [数据同步](/search/operations-and-log-stack#sync) |
| 81 | 同步怎么保证幂等和防乱序？ | [数据同步](/search/operations-and-log-stack#sync) |
| 82 | 同步的数据不一致怎么发现？ | [数据同步](/search/operations-and-log-stack#sync) |
| 83 | ELK 里为什么常加 Kafka 层？ | [ELK 栈](/search/operations-and-log-stack#elk) |
| 84 | 日志检索为什么要结构化？ | [ELK 栈](/search/operations-and-log-stack#elk) |
| 85 | 日志的 `message` 字段该建什么类型？ | [ELK 栈](/search/operations-and-log-stack#elk) |
| 86 | ILM 是什么？怎么用？ | [ILM](/search/operations-and-log-stack#ilm) |
| 87 | ES 能做数据报表吗？ | [与 Doris 的边界](/search/operations-and-log-stack#boundary) |
| 88 | 什么情况下不需要 ES？ | [与 Doris 的边界](/search/operations-and-log-stack#boundary) |
| 89 | ES 磁盘满了会怎样？ | [事故清单](/search/operations-and-log-stack#incidents) |
| 90 | ES 里的数据对不上，先查什么？ | [事故清单](/search/operations-and-log-stack#incidents) |

> **注意第 9、19、34、53、60 这五道**——它们分别是"字段类型""近实时""filter 上下文""分片本质""深分页"，**每一道都能从"段不可变"一路推到底**，是最能体现是否真懂 ES 的五题。第 88 题（什么情况下不需要 ES）是**架构判断题**，答得出"相关性排序是它唯一不可替代的能力"就算过关。

## 六、边界与后续 {#todo}

**本板块 5 篇正文 / 6 页**（2026-09-16 新建）。

**已知的边界（有意不展开，避免与既有板块重复）：**

| 主题 | 归属 |
|---|---|
| `_source` 关闭后的功能影响、`_source` 与 reindex 的关系 | 本篇有提及，深入内容属[写入链路](/search/write-and-read#write-path)的延伸 |
| Logstash 的 grok 语法、Filebeat 配置细节 | 属运维工具手册，非本站主线 |
| ES + Spring Data / Java Client 的工程细节 | 与[Java 板块](/java/)的集成层，后续可考虑补 |
| 向量检索与语义搜索（配合 RAG） | 与 [AI 应用](/ai/) 的向量库选型交界，见 [Spring AI](/ai/spring-ai/) |

**后续可能的补充方向（按价值排序）：**

1. **Java 客户端与索引设计实战**（RestClient / Spring Data ES / 索引模板与别名规范）
2. **向量检索与混合检索**（`dense_vector`、HNSW、与 [AI 应用](/ai/) 的衔接）
3. **ES 与 Doris 的联合架构**（同一份数据双投，各做擅长的事）

每个主题的完整问法索引都在[面试专题](/interview/)有交叉入口。
