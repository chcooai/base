import { plainToInstance } from 'class-transformer';
import { IsInt, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

export class EnvVars {
  @IsString() @MinLength(32) JWT_SECRET!: string;
  @IsString() DB_HOST!: string;
  @IsInt() DB_PORT!: number;
  @IsString() DB_USERNAME!: string;
  @IsString() DB_PASSWORD!: string;
  @IsString() DB_NAME!: string;
  @IsOptional() @IsString() AUTH_ACCESS_TTL?: string;
  @IsOptional() @IsString() AUTH_REFRESH_TTL?: string;
  @IsOptional() @IsInt() BCRYPT_ROUNDS?: number;
  @IsOptional() @IsString() AUTH_COOKIE_DOMAIN?: string;
  @IsOptional() @IsString() AUTH_COOKIE_SECURE?: string;
  @IsOptional() @IsString() REDIRECT_ALLOWLIST?: string;
  @IsOptional() @IsInt() PORT?: number;
  @IsOptional() @IsString() ADMIN_BOOTSTRAP_EMAIL?: string;
}

export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const obj = plainToInstance(EnvVars, raw, { enableImplicitConversion: true });
  const errors = validateSync(obj, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error('环境变量校验失败: ' + errors.map((e) => e.property).join(', '));
  }
  return obj;
}
