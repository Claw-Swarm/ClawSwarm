// Agent types
export interface Agent {
  id: string
  name: string
  nickname: string
  icon: string
  role: string
  skills: string[]
  status: 'online' | 'offline'
  createdAt: number
}

// Token types
export interface Token {
  id: string
  description: string
  revoked: boolean
  createdAt: number
}

export interface TokenWithValue extends Token {
  token: string
}

// Room types
export interface RoomMember {
  agentId: string
  agentName: string
  status?: 'online' | 'offline'
}

export interface Room {
  id: string
  name: string
  members: RoomMember[]
  createdAt: number
}

// Message types
export interface Message {
  id: string
  roomId: string
  from: string
  fromType: 'human' | 'agent'
  content: string
  mentions: string[]
  timestamp: number
}

// WebSocket message types
export type WsMessageType =
  | 'auth'
  | 'auth_ok'
  | 'auth_fail'
  | 'message'
  | 'typing'
  | 'agent_status'
  | 'error'
  | 'ping'
  | 'pong'

export interface WsMessage {
  type: WsMessageType
  [key: string]: unknown
}

export interface WsAuthMessage extends WsMessage {
  type: 'auth'
  token: string
  agentName: string
}

export interface WsAuthOkMessage extends WsMessage {
  type: 'auth_ok'
  agentId: string
  agentName: string
}

export interface WsChatMessage extends WsMessage {
  type: 'message'
  id: string
  roomId: string
  from: string
  fromType: 'human' | 'agent'
  content: string
  mentions: string[]
  timestamp: number
}

export interface WsTypingMessage extends WsMessage {
  type: 'typing'
  roomId: string
  from: string
  status: 'start' | 'stop'
}

export interface WsAgentStatusMessage extends WsMessage {
  type: 'agent_status'
  agentId: string
  agentName: string
  status: 'online' | 'offline'
}

export interface WsErrorMessage extends WsMessage {
  type: 'error'
  code: string
  message: string
}

// API response types
export interface ApiAgentsResponse {
  agents: Agent[]
}

export interface ApiAgentResponse {
  agent: Agent
}

export interface ApiTokensResponse {
  tokens: Token[]
}

export interface ApiTokenResponse {
  token: TokenWithValue
}

export interface ApiRoomsResponse {
  rooms: Room[]
}

export interface ApiRoomResponse {
  room: Room
}

export interface ApiMessagesResponse {
  messages: Message[]
  hasMore: boolean
}

export interface ApiSuccessResponse {
  success: boolean
}

export interface ApiErrorResponse {
  error: {
    code: string
    message: string
  }
}
