# 0001 Release Through GitHub Actions

## Status

Accepted

## Context

项目需要发布 Windows NSIS 安装包，并让 `electron-updater` 能通过 GitHub Releases 检查更新。

## Decision

正式发布统一通过 GitHub Actions 完成。推送 `vX.Y.Z` tag 触发 `.github/workflows/release-windows.yml`，工作流使用仓库自带 `GITHUB_TOKEN` 构建并发布 GitHub Release。

本机只在 GitHub Actions 发布成功后运行 `npm run dist`，用于同步本地 `release/` 产物。

## Consequences

- 不需要 Personal Access Token。
- 发布前检查可在 CI 中稳定执行。
- Release body 由 `scripts/sync-release-notes.mjs` 从 `RELEASE_NOTES.md` 同步。
- 不在本机手动发布 GitHub Release，避免产物和 release notes 漂移。
