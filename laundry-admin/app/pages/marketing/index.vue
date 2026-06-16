<script setup lang="ts">
const tab = ref<'promo' | 'banner'>('promo')

const tabs = [
  { key: 'promo', label: 'Promo & Voucher', icon: 'i-heroicons-megaphone' },
  { key: 'banner', label: 'Banner & Pop-up', icon: 'i-heroicons-photo' },
] as const
</script>

<template>
  <div class="space-y-4">
    <div class="dc-page-card p-4">
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 rounded-xl bg-[#dce9f8] text-[#0360da] flex items-center justify-center">
          <UIcon name="i-heroicons-sparkles" class="text-xl" />
        </div>
        <div>
          <h2 class="text-lg font-semibold">Promo & Banner</h2>
          <p class="text-sm text-[#6f809f]">Kelola voucher promo dan tampilan banner/pop-up di aplikasi pelanggan</p>
        </div>
      </div>

      <div class="mt-4 flex gap-2">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition"
          :class="tab === t.key ? 'bg-[#0360da] text-white' : 'bg-[#f2f6fc] text-[#4f607f] hover:bg-[#e6eefb]'"
          @click="tab = t.key"
        >
          <UIcon :name="t.icon" />
          {{ t.label }}
        </button>
      </div>
    </div>

    <PromoManager v-if="tab === 'promo'" />
    <BannerManager v-else />
  </div>
</template>
