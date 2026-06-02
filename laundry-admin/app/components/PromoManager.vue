<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse, Promo } from '~/types'

const api = useApi()
const toast = useToast()

const promos = ref<Promo[]>([])
const loading = ref(false)
const uploading = ref(false)
const search = ref('')

async function onFilePick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const res = await api.upload<{ url: string }>('/uploads/image', file)
    form.bannerUrl = res.url
    toast.add({ title: 'Gambar terunggah', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Gagal mengunggah gambar', description: err.message, color: 'error' })
  } finally {
    uploading.value = false
    input.value = ''
  }
}
const showModal = ref(false)
const editTarget = ref<Promo | null>(null)
const deleteTarget = ref<Promo | null>(null)
const showDeleteModal = ref(false)

const promoTypeItems = [
  { label: 'Persentase (%)', value: 'PERCENTAGE' },
  { label: 'Nominal (Rp)', value: 'FIXED_AMOUNT' },
  { label: 'Cashback Wallet (%)', value: 'CASHBACK' },
  { label: 'Gratis Ongkir', value: 'FREE_DELIVERY' },
]

const valueHint = computed(() => {
  switch (form.promoType) {
    case 'PERCENTAGE': return 'Dalam persen. Contoh: 20 = diskon 20%.'
    case 'FIXED_AMOUNT': return 'Dalam Rupiah. Contoh: 10000 = potongan Rp 10.000.'
    case 'CASHBACK': return 'Persen cashback ke wallet. Contoh: 5 = cashback 5%.'
    case 'FREE_DELIVERY': return 'Gratis ongkir — nilai tidak dipakai (isi 0).'
    default: return ''
  }
})
const valueSuffix = computed(() =>
  form.promoType === 'FIXED_AMOUNT' ? 'Rp' : (form.promoType === 'FREE_DELIVERY' ? '' : '%'),
)

const form = reactive({
  code: '',
  name: '',
  description: '',
  bannerUrl: '',
  promoType: 'PERCENTAGE',
  value: 0,
  startDate: '',
  endDate: '',
  quota: 100,
  isActive: true,
})

const filteredPromos = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return promos.value
  return promos.value.filter(p => `${p.code} ${p.name} ${p.description || ''}`.toLowerCase().includes(keyword))
})

function toInputDate(iso: string) {
  return iso ? iso.slice(0, 10) : ''
}

function promoPeriod(promo: Promo) {
  const start = new Date(promo.startDate).toLocaleDateString('id-ID')
  const end = new Date(promo.endDate).toLocaleDateString('id-ID')
  return `Periode ${start} s.d. ${end}`
}

