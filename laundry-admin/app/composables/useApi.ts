import { useAuthStore } from '~/stores/auth'

export function useApi() {
  const config = useRuntimeConfig()
  const authStore = useAuthStore()
  const router = useRouter()

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = authStore.accessToken
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${config.public.apiBase}${path}`, {
      ...options,
      headers,
    })

    if (res.status === 401) {
      const refreshed = await tryRefresh()
      if (refreshed) return request<T>(path, options)
      authStore.clearAuth()
      router.push('/login')
      throw new Error('Unauthorized')
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Request failed' }))
      throw new Error(err.message || 'Request failed')
    }

    if (res.status === 204) return undefined as T
    return res.json()
  }

  async function tryRefresh(): Promise<boolean> {
    const rt = authStore.refreshToken
    if (!rt) return false
    try {
      const res = await fetch(`${config.public.apiBase}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      })
      if (!res.ok) return false
      const data = await res.json()
      authStore.accessToken = data.accessToken
      authStore.refreshToken = data.refreshToken
      if (import.meta.client) {
        localStorage.setItem('accessToken', data.accessToken)
        localStorage.setItem('refreshToken', data.refreshToken)
      }
      return true
    } catch {
      return false
    }
  }

  const get = <T>(path: string) => request<T>(path, { method: 'GET' })
  const post = <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) })
  const patch = <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
  const del = <T>(path: string) => request<T>(path, { method: 'DELETE' })

  return { get, post, patch, del, request }
}
