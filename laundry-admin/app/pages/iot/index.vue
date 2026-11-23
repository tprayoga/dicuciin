<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse, IotDevice, Outlet, Service } from '~/types'

const api = useApi()
const toast = useToast()

const devices = ref<IotDevice[]>([])
const outlets = ref<Outlet[]>([])
const services = ref<Service[]>([])
const loading = ref(false)
const search = ref('')

const showModal = ref(false)
const editTarget = ref<IotDevice | null>(null)

const form = reactive({
  outletId: '',
  deviceCode: '',
  deviceType: 'WASHING_MACHINE',
  name: '',
  // Batch 6 (S3): sumber kebenaran kapasitas & harga mesin di aplikasi.
  capacityKg: '' as string,
  serviceId: '' as string,
  // Mode MANUAL: mesin belum terhubung IoT — kondisi dipilih admin, scan QR di
  // aplikasi langsung menandai mesin dipakai, selesai sesuai estimasi durasi.
  controlMode: 'IOT' as 'IOT' | 'MANUAL',
  manualStatus: 'ONLINE' as 'ONLINE' | 'MAINTENANCE',
})

const controlModeItems = [
  { label: 'IoT — otomatis dari perangkat', value: 'IOT' },
  { label: 'Manual — tanpa IoT', value: 'MANUAL' },
]
const manualStatusItems = [
  { label: 'Tersedia — bisa dipesan di aplikasi', value: 'ONLINE' },
  { label: 'Maintenance — tidak bisa dipesan', value: 'MAINTENANCE' },
]

const NO_SERVICE = '__none__'
const isMachine = computed(() => form.deviceType === 'WASHING_MACHINE' || form.deviceType === 'DRYER_MACHINE')
/** Layanan yang cocok tipe mesin (pengering ↔ DRYER; cuci ↔ WASHER/WASHER_DRYER). */
const serviceOptions = computed(() => {
  const wantDryer = form.deviceType === 'DRYER_MACHINE'
  const items = services.value
    .filter(s => s.isActive)
    .filter((s) => {
      const mt = (s.machineType || '').toUpperCase()
      return wantDryer ? mt === 'DRYER' : mt === 'WASHER' || mt === 'WASHER_DRYER'
    })
    .map(s => ({ label: `${s.name}${s.capacityKg ? ` (${s.capacityKg} kg)` : ''}`, value: s.id }))
  return [{ label: '— Belum diatur —', value: NO_SERVICE }, ...items]
})

function machinePayload() {
  const cap = Number(form.capacityKg)
  const wasManual = editTarget.value?.controlMode === 'MANUAL'
  return {
    capacityKg: form.capacityKg === '' || !Number.isFinite(cap) ? null : cap,
    serviceId: !form.serviceId || form.serviceId === NO_SERVICE ? null : form.serviceId,
    controlMode: form.controlMode,
    // Manual: kondisi dari admin. Kembali ke IoT: OFFLINE sampai perangkat lapor.
    ...(form.controlMode === 'MANUAL'
      ? { status: form.manualStatus }
      : wasManual ? { status: 'OFFLINE' } : {}),
  }
}

const deviceTypeItems = [
  { label: 'Mesin Cuci (Washer)', value: 'WASHING_MACHINE' },
  { label: 'Mesin Pengering (Dryer)', value: 'DRYER_MACHINE' },
  { label: 'KIOSK', value: 'KIOSK' },
  { label: 'Timbangan Digital', value: 'DIGITAL_SCALE' },
]

const outletOptions = computed(() => outlets.value.map(o => ({ label: o.name, value: o.id })))

const ALL = 'all'
const outletFilter = ref(ALL)
const conditionFilter = ref(ALL)
const outletFilterItems = computed(() => [
  { label: 'Semua Cabang', value: ALL },
  ...outlets.value.map(o => ({ label: o.name, value: o.id })),
])
const conditionFilterItems = [
  { label: 'Semua kondisi', value: ALL },
  { label: 'Tersedia', value: 'AVAILABLE' },
  { label: 'Sedang dipakai / dipesan', value: 'BUSY' },
  { label: 'Maintenance', value: 'MAINTENANCE' },
  { label: 'Offline / belum terhubung', value: 'OFFLINE' },
]

