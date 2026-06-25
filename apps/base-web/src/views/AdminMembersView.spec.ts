import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AdminMembersView from './AdminMembersView.vue';

const load = vi.fn();
vi.mock('../stores/admin', () => ({
  useAdminStore: () => ({
    members: [{ id: '1', email: 'a@b.com', status: 'active', role: 'admin', createdAt: '2026-01-01' }],
    total: 1, load, create: vi.fn(), setStatus: vi.fn(), resetPassword: vi.fn(), setRole: vi.fn(),
  }),
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('AdminMembersView', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); });

  it('should_load_members_on_mount', async () => {
    mount(AdminMembersView, {
      global: {
        directives: { loading: {} },
        stubs: {
          'el-table': true, 'el-table-column': true, 'el-pagination': true,
          'el-input': true, 'el-button': true, 'el-dialog': true, 'el-segmented': true,
        },
      },
    });
    await Promise.resolve();
    expect(load).toHaveBeenCalled();
  });
});
