<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import type { StaffPerformance } from '~/types'

const api = useApi()
const toast = useToast()

const rows = ref<StaffPerformance[]>([])
const loading = ref(false)

function rupiah(n: number) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

async function load() {
  loading.value = true
  try {
    rows.value = await api.get<StaffPerformance[]>('/reports/staff')
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat kinerja staff', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="dc-page-card p-4 flex items-center gap-3">
      <div class="h-10 w-10 rounded-xl bg-[#dce9f8] text-[#0f6ee9] flex items-center justify-center">
        <UIcon name="i-heroicons-trophy" class="text-xl" />
      </div>
      <div>
        <h2 class="text-lg font-semibold">Kinerja Staff</h2>
        <p class="text-sm text-[#6f809f]">Penjualan & rating ulasan per staff (kiosk/kasir)</p>
      </div>
    </div>

    <div v-if="loading" class="text-sm text-[#6f809f]">Memuat data...</div>

    <div v-else-if="rows.length === 0" class="dc-page-card p-8 text-center text-sm text-[#6f809f]">
      Belum ada transaksi yang terhubung ke staff. Order yang dibuat staff di kiosk/kasir akan muncul di sini.
    </div>

    <div v-else class="dc-page-card overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-[#6f809f] border-b border-[#d7e0ee]">
            <th class="p-3 font-medium">Staff</th>
            <th class="p-3 font-medium">Peran</th>
            <th class="p-3 font-medium text-right">Order</th>
            <th class="p-3 font-medium text-right">Penjualan</th>
            <th class="p-3 font-medium text-right">Ulasan</th>
            <th class="p-3 font-medium text-right">Rating</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.staffId" class="border-b border-[#eef2f8] last:border-0">
            <td class="p-3 font-semibold text-[#111d35]">{{ r.name }}</td>
            <td class="p-3 text-[#6f809f]">{{ r.role || '—' }}</td>
            <td class="p-3 text-right">{{ r.totalOrders }}</td>
            <td class="p-3 text-right font-semibold text-[#111d35]">{{ rupiah(r.totalRevenue) }}</td>
            <td class="p-3 text-right">{{ r.reviewCount }}</td>
            <td class="p-3 text-right">
              <span class="text-[#FFB400]">★</span> {{ r.avgRating ? r.avgRating.toFixed(1) : '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
