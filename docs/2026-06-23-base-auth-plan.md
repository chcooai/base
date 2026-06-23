# Base 登录服务实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `chcooai/base` 仓建一套精简鉴权服务（邮箱密码注册/登录、access+refresh 双 token、登录后带 token 跳转），部署到 187 k3s 取代现有 index 主页。

**Architecture:** NestJS API（`apps/base-api`）+ Vue3 前端（`apps/base-web`）monorepo。access token 用无状态 JWT；refresh token 用不透明随机串、哈希存 MySQL、支持轮换与吊销（不引 Redis）。登录成功后前端把 access token 放 URL fragment 跳到白名单内的 `redirect_uri`，下游自行校验。GitOps 走 ghcr + ArgoCD，与 `chcooai/index` 同款。

**Tech Stack:** Node 22 / NestJS 11 / TypeORM 0.3 / MySQL 8 / bcrypt / @nestjs/jwt / jest + supertest；Vue 3 / Vite / Element Plus / Pinia / vue-router / axios / vitest；Docker / GitHub Actions / k3s / ArgoCD / Traefik / cert-manager。

## Global Constraints

- Node `>=22`，NestJS `^11`，TypeORM `^0.3`。
- **不引 Redis**：refresh token 哈希存 MySQL 表 `refresh_tokens`。
- access token：JWT(HS256)，TTL `AUTH_ACCESS_TTL`（默认 `900s`）；refresh token：32 字节随机串 base64url，TTL `AUTH_REFRESH_TTL`（默认 `30d`），DB 只存 `sha256(token)`。
- 密码：bcrypt，rounds=`BCRYPT_ROUNDS`（默认 `12`）。
- 业务范围只有 `auth` + `users` 两个模块；不引入权限/RBAC/多租户/任何 muoce 其它模块。
- 所有密钥（`JWT_SECRET`、`DB_PASSWORD` 等）走 k8s Secret，**禁止读取/打印/提交 `.env` 内容**。
- 单测/集成测试用 sqlite in-memory（`better-sqlite3`）跑，不连真 MySQL；实体字段只用可移植类型（`varchar`/`bigint`/`datetime`/`int`）。
- 测试命名 `should_xxx_when_yyy`；"测试通过" = 实际跑过看到绿。
- 提交信息中文 Conventional Commits（`feat:`/`fix:`/`chore:` …）。
- 域名 `www.chcooai.com` / `chcooai.com`；命名空间 `chcooai-prod`；镜像 `ghcr.io/chcooai/base-api`、`ghcr.io/chcooai/base-web`；Argo App `chcooai-base`。

---

## 文件结构

```
chcooai/base/
├── package.json                              # monorepo 根脚本（build/test/lint 转发）
├── apps/
│   ├── base-api/
│   │   ├── package.json  tsconfig.json  nest-cli.json  jest config
│   │   ├── src/
│   │   │   ├── main.ts                        # bootstrap：setupApp + listen
│   │   │   ├── app.module.ts                  # 组装 Config/Database/Users/Auth/Health
│   │   │   ├── config/configuration.ts        # 读 env → 强类型 config
│   │   │   ├── config/env.validation.ts       # 启动期 env 校验
│   │   │   ├── database/data-source.ts         # TypeORM CLI 用 DataSource
│   │   │   ├── database/database.module.ts     # TypeOrmModule.forRootAsync
│   │   │   ├── database/migrations/*.ts         # 建表迁移
│   │   │   ├── users/
│   │   │   │   ├── user.entity.ts
│   │   │   │   ├── users.service.ts            # create / findByEmail / verifyPassword
│   │   │   │   └── users.module.ts
│   │   │   ├── auth/
│   │   │   │   ├── refresh-token.entity.ts
│   │   │   │   ├── token.service.ts            # 签 access / 发&轮换&吊销 refresh
│   │   │   │   ├── redirect.service.ts         # redirect_uri 白名单校验
│   │   │   │   ├── auth.service.ts             # register / login / refresh / logout
│   │   │   │   ├── auth.controller.ts          # /api/auth/*
│   │   │   │   ├── jwt-auth.guard.ts           # 校验 access → 注入 user
│   │   │   │   ├── current-user.decorator.ts
│   │   │   │   └── dto/*.ts                     # register/login/refresh 入参
│   │   │   └── health/health.controller.ts     # GET /api/health
│   │   └── test/                               # e2e（supertest）
│   └── base-web/
│       ├── package.json  vite.config.ts  tsconfig  index.html
│       └── src/
│           ├── main.ts  App.vue  router.ts
│           ├── api/client.ts                   # axios 实例
│           ├── stores/auth.ts                  # pinia：login/register/redirect
│           └── views/{LoginView,RegisterView,WelcomeView}.vue
├── Dockerfile.api  Dockerfile.web
├── .github/workflows/deploy.yml
└── k8s/
    ├── base/{mysql.yaml,base-api.yaml,base-web.yaml,ingress.yaml,kustomization.yaml}
    └── overlays/production/kustomization.yaml
```

---

## Phase A — API 骨架与数据库

### Task 1: monorepo + base-api 骨架 + /api/health

**Files:**
- Create: `package.json`（根）
- Create: `apps/base-api/package.json`、`tsconfig.json`、`tsconfig.build.json`、`nest-cli.json`、`.prettierrc.json`
- Create: `apps/base-api/src/main.ts`、`src/bootstrap/setup-app.ts`、`src/app.module.ts`、`src/health/health.controller.ts`、`src/health/health.module.ts`
- Test: `apps/base-api/test/health.e2e-spec.ts`、`apps/base-api/test/jest-e2e.json`

**Interfaces:**
- Produces: `setupApp(app: INestApplication): void`（设全局前缀 `api`、`ValidationPipe`、`cookie-parser`）；`GET /api/health` → `{ status: 'ok' }`。

- [ ] **Step 1: 根 `package.json`**

```json
{
  "name": "chcooai-base",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "build": "npm --prefix apps/base-api run build && npm --prefix apps/base-web run build",
    "dev:api": "npm --prefix apps/base-api run start:dev",
    "dev:web": "npm --prefix apps/base-web run dev",
    "test": "npm --prefix apps/base-api run test && npm --prefix apps/base-api run test:e2e && npm --prefix apps/base-web run test",
    "lint": "npm --prefix apps/base-api run lint"
  }
}
```

- [ ] **Step 2: `apps/base-api/package.json`**

```json
{
  "name": "base-api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \"src/**/*.ts\" --fix",
    "test": "jest --runInBand",
    "test:e2e": "jest --config ./test/jest-e2e.json --runInBand",
    "migration:run": "node -r ts-node/register ./node_modules/typeorm/cli.js migration:run -d src/database/data-source.ts",
    "migration:run:prod": "typeorm migration:run -d dist/database/data-source.js"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.1",
    "@nestjs/config": "^4.0.0",
    "@nestjs/core": "^11.0.1",
    "@nestjs/jwt": "^11.0.0",
    "@nestjs/platform-express": "^11.0.1",
    "@nestjs/throttler": "^6.4.0",
    "@nestjs/typeorm": "^11.0.0",
    "bcrypt": "^6.0.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "cookie-parser": "^1.4.7",
    "mysql2": "^3.11.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "typeorm": "^0.3.20"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.0.1",
    "@types/bcrypt": "^5.0.2",
    "@types/cookie-parser": "^1.4.8",
    "@types/express": "^5.0.0",
    "@types/jest": "^29.5.14",
    "@types/node": "^22.10.0",
    "@types/supertest": "^6.0.2",
    "better-sqlite3": "^11.5.0",
    "eslint": "^9.0.0",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.7.2"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.ts$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 3: `tsconfig.json` / `tsconfig.build.json` / `nest-cli.json`**

`apps/base-api/tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "target": "ES2022",
    "outDir": "./dist",
    "baseUrl": "./",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "sourceMap": true,
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitAny": true
  }
}
```
`apps/base-api/tsconfig.build.json`:
```json
{ "extends": "./tsconfig.json", "exclude": ["node_modules", "test", "dist", "**/*spec.ts"] }
```
`apps/base-api/nest-cli.json`:
```json
{ "$schema": "https://json.schemastore.org/nest-cli", "collection": "@nestjs/schematics", "sourceRoot": "src", "compilerOptions": { "deleteOutDir": true } }
```

- [ ] **Step 4: 写失败的 e2e 测试**

`apps/base-api/test/jest-e2e.json`:
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.ts$": "ts-jest" }
}
```
`apps/base-api/test/health.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/bootstrap/setup-app';

describe('Health (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('should_return_ok_when_get_health', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 5: 跑测试确认失败**

Run: `npm --prefix apps/base-api install && npm --prefix apps/base-api run test:e2e`
Expected: FAIL（`AppModule` / `setupApp` 不存在）

- [ ] **Step 6: 实现骨架**

`apps/base-api/src/bootstrap/setup-app.ts`:
```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

