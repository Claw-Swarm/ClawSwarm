<template>
  <div v-if="room" class="room-view">
    <!-- Header -->
    <div class="chat-header">
      <div class="header-left">
        <span class="channel-hash">#</span>
        <span class="channel-name">{{ room.name }}</span>
      </div>
      <div class="header-right" ref="headerRightEl">
        <button class="task-mgr-btn" @click="openTaskManager" title="任务管理">
          🗑️
        </button>
        <button class="members-btn" @click="showMembers = !showMembers">
          <div class="mini-avatars">
            <div
              v-for="m in sortedMembers.slice(0, 5)"
              :key="m.agentId"
              class="mini-avatar"
              :class="{ 'is-emoji': !!agentIcon(m.agentName) }"
              :style="agentIcon(m.agentName) ? {} : { background: avatarColor(m.agentName) }"
            >{{ agentIcon(m.agentName) || m.agentName[0].toUpperCase() }}</div>
            <span v-if="room.members.length > 5" class="more-badge">+{{ room.members.length - 5 }}</span>
          </div>
          <span class="members-count text-sm">{{ room.members.length }}</span>
        </button>

        <!-- Dropdown -->
        <div v-if="showMembers" class="members-dropdown" @click.stop>
          <div class="dropdown-header">Members · {{ room.members.length }}</div>
          <div class="dropdown-list">
            <div v-for="m in sortedMembers" :key="m.agentId" class="dropdown-item">
              <div
                class="member-avatar"
                :class="{ 'is-emoji': !!agentIcon(m.agentName) }"
                :style="agentIcon(m.agentName) ? {} : { background: avatarColor(m.agentName) }"
              >{{ agentIcon(m.agentName) || m.agentName[0].toUpperCase() }}</div>
              <div class="member-info">
                <div class="member-name">{{ agentDisplayName(m.agentName) }}</div>
                <div v-if="agentNickname(m.agentName)" class="member-subname text-muted">@{{ m.agentName }}</div>
              </div>
              <span class="status-dot" :class="m.status || 'offline'" style="margin-left:auto;flex-shrink:0"></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Task manager drawer -->
    <Teleport to="body">
      <div v-if="showTaskManager" class="task-overlay" @click.self="showTaskManager = false">
        <div class="task-drawer">
          <div class="task-drawer-header">
            <span class="task-drawer-title">任务管理 · #{{ room.name }}</span>
            <button class="task-drawer-close" @click="showTaskManager = false">✕</button>
          </div>
          <div class="task-drawer-body">
            <div v-if="taskLoading" class="task-loading">加载中…</div>
            <div v-else-if="tasks.length === 0" class="task-empty">暂无任务记录</div>
            <div v-else class="task-list">
              <label
                v-for="t in tasks"
                :key="t.markId"
                class="task-item"
                :class="{ selected: selectedMarkIds.has(t.markId) }"
              >
                <input type="checkbox" :checked="selectedMarkIds.has(t.markId)" @change="toggleTask(t.markId)" />
                <div class="task-item-info">
                  <span class="task-item-label">{{ t.label }}</span>
                  <span class="task-item-meta">{{ t.messageCount }} 条消息 · {{ new Date(t.startedAt || Date.now()).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</span>
                </div>
              </label>
            </div>
          </div>
          <div class="task-drawer-footer">
            <span class="task-selected-hint" v-if="selectedMarkIds.size > 0">已选 {{ selectedMarkIds.size }} 个任务段</span>
            <span class="task-selected-hint text-muted" v-else>勾选要删除的任务段</span>
            <button
              class="btn btn-danger"
              :disabled="selectedMarkIds.size === 0 || taskDeleting"
              @click="deleteSelectedTasks"
            >{{ taskDeleting ? '删除中…' : '删除所选' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Messages -->
    <MessageList
      :messages="messages"
      :typing-users="typingUsers"
      :has-more="roomState?.hasMore || false"
      :loading="roomState?.loading || false"
      @load-more="loadMore"
    />

    <!-- Input -->
    <MessageInput
      :agents="sortedMembers.map(m => { const a = agentStore.getAgentByName(m.agentName); return { id: m.agentId, name: m.agentName, nickname: a?.nickname ?? '', icon: a?.icon ?? '', status: m.status || 'offline', role: '', skills: [], createdAt: 0 } })"
      :room-id="roomId"
      :placeholder="`Message #${room.name}`"
      @send="handleSend"
      @typing="handleTyping"
      @new-task="handleNewTask"
    />
  </div>

  <div v-else-if="roomStore.loading" class="loading">Loading room...</div>

  <div v-else class="empty-state">
    <div class="icon">💬</div>
    <p>Room not found.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useRoomStore } from '@/stores/roomStore'
import { useChatStore } from '@/stores/chatStore'
import { useWsStore } from '@/stores/wsStore'
import { useAgentStore } from '@/stores/agentStore'
import { roomApi } from '@/api'
import MessageList from '@/components/chat/MessageList.vue'
import MessageInput from '@/components/chat/MessageInput.vue'

const route = useRoute()
const roomStore = useRoomStore()
const chatStore = useChatStore()
const wsStore = useWsStore()
const agentStore = useAgentStore()

const roomId = computed(() => route.params.id as string)
const room = computed(() => roomStore.getRoomById(roomId.value))
const messages = computed(() => chatStore.getMessages(roomId.value))
const roomState = computed(() => chatStore.getRoomState(roomId.value))
const typingUsers = computed(() => chatStore.getTyping(roomId.value))

const sortedMembers = computed(() => {
  if (!room.value) return []
  return [...room.value.members].sort((a, b) => {
    const na = agentStore.getAgentByName(a.agentName)
    const nb = agentStore.getAgentByName(b.agentName)
    const da = (na?.nickname || a.agentName).toLowerCase()
    const db = (nb?.nickname || b.agentName).toLowerCase()
    return da < db ? -1 : da > db ? 1 : 0
  })
})

const showMembers = ref(false)
const headerRightEl = ref<HTMLElement | null>(null)

// ── Task manager ──────────────────────────────────────────────────────────────
interface TaskItem { markId: string; label: string; startedAt: number; messageCount: number }
const showTaskManager = ref(false)
const tasks = ref<TaskItem[]>([])
const selectedMarkIds = ref<Set<string>>(new Set())
const taskLoading = ref(false)
const taskDeleting = ref(false)

async function openTaskManager() {
  showTaskManager.value = true
  selectedMarkIds.value = new Set()
  taskLoading.value = true
  try {
    const res = await roomApi.getTasks(roomId.value)
    tasks.value = res.tasks
  } catch (e) {
    alert((e as Error).message)
  } finally {
    taskLoading.value = false
  }
}

function toggleTask(markId: string) {
  if (selectedMarkIds.value.has(markId)) selectedMarkIds.value.delete(markId)
  else selectedMarkIds.value.add(markId)
}

async function deleteSelectedTasks() {
  if (selectedMarkIds.value.size === 0) return
  if (!confirm(`确认删除选中的 ${selectedMarkIds.value.size} 个任务段的所有对话记录？此操作不可恢复。`)) return
  taskDeleting.value = true
  try {
    await roomApi.deleteTasks(roomId.value, [...selectedMarkIds.value])
    showTaskManager.value = false
    await chatStore.loadMessages(roomId.value)
  } catch (e) {
    alert((e as Error).message)
  } finally {
    taskDeleting.value = false
  }
}

function onClickOutside(e: MouseEvent) {
  if (headerRightEl.value && !headerRightEl.value.contains(e.target as Node)) {
    showMembers.value = false
  }
}

watch(showMembers, (val) => {
  if (val) document.addEventListener('click', onClickOutside)
  else document.removeEventListener('click', onClickOutside)
})

async function loadMessages() {
  if (roomId.value) await chatStore.loadMessages(roomId.value)
}

async function loadMore() {
  const msgs = messages.value
  if (msgs.length === 0) return
  await chatStore.loadMessages(roomId.value, msgs[0].timestamp)
}

onMounted(() => { loadMessages() })
watch(roomId, () => { if (roomId.value) loadMessages() })

function handleSend(content: string) {
  wsStore.sendMessage(roomId.value, content)
}

function handleTyping(isTyping: boolean) {
  wsStore.send({ type: 'typing', roomId: roomId.value, status: isTyping ? 'start' : 'stop' })
}

function handleNewTask(description: string) {
  wsStore.sendMessage(roomId.value, `/new-task ${description}`)
  if (room.value) {
    for (const member of room.value.members) {
      wsStore.sendMessage(roomId.value, `@${member.agentName} /new`)
    }
  }
}

function agentIcon(name: string): string {
  return agentStore.getAgentByName(name)?.icon?.trim() || ''
}

function agentNickname(name: string): string {
  return agentStore.getAgentByName(name)?.nickname?.trim() || ''
}

function agentDisplayName(name: string): string {
  return agentNickname(name) || name
}

const COLORS = ['#5865f2', '#ed4245', '#faa61a', '#3ba55c', '#eb459e', '#00b0f4', '#9b59b6', '#1abc9c']

function avatarColor(name: string) {
  const code = (name.charCodeAt(0) || 0) + (name.charCodeAt(name.length - 1) || 0)
  return COLORS[code % COLORS.length]
}
</script>

<style scoped>
.room-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-primary);
  position: relative;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.channel-hash {
  font-size: 20px;
  color: var(--text-muted);
  line-height: 1;
}

.channel-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-heading);
}

