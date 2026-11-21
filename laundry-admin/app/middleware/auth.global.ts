import { useAuthStore } from '~/stores/auth'

const GUEST_ONLY_ROUTES = new Set(['/login'])

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) {
    if (!GUEST_ONLY_ROUTES.has(to.path)) {
      return navigateTo('/login')
    }
    return
  }

  const authStore = useAuthStore()
  await authStore.initAuth()

  // Sesi pelanggan (mis. tersimpan dari sebelum login dibatasi) tidak boleh
  // memakai panel admin.
  if (authStore.isAuthenticated && authStore.user?.role === 'CUSTOMER') {
    authStore.clearAuth()
  }

  if (GUEST_ONLY_ROUTES.has(to.path)) {
    if (authStore.isAuthenticated) {
      return navigateTo('/dashboard')
    }
    return
  }

  if (!authStore.isAuthenticated) {
    return navigateTo('/login')
  }
})
