import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Agent } from '@/types'
import { agentApi } from '@/api'

export const useAgentStore = defineStore('agents', () => {
  const agents = ref<Agent[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAgents() {
    loading.value = true
    error.value = null
    try {
      const res = await agentApi.list()
      agents.value = res.agents
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function createAgent(data: {
    name: string
    role: string
    skills: string[]
    tokenDescription: string
  }) {
    const res = await agentApi.create(data)
    agents.value.push(res.agent)
    return res
  }

  async function updateAgent(
    agentId: string,
    data: Partial<Pick<Agent, 'name' | 'nickname' | 'icon' | 'role' | 'skills'>>
  ) {
    const res = await agentApi.update(agentId, data)
    const idx = agents.value.findIndex((a) => a.id === agentId)
    if (idx !== -1) agents.value[idx] = res.agent
    return res.agent
  }

  async function deleteAgent(agentId: string) {
    await agentApi.delete(agentId)
    agents.value = agents.value.filter((a) => a.id !== agentId)
  }

  function updateAgentStatus(agentName: string, status: 'online' | 'offline') {
    const agent = agents.value.find((a) => a.name === agentName)
    if (agent) agent.status = status
  }

  function getAgentByName(name: string) {
    return agents.value.find((a) => a.name === name)
  }

  const sortedAgents = computed(() =>
    [...agents.value].sort((a, b) => {
      const na = (a.nickname || a.name).toLowerCase()
      const nb = (b.nickname || b.name).toLowerCase()
      return na < nb ? -1 : na > nb ? 1 : 0
    })
  )

  return {
    agents,
    sortedAgents,
    loading,
    error,
    fetchAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    updateAgentStatus,
    getAgentByName
  }
})
