import { defineStore } from 'pinia'
import type { User, LoginResponse } from '~/types'

/**
 * Auth Store — Token Security Strategy:
 *
 * - Access token: disimpan di memory (ref) saja, TIDAK di localStorage.
 *   Ini mencegah XSS membaca access token langsung.
 *   Trade-off: hilang saat page refresh → di-recover via refresh token.
 *
 * - Refresh token: disimpan di localStorage karena dibutuhkan untuk
 *   recover session setelah refresh. Idealnya pakai httpOnly cookie
 *   (butuh perubahan di backend untuk set-cookie).
 *
 * Flow:
 *   Login          → setAuth() → initialized=true, accessToken di memory
 *   Page refresh   → initAuth() → loadFromStorage() → refreshSession() → fetchMe()
 *   Logout         → clearAuth() → initialized=false ← PENTING agar initAuth bisa jalan lagi
 *   Navigasi baru  → middleware → initAuth() → skip jika sudah initialized
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  // Access token hanya di memory — tidak persist ke storage
  const accessToken = ref<string | null>(null)
  // Refresh token di localStorage untuk recovery setelah page reload
  const refreshToken = ref<string | null>(null)
  // initialized = true berarti proses init sudah selesai (berhasil atau gagal)
  const initialized = ref(false)
  // Simpan promise yang sedang berjalan agar concurrent calls menunggu yang sama
  let initPromise: Promise<void> | null = null

  const isAuthenticated = computed(() => !!accessToken.value)

  function setAuth(data: LoginResponse) {
    user.value = data.user
    accessToken.value = data.accessToken
    refreshToken.value = data.refreshToken
    initialized.value = true
    if (import.meta.client) {
      // Hanya simpan refresh token — access token di memory saja
      localStorage.setItem('refreshToken', data.refreshToken)
    }
  }

  function clearAuth() {
    user.value = null
    accessToken.value = null
    refreshToken.value = null
    // BUG FIX: set false agar initAuth() bisa jalan ulang setelah logout
    // Sebelumnya: initialized.value = true → initAuth() selalu skip setelah logout
    initialized.value = false
    initPromise = null
    if (import.meta.client) {
      localStorage.removeItem('refreshToken')
    }
  }

  function loadFromStorage() {
    if (import.meta.client) {
      // Access token tidak ada di storage — harus di-recover via refresh
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

      const responseBody = await res.json()
      // Handle wrapped response { success, data: { accessToken, refreshToken } }
      const data = responseBody.data ?? responseBody

      if (!data.accessToken || !data.refreshToken) return false

      accessToken.value = data.accessToken
      refreshToken.value = data.refreshToken

      if (import.meta.client) {
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
      const responseBody = await res.json()
      const data = responseBody.data ?? responseBody
      user.value = data
      return true
    } catch {
      return false
    }
  }

  async function logout(apiBase: string) {
    try {
      if (accessToken.value) {
        // Beritahu backend untuk revoke refresh token
        await fetch(`${apiBase}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken.value}`,
          },
          body: JSON.stringify({ refreshToken: refreshToken.value }),
        })
      }
    } catch {
      // Tetap clear auth meski request gagal
    } finally {
      clearAuth()
    }
  }

  async function initAuth(): Promise<void> {
    if (!import.meta.client) return

    // Jika sudah initialized (dan ada accessToken), tidak perlu init ulang
    if (initialized.value && accessToken.value) return

    // BUG FIX: Jika ada initPromise yang sedang berjalan, tunggu promise itu
    // Sebelumnya: return initPromise → return value diabaikan oleh caller (void)
    // sehingga caller tidak benar-benar menunggu
    if (initPromise) {
      await initPromise
      return
    }

    initPromise = (async () => {
      loadFromStorage()

      // Tidak ada refresh token → user belum pernah login
      if (!refreshToken.value) {
        initialized.value = true
        return
      }

      const config = useRuntimeConfig()
      const apiBase = config.public.apiBase

      // Access token tidak ada di memory (page refresh), coba recover via refresh token
      const refreshed = await refreshSession(apiBase)
      if (!refreshed) {
        // Refresh token invalid/expired → paksa logout
        clearAuth()
        initialized.value = true
        return
      }

      const ok = await fetchMe(apiBase)
      if (!ok) {
        clearAuth()
        initialized.value = true
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
    logout,
  }
}, { persist: false })
