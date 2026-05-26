<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse } from '~/types'

const api = useApi()
const toast = useToast()

interface ServiceItem {
  id: string
  name: string
  serviceType: string
  machineType: string | null
  capacityKg: number | null
  estimateMinutes: number | null
  basePrice: number | null
  description: string | null
  isActive: boolean
  createdAt: string
}

const services = ref<ServiceItem[]>([])
const meta = ref({ total: 0, page: 1, limit: 10, totalPages: 1 })
const loading = ref(false)
const showModal = ref(false)
const editTarget = ref<ServiceItem | null>(null)
const search = ref('')

const serviceTypeItems = [
  { label: 'Mesin Cuci (WASH)', value: 'WASH' },
  { label: 'Setrika (IRON)', value: 'IRON' },
  { label: 'Mesin Express (EXPRESS)', value: 'EXPRESS' },
  { label: 'Cuci + Setrika (WASH_IRON)', value: 'WASH_IRON' },
  { label: 'Dry Clean (DRY_CLEAN)', value: 'DRY_CLEAN' },
  { label: 'Lainnya (OTHER)', value: 'OTHER' },
]

const form = reactive({
  name: '',
  serviceType: 'WASH',
  machineType: 'WASHER',
  capacity: '',
  duration: '',
  price: '',
  isActive: true,
})

const filteredServices = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return services.value
  return services.value.filter(s => `${s.name} ${s.serviceType} ${s.description || ''}`.toLowerCase().includes(keyword))
})