const isMachineDevice = (d: IotDevice) => d.deviceType === 'WASHING_MACHINE' || d.deviceType === 'DRYER_MACHINE'

/**
 * Kondisi mesin = status yang dilihat pelanggan di aplikasi (dihitung server dari
 * booking aktif + status perangkat). Perangkat non-mesin memakai status perangkat.
 */
function conditionKey(d: IotDevice): 'AVAILABLE' | 'BUSY' | 'MAINTENANCE' | 'OFFLINE' {
  const s = isMachineDevice(d) ? (d.availability ?? 'OFFLINE') : d.status
  if (s === 'AVAILABLE' || s === 'ONLINE') return 'AVAILABLE'
  if (s === 'IN_USE' || s === 'RESERVED') return 'BUSY'
  if (s === 'MAINTENANCE') return 'MAINTENANCE'
  return 'OFFLINE'
}

const filteredDevices = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return devices.value.filter(d =>
    (outletFilter.value === ALL || d.outletId === outletFilter.value)
    && (conditionFilter.value === ALL || conditionKey(d) === conditionFilter.value)
    && (!keyword || `${d.name} ${d.deviceCode} ${d.outlet?.name || ''}`.toLowerCase().includes(keyword)),
  )
})

/** Ringkasan untuk baris "Total Mesin" — angka sama dengan "x dari y mesin tersedia" di aplikasi. */
const machineSummary = computed(() => {
  const machines = filteredDevices.value.filter(isMachineDevice)
  return {
    total: machines.length,
    available: machines.filter(d => conditionKey(d) === 'AVAILABLE').length,
    active: machines.filter(d => machineActive(d)).length,
    others: filteredDevices.value.length - machines.length,
  }
})

function machineCondition(device: IotDevice) {
  const manual = device.controlMode === 'MANUAL' ? 'Manual · ' : ''
  switch (conditionKey(device)) {
    case 'AVAILABLE':
      return { label: `${manual}${isMachineDevice(device) ? 'Tersedia' : 'Normal'}`, className: 'bg-[#1fa150] text-white' }
    case 'BUSY':
      return { label: device.availability === 'RESERVED' ? 'Dipesan' : 'Sedang dipakai', className: 'bg-[#0360da] text-white' }
    case 'MAINTENANCE':
      return { label: `${manual}Maintenance`, className: 'bg-[#e28a05] text-white' }
    default:
      // Mesin baru yang belum pernah mengirim heartbeat bukan "perlu servis".
      if (!device.lastHeartbeatAt) return { label: 'Belum terhubung', className: 'bg-[#eef1f5] text-[#5d6b82]' }
      return { label: 'Offline', className: 'bg-[#d6280b] text-white' }
  }
}

/** Aktif = beroperasi (bisa dipakai pelanggan sekarang atau setelah pemakaian selesai). */
function machineActive(device: IotDevice) {
  const k = conditionKey(device)
  return k === 'AVAILABLE' || k === 'BUSY'
}

// Hapus mesin hanya SUPER_ADMIN (server menolak bila masih ada booking aktif).
const { remove: removeItem, isSuperAdmin } = useDeleteAction()
function deleteDevice(device: { id: string; name?: string | null; deviceCode: string }) {
  return removeItem({
    path: `/iot/devices/${device.id}`,
    label: `mesin ${device.name || device.deviceCode}`,
    note: 'Mesin yang masih punya booking aktif tidak bisa dihapus — ubah kondisinya menjadi Maintenance agar tidak bisa dipesan.',
    onDone: load,
  })
}

