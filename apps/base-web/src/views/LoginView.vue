<template>
  <div class="qk-auth">
    <div class="qk-auth__card">
      <div class="qk-brand"><QkMark :size="26" /><span class="qk-brand__name">启蔻</span><span class="qk-brand__ai">AI</span></div>
      <h1 class="qk-auth__title">欢迎回来</h1>
      <p class="qk-auth__sub">登录以进入你的工作台</p>
      <form @submit.prevent="onSubmit" novalidate>
        <div class="qk-field">
          <label for="login-email">邮箱</label>
          <el-input id="login-email" v-model="email" type="email" size="large" placeholder="you@example.com" autocomplete="email" />
        </div>
        <div class="qk-field">
          <label for="login-password">密码</label>
          <el-input id="login-password" v-model="password" type="password" size="large" show-password placeholder="请输入密码" autocomplete="current-password" />
        </div>
        <el-button class="qk-auth__submit" type="primary" size="large" native-type="submit" :loading="loading">登 录</el-button>
      </form>
      <p class="qk-auth__foot">还没有账号？<router-link to="/register">创建一个</router-link></p>
    </div>
  </div>
</template>
<script setup lang="ts">
import QkMark from "../components/QkMark.vue";
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
