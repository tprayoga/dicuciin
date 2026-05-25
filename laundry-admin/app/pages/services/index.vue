<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse } from '~/types'

const api = useApi()
const toast = useToast()

interface ServiceItem {
  id: string
  name: string
  serviceType: string
  description: string | null
  isActive: boolean
  createdAt: string
}

const services = ref<ServiceItem[]>([])
const meta = ref({ total: 0, page: 1, limit: 10, totalPages: 1 })
const loading = ref(false)
const showModal = ref(false)
const editTarget = ref<ServiceItem | null>(null)

const serviceTypeItems = [
  { label: 'Cuci (WASH)', value: 'WASH' },
  { label: 'Setrika (IRON)', value: 'IRON' },
  { label: 'Express (EXPRESS)', value: 'EXPRESS' },
  { label: 'Cuci + Setrika (WASH_IRON)', value: 'WASH_IRON' },
  { label: 'Dry Clean (DRY_CLEAN)', value: 'DRY_CLEAN' },
  { label: 'Lainnya (OTHER)', value: 'OTHER' },
]

const form = reactive({ name: '', serviceType: 'WASH', description: '', isActive: true })

const columns = [
  { accessorKey: 'name', header: 'Nama Layanan' },
  { accessorKey: 'serviceType', header: 'Tipe' },
  { id: 'description', header: 'Deskripsi', cell: ({ row }: any) => h('span', { class: 'text-gray-500 text-xs' }, row.original.description || '-') },
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
      return h(UButton, { icon: 'i-heroicons-pencil', variant: 'ghost', size: 'xs', onClick: () => openEdit(row.original) })
    },
  },
]

async function load(page = 1) {
  loading.value = true
  try {
    const res = await api.get<PaginatedResponse<ServiceItem>>(`/services?page=${page}&limit=10`)
    services.value = res.data
    meta.value = res.meta
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat layanan', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editTarget.value = null
  Object.assign(form, { name: '', serviceType: 'WASH', description: '', isActive: true })
  showModal.value = true
}

function openEdit(s: ServiceItem) {
  editTarget.value = s
  Object.assign(form, { name: s.name, serviceType: s.serviceType, description: s.description || '', isActive: s.isActive })
  showModal.value = true
}

async function save() {
  try {
    const payload = { name: form.name, serviceType: form.serviceType, description: form.description || undefined, isActive: form.isActive }
    if (editTarget.value) {
      await api.patch(`/services/${editTarget.value.id}`, payload)
      toast.add({ title: 'Layanan diperbarui', color: 'success' })
    } else {
      await api.post('/services', payload)
      toast.add({ title: 'Layanan dibuat', color: 'success' })
    }
    showModal.value = false
    load(meta.value.page)
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan', description: e.message, color: 'error' })
  }
}

onMounted(() => load())
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-gray-500">{{ meta.total }} layanan terdaftar</p>
      <UButton icon="i-heroicons-plus" @click="openCreate">Tambah Layanan</UButton>
    </div>

    <UCard>
      <UTable :data="services" :columns="columns" :loading="loading" />

      <div v-if="meta.totalPages > 1" class="flex justify-center pt-4">
        <UPagination v-model:page="meta.page" :total="meta.total" :items-per-page="meta.limit" @update:page="load" />
      </div>
    </UCard>

    <UModal v-model:open="showModal" :title="editTarget ? 'Edit Layanan' : 'Tambah Layanan'">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="Nama Layanan">
            <UInput v-model="form.name" placeholder="Cuci Kiloan" class="w-full" required />
          </UFormField>
          <UFormField label="Tipe Layanan">
            <USelect v-model="form.serviceType" :items="serviceTypeItems" class="w-full" />
          </UFormField>
          <UFormField label="Deskripsi">
            <UInput v-model="form.description" placeholder="Deskripsi layanan..." class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" @click="showModal = false">Batal</UButton>
            <UButton type="submit">Simpan</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
