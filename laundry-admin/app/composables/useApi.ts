import { useAuthStore } from '~/stores/auth'

/**
 * Backend sekarang membungkus semua response dalam:
 * { success: true, data: T, meta?: {...}, timestamp: string }
 *
 * useApi secara otomatis unwrap .data sehingga caller tetap
 * mendapat T langsung, kecuali untuk paginated response yang
 * tetap mengembalikan { data: T[], meta: {...} }.
 */
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
      throw new Error('Sesi habis, silakan login kembali')
    }

    if (res.status === 204) return undefined as T

    const body = await res.json().catch(() => null)

    if (!res.ok) {
      // Error response: { success: false, message, error }
      const message =
        (body?.message && (Array.isArray(body.message) ? body.message.join(', ') : body.message)) ||
        'Request gagal'
      throw new Error(message)
    }

    // Unwrap envelope { success, data, meta?, timestamp }
    if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
      // Paginated: kembalikan { data, meta } agar pages bisa akses res.data & res.meta
      if ('meta' in body) {
        return { data: body.data, meta: body.meta } as T
      }
      return body.data as T
    }

    // Fallback: response tanpa envelope (backward compat)
    return body as T
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
      const body = await res.json()
      // Handle wrapped response
      const data = body?.data ?? body
      authStore.accessToken = data.accessToken
      authStore.refreshToken = data.refreshToken
      if (import.meta.client) {
        // Hanya simpan refresh token — access token di memory
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
  const put = <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) })
  const del = <T>(path: string) => request<T>(path, { method: 'DELETE' })

  return { get, post, patch, put, del, request }
}
