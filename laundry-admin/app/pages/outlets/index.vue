<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse, Outlet } from '~/types'

const api = useApi()
const toast = useToast()

const outlets = ref<Outlet[]>([])
const meta = ref({ total: 0, page: 1, limit: 10, totalPages: 1 })
const loading = ref(false)
const showModal = ref(false)
const editTarget = ref<Outlet | null>(null)
const deleteTarget = ref<Outlet | null>(null)
const showDeleteModal = ref(false)

const form = reactive({ name: '', code: '', address: '', phone: '' })

const columns = [
  { accessorKey: 'code', header: 'Kode' },
  { accessorKey: 'name', header: 'Nama Outlet' },
  { accessorKey: 'address', header: 'Alamat' },
  { accessorKey: 'phone', header: 'Telepon' },
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
    const res = await api.get<PaginatedResponse<Outlet>>(`/outlets?page=${page}&limit=10`)
    outlets.value = res.data
    meta.value = res.meta
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat outlet', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editTarget.value = null
  Object.assign(form, { name: '', code: '', address: '', phone: '' })
  showModal.value = true
}

function openEdit(outlet: Outlet) {
  editTarget.value = outlet
  Object.assign(form, { name: outlet.name, code: outlet.code, address: outlet.address, phone: outlet.phone })
  showModal.value = true
}

async function save() {
  try {
    if (editTarget.value) {
      await api.patch(`/outlets/${editTarget.value.id}`, form)
      toast.add({ title: 'Outlet diperbarui', color: 'success' })
    } else {
      await api.post('/outlets', form)
      toast.add({ title: 'Outlet dibuat', color: 'success' })
    }
    showModal.value = false
    load(meta.value.page)
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan', description: e.message, color: 'error' })
  }
}

function confirmDelete(outlet: Outlet) {
  deleteTarget.value = outlet
  showDeleteModal.value = true
}

async function doDelete() {
  if (!deleteTarget.value) return
  try {
    await api.del(`/outlets/${deleteTarget.value.id}`)
    toast.add({ title: 'Outlet dihapus', color: 'success' })
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
      <p class="text-sm text-gray-500">{{ meta.total }} outlet terdaftar</p>
      <UButton icon="i-heroicons-plus" @click="openCreate">Tambah Outlet</UButton>
    </div>

    <UCard>
      <UTable :data="outlets" :columns="columns" :loading="loading" />

      <div v-if="meta.totalPages > 1" class="flex justify-center pt-4">
        <UPagination v-model:page="meta.page" :total="meta.total" :items-per-page="meta.limit" @update:page="load" />
      </div>
    </UCard>

    <!-- Create/Edit Modal -->
    <UModal v-model:open="showModal" :title="editTarget ? 'Edit Outlet' : 'Tambah Outlet'">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="Nama Outlet">
            <UInput v-model="form.name" placeholder="Outlet Pusat" class="w-full" required />
          </UFormField>
          <UFormField label="Kode">
            <UInput v-model="form.code" placeholder="OUT-001" class="w-full" required />
          </UFormField>
          <UFormField label="Alamat">
            <UInput v-model="form.address" placeholder="Jl. Laundry No. 1" class="w-full" required />
          </UFormField>
          <UFormField label="Telepon">
            <UInput v-model="form.phone" placeholder="021-12345678" class="w-full" required />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" @click="showModal = false">Batal</UButton>
            <UButton type="submit">Simpan</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <!-- Delete Confirm -->
    <UModal v-model:open="showDeleteModal" title="Hapus Outlet">
      <template #body>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Yakin ingin menghapus outlet <strong>{{ deleteTarget?.name }}</strong>?
        </p>
        <div class="flex justify-end gap-2 pt-4">
          <UButton variant="ghost" @click="showDeleteModal = false">Batal</UButton>
          <UButton color="error" @click="doDelete">Hapus</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
