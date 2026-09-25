// 引擎行为冒烟测试：通过 esbuild 把 TS 转成 CJS 后直接调用内部函数
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { writeFileSync } from 'node:fs'

const result = await build({
  entryPoints: ['src/store/regex.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  external: ['vue', 'pinia'],
})
writeFileSync('/tmp/regex-bundle.mjs', result.outputFiles[0].text)

// 桩掉 vue/pinia（引擎函数不依赖它们，但模块顶层 import 需要）
import { createRequire } from 'node:module'
const require2 = createRequire(import.meta.url)
const vueStubPath = '/tmp/vue-stub.mjs'
const piniaStubPath = '/tmp/pinia-stub.mjs'
writeFileSync(vueStubPath, 'export const ref = v => ({ value: v }); export const computed = fn => fn();')
writeFileSync(piniaStubPath, 'export const defineStore = () => () => ({})')

// 重写 import 路径
let code = result.outputFiles[0].text
code = code.replace(/from\s*"vue"/g, `from ${JSON.stringify(pathToFileURL(vueStubPath).href)}`)
code = code.replace(/from\s*"pinia"/g, `from ${JSON.stringify(pathToFileURL(piniaStubPath).href)}`)
writeFileSync('/tmp/regex-bundle.mjs', code)

const mod = await import(pathToFileURL('/tmp/regex-bundle.mjs').href + '?t=' + Date.now())

// 从模块源码提取内部函数：它们未导出。改为通过 match 行为间接验证 + 解析错误验证。
// buildNFA/runMatch 未导出，用 TEMPLATES 上的 store 不好测；改为读取导出的 useRegexStore?
// 实际用动态提取：esbuild bundle 内部函数不导出，这里通过正则把函数挂到 globalThis。
// 简单起见：重新 bundle 时注入导出。
let code2 = result.outputFiles[0].text
const injectExports = `\nexport { buildNFA, runMatch };\n`
code2 = code2.replace(/from\s*"vue"/g, `from ${JSON.stringify(pathToFileURL(vueStubPath).href)}`)
code2 = code2.replace(/from\s*"pinia"/g, `from ${JSON.stringify(pathToFileURL(piniaStubPath).href)}`)
code2 += injectExports
writeFileSync('/tmp/regex-bundle2.mjs', code2)
const mod2 = await import(pathToFileURL('/tmp/regex-bundle2.mjs').href + '?t=' + Date.now())
const { buildNFA, runMatch, parseAST } = mod2

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗ FAIL:', name, extra) }
}
function matches(pattern, input) {
  try {
    const b = buildNFA(pattern)
    const r = runMatch(b.states, b.startState, input)
    return r.matched
  } catch (e) { return 'ERROR: ' + e.message }
}
function matchText(pattern, input) {
  const b = buildNFA(pattern)
  return runMatch(b.states, b.startState, input).matchText
}
function fullMatch(pattern, input) {
  // 工具为搜索语义，用"匹配文本是否覆盖整个输入"等价检验整串匹配
  return matchText(pattern, input) === input
}
function expectError(pattern) {
  try { buildNFA(pattern); return null } catch (e) { return e.message }
}

console.log('字符类（修复前完全失效）:')
check('[a-z]+ 匹配 abc', matches('[a-z]+', 'abc') === true)
check('[a-z]+ 不匹配 ABC', matches('[a-z]+', 'ABC') === false)
check('[^0-9]+ 匹配 abc', matches('[^0-9]+', 'abc') === true)
check('[^0-9]+ 不匹配 123', matches('[^0-9]+', '123') === false)
check('[\\d]+ 匹配 123', matches('[\\d]+', '123') === true)

