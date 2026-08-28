<template>
  <div class="min-h-screen bg-gray-950">
    <!-- 导航栏 -->
    <nav class="bg-gray-900 border-b border-gray-800 px-6 py-3">
      <div class="flex items-center justify-between max-w-7xl mx-auto">
        <div class="flex items-center gap-3">
          <span class="text-xl font-bold text-white">🚀 EdgeProxy</span>
          <span class="text-xs bg-blue-600 px-2 py-0.5 rounded">v2.0</span>
        </div>
        <div class="flex items-center gap-4">
          <router-link to="/" class="text-gray-300 hover:text-white transition">仪表盘</router-link>
          <router-link to="/nodes" class="text-gray-300 hover:text-white transition">节点</router-link>
          <router-link to="/users" class="text-gray-300 hover:text-white transition">用户</router-link>
          <router-link to="/logs" class="text-gray-300 hover:text-white transition">日志</router-link>
          <router-link to="/settings" class="text-gray-300 hover:text-white transition">设置</router-link>
          <button @click="logout" class="text-red-400 hover:text-red-300 text-sm">退出</button>
        </div>
      </div>
    </nav>

    <div class="max-w-7xl mx-auto p-6">
      <!-- 状态卡片 -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <div class="text-gray-400 text-sm mb-1">服务状态</div>
          <div class="text-2xl font-bold text-green-400">运行中</div>
          <div class="text-gray-500 text-xs mt-1">协议: {{ config?.协议类型 || '-' }}</div>
        </div>
        <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <div class="text-gray-400 text-sm mb-1">传输协议</div>
          <div class="text-2xl font-bold text-blue-400">{{ config?.传输协议 || '-' }}</div>
          <div class="text-gray-500 text-xs mt-1">Fingerprint: {{ config?.Fingerprint || '-' }}</div>
        </div>
        <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <div class="text-gray-400 text-sm mb-1">用户数</div>
          <div class="text-2xl font-bold text-purple-400">{{ config?.多用户?.length || 0 }}</div>
          <div class="text-gray-500 text-xs mt-1">已启用: {{ enabledUsers }}</div>
        </div>
      </div>

      <!-- 订阅链接 -->
      <div class="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8">
        <h2 class="text-lg font-semibold text-white mb-4">📋 订阅链接</h2>
        <div class="space-y-3">
          <div v-for="sub in subscriptions" :key="sub.label" class="flex items-center gap-3">
            <span class="text-gray-400 text-sm w-24">{{ sub.label }}</span>
            <input
              :value="sub.url"
              readonly
              class="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 font-mono"
            />
            <button
              @click="copyToClipboard(sub.url)"
              class="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition"
            >
              {{ copied === sub.label ? '✓' : '复制' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 节点列表 -->
      <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 class="text-lg font-semibold text-white mb-4">🌐 节点列表</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-gray-400 border-b border-gray-800">
                <th class="text-left py-3 px-4">节点地址</th>
                <th class="text-left py-3 px-4">端口</th>
                <th class="text-left py-3 px-4">协议</th>
                <th class="text-left py-3 px-4">备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(host, i) in config?.HOSTS || []" :key="i" class="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td class="py-3 px-4 font-mono text-blue-400">{{ host }}</td>
                <td class="py-3 px-4">443</td>
                <td class="py-3 px-4">
                  <span class="bg-green-900/50 text-green-400 px-2 py-0.5 rounded text-xs">{{ config?.协议类型 || 'vmess' }}</span>
                </td>
                <td class="py-3 px-4 text-gray-400">{{ host }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const config = ref<any>(null)
const copied = ref('')

const enabledUsers = computed(() => config.value?.多用户?.filter((u: any) => u.enabled).length || 0)

const subscriptions = computed(() => {
  if (!config.value) return []
  const base = window.location.origin
  return [
    { label: '自适应', url: `${base}/sub` },
    { label: 'Clash', url: `${base}/sub?clash` },
    { label: 'Singbox', url: `${base}/sub?sb` },
  ]
})

async function loadConfig() {
  try {
    const resp = await fetch('/admin/config.json')
    if (resp.ok) config.value = await resp.json()
  } catch {}
}

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text)
  copied.value = text
  setTimeout(() => copied.value = '', 2000)
}

function logout() {
  document.cookie = 'auth=; Path=/; Max-Age=0'
  router.push('/login')
}

onMounted(loadConfig)
</script>
