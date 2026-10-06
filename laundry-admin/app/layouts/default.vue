<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const navItems = [
  { label: 'Dashboard', icon: 'i-heroicons-squares-2x2', to: '/dashboard' },
  { label: 'Kelola Outlet', icon: 'i-heroicons-building-storefront', to: '/outlets' },
  { label: 'Kelola Mesin', icon: 'i-heroicons-computer-desktop', to: '/iot' },
  { label: 'Kelola Layanan', icon: 'i-heroicons-wrench-screwdriver', to: '/services' },
  { label: 'Kelola Staff', icon: 'i-heroicons-users', to: '/users' },
  { label: 'Kelola Member', icon: 'i-heroicons-user-group', to: '/customers' },
  { label: 'Transaksi/Order', icon: 'i-heroicons-credit-card', to: '/orders' },
  { label: 'Laporan Keuangan', icon: 'i-heroicons-chart-bar-square', to: '/reports/finance' },
  { label: 'Promo & Banner', icon: 'i-heroicons-megaphone', to: '/marketing' },
  { label: 'Promotion & Loyalty', icon: 'i-heroicons-gift', to: '/promotion-loyalty' },
  { label: 'Ulasan & Feedback', icon: 'i-heroicons-star', to: '/reviews' },
  { label: 'Kinerja Staff', icon: 'i-heroicons-trophy', to: '/staff-performance' },
]

function isActive(to: string) {
  if (to === '/dashboard') return route.path === '/dashboard'
  return route.path === to || route.path.startsWith(to + '/')
}

function initials(name: string | undefined) {
  if (!name) return 'OW'
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

// Sidebar jadi drawer di layar < lg; tutup otomatis saat pindah halaman.
const sidebarOpen = ref(false)
watch(() => route.fullPath, () => { sidebarOpen.value = false })

async function logout() {
  const config = useRuntimeConfig()
  await authStore.logout(config.public.apiBase)
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen bg-[#f2f5fa] text-[#272526]">
    <header class="h-16 border-b border-[#d5deeb] bg-white px-3 sm:px-5 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2 min-w-0">
        <UButton
          icon="i-heroicons-bars-3"
          variant="ghost"
          color="neutral"
          class="lg:hidden !text-[#272526]"
          aria-label="Buka menu"
          @click="sidebarOpen = true"
        />
        <img src="/brand/logo_full_color_transparent.png" alt="Di.Cuciin" class="h-8 sm:h-9 w-auto" />
      </div>
      <div class="flex items-center gap-2 sm:gap-5">
        <UButton icon="i-heroicons-bell" variant="ghost" color="neutral" class="!text-[#272526]" />
        <ClientOnly>
          <div class="flex items-center gap-3">
            <div class="h-8 w-8 rounded-full bg-[#0349a8] text-white text-xs font-semibold flex items-center justify-center">
              {{ initials(authStore.user?.name) }}
            </div>
            <p class="hidden sm:block text-sm font-medium">{{ authStore.user?.role === 'OWNER' ? 'Owner' : (authStore.user?.role || 'Owner') }}</p>
          </div>
          <template #fallback>
            <div class="flex items-center gap-3">
              <div class="h-8 w-8 rounded-full bg-[#0349a8] text-white text-xs font-semibold flex items-center justify-center">OW</div>
              <p class="hidden sm:block text-sm font-medium">Owner</p>
            </div>
          </template>
        </ClientOnly>
      </div>
    </header>

    <div class="flex h-[calc(100dvh-64px)]">
      <Transition
        enter-active-class="transition-opacity duration-200"
        leave-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <div v-if="sidebarOpen" class="fixed inset-0 z-40 bg-black/40 lg:hidden" @click="sidebarOpen = false" />
      </Transition>

      <aside
        class="fixed inset-y-0 left-0 z-50 w-[260px] max-w-[85vw] border-r border-[#d5deeb] bg-white p-4 flex flex-col transition-transform duration-200 lg:static lg:z-auto lg:w-[230px] lg:translate-x-0 lg:shrink-0"
        :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
      >
        <div class="flex items-center justify-between mb-4 lg:hidden">
          <img src="/brand/logo_full_color_transparent.png" alt="Di.Cuciin" class="h-8 w-auto" />
          <UButton icon="i-heroicons-x-mark" variant="ghost" color="neutral" aria-label="Tutup menu" @click="sidebarOpen = false" />
        </div>
        <nav class="space-y-2 overflow-y-auto">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to + item.label"
            :to="item.to"
            class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
            :class="isActive(item.to) ? 'text-[#0360da] bg-[#edf4ff]' : 'text-[#5f7294] hover:bg-[#f2f6fc]'"
          >
            <UIcon :name="item.icon" class="text-[20px]" />
            <span>{{ item.label }}</span>
          </NuxtLink>
        </nav>

        <div class="mt-auto pt-4">
          <UButton
            icon="i-heroicons-arrow-left-on-rectangle"
            class="w-full justify-start rounded-xl !bg-[#dc2508] hover:!bg-[#bf1f07] text-white px-4 py-3"
            @click="logout"
          >
            Logout
          </UButton>
        </div>
      </aside>

      <main class="flex-1 min-w-0 overflow-y-auto p-3 sm:p-5">
        <slot />
      </main>
    </div>
  </div>
</template>
