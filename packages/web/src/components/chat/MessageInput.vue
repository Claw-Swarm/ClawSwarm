<template>
  <div class="message-input-area">
    <!-- @mention popup -->
    <div v-if="showMentionMenu && filteredAgents.length > 0" class="mention-popup">
      <div
        v-for="(agent, idx) in filteredAgents"
        :key="agent.name"
        class="mention-item"
        :class="{ active: idx === mentionIdx }"
        @mousedown.prevent="selectMention(agent.name)"
      >
        <div class="mention-avatar" :style="{ background: avatarColor(agent.name) }">
          {{ (agent.nickname || agent.name)[0].toUpperCase() }}
        </div>
        <span class="mention-display-name">{{ agent.nickname || agent.name }}</span>
        <span v-if="agent.nickname" class="mention-raw-name">@{{ agent.name }}</span>
        <span class="status-dot" :class="agent.status" style="margin-left: auto"></span>
      </div>
    </div>

    <!-- New task dialog -->
    <div v-if="showNewTaskDialog" class="new-task-dialog">
      <input
        ref="taskInputEl"
        v-model="taskLabelText"
        class="task-label-input"
        placeholder="Task description (optional)"
        @keydown.enter.prevent="confirmNewTask"
        @keydown.escape.prevent="showNewTaskDialog = false"
      />
      <div class="new-task-actions">
        <button class="btn btn-ghost btn-sm" @click="showNewTaskDialog = false">Cancel</button>
        <button class="btn btn-primary btn-sm" @click="confirmNewTask">Start Task</button>
      </div>
    </div>

    <!-- Input row -->
    <div class="input-row">
      <button
        class="new-task-btn"
        title="Start a new task"
        @click="openNewTaskDialog"
      >
        ＋任务
      </button>
      <textarea
        ref="inputEl"
        v-model="text"
        class="chat-input"
        :placeholder="placeholder"
        rows="1"
        @input="onInput"
        @keydown="onKeyDown"
        @keyup="adjustHeight"
        @paste="adjustHeight"
      ></textarea>
      <button
        class="btn btn-primary send-btn"
        :disabled="!canSend"
        @click="handleSend"
      >
        ↑
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import type { Agent } from '@/types'

const props = defineProps<{
  agents: Agent[]
  placeholder?: string
  roomId?: string
}>()

const emit = defineEmits<{
  send: [content: string]
  typing: [isTyping: boolean]
  newTask: [description: string]
}>()

const text = ref('')
const inputEl = ref<HTMLTextAreaElement | null>(null)
const showMentionMenu = ref(false)
const mentionQuery = ref('')
const mentionStart = ref(-1)
const mentionIdx = ref(0)
const showNewTaskDialog = ref(false)
const taskLabelText = ref('')
const taskInputEl = ref<HTMLInputElement | null>(null)

let typingTimer: ReturnType<typeof setTimeout> | null = null
let isTyping = false

const canSend = computed(() => text.value.trim().length > 0)

const filteredAgents = computed(() => {
  if (!showMentionMenu.value) return []
  const q = mentionQuery.value.toLowerCase()
  return props.agents
    .filter((a) => !q || a.name.toLowerCase().includes(q) || (a.nickname || '').toLowerCase().includes(q))
    .sort((a, b) => {
      const na = (a.nickname || a.name).toLowerCase()
      const nb = (b.nickname || b.name).toLowerCase()
      return na < nb ? -1 : na > nb ? 1 : 0
    })
    .slice(0, 8)
})

function openNewTaskDialog() {
  taskLabelText.value = ''
  showNewTaskDialog.value = true
  nextTick(() => taskInputEl.value?.focus())
}

function confirmNewTask() {
  showNewTaskDialog.value = false
  emit('newTask', taskLabelText.value.trim())
  taskLabelText.value = ''
}

function onInput(e: Event) {
  const input = e.target as HTMLTextAreaElement
  const val = input.value
  const pos = input.selectionStart ?? val.length

  // Detect @mention
  const textBefore = val.slice(0, pos)
  const mentionMatch = textBefore.match(/@([^\s@,，。！？\\/]*)$/u)

  if (mentionMatch) {
    mentionQuery.value = mentionMatch[1]
    mentionStart.value = pos - mentionMatch[0].length
    showMentionMenu.value = true
    mentionIdx.value = 0
  } else {
    showMentionMenu.value = false
    mentionQuery.value = ''
    mentionStart.value = -1
  }

  // Typing indicator
  handleTypingIndicator()
  adjustHeight()
}

