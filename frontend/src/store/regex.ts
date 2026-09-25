import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NFA, MatchResult, MatchStep, RegexTemplate, ASTNode, ExecStatus } from '../types'

const GROUP_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']

// 单次匹配允许记录的最大步数，超过则视为灾难性回溯并终止，避免界面卡死
const MAX_MATCH_STEPS = 200_000
// 量词 {m,n} 允许展开的最大副本数
const MAX_REPEAT = 1000

export const TEMPLATES: RegexTemplate[] = [
  { name: '邮箱地址', pattern: '^([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+)\\.([a-zA-Z]{2,})$', description: '匹配标准邮箱格式：用户名@域名.顶级域', testString: 'test.user+tag@sub.domain.co.uk', category: '常用' },
  { name: 'URL链接', pattern: '^(https?)://([^/:]+)(?::(\\d+))?(.*)$', description: '匹配HTTP/HTTPS URL：协议://主机:端口/路径', testString: 'https://www.example.com:8080/path/to/page', category: '常用' },
  { name: 'IPv4地址', pattern: '^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$', description: '匹配IPv4地址四段数字', testString: '192.168.1.1', category: '常用' },
  { name: '日期格式', pattern: '^(\\d{4})-(\\d{2})-(\\d{2})$', description: '匹配YYYY-MM-DD日期', testString: '2024-01-15', category: '常用' },
  { name: '手机号码', pattern: '^1[3-9]\\d{9}$', description: '匹配中国大陆手机号', testString: '13800138000', category: '常用' },
  { name: '身份证号', pattern: '^(\\d{6})(\\d{4})(\\d{2})(\\d{2})(\\d{3})([0-9Xx])$', description: '18位身份证：地区码+出生日期+顺序码+校验码', testString: '11010119900101001X', category: '常用' },
  { name: '十六进制颜色', pattern: '^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$', description: '匹配#RGB或#RRGGBB格式', testString: '#FF5733', category: '前端' },
  { name: '邮政编码', pattern: '^\\d{6}$', description: '6位中国邮编', testString: '100000', category: '常用' },
  { name: '浮点数', pattern: '^-?\\d+\\.\\d+$', description: '匹配带小数点的数字', testString: '3.14', category: '数字' },
  { name: '科学计数法', pattern: '^-?\\d+(\\.\\d+)?[eE][+-]?\\d+$', description: '匹配科学计数法数字', testString: '1.5e10', category: '数字' },
  { name: 'MAC地址', pattern: '^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$', description: '匹配MAC地址XX:XX:XX:XX:XX:XX', testString: '00:1A:2B:3C:4D:5E', category: '网络' },
  { name: 'UUID', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', description: '标准UUID格式', testString: '550e8400-e29b-41d4-a716-446655440000', category: '网络' },
  { name: 'QQ号', pattern: '^[1-9]\\d{4,10}$', description: '5-11位QQ号', testString: '1234567890', category: '常用' },
  { name: '密码强度', pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$', description: '至少8位含大小写字母数字特殊字符', testString: 'Str0ng@Pass', category: '安全' },
  { name: '中文姓名', pattern: '^[\\u4e00-\\u9fa5]{2,4}$', description: '2-4位中文字符', testString: '张三', category: '常用' },
  { name: '车牌号', pattern: '^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-Z][A-HJ-NP-Z0-9]{5}$', description: '中国车牌格式', testString: '京A12345', category: '常用' },
  { name: 'HTML标签', pattern: '<(\\w+)(\\s[^>]*)?>(.*?)</\\w+>', description: '匹配HTML开闭标签对（本工具暂不支持反向引用，闭合标签用 \\w+ 匹配）', testString: '<div class="x">content</div> <span>text</span>', category: '前端' },
  { name: '文件扩展名', pattern: '^.+\\.(\\w+)$', description: '提取文件扩展名', testString: 'image.png', category: '前端' },
  { name: '经纬度', pattern: '^(\\-?\\d{1,3}\\.\\d+)\\s*,\\s*(\\-?\\d{1,3}\\.\\d+)$', description: '匹配经纬度坐标', testString: '116.404,39.915', category: '地理' },
  { name: '版本号', pattern: '^(\\d+)\\.(\\d+)\\.(\\d+)(?:-(\\w+))?$', description: '语义化版本号x.y.z-tag', testString: '2.3.1-beta', category: '常用' },
  { name: '时间格式', pattern: '^([01]?\\d|2[0-3]):([0-5]\\d)(?::([0-5]\\d))?$', description: 'HH:MM或HH:MM:SS', testString: '23:59:59', category: '常用' }
]

interface StateNode {
  id: number
  isAccept: boolean
  transitions: Map<string, number[]>
  epsilonTransitions: number[]
  _matcher?: (ch: string) => boolean
  // 零宽断言元信息：闭包扩展到该状态时需要检查上下文
  _anchor?: '^' | '$'
  _lookahead?: { positive: boolean; start: number; end: number }
  // 属于前瞻子图内部的状态（不参与主图布局/激活显示）
  _sub?: boolean
}

function buildNFA(pattern: string): { states: StateNode[]; startState: number; acceptStates: number[] } {
  const states: StateNode[] = []
  let stateCounter = 0
  let pos = 0
  let groupCount = 0

  function newState(): number {
    const id = stateCounter++
    states.push({ id, isAccept: false, transitions: new Map(), epsilonTransitions: [] })
    return id
  }

  function addTransition(from: number, symbol: string, to: number) {
    if (!states[from].transitions.has(symbol)) {
      states[from].transitions.set(symbol, [])
    }
    states[from].transitions.get(symbol)!.push(to)
  }

  function addEpsilon(from: number, to: number) {
    states[from].epsilonTransitions.push(to)
  }

  // 抛出带位置信息的解析错误，错误提示必须说明原因
  function fail(message: string, at: number = pos): never {
    const from = Math.max(0, at - 5)
    const to = Math.min(pattern.length, at + 6)
    const snippet = pattern.slice(from, to) || '(空)'
    throw new Error(`${message}（位置 ${at}，附近内容："${snippet}"）`)
  }

  function parseCharClass(): (ch: string) => boolean {
    const negative = pattern[pos] === '^'
    if (negative) pos++
    const matchers: ((ch: string) => boolean)[] = []
    const classStart = pos

    // 读取字符类中的一个 token：普通字符、转义符或简写（\d \w \s 等）
    const readToken = (): string | ((ch: string) => boolean) => {
      if (pattern[pos] !== '\\') {
        const c = pattern[pos]
        if (c === undefined) fail('字符类 "[" 未闭合，缺少 "]"')
        pos++
        return c
      }
      pos++ // 消耗 '\'
      const e = pattern[pos]
      if (e === undefined) fail('字符类中反斜杠 "\\\\" 后缺少需要转义的字符')
      if (e === 'd') { pos++; return (ch: string) => /\d/.test(ch) }
      if (e === 'w') { pos++; return (ch: string) => /\w/.test(ch) }
      if (e === 's') { pos++; return (ch: string) => /\s/.test(ch) }
      if (e === 'D') { pos++; return (ch: string) => !/\d/.test(ch) }
      if (e === 'W') { pos++; return (ch: string) => !/\w/.test(ch) }
      if (e === 'S') { pos++; return (ch: string) => !/\s/.test(ch) }
      if (e === 'n') { pos++; return '\n' }
      if (e === 't') { pos++; return '\t' }
      if (e === 'r') { pos++; return '\r' }
      if (e === 'u') {
        const hex = pattern.slice(pos + 1, pos + 5)
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('非法的 Unicode 转义，"\\u" 后需要 4 位十六进制字符')
        pos += 5
        return String.fromCharCode(parseInt(hex, 16))
      }
      pos++ // 其他转义按字面量（含 - ] \\ 等）
      return e
    }

    while (pos < pattern.length && pattern[pos] !== ']') {
      const token = readToken()
      // a-b 形式的范围：两端必须都是单字符 token
      if (pattern[pos] === '-' && pattern[pos + 1] !== undefined && pattern[pos + 1] !== ']') {
        if (typeof token !== 'string') {
          fail('字符类范围起点不能是简写符号（如 \\d、\\w），请使用具体字符或 \\uXXXX')
        }
        pos++ // 消耗 '-'
        const endToken = readToken()
        if (typeof endToken !== 'string') {
          fail('字符类范围终点不能是简写符号（如 \\d、\\w），请使用具体字符或 \\uXXXX')
        }
        const s = token
        const e = endToken
        if (s > e) fail(`字符类范围无效："${s}-${e}" 起点大于终点`)
        matchers.push((ch: string) => ch >= s && ch <= e)
      } else if (typeof token === 'function') {
        matchers.push(token)
      } else {
        const c = token
        matchers.push((ch: string) => ch === c)
      }
    }
    if (pattern[pos] !== ']') fail('字符类 "[" 未闭合，缺少 "]"')
    if (!negative && pos === classStart) fail('字符类 "[]" 内容为空')
    pos++ // skip ]
    if (negative) return (ch: string) => !matchers.some(fn => fn(ch))
    return (ch: string) => matchers.some(fn => fn(ch))
  }

  // 尝试解析 {m} / {m,} / {m,n} / {,n}，无法识别时返回 null（按字面量 '{' 处理）
  function parseBraceQuantifier(start: number): { min: number; max: number; nextPos: number } | null {
    const close = pattern.indexOf('}', start + 1)
    if (close === -1) return null
    const body = pattern.slice(start + 1, close)
    let min: number
    let max: number
    if (/^\d+$/.test(body)) {
      min = max = parseInt(body, 10)
    } else if (/^(\d*),(\d*)$/.test(body)) {
      const [a, b] = body.split(',')
      min = a === '' ? 0 : parseInt(a, 10)
      max = b === '' ? Infinity : parseInt(b, 10)
    } else {
      return null
    }
    if (max !== Infinity && min > max) {
      pos = start
      fail(`量词 "{${body}}" 无效：最小重复次数 ${min} 大于最大重复次数 ${max}`)
    }
    if (min > MAX_REPEAT || (max !== Infinity && max > MAX_REPEAT)) {
      pos = start
      fail(`量词 "{${body}}" 重复次数过大（上限 ${MAX_REPEAT}）`)
    }
    return { min, max, nextPos: close + 1 }
  }

  // 复制一段状态机子图（用于 {m,n} 的重复展开），返回复制片段的 [起点, 终点]
  function cloneSegment(srcStart: number, srcEnd: number): [number, number] {
    const idMap = new Map<number, number>()
    const cloneOf = (oldId: number) => {
      let id = idMap.get(oldId)
      if (id === undefined) {
        id = newState()
        // 保留断言/锚点/子图标记（复制片段出现在同样的上下文位置）
        const oldNode = states[oldId]
        states[id]._anchor = oldNode._anchor
        states[id]._lookahead = oldNode._lookahead
        states[id]._sub = oldNode._sub
        idMap.set(oldId, id)
      }
      return id
    }
    const start = cloneOf(srcStart)
    const visited = new Set<number>([srcStart])
    const stack = [srcStart]
    while (stack.length) {
      const oldId = stack.pop()!
      const newId = idMap.get(oldId)!
      if (oldId === srcEnd) continue // 片段终点不向外展开
      const oldNode = states[oldId]
      oldNode.transitions.forEach((targets, sym) => {
        for (const t of targets) {
          const nt = cloneOf(t)
          addTransition(newId, sym, nt)
          // 复制出的状态沿用原符号键，matcher 必须挂在（复制后的）源状态上
          if (sym.startsWith('__class_') && oldNode._matcher) {
            states[newId]._matcher = oldNode._matcher
          }
          if (t !== srcEnd && !visited.has(t)) {
            visited.add(t)
            stack.push(t)
          }
        }
      })
      for (const t of oldNode.epsilonTransitions) {
        const nt = cloneOf(t)
        addEpsilon(newId, nt)
        if (t !== srcEnd && !visited.has(t)) {
          visited.add(t)
          stack.push(t)
        }
      }
    }
    return [start, idMap.get(srcEnd)!]
  }

  // 用 {min,max} 语义包裹一个已构建好的片段
  function wrapBrace(srcStart: number, srcEnd: number, min: number, max: number): [number, number] {
    const entry = newState()
    let cursor: number
    if (min === 0) {
      cursor = entry
    } else {
      addEpsilon(entry, srcStart)
      cursor = srcEnd
      for (let i = 1; i < min; i++) {
        const [cs, ce] = cloneSegment(srcStart, srcEnd)
        addEpsilon(cursor, cs)
        cursor = ce
      }
    }
    if (max === Infinity) {
      const loopStart = newState()
      const loopEnd = newState()
      addEpsilon(cursor, loopStart)
      const [cs, ce] = cloneSegment(srcStart, srcEnd)
      addEpsilon(loopStart, cs)
      addEpsilon(loopStart, loopEnd)
      addEpsilon(ce, loopEnd)
      addEpsilon(ce, cs)
      return [entry, loopEnd]
    }
    // min=0 时原始片段作为第一个可选副本
    const optionalCount = min === 0 ? max : max - min
    for (let i = 0; i < optionalCount; i++) {
      const [cs, ce] = i === 0 && min === 0 ? [srcStart, srcEnd] : cloneSegment(srcStart, srcEnd)
      const oStart = newState()
      const oEnd = newState()
      addEpsilon(cursor, oStart)
      addEpsilon(oStart, cs)
      addEpsilon(oStart, oEnd)
      addEpsilon(ce, oEnd)
      cursor = oEnd
    }
    return [entry, cursor]
  }

  function parseConcat(): [number, number] {
    let segStart = -1
    let segEnd = -1
    let hasAtom = false

    const append = (s: number, e: number) => {
      if (!hasAtom) { segStart = s; hasAtom = true }
      else addEpsilon(segEnd, s)
      segEnd = e
    }

    // 锚点/断言是零宽原子：门状态通过后经 ε 边到出口状态
    const appendAnchor = (gate: number, gateOut: number) => {
      if (!hasAtom) { segStart = gate; hasAtom = true }
      else addEpsilon(segEnd, gate)
      segEnd = gateOut
    }

    while (pos < pattern.length && !['|', ')'].includes(pattern[pos])) {
      let atomStart: number
      let atomEnd: number
      const ch = pattern[pos]

      if (ch === '*' || ch === '+' || ch === '?') {
        fail(`量词 "${ch}" 前面没有可重复的内容`)
      } else if (ch === '(') {
        pos++
        groupCount++
        let atomS: number, atomE: number
        if (pattern[pos] === '?') {
          pos++
          if (pattern[pos] === ':') {
            pos++
            if (pattern[pos] === ')') fail('括号 "(?:)" 内缺少表达式')
            ;[atomS, atomE] = parseOr()
          } else if (pattern[pos] === '=' || pattern[pos] === '!') {
            // 正向/负向先行断言 (?=...) / (?!...)
            const positive = pattern[pos] === '='
            pos++
            if (pattern[pos] === ')') fail(positive ? '断言 "(?=)" 内缺少表达式' : '断言 "(?!)" 内缺少表达式')
            const subCreatedFrom = stateCounter
            const [subStart, subEnd] = parseOr()
            for (let i = subCreatedFrom; i < stateCounter; i++) states[i]._sub = true
            if (pattern[pos] !== ')') fail('括号 "(" 未闭合，缺少 ")"')
            pos++ // skip )
            const gate = newState()
            const gateOut = newState()
            states[gate]._lookahead = { positive, start: subStart, end: subEnd }
            addEpsilon(gate, gateOut)
            // 断言是零宽原子
            appendAnchor(gate, gateOut)
            continue
          } else {
            fail('暂不支持 (?<=)、(?<!) 后行断言或命名分组语法，请改用 (?=)、(?!) 或普通分组')
          }
        } else {
          if (pattern[pos] === ')') fail('括号 "()" 内缺少表达式')
          ;[atomS, atomE] = parseOr()
        }
        atomStart = atomS
        atomEnd = atomE
        if (pattern[pos] !== ')') fail('括号 "(" 未闭合，缺少 ")"')
        pos++ // skip )
      } else if (ch === ')') {
        fail('存在多余的右括号 ")"')
      } else if (ch === '[') {
        pos++
        atomStart = newState()
        atomEnd = newState()
        const matcher = parseCharClass()
        const symbol = '__class_' + atomStart
        addTransition(atomStart, symbol, atomEnd)
        states[atomStart]._matcher = matcher
      } else if (ch === '.') {
        atomStart = newState()
        atomEnd = newState()
        addTransition(atomStart, '__dot', atomEnd)
        pos++
      } else if (ch === '\\') {
        pos++ // 消耗 '\'
        const escaped = pattern[pos]
        if (escaped === undefined) fail('反斜杠 "\\\\" 后缺少需要转义的字符')
        if (/[1-9]/.test(escaped)) fail(`反向引用 "\\${escaped}" 暂不支持，请改用普通分组或字符类`)
        atomStart = newState()
        atomEnd = newState()
        if (escaped === 'd') addTransition(atomStart, '__digit', atomEnd)
        else if (escaped === 'w') addTransition(atomStart, '__word', atomEnd)
        else if (escaped === 's') addTransition(atomStart, '__space', atomEnd)
        else if (escaped === 'D') addTransition(atomStart, '__not_digit', atomEnd)
        else if (escaped === 'W') addTransition(atomStart, '__not_word', atomEnd)
        else if (escaped === 'S') addTransition(atomStart, '__not_space', atomEnd)
        else if (escaped === 'n') addTransition(atomStart, '\n', atomEnd)
        else if (escaped === 't') addTransition(atomStart, '\t', atomEnd)
        else if (escaped === 'r') addTransition(atomStart, '\r', atomEnd)
        else if (escaped === 'u') {
          const hex = pattern.slice(pos + 1, pos + 5)
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('非法的 Unicode 转义，"\\u" 后需要 4 位十六进制字符')
          addTransition(atomStart, String.fromCharCode(parseInt(hex, 16)), atomEnd)
          pos += 5
          append(atomStart, atomEnd)
          continue
        } else addTransition(atomStart, escaped, atomEnd)
        pos++ // 消耗转义字符（\n \t \d 等均为单字符后缀）
      } else if (ch === '^' || ch === '$') {
        // 真实的锚点：零宽，闭包扩展时按当前输入位置判定
        const gate = newState()
        const gateOut = newState()
        states[gate]._anchor = ch
        addEpsilon(gate, gateOut)
        pos++
        appendAnchor(gate, gateOut)
        continue
      } else {
        // 包括不构成量词的 '{'，按普通字面量处理（与浏览器正则的宽松行为一致）
        atomStart = newState()
        atomEnd = newState()
        addTransition(atomStart, ch, atomEnd)
        pos++
      }

      // 处理紧跟在原子后面的量词
      let quantifierApplied = false
      while (pos < pattern.length && ['*', '+', '?', '{'].includes(pattern[pos])) {
        const q = pattern[pos]
        if (q === '{') {
          const brace = parseBraceQuantifier(pos)
          if (!brace) break // 不是量词，'{' 留给下一轮按字面量消费
          if (quantifierApplied) fail(`量词重复："{${brace.min === brace.max ? brace.min : brace.min + ',' + (brace.max === Infinity ? '' : brace.max)}}" 前不能再叠加量词`)
          pos = brace.nextPos
          const wrapped = wrapBrace(atomStart, atomEnd, brace.min, brace.max)
          atomStart = wrapped[0]
          atomEnd = wrapped[1]
        } else {
          if (quantifierApplied) fail(`量词重复："${q}" 前不能再叠加量词`)
          pos++
          const qStart = newState()
          const qEnd = newState()
          addEpsilon(qStart, atomStart)
          if (q === '*') { addEpsilon(qStart, qEnd); addEpsilon(atomEnd, qEnd); addEpsilon(atomEnd, atomStart) }
          else if (q === '+') { addEpsilon(atomEnd, qEnd); addEpsilon(atomEnd, atomStart) }
          else { addEpsilon(qStart, qEnd); addEpsilon(atomEnd, qEnd) }
          atomStart = qStart
          atomEnd = qEnd
        }
        quantifierApplied = true
        if (pos < pattern.length && pattern[pos] === '?') pos++ // 惰性标记，本引擎匹配语义不区分
      }

      append(atomStart, atomEnd)
    }

    if (!hasAtom) {
      // 空表达式（起始位置、a|、(|b) 等）等价于一条 ε 边
      const s = newState()
      return [s, s]
    }
    return [segStart, segEnd]
  }

  function parseOr(): [number, number] {
    const [s1, e1] = parseConcat()
    let start = s1
    let end = e1
    while (pos < pattern.length && pattern[pos] === '|') {
      pos++
      const [s2, e2] = parseConcat()
      const ns = newState()
      const ne = newState()
      addEpsilon(ns, start)
      addEpsilon(ns, s2)
      addEpsilon(end, ne)
      addEpsilon(e2, ne)
      start = ns
      end = ne
    }
    return [start, end]
  }

  if (pattern.length === 0) {
    const s = newState()
    states[s].isAccept = true
    return { states, startState: s, acceptStates: [s] }
  }

  const [startState, acceptState] = parseOr()
  if (pos < pattern.length) fail('存在多余的右括号 ")"', pos)
  states[acceptState].isAccept = true
  void groupCount
  return { states, startState, acceptStates: [acceptState] }
}

interface ClosureContext {
  input: string
  index: number
}

// 前瞻子匹配：从子图 subStart 出发，在不影响主匹配的前提下尝试到达 subEnd。
// 子图可以消耗任意数量的字符，内部锚点/嵌套断言同样生效。
function subMatches(states: StateNode[], subStart: number, subEnd: number, input: string, index: number): boolean {
  let current = Array.from(epsilonClosure(states, subStart, { input, index }))
  if (current.includes(subEnd)) return true
  for (let i = index; i < input.length; i++) {
    const ch = input[i]
    const next: number[] = []
    const seen = new Set<number>()
    for (const s of current) {
      for (const t of matchTransition(states[s], ch)) {
        for (const c of epsilonClosure(states, t, { input, index: i + 1 })) {
          if (c === subEnd) return true
          if (!seen.has(c)) { seen.add(c); next.push(c) }
        }
      }
    }
    if (next.length === 0) return false
    current = next
  }
  return false
}

// 带上下文的 ε-闭包：经过锚点/断言门时按当前输入位置判定，门不通过时该状态整条路径丢弃
function epsilonClosure(states: StateNode[], stateId: number, ctx: ClosureContext): Set<number> {
  const closure = new Set<number>()
  const stack = [stateId]
  const gatePasses = (node: StateNode): boolean => {
    if (node._anchor === '^' && ctx.index !== 0) return false
    if (node._anchor === '$' && ctx.index !== ctx.input.length) return false
    if (node._lookahead) {
      const { positive, start, end } = node._lookahead
      const ok = subMatches(states, start, end, ctx.input, ctx.index)
      if (positive !== ok) return false
    }
    return true
  }
  while (stack.length) {
    const s = stack.pop()!
    if (closure.has(s)) continue
    const node = states[s]
    if (!gatePasses(node)) continue // 门未通过：不进入闭包，也不展开其后继
    closure.add(s)
    for (const next of node.epsilonTransitions) {
      if (!closure.has(next)) stack.push(next)
    }
  }
  return closure
}

function matchTransition(state: StateNode, symbol: string): number[] {
  const results: number[] = []
  for (const [sym, targets] of state.transitions) {
    if (sym === symbol) { results.push(...targets); continue }
    if (sym === '__dot' && symbol !== '\n') { results.push(...targets); continue }
    if (sym === '__digit' && /\d/.test(symbol)) { results.push(...targets); continue }
    if (sym === '__word' && /\w/.test(symbol)) { results.push(...targets); continue }
    if (sym === '__space' && /\s/.test(symbol)) { results.push(...targets); continue }
    if (sym === '__not_digit' && !/\d/.test(symbol)) { results.push(...targets); continue }
    if (sym === '__not_word' && !/\w/.test(symbol)) { results.push(...targets); continue }
    if (sym === '__not_space' && !/\s/.test(symbol)) { results.push(...targets); continue }
    if (sym.startsWith('__class_')) {
      const matcher = state._matcher
      if (matcher && matcher(symbol)) results.push(...targets)
    }
  }
  return results
}

function runMatch(states: StateNode[], startState: number, input: string): MatchResult {
  const steps: MatchStep[] = []
  let backtracks = 0
  let stepIndex = 0
  const startTime = performance.now()

  const guard = () => {
    if (stepIndex > MAX_MATCH_STEPS) {
      throw new Error(`匹配步数超过 ${MAX_MATCH_STEPS} 步上限，可能发生灾难性回溯，请简化正则或缩短测试文本`)
    }
  }

  // 判断某个状态集合在当前位置（零宽）是否能到达接受态
  const canAcceptAt = (current: number[], i: number): boolean =>
    current.some(s => {
      for (const c of epsilonClosure(states, s, { input, index: i })) {
        if (states[c].isAccept) return true
      }
      return false
    })

  // Try to match from each position
  for (let startPos = 0; startPos <= input.length; startPos++) {
    // 贪婪语义：记录在该起点上能到达接受态的最长终点，
    // 不能在第一次接受时就返回——带 $ 等锚点时，后续字符可能使接受态失效。
    let bestEnd = -1
    let currentStates = Array.from(epsilonClosure(states, startState, { input, index: startPos }))
    if (canAcceptAt(currentStates, startPos)) bestEnd = startPos

    for (let i = startPos; i < input.length; i++) {
      const char = input[i]
      const nextStates: number[] = []
      const seen = new Set<number>()

      for (const s of currentStates) {
        const targets = matchTransition(states[s], char)
        for (const t of targets) {
          const closure = epsilonClosure(states, t, { input, index: i + 1 })
          for (const c of closure) {
            if (!seen.has(c)) {
              seen.add(c)
              nextStates.push(c)
              steps.push({
                stepIndex: stepIndex++,
                charIndex: i,
                char,
                currentState: s,
                nextState: c,
                transition: char,
                isBacktrack: false,
                isMatch: true
              })
              guard()
            }
          }
        }
      }

      if (nextStates.length === 0) {
        if (bestEnd === -1) {
          backtracks++
          steps.push({
            stepIndex: stepIndex++,
            charIndex: i,
            char,
            currentState: currentStates[0] ?? -1,
            nextState: -1,
            transition: 'FAIL',
            isBacktrack: true,
            isMatch: false
          })
          guard()
        }
        break
      }
      currentStates = nextStates
      if (canAcceptAt(currentStates, i + 1)) bestEnd = i + 1
    }

    if (bestEnd !== -1) {
      const matchText = input.substring(startPos, bestEnd)
      const duration = performance.now() - startTime
      return {
        matched: true,
        matchText,
        groups: [matchText],
        steps,
        backtracks,
        totalSteps: stepIndex,
        duration: Math.round(duration * 100) / 100
      }
    }
  }

  const duration = performance.now() - startTime
  return { matched: false, matchText: '', groups: [], steps, backtracks, totalSteps: stepIndex, duration: Math.round(duration * 100) / 100 }
}

function transitionLabel(symbol: string | null): string {
  if (symbol === null) return 'ε'
  if (symbol === '__dot') return '.'
  if (symbol === '__digit') return '\\d'
  if (symbol === '__word') return '\\w'
  if (symbol === '__space') return '\\s'
  if (symbol === '__not_digit') return '\\D'
  if (symbol === '__not_word') return '\\W'
  if (symbol === '__not_space') return '\\S'
  if (symbol.startsWith('__class_')) return '[…]'
  return symbol
}

export function computeNFA(nfaResult: ReturnType<typeof buildNFA>): NFA {
  // 前瞻子图内部状态不参与主图展示，只保留断言门
  const visible = nfaResult.states.filter(s => !s._sub)
  const nodes = visible.map(s => ({
    id: s.id,
    isStart: s.id === nfaResult.startState,
    isAccept: nfaResult.acceptStates.includes(s.id),
    x: 0, y: 0
  }))

  // Layout: circular
  const cx = 400, cy = 300, radius = 200
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2
    n.x = cx + Math.cos(angle) * radius
    n.y = cy + Math.sin(angle) * radius
  })

  const visibleIds = new Set(visible.map(s => s.id))
  const transitions: NFA['transitions'] = []
  visible.forEach(s => {
    s.transitions.forEach((targets, symbol) => {
      targets.forEach(t => {
        if (!visibleIds.has(t)) return
        transitions.push({ from: s.id, to: t, symbol, label: transitionLabel(symbol) })
      })
    })
    s.epsilonTransitions.forEach(t => {
      if (!visibleIds.has(t)) return
      transitions.push({ from: s.id, to: t, symbol: null, label: 'ε' })
    })
    if (s._lookahead) {
      transitions.push({ from: s.id, to: s.id, symbol: '__lookahead', label: s._lookahead.positive ? '(?=)' : '(?!)' })
    }
    if (s._anchor) {
      transitions.push({ from: s.id, to: s.id, symbol: '__anchor', label: s._anchor })
    }
  })

  return { states: nodes, transitions, startState: nfaResult.startState, acceptStates: nfaResult.acceptStates }
}

