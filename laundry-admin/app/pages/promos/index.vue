<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse, Promo } from '~/types'

const api = useApi()
const toast = useToast()

const promos = ref<Promo[]>([])
const meta = ref({ total: 0, page: 1, limit: 10, totalPages: 1 })
const loading = ref(false)
const showModal = ref(false)
const editTarget = ref<Promo | null>(null)
const deleteTarget = ref<Promo | null>(null)
const showDeleteModal = ref(false)

const promoTypeItems = [
  { label: 'Persentase (%)', value: 'PERCENTAGE' },
  { label: 'Nominal (Rp)', value: 'FIXED_AMOUNT' },
  { label: 'Gratis Ongkir', value: 'FREE_DELIVERY' },
]

const form = reactive({
  code: '',
  name: '',
  promoType: 'PERCENTAGE',
  value: 0,
  startDate: '',
  endDate: '',
  quota: 100,
  isActive: true,
})

const promoTypeColor: Record<string, string> = {
  PERCENTAGE: 'info',
  FIXED_AMOUNT: 'success',
  FREE_DELIVERY: 'warning',
}

function formatValue(promo: Promo) {
  if (promo.promoType === 'PERCENTAGE') return `${promo.value}%`
  if (promo.promoType === 'FIXED_AMOUNT') return `Rp ${promo.value.toLocaleString('id-ID')}`
  return 'Gratis Ongkir'
}

const columns = [
  { accessorKey: 'code', header: 'Kode' },
  { accessorKey: 'name', header: 'Nama Promo' },
  {
    id: 'promoType',
    header: 'Tipe',
    cell: ({ row }: any) => {
      const UBadge = resolveComponent('UBadge')
      const color = promoTypeColor[row.original.promoType] || 'neutral'
      return h(UBadge, { color, variant: 'soft', size: 'xs' }, () => row.original.promoType)
    },
  },
  { id: 'value', header: 'Nilai', cell: ({ row }: any) => formatValue(row.original) },
  { id: 'usedCount', header: 'Digunakan', cell: ({ row }: any) => `${row.original.usedCount} / ${row.original.quota}` },
  {
    id: 'isActive',
    header: 'Status',
    cell: ({ row }: any) => {
      const UBadge = resolveComponent('UBadge')
      return h(UBadge, { color: row.original.isActive ? 'success' : 'neutral', variant: 'soft', size: 'xs' }, () => row.original.isActive ? 'Aktif' : 'Nonaktif')
    },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }: any) => {
      const UButton = resolveComponent('UButton')
      return h('div', { class: 'flex gap-1 justify-end' }, [
        h(UButton, { icon: 'i-heroicons-pencil', variant: 'ghost', size: 'xs', onClick: () => openEdit(row.original) }),
        h(UButton, { icon: 'i-heroicons-trash', variant: 'ghost', color: 'error', size: 'xs', onClick: () => confirmDelete(row.original) }),
      ])
    },
  },
]

async function load(page = 1) {
  loading.value = true
  try {
    const res = await api.get<PaginatedResponse<Promo>>(`/promos?page=${page}&limit=10`)
    promos.value = res.data
    meta.value = res.meta
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat promo', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

function toInputDate(iso: string) {
  return iso ? iso.slice(0, 10) : ''
}

function openCreate() {
  editTarget.value = null
  Object.assign(form, { code: '', name: '', promoType: 'PERCENTAGE', value: 0, startDate: '', endDate: '', quota: 100, isActive: true })
  showModal.value = true
}

function openEdit(p: Promo) {
  editTarget.value = p
  Object.assign(form, {
    code: p.code,
    name: p.name,
    promoType: p.promoType,
    value: p.value,
    startDate: toInputDate(p.startDate),
    endDate: toInputDate(p.endDate),
    quota: p.quota,
    isActive: p.isActive,
  })
  showModal.value = true
}

async function save() {
  try {
    const payload = {
      ...form,
      startDate: new Date(form.startDate).toISOString(),
      endDate: new Date(form.endDate).toISOString(),
    }
    if (editTarget.value) {
      await api.patch(`/promos/${editTarget.value.id}`, payload)
      toast.add({ title: 'Promo diperbarui', color: 'success' })
    } else {
      await api.post('/promos', payload)
      toast.add({ title: 'Promo dibuat', color: 'success' })
    }
    showModal.value = false
    load(meta.value.page)
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan', description: e.message, color: 'error' })
  }
}

function confirmDelete(p: Promo) {
  deleteTarget.value = p
  showDeleteModal.value = true
}

async function doDelete() {
  if (!deleteTarget.value) return
  try {
    await api.del(`/promos/${deleteTarget.value.id}`)
    toast.add({ title: 'Promo dihapus', color: 'success' })
    showDeleteModal.value = false
    load(meta.value.page)
  } catch (e: any) {
    toast.add({ title: 'Gagal menghapus', description: e.message, color: 'error' })
  }
}

onMounted(() => load())
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-gray-500">{{ meta.total }} promo terdaftar</p>
      <UButton icon="i-heroicons-plus" @click="openCreate">Tambah Promo</UButton>
    </div>

    <UCard>
      <UTable :data="promos" :columns="columns" :loading="loading" />

      <div v-if="meta.totalPages > 1" class="flex justify-center pt-4">
        <UPagination v-model:page="meta.page" :total="meta.total" :items-per-page="meta.limit" @update:page="load" />
      </div>
    </UCard>

    <UModal v-model:open="showModal" :title="editTarget ? 'Edit Promo' : 'Tambah Promo'">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Kode Promo">
              <UInput v-model="form.code" placeholder="DISKON10" class="w-full" required />
            </UFormField>
            <UFormField label="Nama Promo">
              <UInput v-model="form.name" placeholder="Diskon 10%" class="w-full" required />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Tipe Promo">
              <USelect v-model="form.promoType" :items="promoTypeItems" class="w-full" />
            </UFormField>
            <UFormField label="Nilai">
              <UInput v-model.number="form.value" type="number" min="0" class="w-full" required />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Tanggal Mulai">
              <UInput v-model="form.startDate" type="date" class="w-full" required />
            </UFormField>
            <UFormField label="Tanggal Berakhir">
              <UInput v-model="form.endDate" type="date" class="w-full" required />
            </UFormField>
          </div>
          <UFormField label="Kuota">
            <UInput v-model.number="form.quota" type="number" min="1" class="w-full" required />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" @click="showModal = false">Batal</UButton>
            <UButton type="submit">Simpan</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="showDeleteModal" title="Hapus Promo">
      <template #body>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Yakin ingin menghapus promo <strong>{{ deleteTarget?.code }}</strong>?
        </p>
        <div class="flex justify-end gap-2 pt-4">
          <UButton variant="ghost" @click="showDeleteModal = false">Batal</UButton>
          <UButton color="error" @click="doDelete">Hapus</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
