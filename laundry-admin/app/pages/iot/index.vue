<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse, IotDevice, Outlet } from '~/types'

const api = useApi()
const toast = useToast()

const devices = ref<IotDevice[]>([])
const outlets = ref<Outlet[]>([])
const meta = ref({ total: 0, page: 1, limit: 10, totalPages: 1 })
const loading = ref(false)
const showModal = ref(false)
const editTarget = ref<IotDevice | null>(null)
const deleteTarget = ref<IotDevice | null>(null)
const showDeleteModal = ref(false)

const deviceTypeItems = [
  { label: 'Kiosk', value: 'KIOSK' },
  { label: 'Timbangan Digital', value: 'DIGITAL_SCALE' },
  { label: 'Printer Struk', value: 'RECEIPT_PRINTER' },
  { label: 'Printer Label', value: 'LABEL_PRINTER' },
  { label: 'Smart Locker', value: 'SMART_LOCKER' },
  { label: 'Mesin Cuci', value: 'WASHING_MACHINE' },
  { label: 'Pengering', value: 'DRYER_MACHINE' },
  { label: 'Scanner QR', value: 'QR_SCANNER' },
]

const form = reactive({
  outletId: '',
  deviceCode: '',
  deviceType: 'KIOSK',
  name: '',
  manufacturer: '',
  model: '',
  firmwareVersion: '',
})

const statusColor: Record<string, string> = {
  ONLINE: 'success',
  OFFLINE: 'neutral',
  ERROR: 'error',
  MAINTENANCE: 'warning',
}

const deviceTypeIcon: Record<string, string> = {
  KIOSK: 'i-heroicons-computer-desktop',
  DIGITAL_SCALE: 'i-heroicons-scale',
  RECEIPT_PRINTER: 'i-heroicons-printer',
  LABEL_PRINTER: 'i-heroicons-printer',
  SMART_LOCKER: 'i-heroicons-lock-closed',
  WASHING_MACHINE: 'i-heroicons-arrow-path',
  DRYER_MACHINE: 'i-heroicons-fire',
  QR_SCANNER: 'i-heroicons-qr-code',
}

const columns = [
  { accessorKey: 'deviceCode', header: 'Kode' },
  { accessorKey: 'name', header: 'Nama' },
  {
    id: 'deviceType',
    header: 'Tipe',
    cell: ({ row }: any) => {
      const UIcon = resolveComponent('UIcon')
      const icon = deviceTypeIcon[row.original.deviceType] || 'i-heroicons-cpu-chip'
      return h('div', { class: 'flex items-center gap-1.5' }, [
        h(UIcon, { name: icon, class: 'text-gray-400' }),
        h('span', { class: 'text-xs' }, row.original.deviceType.replace(/_/g, ' ')),
      ])
    },
  },
  { id: 'outlet', header: 'Outlet', cell: ({ row }: any) => row.original.outlet?.name || '-' },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }: any) => {
      const UBadge = resolveComponent('UBadge')
      const color = statusColor[row.original.status] || 'neutral'
      return h(UBadge, { color, variant: 'soft', size: 'xs' }, () => row.original.status)
    },
  },
  {
    id: 'lastHeartbeatAt',
    header: 'Heartbeat',
    cell: ({ row }: any) => h('span', { class: 'text-xs text-gray-500' }, row.original.lastHeartbeatAt ? new Date(row.original.lastHeartbeatAt).toLocaleString('id-ID') : 'Belum ada'),
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
    const [devRes, outletRes] = await Promise.all([
      api.get<PaginatedResponse<IotDevice>>(`/iot/devices?page=${page}&limit=10`),
      api.get<PaginatedResponse<Outlet>>('/outlets?page=1&limit=100'),
    ])
    devices.value = devRes.data
    meta.value = devRes.meta
    outlets.value = outletRes.data
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat perangkat', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

const outletOptions = computed(() =>
  outlets.value.map(o => ({ label: o.name, value: o.id }))
)

function openCreate() {
  editTarget.value = null
  Object.assign(form, {
    outletId: outlets.value[0]?.id || '',
    deviceCode: '',
    deviceType: 'KIOSK',
    name: '',
    manufacturer: '',
    model: '',
    firmwareVersion: '',
  })
  showModal.value = true
}

function openEdit(d: IotDevice) {
  editTarget.value = d
  Object.assign(form, {
    outletId: d.outletId,
    deviceCode: d.deviceCode,
    deviceType: d.deviceType,
    name: d.name,
    manufacturer: d.manufacturer || '',
    model: d.model || '',
    firmwareVersion: d.firmwareVersion || '',
  })
  showModal.value = true
}

async function save() {
  try {
    const payload = { ...form }
    if (editTarget.value) {
      await api.patch(`/iot/devices/${editTarget.value.id}`, payload)
      toast.add({ title: 'Perangkat diperbarui', color: 'success' })
    } else {
      await api.post('/iot/devices', payload)
      toast.add({ title: 'Perangkat ditambahkan', color: 'success' })
    }
    showModal.value = false
    load(meta.value.page)
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan', description: e.message, color: 'error' })
  }
}

function confirmDelete(d: IotDevice) {
  deleteTarget.value = d
  showDeleteModal.value = true
}

async function doDelete() {
  if (!deleteTarget.value) return
  try {
    await api.del(`/iot/devices/${deleteTarget.value.id}`)
    toast.add({ title: 'Perangkat dihapus', color: 'success' })
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
      <p class="text-sm text-gray-500">{{ meta.total }} perangkat terdaftar</p>
      <UButton icon="i-heroicons-plus" @click="openCreate">Tambah Perangkat</UButton>
    </div>

    <UCard>
      <UTable :data="devices" :columns="columns" :loading="loading" />

      <div v-if="meta.totalPages > 1" class="flex justify-center pt-4">
        <UPagination v-model:page="meta.page" :total="meta.total" :items-per-page="meta.limit" @update:page="load" />
      </div>
    </UCard>

    <UModal v-model:open="showModal" :title="editTarget ? 'Edit Perangkat' : 'Tambah Perangkat'">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="Outlet">
            <USelect v-model="form.outletId" :items="outletOptions" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Kode Perangkat">
              <UInput v-model="form.deviceCode" placeholder="DEV-001" class="w-full" required />
            </UFormField>
            <UFormField label="Tipe Perangkat">
              <USelect v-model="form.deviceType" :items="deviceTypeItems" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Nama Perangkat">
            <UInput v-model="form.name" placeholder="Mesin Cuci 1" class="w-full" required />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Produsen">
              <UInput v-model="form.manufacturer" placeholder="Samsung" class="w-full" />
            </UFormField>
            <UFormField label="Model">
              <UInput v-model="form.model" placeholder="WF-1234" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Versi Firmware">
            <UInput v-model="form.firmwareVersion" placeholder="v1.0.0" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" @click="showModal = false">Batal</UButton>
            <UButton type="submit">Simpan</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="showDeleteModal" title="Hapus Perangkat">
      <template #body>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Yakin ingin menghapus perangkat <strong>{{ deleteTarget?.name }}</strong>?
        </p>
        <div class="flex justify-end gap-2 pt-4">
          <UButton variant="ghost" @click="showDeleteModal = false">Batal</UButton>
          <UButton color="error" @click="doDelete">Hapus</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
