import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
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
    await flushPromises();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/');
  });
});
