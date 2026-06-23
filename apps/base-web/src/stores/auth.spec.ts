import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { api } from '../api/client';
import { useAuthStore } from './auth';

vi.mock('../api/client', () => ({ api: { post: vi.fn() } }));

describe('auth store', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); });

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
});
