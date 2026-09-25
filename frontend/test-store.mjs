// Store 状态同步测试：验证错误/结果/画布数据在每次执行后一起更新，失败保留输入
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const vuePath = require.resolve('vue')
const piniaPath = require.resolve('pinia')

const result = await build({
  entryPoints: ['src/store/regex.ts'],
  bundle: true, format: 'esm', platform: 'node', write: false,
  external: ['vue', 'pinia'],
})
let code = result.outputFiles[0].text
code = code.replace(/from "vue"/g, `from ${JSON.stringify(pathToFileURL(vuePath).href)}`)
code = code.replace(/from "pinia"/g, `from ${JSON.stringify(pathToFileURL(piniaPath).href)}`)
writeFileSync('/tmp/store-bundle.mjs', code)

const { createPinia, setActivePinia } = await import(pathToFileURL(piniaPath).href)
const mod = await import(pathToFileURL('/tmp/store-bundle.mjs').href + '?t=' + Date.now())
const { useRegexStore, TEMPLATES } = mod

setActivePinia(createPinia())
const store = useRegexStore()

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗ FAIL:', name, extra) }
}

console.log('初始执行:')
store.execute()
check('初始状态 success', store.status === 'success')
check('初始有 NFA', !!store.nfa)
check('初始有匹配结果', !!store.matchResult)

console.log('引入解析错误 → 全部区域同步清空:')
store.setPattern('(abc')
check('状态 error', store.status === 'error')
check('错误信息非空且含位置', store.error.length > 0 && store.error.includes('位置'), store.error)
check('NFA 已清空（画布不会残留）', store.nfa === null)
check('匹配结果已清空', store.matchResult === null)
check('用户输入被保留', store.pattern === '(abc')

console.log('修正正则 → 错误提示与旧结果一起消失:')
store.setPattern('(abc)')
check('状态恢复 success', store.status === 'success')
check('错误提示已清除', store.error === '')
check('NFA 已重建', !!store.nfa)
check('匹配结果已恢复', !!store.matchResult)

console.log('模板切换 → 编辑面板与结果原子更新:')
const tpl = TEMPLATES.find(t => t.name === '手机号码')
store.applyTemplate(tpl)
check('pattern 同步为模板', store.pattern === tpl.pattern)
check('testString 同步为模板', store.testString === tpl.testString)
check('selectedTemplate 已设置', store.selectedTemplate === '手机号码')
check('结果立即对应新模板', store.matchResult?.matched === true && store.matchResult.matchText === '13800138000', store.matchResult?.matchText)

console.log('模板 → 手动输入 → 模板高亮脱钩:')
store.setPattern('^1[3-9]\\d{8}$')
check('selectedTemplate 已清除', store.selectedTemplate === '')

console.log('空输入 → 稳定空态反馈:')
store.setPattern('')
check('状态 empty', store.status === 'empty')
check('空态说明原因', store.error.includes('正则'), store.error)
check('旧结果被清空', store.matchResult === null && store.nfa === null)
store.setPattern('\\d+')
store.setTestString('')
check('测试串为空也是 empty', store.status === 'empty' && store.error.includes('测试字符串'), store.error)

console.log('无匹配 → 暂无结果反馈（非错误）:')
store.setTestString('abc')
check('状态仍 success', store.status === 'success')
check('matched=false 且无错误', store.matchResult?.matched === false && store.error === '')

console.log('播放/执行互斥:')
store.setTestString('123')
store.play()
check('播放中', store.isPlaying === true)
store.execute()
check('重新执行会停止播放', store.isPlaying === false)

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail ? 1 : 0)
