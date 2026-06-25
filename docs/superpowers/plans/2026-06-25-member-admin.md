# base 成员管理（超管后台）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 base（chcooai SSO 中心）增加超管角色与成员管理后台，让管理员能查看/启禁用/重置密码/创建成员、设取消管理员。

**Architecture:** 后端 base-api（NestJS）：User 加 `role` 字段 + migration；登录加 status 校验与 ADMIN_BOOTSTRAP_EMAIL 懒提升；新增 AdminGuard（查 DB 校验 role）与 `/api/admin/users` 模块。前端 base-web（Vue3+Pinia+Element Plus）：auth store 带 role、`/admin` 路由守卫、成员管理页。

**Tech Stack:** NestJS 11 + TypeORM 0.3 + MySQL(生产)/better-sqlite3(测试) + jest；Vue 3 + Vite + Pinia + Element Plus + vitest。

## Global Constraints

- 角色仅 `user` / `admin` 二元（不做 RBAC 权限表）。
- 密码一律 bcrypt（rounds 取 config `bcryptRounds`，默认 12），绝不明文存储或返回；任何响应不含 `password_hash`。
- access token payload 仅 `{ sub, email }`，不含 role —— 需要 role 时一律查 DB。
- 防自锁：管理员不能禁用自己、不能把自己从 admin 降级。
- 测试命名 `should_xxx_when_yyy`；后端测试用 `better-sqlite3` 内存库 + `synchronize: true`（实体即 schema），生产靠 migration。
- 邮箱统一 `trim().toLowerCase()` 归一化（沿用 UsersService 现有做法）。
- 提交信息用中文 Conventional Commits，结尾加 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## File Structure

**后端 base-api（`apps/base-api/src`）**
- Modify `users/user.entity.ts` — 加 `role` 列
- Create `database/migrations/1763200000000-add-user-role.ts` — 生产加列
- Modify `config/configuration.ts` + `config/env.validation.ts` — `ADMIN_BOOTSTRAP_EMAIL`
- Modify `users/users.service.ts` — admin 用方法（list/createByAdmin/setStatus/resetPassword/setRole）
- Modify `auth/auth.service.ts` — login 加 status 校验 + bootstrap 懒提升（注入 ConfigService）
- Modify `auth/auth.controller.ts` — me 查 DB 返回 role（注入 UsersService）
- Create `auth/admin.guard.ts` — AdminGuard
- Create `modules/admin/admin.module.ts` / `admin.controller.ts` / `dto/*.ts`
- Modify `app.module.ts` — 注册 AdminModule

**前端 base-web（`apps/base-web/src`）**
- Modify `stores/auth.ts` — `role` 状态 + `fetchMe()`
- Create `api/admin.ts` — 成员管理 API 封装
- Create `stores/admin.ts` — 成员列表/操作 store
- Create `views/AdminMembersView.vue` — 管理页
- Modify `router.ts` — `/admin` 路由 + 守卫

---

## Task 1: User 加 role 字段（实体 + migration）

**Files:**
- Modify: `apps/base-api/src/users/user.entity.ts`
- Create: `apps/base-api/src/database/migrations/1763200000000-add-user-role.ts`
- Test: `apps/base-api/src/users/users.service.spec.ts`（已存在则追加用例；不存在则新建）

**Interfaces:**
- Produces: `User.role: 'user' | 'admin'`（默认 `'user'`）

- [ ] **Step 1: 写失败测试** — 新建用户默认 role=user

在 `users/users.service.spec.ts` 追加（若文件不存在，参照 auth.service.spec.ts 的 setup 新建，imports 用 `TypeOrmModule.forRoot({type:'better-sqlite3',database:':memory:',entities:[User],synchronize:true})` + `TypeOrmModule.forFeature([User])`，providers 仅 `UsersService`，并 `process.env.BCRYPT_ROUNDS='4'`）：

```ts
it('should_default_role_to_user_when_created', async () => {
  const u = await users.create('a@b.com', 'secret123');
  expect(u.role).toBe('user');
});
```

- [ ] **Step 2: 跑测试看失败**

Run: `cd apps/base-api && npm test -- users.service`
Expected: FAIL（`role` 为 undefined 或类型不存在）

- [ ] **Step 3: 实体加 role 列**

在 `users/user.entity.ts` 的 `status` 列之后加：

```ts
  @Column({ type: 'varchar', length: 16, default: 'user' })
  role!: 'user' | 'admin';
```

- [ ] **Step 4: 跑测试看通过**

Run: `cd apps/base-api && npm test -- users.service`
Expected: PASS

- [ ] **Step 5: 写生产 migration**

新建 `database/migrations/1763200000000-add-user-role.ts`：

```ts
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddUserRole1763200000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.addColumn('users', new TableColumn({
      name: 'role', type: 'varchar', length: '16', default: "'user'", isNullable: false,
    }));
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.dropColumn('users', 'role');
  }
}
```

- [ ] **Step 6: 提交**

