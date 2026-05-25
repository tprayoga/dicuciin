<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse, Order, Outlet } from '~/types'

const authStore = useAuthStore()
const api = useApi()

const stats = ref({
  totalOrders: 0,
  totalOutlets: 0,
  totalCustomers: 0,
  totalRevenue: 0,
})

const recentOrders = ref<Order[]>([])
const loading = ref(true)

const orderStatusColor: Record<string, string> = {
  DRAFT: 'neutral',
  WAITING_PAYMENT: 'warning',
  PAID: 'info',
  RECEIVED: 'info',
  WASHING: 'primary',
  DRYING: 'primary',
  IRONING: 'primary',
  PACKING: 'primary',
  READY_PICKUP: 'success',
  OUT_FOR_DELIVERY: 'success',
  COMPLETED: 'success',
  CANCELLED: 'error',
  REFUNDED: 'neutral',
}

async function loadDashboard() {
  loading.value = true
  try {
    const [ordersRes, outletsRes, customersRes] = await Promise.all([
      api.get<PaginatedResponse<Order>>('/orders?page=1&limit=5'),
      api.get<PaginatedResponse<Outlet>>('/outlets?page=1&limit=1'),
      api.get<PaginatedResponse<any>>('/customers?page=1&limit=1'),
    ])
    stats.value.totalOrders = ordersRes.meta.total
    stats.value.totalOutlets = outletsRes.meta.total
    stats.value.totalCustomers = customersRes.meta.total
    recentOrders.value = ordersRes.data
    stats.value.totalRevenue = ordersRes.data.reduce((sum, o) => sum + o.totalAmount, 0)
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const statCards = computed(() => [
  { label: 'Total Pesanan', value: stats.value.totalOrders, icon: 'i-heroicons-clipboard-document-list', color: 'text-blue-500' },
  { label: 'Total Outlet', value: stats.value.totalOutlets, icon: 'i-heroicons-building-storefront', color: 'text-green-500' },
  { label: 'Total Pelanggan', value: stats.value.totalCustomers, icon: 'i-heroicons-user-group', color: 'text-purple-500' },
  { label: 'Pendapatan (recent)', value: `Rp ${stats.value.totalRevenue.toLocaleString('id-ID')}`, icon: 'i-heroicons-banknotes', color: 'text-yellow-500' },
])

import { h, resolveComponent } from 'vue'

const columns = [
  { accessorKey: 'orderNumber', header: 'No. Pesanan' },
  {
    id: 'outlet',
    header: 'Outlet',
    cell: ({ row }: any) => row.original.outlet?.name || '-',
  },
  {
    id: 'totalAmount',
    header: 'Total',
    cell: ({ row }: any) => `Rp ${row.original.totalAmount.toLocaleString('id-ID')}`,
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }: any) => {
      const UBadge = resolveComponent('UBadge')
      const color = orderStatusColor[row.original.status] || 'neutral'
      return h(UBadge, { color, variant: 'soft', size: 'xs' }, () => row.original.status)
    },
  },
  {
    id: 'orderDate',
    header: 'Tanggal',
    cell: ({ row }: any) => new Date(row.original.orderDate).toLocaleDateString('id-ID'),
  },
]

onMounted(loadDashboard)
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Selamat datang, {{ authStore.user?.name }}</h2>
      <p class="text-sm text-gray-500 mt-1">Berikut ringkasan aktivitas laundry hari ini.</p>
    </div>

    <!-- Stat cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <UCard v-for="card in statCards" :key="card.label" class="flex items-center gap-4 p-4">
        <div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
          <UIcon :name="card.icon" :class="['text-xl', card.color]" />
        </div>
        <div>
          <p class="text-xs text-gray-500">{{ card.label }}</p>
          <p class="text-xl font-bold text-gray-900 dark:text-white">{{ card.value }}</p>
        </div>
      </UCard>
    </div>

    <!-- Recent orders -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-gray-900 dark:text-white">Pesanan Terbaru</h3>
          <UButton variant="ghost" size="xs" to="/orders">Lihat semua</UButton>
        </div>
      </template>

      <UTable :data="recentOrders" :columns="columns" :loading="loading" />
    </UCard>
  </div>
</template>