export function setupApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
}
```
`apps/base-api/src/health/health.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
```
`apps/base-api/src/health/health.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
```
`apps/base-api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';

@Module({ imports: [HealthModule] })
export class AppModule {}
```
`apps/base-api/src/main.ts`:
```ts
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { setupApp } from './bootstrap/setup-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  setupApp(app);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('bootstrap').log(`listening on :${port}`);
}
void bootstrap();
```

- [ ] **Step 7: 跑测试确认通过**

Run: `npm --prefix apps/base-api run test:e2e`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add package.json apps/base-api
git commit -m "feat: 初始化 base-api NestJS 骨架与 health 端点"
```

---

### Task 2: 配置与 env 校验

**Files:**
- Create: `apps/base-api/src/config/configuration.ts`、`src/config/env.validation.ts`
- Modify: `apps/base-api/src/app.module.ts`（接入 `ConfigModule`）
- Test: `apps/base-api/src/config/env.validation.spec.ts`

**Interfaces:**
- Produces: `validateEnv(raw: Record<string, unknown>): EnvVars`（缺必填或类型错则 throw）；`configuration(): AppConfig`，其中
  ```ts
  interface AppConfig {
    port: number;
    db: { host: string; port: number; username: string; password: string; database: string };
    jwt: { secret: string; accessTtl: string; refreshTtl: string };
    bcryptRounds: number;
    cookie: { secure: boolean; domain?: string };
    redirectAllowlist: string[]; // 逗号分隔的 origin 列表
  }
  ```

- [ ] **Step 1: 写失败的测试**

`apps/base-api/src/config/env.validation.spec.ts`:
```ts
import { validateEnv } from './env.validation';

const base = {
  JWT_SECRET: 'x'.repeat(32),
  DB_HOST: 'db', DB_PORT: '3306', DB_USERNAME: 'base',
  DB_PASSWORD: 'pw', DB_NAME: 'base',
};

describe('validateEnv', () => {
  it('should_pass_when_required_present', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });
  it('should_throw_when_jwt_secret_missing', () => {
    const { JWT_SECRET, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow();
  });
  it('should_throw_when_jwt_secret_too_short', () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: 'short' })).toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix apps/base-api run test -- env.validation`
Expected: FAIL（`validateEnv` 不存在）

- [ ] **Step 3: 实现**

`apps/base-api/src/config/env.validation.ts`:
```ts
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
}

export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const obj = plainToInstance(EnvVars, raw, { enableImplicitConversion: true });
  const errors = validateSync(obj, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error('环境变量校验失败: ' + errors.map((e) => e.property).join(', '));
  }
  return obj;
}
```
`apps/base-api/src/config/configuration.ts`:
```ts
export interface AppConfig {
  port: number;
  db: { host: string; port: number; username: string; password: string; database: string };
  jwt: { secret: string; accessTtl: string; refreshTtl: string };
  bcryptRounds: number;
  cookie: { secure: boolean; domain?: string };
  redirectAllowlist: string[];
}

export function configuration(): AppConfig {
  const e = process.env;
  return {
    port: Number(e.PORT ?? 3000),
    db: {
      host: e.DB_HOST!, port: Number(e.DB_PORT ?? 3306),
      username: e.DB_USERNAME!, password: e.DB_PASSWORD!, database: e.DB_NAME!,
    },
    jwt: {
      secret: e.JWT_SECRET!,
      accessTtl: e.AUTH_ACCESS_TTL ?? '900s',
      refreshTtl: e.AUTH_REFRESH_TTL ?? '30d',
    },
    bcryptRounds: Number(e.BCRYPT_ROUNDS ?? 12),
    cookie: { secure: (e.AUTH_COOKIE_SECURE ?? 'true') === 'true', domain: e.AUTH_COOKIE_DOMAIN },
    redirectAllowlist: (e.REDIRECT_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}
```
在 `app.module.ts` 的 `imports` 顶部加：
```ts
import { ConfigModule } from '@nestjs/config';
import { configuration } from './config/configuration';
import { validateEnv } from './config/env.validation';
// imports: [
ConfigModule.forRoot({ isGlobal: true, cache: true, load: [configuration], validate: validateEnv }),
// HealthModule, ...
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix apps/base-api run test -- env.validation`
Expected: PASS（3 个用例绿）

- [ ] **Step 5: 提交**

```bash
git add apps/base-api/src/config apps/base-api/src/app.module.ts
git commit -m "feat: 加 env 校验与强类型配置"
```

---

### Task 3: 实体 + 数据库模块 + 迁移

**Files:**
- Create: `apps/base-api/src/users/user.entity.ts`、`src/auth/refresh-token.entity.ts`
- Create: `apps/base-api/src/database/data-source.ts`、`src/database/database.module.ts`、`src/database/migrations/1750000000000-init.ts`
- Modify: `apps/base-api/src/app.module.ts`（接入 `DatabaseModule`）
- Test: `apps/base-api/src/database/entities.spec.ts`

**Interfaces:**
- Produces：
  ```ts
  // user.entity.ts
  @Entity('users') class User {
    id: string; email: string; passwordHash: string;
    status: 'active' | 'disabled'; createdAt: Date; updatedAt: Date;
  }
  // refresh-token.entity.ts
  @Entity('refresh_tokens') class RefreshToken {
    id: string; userId: string; tokenHash: string;
    expiresAt: Date; revokedAt: Date | null; createdAt: Date;
  }
  ```
- `buildDataSourceOptions(cfg): DataSourceOptions`（生产连 MySQL；测试可被覆盖为 sqlite）。

- [ ] **Step 1: 写失败的测试（用 sqlite in-memory 验证实体可建表/读写）**

`apps/base-api/src/database/entities.spec.ts`:
```ts
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { RefreshToken } from '../auth/refresh-token.entity';

describe('entities', () => {
  let ds: DataSource;
  beforeAll(async () => {
    ds = new DataSource({
      type: 'better-sqlite3', database: ':memory:',
      entities: [User, RefreshToken], synchronize: true,
    });
    await ds.initialize();
  });
  afterAll(async () => { await ds.destroy(); });

  it('should_persist_and_read_user', async () => {
    const repo = ds.getRepository(User);
    const u = await repo.save(repo.create({ email: 'a@b.com', passwordHash: 'h', status: 'active' }));
    expect(u.id).toBeDefined();
    const found = await repo.findOneByOrFail({ email: 'a@b.com' });
    expect(found.passwordHash).toBe('h');
  });

  it('should_reject_duplicate_email', async () => {
    const repo = ds.getRepository(User);
    await repo.save(repo.create({ email: 'dup@b.com', passwordHash: 'h', status: 'active' }));
    await expect(
      repo.save(repo.create({ email: 'dup@b.com', passwordHash: 'h2', status: 'active' })),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix apps/base-api run test -- entities`
Expected: FAIL（实体不存在）

- [ ] **Step 3: 实现实体**

`apps/base-api/src/users/user.entity.ts`:
```ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'disabled';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
```
`apps/base-api/src/auth/refresh-token.entity.ts`:
```ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'datetime', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
```

- [ ] **Step 4: 实现 data-source 与 DatabaseModule**

`apps/base-api/src/database/data-source.ts`:
```ts
import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from '../users/user.entity';
import { RefreshToken } from '../auth/refresh-token.entity';
import { InitSchema1750000000000 } from './migrations/1750000000000-init';

export function buildDataSourceOptions(): DataSourceOptions {
  return {
    type: 'mysql',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [User, RefreshToken],
    migrations: [InitSchema1750000000000],
    synchronize: false,
  };
}

export default new DataSource(buildDataSourceOptions());
```
`apps/base-api/src/database/database.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './data-source';

@Module({
  imports: [TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions() })],
})
export class DatabaseModule {}
```

- [ ] **Step 5: 实现迁移**

