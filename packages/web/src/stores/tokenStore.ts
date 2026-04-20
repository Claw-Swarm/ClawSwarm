import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Token, TokenWithValue } from '@/types'
import { tokenApi } from '@/api'

export const useTokenStore = defineStore('tokens', () => {
  // tokens keyed by agentId
  const tokensByAgent = ref<Record<string, Token[]>>({})
  const loading = ref(false)

  async function fetchTokens(agentId: string) {
    loading.value = true
    try {
      const res = await tokenApi.list(agentId)
      tokensByAgent.value[agentId] = res.tokens
    } finally {
      loading.value = false
    }
  }

  async function createToken(
    agentId: string,
    description: string
  ): Promise<TokenWithValue> {
    const res = await tokenApi.create(agentId, description)
    if (!tokensByAgent.value[agentId]) {
      tokensByAgent.value[agentId] = []
    }
    tokensByAgent.value[agentId].push(res.token)
    return res.token
  }

  async function revokeToken(agentId: string, tokenId: string) {
    await tokenApi.revoke(agentId, tokenId)
    if (tokensByAgent.value[agentId]) {
      const token = tokensByAgent.value[agentId].find((t) => t.id === tokenId)
      if (token) token.revoked = true
    }
  }

  function getTokens(agentId: string) {
    return tokensByAgent.value[agentId] || []
  }

  return {
    tokensByAgent,
    loading,
    fetchTokens,
    createToken,
    revokeToken,
    getTokens
  }
})
