<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import type { AppBanner, BannerPlacement, PaginatedResponse, Promo } from '~/types'

const api = useApi()
const toast = useToast()

const banners = ref<AppBanner[]>([])
const promos = ref<Promo[]>([])
const loading = ref(false)

const promoItems = computed(() => [
  { label: 'Tanpa promo', value: '' },
  ...promos.value.map(p => ({ label: `${p.code} — ${p.name}`, value: p.id })),
])

// Saat promo dipilih, otomatis isi judul (bila masih kosong) agar cepat.
watch(() => form.promoId, (id) => {
  if (!id) return
  const p = promos.value.find(x => x.id === id)
  if (p && !form.title.trim()) form.title = p.name
})
const showModal = ref(false)
const editTarget = ref<AppBanner | null>(null)
const deleteTarget = ref<AppBanner | null>(null)
const showDeleteModal = ref(false)

const placementItems = [
  { label: 'Pop-up saat masuk app', value: 'HOME_POPUP' },
  { label: 'Carousel halaman utama', value: 'HOME_CAROUSEL' },
]

function placementLabel(p: BannerPlacement) {
  return placementItems.find(i => i.value === p)?.label || p
}

const form = reactive({
  title: '',
  imageUrl: '',
  linkUrl: '',
  ctaLabel: '',
  promoId: '',
  placement: 'HOME_CAROUSEL' as BannerPlacement,
  sortOrder: 0,
  isActive: true,
  startDate: '',
  endDate: '',
})

function toInputDate(iso: string | null) {
  return iso ? iso.slice(0, 10) : ''
}

function periodLabel(b: AppBanner) {
  if (!b.startDate && !b.endDate) return 'Tanpa batas periode'
  const start = b.startDate ? new Date(b.startDate).toLocaleDateString('id-ID') : '—'
  const end = b.endDate ? new Date(b.endDate).toLocaleDateString('id-ID') : '—'
  return `${start} s.d. ${end}`
}

