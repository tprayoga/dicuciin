<script setup lang="ts">
/**
 * Batch 6 — permintaan hapus akun pelanggan.
 * PENDING_REVIEW = ada penghalang (saldo, order/booking aktif, refund terbuka).
 * Tuntaskan dulu (mis. kembalikan saldo lewat Rekonsiliasi & Refund), lalu
 * "Selesaikan" → server memeriksa ulang penghalang, menganonimkan data
 * pribadi, mencabut sesi, dan mencatat audit. Hanya SUPER_ADMIN/OWNER.
 */
import { useApi } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'

interface DeletionRequest {
  id: string
  status: 'PENDING_REVIEW' | 'COMPLETED' | 'CANCELLED'
  channel: string
  reason: string | null
  blockers: { code: string; message: string; amount?: number; count?: number }[] | null
  balanceSnapshot: number | null
  requestedAt: string
  completedAt: string | null
  note: string | null
  user?: { id: string; name: string; phone: string | null; email: string | null; deletedAt: string | null }
}

const api = useApi()
const toast = useToast()
const authStore = useAuthStore()
const canDecide = computed(() => ['SUPER_ADMIN', 'OWNER'].includes(authStore.user?.role || ''))

const rows = ref<DeletionRequest[]>([])
const loading = ref(false)
const ALL = 'ALL'
const statusFilter = ref('PENDING_REVIEW')
const statusItems = [
  { label: 'Perlu ditinjau', value: 'PENDING_REVIEW' },
  { label: 'Selesai', value: 'COMPLETED' },
  { label: 'Dibatalkan', value: 'CANCELLED' },
  { label: 'Semua', value: ALL },
]
const statusColor: Record<string, string> = { PENDING_REVIEW: 'warning', COMPLETED: 'success', CANCELLED: 'neutral' }

const selected = ref<DeletionRequest | null>(null)
const showDecision = ref(false)
const decision = ref<'complete' | 'cancel'>('complete')
const note = ref('')
const busy = ref(false)

async function load() {
  loading.value = true
  try {
    const q = statusFilter.value === ALL ? '' : `?status=${statusFilter.value}`
    rows.value = await api.get<DeletionRequest[]>(`/account/admin/deletion-requests${q}`)
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat permintaan', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

function open(row: DeletionRequest, kind: 'complete' | 'cancel') {
  selected.value = row
  decision.value = kind
  note.value = ''
  showDecision.value = true
}

async function submit() {
  if (!selected.value) return
  busy.value = true
  try {
    await api.post(`/account/admin/deletion-requests/${selected.value.id}/${decision.value}`, {
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
    })
    toast.add({ title: decision.value === 'complete' ? 'Akun dihapus (dianonimkan)' : 'Permintaan dibatalkan', color: 'success' })
    showDecision.value = false
    await load()
  } catch (e: any) {
    toast.add({ title: 'Gagal', description: e.message, color: 'error' })
  } finally {
    busy.value = false
  }
}

const rupiah = (v: number | null | undefined) => `Rp${Math.round(Number(v || 0)).toLocaleString('id-ID')}`

watch(statusFilter, load)
onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="dc-page-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 rounded-xl bg-[#fde8e4] text-[#d6280b] flex items-center justify-center">
          <UIcon name="i-heroicons-user-minus" class="text-xl" />
        </div>
        <div>
          <h2 class="text-lg font-semibold">Permintaan Hapus Akun</h2>
          <p class="text-sm text-[#6f809f]">
            Tuntaskan saldo/transaksi aktif dulu, lalu selesaikan. Riwayat transaksi tetap disimpan tanpa identitas.
          </p>
        </div>
      </div>
      <USelect v-model="statusFilter" :items="statusItems" class="w-full sm:w-[220px]" />
    </div>

    <div class="dc-page-card overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-[#0349a8] text-white text-left">
            <th class="px-3 py-3 font-semibold">PELANGGAN</th>
            <th class="px-3 py-3 font-semibold">DIAJUKAN</th>
            <th class="px-3 py-3 font-semibold">KANAL</th>
            <th class="px-3 py-3 font-semibold">PENGHALANG</th>
            <th class="px-3 py-3 font-semibold">STATUS</th>
            <th class="px-3 py-3 font-semibold">AKSI</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="6" class="px-3 py-4 text-[#6f809f]">Memuat...</td></tr>
          <tr v-else-if="rows.length === 0"><td colspan="6" class="px-3 py-4 text-[#6f809f]">Tidak ada permintaan.</td></tr>
          <tr v-for="(r, idx) in rows" :key="r.id" :class="idx % 2 ? 'bg-[#f8fbff]' : ''">
            <td class="px-3 py-3">
              <p class="font-semibold">{{ r.user?.name || '-' }}</p>
              <p class="text-[#6f809f]">{{ r.user?.phone || r.user?.email || '(data pribadi sudah dihapus)' }}</p>
            </td>
            <td class="px-3 py-3">{{ new Date(r.requestedAt).toLocaleString('id-ID') }}</td>
            <td class="px-3 py-3">{{ r.channel === 'WEB' ? 'Situs web' : 'Aplikasi' }}</td>
            <td class="px-3 py-3">
              <ul v-if="r.blockers?.length" class="list-disc pl-4">
                <li v-for="b in r.blockers" :key="b.code">
                  {{ b.message }}<span v-if="b.amount"> ({{ rupiah(b.amount) }})</span><span v-else-if="b.count"> ({{ b.count }})</span>
                </li>
              </ul>
              <span v-else class="text-[#6f809f]">-</span>
              <p v-if="r.reason" class="text-[#6f809f] mt-1">Alasan: {{ r.reason }}</p>
            </td>
            <td class="px-3 py-3"><UBadge :color="(statusColor[r.status] as any)" variant="subtle">{{ r.status }}</UBadge></td>
            <td class="px-3 py-3 space-x-1 whitespace-nowrap">
              <template v-if="r.status === 'PENDING_REVIEW' && canDecide">
                <UButton size="xs" color="error" @click="open(r, 'complete')">Selesaikan</UButton>
                <UButton size="xs" variant="outline" @click="open(r, 'cancel')">Batalkan</UButton>
              </template>
              <span v-else class="text-[#6f809f]">{{ r.note || '-' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal v-model:open="showDecision" :title="decision === 'complete' ? 'Selesaikan hapus akun' : 'Batalkan permintaan'">
      <template #body>
        <div class="space-y-3 text-sm">
          <p v-if="decision === 'complete'">
            Server memeriksa ulang: saldo harus 0 dan tidak ada order/booking/pembayaran/refund aktif. Data pribadi
            <b>{{ selected?.user?.name }}</b> akan dianonimkan permanen dan semua sesi dicabut.
          </p>
          <p v-else>Permintaan ditutup tanpa menghapus akun.</p>
          <UFormField label="Catatan (mis. referensi pengembalian saldo)">
            <UTextarea v-model="note" class="w-full" :rows="3" />
          </UFormField>
          <div class="flex justify-end">
            <UButton :loading="busy" :color="decision === 'complete' ? 'error' : 'primary'" @click="submit">
              {{ decision === 'complete' ? 'Hapus Akun' : 'Batalkan' }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
