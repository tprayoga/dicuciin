<script setup lang="ts">
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
const loading = ref(false)
const search = ref('')

const filteredCustomers = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return customers.value
  return customers.value.filter(c => `${c.memberCode} ${c.user?.name || ''} ${c.user?.phone || ''}`.toLowerCase().includes(keyword))
})

const totalBalance = computed(() => filteredCustomers.value.reduce((sum, c) => sum + (c.wallet?.balance || 0), 0))

async function load() {
  loading.value = true
  try {
    const res = await api.get<PaginatedResponse<CustomerItem>>('/customers?page=1&limit=100')
    customers.value = res.data
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat pelanggan', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="dc-page-card p-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 rounded-xl bg-[#dce9f8] text-[#0f6ee9] flex items-center justify-center">
          <UIcon name="i-heroicons-user-group" class="text-xl" />
        </div>
        <div>
          <h2 class="text-lg font-semibold">Kelola Member</h2>
          <p class="text-sm text-[#6f809f]">Kelola data pelanggan dan aktivitas member laundry Anda.</p>
        </div>
      </div>
      <UButton icon="i-heroicons-plus" class="dc-btn-primary px-4 py-2">Tambah Member</UButton>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <div class="dc-page-card p-4">
        <p class="text-xs font-semibold">TOTAL MEMBER</p>
        <p class="text-4xl font-bold mt-2">{{ filteredCustomers.length }}</p>
        <p class="text-sm text-[#6f809f] mt-2">Total seluruh member yang terdaftar di aplikasi</p>
      </div>
      <div class="dc-page-card p-4">
        <p class="text-xs font-semibold">MEMBER BARU BULAN INI</p>
        <p class="text-4xl font-bold mt-2">{{ filteredCustomers.length }}</p>
        <p class="text-sm text-[#6f809f] mt-2">Total jumlah member baru bulan ini</p>
      </div>
      <div class="dc-page-card p-4">
        <p class="text-xs font-semibold">MEMBER AKTIF</p>
        <p class="text-4xl font-bold mt-2">{{ filteredCustomers.length }}</p>
        <p class="text-sm text-[#6f809f] mt-2">Member yang aktif dalam 30 hari terakhir</p>
      </div>
      <div class="dc-page-card p-4">
        <p class="text-xs font-semibold">TOTAL SALDO MEMBER</p>
        <p class="text-4xl font-bold text-[#19984d] mt-2">Rp {{ totalBalance.toLocaleString('id-ID') }}</p>
        <p class="text-sm text-[#6f809f] mt-2">Total saldo seluruh member yang menggunakan aplikasi</p>
      </div>
    </div>

    <div class="flex flex-wrap gap-2 justify-between">
      <UInput v-model="search" icon="i-heroicons-magnifying-glass" placeholder="Cari nama / nomor telepon" class="w-full max-w-xl dc-input-like" />
      <USelect :items="[{ label: 'Semua member', value: 'all' }]" model-value="all" class="w-[180px] dc-input-like" />
    </div>

    <div class="dc-page-card p-4 overflow-x-auto">
      <table class="w-full min-w-[1000px] text-sm">
        <thead>
          <tr class="bg-[#0b3a77] text-white text-left">
            <th class="px-3 py-3 font-semibold">ID MEMBER</th>
            <th class="px-3 py-3 font-semibold">NAMA</th>
            <th class="px-3 py-3 font-semibold">NOMOR TELEPON</th>
            <th class="px-3 py-3 font-semibold">GENDER</th>
            <th class="px-3 py-3 font-semibold">TOTAL TRANSAKSI</th>
            <th class="px-3 py-3 font-semibold">TANGGAL DAFTAR</th>
            <th class="px-3 py-3 font-semibold">SALDO</th>
            <th class="px-3 py-3 font-semibold">STATUS</th>
            <th class="px-3 py-3 font-semibold">AKSI</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="9" class="px-3 py-4 text-[#6f809f]">Memuat data member...</td>
          </tr>
          <tr
            v-for="(item, idx) in filteredCustomers"
            :key="item.id"
            :class="idx % 2 ? 'bg-[#f8fbff]' : 'bg-transparent'"
          >
            <td class="px-3 py-3 font-medium">{{ item.memberCode }}</td>
            <td class="px-3 py-3">{{ item.user?.name || '-' }}</td>
            <td class="px-3 py-3">{{ item.user?.phone || '-' }}</td>
            <td class="px-3 py-3">L</td>
            <td class="px-3 py-3">-</td>
            <td class="px-3 py-3">{{ new Date(item.createdAt).toLocaleDateString('id-ID') }}</td>
            <td class="px-3 py-3">Rp {{ (item.wallet?.balance || 0).toLocaleString('id-ID') }}</td>
            <td class="px-3 py-3"><span class="dc-pill-success">Aktif</span></td>
            <td class="px-3 py-3">
              <UButton variant="ghost" class="dc-btn-outline" size="xs">Detail</UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
