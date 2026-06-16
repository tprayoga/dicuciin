<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse, Review, ReviewStats } from '~/types'

const api = useApi()
const toast = useToast()

const reviews = ref<Review[]>([])
const stats = ref<ReviewStats | null>(null)
const loading = ref(false)
const ratingFilter = ref<number | 0>(0)
const focusedOnly = ref(false)

const ratingItems = [
  { label: 'Semua rating', value: 0 },
  { label: '5 bintang', value: 5 },
  { label: '4 bintang', value: 4 },
  { label: '3 bintang', value: 3 },
  { label: '2 bintang', value: 2 },
  { label: '1 bintang', value: 1 },
]

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function customerName(r: Review) {
  return r.customer?.user?.name || 'Pelanggan'
}

async function load() {
  loading.value = true
  try {
    const params = new URLSearchParams({ page: '1', limit: '100' })
    if (ratingFilter.value) params.set('rating', String(ratingFilter.value))
    if (focusedOnly.value) params.set('isFocused', 'true')
    const [list, st] = await Promise.all([
      api.get<PaginatedResponse<Review>>(`/reviews?${params.toString()}`),
      api.get<ReviewStats>('/reviews/stats'),
    ])
    reviews.value = list.data
    stats.value = st
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat ulasan', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

async function toggleFocus(r: Review) {
  try {
    await api.patch(`/reviews/${r.id}/focus`, { isFocused: !r.isFocused })
    r.isFocused = !r.isFocused
    toast.add({ title: r.isFocused ? 'Ditandai sebagai fokus' : 'Dilepas dari fokus', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Gagal memperbarui', description: e.message, color: 'error' })
  }
}

watch([ratingFilter, focusedOnly], load)
onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="dc-page-card p-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 rounded-xl bg-[#dce9f8] text-[#0360da] flex items-center justify-center">
          <UIcon name="i-heroicons-star" class="text-xl" />
        </div>
        <div>
          <h2 class="text-lg font-semibold">Ulasan & Feedback</h2>
          <p class="text-sm text-[#6f809f]">Kelola ulasan pelanggan & tandai yang ingin difokuskan</p>
        </div>
      </div>
    </div>

    <div v-if="stats" class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="dc-page-card p-4">
        <p class="text-sm text-[#6f809f]">Rata-rata</p>
        <p class="text-2xl font-semibold text-[#111d35]">{{ stats.average.toFixed(1) }} <span class="text-[#FFB400]">★</span></p>
      </div>
      <div class="dc-page-card p-4">
        <p class="text-sm text-[#6f809f]">Total Ulasan</p>
        <p class="text-2xl font-semibold text-[#111d35]">{{ stats.total }}</p>
      </div>
      <div class="dc-page-card p-4 col-span-2">
        <p class="text-sm text-[#6f809f] mb-1">Distribusi</p>
        <div class="flex items-end gap-2">
          <div v-for="n in [5,4,3,2,1]" :key="n" class="flex-1 text-center">
            <div class="text-xs text-[#6f809f]">{{ stats.distribution[n] || 0 }}</div>
            <div class="bg-[#dce9f8] rounded" :style="{ height: `${8 + (stats.distribution[n] || 0) * 6}px` }" />
            <div class="text-xs text-[#6f809f] mt-1">{{ n }}★</div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-3 flex-wrap">
      <USelect v-model="ratingFilter" :items="ratingItems" class="w-40 dc-input-like" />
      <UButton
        :variant="focusedOnly ? 'solid' : 'outline'"
        :class="focusedOnly ? 'dc-btn-primary' : 'dc-btn-outline'"
        icon="i-heroicons-star"
        size="sm"
        @click="focusedOnly = !focusedOnly"
      >
        Hanya yang difokuskan
      </UButton>
    </div>

    <div v-if="loading" class="text-sm text-[#6f809f]">Memuat ulasan...</div>

    <div v-else-if="reviews.length === 0" class="dc-page-card p-8 text-center text-sm text-[#6f809f]">
      Belum ada ulasan sesuai filter.
    </div>

    <div v-else class="space-y-3">
      <div v-for="r in reviews" :key="r.id" class="dc-page-card p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-[#FFB400]">{{ '★'.repeat(r.rating) }}<span class="text-[#d7e0ee]">{{ '★'.repeat(5 - r.rating) }}</span></span>
              <span class="dc-pill" :class="r.source === 'KIOSK' ? 'bg-[#fde8d6] text-[#b5701a]' : 'bg-[#dce9f8] text-[#0360da]'">{{ r.source }}</span>
            </div>
            <p class="text-sm text-[#111d35] mt-2">{{ r.comment || '(Tanpa komentar)' }}</p>
            <p class="text-xs text-[#6f809f] mt-2">
              {{ customerName(r) }}
              <span v-if="r.order"> · {{ r.order.orderNumber }}</span>
              <span v-if="r.staff"> · Staff: {{ r.staff.name }}</span>
              · {{ fmtDate(r.createdAt) }}
            </p>
          </div>
          <UButton
            :variant="r.isFocused ? 'solid' : 'outline'"
            :class="r.isFocused ? 'dc-btn-primary' : 'dc-btn-outline'"
            :icon="r.isFocused ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
            size="xs"
            @click="toggleFocus(r)"
          >
            {{ r.isFocused ? 'Difokuskan' : 'Fokuskan' }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
