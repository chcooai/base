# chcooai Base 登录服务设计

> 日期：2026-06-23
> 定位：独立登录门户 + 纯鉴权服务
> 域名：www.chcooai.com / chcooai.com（**取代现有 index 主页**）
> 仓库：新建 `chcooai/base`，沿用 chcooai GitOps（GitHub Actions → ghcr → ArgoCD → 187 k3s）
> 技术参考：`E:\muoce\base`（同款骨架，砍到只剩 auth + users）

## 1. 目标与边界

Base 是 chcooai 平台的登录入口。用户在 www.chcooai.com 注册 / 登录，成功后 Base 签发 JWT 并跳转到目标站点，目标站点拿 token 自建会话。Base 不参与下游会话管理。

**做：** 注册（邮箱+密码）、登录、登出、token 刷新、登录后带 token 跳转交接。

**不做（明确排除）：** SSO 身份中心、下游会话托管、权限 / RBAC、多租户、组织架构、计费、企业微信、客户系统等 —— muoce base 的 26 个业务模块一个都不要。

**业务范围：** 仅 `auth` + `users` 两个模块。

**与 index 的关系：** Base 上线后，www.chcooai.com / chcooai.com 根路径 = 登录页。现有 `chcooai-index` 主页应用下线：移除其 Argo Application，将 www/apex Ingress 从 index 切到 base。`chcooai/index` 仓保留作归档，不再部署。`argo.chcooai.com` 不动。

## 2. 技术栈（沿用 muoce 骨架，砍到最薄）

| 层 | 选型 | 说明 |
|---|---|---|
| API | NestJS 11 + TypeORM + bcrypt + jsonwebtoken | 同 muoce base-api |
| DB | **MySQL**（k3s 内新建，单实例） | 同 muoce；TypeORM 连接 |
| 缓存 | **不引 Redis** | refresh token 存库即可，省一个组件 |
| Web | Vue 3 + Vite + Element Plus + Pinia + vue-router | 同 muoce base-web；仅登录 / 注册 / 占位欢迎页 |
| 部署 | ghcr 镜像 + ArgoCD + Traefik + cert-manager | 同 `chcooai/index` 管道 |

**仓库结构**（monorepo，仿 muoce）：

```
chcooai/base/
├── apps/base-api/           NestJS 鉴权 API
├── apps/base-web/           Vue3 登录 / 注册前端
├── docs/                    设计与开发日志
├── .github/workflows/       build → push ghcr → bump tag → commit
└── k8s/
    ├── base/                deployment(api/web) / service / ingress / mysql(StatefulSet+PVC)
    └── overlays/production/  钉镜像 tag
```

## 3. 数据模型（MySQL，两张表起步）

**users**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint PK auto | |
| email | varchar 唯一 | 登录名 |
| password_hash | varchar | bcrypt（salt rounds 走 env） |
| status | enum(`active`) | v1 注册即 active，预留将来 `disabled` 等 |
| created_at / updated_at | datetime | |

**refresh_tokens**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint PK auto | |
| user_id | bigint FK→users | |
| token_hash | varchar | 只存哈希，不存原文 |
| expires_at | datetime | |
| revoked_at | datetime null | 登出 / 轮换时置位 |
| created_at | datetime | |

## 4. 接口（REST，前缀 `/api/auth`）

| 方法 | 路径 | 作用 |
|---|---|---|
| POST | `/register` | 邮箱+密码注册，bcrypt 存哈希；邮箱已存在则拒绝。v1 **不发邮件验证**，注册即可用 |
| POST | `/login` | 校验密码 → 签发 access(~15min) + refresh(~30d)，refresh 哈希落库 |
| POST | `/refresh` | 拿 refresh 换新 access；**轮换 refresh**（签发新 refresh、旧的 revoke） |
| POST | `/logout` | revoke 当前 refresh |
| GET | `/me` | 用 access 返回当前用户（id / email） |

- access token：JWT，HS256（共享密钥）或后续可换 RS256 暴露公钥；payload 含 `sub`(user id) / `email` / `exp`。
- 校验 / 限流 / 错误：`class-validator` 校验入参；`@nestjs/throttler` 给 `/login`、`/register` 限流防爆破；统一错误响应不泄露"邮箱是否存在"。

