<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

definePageMeta({ layout: 'auth' })

const authStore = useAuthStore()
const router = useRouter()
const config = useRuntimeConfig()

const activeTab = ref<'OWNER' | 'STAFF'>('OWNER')
const showPassword = ref(false)
const form = reactive({ identifier: '', password: '' })
const loading = ref(false)
const error = ref('')

async function login() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`${config.public.apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const body = await res.json()
    if (!res.ok) {
      const msg = body?.message
      throw new Error(Array.isArray(msg) ? msg.join(', ') : (msg || 'Login gagal'))
    }
    // Handle wrapped response { success, data: { user, accessToken, refreshToken } }
    const data = body?.data ?? body
    authStore.setAuth(data)
    router.push('/dashboard')
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-[380px] rounded-xl bg-white p-5 border border-[#d4dff0]">
    <div class="flex border-b border-[#d4dff0] mb-6">
      <button
        class="flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2"
        :class="activeTab === 'OWNER' ? 'text-[#0f6ee9] border-b-2 border-[#0f6ee9]' : 'text-[#6f809f]'"
        @click="activeTab = 'OWNER'"
      >
        <UIcon name="i-heroicons-building-office" /> Owner
      </button>
      <button
        class="flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2"
        :class="activeTab === 'STAFF' ? 'text-[#0f6ee9] border-b-2 border-[#0f6ee9]' : 'text-[#6f809f]'"
        @click="activeTab = 'STAFF'"
      >
        <UIcon name="i-heroicons-user" /> Staff
      </button>
    </div>

    <div class="flex items-center gap-3 mb-6">
      <div class="h-12 w-12 rounded-xl bg-[#dce9f8] flex items-center justify-center">
        <UIcon name="i-heroicons-building-office" class="text-[#0f6ee9] text-xl" />
      </div>
      <div>
        <h1 class="text-[32px] font-bold text-[#111d35]">{{ activeTab === 'OWNER' ? 'Owner Login' : 'Staff Login' }}</h1>
        <p class="text-sm text-[#6f809f]">Masuk untuk kelola Bisnis Laundry</p>
      </div>
    </div>

    <form class="space-y-4" @submit.prevent="login">
      <UFormField label="Email">
        <UInput v-model="form.identifier" placeholder="Masukkan email terdaftar" class="w-full" required />
      </UFormField>

      <UFormField label="Password">
        <UInput
          v-model="form.password"
          :type="showPassword ? 'text' : 'password'"
          placeholder="Masukkan password"
          class="w-full"
          required
        >
          <template #trailing>
            <button type="button" class="text-[#6f809f]" @click="showPassword = !showPassword">
              <UIcon :name="showPassword ? 'i-heroicons-eye' : 'i-heroicons-eye-slash'" />
            </button>
          </template>
        </UInput>
      </UFormField>

      <p class="text-right text-sm text-[#0f6ee9]">Lupa Password?</p>

      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        :description="error"
        icon="i-heroicons-exclamation-circle"
      />

      <UButton
        type="submit"
        class="w-full justify-center rounded-xl !bg-[#0f6ee9] hover:!bg-[#0b56b7]"
        :loading="loading"
        :disabled="loading"
      >
        Masuk
      </UButton>
    </form>
  </div>
</template>
