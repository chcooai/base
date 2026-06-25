export interface AppConfig {
  port: number;
  db: { host: string; port: number; username: string; password: string; database: string };
  jwt: { secret: string; accessTtl: string; refreshTtl: string };
  bcryptRounds: number;
  cookie: { secure: boolean; domain?: string };
  redirectAllowlist: string[];
  adminBootstrapEmail?: string;
}

export function configuration(): AppConfig {
  const e = process.env;
  return {
    port: Number(e.PORT ?? 3000),
    db: {
      host: e.DB_HOST!,
      port: Number(e.DB_PORT ?? 3306),
      username: e.DB_USERNAME!,
      password: e.DB_PASSWORD!,
      database: e.DB_NAME!,
    },
    jwt: {
      secret: e.JWT_SECRET!,
      accessTtl: e.AUTH_ACCESS_TTL ?? '900s',
      refreshTtl: e.AUTH_REFRESH_TTL ?? '30d',
    },
    bcryptRounds: Number(e.BCRYPT_ROUNDS ?? 12),
    cookie: {
      secure: (e.AUTH_COOKIE_SECURE ?? 'true') === 'true',
      domain: e.AUTH_COOKIE_DOMAIN,
    },
    redirectAllowlist: (e.REDIRECT_ALLOWLIST ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    adminBootstrapEmail: e.ADMIN_BOOTSTRAP_EMAIL,
  };
}
