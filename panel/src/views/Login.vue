<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-950">
    <div class="w-full max-w-md p-8">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-white mb-2">🚀 EasyTunnel</h1>
        <p class="text-gray-400">CF Workers 代理管理面板</p>
      </div>

      <form @submit.prevent="handleLogin" class="bg-gray-900 rounded-xl p-8 shadow-2xl border border-gray-800">
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-300 mb-2">管理员密码</label>
          <input
            v-model="password"
            type="password"
            placeholder="请输入密码"
            class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            :disabled="loading"
            autofocus
          />
        </div>

        <p v-if="error" class="text-red-400 text-sm mb-4">{{ error }}</p>

        <button
          type="submit"
          class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition disabled:opacity-50"
          :disabled="loading || !password"
        >
          {{ loading ? '登录中...' : '登 录' }}
        </button>
      </form>

      <p class="text-center text-gray-600 text-xs mt-6">
        Powered by EasyTunnel v2.0
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const password = ref('')
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  if (!password.value) return
  loading.value = true
  error.value = ''

  try {
    const resp = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `password=${encodeURIComponent(password.value)}`,
    })
    const data = await resp.json()
    if (data.success) {
      router.push('/')
    } else {
      error.value = data.error || '密码错误'
    }
  } catch (e) {
    error.value = '网络错误，请重试'
  } finally {
    loading.value = false
  }
}
</script>