```bash
git add apps/base-api/src/users/user.entity.ts apps/base-api/src/database/migrations/1763200000000-add-user-role.ts apps/base-api/src/users/users.service.spec.ts
git commit -m "feat: User 增加 role 字段 + migration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 配置 ADMIN_BOOTSTRAP_EMAIL

**Files:**
- Modify: `apps/base-api/src/config/configuration.ts`
- Modify: `apps/base-api/src/config/env.validation.ts`
- Test: `apps/base-api/src/config/configuration.spec.ts`（新建）

**Interfaces:**
- Produces: config key `adminBootstrapEmail: string | undefined`

- [ ] **Step 1: 写失败测试**

新建 `config/configuration.spec.ts`：

```ts
import { configuration } from './configuration';

describe('configuration', () => {
  it('should_read_admin_bootstrap_email_from_env', () => {
    process.env.ADMIN_BOOTSTRAP_EMAIL = 'boss@chcooai.com';
    expect(configuration().adminBootstrapEmail).toBe('boss@chcooai.com');
  });
});
```

- [ ] **Step 2: 跑测试看失败**

Run: `cd apps/base-api && npm test -- configuration`
Expected: FAIL（`adminBootstrapEmail` undefined / 类型不存在）

- [ ] **Step 3: 实现** — 在 `AppConfig` 接口加 `adminBootstrapEmail?: string;`，在 `configuration()` 返回对象加：

```ts
    adminBootstrapEmail: e.ADMIN_BOOTSTRAP_EMAIL,
```

在 `env.validation.ts` 的 `EnvVars` 类加（放可选项一组里）：

```ts
  @IsOptional() @IsString() ADMIN_BOOTSTRAP_EMAIL?: string;
```

- [ ] **Step 4: 跑测试看通过**

Run: `cd apps/base-api && npm test -- configuration`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/base-api/src/config/
git commit -m "feat: 配置 ADMIN_BOOTSTRAP_EMAIL

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 登录加 status 校验 + bootstrap 懒提升

**Files:**
- Modify: `apps/base-api/src/auth/auth.service.ts`（注入 ConfigService）
- Modify: `apps/base-api/src/users/users.service.ts`（加 `setRole`）
- Test: `apps/base-api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `UsersService.findByEmail`, `UsersService.setRole(id, role)`, config `adminBootstrapEmail`
- Produces: `UsersService.setRole(id: string, role: 'user'|'admin'): Promise<void>`

- [ ] **Step 1: 写失败测试** — 在 `auth.service.spec.ts` 追加。注意该 spec 的 beforeEach 已建 ConfigModule（load configuration）。追加 3 个用例：

```ts
it('should_reject_login_when_status_disabled', async () => {
  await auth.register('d@b.com', 'secret123');
  const repo = moduleRef.get<Repository<User>>(getRepositoryToken(User));
  const u = await repo.findOneOrFail({ where: { email: 'd@b.com' } });
  u.status = 'disabled';
  await repo.save(u);
  await expect(auth.login('d@b.com', 'secret123')).rejects.toThrow(UnauthorizedException);
});

it('should_promote_to_admin_when_email_matches_bootstrap', async () => {
  process.env.ADMIN_BOOTSTRAP_EMAIL = 'boss@chcooai.com';
  await auth.register('boss@chcooai.com', 'secret123');
  await auth.login('boss@chcooai.com', 'secret123');
  const repo = moduleRef.get<Repository<User>>(getRepositoryToken(User));
  const u = await repo.findOneOrFail({ where: { email: 'boss@chcooai.com' } });
  expect(u.role).toBe('admin');
});

it('should_not_promote_when_email_not_bootstrap', async () => {
  process.env.ADMIN_BOOTSTRAP_EMAIL = 'boss@chcooai.com';
  await auth.register('other@b.com', 'secret123');
  await auth.login('other@b.com', 'secret123');
  const repo = moduleRef.get<Repository<User>>(getRepositoryToken(User));
  const u = await repo.findOneOrFail({ where: { email: 'other@b.com' } });
  expect(u.role).toBe('user');
});
```

在该 spec 顶部 import 补充：`import { Repository } from 'typeorm';` `import { getRepositoryToken } from '@nestjs/typeorm';`。并在 `beforeEach` 中确保每个用例前重置 `process.env.ADMIN_BOOTSTRAP_EMAIL`（在 beforeEach 开头加 `delete process.env.ADMIN_BOOTSTRAP_EMAIL;`，避免用例间串味；注意 configuration 是 `load` 时读 env，登录时通过 ConfigService 读的是缓存——见 Step 3 说明）。

- [ ] **Step 2: 跑测试看失败**

Run: `cd apps/base-api && npm test -- auth.service`
Expected: FAIL（disabled 仍能登录、role 未提升）

- [ ] **Step 3: 实现**

`users.service.ts` 加方法：

```ts
async setRole(id: string, role: 'user' | 'admin'): Promise<void> {
  await this.repo.update(id, { role });
}
```

