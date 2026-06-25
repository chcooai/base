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

router.beforeEach(async (to) => {
  if (to.name !== 'admin') return true;
  const auth = useAuthStore();
  try {
    const role = await auth.fetchMe();
    return role === 'admin' ? true : { name: 'welcome' };
  } catch {
    return { name: 'login' };
  }
});
