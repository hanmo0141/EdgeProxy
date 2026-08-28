<template>
  <div class="min-h-screen bg-gray-950">
    <nav class="bg-gray-900 border-b border-gray-800 px-6 py-3">
      <div class="flex items-center justify-between max-w-7xl mx-auto">
        <div class="flex items-center gap-3">
          <span class="text-xl font-bold text-white">🚀 EdgeProxy</span>
        </div>
        <div class="flex items-center gap-4">
          <router-link to="/" class="text-gray-300 hover:text-white transition">仪表盘</router-link>
          <router-link to="/nodes" class="text-gray-300 hover:text-white transition">节点</router-link>
          <router-link to="/users" class="text-blue-400">用户</router-link>
          <router-link to="/logs" class="text-gray-300 hover:text-white transition">日志</router-link>
          <router-link to="/settings" class="text-gray-300 hover:text-white transition">设置</router-link>
        </div>
      </div>
    </nav>

    <div class="max-w-4xl mx-auto p-6">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-white">用户管理</h1>
        <button @click="addUser" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition">
          + 添加用户
        </button>
      </div>

      <div class="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-gray-400 bg-gray-800/50">
              <th class="text-left py-3 px-4">用户名</th>
              <th class="text-left py-3 px-4">UUID</th>
              <th class="text-left py-3 px-4">状态</th>
              <th class="text-left py-3 px-4">流量</th>
              <th class="text-left py-3 px-4">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id" class="border-t border-gray-800/50 hover:bg-gray-800/30">
              <td class="py-3 px-4 text-white">{{ user.name }}</td>
              <td class="py-3 px-4 font-mono text-gray-400 text-xs">{{ user.uuid }}</td>
              <td class="py-3 px-4">
                <span :class="user.enabled ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'" class="px-2 py-0.5 rounded text-xs">
                  {{ user.enabled ? '启用' : '禁用' }}
                </span>
              </td>
              <td class="py-3 px-4 text-gray-400">{{ formatBytes(user.traffic.upload + user.traffic.download) }}</td>
              <td class="py-3 px-4">
                <button @click="toggleUser(user)" class="text-blue-400 hover:text-blue-300 mr-3">{{ user.enabled ? '禁用' : '启用' }}</button>
                <button @click="deleteUser(user)" class="text-red-400 hover:text-red-300">删除</button>
              </td>
            </tr>
            <tr v-if="users.length === 0">
              <td colspan="5" class="py-8 text-center text-gray-500">暂无用户</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 用户订阅链接 -->
      <div v-if="selectedUser" class="bg-gray-900 rounded-xl p-6 border border-gray-800 mt-6">
        <h2 class="text-lg font-semibold text-white mb-4">用户订阅</h2>
        <p class="text-gray-400 text-sm mb-3">{{ selectedUser.name }} 的订阅链接：</p>
        <input
          :value="getUserSubURL(selectedUser)"
          readonly
          class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 font-mono"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface User {
  id: string
  name: string
  uuid: string
  enabled: boolean
  traffic: { upload: number; download: number; limit: number }
}

const users = ref<User[]>([])
const selectedUser = ref<User | null>(null)

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function addUser() {
  const name = prompt('用户名:')
  if (!name) return
  users.value.push({
    id: Date.now().toString(),
    name,
    uuid: generateUUID(),
    enabled: true,
    traffic: { upload: 0, download: 0, limit: 0 },
  })
}

function toggleUser(user: User) {
  user.enabled = !user.enabled
}

function deleteUser(user: User) {
  if (confirm(`确定删除用户 ${user.name}？`)) {
    users.value = users.value.filter(u => u.id !== user.id)
  }
}

function getUserSubURL(user: User): string {
  return `${window.location.origin}/sub?uuid=${user.uuid}`
}

onMounted(async () => {
  try {
    const resp = await fetch('/admin/config.json')
    if (resp.ok) {
      const config = await resp.json()
      users.value = config.多用户 || []
    }
  } catch {}
})
</script>
