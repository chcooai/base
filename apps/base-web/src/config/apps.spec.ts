import { describe, it, expect } from 'vitest';
import { LAUNCHER_APPS, visibleApps, type LauncherApp } from './apps';

const SAMPLE: LauncherApp[] = [
  { key: 'admin', name: '成员管理中心', url: '/admin', internal: true, requiredRole: 'admin' },
  { key: 'home', name: '启蔻家居', url: 'https://app.chcooai.com' },
];

describe('launcher apps', () => {
  it('should_include_admin_card_in_default_list', () => {
    expect(LAUNCHER_APPS.some((a) => a.key === 'admin' && a.internal && a.requiredRole === 'admin')).toBe(true);
  });

  it('should_include_admin_card_when_role_admin', () => {
    const r = visibleApps(SAMPLE, 'admin');
    expect(r.map((a) => a.key)).toEqual(['admin', 'home']);
  });

  it('should_exclude_admin_card_when_role_user', () => {
    const r = visibleApps(SAMPLE, 'user');
    expect(r.map((a) => a.key)).toEqual(['home']);
  });

  it('should_return_empty_when_all_apps_restricted_and_role_user', () => {
    const r = visibleApps([{ key: 'admin', name: 'x', url: '/admin', requiredRole: 'admin' }], 'user');
    expect(r).toEqual([]);
  });
});
