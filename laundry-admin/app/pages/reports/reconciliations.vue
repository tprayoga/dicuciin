<script setup lang="ts">
/**
 * Batch 2 — dana yang perlu ditinjau/di-refund (pembayaran ganda, dana masuk
 * setelah batal, booking dibayar tapi tak terpakai, permintaan customer).
 * Server menegakkan semua aturan: hanya SUPER_ADMIN/OWNER yang bisa
 * menyetujui & mengeksekusi; eksekusi tepat sekali.
 */
import { h, resolveComponent } from 'vue'
import { useApi } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'

interface Reconciliation {
  id: string
  reason: string
  status: string
  amount: number
  refundAmount: number
  note: string | null
  reviewNote: string | null
  refundMethod: string | null
  executionRef: string | null
  createdAt: string
  order?: { orderNumber: string }
  customer?: { memberCode: string | null; user?: { name: string; phone: string | null } } | null
  payment?: { paymentNumber: string; paymentMethod: string } | null
}

const api = useApi()
const toast = useToast()
const authStore = useAuthStore()
const canDecide = computed(() => ['SUPER_ADMIN', 'OWNER'].includes(authStore.user?.role || ''))

const rows = ref<Reconciliation[]>([])
const loading = ref(false)
const ALL = 'ALL'
const statusFilter = ref('ACTIONABLE')
const statusItems = [
  { label: 'Perlu tindakan', value: 'ACTIONABLE' },
  { label: 'Semua', value: ALL },
  { label: 'Terbuka (sistem)', value: 'OPEN' },
  { label: 'Diajukan customer', value: 'REQUESTED' },
  { label: 'Disetujui', value: 'APPROVED' },
  { label: 'Sudah direfund', value: 'REFUNDED' },
  { label: 'Ditolak', value: 'REJECTED' },
  { label: 'Ditutup', value: 'CLOSED' },
]
const reasonLabel: Record<string, string> = {
  DUPLICATE_PAYMENT: 'Pembayaran ganda',
  PAID_AFTER_CANCEL: 'Dana masuk setelah batal',
  PAID_BOOKING_UNAVAILABLE: 'Slot mesin hilang',
  PAID_NOT_USED: 'Dibayar, tidak dipakai',
  CUSTOMER_REQUEST: 'Permintaan customer',
}
const statusColor: Record<string, string> = {
  OPEN: 'warning', REQUESTED: 'warning', APPROVED: 'info', REFUNDED: 'success', REJECTED: 'neutral', CLOSED: 'neutral',
}

const selected = ref<Reconciliation | null>(null)
const showReview = ref(false)
const showExecute = ref(false)
const decision = ref<'APPROVE' | 'REJECT' | 'CLOSE'>('APPROVE')
const note = ref('')
const method = ref<'WALLET_CREDIT' | 'EXTERNAL'>('WALLET_CREDIT')
const reference = ref('')
const submitting = ref(false)