## 5. 登录后交接（核心流程）

1. 登录页支持 `?redirect_uri=<目标站>`，**带白名单**：只接受配置（env / Secret）里列出的目标域，否则拒绝 —— 防开放重定向与 token 泄露。
2. 登录成功：
   - Base 在自身域 www.chcooai.com 设 **httpOnly + Secure** refresh cookie，维持 Base 自身登录态（"记住我"）；
   - 然后 `302` 跳到 `redirect_uri#access_token=<JWT>`，access token 放 **URL fragment**（不进 query / referrer / 访问日志）。
3. 目标站点用共享密钥（或 Base 公钥）自行校验 JWT、建立自己的会话。Base 之后不参与。
4. **尚无真实目标站时**：`redirect_uri` 缺省 → 跳内置占位页 `www.chcooai.com/welcome`，显示「已登录：<邮箱>」。

> 已登录用户再次访问带 `redirect_uri` 的登录页：Base 凭 refresh cookie 静默签发新 access，直接 302 交接，无需重新输密码。

## 6. 安全

- 密码 bcrypt 加盐（rounds 走 env）；登录失败不区分"密码错 / 用户不存在"。
- JWT 密钥、DB 密码、redirect_uri 白名单等敏感配置走 **k8s Secret**，不进仓、不读取 `.env` 内容。
- refresh cookie：httpOnly + Secure + SameSite=Lax；登出 revoke 落库。
- `/login`、`/register` 限流。
- HTTPS 全程（Let's Encrypt，复用 cert-manager）。

## 7. 测试

实际跑通、看到绿才算通过。`should_xxx_when_yyy` 命名。重点覆盖业务逻辑，不纠结 UI 细节。

- 注册：重复邮箱拒绝、密码 hash 不落明文。
- 登录：密码正确签发双 token、密码错统一报错。
- refresh：轮换签发新 token、旧 refresh 失效、已 revoke 的 refresh 拒绝。
- access 过期校验。
- redirect_uri：白名单外的目标被拒绝（防开放重定向）。
- API 单测 + e2e（仿 muoce base-api 的 jest / jest-e2e）。

## 8. 部署（沿用 chcooai GitOps）

- 新建仓库 `chcooai/base`，落地 monorepo + Dockerfile(api/web) + deploy.yml + k8s manifests。
- MySQL：k3s 内 StatefulSet + PVC（k3s 默认 local-path），单实例；密码走 Secret；备份策略后续再定。
- 镜像：`ghcr.io/chcooai/base-api`、`ghcr.io/chcooai/base-web`（public package，免 pull secret）。
- Argo Application `chcooai-base`（namespace `chcooai-prod`），自动 sync。
- Ingress：www.chcooai.com / chcooai.com → 非 `/api` 走 base-web，`/api` 走 base-api；TLS 复用 cert-manager ClusterIssuer。
- 切换：上线 base Ingress 后移除 `chcooai-index` Application（避免两个 App 抢同一 host）。

## 9. 验收标准

1. 访问 https://www.chcooai.com 显示登录页，证书有效。
2. 注册新邮箱 → 登录 → 跳 `/welcome` 显示「已登录：<邮箱>」。
3. 带 `?redirect_uri=<白名单内站点>` 登录 → 302 到该站并在 fragment 带 access_token；白名单外的 redirect_uri 被拒。
4. access 过期后用 refresh 换新 access；登出后该 refresh 失效。
5. 改一行 `git push` → ArgoCD 自动 sync、新 pod 上线，全程不手动 SSH。
6. `kubectl get applications -n argocd` 显示 `chcooai-base` Synced / Healthy，`chcooai-index` 已移除。

## 10. 与红线的关系

- 全程不读取 / 外传 `.env` 或密钥内容；服务器密码仅用于本机 SSH。
- 不动 muoce 现网，仅作技术参考。
- 装 MySQL、移除 index App 等对生产的实质改动，开工前需用户明确放行。
