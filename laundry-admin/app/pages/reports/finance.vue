<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import type {
  Outlet,
  PaginatedResponse,
  FinanceSummaryResponse,
  FinanceSummaryPoint,
} from '~/types'

const api = useApi()
const toast = useToast()

const loading = ref(false)
const month = ref(new Date().toISOString().slice(0, 7))
const selectedOutlet = ref('ALL_OUTLETS')

const outlets = ref<Outlet[]>([])
const summary = ref<FinanceSummaryResponse>({
  month: month.value,
  outletId: null,
  totalRevenue: 0,
  operationalCost: 0,
  estimatedProfit: 0,
  totalPaidOrders: 0,
  dailySeries: [],
})

const outletOptions = computed(() => [
  { label: 'Semua Cabang', value: 'ALL_OUTLETS' },
  ...outlets.value.map(o => ({ label: o.name, value: o.id })),
])

const totalRevenue = computed(() => summary.value.totalRevenue)
const operationalCost = computed(() => summary.value.operationalCost)
const estimatedProfit = computed(() => summary.value.estimatedProfit)
const dailySeries = computed<FinanceSummaryPoint[]>(() => summary.value.dailySeries ?? [])

async function loadSummary() {
  const params = new URLSearchParams({ month: month.value })
  if (selectedOutlet.value !== 'ALL_OUTLETS') {
    params.set('outletId', selectedOutlet.value)
  }
  summary.value = await api.get<FinanceSummaryResponse>(`/orders/summary/finance?${params.toString()}`)
}

async function loadData() {
  loading.value = true
  try {
    const [outletRes] = await Promise.all([
      api.get<PaginatedResponse<Outlet>>('/outlets?page=1&limit=100'),
      loadSummary(),
    ])
    outlets.value = outletRes.data
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat laporan', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

function exportReport() {
  if (!import.meta.client) return

  const rows = [
    'Tanggal,Pendapatan,Laba Bersih',
    ...dailySeries.value.map(item => `${item.date},${item.revenue},${item.profit}`),
  ]

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `laporan-keuangan-${month.value}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(loadData)
watch([month, selectedOutlet], () => {
  loadSummary().catch((e: any) => {
    toast.add({ title: 'Gagal memuat laporan', description: e.message, color: 'error' })
  })
})
</script>

<template>
  <div class="space-y-4">
    <div class="dc-page-card p-4 flex items-center gap-3">
      <div class="h-10 w-10 rounded-xl bg-[#dce9f8] text-[#0f6ee9] flex items-center justify-center">
        <UIcon name="i-heroicons-chart-bar-square" class="text-xl" />
      </div>
      <div>
        <h2 class="text-lg font-semibold">Laporan Keuangan</h2>
        <p class="text-sm text-[#6f809f]">Menampilkan data laporan keuangan bulanan</p>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap gap-2">
        <UInput v-model="month" type="month" class="w-[180px] dc-input-like" />
        <USelect v-model="selectedOutlet" :items="outletOptions" class="w-[220px] dc-input-like" />
      </div>
      <UButton class="dc-btn-primary px-4 py-2" @click="exportReport">Export Laporan</UButton>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="dc-page-card p-4">
        <p class="text-xs font-semibold text-[#1a2237]">PENDAPATAN BULAN INI</p>
        <p class="text-[38px] font-bold text-[#19984d] mt-2">Rp {{ totalRevenue.toLocaleString('id-ID') }}</p>
        <p class="text-sm text-[#6f809f] mt-2">Dari semua pembayaran terkonfirmasi</p>
      </div>
      <div class="dc-page-card p-4">
        <p class="text-xs font-semibold text-[#1a2237]">BEBAN OPERASIONAL</p>
        <p class="text-[38px] font-bold text-[#da2d14] mt-2">Rp {{ operationalCost.toLocaleString('id-ID') }}</p>
        <p class="text-sm text-[#6f809f] mt-2">Estimasi beban operasional dari pendapatan berjalan</p>
      </div>
      <div class="dc-page-card p-4">
        <p class="text-xs font-semibold text-[#1a2237]">LABA BERSIH (ESTIMASI)</p>
        <p class="text-[38px] font-bold text-[#0f6ee9] mt-2">Rp {{ estimatedProfit.toLocaleString('id-ID') }}</p>
        <p class="text-sm text-[#6f809f] mt-2">Sudah dihitung setelah beban operasional</p>
      </div>
    </div>

    <div class="dc-page-card p-4">
      <div class="flex items-center justify-between gap-2 mb-3">
        <h3 class="text-[22px] font-semibold text-[#1a2237]">Omzet vs Laba 30 Hari</h3>
        <p class="text-sm text-[#6f809f]">Pendapatan = pembayaran terkonfirmasi, Laba = pendapatan - Beban Operasional</p>
      </div>

      <div v-if="loading" class="text-sm text-[#6f809f]">Memuat data grafik...</div>

      <div v-else-if="dailySeries.length === 0" class="text-sm text-[#6f809f]">Belum ada data transaksi untuk filter saat ini.</div>

      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[700px] text-sm">
          <thead>
            <tr class="bg-[#0b3a77] text-white text-left">
              <th class="px-3 py-2 font-semibold">Tanggal</th>
              <th class="px-3 py-2 font-semibold">Pendapatan</th>
              <th class="px-3 py-2 font-semibold">Laba Bersih</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in dailySeries" :key="item.date" :class="idx % 2 ? 'bg-[#f8fbff]' : 'bg-transparent'">
              <td class="px-3 py-2">{{ item.date }}</td>
              <td class="px-3 py-2">Rp {{ item.revenue.toLocaleString('id-ID') }}</td>
              <td class="px-3 py-2">Rp {{ item.profit.toLocaleString('id-ID') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