`auth.service.ts` 构造函数注入 ConfigService，并改 login。注意：ConfigService 在本服务里直接 `process.env` 读 bootstrap 邮箱更稳（避免 ConfigModule cache 导致测试拿到旧值）——本服务读 `process.env.ADMIN_BOOTSTRAP_EMAIL`：

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
// ... 现有 import 保留

async login(email: string, password: string, redirectUri?: string): Promise<LoginResult> {
  const user = await this.users.findByEmail(email);
  if (!user || !(await this.users.verifyPassword(user, password))) {
    throw new UnauthorizedException('邮箱或密码错误');
  }
  if (user.status === 'disabled') {
    throw new UnauthorizedException('账户已被禁用');
  }
  const bootstrap = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? '').trim().toLowerCase();
  if (bootstrap && user.email === bootstrap && user.role !== 'admin') {
    await this.users.setRole(user.id, 'admin');
    user.role = 'admin';
  }
  const redirectTo = this.redirect.resolve(redirectUri);
  const pair = await this.tokens.issuePair(user.id, user.email);
  return { ...pair, redirectTo, email: user.email };
}
```

（无需改构造函数依赖，直接读 `process.env`。）

- [ ] **Step 4: 跑测试看通过**

Run: `cd apps/base-api && npm test -- auth.service`
Expected: PASS（含原有用例不回归）

- [ ] **Step 5: 提交**

```bash
git add apps/base-api/src/auth/auth.service.ts apps/base-api/src/users/users.service.ts apps/base-api/src/auth/auth.service.spec.ts
git commit -m "feat: 登录校验 status + ADMIN_BOOTSTRAP_EMAIL 懒提升超管

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: me 接口返回 role

**Files:**
- Modify: `apps/base-api/src/auth/auth.controller.ts`（注入 UsersService）
- Test: `apps/base-api/src/auth/auth.controller.spec.ts`（新建，用 e2e 风格或直接调用 controller 方法）

**Interfaces:**
- Produces: `GET /api/auth/me` → `{ sub: string, email: string, role: 'user'|'admin', status: 'active'|'disabled' }`

- [ ] **Step 1: 写失败测试**

新建 `auth/auth.controller.spec.ts`，直接单元测 controller.me（mock UsersService）：

```ts
import { AuthController } from './auth.controller';

describe('AuthController.me', () => {
  it('should_return_role_and_status_from_db', async () => {
    const users = { findById: jest.fn().mockResolvedValue({ id: '1', email: 'a@b.com', role: 'admin', status: 'active' }) };
    const controller = new AuthController({} as any, {} as any, users as any);
    const res = await controller.me({ sub: '1', email: 'a@b.com' });
    expect(res).toEqual({ sub: '1', email: 'a@b.com', role: 'admin', status: 'active' });
  });

  it('should_default_role_user_when_db_missing', async () => {
    const users = { findById: jest.fn().mockResolvedValue(null) };
    const controller = new AuthController({} as any, {} as any, users as any);
    const res = await controller.me({ sub: '9', email: 'x@b.com' });
    expect(res.role).toBe('user');
  });
});
```

- [ ] **Step 2: 跑测试看失败**

Run: `cd apps/base-api && npm test -- auth.controller`
Expected: FAIL（构造函数第三参不存在 / me 非 async 不返回 role）

- [ ] **Step 3: 实现** — 改 `auth.controller.ts`：构造函数加 `private readonly users: UsersService`（import 自 `../users/users.service`），改 me：

```ts
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  async me(@CurrentUser() user: { sub: string; email: string }) {
    const u = await this.users.findById(user.sub);
    return {
      sub: user.sub,
      email: user.email,
      role: u?.role ?? 'user',
      status: u?.status ?? 'active',
    };
  }
```

确认 `auth.module.ts` 的 providers/imports 能注入 UsersService（AuthModule 已 import UsersModule 或在 providers 含 UsersService —— 若没有，在 AuthModule imports 加 `UsersModule` 或 providers 加 `UsersService` 并确保 TypeOrmModule.forFeature([User]) 可用；按现有 AuthModule 结构补齐）。

- [ ] **Step 4: 跑测试看通过**

Run: `cd apps/base-api && npm test -- auth.controller`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/base-api/src/auth/auth.controller.ts apps/base-api/src/auth/auth.controller.spec.ts apps/base-api/src/auth/auth.module.ts
git commit -m "feat: me 接口返回 role/status

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: AdminGuard

**Files:**
- Create: `apps/base-api/src/auth/admin.guard.ts`
- Test: `apps/base-api/src/auth/admin.guard.spec.ts`

**Interfaces:**
- Consumes: `TokenService.verifyAccess`, `UsersService.findById`
- Produces: `AdminGuard`（canActivate：校验 Bearer + role==admin，设 `req.user={sub,email}`）

- [ ] **Step 1: 写失败测试**

新建 `auth/admin.guard.spec.ts`：

