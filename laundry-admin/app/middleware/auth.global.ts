import { useAuthStore } from '~/stores/auth'

const GUEST_ONLY_ROUTES = new Set(['/login'])

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  const authStore = useAuthStore()
  await authStore.initAuth()

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
