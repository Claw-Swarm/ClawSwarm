import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Message } from '@/types'
import { messageApi } from '@/api'

interface RoomMessages {
  messages: Message[]
  hasMore: boolean
  loaded: boolean
  loading: boolean
}

interface TypingState {
  [agentName: string]: boolean
}

export const useChatStore = defineStore('chat', () => {
  // Messages keyed by roomId
  const roomMessages = ref<Record<string, RoomMessages>>({})
  // Typing state keyed by roomId → agentName → boolean
  const typingState = ref<Record<string, TypingState>>({})
  // DM messages keyed by agent name
  const dmMessages = ref<Record<string, Message[]>>({})

  function ensureRoom(roomId: string) {
    if (!roomMessages.value[roomId]) {
      roomMessages.value[roomId] = {
        messages: [],
        hasMore: false,
        loaded: false,
        loading: false
      }
    }
  }

  function getMessages(roomId: string) {
    ensureRoom(roomId)
    return roomMessages.value[roomId].messages
  }

  function getRoomState(roomId: string) {
    ensureRoom(roomId)
    return roomMessages.value[roomId]
  }

  async function loadMessages(roomId: string, before?: number) {
    ensureRoom(roomId)
    const state = roomMessages.value[roomId]
    if (state.loading) return
    state.loading = true
    try {
      const res = await messageApi.list(roomId, { limit: 50, before })
      const incoming = res.messages
      if (before) {
        // Prepend older messages
        state.messages = [...incoming, ...state.messages]
      } else {
        state.messages = incoming
      }
      state.hasMore = res.hasMore
      state.loaded = true
    } finally {
      state.loading = false
    }
  }

  function addMessage(roomId: string, message: Message) {
    ensureRoom(roomId)
    const state = roomMessages.value[roomId]
    // Avoid duplicates
    if (!state.messages.find((m) => m.id === message.id)) {
      state.messages.push(message)
    }
  }

  function setTyping(roomId: string, agentName: string, isTyping: boolean) {
    if (!typingState.value[roomId]) {
      typingState.value[roomId] = {}
    }
    typingState.value[roomId][agentName] = isTyping
  }

  function getTyping(roomId: string): string[] {
    const state = typingState.value[roomId] || {}
    return Object.entries(state)
      .filter(([, v]) => v)
      .map(([k]) => k)
  }

  // DM messages (agent direct chat)
  function getDmMessages(agentName: string) {
    return dmMessages.value[agentName] || []
  }

  function addDmMessage(agentName: string, message: Message) {
    if (!dmMessages.value[agentName]) {
      dmMessages.value[agentName] = []
    }
    if (!dmMessages.value[agentName].find((m) => m.id === message.id)) {
      dmMessages.value[agentName].push(message)
    }
  }

  const allTyping = computed(() => typingState.value)

  return {
    roomMessages,
    typingState,
    dmMessages,
    getMessages,
    getRoomState,
    loadMessages,
    addMessage,
    setTyping,
    getTyping,
    getDmMessages,
    addDmMessage,
    allTyping
  }
})