`apps/base-api/src/database/migrations/1750000000000-init.ts`:
```ts
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class InitSchema1750000000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.createTable(new Table({
      name: 'users',
      columns: [
        { name: 'id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'email', type: 'varchar', length: '255' },
        { name: 'password_hash', type: 'varchar', length: '255' },
        { name: 'status', type: 'varchar', length: '16', default: "'active'" },
        { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
      ],
    }), true);
    await q.createIndex('users', new TableIndex({ name: 'uq_users_email', columnNames: ['email'], isUnique: true }));

    await q.createTable(new Table({
      name: 'refresh_tokens',
      columns: [
        { name: 'id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'user_id', type: 'bigint' },
        { name: 'token_hash', type: 'varchar', length: '64' },
        { name: 'expires_at', type: 'datetime' },
        { name: 'revoked_at', type: 'datetime', isNullable: true },
        { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
      ],
    }), true);
    await q.createIndex('refresh_tokens', new TableIndex({ name: 'uq_refresh_hash', columnNames: ['token_hash'], isUnique: true }));
    await q.createIndex('refresh_tokens', new TableIndex({ name: 'idx_refresh_user', columnNames: ['user_id'] }));
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.dropTable('refresh_tokens', true);
    await q.dropTable('users', true);
  }
}
```
在 `app.module.ts` 的 imports 里加 `DatabaseModule`（放在 `ConfigModule` 之后）。

- [ ] **Step 6: 跑测试确认通过**

Run: `npm --prefix apps/base-api run test -- entities`
Expected: PASS（2 个用例绿）

- [ ] **Step 7: 提交**

```bash
git add apps/base-api/src/users apps/base-api/src/auth/refresh-token.entity.ts apps/base-api/src/database apps/base-api/src/app.module.ts
git commit -m "feat: 加 User/RefreshToken 实体、TypeORM 数据库模块与建表迁移"
```

---

## Phase B — 用户与鉴权领域逻辑

### Task 4: UsersService（建用户 + bcrypt 校验密码）

**Files:**
- Create: `apps/base-api/src/users/users.service.ts`、`src/users/users.module.ts`
- Test: `apps/base-api/src/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `User` 实体（Task 3）、`AppConfig.bcryptRounds`。
- Produces:
  ```ts
  class UsersService {
    create(email: string, password: string): Promise<User>;      // 邮箱已存在 throw ConflictException
    findByEmail(email: string): Promise<User | null>;
    verifyPassword(user: User, password: string): Promise<boolean>;
  }
  ```

- [ ] **Step 1: 写失败的测试**

`apps/base-api/src/users/users.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { User } from './user.entity';
import { UsersService } from './users.service';
import { configuration } from '../config/configuration';

