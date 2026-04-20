<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">🦞</div>
      <h1 class="login-title">ClawSwarm</h1>
      <p class="login-subtitle">请输入访问令牌</p>

      <form @submit.prevent="submit" class="login-form">
        <input
          v-model="input"
          type="password"
          class="login-input"
          placeholder="访问令牌"
          autocomplete="current-password"
          autofocus
        />
        <p v-if="error" class="login-error">{{ error }}</p>
        <button type="submit" class="login-btn" :disabled="loading">
          {{ loading ? '验证中…' : '进入' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useAgentStore } from '@/stores/agentStore'
import { useRoomStore } from '@/stores/roomStore'
import { useWsStore } from '@/stores/wsStore'
import { agentApi } from '@/api'

const router = useRouter()
const authStore = useAuthStore()
const agentStore = useAgentStore()
const roomStore = useRoomStore()
const wsStore = useWsStore()

const input = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  if (!input.value.trim()) return

  loading.value = true
  const candidate = input.value.trim()
  authStore.login(candidate)
  try {
    await agentApi.list()
    await Promise.all([agentStore.fetchAgents(), roomStore.fetchRooms()])
    wsStore.connect()
    await router.replace('/')
  } catch {
    authStore.logout()
    error.value = '令牌无效，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
}

.login-card {
  width: 360px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 40px 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
}

.login-logo {
  font-size: 48px;
  line-height: 1;
  margin-bottom: 4px;
}

.login-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-heading);
  margin: 0;
}

.login-subtitle {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0 0 16px;
}

.login-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.login-input {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-input, var(--bg-primary));
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.login-input:focus {
  border-color: var(--accent, #5865f2);
}

.login-error {
  font-size: 13px;
  color: #ed4245;
  margin: 0;
}

.login-btn {
  width: 100%;
  padding: 10px;
  background: var(--accent, #5865f2);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.login-btn:hover:not(:disabled) {
  background: #4752c4;
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
