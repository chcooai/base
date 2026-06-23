import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import LoginView from './LoginView.vue';

const loginMock = vi.fn();
const redirectMock = vi.fn();
vi.mock('../stores/auth', () => ({ useAuthStore: () => ({ login: loginMock, performRedirect: redirectMock, accessToken: null }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn() }) }));

describe('LoginView', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); });

  it('should_call_login_and_redirect_on_submit', async () => {
    loginMock.mockResolvedValue('/welcome');
    const wrapper = mount(LoginView);
    await wrapper.find('input[type="email"]').setValue('a@b.com');
    await wrapper.find('input[type="password"]').setValue('secret123');
    await wrapper.find('form').trigger('submit.prevent');
    await Promise.resolve(); await Promise.resolve();
    expect(loginMock).toHaveBeenCalledWith('a@b.com', 'secret123', undefined);
    expect(redirectMock).toHaveBeenCalledWith('/welcome');
  });
});
