<template>
  <div class="tokens-view">
    <div class="page-header">
      <h1>Token Management</h1>
    </div>

    <!-- Agent selector -->
    <div class="agent-selector card mb-16">
      <div class="form-group" style="margin-bottom: 0">
        <label>Select Agent</label>
        <select v-model="selectedAgentId" @change="onAgentChange">
          <option value="">— Select an agent —</option>
          <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">
            {{ a.name }} ({{ a.status }})
          </option>
        </select>
      </div>
    </div>

    <div v-if="selectedAgentId">
      <div class="section-header">
        <h2>Tokens for {{ selectedAgentName }}</h2>
        <button class="btn btn-primary" @click="showCreateModal = true">+ New Token</button>
      </div>

      <div v-if="tokenStore.loading" class="loading">Loading tokens...</div>

      <div v-else-if="tokens.length === 0" class="empty-state">
        <div class="icon">🔑</div>
        <p>No tokens for this agent.</p>
      </div>

      <div v-else class="tokens-list">
        <div v-for="token in tokens" :key="token.id" class="token-row card">
          <div class="token-info">
            <div class="token-desc">
              <span class="font-bold">{{ token.description }}</span>
              <span v-if="token.revoked" class="tag tag-revoked">Revoked</span>
            </div>
            <div class="token-meta text-sm text-muted">
              ID: {{ token.id }} · Created: {{ formatDate(token.createdAt) }}
            </div>
          </div>
          <button
            v-if="!token.revoked"
            class="btn btn-danger btn-sm"
            @click="confirmRevoke(token)"
          >
            Revoke
          </button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="icon">🔑</div>
      <p>Select an agent to manage tokens.</p>
    </div>

    <!-- Create Token Modal -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="modal-overlay" @click.self="closeCreate">
        <div class="modal">
          <div class="modal-header">
            <h2>Create Token</h2>
            <button class="btn btn-ghost" @click="closeCreate">✕</button>
          </div>

          <div v-if="newTokenValue">
            <p class="text-success font-bold mb-16">✓ Token created!</p>
            <p class="text-sm text-muted mb-16">Copy this token now — it won't be shown again:</p>
            <div class="token-value-box">
              <code>{{ newTokenValue }}</code>
              <button class="btn btn-ghost btn-sm" @click="copyToken(newTokenValue!)">
                {{ copied ? '✓ Copied' : 'Copy' }}
              </button>
            </div>
            <div class="modal-actions">
              <button class="btn btn-primary" @click="closeCreate">Done</button>
            </div>
          </div>

          <form v-else @submit.prevent="handleCreate">
            <div class="form-group">
              <label>Token Description</label>
              <input v-model="newDesc" type="text" placeholder="e.g. production key" required />
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" @click="closeCreate">Cancel</button>
              <button type="submit" class="btn btn-primary" :disabled="creating">
                {{ creating ? 'Creating...' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Revoke Confirm -->
      <div v-if="revokingToken" class="modal-overlay" @click.self="revokingToken = null">
        <div class="modal">
          <div class="modal-header">
            <h2>Revoke Token</h2>
          </div>
          <p>Revoke token <strong>{{ revokingToken.description }}</strong>?</p>
          <p class="text-sm text-muted mt-8">This action cannot be undone.</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="revokingToken = null">Cancel</button>
            <button class="btn btn-danger" :disabled="revoking" @click="handleRevoke">
              {{ revoking ? 'Revoking...' : 'Revoke' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAgentStore } from '@/stores/agentStore'
import { useTokenStore } from '@/stores/tokenStore'
import type { Token } from '@/types'

const route = useRoute()
const agentStore = useAgentStore()
const tokenStore = useTokenStore()

const selectedAgentId = ref('')

const selectedAgentName = computed(
  () => agentStore.agents.find((a) => a.id === selectedAgentId.value)?.name || ''
)

const tokens = computed(() => tokenStore.getTokens(selectedAgentId.value))

onMounted(() => {
  // Support ?agent=xxx from AgentCard link
  const q = route.query.agent as string
  if (q) {
    selectedAgentId.value = q
    tokenStore.fetchTokens(q)
  }
})

async function onAgentChange() {
  if (selectedAgentId.value) {
    await tokenStore.fetchTokens(selectedAgentId.value)
  }
}

// Create token
const showCreateModal = ref(false)
const newDesc = ref('')
const creating = ref(false)
const newTokenValue = ref<string | null>(null)
const copied = ref(false)

async function handleCreate() {
  creating.value = true
  try {
    const result = await tokenStore.createToken(selectedAgentId.value, newDesc.value)
    newTokenValue.value = result.token
  } catch (e) {
    alert((e as Error).message)
  } finally {
    creating.value = false
  }
}

async function copyToken(t: string) {
  await navigator.clipboard.writeText(t)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function closeCreate() {
  showCreateModal.value = false
  newDesc.value = ''
  newTokenValue.value = null
  copied.value = false
}

// Revoke token
const revokingToken = ref<Token | null>(null)
const revoking = ref(false)

function confirmRevoke(token: Token) {
  revokingToken.value = token
}

async function handleRevoke() {
  if (!revokingToken.value) return
  revoking.value = true
  try {
    await tokenStore.revokeToken(selectedAgentId.value, revokingToken.value.id)
    revokingToken.value = null
  } catch (e) {
    alert((e as Error).message)
  } finally {
    revoking.value = false
  }
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString()
}
</script>

<style scoped>
.tokens-view {
  max-width: 800px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 24px;
}

.agent-selector {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.tokens-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.token-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.token-info {
  flex: 1;
  min-width: 0;
}

.token-desc {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.tag-revoked {
  background: rgba(237, 66, 69, 0.2);
  color: var(--danger);
}

.token-meta {
  font-size: 12px;
}

.token-value-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 10px 12px;
  word-break: break-all;
}

.token-value-box code {
  flex: 1;
  font-size: 12px;
  background: none;
  padding: 0;
}

.mb-16 {
  margin-bottom: 16px;
}
</style>
