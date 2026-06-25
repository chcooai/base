<template>
  <div class="qk-auth">
    <div class="qk-auth__card">
      <div class="qk-brand"><QkMark :size="26" /><span class="qk-brand__name">启蔻</span><span class="qk-brand__ai">AI</span></div>
      <h1 class="qk-auth__title">已登录</h1>
      <p class="qk-auth__sub">{{ email || '欢迎回来' }}</p>
      <el-button v-if="isAdmin" type="primary" size="large" class="qk-auth__submit" @click="$router.push('/admin')">进入成员管理</el-button>
      <p class="qk-auth__foot"><a href="#" @click.prevent="$router.push('/')">切换账号</a></p>
    </div>
  </div>
</template>
<script setup lang="ts">
import QkMark from "../components/QkMark.vue";
import { onMounted, ref } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';

const store = useAuthStore();
const email = ref('');
const isAdmin = ref(false);
onMounted(async () => {
  if (!store.accessToken) return;
  try {
    const { data } = await api.get('/auth/me', { headers: { Authorization: `Bearer ${store.accessToken}` } });
    email.value = data.email;
    isAdmin.value = data.role === 'admin';
  } catch { /* 未登录则留空 */ }
});
</script>