```ts
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

function ctxWith(authHeader?: string) {
  const req: any = { headers: authHeader ? { authorization: authHeader } : {} };
  return { switchToHttp: () => ({ getRequest: () => req }), _req: req } as any;
}

describe('AdminGuard', () => {
  const tokens = { verifyAccess: jest.fn() };
  const users = { findById: jest.fn() };
  const guard = new AdminGuard(tokens as any, users as any);

  beforeEach(() => jest.clearAllMocks());

  it('should_throw_unauthorized_when_no_bearer', async () => {
    await expect(guard.canActivate(ctxWith())).rejects.toThrow(UnauthorizedException);
  });

  it('should_throw_forbidden_when_role_not_admin', async () => {
    tokens.verifyAccess.mockReturnValue({ sub: '1', email: 'a@b.com' });
    users.findById.mockResolvedValue({ id: '1', role: 'user' });
    await expect(guard.canActivate(ctxWith('Bearer t'))).rejects.toThrow(ForbiddenException);
  });

  it('should_allow_when_role_admin', async () => {
    tokens.verifyAccess.mockReturnValue({ sub: '1', email: 'a@b.com' });
    users.findById.mockResolvedValue({ id: '1', role: 'admin' });
    const ctx = ctxWith('Bearer t');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx._req.user).toEqual({ sub: '1', email: 'a@b.com' });
  });
});
```

- [ ] **Step 2: 跑测试看失败**

Run: `cd apps/base-api && npm test -- admin.guard`
Expected: FAIL（AdminGuard 不存在）

- [ ] **Step 3: 实现** — `auth/admin.guard.ts`：

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { TokenService } from './token.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly tokens: TokenService, private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少 access token');
    }
    const payload = this.tokens.verifyAccess(header.slice('Bearer '.length));
    req.user = payload;
    const user = await this.users.findById(payload.sub);
    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('需要管理员权限');
    }
    return true;
  }
}
```

- [ ] **Step 4: 跑测试看通过**

Run: `cd apps/base-api && npm test -- admin.guard`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/base-api/src/auth/admin.guard.ts apps/base-api/src/auth/admin.guard.spec.ts
git commit -m "feat: AdminGuard（校验 role==admin）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: UsersService 成员管理方法

**Files:**
- Modify: `apps/base-api/src/users/users.service.ts`
- Test: `apps/base-api/src/users/users.service.spec.ts`

**Interfaces:**
- Produces:
  - `list(page: number, pageSize: number, q?: string): Promise<{ items: User[]; total: number }>`
  - `createByAdmin(email: string, password: string, role: 'user'|'admin'): Promise<User>`
  - `setStatus(id: string, status: 'active'|'disabled'): Promise<void>`
  - `resetPassword(id: string, password: string): Promise<void>`
  - （`setRole` 已在 Task 3 加）

- [ ] **Step 1: 写失败测试** — 追加：

```ts
it('should_list_users_with_total_and_email_search', async () => {
  await users.create('alice@b.com', 'secret123');
  await users.create('bob@b.com', 'secret123');
  const all = await users.list(1, 20);
  expect(all.total).toBe(2);
  const filtered = await users.list(1, 20, 'alice');
  expect(filtered.total).toBe(1);
  expect(filtered.items[0].email).toBe('alice@b.com');
});

it('should_create_by_admin_with_role', async () => {
  const u = await users.createByAdmin('admin@b.com', 'secret123', 'admin');
  expect(u.role).toBe('admin');
});

it('should_set_status_and_reset_password', async () => {
  const u = await users.create('c@b.com', 'secret123');
  await users.setStatus(u.id, 'disabled');
  await users.resetPassword(u.id, 'newsecret9');
  const fresh = await users.findById(u.id);
  expect(fresh!.status).toBe('disabled');
  expect(await users.verifyPassword(fresh!, 'newsecret9')).toBe(true);
});
```

- [ ] **Step 2: 跑测试看失败**

Run: `cd apps/base-api && npm test -- users.service`
Expected: FAIL（方法不存在）

- [ ] **Step 3: 实现** — 在 `users.service.ts` 加（顶部 import `Like`）：

```ts
import { Like, Repository } from 'typeorm';

async list(page: number, pageSize: number, q?: string): Promise<{ items: User[]; total: number }> {
  const take = Math.min(Math.max(pageSize, 1), 100);
  const skip = (Math.max(page, 1) - 1) * take;
  const where = q ? { email: Like(`%${q.trim().toLowerCase()}%`) } : {};
  const [items, total] = await this.repo.findAndCount({
    where, order: { id: 'DESC' }, take, skip,
  });
  return { items, total };
}

async createByAdmin(email: string, password: string, role: 'user' | 'admin'): Promise<User> {
  const normalized = email.trim().toLowerCase();
  if (await this.findByEmail(normalized)) {
    throw new ConflictException('邮箱已被注册');
  }
  const rounds = this.config.get<number>('bcryptRounds', 12);
  const passwordHash = await bcrypt.hash(password, rounds);
  return this.repo.save(this.repo.create({ email: normalized, passwordHash, status: 'active', role }));
}

async setStatus(id: string, status: 'active' | 'disabled'): Promise<void> {
  await this.repo.update(id, { status });
}

