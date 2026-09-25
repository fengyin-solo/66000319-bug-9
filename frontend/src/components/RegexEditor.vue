<template>
  <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
    <h3 class="text-sm font-bold text-slate-400 mb-3">正则表达式输入</h3>
    <div class="relative">
      <span class="absolute left-3 top-2 text-cyan-500 font-bold text-lg">/</span>
      <input
        :value="store.pattern"
        @input="onPatternInput(($event.target as HTMLInputElement).value)"
        @keyup.enter="runNow"
        type="text"
        placeholder="输入正则表达式..."
        :class="['w-full bg-slate-900 border rounded-lg pl-8 pr-12 py-2 font-mono text-sm focus:outline-none', store.status === 'error' ? 'border-red-500 text-red-300 focus:border-red-500' : 'border-slate-600 text-cyan-400 focus:border-cyan-500']"
      />
      <span class="absolute right-3 top-2 text-cyan-500 font-bold text-lg">/g</span>
    </div>

    <div v-if="store.status === 'error'" class="mt-2 flex items-start justify-between gap-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2">
      <div class="text-red-400 text-sm break-all">
        <span class="font-bold">⚠ 解析失败：</span>{{ store.error }}
        <div class="text-xs text-red-500/80 mt-1">已保留你输入的内容，修改后会自动重新匹配</div>
      </div>
      <button @click="runNow" title="用当前内容重试" class="shrink-0 px-2 py-1 bg-red-800 hover:bg-red-700 rounded text-xs text-white">重试</button>
    </div>

    <textarea
      :value="store.testString"
      @input="onTestInput(($event.target as HTMLTextAreaElement).value)"
      placeholder="输入测试字符串..."
      rows="3"
      class="w-full mt-3 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 font-mono text-sm focus:outline-none focus:border-cyan-500 resize-none"
    ></textarea>
    <button @click="runNow" class="w-full mt-3 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white font-bold text-sm">执行匹配</button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import { useRegexStore } from '../store/regex'

const store = useRegexStore()

// pattern 与 testString 共用同一个计时器：任何一次输入都会取消上一次挂起的执行，
// 保证始终只按"最新输入"执行一次，不会出现旧结果覆盖新结果。
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function schedule() {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    store.execute()
  }, 300)
}

function onPatternInput(value: string) {
  store.setPattern(value)
  schedule()
}

function onTestInput(value: string) {
  store.setTestString(value)
  schedule()
}

function runNow() {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  store.execute()
}

onBeforeUnmount(() => {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  store.stop()
})
</script>
