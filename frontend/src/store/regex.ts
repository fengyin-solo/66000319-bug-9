import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NFA, MatchResult, MatchStep, RegexTemplate, ASTNode, ExecuteStatus } from '../types'

const GROUP_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']

export const TEMPLATES: RegexTemplate[] = [
  { name: '邮箱地址', pattern: '^([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+)\\.([a-zA-Z]{2,})$', description: '匹配标准邮箱格式：用户名@域名.顶级域', testString: 'user@example.com admin@mail.org test.user+tag@sub.domain.co.uk', category: '常用' },
  { name: 'URL链接', pattern: '^(https?)://([^/:]+)(?::(\\d+))?(.*)$', description: '匹配HTTP/HTTPS URL：协议://主机:端口/路径', testString: 'https://www.example.com:8080/path/to/page http://localhost:3000/api', category: '常用' },
  { name: 'IPv4地址', pattern: '^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$', description: '匹配IPv4地址四段数字', testString: '192.168.1.1 10.0.0.1 255.255.255.0', category: '常用' },
  { name: '日期格式', pattern: '^(\\d{4})-(\\d{2})-(\\d{2})$', description: '匹配YYYY-MM-DD日期', testString: '2024-01-15 1999-12-31 2025-06-06', category: '常用' },
  { name: '手机号码', pattern: '^1[3-9]\\d{9}$', description: '匹配中国大陆手机号', testString: '13800138000 15912345678 18600000000', category: '常用' },
  { name: '身份证号', pattern: '^(\\d{6})(\\d{4})(\\d{2})(\\d{2})(\\d{3})([0-9Xx])$', description: '18位身份证：地区码+出生日期+顺序码+校验码', testString: '11010119900101001X 440304200512120039', category: '常用' },
  { name: '十六进制颜色', pattern: '^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$', description: '匹配#RGB或#RRGGBB格式', testString: '#FF5733 #abc #1A2B3C ff0000', category: '前端' },
  { name: '邮政编码', pattern: '^\\d{6}$', description: '6位中国邮编', testString: '100000 518000 200120', category: '常用' },
  { name: '浮点数', pattern: '^-?\\d+\\.\\d+$', description: '匹配带小数点的数字', testString: '3.14 -0.5 100.0', category: '数字' },
  { name: '科学计数法', pattern: '^-?\\d+(\\.\\d+)?[eE][+-]?\\d+$', description: '匹配科学计数法数字', testString: '1.5e10 -2.3E-4 6.022e23', category: '数字' },
  { name: 'MAC地址', pattern: '^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$', description: '匹配MAC地址XX:XX:XX:XX:XX:XX', testString: '00:1A:2B:3C:4D:5E AA-BB-CC-DD-EE-FF', category: '网络' },
  { name: 'UUID', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', description: '标准UUID格式', testString: '550e8400-e29b-41d4-a716-446655440000', category: '网络' },
  { name: 'QQ号', pattern: '^[1-9]\\d{4,10}$', description: '5-11位QQ号', testString: '12345 10000 1234567890', category: '常用' },
  { name: '密码强度', pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$', description: '至少8位含大小写字母数字特殊字符', testString: 'Passw0rd! Str0ng@Pass', category: '安全' },
  { name: '中文姓名', pattern: '^[一-龥]{2,4}$', description: '2-4位中文字符', testString: '张三 李世明 王小明', category: '常用' },
  { name: '车牌号', pattern: '^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-Z][A-HJ-NP-Z0-9]{5}$', description: '中国车牌格式', testString: '京A12345 沪B6789X', category: '常用' },
  { name: 'HTML标签', pattern: '<(\\w+)(\\s[^>]*)?>([^<]*)</\\w+>', description: '匹配HTML开闭标签对（当前引擎不支持反向引用，闭合标签按任意标签名匹配）', testString: '<div class="x">content</div> <span>text</span>', category: '前端' },
  { name: '文件扩展名', pattern: '^.+\\.(\\w+)$', description: '提取文件扩展名', testString: 'image.png doc.pdf index.html', category: '前端' },
  { name: '经纬度', pattern: '^(\\-?\\d{1,3}\\.\\d+)\\s*,\\s*(\\-?\\d{1,3}\\.\\d+)$', description: '匹配经纬度坐标', testString: '116.404,39.915 -73.9857,40.7484', category: '地理' },
  { name: '版本号', pattern: '^(\\d+)\\.(\\d+)\\.(\\d+)(?:-(\\w+))?$', description: '语义化版本号x.y.z-tag', testString: '1.0.0 2.3.1-beta 10.20.30', category: '常用' },
  { name: '时间格式', pattern: '^([01]?\\d|2[0-3]):([0-5]\\d)(?::([0-5]\\d))?$', description: 'HH:MM或HH:MM:SS', testString: '14:30 23:59:59 00:00', category: '常用' }
]

interface StateNode {
  id: number
  isAccept: boolean
  transitions: Map<string, number[]>
  epsilonTransitions: number[]
  // 从该状态出发的 ε 边所携带的零宽断言（如 (?=...)），key 为目标状态
  assertions?: Map<number, string[]>
  // 字符类 [a-z] 的判定函数，挂在转移的【源】状态上
  matcher?: (ch: string) => boolean
}

class ParseError extends Error {
  constructor(message: string, public index: number) {
    super(message)
    this.name = 'ParseError'
  }
}

// 从 '{' 起解析 {n} / {n,} / {n,m}；不是合法量词形式时返回 null（按字面 '{' 处理）
function readRepeatSpec(pattern: string, pos: number): { min: number; max: number; close: number } | null {
  let i = pos + 1
  const minStart = i
  while (i < pattern.length && pattern[i] >= '0' && pattern[i] <= '9') i++
  const minStr = pattern.slice(minStart, i)
  let min = minStr === '' ? 0 : parseInt(minStr, 10)
  let max = min
  let hasComma = false
  if (pattern[i] === ',') {
    hasComma = true
    i++
    const maxStart = i
    while (i < pattern.length && pattern[i] >= '0' && pattern[i] <= '9') i++
    const maxStr = pattern.slice(maxStart, i)
    max = maxStr === '' ? Infinity : parseInt(maxStr, 10)
  }
  if (pattern[i] !== '}') return null
  if (minStr === '' && !hasComma) return null
  if (minStr === '' && hasComma && max === Infinity) return null // "{,}" 不是合法量词
  if (max < min) throw new ParseError(`量词 {${minStr}${hasComma ? ',' : ''}${Number.isFinite(max) ? max : ''}} 的上限不能小于下限`, pos)
  return { min, max, close: i }
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

  function addGateEpsilon(from: number, to: number, assertion: string) {
    if (!states[from].assertions) states[from].assertions = new Map()
    const list = states[from].assertions!.get(to)
    if (list) list.push(assertion)
    else states[from].assertions!.set(to, [assertion])
  }

  // 将一个独立构建好的子 NFA 合并进当前状态表，返回子图在当前表中的 (start, accept)
  function mergeSubNFA(sub: ReturnType<typeof buildNFA>): [number, number] {
    const idMap = new Map<number, number>()
    for (const s of sub.states) {
      idMap.set(s.id, newState())
    }
    const remap = (id: number) => idMap.get(id)!
    for (const s of sub.states) {
      const dst = states[remap(s.id)]
      dst.isAccept = false // 子图的接受状态只用于断言判定，不作为整图接受态
      if (s.matcher) dst.matcher = s.matcher
      s.transitions.forEach((targets, sym) => {
        for (const t of targets) addTransition(dst.id, sym, remap(t))
      })
      for (const t of s.epsilonTransitions) addEpsilon(dst.id, remap(t))
      s.assertions?.forEach((list, t) => {
        for (const a of list) addGateEpsilon(dst.id, remap(t), a)
      })
    }
    return [remap(sub.startState), remap(sub.acceptStates[0])]
  }

  function parseCharClass(): (ch: string) => boolean {
    const classStart = pos - 1 // '[' 的位置
    const negative = pattern[pos] === '^'
    if (negative) pos++
    const ranges: [string, string][] = []
    const chars: string[] = []
    const extraPreds: ((ch: string) => boolean)[] = []
    while (pos < pattern.length && pattern[pos] !== ']') {
      if (pattern[pos] === '\\' && pos + 1 < pattern.length) {
        const e = pattern[pos + 1]
        const shorthand: Record<string, RegExp> = { d: /\d/, D: /\D/, w: /\w/, W: /\W/, s: /\s/, S: /\S/ }
        if (shorthand[e]) {
          const re = shorthand[e]
          extraPreds.push((ch: string) => re.test(ch))
          pos += 2
          continue
        }
        chars.push(e)
        pos += 2
        continue
      }
      if (pattern[pos + 1] === '-' && pattern[pos + 2] && pattern[pos + 2] !== ']') {
        if (pattern[pos] > pattern[pos + 2]) throw new ParseError('字符类区间起点不能大于终点', pos)
        ranges.push([pattern[pos], pattern[pos + 2]])
        pos += 3
      } else {
        chars.push(pattern[pos])
        pos++
      }
    }
    if (pos >= pattern.length) throw new ParseError('字符类缺少闭合的 ]', classStart)
    pos++ // skip ]
    return (ch: string) => {
      const hit = chars.includes(ch) || ranges.some(([s, e]) => ch >= s && ch <= e) || extraPreds.some(p => p(ch))
      return negative ? !hit : hit
    }
  }

  // 复制 [start,end] 子图：内部状态全部克隆，返回新的 (start',end')
  function copySubgraph(start: number, end: number): [number, number] {
    const map = new Map<number, number>()
    const stack = [start]
    const collected: number[] = []
    const seen = new Set<number>([start])
    while (stack.length) {
      const id = stack.pop()!
      if (id === end) continue
      collected.push(id)
      const s = states[id]
      const follow = [...s.epsilonTransitions]
      s.assertions?.forEach((_, t) => follow.push(t))
      s.transitions.forEach(targets => follow.push(...targets))
      for (const t of follow) {
        if (!seen.has(t)) { seen.add(t); stack.push(t) }
      }
    }
    for (const id of collected) {
      map.set(id, newState())
    }
    const newEnd = newState()
    map.set(end, newEnd)
    const resolve = (t: number) => map.get(t) ?? t
    for (const id of collected) {
      const src = states[id]
      const dstId = map.get(id)!
      const dst = states[dstId]
      if (src.matcher) dst.matcher = src.matcher
      src.transitions.forEach((targets, sym) => {
        for (const t of targets) addTransition(dstId, sym, resolve(t))
      })
      for (const t of src.epsilonTransitions) addEpsilon(dstId, resolve(t))
      src.assertions?.forEach((list, t) => {
        for (const a of list) addGateEpsilon(dstId, resolve(t), a)
      })
    }
    return [map.get(start)!, newEnd]
  }

  // 在 [segStart,segEnd] 外包裹量词 * + ? {n,m}，返回新片段
  function applyQuantifier(segStart: number, segEnd: number, q: string | { min: number; max: number }): [number, number] {
    const qStart = newState()
    const qEnd = newState()
    let min: number, max: number
    if (typeof q === 'string') {
      if (q === '*') { min = 0; max = Infinity }
      else if (q === '+') { min = 1; max = Infinity }
      else { min = 0; max = 1 } // '?'
    } else {
      min = q.min; max = q.max
    }

    // 串联 min 份必选副本（第一份直接复用原子图）
    let prevEnd = qStart
    for (let i = 0; i < min; i++) {
      if (i === 0) {
        addEpsilon(qStart, segStart)
        prevEnd = segEnd
      } else {
        const [cs, ce] = copySubgraph(segStart, segEnd)
        addEpsilon(prevEnd, cs)
        prevEnd = ce
      }
    }
    if (max === Infinity) {
      // 必选副本链后挂一个"单副本循环"：J→副本→J，每次循环恰好增加一份
      // {n,} = n 份必选 + 一个可重复的可选副本
      const j = prevEnd
      const [cs, ce] = copySubgraph(segStart, segEnd)
      addEpsilon(j, cs)
      addEpsilon(ce, j)
      addEpsilon(j, qEnd)
    } else {
      if (min === 0) addEpsilon(qStart, qEnd) // 一份都不取
      // 追加 max-min 份可选副本，每份均可旁路到 qEnd
      for (let i = 0; i < max - min; i++) {
        const [cs, ce] = copySubgraph(segStart, segEnd)
        addEpsilon(prevEnd, cs)
        addEpsilon(prevEnd, qEnd)
        prevEnd = ce
      }
      addEpsilon(prevEnd, qEnd)
    }
    return [qStart, qEnd]
  }

  function parseConcat(): [number, number] {
    let start = newState()
    let end = start
    while (pos < pattern.length && !['|', ')'].includes(pattern[pos])) {
      let segStart: number, segEnd: number
      const ch = pattern[pos]
      if (ch === '(') {
        const parenPos = pos
        pos++
        groupCount++
        let needsCloseParen = true
        if (pattern[pos] === '?') {
          pos++
          const c = pattern[pos]
          if (c === ':') {
            pos++
            const [s, e] = parseOr()
            segStart = s; segEnd = e
          } else if (c === '=' || c === '!') {
            // 正向/负向前瞻 (?=...) (?!...)：子表达式构建为独立 NFA，以带断言的 ε 门连接
            const negated = c === '!'
            pos++
            const subStart = pos
            let depth = 1
            while (pos < pattern.length && depth > 0) {
              if (pattern[pos] === '\\') { pos += 2; continue }
              if (pattern[pos] === '(') depth++
              else if (pattern[pos] === ')') depth--
              if (depth > 0) pos++
            }
            if (depth > 0) throw new ParseError('前瞻分组缺少闭合的 )', parenPos)
            const subPattern = pattern.slice(subStart, pos)
            pos++ // skip ) —— 前瞻分支自行消费闭括号
            needsCloseParen = false
            const [subEntry, subAccept] = mergeSubNFA(buildNFA(subPattern))
            segStart = newState()
            segEnd = newState()
            addGateEpsilon(segStart, segEnd, JSON.stringify({ kind: 'lookahead', negated, entry: subEntry, accept: subAccept }))
          } else {
            throw new ParseError(`不支持的分组语法 (?${c ?? ''}…，支持 (...) (?:...) (?=...) (?!...)`, parenPos)
          }
        } else {
          const [s, e] = parseOr()
          segStart = s; segEnd = e
        }
        if (needsCloseParen) {
          if (pattern[pos] !== ')') throw new ParseError('分组缺少闭合的 )', parenPos)
          pos++ // skip )
        }
      } else if (ch === '[') {
        pos++
        segStart = newState()
        segEnd = newState()
        const matcher = parseCharClass()
        states[segStart].matcher = matcher
        addTransition(segStart, '__class_' + segStart, segEnd)
      } else if (ch === '.') {
        segStart = newState()
        segEnd = newState()
        addTransition(segStart, '__dot', segEnd)
        pos++
      } else if (ch === '\\') {
        if (pos + 1 >= pattern.length) throw new ParseError('反斜杠 \\ 后缺少字符', pos)
        pos++
        const escaped = pattern[pos]
        segStart = newState()
        segEnd = newState()
        if (escaped === 'd') addTransition(segStart, '__digit', segEnd)
        else if (escaped === 'D') addTransition(segStart, '__notdigit', segEnd)
        else if (escaped === 'w') addTransition(segStart, '__word', segEnd)
        else if (escaped === 'W') addTransition(segStart, '__notword', segEnd)
        else if (escaped === 's') addTransition(segStart, '__space', segEnd)
        else if (escaped === 'S') addTransition(segStart, '__notspace', segEnd)
        else addTransition(segStart, escaped, segEnd)
        pos++
      } else if (ch === '^' || ch === '$') {
        // 锚点在本工具中按零宽位置处理（"搜索首个匹配"语义，模板测试串含多个示例）
        segStart = newState()
        segEnd = segStart
        pos++
      } else if (ch === '*' || ch === '+' || ch === '?') {
        throw new ParseError(`量词 "${ch}" 前没有可重复的表达式`, pos)
      } else if (ch === ')') {
        throw new ParseError('多余的闭合括号 )', pos)
      } else {
        segStart = newState()
        segEnd = newState()
        addTransition(segStart, ch, segEnd)
        pos++
      }

      // Handle quantifiers
      while (pos < pattern.length && ['*', '+', '?', '{'].includes(pattern[pos])) {
        if (pattern[pos] === '{') {
          const spec = readRepeatSpec(pattern, pos)
          if (!spec) break // 字面 '{'，跳出后作为普通字符消费
          ;[segStart, segEnd] = applyQuantifier(segStart, segEnd, spec)
          pos = spec.close + 1
        } else {
          const q = pattern[pos]
          ;[segStart, segEnd] = applyQuantifier(segStart, segEnd, q)
          pos++
        }
        if (pos < pattern.length && pattern[pos] === '?') pos++ // lazy
      }

      if (end !== segStart) addEpsilon(end, segStart)
      end = segEnd
    }
    return [start, end]
  }

  function parseOr(): [number, number] {
    const [s1, e1] = parseConcat()
    let start = s1, end = e1
    while (pos < pattern.length && pattern[pos] === '|') {
      pos++
      if (pos >= pattern.length || pattern[pos] === ')' || pattern[pos] === '|') {
        throw new ParseError('选择符 | 两侧都需要表达式', pos - 1)
      }
      const [s2, e2] = parseConcat()
      const ns = newState(), ne = newState()
      addEpsilon(ns, start); addEpsilon(ns, s2)
      addEpsilon(end, ne); addEpsilon(e2, ne)
      start = ns; end = ne
    }
    return [start, end]
  }

  if (pattern.length === 0) throw new ParseError('正则表达式不能为空', 0)
  const [startState, acceptState] = parseOr()
  if (pos < pattern.length) {
    if (pattern[pos] === ')') throw new ParseError('多余的闭合括号 )', pos)
    throw new ParseError(`意外的字符 "${pattern[pos]}"`, pos)
  }
  states[acceptState].isAccept = true
  return { states, startState, acceptStates: [acceptState] }
}

// 从指定位置出发，子 NFA 是否能到达指定接受状态（用于前瞻断言判定）
function canMatchFrom(states: StateNode[], startState: number, acceptId: number, input: string, pos: number): boolean {
  let current = Array.from(closureWithGates(states, startState, input, pos))
  if (current.some(s => s === acceptId)) return true
  for (let i = pos; i < input.length; i++) {
    const next = new Set<number>()
    for (const s of current) {
      for (const t of matchTransition(states[s], input[i])) {
        for (const c of closureWithGates(states, t, input, i + 1)) next.add(c)
      }
    }
    if (next.size === 0) return false
    current = Array.from(next)
    if (current.some(s => s === acceptId)) return true
  }
  return false
}

// 带断言门的 ε 闭包：跨门时先判定门上的零宽断言是否在当前位置成立
function closureWithGates(states: StateNode[], stateId: number, input: string, pos: number): Set<number> {
  const closure = new Set<number>([stateId])
  const stack = [stateId]
  while (stack.length) {
    const s = stack.pop()!
    for (const next of states[s].epsilonTransitions) {
      if (!closure.has(next)) { closure.add(next); stack.push(next) }
    }
    states[s].assertions?.forEach((list, next) => {
      if (closure.has(next)) return
      const pass = list.every(a => {
        const gate = JSON.parse(a) as
          | { kind: 'anchor'; value: string }
          | { kind: 'lookahead'; negated: boolean; entry: number; accept: number }
        if (gate.kind === 'anchor') {
          return gate.value === '^' ? pos === 0 : pos === input.length
        }
        const ok = canMatchFrom(states, gate.entry, gate.accept, input, pos)
        return gate.negated ? !ok : ok
      })
      if (pass) { closure.add(next); stack.push(next) }
    })
  }
  return closure
}

function matchTransition(state: StateNode, symbol: string): number[] {
  const results: number[] = []
  for (const [sym, targets] of state.transitions) {
    if (sym === symbol) { results.push(...targets); continue }
    if (sym === '__dot' && symbol !== '\n') { results.push(...targets); continue }
    if (sym === '__digit' && /\d/.test(symbol)) { results.push(...targets); continue }
    if (sym === '__notdigit' && /\D/.test(symbol)) { results.push(...targets); continue }
    if (sym === '__word' && /\w/.test(symbol)) { results.push(...targets); continue }
    if (sym === '__notword' && /\W/.test(symbol)) { results.push(...targets); continue }
    if (sym === '__space' && /\s/.test(symbol)) { results.push(...targets); continue }
    if (sym === '__notspace' && /\S/.test(symbol)) { results.push(...targets); continue }
    if (sym.startsWith('__class_')) {
      if (state.matcher && state.matcher(symbol)) results.push(...targets)
    }
  }
  return results
}

function runMatch(states: StateNode[], startState: number, input: string): MatchResult {
  const steps: MatchStep[] = []
  let backtracks = 0
  let stepIndex = 0
  const startTime = performance.now()

  // Try to match from each position
  for (let startPos = 0; startPos <= input.length; startPos++) {
    let currentStates = Array.from(closureWithGates(states, startState, input, startPos))
    let matched = false
    let matchEnd = startPos

    for (let i = startPos; i < input.length; i++) {
      const char = input[i]
      const nextStates: number[] = []
      const seen = new Set<number>()

      for (const s of currentStates) {
        const targets = matchTransition(states[s], char)
        for (const t of targets) {
          const closure = closureWithGates(states, t, input, i + 1)
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
            }
          }
        }
      }

      if (nextStates.length === 0) {
        if (currentStates.some(s => states[s].isAccept)) { matched = true; matchEnd = i; break }
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
        break
      }
      currentStates = nextStates
      if (currentStates.some(s => states[s].isAccept)) { matched = true; matchEnd = i + 1 }
    }

    if (matched || (startPos === input.length && currentStates.some(s => states[s].isAccept))) {
      const matchText = input.substring(startPos, matchEnd)
      const duration = performance.now() - startTime
      return {
        matched: true,
        matchText,
        startIndex: startPos,
        groups: [matchText],
        steps,
        backtracks,
        totalSteps: stepIndex,
        duration: Math.round(duration * 100) / 100
      }
    }
  }

  const duration = performance.now() - startTime
  return { matched: false, matchText: '', startIndex: -1, groups: [], steps, backtracks, totalSteps: stepIndex, duration: Math.round(duration * 100) / 100 }
}

