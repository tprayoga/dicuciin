<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse, Outlet, Kiosk } from '~/types'

const api = useApi()
const toast = useToast()

const outlets = ref<Outlet[]>([])
const meta = ref({ total: 0, page: 1, limit: 10, totalPages: 1 })
const loading = ref(false)
const search = ref('')
const kiosks = ref<Kiosk[]>([])

const showModal = ref(false)
const editTarget = ref<Outlet | null>(null)
const deleteTarget = ref<Outlet | null>(null)
const showDeleteModal = ref(false)
const showKioskModal = ref(false)
const kioskOutlet = ref<Outlet | null>(null)
const editKiosk = ref<Kiosk | null>(null)
const savingKiosk = ref(false)
const enrollmentCode = ref<{ code: string; expiresAt: string } | null>(null)

const form = reactive({
  name: '',
  code: '',
  address: '',
  phone: '',
  openTime: '',
  closeTime: '',
  imageUrl: '',
})

const kioskForm = reactive({
  kioskCode: '',
  name: '',
  location: '',
  status: 'ACTIVE',
  scheduleEnabled: false,
  scheduleDays: [1, 2, 3, 4, 5, 6, 7] as number[],
  scheduleOpenTime: '07:00',
  scheduleCloseTime: '22:00',
  timezone: 'Asia/Jakarta',
})

const dayOptions = [
  { label: 'Sen', value: 1 },
  { label: 'Sel', value: 2 },
  { label: 'Rab', value: 3 },
  { label: 'Kam', value: 4 },
  { label: 'Jum', value: 5 },
  { label: 'Sab', value: 6 },
  { label: 'Min', value: 7 },
]

