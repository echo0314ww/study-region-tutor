# Release Checklist

这个清单用于功能完成、版本发布和交接前自检。正式发布前应逐项确认；普通功能改动至少完成“功能改动后”和“验证”中相关项。

## 新 Codex 会话接手

- [ ] 阅读 `PROJECT_CONTEXT.md`。
- [ ] 阅读 `docs/codex-handoff.md`。
- [ ] 阅读 `docs/architecture.md`。
- [ ] 查看最近的 `docs/dev-log/YYYY-MM-DD.md`。
- [ ] 运行或查看 `git status --short --branch`，确认工作区已有改动。
- [ ] 确认不读取、不提交 `.env.local`、API Key、代理 Token、ngrok Token 或 GitHub token。

## 功能改动后

- [ ] 确认 `README.md` 是否需要更新运行、配置、使用或排障说明。
- [ ] 更新 `CHANGELOG.md` 的 `Unreleased`，记录面向开发者的详细变化。
- [ ] 更新 `RELEASE_NOTES.md` 的 `Unreleased`，记录面向普通用户的简短变化。
- [ ] 更新 `PROJECT_CONTEXT.md`，让下一次 Codex 对话能恢复当前系统约定。
- [ ] 如涉及版本公告或发布，更新 `announcements/releases.json`。
- [ ] 如改动过程值得回溯，新增或更新 `docs/dev-log/YYYY-MM-DD.md`。
- [ ] 如涉及代理服务、Token、限流或 provider 协议配置，更新 `docs/proxy-config.example.env`。
- [ ] 确认没有把 `.env.local`、API Key、代理 Token、ngrok Token 或 GitHub token 写入文档。

## 验证

- [ ] `npm run docs:check`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `node --check server/proxy-server.mjs`
- [ ] `node --check server/ngrok-dev.mjs`
- [ ] `node --check scripts/sync-release-notes.mjs`

## 发布前

- [ ] `package.json` 和 `package-lock.json` 版本一致。
- [ ] 当前版本出现在 `CHANGELOG.md`。
- [ ] 当前版本出现在 `RELEASE_NOTES.md`。
- [ ] `announcements/releases.json` 包含 `release-vX.Y.Z`，并在 `allAnnouncement` 中可见。
- [ ] Git 工作区中没有误提交 `out/`、`release/`、`node_modules/` 或本地配置文件。
- [ ] 发布统一走 GitHub Actions：推送 `vX.Y.Z` tag 触发 `.github/workflows/release-windows.yml`，不要在本机手动发布 GitHub Release。
- [ ] `.github/workflows/release-windows.yml` 会运行 `npm run docs:check`、`typecheck`、`lint`、`test` 和 `npm run publish:win`。
- [ ] GitHub Actions 使用仓库自带 `GITHUB_TOKEN` 和兼容变量 `GH_TOKEN`，不需要 Personal Access Token。
- [ ] Release body 由 `scripts/sync-release-notes.mjs` 从 `RELEASE_NOTES.md` 同步。
- [ ] GitHub Actions 发布完成后，运行 `npm run dist` 同步本地 `release/`。
- [ ] 本地 `release/latest.yml` 的 `version` 和 `path` 指向最新版本。
