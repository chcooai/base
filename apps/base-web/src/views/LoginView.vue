<template>
  <div class="auth-card">
    <h2>登录 chcooai</h2>
    <form @submit.prevent="onSubmit">
      <input type="email" v-model="email" placeholder="邮箱" required />
      <input type="password" v-model="password" placeholder="密码" required />
      <button type="submit" :disabled="loading">登录</button>
    </form>
    <p><router-link to="/register">没有账号？去注册</router-link></p>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const store = useAuthStore();
const email = ref(''); const password = ref(''); const loading = ref(false);

async function onSubmit(): Promise<void> {
  loading.value = true;
  try {
    const redirectUri = (route.query.redirect_uri as string | undefined) || undefined;
    const redirectTo = await store.login(email.value, password.value, redirectUri);
    store.performRedirect(redirectTo);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>
