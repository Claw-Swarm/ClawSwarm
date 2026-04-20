<template>
  <div class="chat-layout">

    <!-- ① Left sidebar -->
    <aside class="chat-sidebar">
      <div class="sidebar-header">
        <div class="workspace-name">
          <span class="logo-icon">🦞</span>
          <span>ClawSwarm</span>
        </div>
        <div class="ws-badge" :class="wsStore.isConnected ? 'online' : 'offline'" :title="wsStatusLabel" />
      </div>

      <!-- Rooms -->
      <div class="sidebar-section">
        <div class="section-header">
          <span>Rooms</span>
          <button class="icon-btn" title="New Room" @click="showCreateRoom = true">＋</button>
        </div>
        <RouterLink
          v-for="room in roomStore.rooms"
          :key="room.id"
          :to="`/chat/room/${room.id}`"
          class="sidebar-item"
          :class="{ active: $route.params.id === room.id }"
        >
          <span class="item-hash">#</span>
          <span class="item-name">{{ room.name }}</span>
          <button class="item-action" title="Manage" @click.prevent="openManageRoom(room)">⋯</button>
        </RouterLink>
        <div v-if="roomStore.rooms.length === 0" class="no-items text-sm text-muted">No rooms</div>
      </div>

      <!-- Agents -->
      <div class="sidebar-section">
        <div class="section-header">
          <span>Agents</span>
          <button class="icon-btn" title="New Agent" @click="openCreateAgent">＋</button>
        </div>
        <div
          v-for="agent in agentStore.sortedAgents"
          :key="agent.id"
          class="sidebar-item agent-item"
          :class="{ active: detailAgent?.id === agent.id }"
          @click="openDetail(agent)"
        >
          <div class="agent-avatar-sm" :class="{ 'is-emoji': !!agent.icon }" :style="agent.icon ? {} : { background: avatarColor(agent.name) }">
            {{ agent.icon || (agent.nickname || agent.name)[0].toUpperCase() }}
          </div>
          <span class="item-name">{{ agent.nickname || agent.name }}</span>
          <span class="status-dot" :class="agent.status" style="margin-left:auto;flex-shrink:0"></span>
        </div>
        <div v-if="agentStore.sortedAgents.length === 0" class="no-items text-sm text-muted">No agents</div>
      </div>
    </aside>

    <!-- ② Right detail panel (between sidebar and main) -->
    <transition name="panel-slide">
      <aside v-if="detailAgent" class="detail-panel">
        <!-- Panel header -->
        <div class="detail-header">
          <div class="detail-agent-info">
            <div class="detail-avatar" :class="{ 'is-emoji': !!detailAgent.icon }" :style="detailAgent.icon ? {} : { background: avatarColor(detailAgent.name) }">
              {{ detailAgent.icon || (detailAgent.nickname || detailAgent.name)[0].toUpperCase() }}
            </div>
            <div>
              <div class="detail-name">{{ detailAgent.nickname || detailAgent.name }}</div>
              <div class="detail-subname text-muted text-sm">@{{ detailAgent.name }}</div>
            </div>
          </div>
          <button class="icon-btn" @click="detailAgent = null">✕</button>
        </div>

        <!-- Tabs -->
        <div class="detail-tabs">
          <button
            v-for="tab in ['settings', 'tokens']"
            :key="tab"
            class="detail-tab"
            :class="{ active: detailTab === tab }"
            @click="detailTab = tab as 'settings' | 'tokens'"
          >
            {{ tab === 'settings' ? '⚙ Settings' : '🔑 Tokens' }}
          </button>
        </div>

        <!-- Settings tab -->
        <div v-if="detailTab === 'settings'" class="detail-body">
          <form @submit.prevent="saveAgent(detailAgent.id)" class="detail-form">
            <div class="detail-field">
              <label>Icon</label>
              <div class="emoji-picker">
                <button
                  v-for="e in EMOJI_OPTIONS"
                  :key="e"
                  type="button"
                  class="emoji-opt"
                  :class="{ selected: agentEdit.icon === e }"
                  @click="agentEdit.icon = agentEdit.icon === e ? '' : e"
                >{{ e }}</button>
              </div>
              <div v-if="agentEdit.icon" class="emoji-clear">
                <span class="text-sm text-muted">Selected: {{ agentEdit.icon }}</span>
                <button type="button" class="btn btn-ghost btn-sm" @click="agentEdit.icon = ''">Clear</button>
              </div>
            </div>
            <div class="detail-field">
              <label>Name</label>
              <input v-model="agentEdit.name" type="text" required />
              <div v-if="agentEdit.name !== detailAgent.name" class="field-warning">
                ⚠️ 修改 Name 后，需同步更新 <code>~/.openclaw/openclaw.json</code> 中对应 channel 的 <code>agentName</code> 值，并重启 gateway，否则该 agent 将无法连接。
              </div>
            </div>
            <div class="detail-field">
              <label>Nickname <span class="field-hint">聊天室显示名</span></label>
              <input v-model="agentEdit.nickname" type="text" placeholder="e.g. 小助手" />
            </div>
            <div class="detail-field">
              <label>Role Definition <span class="field-hint">其他 Agent 可见</span></label>
              <textarea v-model="agentEdit.role" rows="8" placeholder="Describe this agent's responsibilities and capabilities..."></textarea>
            </div>
            <div class="detail-field-row">
              <span class="text-sm text-muted">Status: <strong>{{ detailAgent.status }}</strong></span>
            </div>
            <div class="detail-actions">
              <button type="submit" class="btn btn-primary" :disabled="agentSaving">
                {{ agentSaving ? 'Saving…' : 'Save Changes' }}
              </button>
              <span v-if="agentSaved" class="text-success text-sm">✓ Saved</span>
              <button type="button" class="btn btn-ghost text-danger" @click="confirmDeleteAgent(detailAgent)">
                Delete Agent
              </button>
            </div>
          </form>
        </div>

        <!-- Tokens tab -->
        <div v-else-if="detailTab === 'tokens'" class="detail-body">
          <div v-if="tokenLoading" class="text-muted text-sm">Loading…</div>
          <div v-else>
            <div v-if="tokens.length === 0" class="empty-tokens text-muted text-sm">No tokens yet.</div>
            <div v-else class="tokens-list">
              <div v-for="t in tokens" :key="t.id" class="token-row">
                <div class="token-info">
                  <div class="token-desc">
                    {{ t.description }}
                    <span v-if="t.revoked" class="tag-revoked">(revoked)</span>
                  </div>
                  <div class="text-sm text-muted">{{ formatDate(t.createdAt) }}</div>
                </div>
                <button v-if="!t.revoked" class="btn btn-danger btn-sm" @click="revokeToken(t.id)">Revoke</button>
              </div>
            </div>

            <div v-if="newTokenValue" class="new-token-reveal">
              <div class="new-token-label text-sm">✓ Copy now — won't be shown again:</div>
              <div class="token-value-box">
                <code>{{ newTokenValue }}</code>
                <button class="btn btn-ghost btn-sm" @click="copyText(newTokenValue!)">
                  {{ copied ? '✓' : 'Copy' }}
                </button>
              </div>
            </div>

            <div class="detail-actions" style="margin-top:16px">
              <button class="btn btn-primary" @click="createToken">+ New Token</button>
            </div>
          </div>
        </div>
      </aside>
    </transition>

    <!-- ③ Main chat area -->
    <main class="chat-main">
      <RouterView />
    </main>
    <Teleport to="body">

      <!-- Create Room -->
      <div v-if="showCreateRoom" class="modal-overlay" @click.self="showCreateRoom = false">
        <div class="modal">
          <div class="modal-header">
            <h2>New Room</h2>
            <button class="btn btn-ghost" @click="showCreateRoom = false">✕</button>
          </div>
          <form @submit.prevent="handleCreateRoom">
            <div class="form-group">
              <label>Room Name</label>
              <input v-model="roomForm.name" type="text" placeholder="e.g. dev-team" required />
            </div>
            <div class="form-group">
              <label>Members</label>
              <div class="agent-checkboxes">
                <label v-for="a in agentStore.sortedAgents" :key="a.id" class="agent-check">
                  <input type="checkbox" :value="a.id" v-model="roomForm.agentIds" style="width:auto" />
                  <span class="status-dot" :class="a.status"></span>
                  {{ a.nickname || a.name }}
                </label>
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" @click="showCreateRoom = false">Cancel</button>
              <button type="submit" class="btn btn-primary" :disabled="roomCreating">
                {{ roomCreating ? 'Creating…' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Manage Room -->
      <div v-if="managingRoom" class="modal-overlay" @click.self="managingRoom = null">
        <div class="modal">
          <div class="modal-header">
            <h2>#{{ managingRoom.name }}</h2>
            <button class="btn btn-ghost" @click="managingRoom = null">✕</button>
          </div>
          <div class="form-group">
            <label>Members</label>
            <div class="agent-checkboxes">
              <label v-for="a in agentStore.sortedAgents" :key="a.id" class="agent-check">
                <input
                  type="checkbox"
                  :value="a.id"
                  :checked="managingRoom.members.some(m => m.agentId === a.id)"
                  style="width:auto"
                  @change="toggleRoomMember(managingRoom!, a.id, ($event.target as HTMLInputElement).checked)"
                />
                <span class="status-dot" :class="a.status"></span>
                {{ a.nickname || a.name }}
              </label>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-danger btn-sm" @click="handleDeleteRoom(managingRoom!)">Delete Room</button>
            <button class="btn btn-primary" @click="managingRoom = null">Done</button>
          </div>
        </div>
      </div>

      <!-- Create Agent -->
      <div v-if="showCreateAgent" class="modal-overlay" @click.self="closeCreateAgent">
        <div class="modal">
          <div class="modal-header">
            <h2>New Agent</h2>
            <button class="btn btn-ghost" @click="closeCreateAgent">✕</button>
          </div>
          <div v-if="createAgentResult">
            <p class="text-success font-bold mb-8">✓ Agent created!</p>
            <p class="text-sm text-muted mb-8">Copy this token — it won't be shown again:</p>
            <div class="token-value-box">
              <code>{{ createAgentResult.token.token }}</code>
              <button class="btn btn-ghost btn-sm" @click="copyText(createAgentResult!.token.token)">
                {{ copied ? '✓ Copied' : 'Copy' }}
              </button>
            </div>
            <div class="modal-actions">
              <button class="btn btn-primary" @click="closeCreateAgent">Done</button>
            </div>
          </div>
          <form v-else @submit.prevent="handleCreateAgent">
            <div class="form-group">
              <label>Agent Name</label>
              <input v-model="agentCreateForm.name" type="text" placeholder="e.g. code-reviewer" required />
            </div>
            <div class="form-group">
              <label>Role Definition</label>
              <textarea v-model="agentCreateForm.role" rows="4" placeholder="Describe responsibilities..."></textarea>
            </div>
            <div class="form-group">
              <label>Token Description</label>
              <input v-model="agentCreateForm.tokenDescription" type="text" placeholder="primary" required />
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" @click="closeCreateAgent">Cancel</button>
              <button type="submit" class="btn btn-primary" :disabled="agentCreating">
                {{ agentCreating ? 'Creating…' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Delete Agent confirm -->
      <div v-if="deletingAgent" class="modal-overlay" @click.self="deletingAgent = null">
        <div class="modal">
          <div class="modal-header"><h2>Delete Agent</h2></div>
          <p>Delete <strong>{{ deletingAgent.nickname || deletingAgent.name }}</strong>?</p>
          <p class="text-sm text-muted">This will also revoke all associated tokens.</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="deletingAgent = null">Cancel</button>
            <button class="btn btn-danger" @click="handleDeleteAgent">Delete</button>
          </div>
        </div>
      </div>

    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWsStore } from '@/stores/wsStore'
import { useAgentStore } from '@/stores/agentStore'
import { useRoomStore } from '@/stores/roomStore'
import { tokenApi } from '@/api'
import type { Agent, Room, Token } from '@/types'

const route = useRoute()
const router = useRouter()
const wsStore = useWsStore()
const agentStore = useAgentStore()
const roomStore = useRoomStore()

const wsStatusLabel = computed(() => {
  if (wsStore.status === 'connected') return 'Connected'
  if (wsStore.status === 'connecting') return 'Connecting...'
  return 'Disconnected'
})

// ── Rooms ─────────────────────────────────────────────────────────────────────

const showCreateRoom = ref(false)
const roomCreating = ref(false)
const roomForm = reactive({ name: '', agentIds: [] as string[] })
const managingRoom = ref<Room | null>(null)

function openManageRoom(room: Room) {
  managingRoom.value = room
}

async function handleCreateRoom() {
  roomCreating.value = true
  try {
    const room = await roomStore.createRoom({ name: roomForm.name, agentIds: roomForm.agentIds })
    showCreateRoom.value = false
    Object.assign(roomForm, { name: '', agentIds: [] })
    router.push(`/chat/room/${room.id}`)
  } catch (e) {
    alert((e as Error).message)
  } finally {
    roomCreating.value = false
  }
}

async function toggleRoomMember(room: Room, agentId: string, add: boolean) {
  if (add) await roomStore.addMembers(room.id, [agentId])
  else await roomStore.removeMember(room.id, agentId)
}

async function handleDeleteRoom(room: Room) {
  if (!confirm(`Delete room #${room.name}?`)) return
  await roomStore.deleteRoom(room.id)
  managingRoom.value = null
  if (route.params.id === room.id) router.push('/chat')
}

// ── Agent detail panel ────────────────────────────────────────────────────────

const detailAgent = ref<Agent | null>(null)
const detailTab = ref<'settings' | 'tokens'>('settings')
const agentEdit = reactive({ name: '', nickname: '', icon: '', role: '' })
const agentSaving = ref(false)
const agentSaved = ref(false)

function openDetail(agent: Agent) {
  if (detailAgent.value?.id === agent.id) {
    detailAgent.value = null
    return
  }
  detailAgent.value = agent
  detailTab.value = 'settings'
  agentEdit.name = agent.name
  agentEdit.nickname = agent.nickname ?? ''
  agentEdit.icon = agent.icon ?? ''
  agentEdit.role = agent.role
  loadTokens(agent)
}

async function saveAgent(id: string) {
  agentSaving.value = true
  try {
    const updated = await agentStore.updateAgent(id, {
      name: agentEdit.name,
      nickname: agentEdit.nickname,
      icon: agentEdit.icon,
      role: agentEdit.role,
    })
    detailAgent.value = updated
    agentSaved.value = true
    setTimeout(() => { agentSaved.value = false }, 2000)
  } catch (e) {
    alert((e as Error).message)
  } finally {
    agentSaving.value = false
  }
}

// ── Create Agent ──────────────────────────────────────────────────────────────

const showCreateAgent = ref(false)
const agentCreating = ref(false)
const agentCreateForm = reactive({ name: '', role: '', tokenDescription: 'primary' })
const createAgentResult = ref<{ agent: Agent; token: { token: string; id: string; description: string; revoked: boolean; createdAt: number } } | null>(null)
const copied = ref(false)

function openCreateAgent() {
  showCreateAgent.value = true
  Object.assign(agentCreateForm, { name: '', role: '', tokenDescription: 'primary' })
  createAgentResult.value = null
}

async function handleCreateAgent() {
  agentCreating.value = true
  try {
    const result = await agentStore.createAgent({
      name: agentCreateForm.name,
      role: agentCreateForm.role,
      skills: [],
      tokenDescription: agentCreateForm.tokenDescription
    })
    createAgentResult.value = result
  } catch (e) {
    alert((e as Error).message)
  } finally {
    agentCreating.value = false
  }
}

function closeCreateAgent() {
  showCreateAgent.value = false
  createAgentResult.value = null
  copied.value = false
}

const deletingAgent = ref<Agent | null>(null)

function confirmDeleteAgent(agent: Agent) {
  deletingAgent.value = agent
}

async function handleDeleteAgent() {
  if (!deletingAgent.value) return
  await agentStore.deleteAgent(deletingAgent.value.id)
  if (detailAgent.value?.id === deletingAgent.value.id) detailAgent.value = null
  deletingAgent.value = null
}

// ── Tokens ────────────────────────────────────────────────────────────────────

const tokens = ref<Token[]>([])
const tokenLoading = ref(false)
const newTokenValue = ref<string | null>(null)

async function loadTokens(agent: Agent) {
  tokenLoading.value = true
  newTokenValue.value = null
  try {
    const res = await tokenApi.list(agent.id)
    tokens.value = res.tokens
  } finally {
    tokenLoading.value = false
  }
}

async function revokeToken(tokenId: string) {
  if (!detailAgent.value) return
  await tokenApi.revoke(detailAgent.value.id, tokenId)
  const t = tokens.value.find((x) => x.id === tokenId)
  if (t) t.revoked = true
}

async function createToken() {
  if (!detailAgent.value) return
  const desc = prompt('Token description:')
  if (!desc) return
  const res = await tokenApi.create(detailAgent.value.id, desc)
  newTokenValue.value = res.token.token
  tokens.value.push({ ...res.token, revoked: false })
}

// ── Utils ─────────────────────────────────────────────────────────────────────

async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString()
}

const COLORS = ['#5865f2', '#ed4245', '#faa61a', '#3ba55c', '#eb459e', '#00b0f4', '#9b59b6', '#1abc9c']

const EMOJI_OPTIONS = [
  '🤖','🦾','🧠','👨‍💻','👩‍💻','🔍','🎯','📝','🚀','🛡️',
  '⚡','🔮','🌊','🎭','🦊','🐙','🦅','🐉','🦁','🐺',
  '🔧','🔬','📊','🏗️','🎨','🧪','📡','🗂️','💡','🌐',
]

function avatarColor(name: string) {
  const code = name.charCodeAt(0) + name.charCodeAt(name.length - 1)
  return COLORS[code % COLORS.length]
}

watch(() => route.path, () => {
  detailAgent.value = null
})
</script>

<style scoped>
.chat-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ── Left sidebar ── */
.chat-sidebar {
  width: 220px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow-y: auto;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.workspace-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 15px;
  color: var(--text-heading);
}

.logo-icon { font-size: 18px; }

.ws-badge {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.ws-badge.online { background: #3ba55c; }
.ws-badge.offline { background: var(--text-muted); }

.sidebar-section {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.sidebar-section:last-child { border-bottom: none; flex: 1; }

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.icon-btn {
  background: none; border: none; color: var(--text-muted);
  cursor: pointer; font-size: 16px; line-height: 1;
  padding: 0 2px; border-radius: 3px;
  transition: color 0.1s, background 0.1s;
}
.icon-btn:hover { color: var(--text-primary); background: var(--bg-hover); }

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: 4px;
  margin: 1px 4px;
  font-size: 14px;
  transition: background 0.1s, color 0.1s;
  min-width: 0;
  cursor: pointer;
  user-select: none;
}
.sidebar-item:hover { background: var(--bg-hover); color: var(--text-primary); text-decoration: none; }
.sidebar-item.active { background: var(--bg-active); color: var(--text-heading); }

.item-hash { color: var(--text-muted); font-size: 16px; flex-shrink: 0; }
.item-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.item-action {
  opacity: 0; border: none; color: var(--text-primary);
  background: var(--bg-tertiary);
  cursor: pointer; font-size: 15px; padding: 2px 7px; border-radius: 5px; flex-shrink: 0;
  line-height: 1; font-weight: 700;
  box-shadow: 0 1px 3px rgba(0,0,0,0.25);
}
.sidebar-item:hover .item-action { opacity: 1; }
.item-action:hover { background: var(--accent); color: white; box-shadow: 0 1px 4px rgba(0,0,0,0.35); }

.agent-avatar-sm {
  width: 20px; height: 20px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: white; flex-shrink: 0;
}
.agent-avatar-sm.is-emoji {
  font-size: 15px;
  background: transparent !important;
}

/* ── Main ── */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
  min-width: 0;
}

/* ── Right detail panel ── */
.detail-panel {
  width: 300px;
  flex-shrink: 0;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: width 0.22s ease, opacity 0.22s ease;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  width: 0;
  opacity: 0;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.detail-agent-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.detail-avatar {
  width: 36px; height: 36px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 700; color: white; flex-shrink: 0;
}
.detail-avatar.is-emoji {
  font-size: 26px;
  background: transparent !important;
}

.detail-name {
  font-weight: 700;
  font-size: 15px;
  color: var(--text-heading);
}

.detail-subname {
  font-size: 12px;
  margin-top: 1px;
}

.detail-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.detail-tab {
  flex: 1;
  padding: 9px 12px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.detail-tab:hover { color: var(--text-primary); }
.detail-tab.active {
  color: var(--accent-light, #7983f5);
  border-bottom-color: var(--accent, #5865f2);
}

.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.detail-form { display: flex; flex-direction: column; gap: 0; }

.detail-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 14px;
}

.detail-field label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.field-hint {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  font-size: 10px;
  opacity: 0.7;
}

.detail-field input,
.detail-field textarea {
  font-size: 13px;
  padding: 7px 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  outline: none;
  resize: vertical;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}
.detail-field input:focus,
.detail-field textarea:focus { border-color: var(--accent); }

.detail-field-row {
  display: flex;
  align-items: center;
  margin-bottom: 14px;
}

.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}

.field-warning {
  font-size: 12px;
  color: #faa61a;
  background: rgba(250, 166, 26, 0.08);
  border: 1px solid rgba(250, 166, 26, 0.3);
  border-radius: 4px;
  padding: 6px 8px;
  line-height: 1.5;
}
.field-warning code {
  background: rgba(250, 166, 26, 0.15);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
}

/* ── Emoji picker ── */
.emoji-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.emoji-opt {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px;
  background: none; border: 2px solid transparent;
  border-radius: 6px; cursor: pointer;
  transition: background 0.1s, border-color 0.1s;
  line-height: 1;
}
.emoji-opt:hover { background: var(--bg-hover); }
.emoji-opt.selected {
  border-color: var(--accent, #5865f2);
  background: rgba(88,101,242,0.15);
}

.emoji-clear {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}

/* ── Tokens in panel ── */
.tokens-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }

.token-row {
  display: flex; align-items: flex-start;
  justify-content: space-between; gap: 8px;
  padding: 10px; background: var(--bg-tertiary);
  border: 1px solid var(--border); border-radius: 6px;
}

.token-info { flex: 1; min-width: 0; }
.token-desc { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
.tag-revoked { color: var(--text-muted); font-size: 11px; font-weight: 400; }

.empty-tokens { padding: 12px 0; }

.new-token-reveal {
  margin-top: 12px;
  padding: 12px;
  background: rgba(59, 165, 92, 0.08);
  border: 1px solid rgba(59, 165, 92, 0.3);
  border-radius: 6px;
}

.new-token-label { color: #3ba55c; font-weight: 600; margin-bottom: 8px; }

.token-value-box {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-primary); border: 1px solid var(--border);
  border-radius: 4px; padding: 8px 10px; word-break: break-all;
}
.token-value-box code { flex: 1; font-size: 11px; background: none; padding: 0; }

/* ── Misc ── */
.no-items { padding: 4px 12px; }
.font-bold { font-weight: 700; }
.text-success { color: #3ba55c; }
.mb-8 { margin-bottom: 8px; }
.agent-checkboxes { display: flex; flex-direction: column; gap: 6px; }
.agent-check { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
</style>
