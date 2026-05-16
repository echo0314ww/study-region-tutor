# Release Checklist

这个清单用于功能完成、版本发布和交接前自检。正式发布前应逐项确认；普通功能改动至少完成“功能改动后”和“验证”中相关项。

## 新 Codex 会话接手

- [ ] 阅读 `docs/START_HERE.md`。
- [ ] 阅读 `PROJECT_CONTEXT.md`。
- [ ] 阅读 `docs/codex-handoff.md`。
- [ ] 阅读 `docs/architecture.md`。
- [ ] 按任务类型阅读 `docs/proxy.md`、`docs/provider-config.md`、`docs/announcements.md`、`docs/release.md` 或 `docs/documentation-policy.md`。
- [ ] 查看最近的 `docs/dev-log/YYYY-MM-DD.md`。
- [ ] 运行或查看 `git status --short --branch`，确认工作区已有改动。
- [ ] 确认不读取、不提交 `.env.local`、API Key、代理 Token、ngrok Token 或 GitHub token。

## 功能改动后

- [ ] 确认 `README.md` 是否需要更新运行、配置、使用或排障说明。
- [ ] 确认专题文档是否需要更新：`docs/proxy.md`、`docs/provider-config.md`、`docs/announcements.md`、`docs/release.md`、`docs/documentation-policy.md`。
- [ ] 更新 `CHANGELOG.md` 的 `Unreleased`，记录面向开发者的详细变化。
- [ ] 更新 `RELEASE_NOTES.md` 的 `Unreleased`，记录面向普通用户的简短变化。
- [ ] 更新 `PROJECT_CONTEXT.md`，让下一次 Codex 对话能恢复当前系统约定。
- [ ] 如涉及版本公告或发布，更新 `announcements/releases.json`。
- [ ] 如涉及版本发布或用户可见变化，检查 `src/renderer/src/guides.ts`：判断是否需要填充“本版本新增向导”，并判断整体功能向导是否需要更新；已发布版本的新增向导条目应继续保留在历史版本向导回顾中，不要删除；若不需要更新，也在实施记录或提交说明中写明原因。
- [ ] 如改动过程值得回溯，新增或更新 `docs/dev-log/YYYY-MM-DD.md`。
- [ ] 如形成长期流程、边界或取舍，新增或更新 `docs/decisions/` 中的 ADR。
- [ ] 如涉及代理服务、Token、限流或 provider 协议配置，更新 `docs/proxy-config.example.env`。
- [ ] 确认没有把 `.env.local`、API Key、代理 Token、ngrok Token 或 GitHub token 写入文档。

## 验证

- [ ] PR 或 `main` 推送触发的 `.github/workflows/ci.yml` 已通过，或本地已完成同等校验。
- [ ] `npm run docs:check`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npm run security:check`
- [ ] `node --check server/proxy-server.mjs`
- [ ] `node --check server/ngrok-dev.mjs`
- [ ] `node --check scripts/sync-release-notes.mjs`
- [ ] 代理配置热更新验证：编辑、删除、恢复、重命名 `.env.local` 后，`/health` 能在不重启 `npm run proxy:dev` 的情况下反映当前状态；删除 `AI_PROVIDERS` 后应返回 503，恢复后应回到 200。
- [ ] 代理端口热更新验证：修改 `TUTOR_PROXY_PORT` 后，`npm run proxy:dev` 和 `npm run ngrok:dev` 最终指向同一端口，旧端口不再被误判为可用。
- [ ] 连接路径验证：本地直连、代理模式内置默认地址、代理模式手动地址、无 Token 公告读取、带 Token API 代理均完成一次冒烟检查。
- [ ] 截图路径验证：单显示器框选、跨显示器框选、负坐标副屏框选至少各检查一次；跨屏结果应保留完整选择区域。
- [ ] Windows 桌面包首次启动验证：确认整体功能向导、本版本新增向导、历史版本向导入口和设置页首屏流程正常。

## 发布前

- [ ] `package.json` 和 `package-lock.json` 版本一致。
- [ ] 当前版本出现在 `CHANGELOG.md`。
- [ ] 当前版本出现在 `RELEASE_NOTES.md`。
- [ ] `announcements/releases.json` 包含 `release-vX.Y.Z`，并在 `allAnnouncement` 中可见。
- [ ] `announcements/releases.json` 的 `allAnnouncement` 第一项是 `release-vX.Y.Z`。
- [ ] 已确认“本版本新增向导”、“历史版本向导回顾”和“整体功能向导”是否需要更新；用户可感知的新入口、新流程、新配置或迁移提示应写入本版本新增向导，旧版本新增向导应保留供历史回顾使用。
- [ ] 如果当前 `Unreleased` 含用户可见变化，已决定哪些变化进入 `src/renderer/src/guides.ts`；不得把未发布变化写入已发布版本的向导条目。
- [ ] 已回看历史版本新增向导，确认旧版本条目仍可从“历史版本向导回顾”访问。
- [ ] Git 工作区中没有误提交 `out/`、`release/`、`node_modules/` 或本地配置文件。
- [ ] 发布统一走 GitHub Actions：推送 `vX.Y.Z` tag 触发 `.github/workflows/release-windows.yml`，工作流会校验 tag 格式，不要在本机手动发布 GitHub Release。
- [ ] `.github/workflows/release-windows.yml` 会运行 `npm run docs:check`、`typecheck`、`lint`、`test`、`security:check`、脚本语法检查和 `npm run publish:win`。
- [ ] GitHub Actions 使用仓库自带 `GITHUB_TOKEN` 和兼容变量 `GH_TOKEN`，不需要 Personal Access Token。
- [ ] Release body 由 `scripts/sync-release-notes.mjs` 从 `RELEASE_NOTES.md` 同步。
- [ ] GitHub Actions 发布完成后，运行 `npm run dist` 同步本地 `release/`。
- [ ] 本地 `release/latest.yml` 的 `version` 和 `path` 指向最新版本。
