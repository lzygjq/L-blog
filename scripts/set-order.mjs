/**
 * 一次性脚本：给需要固定顺序的目录内文件注入 order（教学/阅读顺序）
 * 用法：node scripts/set-order.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = '/Users/echo/程序/tech-blog/docs/'

const ORDERS = {
  // Spring Framework：阅读顺序
  'java/spring/spring-framework/ioc-container': 1,
  'java/spring/spring-framework/circular-dependency': 2,
  'java/spring/spring-framework/aop': 3,
  'java/spring/spring-framework/transaction': 4,
  'java/spring/spring-framework/mybatis': 5,
  // 创建型
  'java/design-patterns/creational/singleton': 1,
  'java/design-patterns/creational/factory': 2,
  'java/design-patterns/creational/prototype': 3,
  'java/design-patterns/creational/builder': 4,
  // 结构型
  'java/design-patterns/structural/proxy': 1,
  'java/design-patterns/structural/adapter': 2,
  'java/design-patterns/structural/decorator': 3,
  'java/design-patterns/structural/bridge': 4,
  'java/design-patterns/structural/facade': 5,
  'java/design-patterns/structural/composite': 6,
  'java/design-patterns/structural/flyweight': 7,
  // 行为型
  'java/design-patterns/behavioral/template-method': 1,
  'java/design-patterns/behavioral/strategy': 2,
  'java/design-patterns/behavioral/chain-of-responsibility': 3,
  'java/design-patterns/behavioral/command': 4,
  'java/design-patterns/behavioral/state': 5,
  'java/design-patterns/behavioral/observer': 6,
  'java/design-patterns/behavioral/mediator': 7,
  'java/design-patterns/behavioral/iterator': 8,
  'java/design-patterns/behavioral/memento': 9,
  'java/design-patterns/behavioral/visitor': 10,
  'java/design-patterns/behavioral/interpreter': 11,
  // 数字人
  'ai/digital-human/interactive-avatar': 1,
  'ai/digital-human/web-vs-native': 2,
  'ai/digital-human/integration-checklist': 3
}

let n = 0
for (const [rel, order] of Object.entries(ORDERS)) {
  const f = join(ROOT, rel + '.md')
  const src = readFileSync(f, 'utf8')
  if (/^order:/m.test(src)) continue
  if (!src.startsWith('---')) { console.warn('no frontmatter:', rel); continue }
  const next = src.replace(/^---\n/, `---\norder: ${order}\n`)
  writeFileSync(f, next)
  n++
}
console.log('updated:', n)
