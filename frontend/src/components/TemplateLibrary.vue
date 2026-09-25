<template>
  <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-bold text-slate-400">模板库 ({{ templates.length }})</h3>
      <button v-if="store.selectedTemplate" @click="clearSelection"
        class="text-xs text-slate-400 hover:text-cyan-400 px-2 py-0.5 rounded border border-slate-600 hover:border-cyan-500">
        取消模板 ✕
      </button>
    </div>
    <input v-model="search" placeholder="搜索模板..." class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm mb-3 focus:outline-none focus:border-cyan-500" />
    <div class="space-y-1 max-h-64 overflow-y-auto">
      <div v-if="filtered.length === 0" class="text-xs text-slate-500 py-3 text-center">没有匹配「{{ search }}」的模板</div>
      <div v-for="t in filtered" :key="t.name"
        @click="store.applyTemplate(t)"
        :class="['cursor-pointer p-2 rounded-lg border transition-all', store.selectedTemplate === t.name ? 'border-cyan-500 bg-cyan-900/30' : 'border-slate-700 bg-slate-900 hover:border-slate-500']">
        <div class="flex items-center justify-between">
          <span class="text-sm font-bold text-slate-200">{{ t.name }}</span>
          <span class="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{{ t.category }}</span>
        </div>
        <div class="text-xs text-slate-500 mt-1">{{ t.description }}</div>
        <div class="text-xs font-mono text-cyan-500 mt-1 truncate">{{ t.pattern }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRegexStore, TEMPLATES } from '../store/regex'
import type { RegexTemplate } from '../types'

const store = useRegexStore()
const templates: RegexTemplate[] = TEMPLATES
const search = ref('')

const filtered = computed(() => {
  if (!search.value) return templates
  const q = search.value.toLowerCase()
  return templates.filter(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.pattern.toLowerCase().includes(q))
})

// 取消模板高亮：不修改用户当前输入与结果，只让编辑面板/列表回到"手动输入"一致状态
function clearSelection() {
  store.selectedTemplate = ''
}
</script>
