import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Room } from '@/types'
import { roomApi } from '@/api'

export const useRoomStore = defineStore('rooms', () => {
  const rooms = ref<Room[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchRooms() {
    loading.value = true
    error.value = null
    try {
      const res = await roomApi.list()
      rooms.value = res.rooms
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function createRoom(data: { name: string; agentIds: string[] }) {
    const res = await roomApi.create(data)
    rooms.value.push(res.room)
    return res.room
  }

  async function deleteRoom(roomId: string) {
    await roomApi.delete(roomId)
    rooms.value = rooms.value.filter((r) => r.id !== roomId)
  }

  async function addMembers(roomId: string, agentIds: string[]) {
    await roomApi.addMembers(roomId, agentIds)
    await fetchRooms()
  }

  async function removeMember(roomId: string, agentId: string) {
    await roomApi.removeMember(roomId, agentId)
    const room = rooms.value.find((r) => r.id === roomId)
    if (room) {
      room.members = room.members.filter((m) => m.agentId !== agentId)
    }
  }

  function updateMemberStatus(agentName: string, status: 'online' | 'offline') {
    for (const room of rooms.value) {
      const member = room.members.find((m) => m.agentName === agentName)
      if (member) member.status = status
    }
  }

  function getRoomById(id: string) {
    return rooms.value.find((r) => r.id === id)
  }

  return {
    rooms,
    loading,
    error,
    fetchRooms,
    createRoom,
    deleteRoom,
    addMembers,
    removeMember,
    updateMemberStatus,
    getRoomById
  }
})
