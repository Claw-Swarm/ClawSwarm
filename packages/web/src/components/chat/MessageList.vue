<template>
  <div ref="listEl" class="message-list" @scroll="onScroll">
    <div v-if="hasMore" class="load-more">
      <button class="btn btn-ghost btn-sm" :disabled="loading" @click="$emit('loadMore')">
        {{ loading ? 'Loading...' : 'Load earlier messages' }}
      </button>
    </div>

    <div v-if="messages.length === 0 && !loading" class="empty-messages">
      <p class="text-muted text-sm">No messages yet. Start the conversation!</p>
    </div>

    <template v-for="(msg, idx) in messages" :key="msg.id">
      <!-- Task divider -->
      <div v-if="isNewTask(msg)" class="task-divider">
        <span class="task-divider-line"></span>
        <span class="task-divider-label">
          🚀 {{ taskLabel(msg) }}
        </span>
        <span class="task-divider-line"></span>
      </div>

      <div
        class="message-wrapper"
        :class="{
          'is-grouped': isGrouped(msg, idx),
          'is-mine': msg.fromType === 'human',
          'is-theirs': msg.fromType !== 'human',
        }"
      >
        <!-- ── Agent message (left) ── -->
        <template v-if="msg.fromType !== 'human'">
          <div class="avatar-col" :class="{ 'avatar-placeholder': isGrouped(msg, idx) }">
            <div
              v-if="!isGrouped(msg, idx)"
              class="avatar"
              :class="{ 'avatar-emoji': !!agentIcon(msg.from) }"
              :style="agentIcon(msg.from) ? {} : { background: avatarColor(msg.from) }"
            >
              {{ agentIcon(msg.from) || displayName(msg.from)[0]?.toUpperCase() || '?' }}
            </div>
            <span v-else class="hover-time">{{ formatTime(msg.timestamp) }}</span>
          </div>
          <div class="message-content">
            <div v-if="!isGrouped(msg, idx)" class="message-header">
              <span class="sender-name">{{ displayName(msg.from) }}</span>
              <span class="msg-type-badge">agent</span>
              <span class="timestamp">{{ formatTime(msg.timestamp) }}</span>
            </div>
            <!-- Delegate card -->
            <div v-if="isDelegateMsg(msg)" class="delegate-card">
              <div class="delegate-header">
                <span class="delegate-icon">📋</span>
                <span class="delegate-label">委派给</span>
                <span class="delegate-target">@{{ delegateParts(msg).target }}</span>
              </div>
              <div class="delegate-task markdown-body" v-html="renderContent(delegateParts(msg).task, 'agent')"></div>
            </div>
            <!-- Discuss card -->
            <div v-else-if="isDiscussMsg(msg)" class="discuss-card">
              <div class="discuss-header">
                <span class="discuss-icon">💬</span>
                <span class="discuss-label">讨论</span>
                <span class="discuss-target">@{{ discussParts(msg).target }}</span>
              </div>
              <div class="discuss-content markdown-body" v-html="renderContent(discussParts(msg).content, 'agent')"></div>
            </div>
            <div v-else class="message-text markdown-body" v-html="renderContent(msg.content, 'agent')"></div>
          </div>
        </template>

        <!-- ── Human message (right) ── -->
        <template v-else>
          <div class="message-content mine-content">
            <div v-if="!isGrouped(msg, idx)" class="message-header mine-header">
              <span class="timestamp">{{ formatTime(msg.timestamp) }}</span>
            </div>
            <div class="bubble" v-html="renderContent(msg.content)"></div>
          </div>
        </template>
      </div>
    </template>

    <div v-if="typingUsers.length > 0" class="typing-indicator">
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
      <span class="typing-text">{{ typingText }}</span>
    </div>

    <div ref="bottomEl"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted } from 'vue'
import type { Message } from '@/types'
import { useAgentStore } from '@/stores/agentStore'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.min.css'

