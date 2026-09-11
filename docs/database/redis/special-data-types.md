---
order: 5
date: 2026-09-12
title: 特种类型：BitMap / HyperLogLog / GEO
desc: 亿级数据下的统计选型——签到 BitMap、去重计数 HyperLogLog、地理位置 GEO、点赞排行 SortedSet 的场景化用法
---

# 特种类型：BitMap / HyperLogLog / GEO

五大基础结构之外，Redis 还有一批「为特定统计场景而生」的形态。它们的共同设计哲学：**放弃不必要的精度或通用性，换 2~3 个数量级的内存节省**。做选型时先问一句：业务要的到底是精确值，还是趋势？

## 一、BitMap：签到与布尔统计

BitMap 不是独立类型，是 String 的位视角：一个 String 最多表示 2^32 位。1 亿用户的签到状态用 id 做偏移量，只要约 12MB。

```bash
SETBIT sign:u1001:202609 8 1     # 9 月 9 日（offset=8）签到
BITCOUNT sign:u1001:202609       # 本月签到总天数
BITPOS sign:u1001:202609 0       # 第一个未签到位 → 算连续签到
```

连续签到的计算：`BITPOS 0` 找到第一个 0 的位置，与当天 offset 比较即可，不需要拉全量数据。**key 设计按「用户 + 月份」拆**：单 key 过长会向 BigKey 演化（见[最佳实践](/database/redis/best-practices)），按月拆还天然支持按月统计。

适用边界：位与实体一一对应（用户 id 连续或可映射）时高效；id 稀疏（如 uuid）要先做映射，否则位空间浪费远超收益。

## 二、HyperLogLog：亿级 UV 的近似去重

统计 UV（独立访客）：Set 去重精确但内存爆炸——1 亿访客约需数 GB；HyperLogLog 固定 **12KB**，误差标准差 **0.81%**，百万 UV 场景下误差在几千级别。

```bash
PFADD uv:20260912 "ip:1.2.3.4" "ip:5.6.7.8"
PFCOUNT uv:20260912          # 近似 UV
PFMERGE uv:202609 uv:20260912 uv:20260911   # 合并出月 UV
```

原理一句话：对元素哈希后取二进制前缀做「抛硬币」观测，0 开头连续位数越长说明样本越多，分桶后用调和平均估算基数。**面试只要求说清「分桶观测 + 概率估算」这个层次**。

判断标准很清晰：UV/PV 大盘趋势 → HyperLogLog；风控、对账等要精确 id 集合 → Set。营销活动「奖励第 100 万访客」这种要精确名次的也不适用。

## 三、GEO：地理位置与附近检索

GEO 底层是 SortedSet：把经纬度经 GeoHash 编码为 52 位整数当 score，编码后**相邻的地理位置 score 也相邻**，于是「附近的人」变成 ZSet 的范围查询：

```bash
GEOADD shop 116.48 39.99 shop:1001
GEOSEARCH shop FROMLONLAT 116.48 39.99 BYRADIUS 5 km ASC COUNT 20
```

值得知道的两个细节：

1. GeoHash 是**递进网格**：编码前缀相同 = 同一块大格子，缩短位数即放大范围——这也是通用地理检索（ES geo_point 等）的共享思想。
2. 两点距离用 `GEODIST`；GEO 没有删除单成员的独立命令，用 `ZREM`（因为本质就是 ZSet）。

## 四、SortedSet 与 Set：点赞和共同关注的标配

- **点赞列表**：`SADD like:blog:1001 u1 u2`（去重天然满足）、`SISMEMBER` 判断是否点过、`SCARD` 计数。
- **点赞排行榜**：需要「最先点赞」排序时升 ZSet：`ZADD/ZINCRBY like:blog:1001 <ts> u1`，`ZREVRANGE ... LIMIT 0 10` 拿前 10。
- **共同关注**：`SINTER follow:u1 follow:u2`——把「关注」存 Set 而不是 DB 关联表，就是为了让交集运算下推到 Redis（O(N) 内存运算 vs DB 的 JOIN）。

## 五、统计场景选型速查

| 需求 | 方案 | 精度 | 内存量级 |
|---|---|---|---|
| 每日签到/连续签到 | BitMap | 精确 | 1 亿用户/月 ≈ 12MB |
| UV/搜索量趋势 | HyperLogLog | ±0.81% | 恒定 12KB/key |
| 在线名单/点赞去重 | Set | 精确 | 与成员数线性 |
| 排行榜/延迟队列 | ZSet | 精确 | 与成员数线性 |
| 附近的人/商户 | GEO（ZSet） | 网格近似 | 与成员数线性 |

## 六、面试问答

**Q: 1 亿用户的签到系统怎么设计？**
按月拆 BitMap（`sign:{uid}:{yyyyMM}`），SETBIT 记录、BITCOUNT 月统计、BITPOS 求连续签到。id 不连续就先建 id→offset 映射。跨月连续签到要读相邻两个月 key 拼接判断。

**Q: HyperLogLog 为什么 12KB 就能数到亿级？**
16384 个桶，每桶 6 bit 记录该桶观测到的「最长前导零」，14bit 哈希前缀选桶 → 16384 × 6bit ≈ 12KB。基数越大，各桶出现长前导零的概率分布越能反映规模，调和平均消除离群。

**Q: GEO 查「附近的」为什么快？**
GeoHash 把二维坐标一维化成一维整数，附近 = score 区间查询，落到 ZSet 的 O(log N + M) 范围扫，不需要全表算距离。
