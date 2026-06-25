# Welcome 工作台（应用启动器 + 管理中心）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把登录后的占位欢迎页 `/welcome` 改成「工作台」——展示应用入口卡片（含 admin 专属「成员管理中心」），并补齐前端登录态底座，让登录用户真正看到内容、点得进去。

**Architecture:** 三层改动。① `api/client.ts` 加 token 注入 + 401 自动 refresh-retry 拦截器（拆成可单测的纯函数）；② `stores/auth.ts` 加 `bootstrap/ensureReady/refreshAccessToken/handoffTo/logout` 与 `email/ready/authenticated` 状态，access token 仍只存内存、启动时用 httpOnly refresh cookie 静默重建；③ `config/apps.ts` 前端静态应用清单 + `visibleApps` 过滤，`WelcomeView.vue` 重写为卡片网格，`router.ts` 改守卫。

**Tech Stack:** Vue 3 `<script setup>` + Pinia + vue-router 4 + axios 1.7 + Element Plus；测试 Vitest 2 + @vue/test-utils + jsdom。

## Global Constraints

- 所有工作目录命令在 `apps/base-web/` 下执行。
- 测试命令：单文件 `npx vitest run <相对路径>`；全量 `npm test`（= `vitest run`）。类型+构建：`npm run build`（`vue-tsc --noEmit && vite build`）。
- 测试命名 `should_xxx_when_yyy`；重业务逻辑，不纠结 UI 细节。
- access token **只存内存**（Pinia + client 模块变量），绝不写 localStorage/sessionStorage。
- 角色取值只有 `'user' | 'admin'`；`requiredRole` 仅 `'admin'`。
- 样式只用 `src/styles/tokens.css` 里的 `--mu-*` token，不硬编码颜色/间距/圆角。
- 提交信息用中文 Conventional Commits，结尾带 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 不新增后端接口、不动 DB、不加环境变量。

---

### Task 1: api/client.ts — token 注入 + 401 自动刷新拦截器

**Files:**
- Modify: `apps/base-web/src/api/client.ts`
- Test: `apps/base-web/src/api/client.spec.ts`

**Interfaces:**
- Produces:
  - `api: AxiosInstance`（已存在，保持）
  - `setApiToken(token: string | null): void` — 设置模块级 access token，供请求拦截器读取
  - `getApiToken(): string | null`
  - `onRequest(config): config` — 请求拦截器纯函数，有 token 时注入 `Authorization: Bearer`
  - `makeOnResponseError(deps: { refresh: () => Promise<string|null>; redirect: () => void; retry: (config:any)=>Promise<unknown> }): (error)=>Promise<unknown>` — 401 时刷新并重试一次的纯函数工厂
  - `installAuthInterceptors(deps: { refresh: () => Promise<string|null>; redirect: () => void }): void` — 把响应拦截器装到 `api` 上（`retry` 内部用 `api(config)`）
- Consumes: 无（Task 2/6 消费上面导出的符号）

- [ ] **Step 1: 写失败测试**（替换现有 `client.spec.ts` 全文）

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, setApiToken, getApiToken, onRequest, makeOnResponseError } from './client';