describe('UsersService', () => {
  let service: UsersService;
  beforeEach(async () => {
    process.env.BCRYPT_ROUNDS = '4'; // 测试加速
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        TypeOrmModule.forRoot({ type: 'better-sqlite3', database: ':memory:', entities: [User], synchronize: true }),
        TypeOrmModule.forFeature([User]),
      ],
      providers: [UsersService],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('should_hash_password_when_create', async () => {
    const u = await service.create('a@b.com', 'secret123');
    expect(u.passwordHash).not.toBe('secret123');
    expect(await service.verifyPassword(u, 'secret123')).toBe(true);
    expect(await service.verifyPassword(u, 'wrong')).toBe(false);
  });

  it('should_throw_conflict_when_duplicate_email', async () => {
    await service.create('dup@b.com', 'secret123');
    await expect(service.create('dup@b.com', 'other123')).rejects.toBeInstanceOf(ConflictException);
  });

  it('should_return_null_when_email_unknown', async () => {
    expect(await service.findByEmail('none@b.com')).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix apps/base-api run test -- users.service`
Expected: FAIL（`UsersService` 不存在）

- [ ] **Step 3: 实现**

`apps/base-api/src/users/users.service.ts`:
```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async create(email: string, password: string): Promise<User> {
    const normalized = email.trim().toLowerCase();
    if (await this.findByEmail(normalized)) {
      throw new ConflictException('邮箱已被注册');
    }
    const rounds = this.config.get<number>('bcryptRounds', 12);
    const passwordHash = await bcrypt.hash(password, rounds);
    return this.repo.save(this.repo.create({ email: normalized, passwordHash, status: 'active' }));
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }
}
```
`apps/base-api/src/users/users.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix apps/base-api run test -- users.service`
Expected: PASS（3 个用例绿）

- [ ] **Step 5: 提交**

```bash
git add apps/base-api/src/users
git commit -m "feat: 加 UsersService（bcrypt 建用户与密码校验）"
```

---

### Task 5: TokenService（签 access JWT + 发/轮换/吊销 refresh）

**Files:**
- Create: `apps/base-api/src/auth/token.service.ts`
- Test: `apps/base-api/src/auth/token.service.spec.ts`

**Interfaces:**
- Consumes: `RefreshToken` 实体、`JwtService`（`@nestjs/jwt`）、`AppConfig.jwt`。
- Produces:
  ```ts
  interface TokenPair { accessToken: string; refreshToken: string; }
  class TokenService {
    issuePair(userId: string, email: string): Promise<TokenPair>;
    rotate(rawRefresh: string): Promise<TokenPair & { userId: string; email: string }>; // 无效/过期/已吊销 throw UnauthorizedException
    revoke(rawRefresh: string): Promise<void>;
    verifyAccess(token: string): { sub: string; email: string }; // 无效 throw
  }
  ```
- 内部：`sha256(raw)` 存库；refresh 原文 = `randomBytes(32).toString('base64url')`。

- [ ] **Step 1: 写失败的测试**

`apps/base-api/src/auth/token.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { RefreshToken } from './refresh-token.entity';
import { TokenService } from './token.service';
import { configuration } from '../config/configuration';

describe('TokenService', () => {
  let service: TokenService;
  beforeEach(async () => {
    process.env.JWT_SECRET = 'y'.repeat(32);
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        JwtModule.register({ secret: 'y'.repeat(32) }),
        TypeOrmModule.forRoot({ type: 'better-sqlite3', database: ':memory:', entities: [RefreshToken], synchronize: true }),
        TypeOrmModule.forFeature([RefreshToken]),
      ],
      providers: [TokenService],
    }).compile();
    service = moduleRef.get(TokenService);
  });

  it('should_issue_verifiable_access_token', async () => {
    const pair = await service.issuePair('1', 'a@b.com');
    expect(service.verifyAccess(pair.accessToken)).toMatchObject({ sub: '1', email: 'a@b.com' });
    expect(pair.refreshToken).toHaveLength(43); // 32 字节 base64url
  });

  it('should_rotate_and_invalidate_old_refresh', async () => {
    const pair = await service.issuePair('1', 'a@b.com');
    const rotated = await service.rotate(pair.refreshToken);
    expect(rotated.userId).toBe('1');
    await expect(service.rotate(pair.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.verifyAccess(rotated.accessToken)).toMatchObject({ sub: '1' });
  });

  it('should_reject_refresh_after_revoke', async () => {
    const pair = await service.issuePair('1', 'a@b.com');
    await service.revoke(pair.refreshToken);
    await expect(service.rotate(pair.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should_reject_unknown_refresh', async () => {
    await expect(service.rotate('garbage')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix apps/base-api run test -- token.service`
Expected: FAIL（`TokenService` 不存在）

- [ ] **Step 3: 实现**

`apps/base-api/src/auth/token.service.ts`:
```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { RefreshToken } from './refresh-token.entity';

export interface TokenPair { accessToken: string; refreshToken: string; }

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class TokenService {
  constructor(
    @InjectRepository(RefreshToken) private readonly repo: Repository<RefreshToken>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issuePair(userId: string, email: string): Promise<TokenPair> {
    const accessToken = this.signAccess(userId, email);
    const refreshToken = randomBytes(32).toString('base64url');
    const ttlMs = this.parseTtlMs(this.config.get<string>('jwt.refreshTtl', '30d'));
    await this.repo.save(this.repo.create({
      userId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + ttlMs),
      revokedAt: null,
    }));
    return { accessToken, refreshToken };
  }

  async rotate(rawRefresh: string): Promise<TokenPair & { userId: string; email: string }> {
    const row = await this.repo.findOne({ where: { tokenHash: sha256(rawRefresh) } });
    if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('refresh token 无效');
    }
    row.revokedAt = new Date();
    await this.repo.save(row);
    // email 不存库，重签 access 时由调用方补；这里用占位，由 AuthService 覆盖 email
    const pair = await this.issuePair(row.userId, '');
    return { ...pair, userId: row.userId, email: '' };
  }

  async revoke(rawRefresh: string): Promise<void> {
    const row = await this.repo.findOne({ where: { tokenHash: sha256(rawRefresh) } });
    if (row && !row.revokedAt) {
      row.revokedAt = new Date();
      await this.repo.save(row);
    }
  }

  verifyAccess(token: string): { sub: string; email: string } {
    try {
      const secret = this.config.get<string>('jwt.secret')!;
      return this.jwt.verify(token, { secret });
    } catch {
      throw new UnauthorizedException('access token 无效');
    }
  }

  signAccess(userId: string, email: string): string {
    const secret = this.config.get<string>('jwt.secret')!;
    const expiresIn = this.config.get<string>('jwt.accessTtl', '900s');
    return this.jwt.sign({ sub: userId, email }, { secret, expiresIn });
  }

  private parseTtlMs(ttl: string): number {
    const m = /^(\d+)([smhd])$/.exec(ttl.trim());
    if (!m) return 30 * 24 * 3600 * 1000;
    const n = Number(m[1]);
    const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]]!;
    return n * unit;
  }
}
```

> 注：`rotate` 返回的 `email` 为空字符串占位，由 `AuthService.refresh` 在拿到 `userId` 后查 `UsersService` 补全并重签 access（见 Task 6）。也可在 Task 6 改为：`rotate` 只校验+轮换 refresh 并返回 `userId`，由 AuthService 统一签 access。实现时按 Task 6 的 `refresh` 方法为准。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix apps/base-api run test -- token.service`
Expected: PASS（4 个用例绿）

- [ ] **Step 5: 提交**

```bash
git add apps/base-api/src/auth/token.service.ts apps/base-api/src/auth/token.service.spec.ts
git commit -m "feat: 加 TokenService（access JWT 与 refresh 轮换/吊销）"
```

---

### Task 6: RedirectService（redirect_uri 白名单校验）

**Files:**
- Create: `apps/base-api/src/auth/redirect.service.ts`
- Test: `apps/base-api/src/auth/redirect.service.spec.ts`

**Interfaces:**
- Consumes: `AppConfig.redirectAllowlist`（origin 列表，如 `https://app.chcooai.com`）。
- Produces:
  ```ts
  class RedirectService {
    resolve(redirectUri?: string): string; // 合法→返回该 uri；空→返回 '/welcome'；非白名单→throw BadRequestException
  }
  ```

- [ ] **Step 1: 写失败的测试**

`apps/base-api/src/auth/redirect.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { configuration } from '../config/configuration';
import { RedirectService } from './redirect.service';

describe('RedirectService', () => {
  let service: RedirectService;
  beforeEach(async () => {
    process.env.REDIRECT_ALLOWLIST = 'https://app.chcooai.com,https://admin.chcooai.com';
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] })],
      providers: [RedirectService],
    }).compile();
    service = moduleRef.get(RedirectService);
  });

  it('should_return_welcome_when_no_redirect', () => {
    expect(service.resolve(undefined)).toBe('/welcome');
  });
  it('should_accept_allowlisted_origin', () => {
    expect(service.resolve('https://app.chcooai.com/dashboard')).toBe('https://app.chcooai.com/dashboard');
  });
  it('should_reject_unlisted_origin', () => {
    expect(() => service.resolve('https://evil.com/x')).toThrow(BadRequestException);
  });
  it('should_reject_malformed_uri', () => {
    expect(() => service.resolve('not-a-url')).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix apps/base-api run test -- redirect.service`
Expected: FAIL

- [ ] **Step 3: 实现**

`apps/base-api/src/auth/redirect.service.ts`:
```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedirectService {
  constructor(private readonly config: ConfigService) {}

  resolve(redirectUri?: string): string {
    if (!redirectUri) return '/welcome';
    let url: URL;
    try {
      url = new URL(redirectUri);
    } catch {
      throw new BadRequestException('redirect_uri 非法');
    }
    const allowlist = this.config.get<string[]>('redirectAllowlist', []);
    if (!allowlist.includes(url.origin)) {
      throw new BadRequestException('redirect_uri 不在白名单');
    }
    return redirectUri;
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix apps/base-api run test -- redirect.service`
Expected: PASS（4 个用例绿）

- [ ] **Step 5: 提交**

```bash
git add apps/base-api/src/auth/redirect.service.ts apps/base-api/src/auth/redirect.service.spec.ts
git commit -m "feat: 加 RedirectService（redirect_uri 白名单校验）"
```

---

### Task 7: AuthService（register / login / refresh / logout）

**Files:**
- Create: `apps/base-api/src/auth/auth.service.ts`
- Test: `apps/base-api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `UsersService`（Task 4）、`TokenService`（Task 5）、`RedirectService`（Task 6）。
- Produces:
  ```ts
  interface LoginResult { accessToken: string; refreshToken: string; redirectTo: string; email: string; }
  class AuthService {
    register(email: string, password: string): Promise<{ id: string; email: string }>;
    login(email: string, password: string, redirectUri?: string): Promise<LoginResult>; // 失败 throw UnauthorizedException（不区分用户不存在/密码错）
    refresh(rawRefresh: string): Promise<{ accessToken: string; refreshToken: string }>;
    logout(rawRefresh: string): Promise<void>;
  }
  ```

- [ ] **Step 1: 写失败的测试**

`apps/base-api/src/auth/auth.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { RefreshToken } from './refresh-token.entity';
import { UsersService } from '../users/users.service';
import { TokenService } from './token.service';
import { RedirectService } from './redirect.service';
import { AuthService } from './auth.service';
import { configuration } from '../config/configuration';

describe('AuthService', () => {
  let auth: AuthService;
  let tokens: TokenService;
  beforeEach(async () => {
    process.env.JWT_SECRET = 'z'.repeat(32);
    process.env.BCRYPT_ROUNDS = '4';
    process.env.REDIRECT_ALLOWLIST = 'https://app.chcooai.com';
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        JwtModule.register({ secret: 'z'.repeat(32) }),
        TypeOrmModule.forRoot({ type: 'better-sqlite3', database: ':memory:', entities: [User, RefreshToken], synchronize: true }),
        TypeOrmModule.forFeature([User, RefreshToken]),
      ],
      providers: [AuthService, UsersService, TokenService, RedirectService],
    }).compile();
    auth = moduleRef.get(AuthService);
    tokens = moduleRef.get(TokenService);
  });

  it('should_register_then_login_with_welcome_redirect', async () => {
    await auth.register('a@b.com', 'secret123');
    const res = await auth.login('a@b.com', 'secret123');
    expect(res.redirectTo).toBe('/welcome');
    expect(tokens.verifyAccess(res.accessToken)).toMatchObject({ email: 'a@b.com' });
  });

  it('should_resolve_redirect_uri_on_login', async () => {
    await auth.register('a@b.com', 'secret123');
    const res = await auth.login('a@b.com', 'secret123', 'https://app.chcooai.com/x');
    expect(res.redirectTo).toBe('https://app.chcooai.com/x');
  });

  it('should_reject_login_when_wrong_password', async () => {
    await auth.register('a@b.com', 'secret123');
    await expect(auth.login('a@b.com', 'WRONG')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should_reject_login_when_unknown_user', async () => {
    await expect(auth.login('none@b.com', 'secret123')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should_refresh_with_correct_email_in_new_access', async () => {
    await auth.register('a@b.com', 'secret123');
    const res = await auth.login('a@b.com', 'secret123');
    const refreshed = await auth.refresh(res.refreshToken);
    expect(tokens.verifyAccess(refreshed.accessToken)).toMatchObject({ email: 'a@b.com' });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix apps/base-api run test -- auth.service`
Expected: FAIL

- [ ] **Step 3: 实现**

`apps/base-api/src/auth/auth.service.ts`:
```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { TokenService } from './token.service';
import { RedirectService } from './redirect.service';
import { RefreshToken } from './refresh-token.entity';
import { createHash } from 'node:crypto';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  redirectTo: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly redirect: RedirectService,
    @InjectRepository(RefreshToken) private readonly refreshRepo: Repository<RefreshToken>,
  ) {}

  async register(email: string, password: string): Promise<{ id: string; email: string }> {
    const user = await this.users.create(email, password);
    return { id: user.id, email: user.email };
  }

  async login(email: string, password: string, redirectUri?: string): Promise<LoginResult> {
    const user = await this.users.findByEmail(email);
    if (!user || !(await this.users.verifyPassword(user, password))) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    const redirectTo = this.redirect.resolve(redirectUri);
    const pair = await this.tokens.issuePair(user.id, user.email);
    return { ...pair, redirectTo, email: user.email };
  }

  // 自管轮换：校验 refresh 行 → revoke → 查 user 补 email → 签新 pair
  async refresh(rawRefresh: string): Promise<{ accessToken: string; refreshToken: string }> {
    const hash = createHash('sha256').update(rawRefresh).digest('hex');
    const row = await this.refreshRepo.findOne({ where: { tokenHash: hash } });
    if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('refresh token 无效');
    }
    row.revokedAt = new Date();
    await this.refreshRepo.save(row);
    const user = await this.users.findById(row.userId);
    if (!user) throw new UnauthorizedException('用户不存在');
    return this.tokens.issuePair(user.id, user.email);
  }

  logout(rawRefresh: string): Promise<void> {
    return this.tokens.revoke(rawRefresh);
  }
}
```

> 因 `AuthService.refresh` 自行处理轮换（为了拿到正确 email 重签 access），Task 5 `TokenService.rotate` 在本设计里不被 AuthService 使用，仅保留其单测验证轮换语义。实现时给 `UsersService` 补一个 `findById(id: string): Promise<User | null>` 方法（`return this.repo.findOne({ where: { id } })`），并在 `UsersService` 接口注释中登记。

- [ ] **Step 4: 给 UsersService 补 findById**

在 `users.service.ts` 加：
```ts
  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm --prefix apps/base-api run test -- auth.service`
Expected: PASS（5 个用例绿）

- [ ] **Step 6: 提交**

```bash
git add apps/base-api/src/auth/auth.service.ts apps/base-api/src/auth/auth.service.spec.ts apps/base-api/src/users/users.service.ts
git commit -m "feat: 加 AuthService（注册/登录/刷新/登出）"
```

---

## Phase C — HTTP 层（控制器、守卫、限流）

### Task 8: DTO + JWT 守卫 + CurrentUser 装饰器

**Files:**
- Create: `apps/base-api/src/auth/dto/register.dto.ts`、`dto/login.dto.ts`、`dto/refresh.dto.ts`
- Create: `apps/base-api/src/auth/jwt-auth.guard.ts`、`src/auth/current-user.decorator.ts`
- Test: `apps/base-api/src/auth/jwt-auth.guard.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  class RegisterDto { email: string; password: string; }     // email 合法、password ≥8
  class LoginDto { email: string; password: string; redirectUri?: string; }
  class RefreshDto { refreshToken?: string; }                 // 也可来自 cookie
  class JwtAuthGuard implements CanActivate {}                // 校验 Bearer access → req.user = { sub, email }
  const CurrentUser = createParamDecorator(...);              // 取 req.user
  ```

- [ ] **Step 1: 写 DTO**

`dto/register.dto.ts`:
```ts
import { IsEmail, IsString, MinLength } from 'class-validator';
export class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
}
```
`dto/login.dto.ts`:
```ts
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() redirectUri?: string;
}
```
`dto/refresh.dto.ts`:
```ts
import { IsOptional, IsString } from 'class-validator';
export class RefreshDto {
  @IsOptional() @IsString() refreshToken?: string;
}
```

- [ ] **Step 2: 写失败的守卫测试**

`apps/base-api/src/auth/jwt-auth.guard.spec.ts`:
```ts
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function ctxWithAuth(header?: string): ExecutionContext {
  const req: any = { headers: header ? { authorization: header } : {} };
  return { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const tokenService = { verifyAccess: jest.fn() };
  const guard = new JwtAuthGuard(tokenService as any);

  it('should_throw_when_no_bearer', () => {
    expect(() => guard.canActivate(ctxWithAuth(undefined))).toThrow(UnauthorizedException);
  });

  it('should_set_user_when_valid', () => {
    tokenService.verifyAccess.mockReturnValue({ sub: '1', email: 'a@b.com' });
    const ctx = ctxWithAuth('Bearer good');
    expect(guard.canActivate(ctx)).toBe(true);
    const req = ctx.switchToHttp().getRequest() as any;
    expect(req.user).toEqual({ sub: '1', email: 'a@b.com' });
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm --prefix apps/base-api run test -- jwt-auth.guard`
Expected: FAIL

- [ ] **Step 4: 实现守卫与装饰器**

`apps/base-api/src/auth/jwt-auth.guard.ts`:
```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { TokenService } from './token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少 access token');
    }
    req.user = this.tokens.verifyAccess(header.slice('Bearer '.length));
    return true;
  }
}
```
`apps/base-api/src/auth/current-user.decorator.ts`:
```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator((_data, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().user as { sub: string; email: string };
});
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm --prefix apps/base-api run test -- jwt-auth.guard`
Expected: PASS（2 个用例绿）

- [ ] **Step 6: 提交**

```bash
git add apps/base-api/src/auth/dto apps/base-api/src/auth/jwt-auth.guard.ts apps/base-api/src/auth/current-user.decorator.ts apps/base-api/src/auth/jwt-auth.guard.spec.ts
git commit -m "feat: 加 auth DTO、JWT 守卫与 CurrentUser 装饰器"
```

---

### Task 9: AuthController + AuthModule（含 refresh cookie 与限流）+ e2e

**Files:**
- Create: `apps/base-api/src/auth/auth.controller.ts`、`src/auth/auth.module.ts`、`src/auth/auth.constants.ts`
- Modify: `apps/base-api/src/app.module.ts`（接入 `AuthModule`、`ThrottlerModule`、全局 `ThrottlerGuard`）
- Test: `apps/base-api/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuthService`、`TokenService`、`JwtAuthGuard`、`CurrentUser`、`AppConfig.cookie`。
- 端点（前缀 `/api/auth`）：
  - `POST /register` → `201 { id, email }`
  - `POST /login` → `200 { accessToken, redirectTo, email }`，并 `Set-Cookie: refresh_token=...; HttpOnly`
  - `POST /refresh` → `200 { accessToken }`（refresh 来自 cookie 或 body），并刷新 cookie
  - `POST /logout` → `200 { ok: true }`，清 cookie
  - `GET /me`（`JwtAuthGuard`）→ `200 { sub, email }`
- Produces: `const REFRESH_COOKIE = 'refresh_token'`。

- [ ] **Step 1: 写失败的 e2e 测试**

`apps/base-api/test/auth.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { setupApp } from '../src/bootstrap/setup-app';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { User } from '../src/users/user.entity';
import { RefreshToken } from '../src/auth/refresh-token.entity';
import { UsersService } from '../src/users/users.service';
import { TokenService } from '../src/auth/token.service';
import { RedirectService } from '../src/auth/redirect.service';
import { AuthService } from '../src/auth/auth.service';
import { AuthController } from '../src/auth/auth.controller';
import { configuration } from '../src/config/configuration';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    process.env.JWT_SECRET = 'e'.repeat(32);
    process.env.BCRYPT_ROUNDS = '4';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.REDIRECT_ALLOWLIST = 'https://app.chcooai.com';
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        JwtModule.register({ secret: 'e'.repeat(32) }),
        TypeOrmModule.forRoot({ type: 'better-sqlite3', database: ':memory:', entities: [User, RefreshToken], synchronize: true }),
        TypeOrmModule.forFeature([User, RefreshToken]),
      ],
      controllers: [AuthController],
      providers: [AuthService, UsersService, TokenService, RedirectService],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('should_register_login_me_flow', async () => {
    await request(app.getHttpServer()).post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'secret123' }).expect(201);

    const login = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'secret123' }).expect(200);
    expect(login.body.redirectTo).toBe('/welcome');
    expect(login.headers['set-cookie'][0]).toMatch(/refresh_token=/);

    const me = await request(app.getHttpServer()).get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
    expect(me.body.email).toBe('a@b.com');
  });

  it('should_refresh_via_cookie', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'secret123' }).expect(200);
    const cookie = login.headers['set-cookie'][0];
    const refreshed = await request(app.getHttpServer()).post('/api/auth/refresh')
      .set('Cookie', cookie).expect(200);
    expect(refreshed.body.accessToken).toBeDefined();
  });

  it('should_reject_login_with_unlisted_redirect', async () => {
    await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'secret123', redirectUri: 'https://evil.com' }).expect(400);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix apps/base-api run test:e2e -- auth`
Expected: FAIL（`AuthController` 不存在）

- [ ] **Step 3: 实现 controller / module / constants**

`apps/base-api/src/auth/auth.constants.ts`:
```ts
export const REFRESH_COOKIE = 'refresh_token';
```
`apps/base-api/src/auth/auth.controller.ts`:
```ts
import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { REFRESH_COOKIE } from './auth.constants';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly config: ConfigService) {}

  private setRefreshCookie(res: Response, token: string): void {
    const cookie = this.config.get<{ secure: boolean; domain?: string }>('cookie')!;
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true, secure: cookie.secure, sameSite: 'lax',
      domain: cookie.domain, path: '/api/auth', maxAge: 30 * 24 * 3600 * 1000,
    });
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password, dto.redirectUri);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, redirectTo: result.redirectTo, email: result.email };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] ?? dto.refreshToken;
    const pair = await this.auth.refresh(raw ?? '');
    this.setRefreshCookie(res, pair.refreshToken);
    return { accessToken: pair.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) await this.auth.logout(raw);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: { sub: string; email: string }) {
    return user;
  }
}
```
`apps/base-api/src/auth/auth.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from '../users/user.entity';
import { RefreshToken } from './refresh-token.entity';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { RedirectService } from './redirect.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([User, RefreshToken]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({ secret: c.get<string>('jwt.secret') }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, RedirectService, JwtAuthGuard],
  exports: [TokenService],
})
export class AuthModule {}
```

- [ ] **Step 4: 接入 app.module.ts（含限流）**

在 `app.module.ts` 加：
```ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
// imports 增加：
ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
UsersModule,
AuthModule,
// providers 增加：
{ provide: APP_GUARD, useClass: ThrottlerGuard },
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm --prefix apps/base-api run test:e2e -- auth`
Expected: PASS（3 个用例绿）

- [ ] **Step 6: 全量回归 + 提交**

Run: `npm --prefix apps/base-api run test && npm --prefix apps/base-api run test:e2e`
Expected: 全绿
```bash
git add apps/base-api/src/auth apps/base-api/src/app.module.ts apps/base-api/test/auth.e2e-spec.ts
git commit -m "feat: 加 AuthController/AuthModule（cookie 刷新与限流）与 e2e"
```

---

## Phase D — 前端（Vue3）

### Task 10: base-web 骨架 + 路由 + axios 客户端

**Files:**
- Create: `apps/base-web/package.json`、`vite.config.ts`、`tsconfig.json`、`index.html`、`src/main.ts`、`src/App.vue`、`src/router.ts`、`src/api/client.ts`
- Test: `apps/base-web/src/api/client.spec.ts`

**Interfaces:**
- Produces: axios 实例 `api`（`baseURL='/api'`，`withCredentials=true`）；路由 `/`(Login)、`/register`、`/welcome`。

- [ ] **Step 1: package.json / vite / tsconfig / index.html**

`apps/base-web/package.json`:
```json
{
  "name": "base-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "axios": "^1.7.0",
    "element-plus": "^2.8.0",
    "pinia": "^2.2.0",
    "vue": "^3.5.0",
    "vue-router": "^4.4.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.1.0",
    "@vue/test-utils": "^2.4.6",
    "jsdom": "^25.0.0",
    "typescript": "^5.7.2",
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "vue-tsc": "^2.1.0"
  }
}
```
`apps/base-web/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'jsdom' },
});
```
`apps/base-web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "jsx": "preserve", "skipLibCheck": true,
    "esModuleInterop": true, "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": ["vitest/globals"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue"]
}
```
`apps/base-web/index.html`:
```html
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>chcooai 登录</title></head>
  <body><div id="app"></div><script type="module" src="/src/main.ts"></script></body>
