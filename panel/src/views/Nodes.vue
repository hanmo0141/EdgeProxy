<template>
  <div class="min-h-screen bg-gray-950">
    <nav class="bg-gray-900 border-b border-gray-800 px-6 py-3">
      <div class="flex items-center justify-between max-w-7xl mx-auto">
        <div class="flex items-center gap-3">
          <span class="text-xl font-bold text-white">🚀 EdgeProxy</span>
        </div>
        <div class="flex items-center gap-4">
          <router-link to="/" class="text-gray-300 hover:text-white transition">仪表盘</router-link>
          <router-link to="/nodes" class="text-blue-400">节点</router-link>
          <router-link to="/users" class="text-gray-300 hover:text-white transition">用户</router-link>
          <router-link to="/logs" class="text-gray-300 hover:text-white transition">日志</router-link>
          <router-link to="/settings" class="text-gray-300 hover:text-white transition">设置</router-link>
        </div>
      </div>
    </nav>

    <div class="max-w-4xl mx-auto p-6">
      <h1 class="text-2xl font-bold text-white mb-6">节点管理</h1>

      <!-- HOSTS 配置 -->
      <div class="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
        <h2 class="text-lg font-semibold text-white mb-4">域名列表 (HOSTS)</h2>
        <textarea
          v-model="hostsText"
          rows="5"
          class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="每行一个域名，例如:&#10;example.com&#10;*.example.com&#10;123.example.com"
        ></textarea>
        <div class="flex gap-3 mt-4">
          <button @click="saveHosts" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
            保存
          </button>
          <button @click="loadConfig" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition">
            重新加载
          </button>
        </div>
      </div>

      <!-- 协议选择 -->
      <div class="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
        <h2 class="text-lg font-semibold text-white mb-4">协议配置</h2>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-gray-400 mb-2">协议类型</label>
            <select v-model="config.协议类型" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
              <option value="vmess">VMess</option>
              <option value="trojan">Trojan</option>
              <option value="ss">Shadowsocks</option>
            </select>
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-2">传输协议</label>
            <select v-model="config.传输协议" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
              <option value="ws">WebSocket</option>
              <option value="grpc">gRPC</option>
              <option value="xhttp">XHTTP</option>
            </select>
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-2">TLS 指纹</label>
            <select v-model="config.Fingerprint" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
              <option value="chrome">Chrome</option>
              <option value="firefox">Firefox</option>
              <option value="safari">Safari</option>
              <option value="edge">Edge</option>
              <option value="random">Random</option>
            </select>
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-2">UUID</label>
            <input v-model="config.UUID" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white font-mono text-sm" />
          </div>
        </div>
        <button @click="saveConfig" class="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
          保存配置
        </button>
      </div>

      <!-- 传输路径 -->
      <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 class="text-lg font-semibold text-white mb-4">传输路径</h2>
        <input
          v-model="config.PATH"
          class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="/video/%s?ed=2560"
        />
        <div class="flex items-center gap-4 mt-3">
          <label class="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" v-model="config.随机路径" class="rounded" />
            随机路径
          </label>
          <label class="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" v-model="config.启用0RTT" class="rounded" />
            启用 0-RTT
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const config = ref<any>({
  HOSTS: [],
  UUID: '',
  协议类型: 'vmess',
  传输协议: 'ws',
  Fingerprint: 'chrome',
  PATH: '/video/%s?ed=2560',
  随机路径: false,
  启用0RTT: false,
})
const hostsText = ref('')

async function loadConfig() {
  try {
    const resp = await fetch('/admin/config.json')
    if (resp.ok) {
      config.value = await resp.json()
      hostsText.value = (config.value.HOSTS || []).join('\n')
    }
  } catch {}
}

async function saveConfig() {
  config.value.HOSTS = hostsText.value.split('\n').map((s: string) => s.trim()).filter(Boolean)
  try {
    await fetch('/admin/config.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config.value),
    })
    alert('保存成功')
  } catch { alert('保存失败') }
}

async function saveHosts() {
  config.value.HOSTS = hostsText.value.split('\n').map((s: string) => s.trim()).filter(Boolean)
  await saveConfig()
}

onMounted(loadConfig)
</script>
