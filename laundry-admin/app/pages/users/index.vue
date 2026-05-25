<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { useApi } from '~/composables/useApi'
import type { PaginatedResponse } from '~/types'

const api = useApi()
const toast = useToast()

interface UserItem {
  id: string
  name: string
  email: string
  phone: string
  role: string
  isActive: boolean
  createdAt: string
}

const users = ref<UserItem[]>([])
const meta = ref({ total: 0, page: 1, limit: 10, totalPages: 1 })
const loading = ref(false)
const showModal = ref(false)
const editTarget = ref<UserItem | null>(null)

const roleItems = [
  { label: 'Super Admin', value: 'SUPER_ADMIN' },
  { label: 'Owner', value: 'OWNER' },
  { label: 'Admin Outlet', value: 'ADMIN_OUTLET' },
  { label: 'Kasir', value: 'CASHIER' },
  { label: 'Operator', value: 'OPERATOR' },
  { label: 'Teknisi', value: 'TECHNICIAN' },
]

const form = reactive({ name: '', email: '', phone: '', password: '', role: 'CASHIER' })

const roleColor: Record<string, string> = {
  SUPER_ADMIN: 'error',
  OWNER: 'warning',
  ADMIN_OUTLET: 'info',
  CASHIER: 'success',
  OPERATOR: 'neutral',
  TECHNICIAN: 'neutral',
  CUSTOMER: 'neutral',
}

const columns = [
  { accessorKey: 'name', header: 'Nama' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'phone', header: 'Telepon' },
  {
    id: 'role',
    header: 'Role',
    cell: ({ row }: any) => {
      const UBadge = resolveComponent('UBadge')
      const color = roleColor[row.original.role] || 'neutral'
      return h(UBadge, { color, variant: 'soft', size: 'xs' }, () => row.original.role)
    },
  },
  {
    id: 'isActive',
    header: 'Status',
    cell: ({ row }: any) => {
      const UBadge = resolveComponent('UBadge')
      return h(UBadge, { color: row.original.isActive ? 'success' : 'neutral', variant: 'soft', size: 'xs' }, () => row.original.isActive ? 'Aktif' : 'Nonaktif')
    },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }: any) => {
      const UButton = resolveComponent('UButton')
      return h(UButton, { icon: 'i-heroicons-pencil', variant: 'ghost', size: 'xs', onClick: () => openEdit(row.original) })
    },
  },
]

async function load(page = 1) {
  loading.value = true
  try {
    const res = await api.get<PaginatedResponse<UserItem>>(`/users?page=${page}&limit=10`)
    users.value = res.data
    meta.value = res.meta
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat pengguna', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editTarget.value = null
  Object.assign(form, { name: '', email: '', phone: '', password: '', role: 'CASHIER' })
  showModal.value = true
}

function openEdit(user: UserItem) {
  editTarget.value = user
  Object.assign(form, { name: user.name, email: user.email, phone: user.phone, password: '', role: user.role })
  showModal.value = true
}

async function save() {
  try {
    const payload: any = { name: form.name, email: form.email, phone: form.phone, role: form.role }
    if (!editTarget.value || form.password) payload.password = form.password
    if (editTarget.value) {
      await api.patch(`/users/${editTarget.value.id}`, payload)
      toast.add({ title: 'Pengguna diperbarui', color: 'success' })
    } else {
      await api.post('/users', payload)
      toast.add({ title: 'Pengguna dibuat', color: 'success' })
    }
    showModal.value = false
    load(meta.value.page)
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan', description: e.message, color: 'error' })
  }
}

onMounted(() => load())
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-gray-500">{{ meta.total }} pengguna terdaftar</p>
      <UButton icon="i-heroicons-plus" @click="openCreate">Tambah Pengguna</UButton>
    </div>

    <UCard>
      <UTable :data="users" :columns="columns" :loading="loading" />

      <div v-if="meta.totalPages > 1" class="flex justify-center pt-4">
        <UPagination v-model:page="meta.page" :total="meta.total" :items-per-page="meta.limit" @update:page="load" />
      </div>
    </UCard>

    <UModal v-model:open="showModal" :title="editTarget ? 'Edit Pengguna' : 'Tambah Pengguna'">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="Nama">
            <UInput v-model="form.name" placeholder="John Doe" class="w-full" required />
          </UFormField>
          <UFormField label="Email">
            <UInput v-model="form.email" type="email" placeholder="john@example.com" class="w-full" required />
          </UFormField>
          <UFormField label="Telepon">
            <UInput v-model="form.phone" placeholder="08123456789" class="w-full" required />
          </UFormField>
          <UFormField :label="editTarget ? 'Password (kosongkan jika tidak diubah)' : 'Password'">
            <UInput v-model="form.password" type="password" placeholder="••••••••" class="w-full" :required="!editTarget" />
          </UFormField>
          <UFormField label="Role">
            <USelect v-model="form.role" :items="roleItems" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" @click="showModal = false">Batal</UButton>
            <UButton type="submit">Simpan</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