export function computeNFA(nfaResult: ReturnType<typeof buildNFA>): NFA {
  const nodes = nfaResult.states.map((s, i) => ({
    id: s.id,
    isStart: i === nfaResult.startState,
    isAccept: nfaResult.acceptStates.includes(s.id),
    x: 0, y: 0
  }))

  // Layout: circular
  const cx = 400, cy = 250, radius = 180
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2
    n.x = cx + Math.cos(angle) * radius
    n.y = cy + Math.sin(angle) * radius
  })

  const transitions: NFA['transitions'] = []
  nfaResult.states.forEach(s => {
    s.transitions.forEach((targets, symbol) => {
      targets.forEach(t => {
        const label = symbol.startsWith('__') ? symbol.replace('__', '') : symbol
        transitions.push({ from: s.id, to: t, symbol, label })
      })
    })
    s.epsilonTransitions.forEach(t => {
      transitions.push({ from: s.id, to: t, symbol: null, label: 'ε' })
    })
    s.assertions?.forEach((list, t) => {
      list.forEach(a => {
        const gate = JSON.parse(a) as { kind: string; negated?: boolean; value?: string }
        const label = gate.kind === 'anchor'
          ? (gate.value ?? '^')
          : gate.negated ? '(?!…)' : '(?=…)'
        transitions.push({ from: s.id, to: t, symbol: null, label, assertion: a })
      })
    })
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
      let isLookahead = false
      let negated = false
      if (pattern[pos] === '?') {
        pos++
        if (pattern[pos] === ':') pos++
        else if (pattern[pos] === '=' || pattern[pos] === '!') {
          isLookahead = true
          negated = pattern[pos] === '!'
          pos++
        } else {
          throw new ParseError(`不支持的分组语法 (?${pattern[pos] ?? ''}…`, pos)
        }
      } else {
        groupIdx++
      }
      const node = parseOr()
      if (pattern[pos] === ')') pos++
      else throw new ParseError('分组缺少闭合的 )', pos)
      if (isLookahead) return { type: 'lookahead', children: [node], negated }
      return { type: 'group', children: [node], groupIndex: groupIdx }
    }
    if (ch === '[') {
      const classStart = pos
      pos++
      let cls = ''
      while (pos < pattern.length && pattern[pos] !== ']') { cls += pattern[pos]; pos++ }
      if (pos >= pattern.length) throw new ParseError('字符类缺少闭合的 ]', classStart)
      pos++
      return { type: 'charclass', value: cls }
    }
    if (ch === '.') { pos++; return { type: 'dot' } }
    if (ch === '\\') {
      if (pos + 1 >= pattern.length) throw new ParseError('反斜杠 \\ 后缺少字符', pos)
      pos++
      const e = pattern[pos]; pos++
      if (e === 'd') return { type: 'digit' }
      if (e === 'D') return { type: 'notdigit' }
      if (e === 'w') return { type: 'word' }
      if (e === 'W') return { type: 'notword' }
      if (e === 's') return { type: 'space' }
      if (e === 'S') return { type: 'notspace' }
      return { type: 'char', value: e }
    }
    if (ch === '^' || ch === '$') { pos++; return { type: 'anchor', value: ch } }
    if (ch === '*' || ch === '+' || ch === '?') throw new ParseError(`量词 "${ch}" 前没有可重复的表达式`, pos)
    pos++
    return { type: 'char', value: ch }
  }

  function parseQuantifier(): ASTNode {
    let node = parseAtom()
    while (pos < pattern.length && ['*', '+', '?', '{'].includes(pattern[pos])) {
      const q = pattern[pos]
      if (q === '{') {
        const spec = readRepeatSpec(pattern, pos)
        if (!spec) break
        node = { type: 'repeat', children: [node], min: spec.min, max: spec.max }
        pos = spec.close + 1
      } else {
        pos++
        const type = q === '*' ? 'star' : q === '+' ? 'plus' : 'question'
        node = { type, children: [node] }
      }
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
  const testString = ref('user@example.com admin@mail.org invalid-email')
  const currentStep = ref(0)
  const isPlaying = ref(false)
  const nfa = ref<NFA | null>(null)
  const matchResult = ref<MatchResult | null>(null)
  const ast = ref<ASTNode | null>(null)
  const error = ref('')
  const status = ref<ExecuteStatus>('idle')
  const selectedTemplate = ref<string>('')

  const groupColors = GROUP_COLORS

  let playTimer: ReturnType<typeof setInterval> | null = null

  const matchHighlight = computed(() => {
    if (!matchResult.value || !matchResult.value.matched || !matchResult.value.matchText) return null
    const matchText = matchResult.value.matchText
    const idx = matchResult.value.startIndex
    if (idx < 0 || idx + matchText.length > testString.value.length) return null
    return {
      before: testString.value.substring(0, idx),
      match: matchText,
      after: testString.value.substring(idx + matchText.length)
    }
  })

  // 原子化执行：一次调用内同步更新 状态/错误/NFA/结果/AST/步骤，
  // 任何失败路径都会先清空旧结果，避免错误提示、画布与结果区域互相残留。
  function execute() {
    stopPlayback()
    currentStep.value = 0
    error.value = ''

    const p = pattern.value
    const t = testString.value
    if (!p.trim() || !t.trim()) {
      status.value = 'empty'
      nfa.value = null
      matchResult.value = null
      ast.value = null
      error.value = !p.trim() ? '请输入正则表达式后再执行' : '请输入测试字符串后再执行'
      return
    }

    try {
      const built = buildNFA(p)
      const result = runMatch(built.states, built.startState, t)
      nfa.value = computeNFA(built)
      matchResult.value = result
      ast.value = parseAST(p)
      status.value = 'success'
    } catch (e: any) {
      status.value = 'error'
      error.value = e instanceof ParseError
        ? `${e.message}（位置 ${e.index}）`
        : (e?.message || '正则表达式解析错误')
      nfa.value = null
      matchResult.value = null
      ast.value = null
    }
  }

  function setPattern(p: string) {
    pattern.value = p
    // 手动修改后与模板库脱钩，避免高亮停留在旧模板上
    selectedTemplate.value = ''
    execute()
  }

  function setTestString(s: string) {
    testString.value = s
    execute()
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

  function stopPlayback() {
    if (playTimer !== null) {
      clearInterval(playTimer)
      playTimer = null
    }
    isPlaying.value = false
  }

  function play() {
    if (!matchResult.value || matchResult.value.steps.length === 0) return
    stopPlayback()
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
    pattern, testString, currentStep, isPlaying, nfa, matchResult, ast, error, status,
    selectedTemplate, groupColors, matchHighlight,
    execute, setPattern, setTestString, applyTemplate,
    stepForward, stepBackward, resetStep, play, stop
  }
})
