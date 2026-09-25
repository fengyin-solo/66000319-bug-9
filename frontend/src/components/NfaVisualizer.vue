<template>
  <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-bold text-slate-400">NFA 状态机可视化</h3>
      <span v-if="store.nfa" class="text-xs text-slate-500">{{ store.nfa.states.length }} 状态 · {{ store.nfa.transitions.length }} 转移</span>
    </div>
    <div class="relative">
      <canvas ref="canvasRef" width="800" height="500" class="w-full bg-slate-900 rounded-lg border border-slate-700"></canvas>
      <!-- 各状态统一在画布区域给出稳定反馈，绝不残留上一次图形 -->
      <div v-if="overlayText" class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="text-center px-6">
          <div :class="overlayClass" class="text-sm">{{ overlayText }}</div>
          <div v-if="store.status === 'error'" class="text-xs text-slate-500 mt-1">修正左侧正则后自动重试，或点击"重试"</div>
        </div>
      </div>
    </div>
    <div class="mt-2 flex gap-4 text-xs text-slate-500">
      <span><span class="inline-block w-3 h-3 rounded-full bg-cyan-500 mr-1"></span>起始状态</span>
      <span><span class="inline-block w-3 h-3 rounded-full bg-green-500 mr-1"></span>接受状态</span>
      <span><span class="inline-block w-3 h-3 rounded-full bg-orange-500 mr-1"></span>当前激活</span>
      <span><span class="inline-block w-3 h-3 rounded-full bg-slate-600 mr-1"></span>普通状态</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRegexStore } from '../store/regex'

const store = useRegexStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)

const overlayText = computed(() => {
  switch (store.status) {
    case 'error': return '正则解析失败，无法生成状态机'
    case 'empty': return '等待输入：请填写正则表达式和测试字符串'
    case 'idle': return '尚未执行，点击"执行匹配"开始'
    default: return store.nfa ? '' : '无状态机数据'
  }
})
const overlayClass = computed(() => store.status === 'error' ? 'text-red-400' : 'text-slate-500')

function clearCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  // 无 NFA（解析失败/空输入）时先清空，避免残留上一次图形
  if (!store.nfa) { clearCanvas(); return }
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const activeStates = new Set<number>()
  if (store.matchResult && store.currentStep < store.matchResult.steps.length) {
    const step = store.matchResult.steps[store.currentStep]
    if (step) { activeStates.add(step.currentState); activeStates.add(step.nextState) }
  }

  // Draw transitions
  store.nfa.transitions.forEach(t => {
    const from = store.nfa!.states.find(s => s.id === t.from)
    const to = store.nfa!.states.find(s => s.id === t.to)
    if (!from || !to) return

    const isActive = activeStates.has(t.from) && activeStates.has(t.to)
    const isAssertion = !!t.assertion
    ctx.strokeStyle = isActive ? '#f97316' : isAssertion ? '#8b5cf6' : '#475569'
    ctx.lineWidth = isActive ? 2.5 : 1
    if (isAssertion) ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)

    if (t.from === t.to) {
      // Self loop
      const mx = from.x, my = from.y - 35
      ctx.quadraticCurveTo(mx + 25, my, from.x + 10, from.y - 15)
    } else {
      const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2
      const dx = to.x - from.x, dy = to.y - from.y
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const offX = -dy / len * 20, offY = dx / len * 20
      ctx.quadraticCurveTo(mx + offX, my + offY, to.x, to.y)
    }
    ctx.stroke()
    ctx.setLineDash([])

    // Arrowhead
    const angle = Math.atan2(to.y - from.y, to.x - from.x)
    const ex = to.x - Math.cos(angle) * 22, ey = to.y - Math.sin(angle) * 22
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex - Math.cos(angle - 0.4) * 8, ey - Math.sin(angle - 0.4) * 8)
    ctx.lineTo(ex - Math.cos(angle + 0.4) * 8, ey - Math.sin(angle + 0.4) * 8)
    ctx.closePath()
    ctx.fillStyle = isActive ? '#f97316' : isAssertion ? '#8b5cf6' : '#475569'
    ctx.fill()

    // Label
    const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2
    const dx2 = to.x - from.x, dy2 = to.y - from.y
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1
    const lx = mx - dy2 / len2 * 15, ly = my + dx2 / len2 * 15
    ctx.fillStyle = isActive ? '#fbbf24' : isAssertion ? '#a78bfa' : '#94a3b8'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(t.label, lx, ly)
  })

  // Draw states
  store.nfa.states.forEach(s => {
    const isActive = activeStates.has(s.id)
    const color = s.isStart ? '#06b6d4' : s.isAccept ? '#22c55e' : isActive ? '#f97316' : '#475569'

    ctx.beginPath()
    ctx.arc(s.x, s.y, 20, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = isActive ? '#fbbf24' : '#1e293b'
    ctx.lineWidth = 2
    ctx.stroke()

    if (s.isAccept) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, 15, 0, Math.PI * 2)
      ctx.strokeStyle = '#16a34a'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    ctx.fillStyle = '#f1f5f9'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(s.id), s.x, s.y)

    if (s.isStart) {
      ctx.beginPath()
      ctx.moveTo(s.x - 40, s.y)
      ctx.lineTo(s.x - 22, s.y)
      ctx.strokeStyle = '#06b6d4'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(s.x - 22, s.y)
      ctx.lineTo(s.x - 28, s.y - 4)
      ctx.lineTo(s.x - 28, s.y + 4)
      ctx.closePath()
      ctx.fillStyle = '#06b6d4'
      ctx.fill()
    }
  })
}

onMounted(() => { draw() })
watch(() => [store.nfa, store.currentStep, store.status], () => draw(), { deep: true })
</script>