marked.use({
  renderer: {
    code({ text, lang }) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
      const highlighted = hljs.highlight(text, { language, ignoreIllegals: true }).value
      return `<pre class="hljs-pre"><code class="hljs language-${language}">${highlighted}</code></pre>`
    },
    link({ href, text }) {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`
    },
  },
  breaks: true,
  gfm: true,
} as Parameters<typeof marked.use>[0])

const props = defineProps<{
  messages: Message[]
  typingUsers: string[]
  hasMore: boolean
  loading: boolean
}>()

defineEmits<{
  loadMore: []
}>()

const agentStore = useAgentStore()

function displayName(agentName: string): string {
  const agent = agentStore.getAgentByName(agentName)
  return (agent?.nickname?.trim()) || agentName
}

const listEl = ref<HTMLElement | null>(null)
const bottomEl = ref<HTMLElement | null>(null)
const autoScroll = ref(true)

const typingText = computed(() => {
  const users = props.typingUsers.map(displayName)
  if (users.length === 0) return ''
  if (users.length === 1) return `${users[0]} is typing...`
  if (users.length === 2) return `${users[0]} and ${users[1]} are typing...`
  return `${users[0]} and ${users.length - 1} others are typing...`
})

function onScroll() {
  if (!listEl.value) return
  const { scrollTop, scrollHeight, clientHeight } = listEl.value
  autoScroll.value = scrollHeight - scrollTop - clientHeight < 100
}

onMounted(async () => {
  await nextTick()
  bottomEl.value?.scrollIntoView({ behavior: 'instant' })
})

watch(
  () => props.messages.length,
  async (newLen, oldLen) => {
    if (autoScroll.value) {
      await nextTick()
      const behavior = (newLen - (oldLen ?? 0)) > 1 ? 'instant' : 'smooth'
      bottomEl.value?.scrollIntoView({ behavior })
    }
  }
)

watch(
  () => props.typingUsers.length,
  async () => {
    if (autoScroll.value) {
      await nextTick()
      bottomEl.value?.scrollIntoView({ behavior: 'smooth' })
    }
  }
)

function isNewTask(msg: Message): boolean {
  return msg.fromType === 'human' && msg.content.trimStart().startsWith('/new-task')
}

function taskLabel(msg: Message): string {
  const label = msg.content.replace(/^\/new-task\s*/i, '').trim()
  return label || 'New Task'
}

function isDelegateMsg(msg: Message): boolean {
  return msg.fromType === 'agent' && /(?:^|\n)\/delegate\s+@[^\s@,，。！？\\/]+\s+/iu.test(msg.content)
}

function delegateParts(msg: Message): { target: string; task: string } {
  const m = msg.content.match(/(?:^|\n)\/delegate\s+@([^\s@,，。！？\\/]+)\s+([\s\S]+)/iu)
  return m ? { target: m[1], task: m[2].trim() } : { target: '', task: msg.content }
}

function isDiscussMsg(msg: Message): boolean {
  return msg.fromType === 'agent' && /(?:^|\n)\/discuss\s+@[^\s@,，。！？\\/]+\s+/iu.test(msg.content)
}

function discussParts(msg: Message): { target: string; content: string } {
  const m = msg.content.match(/(?:^|\n)\/discuss\s+@([^\s@,，。！？\\/]+)\s+([\s\S]+)/iu)
  return m ? { target: m[1], content: m[2].trim() } : { target: '', content: msg.content }
}
function agentIcon(agentName: string): string {
  const agent = agentStore.getAgentByName(agentName)
  return agent?.icon?.trim() || ''
}

const GROUP_THRESHOLD_MS = 5 * 60 * 1000

function isGrouped(msg: Message, idx: number): boolean {
  if (idx === 0) return false
  const prev = props.messages[idx - 1]
  return (
    prev.from === msg.from &&
    prev.fromType === msg.fromType &&
    msg.timestamp - prev.timestamp < GROUP_THRESHOLD_MS
  )
}

const COLORS = [
  '#5865f2', '#ed4245', '#faa61a', '#3ba55c',
  '#eb459e', '#00b0f4', '#9b59b6', '#1abc9c'
]

function avatarColor(name: string) {
  const code = (name.charCodeAt(0) || 0) + (name.charCodeAt(name.length - 1) || 0)
  return COLORS[code % COLORS.length]
}

function formatTime(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function renderContent(content: string, fromType: 'human' | 'agent' = 'human'): string {
  if (fromType === 'agent') {
    const html = marked.parse(content) as string
    return html.replace(/@([^\s@,，。！？\\/]+)/gu, (_match, name) => {
      const agent = agentStore.getAgentByName(name)
      const label = agent?.nickname?.trim() || name
      return `<span class="mention" title="@${name}">@${label}</span>`
    })
  }

  let html = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  html = html.replace(/@([^\s@,，。！？\\/]+)/gu, (_match, name) => {
    const agent = agentStore.getAgentByName(name)
    const label = agent?.nickname?.trim() || name
    return `<span class="mention" title="@${name}">@${label}</span>`
  })
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  return html
}
</script>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 8px;
}

.empty-messages {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 24px;
}

/* ── Task divider ── */
.task-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px 4px;
  margin-top: 8px;
}

.task-divider-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent, #5865f2) 30%, var(--accent, #5865f2) 70%, transparent);
  opacity: 0.4;
}

.task-divider-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-light, #7983f5);
  white-space: nowrap;
  padding: 2px 10px;
  border: 1px solid rgba(88,101,242,0.3);
  border-radius: 12px;
  background: rgba(88,101,242,0.08);
  letter-spacing: 0.3px;
}

/* ── Base wrapper ── */
.message-wrapper {
  display: flex;
  gap: 12px;
  padding: 2px 16px;
  position: relative;
}

.message-wrapper:not(.is-grouped) {
  margin-top: 8px;
}

/* ── Agent (left) ── */
.is-theirs {
  flex-direction: row;
}

.is-theirs:hover {
  background: var(--message-hover);
}

.avatar-col {
  width: 36px;
  flex-shrink: 0;
}

.avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
  user-select: none;
}

.avatar.avatar-emoji {
  font-size: 22px;
  background: transparent !important;
}

.hover-time {
  font-size: 10px;
  color: var(--text-muted);
  opacity: 0;
  white-space: nowrap;
}

.message-wrapper:hover .hover-time {
  opacity: 1;
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 2px;
}

.sender-name {
  font-weight: 700;
  font-size: 15px;
  color: var(--text-heading);
}

.msg-type-badge {
  font-size: 10px;
  background: rgba(88, 101, 242, 0.2);
  color: var(--accent-light);
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
}

.timestamp {
  font-size: 11px;
  color: var(--text-muted);
}

.message-text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  word-wrap: break-word;
}

/* ── Human (right) ── */
.is-mine {
  flex-direction: row-reverse;
}

.mine-content {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: 70%;
  min-width: 0;
  flex: unset;
}

.mine-header {
  justify-content: flex-end;
  margin-bottom: 3px;
}

.bubble {
  background: var(--accent, #5865f2);
  color: #fff;
  padding: 8px 12px;
  border-radius: 16px 16px 4px 16px;
  font-size: 14px;
  line-height: 1.5;
  word-wrap: break-word;
  max-width: 100%;
}

/* ── Mentions & inline code ── */
.message-text :deep(.mention),
.bubble :deep(.mention) {
  color: var(--accent-light);
  background: rgba(88, 101, 242, 0.1);
  padding: 0 2px;
  border-radius: 2px;
  cursor: pointer;
}

.bubble :deep(.mention) {
  color: rgba(255,255,255,0.85);
  background: rgba(255,255,255,0.15);
}

/* ── Typing indicator ── */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px 6px 64px;
  min-height: 28px;
}

.typing-text {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}

.typing-dots {
  display: flex;
  gap: 3px;
  align-items: center;
}

.typing-dots span {
  width: 5px;
  height: 5px;
  background: var(--text-muted);
  border-radius: 50%;
  animation: typing-bounce 1.4s infinite ease-in-out;
}
.typing-dots span:nth-child(1) { animation-delay: 0s; }
.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}

/* ── Delegate card ── */
.delegate-card {
  background: rgba(250, 166, 26, 0.08);
  border: 1px solid rgba(250, 166, 26, 0.35);
  border-left: 3px solid #faa61a;
  border-radius: 6px;
  padding: 8px 12px;
  width: 66%;
}

.delegate-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.delegate-icon {
  font-size: 13px;
}

.delegate-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.delegate-target {
  font-size: 12px;
  font-weight: 700;
  color: #faa61a;
  background: rgba(250, 166, 26, 0.15);
  padding: 1px 6px;
  border-radius: 4px;
}

.delegate-task {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.5;
}

.discuss-card {
  background: rgba(88, 166, 255, 0.06);
  border: 1px solid rgba(88, 166, 255, 0.3);
  border-left: 3px solid #58a6ff;
  border-radius: 6px;
  padding: 8px 12px;
  width: 66%;
}

.discuss-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.discuss-icon {
  font-size: 13px;
}

.discuss-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.discuss-target {
  font-size: 12px;
  font-weight: 700;
  color: #58a6ff;
  background: rgba(88, 166, 255, 0.15);
  padding: 1px 6px;
  border-radius: 4px;
}

.discuss-content {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.5;
}

/* ── Markdown body (agent messages) ── */
.markdown-body {
  line-height: 1.6;
  word-wrap: break-word;
}

.markdown-body :deep(p) {
  margin: 0 0 8px;
}
.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 12px 0 6px;
  font-weight: 700;
  color: var(--text-heading);
  line-height: 1.3;
}
.markdown-body :deep(h1) { font-size: 18px; }
.markdown-body :deep(h2) { font-size: 16px; }
.markdown-body :deep(h3) { font-size: 14px; }

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 4px 0 8px;
  padding-left: 20px;
}
.markdown-body :deep(li) {
  margin-bottom: 2px;
  line-height: 1.5;
}

.markdown-body :deep(code) {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12.5px;
  background: rgba(255,255,255,0.08);
  padding: 1px 5px;
  border-radius: 3px;
  color: #e06c75;
}

.markdown-body :deep(.hljs-pre) {
  margin: 8px 0;
  border-radius: 6px;
  overflow-x: auto;
  border: 1px solid rgba(255,255,255,0.06);
}

.markdown-body :deep(.hljs-pre code) {
  display: block;
  padding: 12px 14px;
  font-size: 12.5px;
  background: none;
  color: inherit;
  border-radius: 0;
}

.markdown-body :deep(blockquote) {
  margin: 6px 0;
  padding: 4px 12px;
  border-left: 3px solid var(--accent, #5865f2);
  background: rgba(88,101,242,0.06);
  border-radius: 0 4px 4px 0;
  color: var(--text-secondary);
  font-style: italic;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 12px 0;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 13px;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--border);
  padding: 6px 10px;
  text-align: left;
}
.markdown-body :deep(th) {
  background: var(--bg-tertiary);
  font-weight: 600;
  color: var(--text-heading);
}
.markdown-body :deep(tr:nth-child(even) td) {
  background: rgba(255,255,255,0.02);
}

.markdown-body :deep(a) {
  color: var(--accent-light, #7983f5);
  text-decoration: none;
}
.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(strong) {
  font-weight: 700;
  color: var(--text-heading);
}
</style>
