<template>
  <div class="auth-card">
    <h2>已登录</h2>
    <p>{{ email || '欢迎回来' }}</p>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';

const store = useAuthStore();
const email = ref('');
onMounted(async () => {
  if (!store.accessToken) return;
  try {
    const { data } = await api.get('/auth/me', { headers: { Authorization: `Bearer ${store.accessToken}` } });
    email.value = data.email;
  } catch { /* 未登录则留空 */ }
});
</script>