const rupiah = (n: number) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`

const columns = [
  { id: 'created', header: 'Tanggal', cell: ({ row }: any) => new Date(row.original.createdAt).toLocaleString('id-ID') },
  { id: 'order', header: 'Order', cell: ({ row }: any) => row.original.order?.orderNumber || '-' },
  { id: 'customer', header: 'Customer', cell: ({ row }: any) => row.original.customer?.user?.name || 'Tamu kiosk' },
  { id: 'reason', header: 'Alasan', cell: ({ row }: any) => reasonLabel[row.original.reason] || row.original.reason },
  { id: 'amount', header: 'Refund', cell: ({ row }: any) => rupiah(row.original.refundAmount) },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }: any) => {
      const UBadge = resolveComponent('UBadge')
      return h(UBadge, { color: statusColor[row.original.status] || 'neutral', variant: 'soft', size: 'xs' }, () => row.original.status)
    },
  },
  {
    id: 'actions',
    header: 'Aksi',
    cell: ({ row }: any) => {
      const UButton = resolveComponent('UButton')
      const r = row.original as Reconciliation
      if (!canDecide.value) return '-'
      if (r.status === 'OPEN' || r.status === 'REQUESTED') {
        return h(UButton, { size: 'xs', variant: 'ghost', class: 'dc-btn-outline', onClick: () => openReview(r) }, () => 'Tinjau')
      }
      if (r.status === 'APPROVED') {
        return h(UButton, { size: 'xs', color: 'primary', onClick: () => openExecute(r) }, () => 'Eksekusi refund')
      }
      return r.executionRef ? `Ref: ${r.executionRef.slice(0, 12)}` : '-'
    },
  },
]

async function load() {
  loading.value = true
  try {
    const status = statusFilter.value === ALL || statusFilter.value === 'ACTIONABLE' ? '' : `?status=${statusFilter.value}`
    const data = await api.get<Reconciliation[]>(`/payments/reconciliations${status}`)
    rows.value =
      statusFilter.value === 'ACTIONABLE'
        ? data.filter((r) => ['OPEN', 'REQUESTED', 'APPROVED'].includes(r.status))
        : data
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat rekonsiliasi', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

function openReview(r: Reconciliation) {
  selected.value = r
  decision.value = 'APPROVE'
  note.value = ''
  showReview.value = true
}
function openExecute(r: Reconciliation) {
  selected.value = r
  method.value = r.customer ? 'WALLET_CREDIT' : 'EXTERNAL'
  reference.value = ''
  note.value = ''
  showExecute.value = true
}

async function submitReview() {
  if (!selected.value || note.value.trim().length < 3) {
    toast.add({ title: 'Catatan minimal 3 karakter', color: 'error' })
    return
  }
  submitting.value = true
  try {
    await api.post(`/payments/reconciliations/${selected.value.id}/review`, { decision: decision.value, note: note.value.trim() })
    showReview.value = false
    toast.add({ title: 'Keputusan tersimpan', color: 'success' })
    await load()
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan keputusan', description: e.message, color: 'error' })
  } finally {
    submitting.value = false
  }
}

async function submitExecute() {
  if (!selected.value || submitting.value) return
  if (method.value === 'EXTERNAL' && !reference.value.trim()) {
    toast.add({ title: 'Referensi refund wajib diisi untuk refund eksternal', color: 'error' })
    return
  }
  submitting.value = true
  try {
    await api.post(`/payments/reconciliations/${selected.value.id}/execute`, {
      method: method.value,
      ...(reference.value.trim() ? { reference: reference.value.trim() } : {}),
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
    })
    showExecute.value = false
    toast.add({ title: 'Refund dieksekusi', color: 'success' })
    await load()
  } catch (e: any) {
    toast.add({ title: 'Refund gagal', description: e.message, color: 'error' })
  } finally {
    submitting.value = false
  }
}

watch(statusFilter, load)
onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="dc-page-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">Rekonsiliasi & Refund</h2>
        <p class="text-sm text-[#6f809f]">
          Dana yang masuk tetapi tidak dapat diterapkan ke pesanan, dan permintaan refund customer.
          Hanya Owner/Super Admin yang dapat menyetujui dan mengeksekusi.
        </p>
      </div>
      <USelect v-model="statusFilter" :items="statusItems" class="w-full sm:w-56 dc-input-like" />
    </div>

    <div class="dc-page-card p-4">
      <div class="mb-3 text-sm text-[#6f809f]">{{ rows.length }} data</div>
      <UTable :data="rows" :columns="columns" :loading="loading">
        <template #empty>
          <CommonMascotEmptyState
            image="/mascot/09_error_kiosk_pack/03_empty_page_sweeping.png"
            title="Tidak ada yang perlu ditindaklanjuti"
            description="Pembayaran ganda, dana masuk setelah batal, dan permintaan refund akan muncul di sini."
          />
        </template>
      </UTable>
    </div>

    <UModal v-model:open="showReview" title="Tinjau rekonsiliasi">
      <template #body>
        <div v-if="selected" class="space-y-3 text-sm">
          <p><b>{{ reasonLabel[selected.reason] }}</b> — {{ selected.order?.orderNumber }} — {{ rupiah(selected.refundAmount) }}</p>
          <p class="text-[#6f809f]">{{ selected.note }}</p>
          <USelect
            v-model="decision"
            :items="[
              { label: 'Setujui refund', value: 'APPROVE' },
              { label: 'Tolak', value: 'REJECT' },
              { label: 'Tutup tanpa refund (mis. dijadwalkan ulang)', value: 'CLOSE' },
            ]"
            class="w-full"
          />
          <UTextarea v-model="note" placeholder="Catatan keputusan (wajib)" class="w-full" />
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="showReview = false">Batal</UButton>
            <UButton :loading="submitting" @click="submitReview">Simpan</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showExecute" title="Eksekusi refund">
      <template #body>
        <div v-if="selected" class="space-y-3 text-sm">
          <p>Refund <b>{{ rupiah(selected.refundAmount) }}</b> untuk {{ selected.order?.orderNumber }}. Tindakan ini hanya bisa dilakukan sekali.</p>
          <USelect
            v-model="method"
            :items="[
              ...(selected.customer ? [{ label: 'Kembalikan ke saldo customer', value: 'WALLET_CREDIT' }] : []),
              { label: 'Sudah direfund di luar sistem (Midtrans/transfer)', value: 'EXTERNAL' },
            ]"
            class="w-full"
          />
          <UInput v-if="method === 'EXTERNAL'" v-model="reference" placeholder="No. refund Midtrans / bukti transfer (wajib)" class="w-full" />
          <UTextarea v-model="note" placeholder="Catatan (opsional)" class="w-full" />
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="showExecute = false">Batal</UButton>
            <UButton color="primary" :loading="submitting" @click="submitExecute">Eksekusi</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