async function load(page = 1) {
  loading.value = true
  try {
    const res = await api.get<PaginatedResponse<ServiceItem>>(`/services?page=${page}&limit=50`)
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
  Object.assign(form, { name: '', serviceType: 'WASH', machineType: 'WASHER', capacity: '', duration: '', price: '', isActive: true })
  showModal.value = true
}

function openEdit(s: ServiceItem) {
  editTarget.value = s
  Object.assign(form, {
    name: s.name,
    serviceType: s.serviceType,
    machineType: s.machineType || 'WASHER',
    capacity: s.capacityKg != null ? String(s.capacityKg) : '',
    duration: s.estimateMinutes != null ? String(s.estimateMinutes) : '',
    price: s.basePrice != null ? String(s.basePrice) : '',
    isActive: s.isActive,
  })
  showModal.value = true
}

async function save() {
  try {
    const payload = {
      name: form.name,
      serviceType: form.serviceType,
      machineType: form.machineType || undefined,
      capacityKg: form.capacity ? Number(form.capacity) : undefined,
      estimateMinutes: form.duration ? Number(form.duration) : undefined,
      basePrice: form.price ? Number(form.price) : undefined,
      description: undefined,
      isActive: form.isActive,
    }

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

async function deactivateService(service: ServiceItem) {
  if (!service.isActive) return

  const confirmed = import.meta.client ? window.confirm(`Nonaktifkan layanan ${service.name}?`) : false
  if (!confirmed) return

  try {
    await api.patch(`/services/${service.id}`, { isActive: false })
    toast.add({ title: 'Layanan dinonaktifkan', color: 'success' })
    load(meta.value.page)
  } catch (e: any) {
    toast.add({ title: 'Gagal menonaktifkan layanan', description: e.message, color: 'error' })
  }
}

onMounted(() => load())
</script>

<template>
  <div class="space-y-4">
    <div class="dc-page-card p-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 rounded-xl bg-[#dce9f8] text-[#0f6ee9] flex items-center justify-center">
          <UIcon name="i-heroicons-wrench-screwdriver" class="text-xl" />
        </div>
        <div>
          <h2 class="text-lg font-semibold">Kelola Layanan</h2>
          <p class="text-sm text-[#6f809f]">Tambah, Ubah atau Hapus layanan laundry milik Anda.</p>
        </div>
      </div>
      <UButton icon="i-heroicons-plus" class="dc-btn-primary px-4 py-2" @click="openCreate">Tambah Layanan</UButton>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-lg">Total: <span class="text-[#0f6ee9] font-semibold">{{ filteredServices.length }} Layanan</span></p>
      <UInput v-model="search" icon="i-heroicons-magnifying-glass" placeholder="Cari Layanan" class="w-full max-w-xs dc-input-like" />
    </div>

    <div v-if="loading" class="text-sm text-[#6f809f]">Memuat data layanan...</div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div v-for="service in filteredServices" :key="service.id" class="dc-page-card p-4">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="h-12 w-12 rounded-xl bg-[#dce9f8] text-[#0f6ee9] flex items-center justify-center">
              <UIcon name="i-heroicons-wrench-screwdriver" class="text-2xl" />
            </div>
            <span class="dc-pill-success" :class="!service.isActive ? '!bg-[#f2f4f8] !text-[#6f809f]' : ''">{{ service.isActive ? 'Aktif' : 'Nonaktif' }}</span>
          </div>
          <div class="flex items-center gap-1">
            <UButton icon="i-heroicons-pencil" variant="ghost" class="dc-btn-outline" size="xs" @click="openEdit(service)">Edit</UButton>
            <UButton
              icon="i-heroicons-no-symbol"
              variant="ghost"
              color="warning"
              size="xs"
              :disabled="!service.isActive"
              @click="deactivateService(service)"
            />
          </div>
        </div>

        <h3 class="text-[32px] font-semibold text-[#111d35] mb-3">{{ service.name }}</h3>
        <p class="text-sm text-[#6f809f]">Tipe Mesin</p>
        <p class="font-medium">{{ service.machineType || (serviceTypeItems.find(i => i.value === service.serviceType)?.label || service.serviceType) }}</p>

        <div class="grid grid-cols-2 gap-3 mt-3">
          <div>
            <p class="text-sm text-[#6f809f]">Kapasitan Mesin</p>
            <p class="font-medium">{{ service.capacityKg != null ? `${service.capacityKg} KG` : '-' }}</p>
          </div>
          <div>
            <p class="text-sm text-[#6f809f]">Estimasi</p>
            <p class="font-medium">{{ service.estimateMinutes != null ? `${service.estimateMinutes} Menit` : '-' }}</p>
          </div>
        </div>

        <div class="mt-3 pt-3 border-t border-[#d7e0ee] flex items-center justify-between">
          <p class="text-sm text-[#6f809f]">Harga Layanan</p>
          <p class="text-[#19984d] font-semibold">Rp {{ service.basePrice != null ? service.basePrice.toLocaleString('id-ID') : '-' }}</p>
        </div>
      </div>
    </div>

    <UModal v-model:open="showModal" :title="editTarget ? 'Edit Layanan' : 'Tambah Layanan'">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="Nama Layanan">
            <UInput v-model="form.name" placeholder="Masukkan nama layanan" class="w-full" required />
          </UFormField>
          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Tipe Mesin">
              <USelect v-model="form.machineType" :items="[{ label: 'Mesin Cuci (Washer)', value: 'WASHER' }, { label: 'Mesin Pengering (Dryer)', value: 'DRYER' }, { label: 'Setrika', value: 'IRON' }, { label: 'Lainnya', value: 'OTHER' }]" class="w-full" />
            </UFormField>
            <UFormField label="Kapasitas Mesin">
              <UInput v-model="form.capacity" placeholder="Pilih Kapasitas" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Kategori Service">
            <USelect v-model="form.serviceType" :items="serviceTypeItems" class="w-full" />
          </UFormField>
          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Harga (Rp)">
              <UInput v-model="form.price" placeholder="Masukkan harga" class="w-full" />
            </UFormField>
            <UFormField label="Estimasi (menit)">
              <UInput v-model="form.duration" placeholder="Masukkan estimasi" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Status">
            <USelect v-model="form.isActive" :items="[{ label: 'Aktif', value: true }, { label: 'Nonaktif', value: false }]" class="w-full" />
          </UFormField>
          <div class="flex justify-end pt-2">
            <UButton type="submit" class="dc-btn-primary px-4 py-2">Simpan</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