async function load() {
  loading.value = true
  try {
    const [bannerRes, promoRes] = await Promise.all([
      api.get<AppBanner[]>('/banners'),
      api.get<PaginatedResponse<Promo>>('/promos?page=1&limit=100'),
    ])
    banners.value = bannerRes
    promos.value = promoRes.data
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat banner', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editTarget.value = null
  Object.assign(form, {
    title: '',
    imageUrl: '',
    linkUrl: '',
    ctaLabel: '',
    promoId: '',
    placement: 'HOME_CAROUSEL',
    sortOrder: 0,
    isActive: true,
    startDate: '',
    endDate: '',
  })
  showModal.value = true
}

function openEdit(b: AppBanner) {
  editTarget.value = b
  Object.assign(form, {
    title: b.title,
    imageUrl: b.imageUrl,
    linkUrl: b.linkUrl || '',
    ctaLabel: b.ctaLabel || '',
    promoId: b.promoId || '',
    placement: b.placement,
    sortOrder: b.sortOrder,
    isActive: b.isActive,
    startDate: toInputDate(b.startDate),
    endDate: toInputDate(b.endDate),
  })
  showModal.value = true
}

function payload() {
  return {
    title: form.title,
    imageUrl: form.imageUrl,
    linkUrl: form.linkUrl || undefined,
    ctaLabel: form.ctaLabel || undefined,
    promoId: form.promoId || undefined,
    placement: form.placement,
    sortOrder: Number(form.sortOrder) || 0,
    isActive: form.isActive,
    startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
    endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
  }
}

async function save() {
  try {
    if (editTarget.value) {
      await api.patch(`/banners/${editTarget.value.id}`, payload())
      toast.add({ title: 'Banner diperbarui', color: 'success' })
    } else {
      await api.post('/banners', payload())
      toast.add({ title: 'Banner dibuat', color: 'success' })
    }
    showModal.value = false
    load()
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan', description: e.message, color: 'error' })
  }
}

function confirmDelete(b: AppBanner) {
  deleteTarget.value = b
  showDeleteModal.value = true
}

async function doDelete() {
  if (!deleteTarget.value) return
  try {
    await api.del(`/banners/${deleteTarget.value.id}`)
    toast.add({ title: 'Banner dihapus', color: 'success' })
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
      <p class="text-sm text-[#6f809f]">Pop-up saat masuk app & carousel di halaman utama pelanggan</p>
      <UButton icon="i-heroicons-plus" class="dc-btn-primary px-4 py-2" @click="openCreate">Tambah Banner</UButton>
    </div>

    <div v-if="loading" class="text-sm text-[#6f809f]">Memuat data banner...</div>

    <div v-else-if="banners.length === 0" class="dc-page-card p-8 text-center text-sm text-[#6f809f]">
      Belum ada banner. Klik "Tambah Banner" untuk membuat pop-up atau carousel.
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div v-for="banner in banners" :key="banner.id" class="dc-page-card overflow-hidden">
        <div
          class="h-[150px] border-b border-[#d7e0ee] flex items-center justify-center text-[#0f6ee9] font-semibold bg-gradient-to-r from-[#dce9f8] to-[#f3f7ff] bg-cover bg-center"
          :style="banner.imageUrl ? { backgroundImage: `url(${banner.imageUrl})` } : undefined"
        >
          <span v-if="!banner.imageUrl">Tanpa Gambar</span>
        </div>
        <div class="p-4">
          <div class="flex items-center gap-2">
            <span class="dc-pill" :class="banner.placement === 'HOME_POPUP' ? 'bg-[#fde8d6] text-[#b5701a]' : 'bg-[#dce9f8] text-[#0f6ee9]'">
              {{ placementLabel(banner.placement) }}
            </span>
            <span class="text-xs text-[#6f809f]">Urutan {{ banner.sortOrder }}</span>
          </div>
          <h3 class="text-lg font-semibold text-[#111d35] mt-2">{{ banner.title }}</h3>
          <p v-if="banner.promo" class="text-xs mt-1">
            <span class="inline-flex items-center gap-1 text-[#0f6ee9] font-semibold">
              <UIcon name="i-heroicons-ticket" /> Promo {{ banner.promo.code }}
            </span>
          </p>
          <p v-else-if="banner.linkUrl" class="text-xs text-[#0f6ee9] mt-1 truncate">{{ banner.linkUrl }}</p>
          <p class="text-sm text-[#6f809f] mt-1">{{ periodLabel(banner) }}</p>

          <div class="mt-4 flex items-center justify-between">
            <span class="dc-pill-success" :class="!banner.isActive ? '!bg-[#f2f4f8] !text-[#6f809f]' : ''">{{ banner.isActive ? 'Aktif' : 'Nonaktif' }}</span>
            <div class="flex gap-2">
              <UButton icon="i-heroicons-pencil" variant="ghost" class="dc-btn-outline" size="xs" @click="openEdit(banner)">Edit</UButton>
              <UButton icon="i-heroicons-trash" variant="ghost" color="error" size="xs" @click="confirmDelete(banner)" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <UModal v-model:open="showModal" :title="editTarget ? 'Edit Banner' : 'Tambah Banner'">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="Judul">
            <UInput v-model="form.title" placeholder="Mis. Diskon Akhir Pekan" class="w-full" required />
          </UFormField>

          <UFormField label="URL Gambar">
            <UInput v-model="form.imageUrl" placeholder="https://..." class="w-full" required />
            <div v-if="form.imageUrl" class="mt-2 h-28 rounded-lg border border-[#d7e0ee] bg-cover bg-center" :style="{ backgroundImage: `url(${form.imageUrl})` }" />
          </UFormField>

          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Penempatan">
              <USelect v-model="form.placement" :items="placementItems" class="w-full" />
            </UFormField>
            <UFormField label="Urutan Tampil">
              <UInput v-model.number="form.sortOrder" type="number" min="0" class="w-full" />
            </UFormField>
          </div>

          <UFormField label="Promo terkait (opsional)">
            <USelect v-model="form.promoId" :items="promoItems" class="w-full" />
            <p class="text-xs text-[#6f809f] mt-1">Jika dipilih, pelanggan yang mengetuk banner diarahkan ke promo & kodenya otomatis tersalin.</p>
          </UFormField>

          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Tautan saat diketuk (opsional)">
              <UInput v-model="form.linkUrl" placeholder="https://maps.app... (mis. ulasan Google)" class="w-full" />
            </UFormField>
            <UFormField label="Label Tombol (opsional)">
              <UInput v-model="form.ctaLabel" placeholder="Mis. Beri Ulasan" class="w-full" />
            </UFormField>
          </div>

          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Periode Mulai (opsional)">
              <UInput v-model="form.startDate" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Periode Selesai (opsional)">
              <UInput v-model="form.endDate" type="date" class="w-full" />
            </UFormField>
          </div>

          <UFormField label="Status">
            <USelect v-model="form.isActive" :items="[{ label: 'Aktif', value: true }, { label: 'Nonaktif', value: false }]" class="w-full" />
          </UFormField>

          <p class="text-xs text-[#6f809f]">Pop-up tampil sekali per sesi saat pelanggan membuka app. Carousel tampil di atas halaman utama sesuai urutan.</p>

          <div class="flex justify-end pt-2">
            <UButton type="submit" class="dc-btn-primary px-4 py-2">Simpan</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="showDeleteModal" title="Hapus Banner">
      <template #body>
        <p class="text-sm text-[#4f607f]">Yakin ingin menghapus banner <strong>{{ deleteTarget?.title }}</strong>?</p>
        <div class="flex justify-end gap-2 pt-4">
          <UButton variant="ghost" @click="showDeleteModal = false">Batal</UButton>
          <UButton color="error" @click="doDelete">Hapus</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
