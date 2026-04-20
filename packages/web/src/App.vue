<template>
  <RouterView />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useWsStore } from '@/stores/wsStore'
import { useAgentStore } from '@/stores/agentStore'
import { useRoomStore } from '@/stores/roomStore'
import { useAuthStore } from '@/stores/authStore'

const wsStore = useWsStore()
const agentStore = useAgentStore()
const roomStore = useRoomStore()
const authStore = useAuthStore()

onMounted(async () => {
  if (!authStore.token) return
  // Load initial data (handles page refresh with existing token)
  await Promise.all([agentStore.fetchAgents(), roomStore.fetchRooms()])
  wsStore.connect()
})

onUnmounted(() => {
  wsStore.disconnect()
})
</script>
