import type {
  Agent,
  Token,
  TokenWithValue,
  Room,
  Message,
  ApiAgentsResponse,
  ApiAgentResponse,
  ApiTokensResponse,
  ApiTokenResponse,
  ApiRoomsResponse,
  ApiRoomResponse,
  ApiMessagesResponse,
  ApiSuccessResponse
} from '@/types'
import { useAuthStore } from '@/stores/authStore'

const BASE_URL = '/api/v1'

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const authStore = useAuthStore()
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(authStore.token ? { Authorization: `Bearer ${authStore.token}` } : {}),
      ...options.headers
    },
    ...options
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    const message = errData?.error?.message || `HTTP ${res.status}`
    throw new Error(message)
  }

  return res.json()
}

// ─── Agent API ───────────────────────────────────────────────────────────────

export const agentApi = {
  list(): Promise<ApiAgentsResponse> {
    return request('/agents')
  },

  get(agentId: string): Promise<ApiAgentResponse> {
    return request(`/agents/${agentId}`)
  },

  create(data: {
    name: string
    role: string
    skills: string[]
    tokenDescription: string
  }): Promise<{ agent: Agent; token: TokenWithValue }> {
    return request('/agents', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },

  update(
    agentId: string,
    data: Partial<Pick<Agent, 'name' | 'nickname' | 'icon' | 'role' | 'skills'>>
  ): Promise<ApiAgentResponse> {
    return request(`/agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    })
  },

  delete(agentId: string): Promise<ApiSuccessResponse> {
    return request(`/agents/${agentId}`, { method: 'DELETE' })
  }
}

// ─── Token API ────────────────────────────────────────────────────────────────

export const tokenApi = {
  list(agentId: string): Promise<ApiTokensResponse> {
    return request(`/agents/${agentId}/tokens`)
  },

  create(
    agentId: string,
    description: string
  ): Promise<ApiTokenResponse> {
    return request(`/agents/${agentId}/tokens`, {
      method: 'POST',
      body: JSON.stringify({ description })
    })
  },

  revoke(agentId: string, tokenId: string): Promise<ApiSuccessResponse> {
    return request(`/agents/${agentId}/tokens/${tokenId}`, { method: 'DELETE' })
  }
}

// ─── Room API ─────────────────────────────────────────────────────────────────

export const roomApi = {
  list(): Promise<ApiRoomsResponse> {
    return request('/rooms')
  },

  get(roomId: string): Promise<ApiRoomResponse> {
    return request(`/rooms/${roomId}`)
  },

  create(data: { name: string; agentIds: string[] }): Promise<ApiRoomResponse> {
    return request('/rooms', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },

  delete(roomId: string): Promise<ApiSuccessResponse> {
    return request(`/rooms/${roomId}`, { method: 'DELETE' })
  },

  addMembers(roomId: string, agentIds: string[]): Promise<ApiSuccessResponse> {
    return request(`/rooms/${roomId}/members`, {
      method: 'POST',
      body: JSON.stringify({ agentIds })
    })
  },

  removeMember(roomId: string, agentId: string): Promise<ApiSuccessResponse> {
    return request(`/rooms/${roomId}/members/${agentId}`, { method: 'DELETE' })
  },

  getTasks(roomId: string): Promise<{ tasks: Array<{ markId: string; label: string; startedAt: number; messageCount: number }> }> {
    return request(`/rooms/${roomId}/tasks`)
  },

  deleteTasks(roomId: string, markIds: string[]): Promise<ApiSuccessResponse> {
    return request(`/rooms/${roomId}/tasks`, {
      method: 'DELETE',
      body: JSON.stringify({ markIds })
    })
  }
}

// ─── Message API ──────────────────────────────────────────────────────────────

export const messageApi = {
  list(
    roomId: string,
    params: { limit?: number; before?: number } = {}
  ): Promise<ApiMessagesResponse> {
    const qs = new URLSearchParams()
    if (params.limit != null) qs.set('limit', String(params.limit))
    if (params.before != null) qs.set('before', String(params.before))
    const query = qs.toString() ? `?${qs}` : ''
    return request(`/rooms/${roomId}/messages${query}`)
  }
}

export type { Agent, Token, TokenWithValue, Room, Message }
