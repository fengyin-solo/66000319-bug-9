export interface NFAState {
  id: number
  isStart: boolean
  isAccept: boolean
  x: number
  y: number
}

export interface NFATransition {
  from: number
  to: number
  symbol: string | null // null = epsilon
  label: string
  assertion?: string
}

export interface NFA {
  states: NFAState[]
  transitions: NFATransition[]
  startState: number
  acceptStates: number[]
}

export interface MatchStep {
  stepIndex: number
  charIndex: number
  char: string
  currentState: number
  nextState: number
  transition: string
  isBacktrack: boolean
  isMatch: boolean
}

export interface MatchResult {
  matched: boolean
  matchText: string
  startIndex: number
  groups: string[]
  steps: MatchStep[]
  backtracks: number
  totalSteps: number
  duration: number
}

export interface RegexTemplate {
  name: string
  pattern: string
  description: string
  testString: string
  category: string
}

export type ASTNodeType =
  | 'char' | 'star' | 'plus' | 'question' | 'repeat'
  | 'or' | 'concat' | 'group' | 'lookahead'
  | 'dot' | 'anchor' | 'charclass' | 'digit' | 'word' | 'space'
  | 'notdigit' | 'notword' | 'notspace'

export interface ASTNode {
  type: ASTNodeType
  value?: string
  children?: ASTNode[]
  groupIndex?: number
  min?: number
  max?: number // Infinity 表示无上限
  negated?: boolean
}

// 一次执行后各区域共享的状态：idle 未执行 / empty 缺少输入 / success 解析并执行完成 / error 解析或执行失败
export type ExecuteStatus = 'idle' | 'empty' | 'success' | 'error'