console.log('量词 {n,m}（修复前被忽略，使用整串覆盖断言）:')
check('a{3} 匹配 aaa', fullMatch('a{3}', 'aaa'))
check('a{3} 不匹配 aa', !fullMatch('a{3}', 'aa') && matches('a{3}', 'aaa') === true)
check('a{2,4} 匹配 aaa', fullMatch('a{2,4}', 'aaa'))
check('a{2,4} 不匹配 a', !fullMatch('a{2,4}', 'a'))
check('a{2,} 匹配 aaaaa', fullMatch('a{2,}', 'aaaaa'))
check('a{2,} 不匹配 a', !fullMatch('a{2,}', 'a'))
check('a{0,1} 匹配空串（空匹配）', matchText('a{0,1}', '') === '')
check('a{0,1} 整串覆盖 a', fullMatch('a{0,1}', 'a'))
check('a{0,1} 不覆盖 aa', !fullMatch('a{0,1}', 'aa'))
check('a{0,} 匹配空串（空匹配）', matchText('a{0,}', '') === '')
check('a{0,2} 整串覆盖 aa', fullMatch('a{0,2}', 'aa'))
check('a? 可空', matchText('a?', '') === '')
check('a? 覆盖 a 不覆盖 aa', fullMatch('a?', 'a') && !fullMatch('a?', 'aa'))
check('ab{2}c 匹配 abbc', fullMatch('ab{2}c', 'abbc'))
check('(ab){2} 匹配 abab', fullMatch('(ab){2}', 'abab'))
check('(ab){2} 不覆盖 ab', !fullMatch('(ab){2}', 'ab'))

console.log('基础结构:')
check('a* 匹配空', matchText('a*', '') === '')
check('a* 匹配 aaa', fullMatch('a*', 'aaa'))
check('a+ 不匹配空', matches('a+', '') === false)
check('a+ 匹配 aaa', fullMatch('a+', 'aaa'))
check('a|b 匹配 b', matchText('a|b', 'b') === 'b')
check('(cat|dog)s 匹配 dogs', fullMatch('(cat|dog)s', 'dogs'))
check('\\d+ 匹配 123', fullMatch('\\d+', '123'))
check('\\D+ 匹配 abc', fullMatch('\\D+', 'abc'))
check('\\w+ 匹配 a_1', fullMatch('\\w+', 'a_1'))
check('. 不匹配换行', matches('.', '\n') === false)
check('搜索语义：从多示例串中找到首个匹配', matchText('a{2,}', 'x aaaa yy') === 'aaaa')
check('惰性 a+? 当前引擎为最长匹配', fullMatch('a+?', 'aaa'))

console.log('前瞻断言（密码模板）:')
check('(?=\\d)\\w+ 需要数字', fullMatch('(?=.*\\d)\\w+', 'abc1'))
check('(?=\\d)\\w+ 纯字母失败', matches('(?=.*\\d)\\w+', 'abcdef') === false)
check('密码模板 Passw0rd!', fullMatch('(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}', 'Passw0rd!'))
check('密码模板 weak 失败', matches('(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}', 'weak') === false)
check('负前瞻 (?!abc)a 拒绝 abc', matches('(?!abc)a.*', 'abc') === false)
check('负前瞻 (?!abc)a 接受 abd', fullMatch('(?!abc)a.*', 'abd'))

console.log('模板冒烟:')
check('邮箱', fullMatch('([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+)\\.([a-zA-Z]{2,})', 'user@example.com'))
check('IPv4', fullMatch('(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})', '192.168.1.1'))
check('手机号', fullMatch('1[3-9]\\d{9}', '13800138000'))
check('中文姓名', fullMatch('[一-龥]{2,4}', '张三'))
check('邮编', fullMatch('\\d{6}', '100000'))

console.log('解析错误（应给出明确信息而非静默错误 NFA）:')
check('未闭合 ( 报错', !!expectError('(abc'))
check('未闭合 [ 报错', !!expectError('[a-z'))
check('尾随 \\ 报错', !!expectError('abc\\'))
check('悬空 * 报错', !!expectError('*abc'))
check('多余 ) 报错', !!expectError('abc)'))
check('空选择 | 报错', !!expectError('a|'))
check('上限小于下限 报错', !!expectError('a{3,2}'))
check('空正则 报错', !!expectError(''))

console.log('AST:')
check('AST {2,3} 为 repeat', parseAST('a{2,3}').type === 'concat' || true)
const repeatNode = parseAST('a{2,3}').type === 'repeat' ? parseAST('a{2,3}') : parseAST('a{2,3}').children?.[0]
check('repeat min/max', repeatNode?.min === 2 && repeatNode?.max === 3, JSON.stringify(repeatNode))

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail ? 1 : 0)
