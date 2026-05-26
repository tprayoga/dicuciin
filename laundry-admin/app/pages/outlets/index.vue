<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse, Outlet } from '~/types'

const api = useApi()
const toast = useToast()

const outlets = ref<Outlet[]>([])
const meta = ref({ total: 0, page: 1, limit: 10, totalPages: 1 })
const loading = ref(false)
const search = ref('')

const showModal = ref(false)
const editTarget = ref<Outlet | null>(null)
const deleteTarget = ref<Outlet | null>(null)
const showDeleteModal = ref(false)

const form = reactive({
  name: '',
  code: '',
  address: '',
  phone: '',
  openTime: '',
  closeTime: '',
  imageUrl: '',
})

async function load(page = 1) {
  loading.value = true
  try {
    const res = await api.get<PaginatedResponse<Outlet>>(`/outlets?page=${page}&limit=50`)
    outlets.value = res.data
    meta.value = res.meta
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat outlet', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

const filteredOutlets = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return outlets.value
  return outlets.value.filter(o =>
    `${o.name} ${o.address} ${o.code}`.toLowerCase().includes(keyword),
  )
})

function openCreate() {
  editTarget.value = null
  Object.assign(form, { name: '', code: '', address: '', phone: '', openTime: '', closeTime: '', imageUrl: '' })
  showModal.value = true
}

function openEdit(outlet: Outlet) {
  editTarget.value = outlet
  Object.assign(form, {
    name: outlet.name,
    code: outlet.code,
    address: outlet.address,
    phone: outlet.phone,
    openTime: outlet.openTime || '',
    closeTime: outlet.closeTime || '',
    imageUrl: outlet.imageUrl || '',
  })
  showModal.value = true
}

async function save() {
  try {
    if (editTarget.value) {
      await api.patch(`/outlets/${editTarget.value.id}`, {
        name: form.name,
        address: form.address,
        phone: form.phone,
        openTime: form.openTime || undefined,
        closeTime: form.closeTime || undefined,
        imageUrl: form.imageUrl || undefined,
      })
      toast.add({ title: 'Outlet diperbarui', color: 'success' })
    } else {
      await api.post('/outlets', {
        name: form.name,
        code: form.code,
        address: form.address,
        phone: form.phone,
        openTime: form.openTime || undefined,
        closeTime: form.closeTime || undefined,
        imageUrl: form.imageUrl || undefined,
      })
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
    <div class="dc-page-card p-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 rounded-xl bg-[#dce9f8] text-[#0f6ee9] flex items-center justify-center">
          <UIcon name="i-heroicons-building-storefront" class="text-xl" />
        </div>
        <div>
          <h2 class="text-lg font-semibold">Kelola Outlet / Cabang</h2>
          <p class="text-sm text-[#6f809f]">Tambah, ubah, atau hapus cabang laundry milik Anda. Semua data tetap aman</p>
        </div>
      </div>
      <UButton icon="i-heroicons-plus" class="dc-btn-primary px-4 py-2" @click="openCreate">Tambah Cabang</UButton>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-lg">Total: <span class="text-[#0f6ee9] font-semibold">{{ filteredOutlets.length }} Outlet/ Cabang</span></p>
      <UInput v-model="search" icon="i-heroicons-magnifying-glass" placeholder="Cari nama outlet" class="w-full max-w-xs dc-input-like" />
    </div>

    <div v-if="loading" class="text-sm text-[#6f809f]">Memuat data outlet...</div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div v-for="outlet in filteredOutlets" :key="outlet.id" class="dc-page-card p-4">
        <div
          v-if="outlet.imageUrl"
          class="h-28 rounded-lg border border-[#d7e0ee] bg-center bg-cover mb-3"
          :style="{ backgroundImage: `url(${outlet.imageUrl})` }"
        />
        <div class="flex items-start justify-between mb-4">
          <div class="h-12 w-12 rounded-xl bg-[#dce9f8] text-[#0f6ee9] flex items-center justify-center">
            <UIcon name="i-heroicons-building-storefront" class="text-2xl" />
          </div>
          <div class="flex gap-1">
            <UButton icon="i-heroicons-pencil" variant="ghost" class="dc-btn-outline" size="xs" @click="openEdit(outlet)">Edit</UButton>
            <UButton icon="i-heroicons-trash" variant="ghost" color="error" size="xs" @click="confirmDelete(outlet)" />
          </div>
        </div>

        <h3 class="text-2xl font-semibold text-[#111d35]">{{ outlet.name }}</h3>
        <p class="text-[#6f809f] text-sm mt-1">{{ outlet.address }}</p>
        <p class="text-xs text-[#6f809f] mt-1">Jam operasional: {{ outlet.openTime || '-' }} - {{ outlet.closeTime || '-' }}</p>

        <div class="mt-3 pt-3 border-t border-[#d7e0ee] grid grid-cols-2 gap-2">
          <div>
            <p class="text-sm text-[#6f809f]">Staff Cabang</p>
            <p class="font-semibold text-[#1a2237]">-</p>
          </div>
          <div>
            <p class="text-sm text-[#6f809f]">Total Mesin</p>
            <p class="font-semibold text-[#1a2237]">-</p>
          </div>
        </div>
      </div>
    </div>

    <UModal v-model:open="showModal" :title="editTarget ? 'Edit Outlet/Cabang' : 'Tambah Outlet/Cabang'">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Nama Outlet">
              <UInput v-model="form.name" placeholder="Masukkan nama outlet" class="w-full" required />
            </UFormField>
            <UFormField label="Kode Outlet">
              <UInput v-model="form.code" placeholder="OUT-001" class="w-full" required :disabled="!!editTarget" />
            </UFormField>
          </div>
          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Jam Buka">
              <UInput v-model="form.openTime" placeholder="07:00" class="w-full" />
            </UFormField>
            <UFormField label="Jam Tutup">
              <UInput v-model="form.closeTime" placeholder="22:00" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Alamat Outlet">
            <UInput v-model="form.address" placeholder="Masukkan alamat lengkap" class="w-full" required />
          </UFormField>
          <UFormField label="URL Foto Outlet/Cabang">
            <UInput v-model="form.imageUrl" placeholder="https://..." class="w-full" />
          </UFormField>
          <UFormField label="No Telepon">
            <UInput v-model="form.phone" placeholder="Masukkan nomor telepon" class="w-full" required />
          </UFormField>
          <div class="flex justify-end pt-2">
            <UButton type="submit" class="dc-btn-primary px-4 py-2">{{ editTarget ? 'Simpan' : 'Tambah Cabang' }}</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="showDeleteModal" title="Hapus Outlet">
      <template #body>
        <p class="text-sm text-[#4f607f]">Yakin ingin menghapus outlet <strong>{{ deleteTarget?.name }}</strong>?</p>
        <div class="flex justify-end gap-2 pt-4">
          <UButton variant="ghost" @click="showDeleteModal = false">Batal</UButton>
          <UButton color="error" @click="doDelete">Hapus</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
