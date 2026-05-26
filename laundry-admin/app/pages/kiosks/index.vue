<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse, Kiosk, Outlet } from '~/types'

const api = useApi()
const toast = useToast()

const kiosks = ref<Kiosk[]>([])
const outlets = ref<Outlet[]>([])
const meta = ref({ total: 0, page: 1, limit: 10, totalPages: 1 })
const loading = ref(false)
const showModal = ref(false)
const editTarget = ref<Kiosk | null>(null)
const deleteTarget = ref<Kiosk | null>(null)
const showDeleteModal = ref(false)

const form = reactive({ outletId: '', kioskCode: '', name: '', location: '' })

const statusColor: Record<string, string> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  MAINTENANCE: 'warning',
}

const columns = [
  { accessorKey: 'kioskCode', header: 'Kode' },
  { accessorKey: 'name', header: 'Nama Kiosk' },
  { id: 'outlet', header: 'Outlet', cell: ({ row }: any) => row.original.outlet?.name || '-' },
  { id: 'location', header: 'Lokasi', cell: ({ row }: any) => h('span', { class: 'text-gray-500 text-xs' }, row.original.location || '-') },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }: any) => {
      const UBadge = resolveComponent('UBadge')
      const color = statusColor[row.original.status] || 'neutral'
      return h(UBadge, { color, variant: 'soft', size: 'xs' }, () => row.original.status)
    },
  },
  {
    id: 'lastHeartbeat',
    header: 'Heartbeat Terakhir',
    cell: ({ row }: any) => h('span', { class: 'text-xs text-gray-500' }, row.original.lastHeartbeat ? new Date(row.original.lastHeartbeat).toLocaleString('id-ID') : 'Belum ada'),
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
    const [kioskRes, outletRes] = await Promise.all([
      api.get<PaginatedResponse<Kiosk>>(`/kiosks?page=${page}&limit=10`),
      api.get<PaginatedResponse<Outlet>>('/outlets?page=1&limit=100'),
    ])
    kiosks.value = kioskRes.data
    meta.value = kioskRes.meta
    outlets.value = outletRes.data
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat kiosk', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

const outletOptions = computed(() =>
  outlets.value.map(o => ({ label: o.name, value: o.id }))
)

function openCreate() {
  editTarget.value = null
  Object.assign(form, { outletId: outlets.value[0]?.id || '', kioskCode: '', name: '', location: '' })
  showModal.value = true
}

function openEdit(k: Kiosk) {
  editTarget.value = k
  Object.assign(form, { outletId: k.outletId, kioskCode: k.kioskCode, name: k.name, location: k.location || '' })
  showModal.value = true
}

async function save() {
  try {
    if (editTarget.value) {
      const payload = {
        name: form.name,
        location: form.location || undefined,
      }
      await api.patch(`/kiosks/${editTarget.value.id}`, payload)
      toast.add({ title: 'Kiosk diperbarui', color: 'success' })
    } else {
      const payload = {
        outletId: form.outletId,
        kioskCode: form.kioskCode,
        name: form.name,
        location: form.location || undefined,
      }
      await api.post('/kiosks', payload)
      toast.add({ title: 'Kiosk dibuat', color: 'success' })
    }
    showModal.value = false
    load(meta.value.page)
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan', description: e.message, color: 'error' })
  }
}

function confirmDelete(k: Kiosk) {
  deleteTarget.value = k
  showDeleteModal.value = true
}

async function doDelete() {
  if (!deleteTarget.value) return
  try {
    await api.del(`/kiosks/${deleteTarget.value.id}`)
    toast.add({ title: 'Kiosk dihapus', color: 'success' })
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
      <p class="text-sm text-gray-500">{{ meta.total }} kiosk terdaftar</p>
      <UButton icon="i-heroicons-plus" @click="openCreate">Tambah Kiosk</UButton>
    </div>

    <UCard>
      <UTable :data="kiosks" :columns="columns" :loading="loading" />

      <div v-if="meta.totalPages > 1" class="flex justify-center pt-4">
        <UPagination v-model:page="meta.page" :total="meta.total" :items-per-page="meta.limit" @update:page="load" />
      </div>
    </UCard>

    <UModal v-model:open="showModal" :title="editTarget ? 'Edit Kiosk' : 'Tambah Kiosk'">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="Outlet">
            <USelect v-model="form.outletId" :items="outletOptions" class="w-full" :disabled="!!editTarget" />
          </UFormField>
          <UFormField label="Kode Kiosk">
            <UInput v-model="form.kioskCode" placeholder="KIOSK-001" class="w-full" required :disabled="!!editTarget" />
          </UFormField>
          <UFormField label="Nama Kiosk">
            <UInput v-model="form.name" placeholder="Kiosk Utama" class="w-full" required />
          </UFormField>
          <UFormField label="Lokasi">
            <UInput v-model="form.location" placeholder="Lobby Depan" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" @click="showModal = false">Batal</UButton>
            <UButton type="submit">Simpan</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="showDeleteModal" title="Hapus Kiosk">
      <template #body>
        <p class="text-sm text-gray-600">
          Yakin ingin menghapus kiosk <strong>{{ deleteTarget?.name }}</strong>?
        </p>
        <div class="flex justify-end gap-2 pt-4">
          <UButton variant="ghost" @click="showDeleteModal = false">Batal</UButton>
          <UButton color="error" @click="doDelete">Hapus</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
