import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const role = ref<'user' | 'admin'>('user');

  async function register(email: string, password: string): Promise<void> {
    await api.post('/auth/register', { email, password });
  }

  async function login(email: string, password: string, redirectUri?: string): Promise<string> {
    const { data } = await api.post('/auth/login', { email, password, redirectUri });
    accessToken.value = data.accessToken;
    return data.redirectTo as string;
  }

  async function fetchMe(): Promise<'user' | 'admin'> {
    const { data } = await api.get('/auth/me');
    role.value = data.role ?? 'user';
    return role.value;
  }

  function performRedirect(redirectTo: string): void {
    if (redirectTo.startsWith('/')) {
      window.location.assign(redirectTo);
    } else {
      // 外部目标站：access token 放 URL fragment，不进 query/referrer
      window.location.assign(`${redirectTo}#access_token=${encodeURIComponent(accessToken.value ?? '')}`);
    }
  }

  return { accessToken, role, register, login, fetchMe, performRedirect };
});
