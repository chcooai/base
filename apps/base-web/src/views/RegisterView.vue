<template>
  <div class="auth-card">
    <h2>注册 chcooai</h2>
    <form @submit.prevent="onSubmit">
      <input type="email" v-model="email" placeholder="邮箱" required />
      <input type="password" v-model="password" placeholder="密码（≥8 位）" required />
      <button type="submit" :disabled="loading">注册</button>
    </form>
    <p><router-link to="/">已有账号？去登录</router-link></p>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const store = useAuthStore();
const email = ref(''); const password = ref(''); const loading = ref(false);

async function onSubmit(): Promise<void> {
  loading.value = true;
  try {
    await store.register(email.value, password.value);
    ElMessage.success('注册成功，请登录');
    await router.push('/');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? '注册失败');
  } finally {
    loading.value = false;
  }
}
</script>
