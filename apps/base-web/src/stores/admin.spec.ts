import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { api } from '../api/client';
import { useAdminStore } from './admin';

vi.mock('../api/client', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

describe('admin store', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); });

  it('should_load_members_with_total', async () => {
    (api.get as any).mockResolvedValue({ data: { items: [{ id: '1', email: 'a@b.com', status: 'active', role: 'user', createdAt: '2026-01-01' }], total: 1 } });
    const s = useAdminStore();
    await s.load(1, 20, 'a');
    expect(s.total).toBe(1);
    expect(s.members[0].email).toBe('a@b.com');
    expect(api.get).toHaveBeenCalledWith('/admin/users', { params: { page: 1, pageSize: 20, q: 'a' } });
  });

  it('should_call_create_endpoint', async () => {
    (api.post as any).mockResolvedValue({ data: { id: '2' } });
    const s = useAdminStore();
    await s.create('n@b.com', 'secret123', 'user');
    expect(api.post).toHaveBeenCalledWith('/admin/users', { email: 'n@b.com', password: 'secret123', role: 'user' });
  });

  it('should_call_status_role_password_endpoints', async () => {
    (api.patch as any).mockResolvedValue({ data: { ok: true } });
    const s = useAdminStore();
    await s.setStatus('3', 'disabled');
    await s.setRole('3', 'admin');
    await s.resetPassword('3', 'newsecret9');
    expect(api.patch).toHaveBeenCalledWith('/admin/users/3/status', { status: 'disabled' });
    expect(api.patch).toHaveBeenCalledWith('/admin/users/3/role', { role: 'admin' });
    expect(api.patch).toHaveBeenCalledWith('/admin/users/3/password', { password: 'newsecret9' });
  });
});