</html>
```

- [ ] **Step 2: 写失败的 client 测试**

`apps/base-web/src/api/client.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { api } from './client';

describe('api client', () => {
  it('should_use_api_baseurl_with_credentials', () => {
    expect(api.defaults.baseURL).toBe('/api');
    expect(api.defaults.withCredentials).toBe(true);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm --prefix apps/base-web install && npm --prefix apps/base-web run test`
Expected: FAIL（`./client` 不存在）

- [ ] **Step 4: 实现骨架**

`apps/base-web/src/api/client.ts`:
```ts
import axios from 'axios';
export const api = axios.create({ baseURL: '/api', withCredentials: true });
```
`apps/base-web/src/router.ts`:
```ts
import { createRouter, createWebHistory } from 'vue-router';
import LoginView from './views/LoginView.vue';
import RegisterView from './views/RegisterView.vue';
import WelcomeView from './views/WelcomeView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'login', component: LoginView },
    { path: '/register', name: 'register', component: RegisterView },
    { path: '/welcome', name: 'welcome', component: WelcomeView },
  ],
});
```
`apps/base-web/src/App.vue`:
```vue
<template><router-view /></template>
```
`apps/base-web/src/main.ts`:
```ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import { router } from './router';

createApp(App).use(createPinia()).use(router).use(ElementPlus).mount('#app');
```
> 注：`views/*.vue` 在 Task 11/12 创建；本步可先建三个仅含 `<template><div/></template>` 的占位文件，确保 `router.ts` 能编译与测试通过。

- [ ] **Step 5: 跑测试确认通过**

Run: `npm --prefix apps/base-web run test`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/base-web
git commit -m "feat: 初始化 base-web（Vite+Vue3+路由+axios 客户端）"
```

---

### Task 11: auth store（pinia）

**Files:**
- Create: `apps/base-web/src/stores/auth.ts`
- Test: `apps/base-web/src/stores/auth.spec.ts`

**Interfaces:**
- Consumes: `api`（Task 10）。
- Produces:
  ```ts
  useAuthStore(): {
    accessToken: string | null;
    register(email, password): Promise<void>;
    login(email, password, redirectUri?): Promise<string>; // 返回 redirectTo
    performRedirect(redirectTo: string): void;              // /welcome → router；外链 → location#access_token
  }
  ```

- [ ] **Step 1: 写失败的测试（mock api）**

`apps/base-web/src/stores/auth.spec.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { api } from '../api/client';
import { useAuthStore } from './auth';

vi.mock('../api/client', () => ({ api: { post: vi.fn() } }));

describe('auth store', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); });

  it('should_store_access_token_and_return_redirect_on_login', async () => {
    (api.post as any).mockResolvedValue({ data: { accessToken: 'tok', redirectTo: '/welcome', email: 'a@b.com' } });
    const store = useAuthStore();
    const redirectTo = await store.login('a@b.com', 'secret123');
    expect(store.accessToken).toBe('tok');
    expect(redirectTo).toBe('/welcome');
    expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'a@b.com', password: 'secret123', redirectUri: undefined });
  });

  it('should_call_register_endpoint', async () => {
    (api.post as any).mockResolvedValue({ data: { id: '1', email: 'a@b.com' } });
    const store = useAuthStore();
    await store.register('a@b.com', 'secret123');
    expect(api.post).toHaveBeenCalledWith('/auth/register', { email: 'a@b.com', password: 'secret123' });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix apps/base-web run test -- auth.spec`
Expected: FAIL

- [ ] **Step 3: 实现**

`apps/base-web/src/stores/auth.ts`:
```ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);

  async function register(email: string, password: string): Promise<void> {
    await api.post('/auth/register', { email, password });
  }

  async function login(email: string, password: string, redirectUri?: string): Promise<string> {
    const { data } = await api.post('/auth/login', { email, password, redirectUri });
    accessToken.value = data.accessToken;
    return data.redirectTo as string;
  }

  function performRedirect(redirectTo: string): void {
    if (redirectTo.startsWith('/')) {
      window.location.assign(redirectTo);
    } else {
      // 外部目标站：access token 放 URL fragment，不进 query/referrer
      window.location.assign(`${redirectTo}#access_token=${encodeURIComponent(accessToken.value ?? '')}`);
    }
  }

  return { accessToken, register, login, performRedirect };
});
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix apps/base-web run test -- auth.spec`
Expected: PASS（2 个用例绿）

- [ ] **Step 5: 提交**

```bash
git add apps/base-web/src/stores
git commit -m "feat: 加 auth pinia store（登录/注册/跳转交接）"
```

---

### Task 12: 登录 / 注册 / 欢迎页面

**Files:**
- Modify/Create: `apps/base-web/src/views/LoginView.vue`、`RegisterView.vue`、`WelcomeView.vue`
- Test: `apps/base-web/src/views/LoginView.spec.ts`

**Interfaces:**
- Consumes: `useAuthStore`（Task 11）、Element Plus 组件、`useRoute`（读 `redirect_uri` query）。
- 行为：登录页提交 → `store.login(email,password, route.query.redirect_uri)` → `store.performRedirect(redirectTo)`；错误用 `ElMessage` 提示。欢迎页显示已登录邮箱。

- [ ] **Step 1: 写失败的组件测试**

`apps/base-web/src/views/LoginView.spec.ts`:
```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix apps/base-web run test -- LoginView`
Expected: FAIL

- [ ] **Step 3: 实现页面**

`apps/base-web/src/views/LoginView.vue`:
```vue
<template>
  <div class="auth-card">
    <h2>登录 chcooai</h2>
    <form @submit.prevent="onSubmit">
      <input type="email" v-model="email" placeholder="邮箱" required />
      <input type="password" v-model="password" placeholder="密码" required />
      <button type="submit" :disabled="loading">登录</button>
    </form>
    <p><router-link to="/register">没有账号？去注册</router-link></p>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const store = useAuthStore();
const email = ref(''); const password = ref(''); const loading = ref(false);

async function onSubmit(): Promise<void> {
  loading.value = true;
  try {
    const redirectUri = (route.query.redirect_uri as string | undefined) || undefined;
    const redirectTo = await store.login(email.value, password.value, redirectUri);
    store.performRedirect(redirectTo);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>
```
`apps/base-web/src/views/RegisterView.vue`:
```vue
<template>
  <div class="auth-card">
    <h2>注册 chcooai</h2>
    <form @submit.prevent="onSubmit">
      <input type="email" v-model="email" placeholder="邮箱" required />
      <input type="password" v-model="password" placeholder="密码（≥8 位）" required />
      <button type="submit" :disabled="loading">注册</button>
    </form>
    <p><router-link to="/">已有账号？去登录</router-link></p>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const store = useAuthStore();
const email = ref(''); const password = ref(''); const loading = ref(false);

async function onSubmit(): Promise<void> {
  loading.value = true;
  try {
    await store.register(email.value, password.value);
    ElMessage.success('注册成功，请登录');
    await router.push('/');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? '注册失败');
  } finally {
    loading.value = false;
  }
}
</script>
```
`apps/base-web/src/views/WelcomeView.vue`:
```vue
<template>
  <div class="auth-card">
    <h2>已登录</h2>
    <p>{{ email || '欢迎回来' }}</p>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';

const store = useAuthStore();
const email = ref('');
onMounted(async () => {
  if (!store.accessToken) return;
  try {
    const { data } = await api.get('/auth/me', { headers: { Authorization: `Bearer ${store.accessToken}` } });
    email.value = data.email;
  } catch { /* 未登录则留空 */ }
});
</script>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix apps/base-web run test`
Expected: PASS（含 client/auth/LoginView 全绿）

- [ ] **Step 5: 提交**

```bash
git add apps/base-web/src/views
git commit -m "feat: 加登录/注册/欢迎页面"
```

---

## Phase E — 部署（GitOps）

### Task 13: Dockerfile（api + web）

**Files:**
- Create: `Dockerfile.api`、`Dockerfile.web`、`apps/base-web/nginx.conf`、`.dockerignore`

**Interfaces:**
- Produces: 镜像 `base-api`（Node 运行 `dist/main`，监听 3000）、`base-web`（nginx 托管打包产物，SPA fallback 到 `index.html`，监听 80）。

- [ ] **Step 1: `.dockerignore`**

```
**/node_modules
**/dist
.git
*.md
```

- [ ] **Step 2: `Dockerfile.api`**

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY apps/base-api/package.json apps/base-api/package-lock.json* ./apps/base-api/
RUN cd apps/base-api && npm install
COPY apps/base-api ./apps/base-api
RUN cd apps/base-api && npm run build

FROM node:22-alpine AS run
WORKDIR /app/apps/base-api
ENV NODE_ENV=production
COPY --from=build /app/apps/base-api/package.json ./
COPY --from=build /app/apps/base-api/node_modules ./node_modules
COPY --from=build /app/apps/base-api/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
```

