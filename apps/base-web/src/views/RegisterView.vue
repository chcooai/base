<template>
  <div class="qk-auth">
    <div class="qk-auth__card">
      <div class="qk-brand"><QkMark :size="26" /><span class="qk-brand__name">启蔻</span><span class="qk-brand__ai">AI</span></div>
      <h1 class="qk-auth__title">创建账号</h1>
      <p class="qk-auth__sub">填写邮箱与密码，开启你的工作台</p>
      <form @submit.prevent="onSubmit" novalidate>
        <div class="qk-field">
          <label for="reg-email">邮箱</label>
          <el-input id="reg-email" v-model="email" type="email" size="large" placeholder="you@example.com" autocomplete="email" />
        </div>
        <div class="qk-field">
          <label for="reg-password">密码</label>
          <el-input id="reg-password" v-model="password" type="password" size="large" show-password placeholder="至少 8 位" autocomplete="new-password" />
        </div>
        <el-button class="qk-auth__submit" type="primary" size="large" native-type="submit" :loading="loading">创建账号</el-button>
      </form>
      <p class="qk-auth__foot">已有账号？<router-link to="/">去登录</router-link></p>
    </div>
  </div>
</template>
<script setup lang="ts">
import QkMark from "../components/QkMark.vue";
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
