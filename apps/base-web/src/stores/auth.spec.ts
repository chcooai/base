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
