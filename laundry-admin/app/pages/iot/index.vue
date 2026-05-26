<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse, IotDevice, Outlet } from '~/types'

const api = useApi()
const toast = useToast()

const devices = ref<IotDevice[]>([])
const outlets = ref<Outlet[]>([])
const loading = ref(false)
const search = ref('')

const showModal = ref(false)
const editTarget = ref<IotDevice | null>(null)

const form = reactive({
  outletId: '',
  deviceCode: '',
  deviceType: 'WASHING_MACHINE',
  name: '',
})

const deviceTypeItems = [
  { label: 'Mesin Cuci (Washer)', value: 'WASHING_MACHINE' },
  { label: 'Mesin Pengering (Dryer)', value: 'DRYER_MACHINE' },
  { label: 'KIOSK', value: 'KIOSK' },
  { label: 'Timbangan Digital', value: 'DIGITAL_SCALE' },
]

const outletOptions = computed(() => outlets.value.map(o => ({ label: o.name, value: o.id })))

const filteredDevices = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return devices.value
  return devices.value.filter(d => `${d.name} ${d.deviceCode} ${d.outlet?.name || ''}`.toLowerCase().includes(keyword))
})

function machineCondition(status: string) {
  if (status === 'ONLINE') return { label: 'Normal', className: 'bg-[#1fa150] text-white' }
  if (status === 'MAINTENANCE') return { label: 'Maintenance', className: 'bg-[#e28a05] text-white' }
  return { label: 'Need Service', className: 'bg-[#d6280b] text-white' }
}

function machineActive(status: string) {
  return status !== 'OFFLINE'
}

async function load() {
  loading.value = true
  try {
    const [devRes, outletRes] = await Promise.all([
      api.get<PaginatedResponse<IotDevice>>('/iot/devices?page=1&limit=100'),
      api.get<PaginatedResponse<Outlet>>('/outlets?page=1&limit=100'),
    ])
    devices.value = devRes.data
    outlets.value = outletRes.data
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
  })
  showModal.value = true
}

async function save() {
  try {
    if (editTarget.value) {
      await api.patch(`/iot/devices/${editTarget.value.id}`, {
        name: form.name,
      })
      toast.add({ title: 'Mesin diperbarui', color: 'success' })
    } else {
      await api.post('/iot/devices', {
        outletId: form.outletId,
        deviceCode: form.deviceCode,
        deviceType: form.deviceType,
        name: form.name,
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
    <div class="dc-page-card p-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 rounded-xl bg-[#dce9f8] text-[#0f6ee9] flex items-center justify-center">
          <UIcon name="i-heroicons-computer-desktop" class="text-xl" />
        </div>
        <div>
          <h2 class="text-lg font-semibold">Kelola Mesin</h2>
          <p class="text-sm text-[#6f809f]">Tambah dan monitoring kesehatan mesin dari cabang laundry milik Anda.</p>
        </div>
      </div>
      <UButton icon="i-heroicons-plus" class="dc-btn-primary px-4 py-2" @click="openCreate">Tambah Mesin</UButton>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-lg">Total Mesin: <span class="text-[#0f6ee9] font-semibold">{{ filteredDevices.length }} Mesin</span></p>
      <div class="flex gap-2">
        <UInput v-model="search" icon="i-heroicons-magnifying-glass" placeholder="Cari Mesin" class="w-[280px] dc-input-like" />
        <USelect :items="[{ label: 'Semua Cabang', value: 'all' }]" model-value="all" class="w-[170px] dc-input-like" />
      </div>
    </div>

    <div class="dc-page-card p-4 overflow-x-auto">
      <table class="w-full min-w-[1000px] text-sm">
        <thead>
          <tr class="bg-[#0b3a77] text-white text-left">
            <th class="px-3 py-3 font-semibold">ID MESIN/ MERK</th>
            <th class="px-3 py-3 font-semibold">TIPE MESIN</th>
            <th class="px-3 py-3 font-semibold">OUTLET/CABANG</th>
            <th class="px-3 py-3 font-semibold">KONDISI</th>
            <th class="px-3 py-3 font-semibold">STATUS</th>
            <th class="px-3 py-3 font-semibold">TERAKHIR DIPERBAIKI</th>
            <th class="px-3 py-3 font-semibold">AKSI</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="7" class="px-3 py-4 text-[#6f809f]">Memuat data mesin...</td>
          </tr>
          <tr
            v-for="(device, idx) in filteredDevices"
            :key="device.id"
            :class="idx % 2 ? 'bg-[#f8fbff]' : 'bg-transparent'"
          >
            <td class="px-3 py-3">
              <p class="font-semibold">{{ device.deviceCode }}</p>
              <p class="text-[#6f809f]">{{ device.manufacturer || '-' }}</p>
            </td>
            <td class="px-3 py-3">{{ deviceTypeItems.find(i => i.value === device.deviceType)?.label || device.deviceType }}</td>
            <td class="px-3 py-3">{{ device.outlet?.name || '-' }}</td>
            <td class="px-3 py-3">
              <span class="rounded-full px-3 py-1 text-xs font-semibold" :class="machineCondition(device.status).className">{{ machineCondition(device.status).label }}</span>
            </td>
            <td class="px-3 py-3">
              <span class="dc-pill-success" :class="!machineActive(device.status) ? '!bg-[#f2f4f8] !text-[#6f809f]' : ''">{{ machineActive(device.status) ? 'Aktif' : 'Nonaktif' }}</span>
            </td>
            <td class="px-3 py-3">{{ device.lastHeartbeatAt ? new Date(device.lastHeartbeatAt).toLocaleDateString('id-ID') : '-' }}</td>
            <td class="px-3 py-3">
              <UButton icon="i-heroicons-pencil" variant="ghost" class="dc-btn-outline" size="xs" @click="openEdit(device)">Edit</UButton>
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
            <UFormField label="Kapasitas Mesin">
              <UInput placeholder="Pilih Kapasitas" class="w-full" />
            </UFormField>
          </div>

          <UFormField label="Kode Mesin" v-if="!editTarget">
            <UInput v-model="form.deviceCode" placeholder="DEV-001" class="w-full" required />
          </UFormField>

          <div class="flex justify-end pt-2">
            <UButton type="submit" class="dc-btn-primary px-4 py-2">Simpan</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