async resetPassword(id: string, password: string): Promise<void> {
  const rounds = this.config.get<number>('bcryptRounds', 12);
  await this.repo.update(id, { passwordHash: await bcrypt.hash(password, rounds) });
}
```

- [ ] **Step 4: 跑测试看通过**

Run: `cd apps/base-api && npm test -- users.service`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/base-api/src/users/users.service.ts apps/base-api/src/users/users.service.spec.ts
git commit -m "feat: UsersService 成员管理方法（list/createByAdmin/setStatus/resetPassword）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Admin 模块（5 个接口 + 防自锁）

**Files:**
- Create: `apps/base-api/src/modules/admin/admin.controller.ts`
- Create: `apps/base-api/src/modules/admin/admin.module.ts`
- Create: `apps/base-api/src/modules/admin/dto/create-user.dto.ts` / `update-status.dto.ts` / `update-password.dto.ts` / `update-role.dto.ts` / `list-query.dto.ts`
- Modify: `apps/base-api/src/app.module.ts`（注册 AdminModule）
- Test: `apps/base-api/src/modules/admin/admin.controller.spec.ts`

**Interfaces:**
- Consumes: `UsersService`, `AdminGuard`, `CurrentUser`
- Produces: REST `/api/admin/users`（见 spec §5.2）

- [ ] **Step 1: 写失败测试** — 直接单元测 controller（mock UsersService），覆盖防自锁与映射：

```ts
import { BadRequestException } from '@nestjs/common';
import { AdminController } from './admin.controller';

const make = (over: any = {}) => ({
  list: jest.fn().mockResolvedValue({ items: [{ id: '1', email: 'a@b.com', status: 'active', role: 'admin', createdAt: new Date(0) }], total: 1 }),
  createByAdmin: jest.fn().mockResolvedValue({ id: '2', email: 'n@b.com', status: 'active', role: 'user', createdAt: new Date(0) }),
  setStatus: jest.fn(), resetPassword: jest.fn(), setRole: jest.fn(),
  ...over,
});

describe('AdminController', () => {
  it('should_list_users_mapped_without_password', async () => {
    const users = make();
    const c = new AdminController(users as any);
    const res = await c.list({ page: 1, pageSize: 20 } as any);
    expect(res.total).toBe(1);
    expect(res.items[0]).toEqual({ id: '1', email: 'a@b.com', status: 'active', role: 'admin', createdAt: new Date(0) });
  });

  it('should_reject_disabling_self', async () => {
    const c = new AdminController(make() as any);
    await expect(c.setStatus('1', { status: 'disabled' } as any, { sub: '1', email: 'a@b.com' }))
      .rejects.toThrow(BadRequestException);
  });

  it('should_reject_demoting_self', async () => {
    const c = new AdminController(make() as any);
    await expect(c.setRole('1', { role: 'user' } as any, { sub: '1', email: 'a@b.com' }))
      .rejects.toThrow(BadRequestException);
  });

  it('should_set_status_for_other_user', async () => {
    const users = make();
    const c = new AdminController(users as any);
    await c.setStatus('2', { status: 'disabled' } as any, { sub: '1', email: 'a@b.com' });
    expect(users.setStatus).toHaveBeenCalledWith('2', 'disabled');
  });
});
```

- [ ] **Step 2: 跑测试看失败**

Run: `cd apps/base-api && npm test -- admin.controller`
Expected: FAIL（AdminController 不存在）

- [ ] **Step 3: 实现**

DTOs：

```ts
// dto/list-query.dto.ts
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
export class ListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize = 20;
  @IsOptional() @IsString() q?: string;
}
// dto/create-user.dto.ts
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
export class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsIn(['user', 'admin']) role?: 'user' | 'admin';
}
// dto/update-status.dto.ts
import { IsIn } from 'class-validator';
export class UpdateStatusDto { @IsIn(['active', 'disabled']) status!: 'active' | 'disabled'; }
// dto/update-password.dto.ts
import { IsString, MinLength } from 'class-validator';
export class UpdatePasswordDto { @IsString() @MinLength(8) password!: string; }
// dto/update-role.dto.ts
import { IsIn } from 'class-validator';
export class UpdateRoleDto { @IsIn(['user', 'admin']) role!: 'user' | 'admin'; }
```

Controller：

```ts
// admin.controller.ts
import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/admin.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { UsersService } from '../../users/users.service';
import { User } from '../../users/user.entity';
import { ListQueryDto } from './dto/list-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

type Me = { sub: string; email: string };
const view = (u: User) => ({ id: u.id, email: u.email, status: u.status, role: u.role, createdAt: u.createdAt });

