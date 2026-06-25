import { defineStore } from 'pinia';
import { ref } from 'vue';
import { adminApi, type Member } from '../api/admin';

export const useAdminStore = defineStore('admin', () => {
  const members = ref<Member[]>([]);
  const total = ref(0);

  async function load(page: number, pageSize: number, q?: string) {
    const { data } = await adminApi.list(page, pageSize, q);
    members.value = data.items;
    total.value = data.total;
  }
  const create = (email: string, password: string, role: 'user' | 'admin') => adminApi.create(email, password, role);
  const setStatus = (id: string, status: 'active' | 'disabled') => adminApi.setStatus(id, status);
  const resetPassword = (id: string, password: string) => adminApi.resetPassword(id, password);
  const setRole = (id: string, role: 'user' | 'admin') => adminApi.setRole(id, role);

  return { members, total, load, create, setStatus, resetPassword, setRole };
});
