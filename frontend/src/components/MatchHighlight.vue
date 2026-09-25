<template>
  <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
    <h3 class="text-sm font-bold text-slate-400 mb-3">匹配结果高亮</h3>

    <!-- 失败：说明原因 + 重试，不显示任何旧结果 -->
    <div v-if="store.status === 'error'" class="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3">
      <div class="flex items-start justify-between gap-2">
        <div class="text-sm break-all">
          <span class="text-red-400 font-bold">✗ 执行失败：</span>
          <span class="text-red-400">{{ store.error }}</span>
        </div>
        <button @click="store.execute()" class="shrink-0 px-2 py-1 bg-red-800 hover:bg-red-700 rounded text-xs text-white">重试</button>
      </div>
    </div>

    <!-- 成功且匹配到 -->
    <div v-else-if="store.matchHighlight" class="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
      <template v-if="store.matchHighlight.before || store.matchHighlight.after">
        <span class="text-slate-500 whitespace-pre-wrap">{{ store.matchHighlight.before }}</span>
        <span class="bg-green-600 text-white px-1 rounded whitespace-pre-wrap">{{ store.matchHighlight.match }}</span>
        <span class="text-slate-500 whitespace-pre-wrap">{{ store.matchHighlight.after }}</span>
      </template>
      <span v-else class="text-slate-500">测试文本为空（空表达式匹配空串）</span>
    </div>

    <!-- 成功但零宽匹配（matchText 为空） -->
    <div v-else-if="store.status === 'success' && store.matchResult && store.matchResult.matched" class="text-yellow-400 text-sm">
      ✓ 匹配成功（零宽匹配，匹配文本为空）
    </div>

    <!-- 成功但未匹配 -->
    <div v-else-if="store.status === 'success'" class="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm">
      <span class="text-red-400 font-bold">✗ 未匹配到结果</span>
      <span class="text-slate-500 text-xs ml-2">正则合法，但测试文本中没有符合的内容</span>
    </div>

    <!-- 初始空态 -->
    <div v-else class="text-slate-500 text-sm py-2">等待执行...</div>

    <div v-if="store.status === 'success' && store.matchResult && store.matchResult.matched" class="mt-4">
      <h4 class="text-xs font-bold text-slate-500 mb-2">分组捕获 ({{ store.matchResult.groups.length }})</h4>
      <div class="space-y-1">
        <div v-for="(group, i) in store.matchResult.groups" :key="i" class="flex items-center gap-2 text-sm">
          <span class="inline-block w-4 h-4 rounded" :style="{ backgroundColor: store.groupColors[i % store.groupColors.length] }"></span>
          <span class="text-slate-500 w-16">Group {{ i }}</span>
          <span class="text-slate-200 font-mono bg-slate-900 px-2 py-0.5 rounded">{{ group || '∅' }}</span>
        </div>
      </div>
    </div>

    <div v-if="store.status === 'success' && store.matchResult && store.matchResult.steps.length > 0" class="mt-4">
      <h4 class="text-xs font-bold text-slate-500 mb-2">执行步骤 (最近5步)</h4>
      <div class="space-y-1 max-h-32 overflow-y-auto">
        <div v-for="step in recentSteps" :key="step.stepIndex"
          class="text-xs font-mono px-2 py-1 rounded"
          :class="step.isBacktrack ? 'bg-orange-900 text-orange-300' : step.stepIndex === store.currentStep ? 'bg-cyan-900 text-cyan-300' : 'bg-slate-900 text-slate-400'">
          [{{ step.stepIndex }}] '{{ step.char }}' → 状态{{ step.currentState}}→{{ step.nextState }} ({{ step.transition }}){{ step.isBacktrack ? ' ⚠回溯' : '' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRegexStore } from '../store/regex'

const store = useRegexStore()
const recentSteps = computed(() => {
  if (!store.matchResult) return []
  const end = store.currentStep + 1
  return store.matchResult.steps.slice(Math.max(0, end - 5), end)
})
</script>
