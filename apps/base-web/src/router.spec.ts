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
