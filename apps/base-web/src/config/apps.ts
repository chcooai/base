export interface LauncherApp {
  key: string;             // 唯一标识
  name: string;            // 卡片标题
  desc?: string;           // 卡片说明
  url: string;             // 外链应用=完整 https；内部入口=路由如 '/admin'
  internal?: boolean;      // true=内部路由 router.push；缺省/false=外链 token 交接
  requiredRole?: 'admin';  // 缺省=所有登录用户可见；'admin'=仅管理员可见
}

// ⚠️ 新增外链应用 = 同时改这里 和 后端 REDIRECT_ALLOWLIST（origin 维度），否则交接会被白名单拒。
export const LAUNCHER_APPS: LauncherApp[] = [
  // 真应用以后往这里加，例如：
  // { key: 'home', name: '启蔻家居控制台', desc: '定制家具业务后台', url: 'https://app.chcooai.com' },
  { key: 'admin', name: '成员管理中心', desc: '管理平台成员、角色与状态', url: '/admin', internal: true, requiredRole: 'admin' },
];

export function visibleApps(apps: LauncherApp[], role: 'user' | 'admin'): LauncherApp[] {
  return apps.filter((a) => !a.requiredRole || a.requiredRole === role);
}
