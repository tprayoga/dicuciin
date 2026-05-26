<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse, Outlet } from '~/types'

const api = useApi()
const toast = useToast()

interface UserItem {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
  isActive: boolean
  outletUsers?: {
    outletId: string
    shiftName: string | null
    outlet?: {
      id: string
      name: string
      code: string
    }
  }[]
  createdAt: string
}

const users = ref<UserItem[]>([])
const outlets = ref<Outlet[]>([])
const loading = ref(false)
const showModal = ref(false)
const editTarget = ref<UserItem | null>(null)
const search = ref('')
const selectedOutletFilter = ref('all')

const roleItems = [
  { label: 'Owner', value: 'OWNER' },
  { label: 'Admin Outlet', value: 'ADMIN_OUTLET' },
  { label: 'Staff Laundry', value: 'CASHIER' },
  { label: 'Operator', value: 'OPERATOR' },
  { label: 'Teknisi', value: 'TECHNICIAN' },
  { label: 'Super Admin', value: 'SUPER_ADMIN' },
]

const form = reactive({
  name: '',
  email: '',
  phone: '',
  password: '',
  role: 'CASHIER',
  status: true,
  outletId: '',
  shiftName: '',
})

const outletItems = computed(() => [
  { label: 'Pilih outlet', value: '' },
  ...outlets.value.map(outlet => ({ label: outlet.name, value: outlet.id })),
])

const outletFilterItems = computed(() => [
  { label: 'Semua Cabang', value: 'all' },
  ...outlets.value.map(outlet => ({ label: outlet.name, value: outlet.id })),
])

const filteredUsers = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  const bySearch = users.value.filter(user =>
    `${user.name} ${user.phone || ''} ${user.email || ''}`.toLowerCase().includes(keyword),
  )

  if (selectedOutletFilter.value === 'all') return bySearch
  return bySearch.filter(user => user.outletUsers?.[0]?.outletId === selectedOutletFilter.value)
})

function roleLabel(role: string) {
  return roleItems.find(r => r.value === role)?.label || role
}

function roleShift(user: UserItem) {
  return user.outletUsers?.[0]?.shiftName || '-'
}

function outletName(user: UserItem) {
  return user.outletUsers?.[0]?.outlet?.name || '-'
}

