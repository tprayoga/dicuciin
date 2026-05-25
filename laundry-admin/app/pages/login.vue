<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

definePageMeta({ layout: 'auth' })

const authStore = useAuthStore()
const router = useRouter()
const config = useRuntimeConfig()
const toast = useToast()

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
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Login gagal')
    authStore.setAuth(data)
    router.push('/dashboard')
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (authStore.isAuthenticated) router.push('/dashboard')
})
</script>

<template>
  <UCard class="w-full max-w-sm">
    <template #header>
      <div class="text-center">
        <div class="flex justify-center mb-3">
          <UIcon name="i-heroicons-sparkles" class="text-primary-500 text-4xl" />
        </div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Laundry Admin</h1>
        <p class="text-sm text-gray-500 mt-1">Masuk ke dashboard pengelolaan</p>
      </div>
    </template>

    <form class="space-y-4" @submit.prevent="login">
      <UFormField label="Email / No. HP">
        <UInput
          v-model="form.identifier"
          placeholder="admin@laundry.local"
          icon="i-heroicons-user"
          class="w-full"
          required
        />
      </UFormField>

      <UFormField label="Password">
        <UInput
          v-model="form.password"
          type="password"
          placeholder="••••••••"
          icon="i-heroicons-lock-closed"
          class="w-full"
          required
        />
      </UFormField>

      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        :description="error"
        icon="i-heroicons-exclamation-circle"
      />

      <UButton
        type="submit"
        class="w-full justify-center"
        :loading="loading"
        :disabled="loading"
      >
        Masuk
      </UButton>
    </form>
  </UCard>
</template>
