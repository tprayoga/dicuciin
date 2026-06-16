<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import type { AppBanner, BannerPlacement, PaginatedResponse, Promo } from '~/types'

const api = useApi()
const toast = useToast()

const banners = ref<AppBanner[]>([])
const promos = ref<Promo[]>([])
const loading = ref(false)

const promoItems = computed(() =>
  promos.value.map(p => ({ label: `${p.code} — ${p.name}`, value: p.id })),
)

// Aksi saat banner diketuk: tidak ada / buka promo / tautan eksternal.
const actionMode = ref<'none' | 'promo' | 'link'>('none')
const actionItems = [
  { label: 'Tidak ada', value: 'none' },
  { label: 'Buka promo (kode tersalin)', value: 'promo' },
  { label: 'Tautan eksternal', value: 'link' },
]

const uploading = ref(false)

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

// Saat promo dipilih: judul auto (bila kosong) + GAMBAR mengikuti gambar promo
// (satu gambar yang sama, tidak upload dua kali).
watch(() => form.promoId, (id) => {
  if (!id) return
  const p = promos.value.find(x => x.id === id)
  if (!p) return
  if (!form.title.trim()) form.title = p.name
  form.imageUrl = p.bannerUrl || ''
})

// Gambar promo yang terpilih (untuk preview/validasi di mode promo).
const selectedPromoImage = computed(() => {
  const p = promos.value.find(x => x.id === form.promoId)
  return p?.bannerUrl || ''
})

// Saat mode aksi berganti, bersihkan field yang tak relevan agar tak ada data sisa.
watch(actionMode, (m) => {
  if (m !== 'promo') form.promoId = ''
  if (m !== 'link') { form.linkUrl = ''; form.ctaLabel = '' }
})

async function onFilePick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    toast.add({
      title: 'Format gambar tidak didukung',
      description: 'Gunakan file JPG, PNG, atau WebP.',
      color: 'error',
    })
    input.value = ''
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    toast.add({
      title: 'Ukuran gambar terlalu besar',
      description: 'Ukuran maksimal gambar adalah 10 MB.',
      color: 'error',
    })
    input.value = ''
    return
  }
  uploading.value = true
  try {
    const res = await api.upload<{ url: string }>('/uploads/image', file)
    form.imageUrl = res.url
    toast.add({ title: 'Gambar terunggah', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Gagal mengunggah gambar', description: err.message, color: 'error' })
  } finally {
    uploading.value = false
    input.value = ''
  }
}

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
  actionMode.value = 'none'
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
  actionMode.value = b.promoId ? 'promo' : (b.linkUrl ? 'link' : 'none')
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
    linkUrl: actionMode.value === 'link' ? (form.linkUrl || undefined) : undefined,
    ctaLabel: actionMode.value === 'link' ? (form.ctaLabel || undefined) : undefined,
    promoId: actionMode.value === 'promo' ? (form.promoId || undefined) : undefined,
    placement: form.placement,
    sortOrder: Number(form.sortOrder) || 0,
    isActive: form.isActive,
    startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
    endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
  }
}

