<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import type { Order, DashboardSummaryResponse, FinanceSummaryPoint } from '~/types'

const api = useApi()
const toast = useToast()
const CHART_WIDTH = 1100
const CHART_HEIGHT = 300
const CHART_PADDING = { top: 18, right: 20, bottom: 42, left: 64 }
const Y_TICK_COUNT = 5

const stats = ref({
  totalMachines: 0,
  totalOutlets: 0,
  totalStaff: 0,
  totalRevenue: 0,
})

const recentOrders = ref<Order[]>([])
const dailySeries = ref<FinanceSummaryPoint[]>([])
const loading = ref(true)
const hoveredIndex = ref<number | null>(null)

async function loadDashboard() {
  loading.value = true
  try {
    const summary = await api.get<DashboardSummaryResponse>('/orders/summary/dashboard')
    stats.value.totalMachines = summary.totalMachines
    stats.value.totalOutlets = summary.totalOutlets
    stats.value.totalStaff = summary.totalStaff
    stats.value.totalRevenue = summary.totalRevenueToday
    recentOrders.value = summary.recentOrders
    dailySeries.value = summary.dailySeries || []
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat dashboard', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

const chartPoints = computed(() => {
  const items = dailySeries.value
  if (!items.length) return []

  const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
  const rawMax = Math.max(
    ...items.map(item => Math.max(item.revenue, item.profit)),
    1,
  )
  const magnitude = 10 ** Math.floor(Math.log10(rawMax))
  const niceMax = Math.ceil(rawMax / magnitude) * magnitude

  return items.map((item, index) => {
    const x = CHART_PADDING.left + (items.length === 1 ? plotWidth / 2 : (index * plotWidth) / (items.length - 1))
    const yRevenue = CHART_PADDING.top + (1 - item.revenue / niceMax) * plotHeight
    const yProfit = CHART_PADDING.top + (1 - item.profit / niceMax) * plotHeight
    return { ...item, x, yRevenue, yProfit }
  })
})

function buildLinePath(key: 'yRevenue' | 'yProfit') {
  const points = chartPoints.value
  if (!points.length) return ''
  return points
    .map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${point.x} ${point[key]}`)
    .join(' ')
}

function buildAreaPath(key: 'yRevenue' | 'yProfit') {
  const points = chartPoints.value
  if (!points.length) return ''
  const bottomY = CHART_HEIGHT - CHART_PADDING.bottom
  return [
    `M ${points[0].x} ${bottomY}`,
    ...points.map(point => `L ${point.x} ${point[key]}`),
    `L ${points[points.length - 1].x} ${bottomY}`,
    'Z',
  ].join(' ')
}

const revenuePath = computed(() => buildLinePath('yRevenue'))
const profitPath = computed(() => buildLinePath('yProfit'))
const revenueAreaPath = computed(() => buildAreaPath('yRevenue'))
const profitAreaPath = computed(() => buildAreaPath('yProfit'))

const maxChartValue = computed(() => {
  const maxValue = Math.max(
    ...dailySeries.value.map(item => Math.max(item.revenue, item.profit)),
    1,
  )
  const magnitude = 10 ** Math.floor(Math.log10(maxValue))
  return Math.ceil(maxValue / magnitude) * magnitude
})

const chartXTicks = computed(() => {
  const points = chartPoints.value
  if (!points.length) return []
  const step = Math.max(1, Math.floor(points.length / 6))
  return points.filter((_, index) => index % step === 0 || index === points.length - 1)
})

const chartYTicks = computed(() => {
  const ticks = []
  for (let i = 0; i <= Y_TICK_COUNT; i += 1) {
    const ratio = i / Y_TICK_COUNT
    const y = CHART_PADDING.top + (1 - ratio) * (CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom)
    const value = Math.round(maxChartValue.value * ratio)
    ticks.push({ y, value })
  }
  return ticks
})

function formatMoneyShort(value: number) {
  if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1).replace('.0', '')}jt`
  if (value >= 1_000) return `Rp ${(value / 1_000).toFixed(0)}rb`
  return `Rp ${value}`
}

function formatDateLabel(date: string) {
  return new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}

const hoveredPoint = computed(() => {
  if (hoveredIndex.value == null) return null
  return chartPoints.value[hoveredIndex.value] ?? null
})

const summaryCards = computed(() => [
  {
    icon: 'i-heroicons-currency-dollar',
    title: 'PENDAPATAN HARI INI',
    value: `Rp ${stats.value.totalRevenue.toLocaleString('id-ID')}`,
    caption: 'Dari semua pembayaran terkonfirmasi',
    valueClass: 'text-[#19984d]',
  },
  {
    icon: 'i-heroicons-building-storefront',
    title: 'JUMLAH OUTLET/CABANG',
    value: `${stats.value.totalOutlets} Cabang`,
    caption: 'Total jumlah outlet/cabang yang sudah anda buat',
    valueClass: 'text-[#1a2237]',
  },
  {
    icon: 'i-heroicons-computer-desktop',
    title: 'JUMLAH MESIN',
    value: `${stats.value.totalMachines} Mesin`,
    caption: 'Total jumlah mesin cuci (washer) dan mesin pengering (Dryer)',
    valueClass: 'text-[#1a2237]',
  },
  {
    icon: 'i-heroicons-users',
    title: 'JUMLAH STAFF',
    value: `${stats.value.totalStaff} Orang`,
    caption: 'Total jumlah staff di beberapa outlet/cabang laundry',
    valueClass: 'text-[#1a2237]',
  },
])

onMounted(loadDashboard)
</script>

<template>
  <div class="space-y-5">
    <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
      <div v-for="card in summaryCards" :key="card.title" class="dc-page-card p-4">
        <div class="flex items-center gap-3 mb-2">
          <div class="h-8 w-8 rounded-xl bg-[#dce9f8] text-[#0f6ee9] flex items-center justify-center">
            <UIcon :name="card.icon" class="text-base" />
          </div>
          <p class="text-xs font-semibold text-[#1a2237]">{{ card.title }}</p>
        </div>
        <p class="text-[38px] font-bold" :class="card.valueClass">{{ card.value }}</p>
        <p class="text-xs text-[#6f809f] mt-2">{{ card.caption }}</p>
      </div>
    </div>

    <div class="dc-page-card p-4">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 class="text-[22px] font-semibold text-[#1a2237]">Omzet vs Laba 30 Hari</h3>
        <p class="text-sm text-[#6f809f]">Pendapatan = pembayaran terkonfirmasi, Laba = pendapatan - Beban Operasional</p>
      </div>
      <div v-if="loading" class="h-[260px] rounded-xl border border-[#d7e0ee] flex items-center justify-center text-sm text-[#6f809f]">
        Memuat grafik...
      </div>
      <div v-else-if="chartPoints.length === 0" class="h-[260px] rounded-xl border border-[#d7e0ee] flex items-center justify-center text-sm text-[#6f809f]">
        Belum ada data 30 hari terakhir.
      </div>
      <div v-else class="space-y-2">
        <div class="flex items-center gap-4 text-xs font-medium text-[#4f607f]">
          <div class="flex items-center gap-2">
            <span class="h-2.5 w-2.5 rounded-full bg-[#3ea8ff]" />
            <span>Pendapatan</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="h-2.5 w-2.5 rounded-full bg-[#ff6f8d]" />
            <span>Laba Bersih</span>
          </div>
        </div>

        <div class="relative h-[300px] rounded-xl border border-[#d7e0ee] bg-white overflow-hidden">
          <svg :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`" class="h-full w-full">
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#3ea8ff" stop-opacity="0.22" />
                <stop offset="100%" stop-color="#3ea8ff" stop-opacity="0" />
              </linearGradient>
              <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ff6f8d" stop-opacity="0.2" />
                <stop offset="100%" stop-color="#ff6f8d" stop-opacity="0" />
              </linearGradient>
            </defs>

            <line
              v-for="tick in chartYTicks"
              :key="`h-grid-${tick.value}`"
              :x1="CHART_PADDING.left"
              :x2="CHART_WIDTH - CHART_PADDING.right"
              :y1="tick.y"
              :y2="tick.y"
              stroke="#edf2fb"
              stroke-width="1"
            />

            <text
              v-for="tick in chartYTicks"
              :key="`y-label-${tick.value}`"
              :x="CHART_PADDING.left - 10"
              :y="tick.y + 4"
              text-anchor="end"
              font-size="10"
              fill="#7f90af"
            >
              {{ formatMoneyShort(tick.value) }}
            </text>

            <path :d="revenueAreaPath" fill="url(#revenueGradient)" />
            <path :d="profitAreaPath" fill="url(#profitGradient)" />
            <path :d="revenuePath" fill="none" stroke="#3ea8ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            <path :d="profitPath" fill="none" stroke="#ff6f8d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

            <line
              v-if="hoveredPoint"
              :x1="hoveredPoint.x"
              :x2="hoveredPoint.x"
              :y1="CHART_PADDING.top"
              :y2="CHART_HEIGHT - CHART_PADDING.bottom"
              stroke="#a6b4ce"
              stroke-dasharray="4 4"
            />

            <circle
              v-for="point in chartPoints"
              :key="`rev-${point.date}`"
              :cx="point.x"
              :cy="point.yRevenue"
              :r="hoveredPoint?.date === point.date ? 4.5 : 2.8"
              fill="#3ea8ff"
              stroke="#ffffff"
              stroke-width="1.5"
            />
            <circle
              v-for="point in chartPoints"
              :key="`prof-${point.date}`"
              :cx="point.x"
              :cy="point.yProfit"
              :r="hoveredPoint?.date === point.date ? 4.5 : 2.8"
              fill="#ff6f8d"
              stroke="#ffffff"
              stroke-width="1.5"
            />

            <g>
              <text
                v-for="point in chartXTicks"
                :key="`tick-${point.date}`"
                :x="point.x"
                :y="CHART_HEIGHT - 12"
                text-anchor="middle"
                font-size="10"
                fill="#7f90af"
              >
                {{ formatDateLabel(point.date) }}
              </text>
            </g>

            <rect
              v-for="(point, index) in chartPoints"
              :key="`hit-${point.date}`"
              :x="index === 0 ? CHART_PADDING.left : (chartPoints[index - 1].x + point.x) / 2"
              :width="index === chartPoints.length - 1 ? CHART_WIDTH - CHART_PADDING.right - (index === 0 ? CHART_PADDING.left : (chartPoints[index - 1].x + point.x) / 2) : (chartPoints[index + 1].x - point.x) / 2 + (point.x - (index === 0 ? CHART_PADDING.left : (chartPoints[index - 1].x + point.x) / 2))"
              :y="CHART_PADDING.top"
              :height="CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom"
              fill="transparent"
              @mouseenter="hoveredIndex = index"
              @mouseleave="hoveredIndex = null"
            />
          </svg>

          <div
            v-if="hoveredPoint"
            class="absolute z-10 min-w-[170px] rounded-lg border border-[#dbe5f4] bg-white/95 shadow-sm px-3 py-2 pointer-events-none"
            :style="{
              left: `clamp(8px, calc(${(hoveredPoint.x / CHART_WIDTH) * 100}% - 85px), calc(100% - 178px))`,
              top: `${Math.max(8, (Math.min(hoveredPoint.yRevenue, hoveredPoint.yProfit) / CHART_HEIGHT) * 100 - 18)}%`,
            }"
          >
            <p class="text-[11px] text-[#6f809f] mb-1">{{ new Date(hoveredPoint.date).toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) }}</p>
            <p class="text-xs text-[#2b3a55]">Pendapatan: <span class="font-semibold text-[#1783db]">Rp {{ hoveredPoint.revenue.toLocaleString('id-ID') }}</span></p>
            <p class="text-xs text-[#2b3a55]">Laba: <span class="font-semibold text-[#d94f73]">Rp {{ hoveredPoint.profit.toLocaleString('id-ID') }}</span></p>
          </div>
        </div>
      </div>
    </div>

    <div class="dc-page-card p-4">
      <h3 class="text-[22px] font-semibold text-[#1a2237] mb-4">Riwayat Transaksi hari ini</h3>

      <div v-if="loading" class="text-sm text-[#6f809f]">Memuat data...</div>

      <div v-else-if="recentOrders.length === 0" class="text-sm text-[#6f809f]">Belum ada transaksi terbaru.</div>

      <div v-else class="space-y-0">
        <div
          v-for="order in recentOrders"
          :key="order.id"
          class="grid grid-cols-1 xl:grid-cols-12 gap-2 py-3 border-t border-[#d7e0ee] first:border-t-0"
        >
          <div class="xl:col-span-3">
            <p class="text-lg font-semibold text-[#1a2237]">Order #{{ order.orderNumber }}</p>
            <p class="text-sm text-[#4f607f]">{{ order.items?.[0]?.serviceName || '-' }}</p>
          </div>
          <div class="xl:col-span-3">
            <p class="text-base font-semibold text-[#1a2237]">{{ order.items?.[0]?.serviceName || '-' }}</p>
            <p class="text-sm text-[#4f607f]">{{ new Date(order.orderDate).toLocaleString('id-ID') }}</p>
          </div>
          <div class="xl:col-span-4">
            <p class="text-base font-semibold text-[#1a2237]">Outlet {{ order.outlet?.name || '-' }}</p>
            <p class="text-sm text-[#4f607f]">{{ order.status }}</p>
          </div>
          <div class="xl:col-span-2 text-right">
            <p class="text-lg font-semibold text-[#19984d]">Rp {{ order.totalAmount.toLocaleString('id-ID') }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