@Controller('admin/users')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(@Query() q: ListQueryDto) {
    const { items, total } = await this.users.list(q.page, q.pageSize, q.q);
    return { items: items.map(view), total };
  }

  @Post()
  async create(@Body() dto: CreateUserDto) {
    return view(await this.users.createByAdmin(dto.email, dto.password, dto.role ?? 'user'));
  }

  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @CurrentUser() me: Me) {
    if (id === me.sub && dto.status === 'disabled') throw new BadRequestException('不能禁用自己');
    await this.users.setStatus(id, dto.status);
    return { ok: true };
  }

  @Patch(':id/password')
  async resetPassword(@Param('id') id: string, @Body() dto: UpdatePasswordDto) {
    await this.users.resetPassword(id, dto.password);
    return { ok: true };
  }

  @Patch(':id/role')
  async setRole(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser() me: Me) {
    if (id === me.sub && dto.role === 'user') throw new BadRequestException('不能把自己降级');
    await this.users.setRole(id, dto.role);
    return { ok: true };
  }
}
```

Module（复用现有 User feature + TokenService/UsersService 供 AdminGuard 注入）：

```ts
// admin.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { User } from '../../users/user.entity';
import { RefreshToken } from '../../auth/refresh-token.entity';
import { UsersService } from '../../users/users.service';
import { TokenService } from '../../auth/token.service';
import { AdminGuard } from '../../auth/admin.guard';
import { AdminController } from './admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, RefreshToken]), JwtModule.register({})],
  controllers: [AdminController],
  providers: [UsersService, TokenService, AdminGuard],
})
export class AdminModule {}
```

在 `app.module.ts` 的 imports 数组加 `AdminModule`（import 自 `./modules/admin/admin.module`）。

- [ ] **Step 4: 跑测试看通过**

Run: `cd apps/base-api && npm test -- admin.controller`
Expected: PASS

- [ ] **Step 5: 全量后端测试不回归**

Run: `cd apps/base-api && npm test`
Expected: 全 PASS

- [ ] **Step 6: 提交**

```bash
git add apps/base-api/src/modules/admin apps/base-api/src/app.module.ts
git commit -m "feat: 成员管理 admin 模块（5 接口 + 防自锁）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 前端 auth store 带 role + 路由守卫 + /admin 路由

**Files:**
- Modify: `apps/base-web/src/stores/auth.ts`
- Modify: `apps/base-web/src/router.ts`
- Test: `apps/base-web/src/stores/auth.spec.ts`

**Interfaces:**
- Produces: `useAuthStore().role`, `useAuthStore().fetchMe(): Promise<'user'|'admin'>`

- [ ] **Step 1: 写失败测试** — 在 `stores/auth.spec.ts` 追加（mock api.get）：先把顶部 mock 改为同时含 post/get：`vi.mock('../api/client', () => ({ api: { post: vi.fn(), get: vi.fn() } }));`

```ts
it('should_fetch_me_and_store_role', async () => {
  (api.get as any).mockResolvedValue({ data: { sub: '1', email: 'a@b.com', role: 'admin', status: 'active' } });
  const store = useAuthStore();
  const role = await store.fetchMe();
  expect(role).toBe('admin');
  expect(store.role).toBe('admin');
  expect(api.get).toHaveBeenCalledWith('/auth/me');
});
```

- [ ] **Step 2: 跑测试看失败**

Run: `cd apps/base-web && npm test -- auth`
Expected: FAIL（fetchMe/role 不存在）

- [ ] **Step 3: 实现** — `stores/auth.ts` 加 state `role` 与 action `fetchMe`（沿用现有 store 写法；下例为 setup-store 风格，按文件现有风格适配）：

```ts
const role = ref<'user' | 'admin'>('user');

async function fetchMe(): Promise<'user' | 'admin'> {
  const { data } = await api.get('/auth/me');
  role.value = data.role ?? 'user';
  return role.value;
}
// 在 return 中导出 role, fetchMe
```

`router.ts` 加路由 + 守卫：

```ts
import AdminMembersView from './views/AdminMembersView.vue';
import { useAuthStore } from './stores/auth';
// routes 数组加：
{ path: '/admin', name: 'admin', component: AdminMembersView },
// 文件末尾加全局守卫：
router.beforeEach(async (to) => {
  if (to.name !== 'admin') return true;
  const auth = useAuthStore();
  try {
    const role = await auth.fetchMe();
    return role === 'admin' ? true : { name: 'welcome' };
  } catch {
    return { name: 'login' };
  }
});
```

- [ ] **Step 4: 跑测试看通过**

Run: `cd apps/base-web && npm test -- auth`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/base-web/src/stores/auth.ts apps/base-web/src/router.ts apps/base-web/src/stores/auth.spec.ts
git commit -m "feat: 前端 auth store 带 role + /admin 路由守卫

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: 前端 admin api + store

**Files:**
- Create: `apps/base-web/src/api/admin.ts`
- Create: `apps/base-web/src/stores/admin.ts`
- Test: `apps/base-web/src/stores/admin.spec.ts`

**Interfaces:**
- Produces: `useAdminStore()` with `members`, `total`, `load(page,pageSize,q)`, `create(email,password,role)`, `setStatus(id,status)`, `resetPassword(id,password)`, `setRole(id,role)`

