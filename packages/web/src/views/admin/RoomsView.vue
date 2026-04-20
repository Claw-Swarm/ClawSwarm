<template>
  <div class="rooms-view">
    <div class="page-header">
      <h1>Rooms</h1>
      <button class="btn btn-primary" @click="showCreateModal = true">+ New Room</button>
    </div>

    <div v-if="roomStore.loading" class="loading">Loading rooms...</div>

    <div v-else-if="roomStore.rooms.length === 0" class="empty-state">
      <div class="icon">💬</div>
      <p>No rooms yet. Create a room to get started.</p>
    </div>

    <div v-else class="rooms-list">
      <div v-for="room in roomStore.rooms" :key="room.id" class="room-card card">
        <div class="room-header">
          <div class="room-title">
            <span class="room-hash">#</span>
            <span class="font-bold">{{ room.name }}</span>
          </div>
          <div class="room-actions">
            <button class="btn btn-ghost btn-sm" @click="openManage(room)">Manage</button>
            <button class="btn btn-ghost btn-sm text-danger" @click="confirmDelete(room)">Delete</button>
          </div>
        </div>

        <div class="room-members">
          <div class="members-header text-sm text-muted">
            {{ room.members.length }} member{{ room.members.length !== 1 ? 's' : '' }}
          </div>
          <div class="member-list">
            <div v-for="member in room.members" :key="member.agentId" class="member-chip">
              <span class="status-dot" :class="member.status || 'offline'"></span>
              <span>{{ member.agentName }}</span>
            </div>
          </div>
        </div>

        <div class="room-meta text-sm text-muted">
          ID: {{ room.id }} · Created: {{ formatDate(room.createdAt) }}
        </div>
      </div>
    </div>

    <!-- Create Modal -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
        <div class="modal">
          <div class="modal-header">
            <h2>Create Room</h2>
            <button class="btn btn-ghost" @click="showCreateModal = false">✕</button>
          </div>

          <form @submit.prevent="handleCreate">
            <div class="form-group">
              <label>Room Name</label>
              <input v-model="createForm.name" type="text" placeholder="e.g. dev-team" required />
            </div>
            <div class="form-group">
              <label>Initial Members</label>
              <div class="agent-checkboxes">
                <label v-for="a in agentStore.agents" :key="a.id" class="agent-check">
                  <input
                    type="checkbox"
                    :value="a.id"
                    v-model="createForm.agentIds"
                    style="width: auto"
                  />
                  <span class="status-dot" :class="a.status"></span>
                  {{ a.name }}
                </label>
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" @click="showCreateModal = false">Cancel</button>
              <button type="submit" class="btn btn-primary" :disabled="creating">
                {{ creating ? 'Creating...' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Manage Members Modal -->
      <div v-if="managingRoom" class="modal-overlay" @click.self="managingRoom = null">
        <div class="modal">
          <div class="modal-header">
            <h2>Manage #{{ managingRoom.name }}</h2>
            <button class="btn btn-ghost" @click="managingRoom = null">✕</button>
          </div>

          <div class="manage-section">
            <h3 class="section-title">Current Members</h3>
            <div v-if="managingRoom.members.length === 0" class="text-muted text-sm">No members</div>
            <div v-else class="member-manage-list">
              <div v-for="m in managingRoom.members" :key="m.agentId" class="member-manage-row">
                <div class="flex items-center gap-8">
                  <span class="status-dot" :class="m.status || 'offline'"></span>
                  <span>{{ m.agentName }}</span>
                </div>
                <button
                  class="btn btn-ghost btn-sm text-danger"
                  @click="handleRemoveMember(m.agentId)"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>

          <div class="manage-section mt-16">
            <h3 class="section-title">Add Members</h3>
            <div class="agent-checkboxes">
              <label v-for="a in availableToAdd" :key="a.id" class="agent-check">
                <input
                  type="checkbox"
                  :value="a.id"
                  v-model="addAgentIds"
                  style="width: auto"
                />
                <span class="status-dot" :class="a.status"></span>
                {{ a.name }}
              </label>
            </div>
            <div v-if="addAgentIds.length > 0" class="mt-8">
              <button class="btn btn-primary btn-sm" :disabled="adding" @click="handleAddMembers">
                {{ adding ? 'Adding...' : `Add ${addAgentIds.length} member(s)` }}
              </button>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="managingRoom = null">Close</button>
          </div>
        </div>
      </div>

      <!-- Delete Confirm -->
      <div v-if="deletingRoom" class="modal-overlay" @click.self="deletingRoom = null">
        <div class="modal">
          <div class="modal-header">
            <h2>Delete Room</h2>
          </div>
          <p>Delete <strong>#{{ deletingRoom.name }}</strong>?</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="deletingRoom = null">Cancel</button>
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
import { ref, reactive, computed } from 'vue'
import { useAgentStore } from '@/stores/agentStore'
import { useRoomStore } from '@/stores/roomStore'
import type { Room } from '@/types'

const agentStore = useAgentStore()
const roomStore = useRoomStore()

// Create
const showCreateModal = ref(false)
const creating = ref(false)
const createForm = reactive({
  name: '',
  agentIds: [] as string[]
})

async function handleCreate() {
  creating.value = true
  try {
    await roomStore.createRoom({
      name: createForm.name,
      agentIds: createForm.agentIds
    })
    showCreateModal.value = false
    createForm.name = ''
    createForm.agentIds = []
  } catch (e) {
    alert((e as Error).message)
  } finally {
    creating.value = false
  }
}

// Manage members
const managingRoom = ref<Room | null>(null)
const addAgentIds = ref<string[]>([])
const adding = ref(false)

const availableToAdd = computed(() => {
  if (!managingRoom.value) return []
  const memberIds = new Set(managingRoom.value.members.map((m) => m.agentId))
  return agentStore.agents.filter((a) => !memberIds.has(a.id))
})

function openManage(room: Room) {
  managingRoom.value = room
  addAgentIds.value = []
}

async function handleAddMembers() {
  if (!managingRoom.value || addAgentIds.value.length === 0) return
  adding.value = true
  try {
    await roomStore.addMembers(managingRoom.value.id, addAgentIds.value)
    // Refresh room data
    const updated = roomStore.getRoomById(managingRoom.value.id)
    if (updated) managingRoom.value = updated
    addAgentIds.value = []
  } catch (e) {
    alert((e as Error).message)
  } finally {
    adding.value = false
  }
}

async function handleRemoveMember(agentId: string) {
  if (!managingRoom.value) return
  try {
    await roomStore.removeMember(managingRoom.value.id, agentId)
    const updated = roomStore.getRoomById(managingRoom.value.id)
    if (updated) managingRoom.value = updated
  } catch (e) {
    alert((e as Error).message)
  }
}

// Delete
const deletingRoom = ref<Room | null>(null)
const deleting = ref(false)

function confirmDelete(room: Room) {
  deletingRoom.value = room
}

async function handleDelete() {
  if (!deletingRoom.value) return
  deleting.value = true
  try {
    await roomStore.deleteRoom(deletingRoom.value.id)
    deletingRoom.value = null
  } catch (e) {
    alert((e as Error).message)
  } finally {
    deleting.value = false
  }
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString()
}
</script>

<style scoped>
.rooms-view {
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

.rooms-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.room-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.room-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.room-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 16px;
}

.room-hash {
  color: var(--text-muted);
  font-size: 18px;
}

.room-actions {
  display: flex;
  gap: 4px;
}

.room-members {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.member-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.member-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  background: var(--bg-tertiary);
  border-radius: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}

.room-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.agent-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-check {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
}

.manage-section {
  margin-bottom: 4px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
}

.member-manage-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.member-manage-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
}
</style>