.header-right {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Members button ── */
.members-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 4px 10px 4px 6px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  color: var(--text-secondary);
}
.members-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-light);
  color: var(--text-primary);
}

.mini-avatars {
  display: flex;
  align-items: center;
}

.mini-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: white;
  border: 2px solid var(--bg-primary);
  margin-left: -5px;
  flex-shrink: 0;
}
.mini-avatar:first-child { margin-left: 0; }
.mini-avatar.is-emoji { font-size: 14px; background: transparent !important; }

.more-badge {
  font-size: 10px;
  color: var(--text-muted);
  margin-left: 4px;
}

.members-count {
  font-size: 13px;
  font-weight: 600;
}

/* ── Dropdown ── */
.members-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 240px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  z-index: 200;
  overflow: hidden;
}

.dropdown-header {
  padding: 10px 14px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}

.dropdown-list {
  padding: 6px 0;
  max-height: 320px;
  overflow-y: auto;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  transition: background 0.1s;
}
.dropdown-item:hover { background: var(--bg-hover); }

.member-avatar {
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: white; flex-shrink: 0;
}
.member-avatar.is-emoji { font-size: 20px; background: transparent !important; }

.member-info {
  flex: 1;
  min-width: 0;
}

.member-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-heading);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-subname {
  font-size: 11px;
  margin-top: 1px;
}

.task-mgr-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 16px;
  cursor: pointer;
  color: var(--text-muted);
  transition: background 0.15s, border-color 0.15s;
}
.task-mgr-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-light);
}

.task-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
}

.task-drawer {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 420px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 48px rgba(0,0,0,0.4);
}

.task-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}

.task-drawer-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-heading);
}

.task-drawer-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
}
.task-drawer-close:hover { background: var(--bg-hover); color: var(--text-primary); }

.task-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 0;
}

.task-loading, .task-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.1s;
}
.task-item:hover { background: var(--bg-hover); }
.task-item.selected { background: rgba(88, 101, 242, 0.12); }

.task-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: #5865f2;
}

.task-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.task-item-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-heading);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-item-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.task-drawer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-top: 1px solid var(--border);
  gap: 12px;
}

.task-selected-hint {
  font-size: 13px;
  color: var(--text-secondary);
}

.btn-danger {
  background: #ed4245;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-danger:hover:not(:disabled) { background: #c03537; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}
</style>

