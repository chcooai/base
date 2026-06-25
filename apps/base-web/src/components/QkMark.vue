<template>
  <svg class="qk-mark" :width="size" :height="size" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M6 27V14a10 10 0 0 1 20 0v13" stroke="#1F1F1E" stroke-width="1.6" stroke-linecap="round" />
    <path d="M16 27V11" stroke="#1F1F1E" stroke-width="1.1" stroke-linecap="round" opacity="0.5" />
    <path d="M4 27h24" stroke="#1F1F1E" stroke-width="1.6" stroke-linecap="round" />
    <circle cx="16" cy="9.2" r="1.7" fill="#B89968" />
  </svg>
</template>
<script setup lang="ts">
defineProps<{ size?: number | string }>();
</script>
<style scoped>
.qk-mark { display: block; flex: none; }
</style>
