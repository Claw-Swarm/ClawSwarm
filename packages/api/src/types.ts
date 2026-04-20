/** Shared TypeScript types for ClawSwarm API */

export interface Agent {
  id: string;
  name: string;
  nickname: string;
  icon: string;
  role: string;
  skills: string[];
  status: 'online' | 'offline';
  createdAt: number;
}

export interface Token {
  id: string;
  agentId: string;
  token: string;
  description: string;
  revoked: boolean;
  createdAt: number;
}

export interface Room {
  id: string;
  name: string;
  createdAt: number;
}

export interface RoomMember {
  roomId: string;
  agentId: string;
  agentName: string;
  status: 'online' | 'offline';
}

export interface Message {
  id: string;
  roomId: string;
  from: string;
  fromType: 'human' | 'agent';
  content: string;
  mentions: string[];
  timestamp: number;
}

export interface RequirementMark {
  id: string;
  roomId: string;
  label: string;
  markedAt: number;
}

// ─────────────── WebSocket message shapes ───────────────

export interface WsAuthMsg {
  type: 'auth';
  token: string;
  agentName: string;
}

export interface WsMessageMsg {
  type: 'message';
  id?: string;
  roomId: string;
  from?: string;
  fromType?: 'human' | 'agent';
  content: string;
  mentions?: string[];
  timestamp?: number;
  _context?: AgentContext;
}

export interface WsTypingMsg {
  type: 'typing';
  roomId: string;
  from?: string;
  status: 'start' | 'stop';
}

export interface WsPingMsg {
  type: 'ping';
}

export interface WsPongMsg {
  type: 'pong';
}

export interface AgentContext {
  agentName: string;
  agentNickname: string;
  agentRole: string;
  agentSkills: string[];
  taskLabel: string;
  roomAgents: Array<{ name: string; nickname: string; role: string }>;
  taskHistory: Array<{
    id: string;
    from: string;
    fromType: 'human' | 'agent';
    content: string;
    timestamp: number;
  }>;
}

// Internal row shapes from SQLite
export interface AgentRow {
  id: string;
  name: string;
  nickname: string;
  icon: string;
  role: string;
  skills: string;
  status: 'online' | 'offline';
  created_at: number;
}

export interface TokenRow {
  id: string;
  agent_id: string;
  token: string;
  description: string;
  revoked: number;
  created_at: number;
}

export interface RoomRow {
  id: string;
  name: string;
  created_at: number;
}

export interface MessageRow {
  id: string;
  room_id: string;
  from_id: string;
  from_type: 'human' | 'agent';
  content: string;
  mentions: string; // JSON
  timestamp: number;
}

export interface RequirementMarkRow {
  id: string;
  room_id: string;
  label: string;
  marked_at: number;
}