- [ ] **Step 1: 写失败测试** — `stores/admin.spec.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { api } from '../api/client';
import { useAdminStore } from './admin';

vi.mock('../api/client', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

describe('admin store', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); });

  it('should_load_members_with_total', async () => {
    (api.get as any).mockResolvedValue({ data: { items: [{ id: '1', email: 'a@b.com', status: 'active', role: 'user', createdAt: '2026-01-01' }], total: 1 } });
    const s = useAdminStore();
    await s.load(1, 20, 'a');
    expect(s.total).toBe(1);
    expect(s.members[0].email).toBe('a@b.com');
    expect(api.get).toHaveBeenCalledWith('/admin/users', { params: { page: 1, pageSize: 20, q: 'a' } });
  });

  it('should_call_create_endpoint', async () => {
    (api.post as any).mockResolvedValue({ data: { id: '2' } });
    const s = useAdminStore();
    await s.create('n@b.com', 'secret123', 'user');
    expect(api.post).toHaveBeenCalledWith('/admin/users', { email: 'n@b.com', password: 'secret123', role: 'user' });
  });

  it('should_call_status_role_password_endpoints', async () => {
    (api.patch as any).mockResolvedValue({ data: { ok: true } });
    const s = useAdminStore();
    await s.setStatus('3', 'disabled');
    await s.setRole('3', 'admin');
    await s.resetPassword('3', 'newsecret9');
    expect(api.patch).toHaveBeenCalledWith('/admin/users/3/status', { status: 'disabled' });
    expect(api.patch).toHaveBeenCalledWith('/admin/users/3/role', { role: 'admin' });
    expect(api.patch).toHaveBeenCalledWith('/admin/users/3/password', { password: 'newsecret9' });
  });
});
```

- [ ] **Step 2: 跑测试看失败**

Run: `cd apps/base-web && npm test -- admin`
Expected: FAIL（store/api 不存在）

- [ ] **Step 3: 实现**

```ts
// api/admin.ts
import { api } from './client';
export interface Member { id: string; email: string; status: 'active' | 'disabled'; role: 'user' | 'admin'; createdAt: string; }
export const adminApi = {
  list: (page: number, pageSize: number, q?: string) =>
    api.get('/admin/users', { params: { page, pageSize, q } }),
  create: (email: string, password: string, role: 'user' | 'admin') =>
    api.post('/admin/users', { email, password, role }),
  setStatus: (id: string, status: 'active' | 'disabled') =>
    api.patch(`/admin/users/${id}/status`, { status }),
  resetPassword: (id: string, password: string) =>
    api.patch(`/admin/users/${id}/password`, { password }),
  setRole: (id: string, role: 'user' | 'admin') =>
    api.patch(`/admin/users/${id}/role`, { role }),
};
```

```ts
// stores/admin.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { adminApi, type Member } from '../api/admin';

export const useAdminStore = defineStore('admin', () => {
  const members = ref<Member[]>([]);
  const total = ref(0);

  async function load(page: number, pageSize: number, q?: string) {
    const { data } = await adminApi.list(page, pageSize, q);
    members.value = data.items; total.value = data.total;
  }
  const create = (email: string, password: string, role: 'user' | 'admin') => adminApi.create(email, password, role);
  const setStatus = (id: string, status: 'active' | 'disabled') => adminApi.setStatus(id, status);
  const resetPassword = (id: string, password: string) => adminApi.resetPassword(id, password);
  const setRole = (id: string, role: 'user' | 'admin') => adminApi.setRole(id, role);

  return { members, total, load, create, setStatus, resetPassword, setRole };
});
```

注意测试里直接断言 `api.get('/admin/users', {params})`，因此 `adminApi.list` 必须正好这么调用（已对齐）。

- [ ] **Step 4: 跑测试看通过**

Run: `cd apps/base-web && npm test -- admin`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/base-web/src/api/admin.ts apps/base-web/src/stores/admin.ts apps/base-web/src/stores/admin.spec.ts
git commit -m "feat: 前端 admin api + store

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: 成员管理页 AdminMembersView

**Files:**
- Create: `apps/base-web/src/views/AdminMembersView.vue`
- Test: `apps/base-web/src/views/AdminMembersView.spec.ts`

**Interfaces:**
- Consumes: `useAdminStore`（load/create/setStatus/resetPassword/setRole）+ Element Plus 组件

- [ ] **Step 1: 写失败测试** — 挂载组件，mock store，断言加载时调用 load + 渲染行：

```ts
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

describe('AdminMembersView', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); });

  it('should_load_members_on_mount', async () => {
    mount(AdminMembersView, { global: { stubs: { 'el-table': true, 'el-table-column': true, 'el-pagination': true, 'el-input': true, 'el-button': true, 'el-dialog': true } } });
    await Promise.resolve();
    expect(load).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试看失败**

Run: `cd apps/base-web && npm test -- AdminMembersView`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现** — `views/AdminMembersView.vue`（Element Plus；搜索 + 表格 + 分页 + 新建/重置密码弹窗 + 行操作）：

```vue
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useAdminStore } from '../stores/admin';

const store = useAdminStore();
const page = ref(1);
const pageSize = ref(20);
const q = ref('');

async function refresh() { await store.load(page.value, pageSize.value, q.value || undefined); }
onMounted(refresh);

