import { useApi } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'

/**
 * Aksi hapus yang seragam di semua menu: konfirmasi → DELETE → toast.
 * Server menolak (409) data yang sudah dipakai transaksi dan mengirim pesan yang
 * menjelaskan alternatifnya (mis. "Nonaktifkan saja") — pesan itu ditampilkan apa adanya.
 */
export function useDeleteAction() {
  const api = useApi()
  const toast = useToast()
  const authStore = useAuthStore()
  const deleting = ref<string | null>(null)

  /** Peran yang boleh menghapus data konfigurasi (layanan, staf, member, promo & loyalty, ulasan). */
  const canDelete = computed(() => ['SUPER_ADMIN', 'OWNER'].includes(authStore.user?.role || ''))
  const isSuperAdmin = computed(() => authStore.user?.role === 'SUPER_ADMIN')

  async function remove(opts: {
    path: string
    label: string
    /** Penjelasan tambahan di dialog konfirmasi. */
    note?: string
    onDone?: () => unknown
  }): Promise<void> {
    if (!import.meta.client) return
    const msg = `Hapus ${opts.label}?\n\n${opts.note ?? 'Data yang dihapus tidak bisa dikembalikan.'}`
    if (!window.confirm(msg)) return
    deleting.value = opts.path
    try {
      await api.del(opts.path)
      const title = `${opts.label.charAt(0).toUpperCase()}${opts.label.slice(1)} dihapus`
      toast.add({ title, color: 'success' })
      await opts.onDone?.()
    } catch (e: any) {
      toast.add({ title: 'Tidak bisa dihapus', description: e?.message, color: 'error' })
    } finally {
      deleting.value = null
    }
  }

  return { remove, deleting, canDelete, isSuperAdmin }
}
