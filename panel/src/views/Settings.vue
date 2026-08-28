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
          <router-link to="/logs" class="text-gray-300 hover:text-white transition">日志</router-link>
          <router-link to="/settings" class="text-blue-400">设置</router-link>
        </div>
      </div>
    </nav>

    <div class="max-w-4xl mx-auto p-6 space-y-6">
      <h1 class="text-2xl font-bold text-white">高级设置</h1>

      <!-- 伪装页 -->
      <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 class="text-lg font-semibold text-white mb-4">伪装页设置</h2>
        <input
          v-model="config.首页伪装"
          class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="nginx 或自定义 URL"
        />
        <p class="text-gray-500 text-xs mt-2">访问时显示的伪装页面。填 "nginx" 显示 403 页面，填 URL 则反代到该站点。</p>
      </div>

      <!-- ECH 配置 -->
      <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 class="text-lg font-semibold text-white mb-4">ECH (加密客户端问候)</h2>
        <label class="flex items-center gap-2 mb-4">
          <input type="checkbox" v-model="config.ECH" class="rounded" />
          <span class="text-gray-300">启用 ECH</span>
        </label>
        <div v-if="config.ECH" class="space-y-3">
          <input v-model="config.ECHConfig.SNI" class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" placeholder="ECH SNI" />
          <input v-model="config.ECHConfig.DNS" class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm" placeholder="ECH DNS" />
        </div>
      </div>

      <!-- 反代设置 -->
      <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 class="text-lg font-semibold text-white mb-4">反代 (ProxyIP)</h2>
        <input
          v-model="proxyIP"
          class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="反代 IP，留空使用默认"
        />
        <p class="text-gray-500 text-xs mt-2">用于解决 Worker 无法直接访问部分 CF CDN 站点的问题。</p>
      </div>

      <!-- 订阅转换 -->
      <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 class="text-lg font-semibold text-white mb-4">订阅转换配置</h2>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-gray-400 mb-1">SUBAPI</label>
            <input v-model="config.订阅转换配置.SUBAPI" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">SUBCONFIG</label>
            <input v-model="config.订阅转换配置.SUBCONFIG" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white" />
          </div>
        </div>
      </div>

      <!-- 保存按钮 -->
      <button @click="saveAll" class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition">
        保存所有设置
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const config = ref<any>({
  首页伪装: 'nginx',
  ECH: false,
  ECHConfig: { SNI: '', DNS: '' },
  订阅转换配置: { SUBAPI: '', SUBCONFIG: '' },
})
const proxyIP = ref('')

async function loadConfig() {
  try {
    const resp = await fetch('/admin/config.json')
    if (resp.ok) config.value = await resp.json()
  } catch {}
}

async function saveAll() {
  try {
    await fetch('/admin/config.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config.value),
    })
    alert('保存成功')
  } catch { alert('保存失败') }
}

onMounted(loadConfig)
</script>
