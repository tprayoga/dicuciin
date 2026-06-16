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

async function logout() {
  const config = useRuntimeConfig()
  await authStore.logout(config.public.apiBase)
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen bg-[#f2f5fa] text-[#272526]">
    <header class="h-16 border-b border-[#d5deeb] bg-white px-5 flex items-center justify-between">
      <img src="/brand/logo_full_color_transparent.png" alt="Di.Cuciin" class="h-9 w-auto" />
      <div class="flex items-center gap-5">
        <UButton icon="i-heroicons-bell" variant="ghost" color="neutral" class="!text-[#272526]" />
        <ClientOnly>
          <div class="flex items-center gap-3">
            <div class="h-8 w-8 rounded-full bg-[#0349a8] text-white text-xs font-semibold flex items-center justify-center">
              {{ initials(authStore.user?.name) }}
            </div>
            <p class="text-sm font-medium">{{ authStore.user?.role === 'OWNER' ? 'Owner' : (authStore.user?.role || 'Owner') }}</p>
          </div>
          <template #fallback>
            <div class="flex items-center gap-3">
              <div class="h-8 w-8 rounded-full bg-[#0349a8] text-white text-xs font-semibold flex items-center justify-center">OW</div>
              <p class="text-sm font-medium">Owner</p>
            </div>
          </template>
        </ClientOnly>
      </div>
    </header>

    <div class="flex h-[calc(100vh-64px)]">
      <aside class="w-[230px] shrink-0 border-r border-[#d5deeb] bg-white p-4 flex flex-col">
        <nav class="space-y-2">
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

        <div class="mt-auto">
          <UButton
            icon="i-heroicons-arrow-left-on-rectangle"
            class="w-full justify-start rounded-xl !bg-[#dc2508] hover:!bg-[#bf1f07] text-white px-4 py-3"
            @click="logout"
          >
            Logout
          </UButton>
        </div>
      </aside>

      <main class="flex-1 overflow-y-auto p-5">
        <slot />
      </main>
    </div>
  </div>
</template>