async function load() {
  loading.value = true
  try {
    const [usersRes, outletsRes] = await Promise.all([
      api.get<PaginatedResponse<UserItem>>('/users?page=1&limit=100'),
      api.get<PaginatedResponse<Outlet>>('/outlets?page=1&limit=100'),
    ])
    users.value = usersRes.data
    outlets.value = outletsRes.data
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat pengguna', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editTarget.value = null
  Object.assign(form, {
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'CASHIER',
    status: true,
    outletId: outlets.value[0]?.id || '',
    shiftName: '',
  })
  showModal.value = true
}

function openEdit(user: UserItem) {
  editTarget.value = user
  Object.assign(form, {
    name: user.name,
    email: user.email || '',
    phone: user.phone || '',
    password: '',
    role: user.role,
    status: user.isActive,
    outletId: user.outletUsers?.[0]?.outletId || '',
    shiftName: user.outletUsers?.[0]?.shiftName || '',
  })
  showModal.value = true
}

async function save() {
  try {
    if (editTarget.value) {
      await api.patch(`/users/${editTarget.value.id}`, {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        role: form.role,
        isActive: form.status,
        password: form.password || undefined,
        outletId: form.outletId || undefined,
        shiftName: form.shiftName || undefined,
      })
      toast.add({ title: 'Data staff diperbarui', color: 'success' })
    } else {
      await api.post('/users', {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        password: form.password,
        role: form.role,
        outletId: form.outletId || undefined,
        shiftName: form.shiftName || undefined,
      })
      toast.add({ title: 'Staff ditambahkan', color: 'success' })
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
          <UIcon name="i-heroicons-users" class="text-xl" />
        </div>
        <div>
          <h2 class="text-lg font-semibold">Kelola Staff</h2>
          <p class="text-sm text-[#6f809f]">Tambahkan data staf dan admin ke sistem laundry milik Anda.</p>
        </div>
      </div>
      <UButton icon="i-heroicons-plus" class="dc-btn-primary px-4 py-2" @click="openCreate">Tambah Staff</UButton>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-lg">Total: <span class="text-[#0f6ee9] font-semibold">{{ filteredUsers.length }} Staff</span></p>
      <div class="flex flex-wrap gap-2">
        <UInput v-model="search" icon="i-heroicons-magnifying-glass" placeholder="Cari nama staff" class="w-[280px] dc-input-like" />
        <USelect v-model="selectedOutletFilter" :items="outletFilterItems" class="w-[170px] dc-input-like" />
      </div>
    </div>

    <div class="dc-page-card p-4 overflow-x-auto">
      <table class="w-full min-w-[900px] text-sm">
        <thead>
          <tr class="bg-[#0b3a77] text-white text-left">
            <th class="px-3 py-3 font-semibold">NAMA</th>
            <th class="px-3 py-3 font-semibold">POSISI</th>
            <th class="px-3 py-3 font-semibold">OUTLET/CABANG</th>
            <th class="px-3 py-3 font-semibold">NO. TELEPON</th>
            <th class="px-3 py-3 font-semibold">SHIFT KERJA</th>
            <th class="px-3 py-3 font-semibold">STATUS</th>
            <th class="px-3 py-3 font-semibold">AKSI</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="7" class="px-3 py-4 text-[#6f809f]">Memuat data staff...</td>
          </tr>
          <tr
            v-for="(user, idx) in filteredUsers"
            :key="user.id"
            :class="idx % 2 ? 'bg-[#f8fbff]' : 'bg-transparent'"
          >
            <td class="px-3 py-3 font-medium">{{ user.name }}</td>
            <td class="px-3 py-3">{{ roleLabel(user.role) }}</td>
            <td class="px-3 py-3">{{ outletName(user) }}</td>
            <td class="px-3 py-3">{{ user.phone || '-' }}</td>
            <td class="px-3 py-3">{{ roleShift(user) }}</td>
            <td class="px-3 py-3">
              <span class="dc-pill-success" :class="!user.isActive ? '!bg-[#f2f4f8] !text-[#6f809f]' : ''">{{ user.isActive ? 'Aktif' : 'Nonaktif' }}</span>
            </td>
            <td class="px-3 py-3">
              <UButton icon="i-heroicons-pencil" variant="ghost" class="dc-btn-outline" size="xs" @click="openEdit(user)">Edit</UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal v-model:open="showModal" :title="editTarget ? 'Edit Staff' : 'Tambah Staff'">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Nama">
              <UInput v-model="form.name" placeholder="Masukkan nama" class="w-full" required />
            </UFormField>
            <UFormField label="No. Telepon">
              <UInput v-model="form.phone" placeholder="Masukkan nomor" class="w-full" required />
            </UFormField>
          </div>

          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Posisi">
              <USelect v-model="form.role" :items="roleItems" class="w-full" />
            </UFormField>
            <UFormField label="Outlet/Cabang">
              <USelect v-model="form.outletId" :items="outletItems" class="w-full" />
            </UFormField>
          </div>

          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Email">
              <UInput v-model="form.email" placeholder="Masukkan email" class="w-full" required />
            </UFormField>
            <UFormField label="Password">
              <UInput v-model="form.password" type="password" placeholder="Masukkan password" class="w-full" :required="!editTarget" />
              <p class="text-xs text-[#6f809f] mt-1">Password baru (biarkan kosong jika tidak diganti)</p>
            </UFormField>
          </div>

          <UFormField label="Shift Kerja">
            <UInput v-model="form.shiftName" placeholder="Contoh: Pagi (07:00-15:00)" class="w-full" />
          </UFormField>

          <UFormField label="Status">
            <USelect v-model="form.status" :items="[{ label: 'Aktif', value: true }, { label: 'Nonaktif', value: false }]" class="w-full" />
          </UFormField>

          <div class="flex justify-end pt-2">
            <UButton type="submit" class="dc-btn-primary px-4 py-2">Simpan</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