function handleTypingIndicator() {
  if (!isTyping) {
    isTyping = true
    emit('typing', true)
  }
  if (typingTimer) clearTimeout(typingTimer)
  typingTimer = setTimeout(() => {
    isTyping = false
    emit('typing', false)
  }, 2000)
}

function onKeyDown(e: KeyboardEvent) {
  if (e.isComposing) return

  if (showMentionMenu.value && filteredAgents.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      mentionIdx.value = (mentionIdx.value + 1) % filteredAgents.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      mentionIdx.value =
        (mentionIdx.value - 1 + filteredAgents.value.length) % filteredAgents.value.length
      return
    }
    if (e.key === 'Tab' || e.key === 'Enter') {
      if (showMentionMenu.value) {
        e.preventDefault()
        selectMention(filteredAgents.value[mentionIdx.value]?.name || '')
        return
      }
    }
    if (e.key === 'Escape') {
      showMentionMenu.value = false
      return
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function selectMention(name: string) {
  if (!name || !inputEl.value) return
  const val = text.value
  const pos = inputEl.value.selectionStart ?? val.length
  const before = val.slice(0, mentionStart.value)
  const after = val.slice(pos)
  text.value = `${before}@${name} ${after}`
  showMentionMenu.value = false
  mentionQuery.value = ''

  nextTick(() => {
    if (inputEl.value) {
      const newPos = mentionStart.value + name.length + 2
      inputEl.value.setSelectionRange(newPos, newPos)
      inputEl.value.focus()
    }
  })
}

function handleSend() {
  const content = text.value.trim()
  if (!content) return

  emit('send', content)
  text.value = ''
  adjustHeight()

  if (isTyping) {
    emit('typing', false)
    isTyping = false
    if (typingTimer) clearTimeout(typingTimer)
  }
}

function adjustHeight() {
  nextTick(() => {
    if (!inputEl.value) return
    inputEl.value.style.height = 'auto'
    const newHeight = Math.min(inputEl.value.scrollHeight, 200)
    inputEl.value.style.height = `${newHeight}px`
  })
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
.message-input-area {
  padding: 0 16px 16px;
  flex-shrink: 0;
  position: relative;
}

.mention-popup {
  position: absolute;
  bottom: calc(100% - 16px);
  left: 16px;
  right: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  max-height: 240px;
  overflow-y: auto;
  z-index: 100;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.1s;
}

.mention-item:hover,
.mention-item.active {
  background: var(--bg-hover);
}

.mention-display-name {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.mention-raw-name {
  font-size: 11px;
  color: var(--text-muted);
}

.mention-avatar {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 8px 8px 8px;
  transition: border-color 0.15s;
}

.new-task-btn {
  flex-shrink: 0;
  height: 30px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(88, 101, 242, 0.2);
  border: 1px solid rgba(88, 101, 242, 0.5);
  border-radius: 6px;
  color: #a0a8f8;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  align-self: flex-end;
  margin-bottom: 1px;
  white-space: nowrap;
}

.new-task-btn:hover {
  background: rgba(88, 101, 242, 0.35);
  border-color: rgba(88, 101, 242, 0.8);
  color: #c0c8ff;
}

.new-task-dialog {
  position: absolute;
  bottom: calc(100% - 8px);
  left: 16px;
  right: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.4);
  padding: 12px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-label-input {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 14px;
  color: var(--text-primary);
  outline: none;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.task-label-input:focus {
  border-color: var(--accent);
}

.task-label-input::placeholder {
  color: var(--text-muted);
}

.new-task-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}


.input-row:focus-within {
  border-color: var(--accent);
}

.chat-input {
  flex: 1;
  background: none;
  border: none;
  padding: 0;
  resize: none;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  outline: none;
  max-height: 200px;
  overflow-y: auto;
}

.chat-input::placeholder {
  color: var(--text-muted);
}

.send-btn {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 16px;
  flex-shrink: 0;
  align-self: flex-end;
  line-height: 1;
}

</style>