- [ ] **Step 3: `apps/base-web/nginx.conf` + `Dockerfile.web`**

`apps/base-web/nginx.conf`:
```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
}
```
`Dockerfile.web`:
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app/apps/base-web
COPY apps/base-web/package.json apps/base-web/package-lock.json* ./
RUN npm install
COPY apps/base-web ./
RUN npm run build

FROM nginx:alpine AS run
COPY apps/base-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/base-web/dist /usr/share/nginx/html
EXPOSE 80
```

- [ ] **Step 4: 本地构建验证**

Run: `docker build -f Dockerfile.api -t base-api:dev . && docker build -f Dockerfile.web -t base-web:dev .`
Expected: 两镜像构建成功

- [ ] **Step 5: 提交**

```bash
git add Dockerfile.api Dockerfile.web apps/base-web/nginx.conf .dockerignore
git commit -m "chore: 加 base-api/base-web Dockerfile"
```

---

### Task 14: k8s manifests（MySQL + api + web + ingress）

**Files:**
- Create: `k8s/base/mysql.yaml`、`base-api.yaml`、`base-web.yaml`、`ingress.yaml`、`kustomization.yaml`
- Create: `k8s/overlays/production/kustomization.yaml`

**Interfaces:**
- 命名空间 `chcooai-prod`；Secret `base-env`（手动在集群创建，不进仓）含 `JWT_SECRET`/`DB_PASSWORD` 等；MySQL StatefulSet（PVC，local-path）；Ingress `www.chcooai.com`+`chcooai.com`：`/api`→base-api:3000，其余→base-web:80；TLS 复用 cert-manager ClusterIssuer `letsencrypt-prod`。

- [ ] **Step 1: `k8s/base/mysql.yaml`**

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: base-mysql, namespace: chcooai-prod }
spec:
  serviceName: base-mysql
  replicas: 1
  selector: { matchLabels: { app: base-mysql } }
  template:
    metadata: { labels: { app: base-mysql } }
    spec:
      containers:
        - name: mysql
          image: mysql:8.4
          args: ["--default-authentication-plugin=caching_sha2_password"]
          env:
            - { name: MYSQL_DATABASE, value: base }
            - { name: MYSQL_USER, value: base }
            - name: MYSQL_PASSWORD
              valueFrom: { secretKeyRef: { name: base-env, key: DB_PASSWORD } }
            - name: MYSQL_ROOT_PASSWORD
              valueFrom: { secretKeyRef: { name: base-env, key: DB_ROOT_PASSWORD } }
          ports: [{ containerPort: 3306 }]
          volumeMounts: [{ name: data, mountPath: /var/lib/mysql }]
  volumeClaimTemplates:
    - metadata: { name: data }
      spec:
        accessModes: ["ReadWriteOnce"]
        resources: { requests: { storage: 5Gi } }
---
apiVersion: v1
kind: Service
metadata: { name: base-mysql, namespace: chcooai-prod }
spec:
  selector: { app: base-mysql }
  ports: [{ port: 3306, targetPort: 3306 }]
```

