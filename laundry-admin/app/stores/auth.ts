import { defineStore } from 'pinia'
import type { User, LoginResponse } from '~/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const initialized = ref(false)
  let initPromise: Promise<void> | null = null

  const isAuthenticated = computed(() => !!accessToken.value)

  function setAuth(data: LoginResponse) {
    user.value = data.user
    accessToken.value = data.accessToken
    refreshToken.value = data.refreshToken
    initialized.value = true
    if (import.meta.client) {
      localStorage.setItem('accessToken', data.accessToken)
      localStorage.setItem('refreshToken', data.refreshToken)
    }
  }

  function clearAuth() {
    user.value = null
    accessToken.value = null
    refreshToken.value = null
    initialized.value = true
    if (import.meta.client) {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
    }
  }

  function loadFromStorage() {
    if (import.meta.client) {
      accessToken.value = localStorage.getItem('accessToken')
      refreshToken.value = localStorage.getItem('refreshToken')
    }
  }

  function setUser(u: User) {
    user.value = u
  }

  async function refreshSession(apiBase: string): Promise<boolean> {
    if (!refreshToken.value) return false
    try {
      const res = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refreshToken.value }),
      })
      if (!res.ok) return false

      const data = await res.json()
      accessToken.value = data.accessToken
      refreshToken.value = data.refreshToken

      if (import.meta.client) {
        localStorage.setItem('accessToken', data.accessToken)
        localStorage.setItem('refreshToken', data.refreshToken)
      }
      return true
    } catch {
      return false
    }
  }

  async function fetchMe(apiBase: string): Promise<boolean> {
    if (!accessToken.value) return false
    try {
      const res = await fetch(`${apiBase}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken.value}` },
      })
      if (!res.ok) return false
      const data = await res.json()
      user.value = data
      return true
    } catch {
      return false
    }
  }

  async function initAuth() {
    if (!import.meta.client) return
    if (initialized.value) return
    if (initPromise) return initPromise

    initPromise = (async () => {
      loadFromStorage()

      if (!accessToken.value) {
        initialized.value = true
        return
      }

      const config = useRuntimeConfig()
      const apiBase = config.public.apiBase

      let ok = await fetchMe(apiBase)

      if (!ok) {
        const refreshed = await refreshSession(apiBase)
        if (refreshed) {
          ok = await fetchMe(apiBase)
        }
      }

      if (!ok) {
        clearAuth()
      } else {
        initialized.value = true
      }
    })()

    try {
      await initPromise
    } finally {
      initPromise = null
    }
  }

  return {
    user,
    accessToken,
    refreshToken,
    initialized,
    isAuthenticated,
    setAuth,
    clearAuth,
    loadFromStorage,
    setUser,
    initAuth,
  }
}, { persist: false })
