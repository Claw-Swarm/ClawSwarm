<template>
  <div class="agent-card card">
    <div class="card-header">
      <div class="agent-info">
        <div class="avatar" :style="{ background: avatarColor }">
          {{ (agent.nickname || agent.name)[0].toUpperCase() }}
        </div>
        <div class="agent-meta">
          <div class="agent-name">{{ agent.nickname || agent.name }}</div>
          <div v-if="agent.nickname" class="agent-username">@{{ agent.name }}</div>
          <div class="agent-status">
            <span class="status-dot" :class="agent.status"></span>
            <span class="text-sm text-muted">{{ agent.status }}</span>
          </div>
        </div>
      </div>

      <div class="card-actions">
        <button class="btn btn-ghost btn-sm" @click="$emit('edit', agent)">Edit</button>
        <button class="btn btn-ghost btn-sm text-danger" @click="$emit('delete', agent)">Delete</button>
      </div>
    </div>

    <div class="card-body">
      <div v-if="agent.role" class="role-desc">
        {{ agent.role }}
      </div>
      <div v-else class="role-empty">
        <span class="text-muted text-sm">未设置角色定义</span>
      </div>

      <div class="card-footer-info">
        <div class="info-row">
          <span class="text-muted text-sm">Agent ID:</span>
          <code class="text-sm">{{ agent.id }}</code>
        </div>
        <div class="info-row">
          <span class="text-muted text-sm">Created:</span>
          <span class="text-sm text-secondary">{{ formatDate(agent.createdAt) }}</span>
        </div>
        <div class="info-row">
          <RouterLink :to="`/admin/tokens?agent=${agent.id}`" class="text-sm">
            View Tokens →
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Agent } from '@/types'

const props = defineProps<{ agent: Agent }>()
defineEmits<{
  edit: [agent: Agent]
  delete: [agent: Agent]
}>()

const COLORS = [
  '#5865f2', '#ed4245', '#faa61a', '#3ba55c',
  '#eb459e', '#00b0f4', '#9b59b6', '#1abc9c'
]

const avatarColor = computed(() => {
  const code = props.agent.name.charCodeAt(0) + props.agent.name.charCodeAt(props.agent.name.length - 1)
  return COLORS[code % COLORS.length]
})

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString()
}
</script>

<style scoped>
.agent-card {
  transition: border-color 0.15s;
}

.agent-card:hover {
  border-color: var(--border-light);
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.agent-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.agent-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-name {
  font-weight: 600;
  color: var(--text-heading);
  font-size: 15px;
}

.agent-username {
  font-size: 11px;
  color: var(--text-muted);
}

.agent-status {
  display: flex;
  align-items: center;
  gap: 4px;
}

.card-actions {
  display: flex;
  gap: 4px;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.role-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.role-empty {
  padding: 4px 0;
}

.card-footer-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-row code {
  font-size: 11px;
  color: var(--text-muted);
}

.text-secondary {
  color: var(--text-secondary);
}
</style>
