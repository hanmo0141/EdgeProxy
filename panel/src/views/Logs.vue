<template>
  <div class="min-h-screen bg-gray-950">
    <nav class="bg-gray-900 border-b border-gray-800 px-6 py-3">
      <div class="flex items-center justify-between max-w-7xl mx-auto">
        <div class="flex items-center gap-3">
          <span class="text-xl font-bold text-white">🚀 EasyTunnel</span>
        </div>
        <div class="flex items-center gap-4">
          <router-link to="/" class="text-gray-300 hover:text-white transition">仪表盘</router-link>
          <router-link to="/nodes" class="text-gray-300 hover:text-white transition">节点</router-link>
          <router-link to="/users" class="text-gray-300 hover:text-white transition">用户</router-link>
          <router-link to="/logs" class="text-blue-400">日志</router-link>
          <router-link to="/settings" class="text-gray-300 hover:text-white transition">设置</router-link>
        </div>
      </div>
    </nav>

    <div class="max-w-6xl mx-auto p-6">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-white">操作日志</h1>
        <button @click="loadLogs" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition text-sm">
          刷新
        </button>
      </div>

      <div class="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-gray-800">
              <tr class="text-gray-400">
                <th class="text-left py-3 px-4">时间</th>
                <th class="text-left py-3 px-4">IP</th>
                <th class="text-left py-3 px-4">操作</th>
                <th class="text-left py-3 px-4">详情</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(log, i) in logs" :key="i" class="border-t border-gray-800/50 hover:bg-gray-800/30">
                <td class="py-2 px-4 text-gray-400 font-mono text-xs whitespace-nowrap">{{ log.time }}</td>
                <td class="py-2 px-4 font-mono text-xs">{{ log.ip }}</td>
                <td class="py-2 px-4">
                  <span class="bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded text-xs">{{ log.action }}</span>
                </td>
                <td class="py-2 px-4 text-gray-400 text-xs truncate max-w-xs">{{ log.detail }}</td>
              </tr>
              <tr v-if="logs.length === 0">
                <td colspan="4" class="py-8 text-center text-gray-500">暂无日志</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const logs = ref<any[]>([])

async function loadLogs() {
  try {
    const resp = await fetch('/admin/log.json')
    if (resp.ok) logs.value = await resp.json()
  } catch {}
}

onMounted(loadLogs)
</script>
