<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse, Order } from '~/types'

const api = useApi()
const toast = useToast()

const orders = ref<Order[]>([])
const meta = ref({ total: 0, page: 1, limit: 10, totalPages: 1 })
const loading = ref(false)
const selectedOrder = ref<Order | null>(null)
const showDetail = ref(false)

const ALL_STATUS = 'ALL'
const statusFilter = ref(ALL_STATUS)
const statusItems = [
  { label: 'Semua', value: ALL_STATUS },
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
    header: 'Aksi',
    cell: ({ row }: any) => {
      const UButton = resolveComponent('UButton')
      return h(UButton, { variant: 'ghost', class: 'dc-btn-outline', size: 'xs', onClick: () => viewDetail(row.original) }, () => 'Detail')
    },
  },
]

async function load(page = 1) {
  loading.value = true
  try {
    const params = new URLSearchParams({ page: String(page), limit: '10' })
    if (statusFilter.value !== ALL_STATUS) params.set('status', statusFilter.value)
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
    <div class="dc-page-card p-4 flex items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">Transaksi/Order</h2>
        <p class="text-sm text-[#6f809f]">Pantau transaksi pesanan laundry dari seluruh cabang.</p>
      </div>
      <USelect v-model="statusFilter" :items="statusItems" class="w-56 dc-input-like" />
    </div>

    <div class="dc-page-card p-4">
      <div class="mb-3 text-sm text-[#6f809f]">{{ meta.total }} pesanan</div>
      <UTable :data="orders" :columns="columns" :loading="loading" />
      <div v-if="meta.totalPages > 1" class="flex justify-center pt-4">
        <UPagination v-model:page="meta.page" :total="meta.total" :items-per-page="meta.limit" @update:page="load" />
      </div>
    </div>

    <UModal v-model:open="showDetail" title="Detail Pesanan" size="lg">
      <template #body>
        <div v-if="selectedOrder" class="space-y-4">
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p class="text-[#6f809f]">No. Pesanan</p>
              <p class="font-medium">{{ selectedOrder.orderNumber }}</p>
            </div>
            <div>
              <p class="text-[#6f809f]">Status</p>
              <UBadge :color="orderStatusColor[selectedOrder.status] as any" variant="soft" size="xs">{{ selectedOrder.status }}</UBadge>
            </div>
            <div>
              <p class="text-[#6f809f]">Outlet</p>
              <p class="font-medium">{{ selectedOrder.outlet?.name || '-' }}</p>
            </div>
            <div>
              <p class="text-[#6f809f]">Platform</p>
              <p class="font-medium">{{ selectedOrder.sourcePlatform }}</p>
            </div>
            <div>
              <p class="text-[#6f809f]">Tanggal</p>
              <p class="font-medium">{{ new Date(selectedOrder.orderDate).toLocaleString('id-ID') }}</p>
            </div>
            <div>
              <p class="text-[#6f809f]">Total</p>
              <p class="font-semibold text-[#19984d]">Rp {{ selectedOrder.totalAmount.toLocaleString('id-ID') }}</p>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