describe('api client', () => {
  beforeEach(() => { setApiToken(null); });

  it('should_use_api_baseurl_with_credentials', () => {
    expect(api.defaults.baseURL).toBe('/api');
    expect(api.defaults.withCredentials).toBe(true);
  });

  it('should_attach_bearer_header_when_token_present', () => {
    setApiToken('tok');
    const cfg = onRequest({ headers: {}, url: '/auth/me' } as any);
    expect(cfg.headers.Authorization).toBe('Bearer tok');
    expect(getApiToken()).toBe('tok');
  });

  it('should_not_attach_header_when_no_token', () => {
    const cfg = onRequest({ headers: {}, url: '/auth/me' } as any);
    expect(cfg.headers.Authorization).toBeUndefined();
  });

  it('should_refresh_and_retry_once_when_response_401', async () => {
    const refresh = vi.fn().mockResolvedValue('newtok');
    const retry = vi.fn().mockResolvedValue('ok');
    const redirect = vi.fn();
    const handler = makeOnResponseError({ refresh, redirect, retry });
    const err = { response: { status: 401 }, config: { url: '/auth/me', headers: {} } } as any;
    const res = await handler(err);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry.mock.calls[0][0].headers.Authorization).toBe('Bearer newtok');
    expect(retry.mock.calls[0][0]._retried).toBe(true);
    expect(res).toBe('ok');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('should_redirect_login_when_refresh_also_fails', async () => {
    const refresh = vi.fn().mockResolvedValue(null);
    const retry = vi.fn();
    const redirect = vi.fn();
    const handler = makeOnResponseError({ refresh, redirect, retry });
    const err = { response: { status: 401 }, config: { url: '/auth/me', headers: {} } } as any;
    await expect(handler(err)).rejects.toBe(err);
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });

  it('should_not_loop_when_refresh_endpoint_itself_401', async () => {
    const refresh = vi.fn();
    const retry = vi.fn();
    const redirect = vi.fn();
    const handler = makeOnResponseError({ refresh, redirect, retry });
    const err = { response: { status: 401 }, config: { url: '/auth/refresh', headers: {} } } as any;
    await expect(handler(err)).rejects.toBe(err);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('should_not_retry_twice_when_already_retried', async () => {
    const refresh = vi.fn();
    const retry = vi.fn();
    const redirect = vi.fn();
    const handler = makeOnResponseError({ refresh, redirect, retry });
    const err = { response: { status: 401 }, config: { url: '/auth/me', headers: {}, _retried: true } } as any;
    await expect(handler(err)).rejects.toBe(err);
    expect(refresh).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/api/client.spec.ts`
Expected: FAIL —`setApiToken`/`onRequest`/`makeOnResponseError` is not a function / not exported。

- [ ] **Step 3: 写实现**（替换 `client.ts` 全文）

```ts
import axios, { type AxiosError, type AxiosInstance } from 'axios';

export const api: AxiosInstance = axios.create({ baseURL: '/api', withCredentials: true });

let apiToken: string | null = null;
export function setApiToken(token: string | null): void { apiToken = token; }
export function getApiToken(): string | null { return apiToken; }

// 这些端点自身不参与 401→refresh→retry，避免递归
const AUTH_FREE = ['/auth/refresh', '/auth/login', '/auth/register'];

export function onRequest(config: any): any {
  if (apiToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${apiToken}`;
  }
  return config;
}

export function makeOnResponseError(deps: {
  refresh: () => Promise<string | null>;
  redirect: () => void;
  retry: (config: any) => Promise<unknown>;
}) {
  return async function onResponseError(error: AxiosError): Promise<unknown> {
    const config = error.config as any;
    const status = error.response?.status;
    const url: string = config?.url ?? '';
    if (status !== 401 || !config || config._retried || AUTH_FREE.some((p) => url.includes(p))) {
      return Promise.reject(error);
    }
    config._retried = true;
    const token = await deps.refresh();
    if (!token) {
      deps.redirect();
      return Promise.reject(error);
    }
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
    return deps.retry(config);
  };
}

api.interceptors.request.use(onRequest);

export function installAuthInterceptors(deps: {
  refresh: () => Promise<string | null>;
  redirect: () => void;
}): void {
  api.interceptors.response.use(
    (r) => r,
    makeOnResponseError({ ...deps, retry: (config) => api(config) }),
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/api/client.spec.ts`
Expected: PASS（6 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add apps/base-web/src/api/client.ts apps/base-web/src/api/client.spec.ts
git commit -m "feat(web): api client 加 token 注入与 401 自动刷新拦截器

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: stores/auth.ts — 会话引导 / 刷新 / 交接 / 登出

**Files:**
- Modify: `apps/base-web/src/stores/auth.ts`
- Test: `apps/base-web/src/stores/auth.spec.ts`

**Interfaces:**
- Consumes: `api`、`setApiToken`（Task 1）
- Produces（store 返回值新增/保留）：
  - state：`accessToken: string|null`、`role: 'user'|'admin'`、`email: string`、`ready: boolean`、`authenticated: boolean`
  - `register(email, password)`、`login(email, password, redirectUri?) => Promise<string>`、`fetchMe() => Promise<'user'|'admin'>`、`performRedirect(redirectTo)`（保留）
  - `refreshAccessToken() => Promise<string|null>` — POST `/auth/refresh`，成功存 token 并返回，失败返回 null 并清态
  - `bootstrap() => Promise<void>` — refresh 成功则 fetchMe，置 `authenticated`，最后 `ready=true`
  - `ensureReady() => Promise<void>` — 去重地只跑一次 bootstrap（缓存 in-flight Promise）
  - `handoffTo(url: string) => Promise<void>` — 先 refresh 取新鲜 token，再 `location.assign(url#access_token=...)`
  - `logout() => Promise<void>` — POST `/auth/logout` 后清态

- [ ] **Step 1: 写失败测试**（替换 `auth.spec.ts` 全文；注意 mock 增加 `setApiToken`）

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { api } from '../api/client';
import { useAuthStore } from './auth';

vi.mock('../api/client', () => ({ api: { post: vi.fn(), get: vi.fn() }, setApiToken: vi.fn() }));

describe('auth store', () => {
  let assignMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign: assignMock }, writable: true, configurable: true,
    });
  });

  it('should_store_access_token_and_return_redirect_on_login', async () => {
    (api.post as any).mockResolvedValue({ data: { accessToken: 'tok', redirectTo: '/welcome', email: 'a@b.com' } });
    const store = useAuthStore();
    const redirectTo = await store.login('a@b.com', 'secret123');
    expect(store.accessToken).toBe('tok');
    expect(redirectTo).toBe('/welcome');
    expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'a@b.com', password: 'secret123', redirectUri: undefined });
  });

  it('should_call_register_endpoint', async () => {
    (api.post as any).mockResolvedValue({ data: { id: '1', email: 'a@b.com' } });
    const store = useAuthStore();
    await store.register('a@b.com', 'secret123');
    expect(api.post).toHaveBeenCalledWith('/auth/register', { email: 'a@b.com', password: 'secret123' });
  });

  it('should_assign_internal_path_without_token_when_redirect_starts_with_slash', () => {
    const store = useAuthStore();
    store.performRedirect('/welcome');
    expect(assignMock).toHaveBeenCalledWith('/welcome');
  });

  it('should_fetch_me_and_store_role_and_email', async () => {
    (api.get as any).mockResolvedValue({ data: { sub: '1', email: 'a@b.com', role: 'admin', status: 'active' } });
    const store = useAuthStore();
    const role = await store.fetchMe();
    expect(role).toBe('admin');
    expect(store.role).toBe('admin');
    expect(store.email).toBe('a@b.com');
    expect(api.get).toHaveBeenCalledWith('/auth/me');
  });

  it('should_set_token_and_email_when_bootstrap_succeeds', async () => {
    (api.post as any).mockResolvedValue({ data: { accessToken: 'tok' } });        // /auth/refresh
    (api.get as any).mockResolvedValue({ data: { email: 'a@b.com', role: 'admin' } }); // /auth/me
    const store = useAuthStore();
    await store.bootstrap();
    expect(store.accessToken).toBe('tok');
    expect(store.email).toBe('a@b.com');
    expect(store.role).toBe('admin');
    expect(store.authenticated).toBe(true);
    expect(store.ready).toBe(true);
  });

  it('should_mark_unauthenticated_when_bootstrap_refresh_fails', async () => {
    (api.post as any).mockRejectedValue(new Error('401'));
    const store = useAuthStore();
    await store.bootstrap();
    expect(store.authenticated).toBe(false);
    expect(store.ready).toBe(true);
    expect(store.accessToken).toBeNull();
  });

  it('should_run_bootstrap_only_once_when_ensureReady_called_twice', async () => {
    (api.post as any).mockResolvedValue({ data: { accessToken: 'tok' } });
    (api.get as any).mockResolvedValue({ data: { email: 'a@b.com', role: 'user' } });
    const store = useAuthStore();
    await Promise.all([store.ensureReady(), store.ensureReady()]);
    expect(api.post).toHaveBeenCalledTimes(1); // 只 refresh 一次
  });

  it('should_build_fragment_url_when_handoffTo_external', async () => {
    (api.post as any).mockResolvedValue({ data: { accessToken: 'tok en' } });
    const store = useAuthStore();
    await store.handoffTo('https://app.chcooai.com/dash');
    expect(assignMock).toHaveBeenCalledWith('https://app.chcooai.com/dash#access_token=tok%20en');
  });

  it('should_clear_state_when_logout', async () => {
    (api.post as any).mockResolvedValue({ data: { ok: true } });
    const store = useAuthStore();
    await store.logout();
    expect(api.post).toHaveBeenCalledWith('/auth/logout');
    expect(store.accessToken).toBeNull();
    expect(store.authenticated).toBe(false);
    expect(store.email).toBe('');
    expect(store.role).toBe('user');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/stores/auth.spec.ts`
Expected: FAIL — `store.bootstrap`/`ensureReady`/`handoffTo`/`logout` 不是函数、`store.email` undefined。

- [ ] **Step 3: 写实现**（替换 `auth.ts` 全文）

```ts
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
  }

  function performRedirect(redirectTo: string): void {
    if (redirectTo.startsWith('/')) {
      window.location.assign(redirectTo);
    } else {
      window.location.assign(`${redirectTo}#access_token=${encodeURIComponent(accessToken.value ?? '')}`);
    }
  }

  return {
    accessToken, role, email, ready, authenticated,
    register, login, fetchMe, refreshAccessToken,
    bootstrap, ensureReady, handoffTo, logout, performRedirect,
  };
});
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/stores/auth.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/base-web/src/stores/auth.ts apps/base-web/src/stores/auth.spec.ts
git commit -m "feat(web): auth store 加会话引导/刷新/交接/登出

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: config/apps.ts — 静态应用清单 + 角色过滤

**Files:**
- Create: `apps/base-web/src/config/apps.ts`
- Test: `apps/base-web/src/config/apps.spec.ts`

**Interfaces:**
- Produces:
  - `interface LauncherApp { key: string; name: string; desc?: string; url: string; internal?: boolean; requiredRole?: 'admin' }`
  - `LAUNCHER_APPS: LauncherApp[]` — 内置「成员管理中心」一张卡
  - `visibleApps(apps: LauncherApp[], role: 'user'|'admin'): LauncherApp[]`

- [ ] **Step 1: 写失败测试**（新建 `config/apps.spec.ts`）

```ts
import { describe, it, expect } from 'vitest';
import { LAUNCHER_APPS, visibleApps, type LauncherApp } from './apps';

const SAMPLE: LauncherApp[] = [
  { key: 'admin', name: '成员管理中心', url: '/admin', internal: true, requiredRole: 'admin' },
  { key: 'home', name: '启蔻家居', url: 'https://app.chcooai.com' },
];

describe('launcher apps', () => {
  it('should_include_admin_card_in_default_list', () => {
    expect(LAUNCHER_APPS.some((a) => a.key === 'admin' && a.internal && a.requiredRole === 'admin')).toBe(true);
  });

  it('should_include_admin_card_when_role_admin', () => {
    const r = visibleApps(SAMPLE, 'admin');
    expect(r.map((a) => a.key)).toEqual(['admin', 'home']);
  });

  it('should_exclude_admin_card_when_role_user', () => {
    const r = visibleApps(SAMPLE, 'user');
    expect(r.map((a) => a.key)).toEqual(['home']);
  });

  it('should_return_empty_when_all_apps_restricted_and_role_user', () => {
    const r = visibleApps([{ key: 'admin', name: 'x', url: '/admin', requiredRole: 'admin' }], 'user');
    expect(r).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/config/apps.spec.ts`
Expected: FAIL — 找不到模块 `./apps`。

- [ ] **Step 3: 写实现**（新建 `config/apps.ts`）

```ts
export interface LauncherApp {
  key: string;             // 唯一标识
  name: string;            // 卡片标题
  desc?: string;           // 卡片说明
  url: string;             // 外链应用=完整 https；内部入口=路由如 '/admin'
  internal?: boolean;      // true=内部路由 router.push；缺省/false=外链 token 交接
  requiredRole?: 'admin';  // 缺省=所有登录用户可见；'admin'=仅管理员可见
}

// ⚠️ 新增外链应用 = 同时改这里 和 后端 REDIRECT_ALLOWLIST（origin 维度），否则交接会被白名单拒。
export const LAUNCHER_APPS: LauncherApp[] = [
  // 真应用以后往这里加，例如：
  // { key: 'home', name: '启蔻家居控制台', desc: '定制家具业务后台', url: 'https://app.chcooai.com' },
  { key: 'admin', name: '成员管理中心', desc: '管理平台成员、角色与状态', url: '/admin', internal: true, requiredRole: 'admin' },
];

export function visibleApps(apps: LauncherApp[], role: 'user' | 'admin'): LauncherApp[] {
  return apps.filter((a) => !a.requiredRole || a.requiredRole === role);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/config/apps.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/base-web/src/config/apps.ts apps/base-web/src/config/apps.spec.ts
git commit -m "feat(web): 新增前端应用清单 apps.ts 与角色过滤

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: router.ts — 受保护路由守卫（bootstrap 一次 + 角色门）

**Files:**
- Modify: `apps/base-web/src/router.ts`
- Test: `apps/base-web/src/router.spec.ts`

**Interfaces:**
- Consumes: `useAuthStore`（其 `ensureReady`/`authenticated`/`role`，Task 2）
- Produces:
  - `authGuard(to: { name?: unknown }, auth: { ensureReady: () => Promise<void>; authenticated: boolean; role: 'user'|'admin' }): Promise<true | { name: string }>`

- [ ] **Step 1: 写失败测试**（新建 `router.spec.ts`）

```ts
import { describe, it, expect, vi } from 'vitest';
import { authGuard } from './router';

function fakeAuth(over: Partial<{ authenticated: boolean; role: 'user' | 'admin' }> = {}) {
  return { ensureReady: vi.fn().mockResolvedValue(undefined), authenticated: true, role: 'user' as const, ...over };
}

describe('authGuard', () => {
  it('should_allow_public_route_without_bootstrap', async () => {
    const auth = fakeAuth();
    expect(await authGuard({ name: 'login' }, auth)).toBe(true);
    expect(auth.ensureReady).not.toHaveBeenCalled();
  });

  it('should_redirect_login_when_not_authenticated', async () => {
    const auth = fakeAuth({ authenticated: false });
    expect(await authGuard({ name: 'welcome' }, auth)).toEqual({ name: 'login' });
  });

  it('should_allow_welcome_when_authenticated', async () => {
    expect(await authGuard({ name: 'welcome' }, fakeAuth())).toBe(true);
  });

  it('should_redirect_welcome_when_non_admin_visits_admin', async () => {
    const auth = fakeAuth({ authenticated: true, role: 'user' });
    expect(await authGuard({ name: 'admin' }, auth)).toEqual({ name: 'welcome' });
  });

  it('should_allow_admin_when_role_admin', async () => {
    const auth = fakeAuth({ authenticated: true, role: 'admin' });
    expect(await authGuard({ name: 'admin' }, auth)).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/router.spec.ts`
Expected: FAIL — `authGuard` 未导出。

- [ ] **Step 3: 写实现**（替换 `router.ts` 全文）

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/router.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/base-web/src/router.ts apps/base-web/src/router.spec.ts
git commit -m "feat(web): 路由守卫改为启动引导一次 + 角色门

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: WelcomeView.vue — 工作台 UI（卡片网格 + 登出）

**Files:**
- Modify: `apps/base-web/src/views/WelcomeView.vue`（整体重写）
- Test: `apps/base-web/src/views/WelcomeView.spec.ts`（新建）

**Interfaces:**
- Consumes: `useAuthStore`（`email`/`role`/`handoffTo`/`logout`，Task 2）、`LAUNCHER_APPS`/`visibleApps`（Task 3）、`useRouter`
- Produces: 无（终端视图）

- [ ] **Step 1: 写失败测试**（新建 `WelcomeView.spec.ts`）

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import WelcomeView from './WelcomeView.vue';

const handoffTo = vi.fn();
const logout = vi.fn().mockResolvedValue(undefined);
const push = vi.fn();
const state = { role: 'user' as 'user' | 'admin', email: 'a@b.com' };

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({ role: state.role, email: state.email, handoffTo, logout }),
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
vi.mock('../config/apps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/apps')>();
  return {
    ...actual,
    LAUNCHER_APPS: [
      { key: 'admin', name: '成员管理中心', desc: '', url: '/admin', internal: true, requiredRole: 'admin' },
      { key: 'home', name: '启蔻家居', desc: '', url: 'https://app.chcooai.com' },
    ],
  };
});

function mountView() {
  return mount(WelcomeView, { global: { stubs: { QkMark: true } } });
}

describe('WelcomeView', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); state.role = 'user'; });

  it('should_hide_admin_card_when_role_user', () => {
    state.role = 'user';
    const w = mountView();
    expect(w.find('[data-test="card-admin"]').exists()).toBe(false);
    expect(w.find('[data-test="card-home"]').exists()).toBe(true);
  });

  it('should_show_admin_card_when_role_admin', () => {
    state.role = 'admin';
    const w = mountView();
    expect(w.find('[data-test="card-admin"]').exists()).toBe(true);
  });

  it('should_router_push_when_internal_card_clicked', async () => {
    state.role = 'admin';
    const w = mountView();
    await w.find('[data-test="card-admin"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/admin');
    expect(handoffTo).not.toHaveBeenCalled();
  });

  it('should_handoff_when_external_card_clicked', async () => {
    state.role = 'user';
    const w = mountView();
    await w.find('[data-test="card-home"]').trigger('click');
    expect(handoffTo).toHaveBeenCalledWith('https://app.chcooai.com');
  });

  it('should_logout_and_go_login_when_switch_clicked', async () => {
    const w = mountView();
    await w.find('[data-test="switch"]').trigger('click');
    await Promise.resolve();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/views/WelcomeView.spec.ts`
Expected: FAIL — 现有 WelcomeView 无这些 `data-test` 元素 / 仍引用旧 store 字段。

- [ ] **Step 3: 写实现**（替换 `WelcomeView.vue` 全文）

```vue
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
  background: rgba(250, 249, 245, 0.85);
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/views/WelcomeView.spec.ts`
Expected: PASS（5 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add apps/base-web/src/views/WelcomeView.vue apps/base-web/src/views/WelcomeView.spec.ts
git commit -m "feat(web): /welcome 改为工作台（应用卡片+管理中心+切换账号）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: main.ts — 装配响应拦截器（接 store 的 refresh/redirect）

**Files:**
- Modify: `apps/base-web/src/main.ts`

**Interfaces:**
- Consumes: `installAuthInterceptors`（Task 1）、`useAuthStore`（Task 2）、`router`（Task 4）

- [ ] **Step 1: 写实现**（替换 `main.ts` 全文）

```ts
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
```

- [ ] **Step 2: 类型检查 + 构建**

Run: `npm run build`
Expected: PASS（`vue-tsc --noEmit` 无类型错误，`vite build` 成功）。

- [ ] **Step 3: 跑全量测试**

Run: `npm test`
Expected: PASS（全部 spec 绿，含既有 admin/login/register 用例）。

- [ ] **Step 4: 提交**

```bash
git add apps/base-web/src/main.ts
git commit -m "feat(web): 启动时装配 401 自动刷新拦截器

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 验收（人工，可选但推荐）

按 `superpowers:verification-before-completion` / `/run` 起本地前端，校验：
1. 未登录访问 `/welcome` → 被守卫重定向到登录页 `/`。
2. 登录后落到 `/welcome`：顶部显示当前邮箱；admin 账号看到「成员管理中心」卡片，点击进 `/admin`；普通账号看不到该卡、显示空态。
3. 在 `/welcome` 刷新页面 → 会话不丢（靠 refresh cookie 静默重建），仍显示邮箱与卡片。
4. 点「切换账号」→ 登出并回到登录页。
5. （有外链真应用时）点外链卡 → 跳到 `appUrl#access_token=...`，白名单外的目标后端会拒。

## Self-Review 记录

- **Spec 覆盖**：①登录态底座=Task1(拦截器)+Task2(bootstrap/refresh)+Task4(守卫)+Task6(装配)；②工作台 UI=Task5；静态清单=Task3；登出/切换=Task2+Task5；安全(token 仅内存/白名单)=Task2/Task3 注释 + 后端不变。全部 spec 条目有对应 Task。
- **占位扫描**：无 TBD/TODO/“类似上文”，每个代码步骤含完整代码。
- **类型一致**：`setApiToken`/`getApiToken`/`onRequest`/`makeOnResponseError`/`installAuthInterceptors`（Task1）↔ Task2/Task6 调用一致；`ensureReady`/`authenticated`/`role`（Task2）↔ Task4 `authGuard` 形参一致；`LauncherApp`/`visibleApps`/`LAUNCHER_APPS`（Task3）↔ Task5 使用一致；`handoffTo`/`logout`/`email`（Task2）↔ Task5 使用一致。
- **空态测试**：作为纯函数 `visibleApps` 在 Task3 覆盖（`should_return_empty_when_all_apps_restricted_and_role_user`）；WelcomeView 的 `v-else` 模板分支随之生效，未单独做 DOM 空态断言（避免与受控 mock 列表冲突）。
