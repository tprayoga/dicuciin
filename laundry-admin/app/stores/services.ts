import { defineStore } from 'pinia'
import type { Service, PaginatedResponse } from '~/types'

export const useServicesStore = defineStore('services', () => {
  const items = ref<Service[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  /** Ambil semua service — gunakan cache jika sudah pernah di-load */
  async function fetchAll(force = false) {
    if (loaded.value && !force) return items.value

    loading.value = true
    error.value = null

    try {
      const api = useApi()
      const res = await api.get<PaginatedResponse<Service>>('/services?limit=100')
      items.value = res.data
      loaded.value = true
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }

    return items.value
  }

  function invalidate() {
    loaded.value = false
    items.value = []
  }

  const activeItems = computed(() => items.value.filter((s) => s.isActive))

  return { items, loading, loaded, error, fetchAll, invalidate, activeItems }
})
