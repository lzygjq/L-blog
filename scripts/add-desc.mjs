// 一次性脚本：为接入 AutoList 的文章补 title/desc frontmatter（幂等，重复跑无副作用）
// 运行：node scripts/add-desc.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs')

const META = {
  // Spring Framework 5 篇（desc 迁自 spring/index.md 手写表"一句话价值"列）
  'java/spring/spring-framework/ioc-container.md': {
    title: 'IoC 容器与 Bean 生命周期',
    desc: '容器体系、BeanDefinition、refresh() 十二步、Bean 生命周期八阶段、扩展点对照',
  },
  'java/spring/spring-framework/circular-dependency.md': {
    title: '循环依赖与三级缓存',
    desc: '三级缓存的逐层推演，以及"为什么必须是三级"的核心答案',
  },
  'java/spring/spring-framework/aop.md': {
    title: 'AOP 与代理机制',
    desc: 'JDK 代理 vs CGLIB、代理生成时机、切点表达式、失效根因',
  },
  'java/spring/spring-framework/transaction.md': {
    title: '声明式事务与传播行为',
    desc: '七种传播行为、REQUIRES_NEW vs NESTED、失效清单十项、事务与连接池',
  },
  'java/spring/spring-framework/mybatis.md': {
    title: 'MyBatis 执行流程与集成',
    desc: '四大对象、#{} vs ${}、两级缓存的坑、SqlSessionTemplate',
  },
  // 数字人 3 篇（desc 迁自 digital-human/index.md 手写表"内容"列）
  'ai/digital-human/interactive-avatar.md': {
    title: '实时互动数字人：选型与集成',
    desc: '以云渲染路线为例，走完「场景反推选型 → 集成链路 → 鉴权设计 → 能力边界 → 终端工程 → 避坑」全流程',
  },
  'ai/digital-human/web-vs-native.md': {
    title: 'Web 与原生 App 接入',
    desc: '云渲染落地的两种宿主形态：Web 模式与原生 App 模式的环境约束、license/token 凭证差异与选型判据',
  },
  'ai/digital-human/integration-checklist.md': {
    title: '第三方 AI 能力集成清单',
    desc: '把上面这套过程抽象成可复用的方法：约束清单、边界盘点、凭证模型、供应商对接与验收',
  },
}

for (const [rel, meta] of Object.entries(META)) {
  const p = join(DOCS, rel)
  let src = readFileSync(p, 'utf8')
  const lines = []
  for (const [k, v] of Object.entries(meta)) {
    const re = new RegExp(`^${k}:.*$`, 'm')
    if (re.test(src)) continue
    lines.push(`${k}: ${v}`)
  }
  if (!lines.length) {
    console.log('skip', rel)
    continue
  }
  // 插到 frontmatter 末尾（第一个 --- 闭合行之前）
  const end = src.indexOf('\n---', src.startsWith('---\n') ? 3 : 0)
  src = src.slice(0, end) + '\n' + lines.join('\n') + src.slice(end)
  writeFileSync(p, src)
  console.log('updated', rel)
}
