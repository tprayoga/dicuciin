<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const navItems = [
  { label: 'Dashboard', icon: 'i-heroicons-home', to: '/dashboard' },
  { label: 'Outlet', icon: 'i-heroicons-building-storefront', to: '/outlets' },
  { label: 'Pengguna', icon: 'i-heroicons-users', to: '/users' },
  { label: 'Pelanggan', icon: 'i-heroicons-user-group', to: '/customers' },
  { label: 'Pesanan', icon: 'i-heroicons-clipboard-document-list', to: '/orders' },
  { label: 'Layanan', icon: 'i-heroicons-wrench-screwdriver', to: '/services' },
  { label: 'Promo', icon: 'i-heroicons-tag', to: '/promos' },
  { label: 'Kiosk', icon: 'i-heroicons-computer-desktop', to: '/kiosks' },
  { label: 'IoT Devices', icon: 'i-heroicons-cpu-chip', to: '/iot' },
]

const sidebarOpen = ref(true)

function isActive(to: string) {
  return route.path === to || route.path.startsWith(to + '/')
}

async function logout() {
  authStore.clearAuth()
  router.push('/login')
}

onMounted(() => {
  authStore.loadFromStorage()
  if (!authStore.isAuthenticated) {
    router.push('/login')
  }
})
</script>

<template>
  <div class="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
    <!-- Sidebar -->
    <aside
      class="flex flex-col w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shrink-0"
    >
      <!-- Logo -->
      <div class="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-800">
        <div class="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
          <UIcon name="i-heroicons-sparkles" class="text-white text-lg" />
        </div>
        <span class="font-bold text-gray-900 dark:text-white text-base">Laundry Admin</span>
      </div>

      <!-- Nav -->
      <nav class="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="isActive(item.to)
            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'"
        >
          <UIcon :name="item.icon" class="text-lg shrink-0" />
          {{ item.label }}
        </NuxtLink>
      </nav>

      <!-- User info -->
      <div class="border-t border-gray-200 dark:border-gray-800 p-3">
        <div class="flex items-center gap-3 px-2 py-2">
          <UAvatar
            :alt="authStore.user?.name || 'User'"
            size="sm"
          />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
              {{ authStore.user?.name || 'User' }}
            </p>
            <p class="text-xs text-gray-500 truncate">{{ authStore.user?.role }}</p>
          </div>
          <UButton
            icon="i-heroicons-arrow-right-on-rectangle"
            variant="ghost"
            color="neutral"
            size="xs"
            @click="logout"
          />
        </div>
      </div>
    </aside>

    <!-- Main content -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Top bar -->
      <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
        <h1 class="text-base font-semibold text-gray-900 dark:text-white">
          {{ navItems.find(n => isActive(n.to))?.label || 'Dashboard' }}
        </h1>
        <div class="flex items-center gap-2">
          <UColorModeButton />
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 overflow-y-auto p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
