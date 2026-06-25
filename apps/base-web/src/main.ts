import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import './styles/tokens.css';
import './styles/theme.css';
import App from './App.vue';
import { router } from './router';
import { installAuthInterceptors } from './api/client';
import { useAuthStore } from './stores/auth';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

const auth = useAuthStore(pinia);
installAuthInterceptors({
  refresh: () => auth.refreshAccessToken(),
  redirect: () => { window.location.assign('/'); },
});

app.use(router).use(ElementPlus).mount('#app');