- [ ] **Step 2: `k8s/base/base-api.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: base-api, namespace: chcooai-prod }
spec:
  replicas: 1
  selector: { matchLabels: { app: base-api } }
  template:
    metadata: { labels: { app: base-api } }
    spec:
      containers:
        - name: base-api
          image: ghcr.io/chcooai/base-api:latest
          ports: [{ containerPort: 3000 }]
          env:
            - { name: DB_HOST, value: base-mysql }
            - { name: DB_PORT, value: "3306" }
            - { name: DB_USERNAME, value: base }
            - { name: DB_NAME, value: base }
            - { name: AUTH_COOKIE_DOMAIN, value: chcooai.com }
            - { name: AUTH_COOKIE_SECURE, value: "true" }
          envFrom:
            - secretRef: { name: base-env }   # JWT_SECRET / DB_PASSWORD / REDIRECT_ALLOWLIST
          readinessProbe:
            httpGet: { path: /api/health, port: 3000 }
            initialDelaySeconds: 10
---
apiVersion: v1
kind: Service
metadata: { name: base-api, namespace: chcooai-prod }
spec:
  selector: { app: base-api }
  ports: [{ port: 3000, targetPort: 3000 }]
```

> 启动期迁移：在 base-api Deployment 加一个 `initContainer` 跑 `npm run migration:run:prod`（同镜像、同 envFrom），确保表已建。实现时把 initContainer 写进上面 `spec.template.spec`。

