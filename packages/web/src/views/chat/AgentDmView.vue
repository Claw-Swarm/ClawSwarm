<template>
  <div class="dm-view">
    <!-- Header -->
    <div class="chat-header">
      <div class="header-left" v-if="agent">
        <div class="agent-avatar" :style="{ background: avatarColor(agent.name) }">
          {{ agent.name[0].toUpperCase() }}
        </div>
        <span class="agent-name">{{ agent.name }}</span>
        <span class="status-dot" :class="agent.status"></span>
        <span class="status-label text-sm text-muted">{{ agent.status }}</span>
      </div>
      <div class="header-left" v-else>
        <span class="agent-name">{{ agentName }}</span>
      </div>
    </div>

    <!-- DM note (agent chat not implemented server-side in Phase 1) -->
    <div class="dm-info">
      <div class="dm-banner">
        <span>📩</span>
        <span class="text-sm text-muted">
          This is a direct message channel with <strong>{{ agentName }}</strong>.
          Messages are sent via the shared WebSocket.
        </span>
      </div>
    </div>

    <!-- Messages -->
    <MessageList
      :messages="dmMessages"
      :typing-users="typingUsers"
      :has-more="false"
      :loading="false"
      @load-more="() => {}"
    />

    <!-- Input -->
    <MessageInput
      :agents="agent ? [agent] : []"
      :placeholder="`Message ${agentName}`"
      @send="handleSend"
      @typing="handleTyping"
      @new-task="handleNewTask"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAgentStore } from '@/stores/agentStore'
import { useChatStore } from '@/stores/chatStore'
import MessageList from '@/components/chat/MessageList.vue'
import MessageInput from '@/components/chat/MessageInput.vue'
import type { Message } from '@/types'

const route = useRoute()
const agentStore = useAgentStore()
const chatStore = useChatStore()

const agentName = computed(() => route.params.name as string)
const agent = computed(() => agentStore.getAgentByName(agentName.value))

// DM messages — stored locally (no server DM endpoint in Phase 1)
const dmMessages = computed(() => chatStore.getDmMessages(agentName.value))
const typingUsers = computed<string[]>(() => [])

let msgId = 0

function handleSend(content: string) {
  const msg: Message = {
    id: `dm-${Date.now()}-${msgId++}`,
    roomId: `dm:${agentName.value}`,
    from: 'you',
    fromType: 'human',
    content,
    mentions: [],
    timestamp: Date.now()
  }
  chatStore.addDmMessage(agentName.value, msg)
}

function handleTyping(_isTyping: boolean) {
  // DM typing - no-op for now
}

function handleNewTask(_description: string) {
  // /new-task is not supported in DM context — group rooms only
}

const COLORS = [
  '#5865f2', '#ed4245', '#faa61a', '#3ba55c',
  '#eb459e', '#00b0f4', '#9b59b6', '#1abc9c'
]

function avatarColor(name: string) {
  const code = (name.charCodeAt(0) || 0) + (name.charCodeAt(name.length - 1) || 0)
  return COLORS[code % COLORS.length]
}
</script>

<style scoped>
.dm-view {
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
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-avatar {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: white;
}

.agent-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-heading);
}

.status-label {
  margin-left: 2px;
}

.dm-info {
  padding: 8px 16px;
  flex-shrink: 0;
}

.dm-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
}
</style>