async function load() {
  loading.value = true
  try {
    const [devRes, outletRes, svcRes] = await Promise.all([
      api.get<PaginatedResponse<IotDevice>>('/iot/devices?page=1&limit=100'),
      api.get<PaginatedResponse<Outlet>>('/outlets?page=1&limit=100'),
      api.get<PaginatedResponse<Service>>('/services?page=1&limit=100'),
    ])
    devices.value = devRes.data
    outlets.value = outletRes.data
    services.value = svcRes.data
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat mesin', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editTarget.value = null
  Object.assign(form, {
    outletId: outlets.value[0]?.id || '',
    deviceCode: '',
    deviceType: 'WASHING_MACHINE',
    name: '',
    capacityKg: '',
    serviceId: NO_SERVICE,
    controlMode: 'IOT',
    manualStatus: 'ONLINE',
  })
  showModal.value = true
}

function openEdit(device: IotDevice) {
  editTarget.value = device
  Object.assign(form, {
    outletId: device.outletId,
    deviceCode: device.deviceCode,
    deviceType: device.deviceType,
    name: device.name,
    capacityKg: device.capacityKg != null ? String(device.capacityKg) : '',
    serviceId: device.serviceId || NO_SERVICE,
    controlMode: device.controlMode === 'MANUAL' ? 'MANUAL' : 'IOT',
    manualStatus: device.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'ONLINE',
  })
  showModal.value = true
}

async function save() {
  try {
    if (editTarget.value) {
      await api.patch(`/iot/devices/${editTarget.value.id}`, {
        name: form.name,
        ...(isMachine.value ? machinePayload() : {}),
      })
      toast.add({ title: 'Mesin diperbarui', color: 'success' })
    } else {
      await api.post('/iot/devices', {
        outletId: form.outletId,
        deviceCode: form.deviceCode,
        deviceType: form.deviceType,
        name: form.name,
        ...(isMachine.value ? machinePayload() : {}),
      })
      toast.add({ title: 'Mesin ditambahkan', color: 'success' })
    }
    showModal.value = false
    load()
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan', description: e.message, color: 'error' })
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="dc-page-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 rounded-xl bg-[#dce9f8] text-[#0360da] flex items-center justify-center">
          <UIcon name="i-heroicons-computer-desktop" class="text-xl" />
        </div>
        <div>
          <h2 class="text-lg font-semibold">Kelola Mesin</h2>
          <p class="text-sm text-[#6f809f]">Tambah dan monitoring kesehatan mesin dari cabang laundry milik Anda.</p>
        </div>
      </div>
      <UButton icon="i-heroicons-plus" class="dc-btn-primary px-4 py-2 justify-center" @click="openCreate">Tambah Mesin</UButton>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-lg">Total Mesin: <span class="text-[#0360da] font-semibold">{{ machineSummary.total }} Mesin</span></p>
        <p class="text-sm text-[#6f809f]" data-testid="machine-summary">
          {{ machineSummary.available }} tersedia · {{ machineSummary.active }} aktif · {{ machineSummary.total - machineSummary.active }} nonaktif<span v-if="machineSummary.others"> · {{ machineSummary.others }} perangkat lain</span>
        </p>
      </div>
      <div class="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
        <UInput v-model="search" icon="i-heroicons-magnifying-glass" placeholder="Cari Mesin" class="w-full sm:w-[280px] dc-input-like" />
        <USelect v-model="outletFilter" :items="outletFilterItems" aria-label="Filter cabang" class="w-full sm:w-[170px] dc-input-like" />
        <USelect v-model="conditionFilter" :items="conditionFilterItems" aria-label="Filter kondisi" class="w-full sm:w-[200px] dc-input-like" />
      </div>
    </div>

    <div class="dc-page-card p-4 overflow-x-auto">
      <table class="w-full min-w-[1000px] text-sm">
        <thead>
          <tr class="bg-[#0349a8] text-white text-left">
            <th class="px-3 py-3 font-semibold">ID MESIN/ MERK</th>
            <th class="px-3 py-3 font-semibold">TIPE MESIN</th>
            <th class="px-3 py-3 font-semibold">LAYANAN / KAPASITAS</th>
            <th class="px-3 py-3 font-semibold">OUTLET/CABANG</th>
            <th class="px-3 py-3 font-semibold">KONDISI</th>
            <th class="px-3 py-3 font-semibold">STATUS</th>
            <th class="px-3 py-3 font-semibold">TERAKHIR DIPERBAIKI</th>
            <th class="px-3 py-3 font-semibold">AKSI</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="8" class="px-3 py-4 text-[#6f809f]">Memuat data mesin...</td>
          </tr>
          <tr v-else-if="!filteredDevices.length">
            <td colspan="8" class="px-3 py-6 text-center text-[#6f809f]">Tidak ada mesin yang cocok dengan filter.</td>
          </tr>
          <tr
            v-for="(device, idx) in filteredDevices"
            :key="device.id"
            :class="idx % 2 ? 'bg-[#f8fbff]' : 'bg-transparent'"
          >
            <td class="px-3 py-3">
              <p class="font-semibold">{{ device.deviceCode }}</p>
              <p class="text-[#6f809f]">{{ device.name || device.manufacturer || '-' }}</p>
            </td>
            <td class="px-3 py-3">{{ deviceTypeItems.find(i => i.value === device.deviceType)?.label || device.deviceType }}</td>
            <td class="px-3 py-3">
              <p>{{ device.service?.name || 'Belum diatur' }}</p>
              <p class="text-[#6f809f]">{{ device.capacityKg ? `${device.capacityKg} kg` : '-' }}</p>
            </td>
            <td class="px-3 py-3">{{ device.outlet?.name || '-' }}</td>
            <td class="px-3 py-3">
              <span class="rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap" :class="machineCondition(device).className">{{ machineCondition(device).label }}</span>
            </td>
            <td class="px-3 py-3">
              <span class="dc-pill-success" :class="!machineActive(device) ? '!bg-[#f2f4f8] !text-[#6f809f]' : ''">{{ machineActive(device) ? 'Aktif' : 'Nonaktif' }}</span>
            </td>
            <td class="px-3 py-3">{{ device.lastHeartbeatAt ? new Date(device.lastHeartbeatAt).toLocaleDateString('id-ID') : '-' }}</td>
            <td class="px-3 py-3">
              <UButton icon="i-heroicons-pencil" variant="ghost" class="dc-btn-outline" size="xs" @click="openEdit(device)">Edit</UButton>
              <UButton v-if="isSuperAdmin" icon="i-heroicons-trash" variant="ghost" color="error" size="xs" aria-label="Hapus mesin" @click="deleteDevice(device)" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal v-model:open="showModal" :title="editTarget ? 'Edit Mesin' : 'Tambah Mesin'">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Merk Mesin">
              <UInput v-model="form.name" placeholder="Masukkan merk mesin" class="w-full" required />
            </UFormField>
            <UFormField label="Outlet/Cabang">
              <USelect v-model="form.outletId" :items="outletOptions" class="w-full" :disabled="!!editTarget" />
            </UFormField>
          </div>

          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Tipe Mesin">
              <USelect v-model="form.deviceType" :items="deviceTypeItems" class="w-full" :disabled="!!editTarget" />
            </UFormField>
            <UFormField v-if="isMachine" label="Kapasitas Mesin (kg)">
              <UInput v-model="form.capacityKg" type="number" min="1" max="100" placeholder="mis. 10" class="w-full" />
            </UFormField>
          </div>

          <UFormField
            v-if="isMachine"
            label="Layanan Mesin"
            help="Harga & durasi di aplikasi diambil dari layanan ini (harga per outlet di menu Layanan). Pelanggan tidak bisa memilih layanan lain untuk mesin ini."
          >
            <USelect v-model="form.serviceId" :items="serviceOptions" class="w-full" />
          </UFormField>

          <div v-if="isMachine" class="grid md:grid-cols-2 gap-4">
            <UFormField
              label="Mode Kontrol"
              help="Pilih Manual selama mesin belum terhubung IoT agar tetap bisa dipakai pelanggan."
            >
              <USelect v-model="form.controlMode" :items="controlModeItems" class="w-full" />
            </UFormField>
            <UFormField
              v-if="form.controlMode === 'MANUAL'"
              label="Kondisi Manual"
              help="Scan QR di aplikasi langsung menandai mesin dipakai; pelanggan menyalakan mesin sendiri. Selesai otomatis sesuai estimasi durasi layanan."
            >
              <USelect v-model="form.manualStatus" :items="manualStatusItems" class="w-full" />
            </UFormField>
          </div>

          <UFormField label="Kode Mesin" v-if="!editTarget">
            <UInput v-model="form.deviceCode" placeholder="DEV-001" class="w-full" required />
          </UFormField>

          <div class="flex justify-end pt-2">
            <UButton type="submit" class="dc-btn-primary px-4 py-2 justify-center">Simpan</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