export function parseAST(pattern: string): ASTNode {
  let pos = 0
  let groupIdx = 0

  function parseAtom(): ASTNode {
    const ch = pattern[pos]
    if (ch === '(') {
      pos++
      if (pattern[pos] === '?') { pos++; if (pattern[pos] === ':') pos++ }
      else groupIdx++
      const node = parseOr()
      if (pattern[pos] === ')') pos++
      return { type: 'group', children: [node], groupIndex: groupIdx }
    }
    if (ch === '[') {
      pos++
      let cls = ''
      while (pos < pattern.length && pattern[pos] !== ']') { cls += pattern[pos]; pos++ }
      pos++
      return { type: 'charclass', value: cls }
    }
    if (ch === '.') { pos++; return { type: 'dot' } }
    if (ch === '\\') {
      pos++
      const e = pattern[pos]; pos++
      if (e === 'd') return { type: 'digit' }
      if (e === 'w') return { type: 'word' }
      if (e === 's') return { type: 'space' }
      return { type: 'char', value: e }
    }
    if (ch === '^' || ch === '$') { pos++; return { type: 'anchor', value: ch } }
    pos++
    return { type: 'char', value: ch }
  }

  function parseQuantifier(): ASTNode {
    let node = parseAtom()
    while (pos < pattern.length && ['*', '+', '?', '{'].includes(pattern[pos])) {
      const q = pattern[pos]
      if (q === '{') {
        while (pos < pattern.length && pattern[pos] !== '}') pos++
        pos++
      } else {
        pos++
      }
      const type = q === '*' ? 'star' : q === '+' ? 'plus' : 'question'
      node = { type, children: [node] }
      if (pos < pattern.length && pattern[pos] === '?') pos++
    }
    return node
  }

  function parseConcat(): ASTNode {
    const nodes: ASTNode[] = []
    while (pos < pattern.length && !['|', ')'].includes(pattern[pos])) {
      nodes.push(parseQuantifier())
    }
    if (nodes.length === 1) return nodes[0]
    return { type: 'concat', children: nodes }
  }

  function parseOr(): ASTNode {
    let left = parseConcat()
    while (pos < pattern.length && pattern[pos] === '|') {
      pos++
      const right = parseConcat()
      left = { type: 'or', children: [left, right] }
    }
    return left
  }

  return parseOr()
}

