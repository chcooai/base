# Welcome 工作台（应用启动器 + 管理中心）设计

> 日期：2026-06-25
> 仓库：github.com/chcooai/base（chcooai 平台统一登录中心 / SSO）
> 目标：把登录后的占位欢迎页 `/welcome` 改成「工作台」——展示可进入的应用入口（含管理中心），并补齐前端登录态底座，让登录用户真正看到东西、点得进去。

## 1. 背景与现状

base 是 chcooai 平台的统一登录中心：注册 / 登录 / 刷新 / 登出 / me，登录成功后签发 JWT 跳转白名单内目标站，目标站拿 token 自建会话（见 `2026-06-23-base-auth-design.md`）。`/welcome` 当前是**占位欢迎页**，只显示「已登录 / 邮箱(或欢迎回来) / 切换账号」，admin 用户多一个「进入成员管理」按钮。

用户实际体验是「登录了却几乎空白、没有任何应用入口」。排查根因有二（叠加）：

1. **登录态没持久化**：前端 `accessToken` 只存 Pinia 内存（`stores/auth.ts`）。直接打开 / 刷新 `/welcome` 时 token 为空，`onMounted` 早退，取不到邮箱与角色 → 显示「欢迎回来」、admin 入口不出现。
2. **前端没有会话引导与 token 注入**：
   - 没有 axios 拦截器把 `Authorization: Bearer <token>` 带上；`JwtAuthGuard` 只认 Bearer 头（`auth/jwt-auth.guard.ts`），所以除「刚登录那一下」外，`/auth/me`、`/admin/users` 全部 401。
   - 应用启动时没有用 httpOnly refresh cookie 静默换取 access token 的逻辑（后端 `POST /api/auth/refresh` 已具备该能力，前端没用）。
   - `/welcome` 的「已登录」是写死文案，与是否真有会话无关。

因此本需求 = **① 修登录态底座**（静默 refresh + token 拦截器 + 路由守卫）**+ ② Welcome 改工作台**（应用卡片 + 管理中心卡片）。①是②的前提。

## 2. 目标

- 登录用户打开 `/welcome` 能看到自己的邮箱，并看到一组**可进入的应用入口卡片**。
- **管理中心**作为一张卡片展示，仅 admin 可见，点击进入 `/admin`。
- 修复前端登录态：刷新页面 / 直接访问不再丢失会话；受保护接口自动带 token；会话失效自动跳登录。
- 应用清单可由前端静态配置维护，方便后续把真实子应用一行一行加进来。

## 3. 范围

**做：**
- 前端登录态底座：app 启动静默 refresh、axios token 注入与 401 自动刷新重试、路由守卫。
- `/welcome` 改为工作台：应用卡片网格、按角色过滤、空态、登出 / 切换账号。
- 前端静态应用清单 `apps.ts`，内置「成员管理中心」一张真卡片。
- 外链应用卡点击的 token 交接（先 refresh 取新鲜 token，再 `url#access_token=...`）。

**不做（YAGNI）：**
- 不做后端「应用列表」接口 / 配置（清单先放前端静态文件）。
- 不做图标上传、拖拽排序、收藏、应用分组。
- 不做 user/admin 之外的细粒度权限（沿用二元角色 + `requiredRole` 过滤）。
- access token 不落 localStorage（保持现有安全姿态，仅存内存 + 启动时 refresh 重建）。

## 4. 登录态底座（①）

### 4.1 启动时静默会话引导 `bootstrap()`
- `stores/auth.ts` 新增 `bootstrap()`：调 `POST /api/auth/refresh`（依赖 httpOnly refresh cookie，`withCredentials: true`）。
  - 成功：把返回的 `accessToken` 存内存，再调 `fetchMe()` 填充 `email` / `role`，标记 `ready = true`、`authenticated = true`。
  - 失败（401 / 无 cookie）：`authenticated = false`、`ready = true`，不抛给页面（视为未登录）。
- store 状态扩展：新增 `email: string`、`ready: boolean`、`authenticated: boolean`（`role` 已有）。
- 调用时机：在路由守卫首次进入受保护路由前确保 `bootstrap()` 已跑（用一个 in-flight Promise 去重，避免并发重复 refresh）。

### 4.2 axios 拦截器（`api/client.ts`）
- **请求拦截器**：若 store 有 `accessToken`，注入 `Authorization: Bearer <token>`。
- **响应拦截器**：收到 401 且该请求未重试过 → 调一次 `/auth/refresh`：
  - refresh 成功：更新内存 token，重试原请求一次。
  - refresh 失败：清空会话状态，跳转登录页 `/`。
- 防循环：`/auth/refresh`、`/auth/login`、`/auth/register` 自身不触发上面的 401 重试逻辑（用请求标记或路径白名单排除）。
- 落地后删除 `WelcomeView.vue` 里手写的 `headers: { Authorization: ... }`，统一走拦截器。

### 4.3 路由守卫（`router.ts`）
- 受保护路由：`/welcome`、`/admin`。进入前 `await auth.ensureReady()`（内部确保 `bootstrap()` 跑过一次）。
  - 未登录（`authenticated === false`）→ 重定向登录页 `/`。
  - `/admin` 额外要求 `role === 'admin'`，否则重定向 `/welcome`。
