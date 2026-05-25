<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse, Order, Outlet } from '~/types'

const api = useApi()
const toast = useToast()

const orders = ref<Order[]>([])
const meta = ref({ total: 0, page: 1, limit: 10, totalPages: 1 })
const loading = ref(false)
const selectedOrder = ref<Order | null>(null)
const showDetail = ref(false)

const statusFilter = ref('')
const statusItems = [
  { label: 'Semua', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Menunggu Pembayaran', value: 'WAITING_PAYMENT' },
  { label: 'Dibayar', value: 'PAID' },
  { label: 'Diterima', value: 'RECEIVED' },
  { label: 'Dicuci', value: 'WASHING' },
  { label: 'Dikeringkan', value: 'DRYING' },
  { label: 'Disetrika', value: 'IRONING' },
  { label: 'Dikemas', value: 'PACKING' },
  { label: 'Siap Diambil', value: 'READY_PICKUP' },
  { label: 'Dalam Pengiriman', value: 'OUT_FOR_DELIVERY' },
  { label: 'Selesai', value: 'COMPLETED' },
  { label: 'Dibatalkan', value: 'CANCELLED' },
  { label: 'Dikembalikan', value: 'REFUNDED' },
]

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

const columns = [
  { accessorKey: 'orderNumber', header: 'No. Pesanan' },
  { id: 'outlet', header: 'Outlet', cell: ({ row }: any) => row.original.outlet?.name || '-' },
  { accessorKey: 'sourcePlatform', header: 'Platform' },
  { id: 'totalAmount', header: 'Total', cell: ({ row }: any) => `Rp ${row.original.totalAmount.toLocaleString('id-ID')}` },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }: any) => {
      const UBadge = resolveComponent('UBadge')
      const color = orderStatusColor[row.original.status] || 'neutral'
      return h(UBadge, { color, variant: 'soft', size: 'xs' }, () => row.original.status)
    },
  },
  { id: 'orderDate', header: 'Tanggal', cell: ({ row }: any) => new Date(row.original.orderDate).toLocaleDateString('id-ID') },
  {
    id: 'actions',
    header: '',
    cell: ({ row }: any) => {
      const UButton = resolveComponent('UButton')
      return h(UButton, { icon: 'i-heroicons-eye', variant: 'ghost', size: 'xs', onClick: () => viewDetail(row.original) })
    },
  },
]

async function load(page = 1) {
  loading.value = true
  try {
    const params = new URLSearchParams({ page: String(page), limit: '10' })
    if (statusFilter.value) params.set('status', statusFilter.value)
    const res = await api.get<PaginatedResponse<Order>>(`/orders?${params}`)
    orders.value = res.data
    meta.value = res.meta
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat pesanan', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

function viewDetail(order: Order) {
  selectedOrder.value = order
  showDetail.value = true
}

watch(statusFilter, () => load(1))
onMounted(() => load())
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <p class="text-sm text-gray-500">{{ meta.total }} pesanan</p>
      <USelect
        v-model="statusFilter"
        :items="statusItems"
        placeholder="Filter status"
        class="w-48"
      />
    </div>

    <UCard>
      <UTable :data="orders" :columns="columns" :loading="loading" />

      <div v-if="meta.totalPages > 1" class="flex justify-center pt-4">
        <UPagination v-model:page="meta.page" :total="meta.total" :items-per-page="meta.limit" @update:page="load" />
      </div>
    </UCard>

    <!-- Order Detail Modal -->
    <UModal v-model:open="showDetail" title="Detail Pesanan" size="lg">
      <template #body>
        <div v-if="selectedOrder" class="space-y-4">
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p class="text-gray-500">No. Pesanan</p>
              <p class="font-medium">{{ selectedOrder.orderNumber }}</p>
            </div>
            <div>
              <p class="text-gray-500">Status</p>
              <UBadge :color="orderStatusColor[selectedOrder.status] as any" variant="soft" size="xs">
                {{ selectedOrder.status }}
              </UBadge>
            </div>
            <div>
              <p class="text-gray-500">Outlet</p>
              <p class="font-medium">{{ selectedOrder.outlet?.name || '-' }}</p>
            </div>
            <div>
              <p class="text-gray-500">Platform</p>
              <p class="font-medium">{{ selectedOrder.sourcePlatform }}</p>
            </div>
            <div>
              <p class="text-gray-500">Tanggal</p>
              <p class="font-medium">{{ new Date(selectedOrder.orderDate).toLocaleString('id-ID') }}</p>
            </div>
            <div>
              <p class="text-gray-500">Total</p>
              <p class="font-semibold text-primary-600">Rp {{ selectedOrder.totalAmount.toLocaleString('id-ID') }}</p>
            </div>
          </div>

          <div v-if="selectedOrder.items?.length">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Item Pesanan</p>
            <div class="space-y-2">
              <div
                v-for="item in selectedOrder.items"
                :key="item.id"
                class="flex justify-between text-sm bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"
              >
                <span>{{ item.serviceName }} × {{ item.quantity }} {{ item.unit }}</span>
                <span class="font-medium">Rp {{ item.subtotal.toLocaleString('id-ID') }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