async function load() {
  loading.value = true
  try {
    const res = await api.get<PaginatedResponse<Promo>>('/promos?page=1&limit=100')
    promos.value = res.data
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat promo', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editTarget.value = null
  Object.assign(form, {
    code: '',
    name: '',
    description: '',
    bannerUrl: '',
    promoType: 'PERCENTAGE',
    value: 0,
    startDate: '',
    endDate: '',
    quota: 100,
    isActive: true,
  })
  showModal.value = true
}

function openEdit(p: Promo) {
  editTarget.value = p
  Object.assign(form, {
    code: p.code,
    name: p.name,
    description: p.description || '',
    bannerUrl: p.bannerUrl || '',
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
    if (editTarget.value) {
      await api.patch(`/promos/${editTarget.value.id}`, {
        name: form.name,
        description: form.description || undefined,
        bannerUrl: form.bannerUrl || undefined,
        endDate: new Date(form.endDate).toISOString(),
        quota: form.quota,
        isActive: form.isActive,
      })
      toast.add({ title: 'Promo diperbarui', color: 'success' })
    } else {
      await api.post('/promos', {
        code: form.code,
        name: form.name,
        description: form.description || undefined,
        bannerUrl: form.bannerUrl || undefined,
        promoType: form.promoType,
        value: form.value,
        startDate: new Date(form.startDate).toISOString(),
        endDate: new Date(form.endDate).toISOString(),
        quota: form.quota,
        isActive: form.isActive,
      })
      toast.add({ title: 'Promo dibuat', color: 'success' })
    }
    showModal.value = false
    load()
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
    load()
  } catch (e: any) {
    toast.add({ title: 'Gagal menghapus', description: e.message, color: 'error' })
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <UInput v-model="search" icon="i-heroicons-magnifying-glass" placeholder="Cari promo" class="w-full max-w-xs dc-input-like" />
      <UButton icon="i-heroicons-plus" class="dc-btn-primary px-4 py-2" @click="openCreate">Tambah Promo</UButton>
    </div>

    <div v-if="loading" class="text-sm text-[#6f809f]">Memuat data promo...</div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div v-for="promo in filteredPromos" :key="promo.id" class="dc-page-card overflow-hidden">
        <div
          class="h-[150px] border-b border-[#d7e0ee] flex items-center justify-center text-[#0f6ee9] font-semibold bg-gradient-to-r from-[#dce9f8] to-[#f3f7ff] bg-cover bg-center"
          :style="promo.bannerUrl ? { backgroundImage: `url(${promo.bannerUrl})` } : undefined"
        >
          <span v-if="!promo.bannerUrl">Banner Promo</span>
        </div>
        <div class="p-4">
          <h3 class="text-2xl font-semibold text-[#111d35]">{{ promo.name }}</h3>
          <p class="text-sm text-[#6f809f] mt-1">{{ promo.description || 'Deskripsi singkat promo' }}</p>
          <p class="text-sm text-[#0f6ee9] mt-2">{{ promoPeriod(promo) }}</p>

          <div class="mt-4 flex items-center justify-between">
            <span class="dc-pill-success" :class="!promo.isActive ? '!bg-[#f2f4f8] !text-[#6f809f]' : ''">{{ promo.isActive ? 'Aktif' : 'Nonaktif' }}</span>
            <div class="flex gap-2">
              <UButton icon="i-heroicons-pencil" variant="ghost" class="dc-btn-outline" size="xs" @click="openEdit(promo)">Edit</UButton>
              <UButton icon="i-heroicons-trash" variant="ghost" color="error" size="xs" @click="confirmDelete(promo)" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <UModal v-model:open="showModal" :title="editTarget ? 'Edit Promo' : 'Tambah Promo'">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="Nama Promo">
            <UInput v-model="form.name" placeholder="Masukkan nama" class="w-full" required />
          </UFormField>

          <UFormField label="Deskripsi Promo">
            <UTextarea v-model="form.description" placeholder="Masukkan deskripsi" class="w-full" :rows="2" />
          </UFormField>

          <UFormField label="Gambar Promo">
            <div class="flex items-center gap-3">
              <label class="dc-btn-outline px-4 py-2 rounded-lg cursor-pointer text-sm whitespace-nowrap">
                <input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="onFilePick">
                {{ uploading ? 'Mengunggah...' : (form.bannerUrl ? 'Ganti Gambar' : 'Pilih Gambar') }}
              </label>
              <span class="text-xs text-[#6f809f]">Dipakai di halaman promo & banner yang menautkan promo ini</span>
            </div>
            <div v-if="form.bannerUrl" class="mt-2 h-28 rounded-lg border border-[#d7e0ee] bg-cover bg-center" :style="{ backgroundImage: `url(${form.bannerUrl})` }" />
          </UFormField>

          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Kategori Promo">
              <USelect v-model="form.promoType" :items="promoTypeItems" class="w-full" :disabled="!!editTarget" />
            </UFormField>
            <UFormField label="Kode Promo">
              <UInput v-model="form.code" placeholder="Buat kode promo" class="w-full" required :disabled="!!editTarget" />
            </UFormField>
          </div>

          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Nilai Promo">
              <UInput v-model.number="form.value" type="number" min="0" placeholder="Masukkan nominal" class="w-full" :disabled="!!editTarget || form.promoType === 'FREE_DELIVERY'">
                <template v-if="valueSuffix" #trailing>
                  <span class="text-xs text-[#6f809f]">{{ valueSuffix }}</span>
                </template>
              </UInput>
              <p class="text-xs text-[#6f809f] mt-1">{{ valueHint }}</p>
            </UFormField>
            <UFormField label="Status Promo">
              <USelect v-model="form.isActive" :items="[{ label: 'Aktif', value: true }, { label: 'Nonaktif', value: false }]" class="w-full" />
            </UFormField>
          </div>

          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Periode Mulai">
              <UInput v-model="form.startDate" type="date" class="w-full" required :disabled="!!editTarget" />
            </UFormField>
            <UFormField label="Periode Selesai">
              <UInput v-model="form.endDate" type="date" class="w-full" required />
            </UFormField>
          </div>

          <p class="text-xs text-[#6f809f]">Isi URL gambar agar banner tampil di halaman promo</p>

          <div class="flex justify-end pt-2">
            <UButton type="submit" class="dc-btn-primary px-4 py-2">Simpan</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="showDeleteModal" title="Hapus Promo">
      <template #body>
        <p class="text-sm text-[#4f607f]">Yakin ingin menghapus promo <strong>{{ deleteTarget?.code }}</strong>?</p>
        <div class="flex justify-end gap-2 pt-4">
          <UButton variant="ghost" @click="showDeleteModal = false">Batal</UButton>
          <UButton color="error" @click="doDelete">Hapus</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
