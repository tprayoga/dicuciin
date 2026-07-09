<script setup lang="ts">
// Empty-state dengan maskot Di.Cuciin untuk panel admin.
// Dipakai HEMAT — hanya pada empty state (no data) agar admin tetap profesional.
// Gambar disajikan dari `public/mascot/...` (mis. /mascot/09_error_kiosk_pack/03_empty_page_sweeping.png).
withDefaults(
  defineProps<{
    image: string
    title: string
    description?: string
    actionLabel?: string
    actionTo?: string
  }>(),
  {
    description: '',
    actionLabel: '',
    actionTo: '',
  },
)

// Sembunyikan <img> bila aset gagal dimuat (fallback aman, tidak merusak layout).
function onImgError(e: Event) {
  const el = e.target as HTMLImageElement
  el.style.display = 'none'
}
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center py-12 px-6">
    <img
      :src="image"
      :alt="title"
      class="w-32 h-32 object-contain mb-4 select-none"
      draggable="false"
      @error="onImgError"
    >
    <h3 class="text-lg font-semibold text-[#272526]">{{ title }}</h3>
    <p v-if="description" class="mt-1 max-w-md text-sm text-[#6f809f]">
      {{ description }}
    </p>
    <UButton
      v-if="actionLabel && actionTo"
      :to="actionTo"
      class="dc-btn-primary px-4 py-2 mt-4"
    >
      {{ actionLabel }}
    </UButton>
  </div>
</template>
