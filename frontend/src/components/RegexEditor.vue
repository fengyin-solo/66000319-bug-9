<template>
  <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
    <h3 class="text-sm font-bold text-slate-400 mb-3">正则表达式输入</h3>
    <div class="relative">
      <span class="absolute left-3 top-2 text-cyan-500 font-bold text-lg">/</span>
      <input
        :value="store.pattern"
        @input="onPatternInput"
        @keyup.enter="flushNow"
        type="text"
        placeholder="输入正则表达式..."
        :class="['w-full bg-slate-900 border rounded-lg pl-8 pr-12 py-2 font-mono text-sm focus:outline-none', store.status === 'error' ? 'border-red-500 text-red-300 focus:border-red-400' : 'border-slate-600 text-cyan-400 focus:border-cyan-500']"
      />
      <span class="absolute right-3 top-2 text-cyan-500 font-bold text-lg">/g</span>
    </div>

    <!-- 失败：显示原因 + 重试；输入框内容原样保留 -->
    <div v-if="store.status === 'error'" class="mt-2 flex items-start justify-between gap-2">
      <div class="text-red-400 text-sm break-all">⚠ {{ store.error }}</div>
      <button @click="store.execute()" title="重试"
        class="shrink-0 px-2 py-0.5 bg-red-900/60 hover:bg-red-800 border border-red-700 rounded text-xs text-red-200">重试</button>
    </div>
    <div v-else-if="store.status === 'empty'" class="mt-2 text-slate-400 text-sm">ⓘ {{ store.error }}</div>
    <div v-else-if="store.status === 'success' && store.matchResult" class="mt-2 text-sm" :class="store.matchResult.matched ? 'text-green-400' : 'text-orange-400'">
      {{ store.matchResult.matched ? `✓ 已匹配「${store.matchResult.matchText || '空字符串'}」` : '✗ 测试字符串中无匹配' }}
    </div>

    <textarea
      :value="store.testString"
      @input="onTestInput"
      placeholder="输入测试字符串..."
      rows="3"
      class="w-full mt-3 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 font-mono text-sm focus:outline-none focus:border-cyan-500 resize-none"
    ></textarea>

    <div class="flex items-center justify-between mt-2">
      <label class="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
        <input type="checkbox" v-model="autoRun" class="accent-cyan-500" />
        输入时自动执行
      </label>
      <span v-if="store.selectedTemplate" class="text-xs text-slate-400">来自模板：<span class="text-cyan-400">{{ store.selectedTemplate }}</span></span>
      <span v-else class="text-xs text-slate-600">手动输入</span>
    </div>

    <button @click="flushNow" class="w-full mt-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white font-bold text-sm">执行匹配</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { useRegexStore } from '../store/regex'

const store = useRegexStore()
const autoRun = ref(true)

// pattern 与测试字符串使用各自独立的防抖定时器：
// 旧实现共用一个 timer，先改正则再改文本时，前一次校验被取消，
// 导致修正后错误提示残留。
let patternTimer: ReturnType<typeof setTimeout> | null = null
let testTimer: ReturnType<typeof setTimeout> | null = null

// 输入立即同步到 store（任何情况下用户输入都不丢失），仅对"执行"做防抖；
// 两个字段各自独立定时器，避免后输入取消前输入的校验导致错误提示残留
function onPatternInput(e: Event) {
  const value = (e.target as HTMLInputElement).value
  store.pattern = value
  store.selectedTemplate = '' // 手动编辑即与模板库脱钩
  if (patternTimer) clearTimeout(patternTimer)
  if (!autoRun.value) return
  patternTimer = setTimeout(() => store.execute(), 300)
}

function onTestInput(e: Event) {
  const value = (e.target as HTMLTextAreaElement).value
  store.testString = value
  if (testTimer) clearTimeout(testTimer)
  if (!autoRun.value) return
  testTimer = setTimeout(() => store.execute(), 300)
}

// 回车或点击按钮：取消挂起的防抖，立即按当前输入执行一次
function flushNow() {
  if (patternTimer) { clearTimeout(patternTimer); patternTimer = null }
  if (testTimer) { clearTimeout(testTimer); testTimer = null }
  store.execute()
}

onBeforeUnmount(() => {
  if (patternTimer) clearTimeout(patternTimer)
  if (testTimer) clearTimeout(testTimer)
})
</script>
