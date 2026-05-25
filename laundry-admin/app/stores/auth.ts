import { defineStore } from 'pinia'
import type { User, LoginResponse } from '~/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)

  const isAuthenticated = computed(() => !!accessToken.value && !!user.value)

  function setAuth(data: LoginResponse) {
    user.value = data.user
    accessToken.value = data.accessToken
    refreshToken.value = data.refreshToken
    if (import.meta.client) {
      localStorage.setItem('accessToken', data.accessToken)
      localStorage.setItem('refreshToken', data.refreshToken)
    }
  }

  function clearAuth() {
    user.value = null
    accessToken.value = null
    refreshToken.value = null
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

  return { user, accessToken, refreshToken, isAuthenticated, setAuth, clearAuth, loadFromStorage, setUser }
}, { persist: false })
