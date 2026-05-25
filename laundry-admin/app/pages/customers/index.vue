<script setup lang="ts">
import { h } from 'vue'
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse } from '~/types'

const api = useApi()
const toast = useToast()

interface CustomerItem {
  id: string
  memberCode: string
  createdAt: string
  user?: { name: string; email: string; phone: string }
  wallet?: { balance: number }
}

const customers = ref<CustomerItem[]>([])
const meta = ref({ total: 0, page: 1, limit: 10, totalPages: 1 })
const loading = ref(false)

const columns = [
  { accessorKey: 'memberCode', header: 'Kode Member' },
  { id: 'name', header: 'Nama', cell: ({ row }: any) => row.original.user?.name || '-' },
  { id: 'email', header: 'Email', cell: ({ row }: any) => row.original.user?.email || '-' },
  { id: 'phone', header: 'Telepon', cell: ({ row }: any) => row.original.user?.phone || '-' },
  {
    id: 'walletBalance',
    header: 'Saldo Wallet',
    cell: ({ row }: any) => {
      const balance = row.original.wallet?.balance ?? 0
      return h('span', { class: 'font-medium text-green-600' }, `Rp ${balance.toLocaleString('id-ID')}`)
    },
  },
  { id: 'createdAt', header: 'Bergabung', cell: ({ row }: any) => new Date(row.original.createdAt).toLocaleDateString('id-ID') },
]

async function load(page = 1) {
  loading.value = true
  try {
    const res = await api.get<PaginatedResponse<CustomerItem>>(`/customers?page=${page}&limit=10`)
    customers.value = res.data
    meta.value = res.meta
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat pelanggan', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

onMounted(() => load())
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-gray-500">{{ meta.total }} pelanggan terdaftar</p>

    <UCard>
      <UTable :data="customers" :columns="columns" :loading="loading" />

      <div v-if="meta.totalPages > 1" class="flex justify-center pt-4">
        <UPagination v-model:page="meta.page" :total="meta.total" :items-per-page="meta.limit" @update:page="load" />
      </div>
    </UCard>
  </div>
</template>