export const useRegexStore = defineStore('regex', () => {
  const pattern = ref('^([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+)\\.([a-zA-Z]{2,})$')
  const testString = ref('test.user+tag@sub.domain.co.uk')
  const currentStep = ref(0)
  const isPlaying = ref(false)
  const nfa = ref<NFA | null>(null)
  const matchResult = ref<MatchResult | null>(null)
  const ast = ref<ASTNode | null>(null)
  const error = ref('')
  const status = ref<ExecStatus>('idle')
  const selectedTemplate = ref<string>('')

  const groupColors = GROUP_COLORS

  const matchHighlight = computed(() => {
    if (status.value !== 'success' || !matchResult.value || !matchResult.value.matched) return null
    const matchText = matchResult.value.matchText
    const idx = testString.value.indexOf(matchText)
    if (idx === -1) return null
    return {
      before: testString.value.substring(0, idx),
      match: matchText,
      after: testString.value.substring(idx + matchText.length)
    }
  })

  let playTimer: ReturnType<typeof setInterval> | null = null

  function stopPlayback() {
    if (playTimer !== null) {
      clearInterval(playTimer)
      playTimer = null
    }
    isPlaying.value = false
  }

  // 唯一的执行入口：错误状态、匹配结果、AST、画布数据在此原子地一起更新。
  // 失败时只清空派生结果，绝不修改用户输入。
  function execute() {
    stopPlayback()
    error.value = ''
    try {
      const built = buildNFA(pattern.value)
      const result = runMatch(built.states, built.startState, testString.value)
      nfa.value = computeNFA(built)
      matchResult.value = result
      ast.value = parseAST(pattern.value)
      currentStep.value = 0
      status.value = 'success'
    } catch (e: unknown) {
      error.value = e instanceof Error && e.message ? e.message : '正则表达式解析错误，请检查语法'
      nfa.value = null
      matchResult.value = null
      ast.value = null
      currentStep.value = 0
      status.value = 'error'
    }
  }

  // 只更新输入，不触发执行（由编辑面板统一调度，避免一次按键执行多次）
  function setPattern(p: string) {
    pattern.value = p
    if (selectedTemplate.value) selectedTemplate.value = ''
  }

  function setTestString(s: string) {
    testString.value = s
    if (selectedTemplate.value) selectedTemplate.value = ''
  }

  function applyTemplate(t: RegexTemplate) {
    pattern.value = t.pattern
    testString.value = t.testString
    selectedTemplate.value = t.name
    execute()
  }

  function stepForward() {
    if (matchResult.value && currentStep.value < matchResult.value.steps.length - 1) {
      currentStep.value++
    }
  }

  function stepBackward() {
    if (currentStep.value > 0) currentStep.value--
  }

  function resetStep() {
    currentStep.value = 0
  }

  function play() {
    if (isPlaying.value || !matchResult.value || matchResult.value.steps.length === 0) return
    isPlaying.value = true
    playTimer = setInterval(() => {
      if (matchResult.value && currentStep.value < matchResult.value.steps.length - 1) {
        currentStep.value++
      } else {
        stopPlayback()
      }
    }, 200)
  }

  function stop() {
    stopPlayback()
  }

  return {
    pattern, testString, currentStep, isPlaying, nfa, matchResult, ast, error,
    status, selectedTemplate, groupColors, matchHighlight,
    execute, setPattern, setTestString, applyTemplate,
    stepForward, stepBackward, resetStep, play, stop
  }
})
