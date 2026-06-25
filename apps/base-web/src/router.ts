import { createRouter, createWebHistory } from 'vue-router';
import LoginView from './views/LoginView.vue';
import RegisterView from './views/RegisterView.vue';
import WelcomeView from './views/WelcomeView.vue';
import AdminMembersView from './views/AdminMembersView.vue';
import { useAuthStore } from './stores/auth';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'login', component: LoginView },
    { path: '/register', name: 'register', component: RegisterView },
    { path: '/welcome', name: 'welcome', component: WelcomeView },
    { path: '/admin', name: 'admin', component: AdminMembersView },
  ],
});

const PROTECTED = new Set(['welcome', 'admin']);

export async function authGuard(
  to: { name?: unknown },
  auth: { ensureReady: () => Promise<void>; authenticated: boolean; role: 'user' | 'admin' },
): Promise<true | { name: string }> {
  if (!PROTECTED.has(to.name as string)) return true;
  await auth.ensureReady();
  if (!auth.authenticated) return { name: 'login' };
  if (to.name === 'admin' && auth.role !== 'admin') return { name: 'welcome' };
  return true;
}

router.beforeEach((to) => authGuard(to, useAuthStore()));