- 登录页 `/`、注册页 `/register` 不强制 bootstrap（保持可直接访问）。

## 5. Welcome 工作台（②）

### 5.1 静态应用清单 `apps.ts`
新增 `apps/base-web/src/config/apps.ts`：

```ts
export interface LauncherApp {
  key: string;             // 唯一标识
  name: string;            // 卡片标题
  desc?: string;           // 卡片副标题/说明
  url: string;             // 外链应用=完整 https；内部入口='/admin' 这类路由
  internal?: boolean;      // true=内部路由 router.push；缺省/false=外链 token 交接
  requiredRole?: 'admin';  // 缺省=所有登录用户可见；'admin'=仅管理员可见
}

export const LAUNCHER_APPS: LauncherApp[] = [
  // 真应用以后往这里加，例如：
  // { key: 'home', name: '启蔻家居控制台', desc: '定制家具业务后台', url: 'https://app.chcooai.com' },
  { key: 'admin', name: '成员管理中心', desc: '管理平台成员、角色与状态', url: '/admin', internal: true, requiredRole: 'admin' },
];
```

> ⚠️ **一致性约束**：新增一个外链应用 = 同时改 `apps.ts` **和** 后端 `REDIRECT_ALLOWLIST`（`origin` 维度）。两者不一致时，前端能看到卡片但后端交接会被白名单拒绝。

### 5.2 页面结构（`WelcomeView.vue` 重写）
- 顶部：品牌（QkMark + 启蔻 AI）+ 当前邮箱 + 「登出 / 切换账号」。
- 主体：**应用卡片网格**，数据 = `LAUNCHER_APPS` 按当前 `role` 过滤（`requiredRole` 不满足的不渲染）。
- 卡片点击：
  - `internal === true`：`router.push(url)`（管理中心走这里，拦截器自动带 token）。
  - 否则（外链应用）：调 `auth.handoffTo(url)` → 先 `POST /auth/refresh` 取新鲜 access token → `window.location.assign(url + '#access_token=' + encodeURIComponent(token))`。
- **空态**：过滤后无任何卡片（如普通用户、清单暂无面向 user 的应用）→ 显示「暂无可用应用，敬请期待」。
- 未登录兜底：路由守卫已拦截，正常进到本页即已登录；`email` 直接取 store。

### 5.3 登出 / 切换账号
- 「登出」：调 `POST /api/auth/logout`（revoke refresh cookie）→ 清空 store → 跳 `/`。
- 「切换账号」：与「登出」**同一套逻辑**（登出当前会话 + 清 store + 跳 `/`），仅文案不同；不保留旧会话。

## 6. 安全

- access token 始终仅存内存 + URL fragment 交接，不落 localStorage、不进 query/referrer。
- 外链交接仍受后端 `REDIRECT_ALLOWLIST` 白名单约束（前端清单不替代后端校验）。
- 管理中心走内部路由 + `AdminGuard`（后端 `role==='admin'` 校验照旧），前端隐藏仅为体验，不作为安全边界。
- refresh 失败一律导向登录页，不在前端长期保留失效态。

## 7. 测试（`should_xxx_when_yyy`，重业务逻辑、不纠结 UI 细节）

**store（`stores/auth.spec.ts` 扩展）**
- `should_set_token_and_email_when_bootstrap_succeeds`：refresh 返回 token、me 返回邮箱/角色 → `authenticated=true`。
- `should_mark_unauthenticated_when_bootstrap_refresh_fails`：refresh 401 → `authenticated=false`、不抛异常。
- `should_build_fragment_url_when_handoffTo_external`：handoffTo 取新 token 后 `assign(url#access_token=...)`。

**api 拦截器（`api/client.spec.ts` 扩展）**
- `should_attach_bearer_header_when_token_present`。
- `should_refresh_and_retry_once_when_response_401`。
- `should_redirect_login_when_refresh_also_fails`。
- `should_not_loop_when_refresh_endpoint_itself_401`。

**welcome（`WelcomeView.spec.ts` 新增/扩展）**
- `should_render_cards_from_launcher_list_when_mounted`。
- `should_hide_admin_card_when_role_is_user`。
- `should_show_admin_card_when_role_is_admin`。
- `should_router_push_when_internal_card_clicked`。
- `should_show_empty_state_when_no_visible_apps`。

**路由守卫（可在 router/集成测试覆盖）**
- `should_redirect_login_when_not_authenticated`。
- `should_redirect_welcome_when_non_admin_visits_admin`。

## 8. 部署 / 上线

- 纯前端 + 现有后端能力（无新后端接口、无 DB 迁移、无新环境变量）。
- 走 base 正常 GitOps：分支 PR → 合并 main → CI 出镜像 + bump overlays → ArgoCD 自动 sync。
- 上线后验收：登录 → `/welcome` 显示邮箱 + 管理中心卡片（admin）；刷新页面会话不丢；点管理中心进 `/admin`；普通用户看不到管理中心、看到空态或仅面向 user 的应用。

## 9. 与红线 / 用户规范的关系

- 全程不读取 / 外传 `.env` 或密钥内容。
- 改动涉及 `.ts`/`.vue` 业务代码且 ≥30 行 → 走完整 PR 流程（对抗评审 → 用户回 `1` 才 merge）。
- 不动 muoce；不动生产配置（无新 Secret / 无迁移）。