function onSearch() { page.value = 1; refresh(); }
function onPage(p: number) { page.value = p; refresh(); }

const createDlg = reactive({ visible: false, email: '', password: '', role: 'user' as 'user' | 'admin' });
async function submitCreate() {
  try { await store.create(createDlg.email, createDlg.password, createDlg.role); ElMessage.success('已创建'); createDlg.visible = false; createDlg.email = ''; createDlg.password = ''; await refresh(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '创建失败'); }
}

const pwdDlg = reactive({ visible: false, id: '', password: '' });
function openPwd(id: string) { pwdDlg.id = id; pwdDlg.password = ''; pwdDlg.visible = true; }
async function submitPwd() {
  try { await store.resetPassword(pwdDlg.id, pwdDlg.password); ElMessage.success('密码已重置'); pwdDlg.visible = false; }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '操作失败'); }
}

async function toggleStatus(row: any) {
  const next = row.status === 'active' ? 'disabled' : 'active';
  try { await store.setStatus(row.id, next); await refresh(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '操作失败'); }
}
async function toggleRole(row: any) {
  const next = row.role === 'admin' ? 'user' : 'admin';
  try { await store.setRole(row.id, next); await refresh(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '操作失败'); }
}
</script>

<template>
  <div class="admin-members">
    <div class="toolbar">
      <el-input v-model="q" placeholder="按邮箱搜索" clearable style="width: 240px" @keyup.enter="onSearch" />
      <el-button type="primary" @click="onSearch">搜索</el-button>
      <el-button @click="createDlg.visible = true">新建成员</el-button>
    </div>

    <el-table :data="store.members" style="width: 100%">
      <el-table-column prop="email" label="邮箱" />
      <el-table-column prop="status" label="状态" width="100" />
      <el-table-column prop="role" label="角色" width="100" />
      <el-table-column prop="createdAt" label="注册时间" width="200" />
      <el-table-column label="操作" width="320">
        <template #default="{ row }">
          <el-button size="small" @click="toggleStatus(row)">{{ row.status === 'active' ? '禁用' : '启用' }}</el-button>
          <el-button size="small" @click="openPwd(row.id)">重置密码</el-button>
          <el-button size="small" @click="toggleRole(row)">{{ row.role === 'admin' ? '取消管理员' : '设为管理员' }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      :current-page="page" :page-size="pageSize" :total="store.total"
      layout="prev, pager, next" @current-change="onPage" />

    <el-dialog v-model="createDlg.visible" title="新建成员" width="420px">
      <el-input v-model="createDlg.email" placeholder="邮箱" style="margin-bottom: 12px" />
      <el-input v-model="createDlg.password" type="password" placeholder="初始密码(≥8位)" style="margin-bottom: 12px" />
      <el-button :type="createDlg.role === 'admin' ? 'primary' : 'default'" @click="createDlg.role = createDlg.role === 'admin' ? 'user' : 'admin'">
        {{ createDlg.role === 'admin' ? '管理员' : '普通成员' }}
      </el-button>
      <template #footer>
        <el-button @click="createDlg.visible = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="pwdDlg.visible" title="重置密码" width="420px">
      <el-input v-model="pwdDlg.password" type="password" placeholder="新密码(≥8位)" />
      <template #footer>
        <el-button @click="pwdDlg.visible = false">取消</el-button>
        <el-button type="primary" @click="submitPwd">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>
```

- [ ] **Step 4: 跑测试看通过**

Run: `cd apps/base-web && npm test -- AdminMembersView`
Expected: PASS

- [ ] **Step 5: 前端全量测试 + 构建不回归**

Run: `cd apps/base-web && npm test && npm run build`
Expected: 测试全 PASS，build 成功

- [ ] **Step 6: 提交**

```bash
git add apps/base-web/src/views/AdminMembersView.vue apps/base-web/src/views/AdminMembersView.spec.ts
git commit -m "feat: 成员管理页 AdminMembersView

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 上线（实现完成后，单独走部署）

1. base-env secret 加 `ADMIN_BOOTSTRAP_EMAIL=<你的邮箱>`（运维侧 `kubectl` 更新 + 重启 base-api）。
2. 合并 `feat/member-admin` → main：CI 出镜像 + bump overlays → ArgoCD 自动 sync；base-api initContainer 自动跑 migration（加 role 列）。
3. 用 `ADMIN_BOOTSTRAP_EMAIL` 对应账户注册并登录一次 → 自动成为超管 → 访问 `/admin`。

## Self-Review 结论

- 覆盖 spec 各节：数据模型(T1)、bootstrap(T2/T3)、登录 status(T3)、me 返回 role(T4)、AdminGuard(T5)、UsersService 方法(T6)、5 接口+防自锁(T7)、前端 store/守卫(T8)、admin api/store(T9)、管理页(T10)。✅
- 类型一致：`role:'user'|'admin'`、`status:'active'|'disabled'`、`view()` 输出字段、store 方法签名跨任务一致。✅
- 无占位符，每步含完整测试/实现代码与命令。✅
</content>
</invoke>
