# base 成员管理（超管后台）设计

> 日期：2026-06-25
> 仓库：github.com/chcooai/base（chcooai 平台统一登录中心 / SSO）
> 目标：给 base 增加超级管理员角色 + 成员管理后台，让管理员能管理平台所有注册成员

## 1. 背景与现状

base 是 chcooai 平台的统一登录中心（cookie 域 `chcooai.com`、带 redirect 白名单，bridge 等子应用都靠它登录）。当前 base 只有最基础的认证：

- `User` 实体字段：`id` / `email` / `password_hash` / `status`(varchar16, 默认 `active`)，**无角色字段**。
- auth 接口仅 `register` / `login` / `refresh` / `logout` / `me`，**无任何成员管理接口**。
- 无 seed、无预设账户，所有注册用户平等。
- **登录当前不校验 `status`**（disabled 也能登录）——本设计需补上。
- 前端 base-web 为 Vue 3 + Vite + Element Plus，已有 Login / Register / Welcome 视图、router、Pinia store。

## 2. 目标

让超级管理员能：查看成员列表、启用/禁用成员、重置成员密码、创建成员、设/取消其他管理员。提供一个完整的成员管理后台页面。

## 3. 数据模型

`User` 表新增 `role` 字段：

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| role | varchar(16) | `'user'` | 取值 `user` / `admin` |

- 一条 TypeORM migration：`ALTER TABLE users ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user'`。
- 启用/禁用复用现有 `status`（`active` / `disabled`），不新增字段。

## 4. 超管 Bootstrap（首个超管怎么来）

- 新增环境变量 `ADMIN_BOOTSTRAP_EMAIL`（写入 base-env secret，进 EnvVars 校验为可选 string）。
- **懒提升**：用户登录成功后，若其 `email === ADMIN_BOOTSTRAP_EMAIL` 且 `role !== 'admin'`，自动将其 `role` 更新为 `admin`。
  - 不依赖谁先注册；换超管只需改环境变量后该邮箱重新登录。
  - 若该邮箱尚未注册，管理员能力暂不可用，直到它注册并登录一次。
- 之后超管可在后台把其他成员 `role` 设为 `admin`（支持多管理员）。

## 5. 后端 API（base-api 新增 admin 模块）

新增 NestJS module（如 `modules/admin`），所有路由前缀 `/api/admin/users`，全部受 **`AdminGuard`** 保护。

### 5.1 AdminGuard
- 复用现有 JWT 认证拿到当前用户，再校验其 `role === 'admin'`，否则 403。
- 实现参考现有鉴权方式（base 已有 JWT 体系）。

### 5.2 接口

| 方法 | 路径 | 说明 | 请求/约束 |
|---|---|---|---|
| GET | `/api/admin/users` | 成员列表 | query: `page`(默认1) / `pageSize`(默认20, 上限100) / `q`(按邮箱模糊搜索, 可空)。返回 `{ items:[{id,email,status,role,createdAt}], total }` |
| POST | `/api/admin/users` | 创建成员 | body: `email`(IsEmail) / `password`(MinLength8) / `role`(可选, 默认 user)。邮箱已存在→409。密码 bcrypt（复用 bcryptRounds） |
| PATCH | `/api/admin/users/:id/status` | 启用/禁用 | body: `status`(`active`/`disabled`)。**不能禁用自己**→400 |
| PATCH | `/api/admin/users/:id/password` | 重置密码 | body: `password`(MinLength8)，bcrypt 后写入 |
| PATCH | `/api/admin/users/:id/role` | 设/取消管理员 | body: `role`(`user`/`admin`)。**不能把自己降级为 user**→400 |

### 5.3 配套改动
- **登录加 status 校验**：`auth.service.login` 中，若用户 `status === 'disabled'` 则拒绝登录（如抛 Unauthorized `ACCOUNT_DISABLED`）。
- **`me` 接口返回 `role`**：供前端判断是否显示 admin 入口与路由守卫。

### 5.4 安全约束
- 防自锁：不能禁用自己、不能把自己从 admin 降级。
- 密码一律 bcrypt，绝不明文存储或返回。
- 列表/详情响应不含 `password_hash`。

## 6. 前端（base-web，Element Plus）

- 新视图 `views/AdminMembersView.vue`，路由 `/admin`。
- **路由守卫**：进入 `/admin` 前校验当前用户 `role === 'admin'`（取自 me / store），否则重定向到欢迎页或登录页。
- 页面构成：
  - 顶部：邮箱搜索框 + “新建成员”按钮（弹窗：邮箱 + 初始密码 + 可选设为管理员）。
  - `el-table`：列 邮箱 / 状态 / 角色 / 注册时间；行内操作：启用-禁用切换、重置密码（弹窗输入新密码）、设为/取消管理员。
  - 底部：`el-pagination` 分页。
- 导航/入口：根据 `me.role === 'admin'` 决定是否显示进入后台的入口。
- API 调用复用现有 base-web 的 api 层与 axios 封装。

## 7. 测试

- **后端**（遵循现有 `should_xxx_when_yyy` 风格）：
  - AdminGuard：非 admin 请求被 403；admin 通过。
  - 各接口正常路径 + 边界：建号邮箱冲突 409、禁用自己 400、自降级 400、分页/搜索。
  - bootstrap：ADMIN_BOOTSTRAP_EMAIL 用户登录后被提升为 admin。
  - 登录：disabled 用户被拒。
- **前端**：管理页核心交互（列表渲染、操作触发对应 API）；非 admin 无法进入 `/admin`。

## 8. 范围外（YAGNI）

- 不做细粒度 RBAC / 权限表 —— 仅 `user` / `admin` 二元角色。
- 不做邮件邀请 / 邀请链接 —— base 无邮件系统，建号即设初始密码、线下交付。
- 不做删除成员 —— 用禁用（disabled）代替（保留数据可追溯）。
- 不做审计日志 —— 后续需要再单独加。

## 9. 部署 / 上线

- migration 由 base-api 的 initContainer（`migration:run:prod`）在部署时自动执行。
- `ADMIN_BOOTSTRAP_EMAIL` 加入 base-env secret（运维侧 `kubectl` 更新 secret + 重启 base-api）。
- 走 base 正常 GitOps：合并到 main → CI 出镜像 + bump overlays → ArgoCD 自动 sync。
