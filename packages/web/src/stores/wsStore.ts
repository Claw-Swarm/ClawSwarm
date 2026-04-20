import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  WsChatMessage,
  WsTypingMessage,
  WsAgentStatusMessage,
  WsMessage
} from '@/types'
import { useAgentStore } from './agentStore'
import { useRoomStore } from './roomStore'
import { useChatStore } from './chatStore'
import { useAuthStore } from './authStore'

type WsStatus = 'disconnected' | 'connecting' | 'connected'

export const useWsStore = defineStore('ws', () => {
  const status = ref<WsStatus>('disconnected')
  const socket = ref<WebSocket | null>(null)
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectDelay = 1000
  const MAX_RECONNECT_DELAY = 30000

  const isConnected = computed(() => status.value === 'connected')

  function connect() {
    if (socket.value && socket.value.readyState === WebSocket.OPEN) return

    status.value = 'connecting'

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const authStore = useAuthStore()
    const tokenParam = authStore.token ? `?token=${encodeURIComponent(authStore.token)}` : ''
    const wsUrl = `${protocol}//${window.location.host}/ws/client${tokenParam}`

    const ws = new WebSocket(wsUrl)
    socket.value = ws

    ws.onopen = () => {
      status.value = 'connected'
      reconnectDelay = 1000 // reset
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage
        handleMessage(msg)
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      status.value = 'disconnected'
      socket.value = null
      scheduleReconnect()
    }

    ws.onerror = () => {
      ws.close()
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => {
      connect()
    }, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)
  }

  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (socket.value) {
      socket.value.onclose = null
      socket.value.close()
      socket.value = null
    }
    status.value = 'disconnected'
  }

  function send(data: object) {
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      socket.value.send(JSON.stringify(data))
    }
  }

  function sendMessage(roomId: string, content: string) {
    const mentions = extractMentions(content)
    send({
      type: 'message',
      roomId,
      from: 'human',
      fromType: 'human',
      content,
      mentions
    })
  }

  function extractMentions(content: string): string[] {
    const matches = content.matchAll(/@([\w-]+)/g)
    return [...matches].map((m) => m[1])
  }

  function handleMessage(msg: WsMessage) {
    const agentStore = useAgentStore()
    const roomStore = useRoomStore()
    const chatStore = useChatStore()

    switch (msg.type) {
      case 'message': {
        const m = msg as WsChatMessage
        chatStore.addMessage(m.roomId, {
          id: m.id,
          roomId: m.roomId,
          from: m.from,
          fromType: m.fromType,
          content: m.content,
          mentions: m.mentions || [],
          timestamp: m.timestamp
        })
        break
      }

      case 'typing': {
        const t = msg as WsTypingMessage
        chatStore.setTyping(t.roomId, t.from, t.status === 'start')
        break
      }

      case 'agent_status': {
        const s = msg as WsAgentStatusMessage
        agentStore.updateAgentStatus(s.agentName, s.status)
        // Also update room member status
        roomStore.updateMemberStatus(s.agentName, s.status)
        break
      }
    }
  }

  return {
    status,
    isConnected,
    connect,
    disconnect,
    send,
    sendMessage
  }
})