async function save() {
  if (actionMode.value === 'promo') {
    if (!form.promoId) {
      toast.add({ title: 'Pilih promo dulu', color: 'error' })
      return
    }
    // Gambar banner = gambar promo (satu sumber).
    form.imageUrl = selectedPromoImage.value
    if (!form.imageUrl) {
      toast.add({ title: 'Promo belum punya gambar', description: 'Unggah gambar di tab Promo & Voucher dulu.', color: 'error' })
      return
    }
  } else if (!form.imageUrl) {
    toast.add({ title: 'Gambar wajib diunggah', color: 'error' })
    return
  }
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
          class="h-[150px] border-b border-[#d7e0ee] flex items-center justify-center text-[#0360da] font-semibold bg-gradient-to-r from-[#dce9f8] to-[#f3f7ff] bg-cover bg-center"
          :style="banner.imageUrl ? { backgroundImage: `url(${banner.imageUrl})` } : undefined"
        >
          <span v-if="!banner.imageUrl">Tanpa Gambar</span>
        </div>
        <div class="p-4">
          <div class="flex items-center gap-2">
            <span class="dc-pill" :class="banner.placement === 'HOME_POPUP' ? 'bg-[#fde8d6] text-[#b5701a]' : 'bg-[#dce9f8] text-[#0360da]'">
              {{ placementLabel(banner.placement) }}
            </span>
            <span class="text-xs text-[#6f809f]">Urutan {{ banner.sortOrder }}</span>
          </div>
          <h3 class="text-lg font-semibold text-[#111d35] mt-2">{{ banner.title }}</h3>
          <p v-if="banner.promo" class="text-xs mt-1">
            <span class="inline-flex items-center gap-1 text-[#0360da] font-semibold">
              <UIcon name="i-heroicons-ticket" /> Promo {{ banner.promo.code }}
            </span>
          </p>
          <p v-else-if="banner.linkUrl" class="text-xs text-[#0360da] mt-1 truncate">{{ banner.linkUrl }}</p>
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

          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Penempatan">
              <USelect v-model="form.placement" :items="placementItems" class="w-full" />
            </UFormField>
            <UFormField label="Urutan Tampil">
              <UInput v-model.number="form.sortOrder" type="number" min="0" class="w-full" />
            </UFormField>
          </div>

          <!-- Aksi saat diketuk: satu pilihan (promo / link / tidak ada) -->
          <UFormField label="Aksi saat banner diketuk">
            <USelect v-model="actionMode" :items="actionItems" class="w-full" />
          </UFormField>

          <UFormField v-if="actionMode === 'promo'" label="Promo">
            <USelect v-model="form.promoId" :items="promoItems" placeholder="Pilih promo" class="w-full" />
            <p class="text-xs text-[#6f809f] mt-1">Pelanggan yang mengetuk banner diarahkan ke halaman promo & kodenya otomatis tersalin. Judul otomatis terisi dari promo.</p>
          </UFormField>

          <div v-else-if="actionMode === 'link'" class="grid md:grid-cols-2 gap-4">
            <UFormField label="Tautan (URL)">
              <UInput v-model="form.linkUrl" placeholder="https://maps.app... (mis. ulasan Google)" class="w-full" />
            </UFormField>
            <UFormField label="Label Tombol">
              <UInput v-model="form.ctaLabel" placeholder="Mis. Beri Ulasan" class="w-full" />
            </UFormField>
          </div>

          <!-- Gambar: mode promo → ikut gambar promo (satu gambar). Selain itu → upload. -->
          <UFormField label="Gambar Banner">
            <template v-if="actionMode === 'promo'">
              <div v-if="selectedPromoImage" class="h-32 rounded-lg border border-[#d7e0ee] bg-cover bg-center" :style="{ backgroundImage: `url(${selectedPromoImage})` }" />
              <p v-else class="text-sm text-[#b5701a]">Promo ini belum punya gambar. Unggah gambar di tab <strong>Promo & Voucher</strong> dulu.</p>
              <p class="text-xs text-[#6f809f] mt-1">Gambar mengikuti gambar promo agar konsisten.</p>
            </template>
            <template v-else>
              <div class="flex items-center gap-3">
                <label class="dc-btn-outline px-4 py-2 rounded-lg cursor-pointer text-sm whitespace-nowrap">
                  <input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="onFilePick">
                  {{ uploading ? 'Mengunggah...' : (form.imageUrl ? 'Ganti Gambar' : 'Pilih Gambar') }}
                </label>
                <span class="text-xs text-[#6f809f]">PNG/JPG/WebP, maks. 10 MB</span>
              </div>
              <div v-if="form.imageUrl" class="mt-2 h-32 rounded-lg border border-[#d7e0ee] bg-cover bg-center" :style="{ backgroundImage: `url(${form.imageUrl})` }" />
            </template>
          </UFormField>

          <div class="grid md:grid-cols-3 gap-4">
            <UFormField label="Mulai (opsional)">
              <UInput v-model="form.startDate" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Selesai (opsional)">
              <UInput v-model="form.endDate" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Status">
              <USelect v-model="form.isActive" :items="[{ label: 'Aktif', value: true }, { label: 'Nonaktif', value: false }]" class="w-full" />
            </UFormField>
          </div>

          <div class="flex justify-end pt-2">
            <UButton type="submit" :disabled="uploading" class="dc-btn-primary px-4 py-2">Simpan</UButton>
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
