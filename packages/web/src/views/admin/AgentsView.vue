<template>
  <div class="agents-view">
    <div class="page-header">
      <h1>Agents</h1>
      <button class="btn btn-primary" @click="showCreateModal = true">
        + New Agent
      </button>
    </div>

    <div v-if="agentStore.loading" class="loading">Loading agents...</div>

    <div v-else-if="agentStore.agents.length === 0" class="empty-state">
      <div class="icon">🤖</div>
      <p>No agents yet. Create your first agent to get started.</p>
    </div>

    <div v-else class="agents-grid">
      <AgentCard
        v-for="agent in agentStore.agents"
        :key="agent.id"
        :agent="agent"
        @edit="openEdit(agent)"
        @delete="confirmDelete(agent)"
      />
    </div>

    <!-- Create Modal -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
        <div class="modal">
          <div class="modal-header">
            <h2>Create Agent</h2>
            <button class="btn btn-ghost" @click="showCreateModal = false">✕</button>
          </div>

          <form @submit.prevent="handleCreate">
            <div class="form-group">
              <label>Agent Name</label>
              <input v-model="form.name" type="text" placeholder="e.g. code-reviewer" required />
            </div>
            <div class="form-group">
              <label>Role Definition <span class="label-hint">（角色定义，其他 Agent 可见，用于任务分配）</span></label>
              <textarea v-model="form.role" placeholder="描述该 Agent 的职责和能力，例如：负责前端开发，擅长 Vue 3 / TypeScript，处理 UI 和交互需求。" rows="5"></textarea>
            </div>
            <div class="form-group">
              <label>Initial Token Description</label>
              <input v-model="form.tokenDescription" type="text" placeholder="e.g. primary token" required />
            </div>

            <div v-if="createResult" class="token-reveal">
              <div class="token-reveal-header">
                <span class="text-success">✓ Agent created!</span>
              </div>
              <p class="text-sm text-muted mb-16">Copy this token now — it won't be shown again:</p>
              <div class="token-value">
                <code>{{ createResult.token.token }}</code>
                <button type="button" class="btn btn-ghost btn-sm" @click="copyToken(createResult!.token.token)">
                  {{ copied ? '✓ Copied' : 'Copy' }}
                </button>
              </div>
              <div class="modal-actions">
                <button type="button" class="btn btn-primary" @click="closeCreate">Done</button>
              </div>
            </div>

            <div v-else class="modal-actions">
              <button type="button" class="btn btn-secondary" @click="showCreateModal = false">Cancel</button>
              <button type="submit" class="btn btn-primary" :disabled="creating">
                {{ creating ? 'Creating...' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Edit Modal -->
      <div v-if="editingAgent" class="modal-overlay" @click.self="editingAgent = null">
        <div class="modal">
          <div class="modal-header">
            <h2>Edit Agent: {{ editingAgent.name }}</h2>
            <button class="btn btn-ghost" @click="editingAgent = null">✕</button>
          </div>

          <form @submit.prevent="handleUpdate">
            <div class="form-group">
              <label>Agent Name</label>
              <input v-model="editForm.name" type="text" required />
            </div>
            <div class="form-group">
              <label>Nickname <span class="label-hint">（聊天室显示名，留空则显示 Agent Name）</span></label>
              <input v-model="editForm.nickname" type="text" placeholder="e.g. 小助手" />
            </div>
            <div class="form-group">
              <label>Role Definition <span class="label-hint">（角色定义，其他 Agent 可见，用于任务分配）</span></label>
              <textarea v-model="editForm.role" rows="5" placeholder="描述该 Agent 的职责和能力，例如：负责前端开发，擅长 Vue 3 / TypeScript，处理 UI 和交互需求。"></textarea>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" @click="editingAgent = null">Cancel</button>
              <button type="submit" class="btn btn-primary" :disabled="saving">
                {{ saving ? 'Saving...' : 'Save' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Delete Confirm -->
      <div v-if="deletingAgent" class="modal-overlay" @click.self="deletingAgent = null">
        <div class="modal">
          <div class="modal-header">
            <h2>Delete Agent</h2>
          </div>
          <p>Are you sure you want to delete <strong>{{ deletingAgent.name }}</strong>?</p>
          <p class="text-sm text-muted mt-8">This will also revoke all associated tokens.</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="deletingAgent = null">Cancel</button>
            <button class="btn btn-danger" :disabled="deleting" @click="handleDelete">
              {{ deleting ? 'Deleting...' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useAgentStore } from '@/stores/agentStore'
import AgentCard from '@/components/admin/AgentCard.vue'
import type { Agent } from '@/types'

const agentStore = useAgentStore()

const showCreateModal = ref(false)
const creating = ref(false)
const createResult = ref<{ agent: Agent; token: { token: string; id: string; description: string; revoked: boolean; createdAt: number } } | null>(null)
const copied = ref(false)

const form = reactive({
  name: '',
  role: '',
  tokenDescription: 'primary'
})

async function handleCreate() {
  creating.value = true
  try {
    const result = await agentStore.createAgent({
      name: form.name,
      role: form.role,
      skills: [],
      tokenDescription: form.tokenDescription
    })
    createResult.value = result
  } catch (e) {
    alert((e as Error).message)
  } finally {
    creating.value = false
  }
}

async function copyToken(token: string) {
  await navigator.clipboard.writeText(token)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function closeCreate() {
  showCreateModal.value = false
  createResult.value = null
  copied.value = false
  Object.assign(form, { name: '', role: '', tokenDescription: 'primary' })
}

const editingAgent = ref<Agent | null>(null)
const editForm = reactive({ name: '', nickname: '', role: '' })
const saving = ref(false)

function openEdit(agent: Agent) {
  editingAgent.value = agent
  editForm.name = agent.name
  editForm.nickname = agent.nickname ?? ''
  editForm.role = agent.role
}

async function handleUpdate() {
  if (!editingAgent.value) return
  saving.value = true
  try {
    await agentStore.updateAgent(editingAgent.value.id, {
      name: editForm.name,
      nickname: editForm.nickname,
      role: editForm.role,
    })
    editingAgent.value = null
  } catch (e) {
    alert((e as Error).message)
  } finally {
    saving.value = false
  }
}

// Delete
const deletingAgent = ref<Agent | null>(null)
const deleting = ref(false)

function confirmDelete(agent: Agent) {
  deletingAgent.value = agent
}

async function handleDelete() {
  if (!deletingAgent.value) return
  deleting.value = true
  try {
    await agentStore.deleteAgent(deletingAgent.value.id)
    deletingAgent.value = null
  } catch (e) {
    alert((e as Error).message)
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.agents-view {
  max-width: 960px;
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

.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.token-reveal {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px;
  margin-top: 8px;
}

.token-reveal-header {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
}

.token-value {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px 12px;
  word-break: break-all;
}

.token-value code {
  flex: 1;
  font-size: 12px;
  background: none;
  padding: 0;
}

.label-hint {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 400;
}
</style>