async function load(page = 1) {
  loading.value = true
  try {
    const [outletRes, kioskRes] = await Promise.all([
      api.get<PaginatedResponse<Outlet>>(`/outlets?page=${page}&limit=50`),
      api.get<PaginatedResponse<Kiosk>>('/kiosks?page=1&limit=500'),
    ])
    outlets.value = outletRes.data
    meta.value = outletRes.meta
    kiosks.value = kioskRes.data
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat outlet', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

function outletKiosks(outletId: string) {
  return kiosks.value.filter(kiosk => kiosk.outletId === outletId)
}

function openKioskManager(outlet: Outlet) {
  kioskOutlet.value = outlet
  enrollmentCode.value = null
  resetKioskForm()
  showKioskModal.value = true
}

function resetKioskForm() {
  editKiosk.value = null
  Object.assign(kioskForm, {
    kioskCode: '',
    name: '',
    location: '',
    status: 'ACTIVE',
    scheduleEnabled: false,
    scheduleDays: [1, 2, 3, 4, 5, 6, 7],
    scheduleOpenTime: '07:00',
    scheduleCloseTime: '22:00',
    timezone: 'Asia/Jakarta',
  })
  enrollmentCode.value = null
}

function openKioskEdit(kiosk: Kiosk) {
  editKiosk.value = kiosk
  Object.assign(kioskForm, {
    kioskCode: kiosk.kioskCode,
    name: kiosk.name,
    location: kiosk.location || '',
    status: kiosk.status,
    scheduleEnabled: kiosk.scheduleEnabled ?? false,
    scheduleDays: kiosk.scheduleDays || [1, 2, 3, 4, 5, 6, 7],
    scheduleOpenTime: kiosk.scheduleOpenTime || '07:00',
    scheduleCloseTime: kiosk.scheduleCloseTime || '22:00',
    timezone: kiosk.timezone || 'Asia/Jakarta',
  })
  enrollmentCode.value = null
}

function toggleScheduleDay(day: number) {
  kioskForm.scheduleDays = kioskForm.scheduleDays.includes(day)
    ? kioskForm.scheduleDays.filter(value => value !== day)
    : [...kioskForm.scheduleDays, day].sort()
}

async function saveKiosk() {
  if (!kioskOutlet.value) return
  savingKiosk.value = true
  try {
    if (editKiosk.value) {
      await api.patch(`/kiosks/${editKiosk.value.id}`, {
        name: kioskForm.name,
        location: kioskForm.location || undefined,
        status: kioskForm.status,
        scheduleEnabled: kioskForm.scheduleEnabled,
        scheduleDays: kioskForm.scheduleDays,
        scheduleOpenTime: kioskForm.scheduleEnabled ? kioskForm.scheduleOpenTime : undefined,
        scheduleCloseTime: kioskForm.scheduleEnabled ? kioskForm.scheduleCloseTime : undefined,
        timezone: kioskForm.timezone,
      })
      toast.add({ title: 'Kiosk diperbarui', color: 'success' })
    } else {
      await api.post('/kiosks', {
        outletId: kioskOutlet.value.id,
        kioskCode: kioskForm.kioskCode,
        name: kioskForm.name,
        location: kioskForm.location || undefined,
      })
      toast.add({ title: 'Kiosk ditambahkan', color: 'success' })
    }
    resetKioskForm()
    await load(meta.value.page)
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan kiosk', description: e.message, color: 'error' })
  } finally {
    savingKiosk.value = false
  }
}

async function generateEnrollment(kiosk: Kiosk) {
  try {
    editKiosk.value = kiosk
    enrollmentCode.value = await api.post<{ code: string; expiresAt: string }>(
      `/kiosks/${kiosk.id}/enrollment-code`,
      {},
    )
    toast.add({ title: 'Kode enrollment dibuat', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Gagal membuat kode', description: e.message, color: 'error' })
  }
}

async function revokeEnrollment(kiosk: Kiosk) {
  if (!window.confirm(`Lepaskan perangkat dari ${kiosk.name}?`)) return
  try {
    await api.post(`/kiosks/${kiosk.id}/enrollment/revoke`, {})
    enrollmentCode.value = null
    toast.add({ title: 'Perangkat kiosk dilepaskan', color: 'success' })
    await load(meta.value.page)
  } catch (e: any) {
    toast.add({ title: 'Gagal melepas perangkat', description: e.message, color: 'error' })
  }
}

async function deleteKiosk(kiosk: Kiosk) {
  if (!window.confirm(`Hapus kiosk ${kiosk.name}?`)) return
  try {
    await api.del(`/kiosks/${kiosk.id}`)
    toast.add({ title: 'Kiosk dihapus', color: 'success' })
    await load(meta.value.page)
  } catch (e: any) {
    toast.add({ title: 'Gagal menghapus kiosk', description: e.message, color: 'error' })
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

        <div class="mt-3 pt-3 border-t border-[#d7e0ee] grid grid-cols-3 gap-2">
          <div>
            <p class="text-sm text-[#6f809f]">Staff Cabang</p>
            <p class="font-semibold text-[#1a2237]">-</p>
          </div>
          <div>
            <p class="text-sm text-[#6f809f]">Total Mesin</p>
            <p class="font-semibold text-[#1a2237]">-</p>
          </div>
          <div>
            <p class="text-sm text-[#6f809f]">Kiosk</p>
            <p class="font-semibold text-[#1a2237]">{{ outletKiosks(outlet.id).length }}</p>
          </div>
        </div>
        <UButton
          icon="i-heroicons-device-tablet"
          variant="soft"
          class="w-full justify-center mt-3"
          @click="openKioskManager(outlet)"
        >
          Kelola Kiosk
        </UButton>
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

    <UModal
      v-model:open="showKioskModal"
      :title="`Kelola Kiosk - ${kioskOutlet?.name || ''}`"
      :ui="{ content: 'sm:max-w-3xl' }"
    >
      <template #body>
        <div class="space-y-5">
          <div class="rounded-xl border border-[#d7e0ee] bg-[#f7f9fc] p-4">
            <div class="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 class="font-semibold text-[#111d35]">
                  {{ editKiosk ? 'Edit Perangkat Kiosk' : 'Tambah Perangkat Kiosk' }}
                </h3>
                <p class="text-xs text-[#6f809f]">
                  Kiosk otomatis terhubung ke {{ kioskOutlet?.name }}.
                </p>
              </div>
              <UButton v-if="editKiosk" variant="ghost" size="xs" @click="resetKioskForm">
                Batal Edit
              </UButton>
            </div>

            <form class="grid md:grid-cols-2 gap-3" @submit.prevent="saveKiosk">
              <UFormField label="Kode Kiosk">
                <UInput
                  v-model="kioskForm.kioskCode"
                  placeholder="KSK-OUT-01"
                  class="w-full"
                  required
                  :disabled="!!editKiosk"
                />
              </UFormField>
              <UFormField label="Nama Kiosk">
                <UInput v-model="kioskForm.name" placeholder="Kiosk Utama" class="w-full" required />
              </UFormField>
              <UFormField label="Lokasi Perangkat">
                <UInput v-model="kioskForm.location" placeholder="Area kasir / lobby" class="w-full" />
              </UFormField>
              <UFormField v-if="editKiosk" label="Status">
                <USelect
                  v-model="kioskForm.status"
                  :items="[
                    { label: 'Aktif', value: 'ACTIVE' },
                    { label: 'Nonaktif', value: 'INACTIVE' },
                    { label: 'Perawatan', value: 'MAINTENANCE' },
                  ]"
                  class="w-full"
                />
              </UFormField>
              <div v-if="editKiosk" class="md:col-span-2 rounded-xl border border-[#d7e0ee] bg-white p-3 space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-[#111d35]">Jadwal Operasional</p>
                    <p class="text-xs text-[#6f809f]">Di luar jadwal, kiosk menampilkan layar tutup.</p>
                  </div>
                  <USwitch v-model="kioskForm.scheduleEnabled" />
                </div>
                <template v-if="kioskForm.scheduleEnabled">
                  <div class="flex flex-wrap gap-2">
                    <UButton
                      v-for="day in dayOptions"
                      :key="day.value"
                      type="button"
                      size="xs"
                      :variant="kioskForm.scheduleDays.includes(day.value) ? 'solid' : 'outline'"
                      @click="toggleScheduleDay(day.value)"
                    >
                      {{ day.label }}
                    </UButton>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <UFormField label="Jam Mulai">
                      <UInput v-model="kioskForm.scheduleOpenTime" type="time" class="w-full" />
                    </UFormField>
                    <UFormField label="Jam Selesai">
                      <UInput v-model="kioskForm.scheduleCloseTime" type="time" class="w-full" />
                    </UFormField>
                  </div>
                  <UFormField label="Zona Waktu">
                    <UInput v-model="kioskForm.timezone" class="w-full" />
                  </UFormField>
                </template>
              </div>
              <div class="md:col-span-2 flex justify-end">
                <UButton type="submit" :loading="savingKiosk" icon="i-heroicons-check">
                  {{ editKiosk ? 'Simpan Perubahan' : 'Tambah Kiosk' }}
                </UButton>
              </div>
            </form>

            <div
              v-if="enrollmentCode && editKiosk"
              class="mt-4 rounded-xl border border-[#9fc1ef] bg-[#e8f1ff] p-4 text-center"
            >
              <p class="text-xs font-semibold tracking-wide text-[#4f607f]">KODE ENROLLMENT</p>
              <p class="my-2 text-4xl font-black tracking-[0.3em] text-[#0b4a97]">
                {{ enrollmentCode.code }}
              </p>
              <p class="text-xs text-[#6f809f]">
                Berlaku sampai {{ new Date(enrollmentCode.expiresAt).toLocaleTimeString('id-ID') }}.
                Masukkan kode ini pada perangkat kiosk.
              </p>
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-[#111d35]">Perangkat Terdaftar</h3>
              <span class="text-sm text-[#6f809f]">
                {{ kioskOutlet ? outletKiosks(kioskOutlet.id).length : 0 }} kiosk
              </span>
            </div>

            <div
              v-if="!kioskOutlet || outletKiosks(kioskOutlet.id).length === 0"
              class="rounded-xl border border-dashed border-[#cbd7e7] p-8 text-center text-sm text-[#6f809f]"
            >
              Belum ada kiosk untuk outlet ini.
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="kiosk in outletKiosks(kioskOutlet.id)"
                :key="kiosk.id"
                class="flex items-center gap-3 rounded-xl border border-[#d7e0ee] p-3"
              >
                <div class="h-10 w-10 rounded-xl bg-[#e8f1ff] text-[#0f6ee9] flex items-center justify-center">
                  <UIcon name="i-heroicons-device-tablet" class="text-xl" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <p class="font-semibold text-[#111d35] truncate">{{ kiosk.name }}</p>
                    <UBadge
                      :color="kiosk.status === 'ACTIVE' ? 'success' : kiosk.status === 'MAINTENANCE' ? 'warning' : 'neutral'"
                      variant="soft"
                      size="xs"
                    >
                      {{ kiosk.status }}
                    </UBadge>
                    <UBadge :color="kiosk.isEnrolled ? 'primary' : 'neutral'" variant="soft" size="xs">
                      {{ kiosk.isEnrolled ? 'Enrolled' : 'Belum Enroll' }}
                    </UBadge>
                  </div>
                  <p class="text-xs text-[#6f809f]">
                    {{ kiosk.kioskCode }} · {{ kiosk.location || 'Lokasi belum diisi' }}
                  </p>
                  <p v-if="kiosk.scheduleEnabled" class="text-xs text-[#6f809f]">
                    Jadwal {{ kiosk.scheduleOpenTime }}–{{ kiosk.scheduleCloseTime }}
                  </p>
                </div>
                <UButton
                  v-if="!kiosk.isEnrolled"
                  icon="i-heroicons-key"
                  variant="soft"
                  size="xs"
                  @click="generateEnrollment(kiosk)"
                >
                  Enroll
                </UButton>
                <UButton
                  v-else
                  icon="i-heroicons-link-slash"
                  variant="ghost"
                  color="warning"
                  size="xs"
                  @click="revokeEnrollment(kiosk)"
                />
                <UButton icon="i-heroicons-pencil" variant="ghost" size="xs" @click="openKioskEdit(kiosk)" />
                <UButton icon="i-heroicons-trash" variant="ghost" color="error" size="xs" @click="deleteKiosk(kiosk)" />
              </div>
            </div>
          </div>
        </div>
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
