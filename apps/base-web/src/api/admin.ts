import { api } from './client';

export interface Member {
  id: string;
  email: string;
  status: 'active' | 'disabled';
  role: 'user' | 'admin';
  createdAt: string;
}

export const adminApi = {
  list: (page: number, pageSize: number, q?: string) =>
    api.get('/admin/users', { params: { page, pageSize, q } }),
  create: (email: string, password: string, role: 'user' | 'admin') =>
    api.post('/admin/users', { email, password, role }),
  setStatus: (id: string, status: 'active' | 'disabled') =>
    api.patch(`/admin/users/${id}/status`, { status }),
  resetPassword: (id: string, password: string) =>
    api.patch(`/admin/users/${id}/password`, { password }),
  setRole: (id: string, role: 'user' | 'admin') =>
    api.patch(`/admin/users/${id}/role`, { role }),
};
