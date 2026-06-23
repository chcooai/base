import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { api } from '../api/client';
import { useAuthStore } from './auth';

vi.mock('../api/client', () => ({ api: { post: vi.fn() } }));

describe('auth store', () => {
  let assignMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign: assignMock },
      writable: true,
      configurable: true
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
    expect(assignMock).toHaveBeenCalledTimes(1);
  });

  it('should_assign_external_url_with_token_in_fragment_when_redirect_is_absolute', async () => {
    (api.post as any).mockResolvedValue({
      data: { accessToken: 'tok en', redirectTo: 'https://app.chcooai.com', email: 'a@b.com' }
    });
    const store = useAuthStore();
    await store.login('a@b.com', 'secret123', 'https://app.chcooai.com');
    store.performRedirect('https://app.chcooai.com/dash');
    expect(assignMock).toHaveBeenCalledWith('https://app.chcooai.com/dash#access_token=tok%20en');
    expect(assignMock).toHaveBeenCalledTimes(1);
  });
});