- [ ] **Step 3: `k8s/base/base-web.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: base-web, namespace: chcooai-prod }
spec:
  replicas: 1
  selector: { matchLabels: { app: base-web } }
  template:
    metadata: { labels: { app: base-web } }
    spec:
      containers:
        - name: base-web
          image: ghcr.io/chcooai/base-web:latest
          ports: [{ containerPort: 80 }]
---
apiVersion: v1
kind: Service
metadata: { name: base-web, namespace: chcooai-prod }
spec:
  selector: { app: base-web }
  ports: [{ port: 80, targetPort: 80 }]
```

- [ ] **Step 4: `k8s/base/ingress.yaml`**（Traefik，按 path 分流）

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: base
  namespace: chcooai-prod
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: traefik
  tls:
    - hosts: [www.chcooai.com, chcooai.com]
      secretName: base-tls
  rules:
    - host: www.chcooai.com
      http:
        paths:
          - { path: /api, pathType: Prefix, backend: { service: { name: base-api, port: { number: 3000 } } } }
          - { path: /, pathType: Prefix, backend: { service: { name: base-web, port: { number: 80 } } } }
    - host: chcooai.com
      http:
        paths:
          - { path: /api, pathType: Prefix, backend: { service: { name: base-api, port: { number: 3000 } } } }
          - { path: /, pathType: Prefix, backend: { service: { name: base-web, port: { number: 80 } } } }
```

- [ ] **Step 5: kustomization**

`k8s/base/kustomization.yaml`:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: chcooai-prod
resources: [mysql.yaml, base-api.yaml, base-web.yaml, ingress.yaml]
```
`k8s/overlays/production/kustomization.yaml`:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources: [../../base]
images:
  - { name: ghcr.io/chcooai/base-api, newTag: latest }
  - { name: ghcr.io/chcooai/base-web, newTag: latest }
```

- [ ] **Step 6: 本地校验 + 提交**

Run: `kubectl kustomize k8s/overlays/production`
Expected: 渲染出全部资源、无报错
```bash
git add k8s
git commit -m "chore: 加 base k8s manifests（mysql/api/web/ingress + 生产 overlay）"
```

---

### Task 15: GitHub Actions（build → push ghcr → bump tag）

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- push 到 `main` → 构建并推 `ghcr.io/chcooai/base-api:<sha>`、`base-web:<sha>` → `sed` 改 `k8s/overlays/production/kustomization.yaml` 的 `newTag` → bot `[skip ci]` commit 回 main。仿 `chcooai/index` 的 `deploy.yml`。

- [ ] **Step 1: 实现 workflow**

`.github/workflows/deploy.yml`:
```yaml
name: deploy
on:
  push:
    branches: [main]
    paths-ignore: ['**/*.md', 'docs/**']
permissions: { contents: write, packages: write }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { token: ${{ secrets.GITHUB_TOKEN }} }
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - name: build & push api
        run: |
          docker build -f Dockerfile.api -t ghcr.io/chcooai/base-api:${{ github.sha }} .
          docker push ghcr.io/chcooai/base-api:${{ github.sha }}
      - name: build & push web
        run: |
          docker build -f Dockerfile.web -t ghcr.io/chcooai/base-web:${{ github.sha }} .
          docker push ghcr.io/chcooai/base-web:${{ github.sha }}
      - name: bump image tags
        run: |
          sed -i "s|newTag: .*# api|newTag: ${{ github.sha }} # api|" k8s/overlays/production/kustomization.yaml
          sed -i "s|newTag: .*# web|newTag: ${{ github.sha }} # web|" k8s/overlays/production/kustomization.yaml
      - name: commit bump
        run: |
          git config user.name "chcooai-bot"
          git config user.email "bot@chcooai.com"
          git commit -am "chore: bump image to ${{ github.sha }} [skip ci]" || echo "no change"
          git push
```
> 配合 `bump`：把 `k8s/overlays/production/kustomization.yaml` 的两行改成带标记注释，便于 sed 精确替换：
> ```yaml
> images:
>   - { name: ghcr.io/chcooai/base-api, newTag: latest } # api
>   - { name: ghcr.io/chcooai/base-web, newTag: latest } # web
> ```

- [ ] **Step 2: 提交**

```bash
git add .github/workflows/deploy.yml k8s/overlays/production/kustomization.yaml
git commit -m "ci: 加 build→push ghcr→bump tag 流水线"
```

---

### Task 16: Argo Application + index 下线（**需用户放行后执行**）

**Files:**
- Create: `k8s/argocd/chcooai-base-app.yaml`（Argo Application 定义，便于版本化）
- Doc: 在 `docs/2026-06-23-base-auth-plan.md` 记录上线/切换步骤

**Interfaces:**
- Argo Application `chcooai-base`：source = `chcooai/base` path `k8s/overlays/production`，dest namespace `chcooai-prod`，自动 sync（prune + selfHeal）。上线后移除 `chcooai-index` App，避免两个 App 抢同一 host。

- [ ] **Step 1: Argo Application 清单**

`k8s/argocd/chcooai-base-app.yaml`:
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata: { name: chcooai-base, namespace: argocd }
spec:
  project: default
  source:
    repoURL: https://github.com/chcooai/base
    targetRevision: main
    path: k8s/overlays/production
  destination: { server: https://kubernetes.default.svc, namespace: chcooai-prod }
  syncPolicy:
    automated: { prune: true, selfHeal: true }
    syncOptions: [CreateNamespace=true]
```

- [ ] **Step 2: 集群侧预置（手动、需用户放行；命令仅记录，不在仓库执行）**

> ⚠️ 红线相关：以下涉及生产集群与 Secret，**需用户明确放行**后由用户/或在用户在场时执行。Secret 内容不进仓、不打印。
```bash
# 1. 建 Secret（值由用户提供，示意键名）
kubectl -n chcooai-prod create secret generic base-env \
  --from-literal=JWT_SECRET=... --from-literal=DB_PASSWORD=... \
  --from-literal=DB_ROOT_PASSWORD=... --from-literal=REDIRECT_ALLOWLIST=...
# 2. 应用 Argo App
kubectl apply -f k8s/argocd/chcooai-base-app.yaml
# 3. 验收通过后，移除 index App，释放 www/apex host
kubectl -n argocd delete application chcooai-index
```

- [ ] **Step 3: 验收（对照设计稿 §9）**

```
- https://www.chcooai.com 出登录页、证书有效
- 注册→登录→/welcome 显示邮箱
- 带白名单内 redirect_uri 登录 → 302 到目标站、fragment 带 access_token；白名单外被拒
- access 过期后 refresh 换新；登出后该 refresh 失效
- kubectl get applications -n argocd → chcooai-base Synced/Healthy，chcooai-index 已移除
```

- [ ] **Step 4: 更新开发日志 + 提交**

在 `docs/` 追加一段上线记录（日期、镜像 sha、验收结果）。
```bash
git add k8s/argocd docs
git commit -m "chore: 加 chcooai-base Argo Application 与上线记录"
```

---

## 自查清单（写计划者已核对）

- **Spec 覆盖**：注册/登录/刷新/登出/me（Task 4-9）；refresh 哈希存库+轮换+吊销（Task 5,7）；redirect_uri 白名单+fragment 交接（Task 6,11,12）；MySQL+迁移（Task 3,14）；不引 Redis（全程未出现）；限流+bcrypt（Task 4,9）；前端三页（Task 10-12）；GitOps+取代 index（Task 13-16）。✅
- **占位符**：每个 code step 均给出完整代码；无 TBD/TODO。✅
- **类型一致**：`UsersService.create/findByEmail/findById/verifyPassword`、`TokenService.issuePair/verifyAccess`、`AuthService.register/login/refresh/logout`、`RedirectService.resolve`、store `login/register/performRedirect` 跨任务签名一致。✅
- **已知取舍**：`TokenService.rotate` 被 `AuthService.refresh` 取代（为补全 email），Task 5/7 注释已说明，保留 rotate 单测验证轮换语义。
```
