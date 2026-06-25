import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, setApiToken } from '../api/client';

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const role = ref<'user' | 'admin'>('user');
  const email = ref<string>('');
  const ready = ref<boolean>(false);
  const authenticated = ref<boolean>(false);
  let bootstrapPromise: Promise<void> | null = null;

  function setToken(token: string | null): void {
    accessToken.value = token;
    setApiToken(token);
  }

  async function register(emailInput: string, password: string): Promise<void> {
    await api.post('/auth/register', { email: emailInput, password });
  }

  async function login(emailInput: string, password: string, redirectUri?: string): Promise<string> {
    const { data } = await api.post('/auth/login', { email: emailInput, password, redirectUri });
    setToken(data.accessToken);
    return data.redirectTo as string;
  }

  async function fetchMe(): Promise<'user' | 'admin'> {
    const { data } = await api.get('/auth/me');
    role.value = data.role ?? 'user';
    email.value = data.email ?? '';
    return role.value;
  }

  async function refreshAccessToken(): Promise<string | null> {
    try {
      const { data } = await api.post('/auth/refresh');
      setToken(data.accessToken);
      return data.accessToken as string;
    } catch {
      setToken(null);
      authenticated.value = false;
      return null;
    }
  }

  async function bootstrap(): Promise<void> {
    const token = await refreshAccessToken();
    if (token) {
      try {
        await fetchMe();
        authenticated.value = true;
      } catch {
        // fetchMe 失败：清掉已写入的 token，避免「store 说未登录、但 client 仍带 bearer」的不一致
        setToken(null);
        authenticated.value = false;
      }
    } else {
      authenticated.value = false;
    }
    ready.value = true;
  }

  function ensureReady(): Promise<void> {
    if (!bootstrapPromise) bootstrapPromise = bootstrap();
    return bootstrapPromise;
  }

  async function handoffTo(url: string): Promise<void> {
    const token = await refreshAccessToken();
    window.location.assign(`${url}#access_token=${encodeURIComponent(token ?? '')}`);
  }

  async function logout(): Promise<void> {
    try { await api.post('/auth/logout'); } catch { /* 忽略登出失败 */ }
    setToken(null);
    role.value = 'user';
    email.value = '';
    authenticated.value = false;
    // 重置引导态，允许同一页面生命周期内重新 bootstrap
    ready.value = false;
    bootstrapPromise = null;
  }

  function performRedirect(redirectTo: string): void {
    if (redirectTo.startsWith('/')) {
      window.location.assign(redirectTo);
    } else {
      // 外部目标站：access token 放 URL fragment，不进 query/referrer
      window.location.assign(`${redirectTo}#access_token=${encodeURIComponent(accessToken.value ?? '')}`);
    }
  }

  return {
    accessToken, role, email, ready, authenticated,
    register, login, fetchMe, refreshAccessToken,
    bootstrap, ensureReady, handoffTo, logout, performRedirect,
  };
});
