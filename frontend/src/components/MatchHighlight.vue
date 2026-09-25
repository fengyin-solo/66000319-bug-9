<template>
  <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
    <h3 class="text-sm font-bold text-slate-400 mb-3">匹配结果高亮</h3>

    <!-- 失败：展示错误原因与重试，绝不显示旧匹配 -->
    <div v-if="store.status === 'error'" class="bg-red-900/20 border border-red-800 rounded-lg p-3 flex items-start justify-between gap-2">
      <div class="text-sm text-red-300 break-all">
        <div class="font-bold text-red-400 mb-1">✗ 正则解析失败</div>
        {{ store.error }}
        <div class="text-xs text-slate-500 mt-1">已保留您输入的正则与测试字符串，修正后会自动重新执行。</div>
      </div>
      <button @click="store.execute()"
        class="shrink-0 px-2 py-1 bg-red-900/60 hover:bg-red-800 border border-red-700 rounded text-xs text-red-200">重试</button>
    </div>

    <!-- 空态 -->
    <div v-else-if="store.status === 'empty'" class="text-slate-400 text-sm bg-slate-900 rounded-lg p-4">
      ⓘ {{ store.error }}
    </div>
    <div v-else-if="store.status === 'idle'" class="text-slate-500 text-sm bg-slate-900 rounded-lg p-4">
      点击"执行匹配"开始
    </div>

    <!-- 成功且匹配 -->
    <div v-else-if="store.matchResult && store.matchResult.matched && store.matchHighlight" class="bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
      <span class="text-slate-500">{{ store.matchHighlight.before }}</span>
      <span class="bg-green-600 text-white px-1 rounded">{{ store.matchHighlight.match }}</span>
      <span class="text-slate-500">{{ store.matchHighlight.after }}</span>
    </div>

    <!-- 匹配到空字符串 -->
    <div v-else-if="store.matchResult && store.matchResult.matched" class="bg-slate-900 rounded-lg p-4 text-sm">
      <span class="text-green-400 font-bold">✓ 匹配成功</span>
      <span class="text-slate-500 ml-2">匹配到空字符串（位置 {{ store.matchResult.startIndex }}）</span>
    </div>

    <!-- 成功但无匹配 -->
    <div v-else-if="store.matchResult && !store.matchResult.matched" class="bg-slate-900 rounded-lg p-4 text-sm">
      <span class="text-orange-400 font-bold">✗ 暂无匹配结果</span>
      <span class="text-slate-500 ml-2">当前正则在测试字符串中找不到匹配，请调整表达式或测试内容。</span>
    </div>
    <div v-else class="text-slate-500 text-sm bg-slate-900 rounded-lg p-4">暂无结果数据</div>

    <!-- 分组捕获：仅成功且匹配时渲染 -->
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

    <!-- 执行步骤：仅成功且有步骤时渲染 -->
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
