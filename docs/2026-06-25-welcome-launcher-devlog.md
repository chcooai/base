# Welcome 工作台（应用启动器 + 管理中心）开发日志

> 日期：2026-06-25
> 分支：feat/welcome-launcher
> 范围：仅前端 `apps/base-web`（无后端接口、无 DB 迁移、无新环境变量）
> 关联文档：[设计](superpowers/specs/2026-06-25-welcome-launcher-design.md) · [实施计划](superpowers/plans/2026-06-25-welcome-launcher.md)

## 背景：为什么做

用户登录后访问 `chcooai.com/welcome` 只看到「已登录 / 欢迎回来 / 切换账号」，没有任何应用入口，也看不到管理中心。排查发现这不是单纯 UI 问题，而是**登录态底座缺失**叠加**占位页本就没有启动器功能**：

1. 前端 `accessToken` 只存内存，刷新/直接打开 `/welcome` 即丢失，取不到邮箱与角色。
2. 没有 axios token 拦截器、也没有用 refresh cookie 静默换 token 的逻辑；`JwtAuthGuard` 只认 `Authorization: Bearer`，除「刚登录那一下」外 `/auth/me`、`/admin` 全 401。
3. `/welcome` 按原设计只是「占位欢迎页」，没有应用入口（base 的定位是纯登录门户）。

用户明确要求：把每个应用做成入口卡片，并把管理中心也作为一张卡片展示。

## 做了什么

**① 登录态底座（前提）**
- `api/client.ts`：新增 token 注入请求拦截器 + 401→refresh→retry 响应拦截器（拆成纯函数 `onRequest`/`makeOnResponseError`/`installAuthInterceptors`，可单测）。`/auth/refresh|login|register` 精确匹配豁免，防递归。
- `stores/auth.ts`：新增 `bootstrap`/`ensureReady`（启动用 refresh cookie 静默换 token + fetchMe，去重只跑一次）、`refreshAccessToken`、`handoffTo`（外链 token 交接）、`logout`，以及 `email/ready/authenticated` 状态。access token 仍只存内存（经 `setApiToken` 同步给 client），不落 localStorage。
- `router.ts`：抽出可单测的 `authGuard`，`/welcome`、`/admin` 进入前 `ensureReady` 一次，按 `authenticated` + admin 角色门重定向。
- `main.ts`：启动时装配响应拦截器（refresh=store.refreshAccessToken，redirect→`/`）。

**② Welcome 工作台 UI**
- `views/WelcomeView.vue` 重写：顶栏（邮箱 + 切换账号→登出）、按角色过滤的应用卡片网格、内部卡走 `router.push`、外链卡走 `handoffTo`、空态提示。样式全用 muoce `--mu-*` token。
- `config/apps.ts`：前端静态应用清单 + `visibleApps` 角色过滤；内置「成员管理中心」admin 专属卡片（→ `/admin`）。以后加外链应用须同步后端 `REDIRECT_ALLOWLIST`。

## 关键决策

- **应用清单放前端静态文件**而非后端接口：base 现阶段几乎没有真应用（设计文档明确「尚无真实目标站」），YAGNI，避免多一套后端+接口。
- **access token 不持久化**：保持现有安全姿态，靠启动时 refresh cookie 重建会话。
- **管理中心走内部路由**而非 token 交接：同源，拦截器自动带 token；前端隐藏仅为 UX，后端 `AdminGuard` 仍是安全边界。
- 终审收紧：`AUTH_FREE` 由 `includes` 改精确匹配；顶栏背景硬编码色改 `color-mix` token；`logout` 重置引导态；`bootstrap` 中 fetchMe 失败清 token（消除「store 说未登录、wire 仍带 token」的不一致）。

## 质量

- 全程 TDD，8 个功能提交，每任务过「实现→任务评审→修复→复审」。
- Opus 全分支对抗评审：0 Critical / 0 阻塞；2 个 Important 潜在状态不一致已修复并复审通过。
- 本地实跑：**40/40 测试绿（8 文件）+ `npm run build` 通过**。

## 部署

合并 main → GitHub Actions 构建 `base-api`/`base-web` 镜像 → bump `k8s/overlays/production` tag → ArgoCD 自动 sync 到 187 k3s。本次改动仅 `base-web` 生效层面变化（api 镜像随提交一并重建）。
