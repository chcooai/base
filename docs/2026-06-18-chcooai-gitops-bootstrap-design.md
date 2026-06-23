# chcooai 平台 GitOps 底座搭建设计（参考 muoce，按本机环境精简）

> 日期：2026-06-18
> 目标机：187.77.7.122（root / 密码登录，端口 22）
> 主域：www.chcooai.com / chcooai.com；Argo UI：argo.chcooai.com
> 项目仓：https://github.com/chcooai/index（描述「主页」，当前空仓）

## 1. 目标

在全新的 187.77.7.122 上搭一套与 muoce **同款的 Argo CD GitOps 自动部署流程**，让 `git push` → 自动 build → 自动部署 → `https://www.chcooai.com` 对外可访问。第一步只跑通「平台底座 + 主页」，后续按 muoce SOP 横向加模块。

## 2. 关键环境差异（决定了与 muoce 的唯一不同）

| 项 | muoce（腾讯云 1.116.50.85，墙内） | chcooai（187.77.7.122，墙外） |
|---|---|---|
| 直连 GitHub | 被 GFW 切，慢/不稳 | **直连 0.12s** |
| 直连 ghcr.io | 被切 | **直连 0.07s** |
| 中转层 | **必须** cnb.cool 镜像 git+镜像 | **去掉**，直连 GitHub + ghcr |

muoce 手册 §3.4 明确指出 cnb 中转是最脆弱的一环（CI 挂了会「静默部署过期代码」）。本机无墙，**砍掉整个 cnb 中转层**，其余流程与 muoce 完全一致。这是经用户确认的设计决定。

## 3. 目标架构

```
开发者 git push github.com/chcooai/index
   │
   ▼
GitHub Actions（deploy.yml）
   1. build 镜像
   2. push ghcr.io/chcooai/index:<sha>
   3. sed 改 k8s/overlays/production 的 image tag
   4. bot commit "[skip ci]" 回 main
   │
   ▼
Argo CD（装在 187 的 k3s 内，argocd namespace）
   - Application: chcooai-index
   - source: github.com/chcooai/index, path k8s/overlays/production（直接拉 GitHub，无 cnb）
   - syncPolicy.automated: prune + selfHeal
   │  发现 image tag 变 → 自动 sync
   ▼
k3s（namespace chcooai-prod）
   - kubelet 直接拉 ghcr.io/chcooai/index 镜像
   - rolling update Deployment
   │
   ▼
Traefik(k3s 自带) ingress + cert-manager(Let's Encrypt)
   - www.chcooai.com / chcooai.com → 主页 service（TLS）
   - argo.chcooai.com → argocd-server（TLS）
```

## 4. 组件清单（装在 187.77.7.122）

| 组件 | namespace | 作用 | 暴露 |
|---|---|---|---|
| k3s（单节点，含 Traefik + containerd） | - | 集群 + ingress | 80/443 对外，6443 仅本机 |
| Argo CD | `argocd` | GitOps | `argo.chcooai.com`（TLS） |
| cert-manager | `cert-manager` | Let's Encrypt 自动签证书（HTTP-01） | - |
| 主页应用 chcooai-index | `chcooai-prod` | nginx 静态站 | `www.chcooai.com` / `chcooai.com`（TLS） |

## 5. 命名约定（仿 muoce §3.6，去掉 cnb 相关）

| 资源 | 模式 |
|---|---|
| GitHub repo | `chcooai/<module>`（首个 = `index`） |
| 镜像 | `ghcr.io/chcooai/<module>:<sha>` |
| Argo Application | `argocd/chcooai-<module>`（首个 = `chcooai-index`） |
| k8s namespace | `chcooai-prod` |
| k8s service / deployment | `<module>-web` / `<module>-api` |
| env secret | `<module>-env` |

## 6. chcooai/index 仓库要落地的资产（仿 muoce Step 3-8，去掉 cnb mirror 步骤）

```
chcooai/index/
├── site/index.html                      # 极简静态落地页（先跑通管道）
├── Dockerfile                           # nginx:alpine 托管 site/
├── .github/workflows/deploy.yml         # build→push ghcr→bump tag→commit
├── k8s/base/
│   ├── deployment.yaml                  # index-web，镜像 ghcr.io/chcooai/index
│   ├── service.yaml
│   └── ingress.yaml                     # www + apex，annotations 指 cert-manager issuer
└── k8s/overlays/production/kustomization.yaml   # images: 钉 tag
```

ghcr 镜像设为 **public package** → k3s 拉取免 pull secret。
Argo 拉 GitHub：若 `chcooai/index` 为 public 则免 repo 凭据；private 则配一份 repo credential（PAT/deploy key），待实施时按仓库可见性定。

## 7. DNS（用户负责改 A 记录）

| 域名 | 现状 | 需改成 |
|---|---|---|
| `argo.chcooai.com` | 187.77.7.122 ✅ | 不动 |
| `chcooai.com` | **188**.77.7.122 ❌（笔误） | 187.77.7.122 |
| `www.chcooai.com` | **188**.77.7.122 ❌（笔误） | 187.77.7.122 |

> ⚠️ 阻塞项：www/apex 解析到 188 是错的（服务器真实 IP 是 187，188 ping 不通）。必须先把这两条 A 记录改成 187.77.7.122，否则 www 的 Let's Encrypt HTTP-01 验证会失败。argo 子域已正确，可先签 argo 的证书。

## 8. 分阶段执行计划

- **阶段 0 — 准备/验证**：确认 187 防火墙放行 80/443；确认 chcooai/index 仓可见性；确认 DNS（www/apex 改到 187）。
- **阶段 1 — 集群底座**：装 k3s（单节点，自带 Traefik），建 namespace `chcooai-prod`。
- **阶段 2 — cert-manager + Issuer**：装 cert-manager，建 Let's Encrypt ClusterIssuer（HTTP-01 走 Traefik）。
- **阶段 3 — Argo CD**：装 Argo CD，建 `argo.chcooai.com` ingress + TLS，拿到 admin 密码，验证 UI 可登。
- **阶段 4 — 主页仓库脚手架**：在 chcooai/index 落地 site/ + Dockerfile + deploy.yml + k8s manifests，push 触发首个镜像构建。
- **阶段 5 — Argo Application**：创建 `chcooai-index` App，自动 sync，pod 起来。
- **阶段 6 — 入口 + TLS 验收**：www.chcooai.com / chcooai.com 出主页且 https 绿锁；改一行 push 验证全链路自动部署。

## 9. 验收标准

1. `https://argo.chcooai.com` 能登 Argo UI，证书有效。
2. `https://www.chcooai.com` 与 `https://chcooai.com` 返回主页，证书有效。
3. 在 chcooai/index 改一行 `git push` → 几分钟内 Argo 自动 sync、新 pod 上线、页面更新，全程不手动 SSH。
4. 在 187 上 `kubectl get applications -n argocd` 显示 `chcooai-index` Synced / Healthy。

## 10. 与红线的关系

- 全程不读取/外传任何 `.env` 或密钥内容；服务器密码只用于本机 SSH，不外泄不入仓。
- 不动 muoce 现网（1.116.50.85）任何东西，仅作架构参考。
- 安装 k3s/argocd 等对服务器的实质改动，开工前需用户明确放行。
