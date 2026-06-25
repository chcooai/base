<template>
  <div class="qk-home">
    <header class="qk-home__bar">
      <div class="qk-brand"><QkMark :size="22" /><span class="qk-brand__name">启蔻</span><span class="qk-brand__ai">AI</span></div>
      <div class="qk-home__user">
        <span class="qk-home__email mu-truncate">{{ email }}</span>
        <a href="#" data-test="switch" class="qk-home__switch" @click.prevent="onSwitch">切换账号</a>
      </div>
    </header>

    <main class="qk-home__main">
      <header class="qk-home__head">
        <h1 class="qk-home__h1">应用中心</h1>
        <p class="qk-home__lead">选择一个应用进入工作。</p>
      </header>

      <div v-if="apps.length" class="qk-home__grid">
        <button
          v-for="app in apps"
          :key="app.key"
          :data-test="`card-${app.key}`"
          type="button"
          class="qk-launch"
          @click="open(app)"
        >
          <span class="qk-launch__name">{{ app.name }}</span>
          <span v-if="app.desc" class="qk-launch__desc">{{ app.desc }}</span>
        </button>
      </div>
      <p v-else class="qk-home__empty">暂无可用应用，敬请期待</p>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import QkMark from '../components/QkMark.vue';
import { useAuthStore } from '../stores/auth';
import { LAUNCHER_APPS, visibleApps, type LauncherApp } from '../config/apps';

const store = useAuthStore();
const router = useRouter();
const email = computed(() => store.email);
const apps = computed(() => visibleApps(LAUNCHER_APPS, store.role));

function open(app: LauncherApp): void {
  if (app.internal) router.push(app.url);
  else store.handoffTo(app.url);
}

async function onSwitch(): Promise<void> {
  await store.logout();
  router.push('/');
}
</script>

<style scoped>
.qk-home { min-height: 100dvh; background: var(--mu-color-surface-page); }
.qk-home__bar {
  position: sticky;
  top: 0;
  z-index: var(--mu-z-sticky);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mu-space-4);
  padding: var(--mu-space-4) var(--mu-space-6);
  background: color-mix(in srgb, var(--mu-color-surface-page) 85%, transparent);
  backdrop-filter: saturate(180%) blur(8px);
  border-bottom: 1px solid var(--mu-color-border-subtle);
}
.qk-home__bar .qk-brand__name { font-size: var(--mu-font-size-xl); }
.qk-home__user { display: flex; align-items: center; gap: var(--mu-space-4); min-width: 0; }
.qk-home__email { font-size: var(--mu-font-size-sm); color: var(--mu-color-text-secondary); max-width: 40vw; }
.qk-home__switch { font-size: var(--mu-font-size-sm); color: var(--mu-color-text-link); text-decoration: none; white-space: nowrap; }
.qk-home__switch:hover { text-decoration: underline; }

.qk-home__main {
  max-width: var(--mu-container-pc-lg);
  margin: 0 auto;
  padding: var(--mu-space-10) var(--mu-space-6) var(--mu-space-16);
}
.qk-home__head { margin-bottom: var(--mu-space-8); }
.qk-home__h1 {
  font-family: var(--mu-font-serif);
  font-size: var(--mu-font-size-3xl);
  font-weight: var(--mu-font-weight-regular);
  color: var(--mu-color-text-primary);
  margin: 0 0 var(--mu-space-1);
}
.qk-home__lead { font-size: var(--mu-font-size-sm); color: var(--mu-color-text-secondary); margin: 0; }

.qk-home__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--mu-space-4);
}
.qk-launch {
  display: flex;
  flex-direction: column;
  gap: var(--mu-space-2);
  text-align: left;
  padding: var(--mu-space-6);
  background: var(--mu-color-surface-card);
  border: 1px solid var(--mu-color-border-subtle);
  border-radius: var(--mu-radius-lg);
  cursor: pointer;
  transition: border-color var(--mu-duration-normal) var(--mu-ease-standard),
              box-shadow var(--mu-duration-normal) var(--mu-ease-standard);
}
.qk-launch:hover { border-color: var(--mu-color-border-hover); box-shadow: var(--mu-shadow-sm); }
.qk-launch:focus-visible { outline: none; box-shadow: var(--mu-shadow-focus-ring); }
.qk-launch__name {
  font-family: var(--mu-font-serif);
  font-size: var(--mu-font-size-lg);
  color: var(--mu-color-text-primary);
}
.qk-launch__desc { font-size: var(--mu-font-size-sm); color: var(--mu-color-text-secondary); }
.qk-home__empty {
  padding: var(--mu-space-16) 0;
  text-align: center;
  color: var(--mu-color-text-tertiary);
  font-size: var(--mu-font-size-sm);
}
</style>
