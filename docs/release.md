# Release Process

本文档是正式发布版本时的操作规范。发布检查清单见 `docs/release-checklist.md`。

## 发布前准备

1. 确认工作区状态：

```bash
git status --short --branch
```

2. 更新版本号：

```bash
npm version X.Y.Z --no-git-tag-version
```

3. 归档版本材料：

- `CHANGELOG.md`：把 `Unreleased` 下的开发者视角变化移动到 `## vX.Y.Z - YYYY-MM-DD`。
- `RELEASE_NOTES.md`：把 `Unreleased` 下的用户视角变化移动到 `## vX.Y.Z`。
- `announcements/releases.json`：新增 `release-vX.Y.Z`，并放到 `allAnnouncement` 第一位。
- `PROJECT_CONTEXT.md`：更新当前版本、当前状态和发布提醒。

4. 检查向导：

- `src/renderer/src/guides.ts` 是否需要新增当前版本的“本版本新增向导”。
- 历史版本向导回顾是否仍保留旧版本条目。
- 整体功能向导是否需要同步当前主流程。
- 如果无需更新，在实施记录、提交说明或 `PROJECT_CONTEXT.md` 中写明原因。

5. 确认没有误提交本地产物或敏感配置：

- 不提交 `.env.local`。
- 不提交 API Key、代理 Token、ngrok Token、GitHub token。
- 不提交 `node_modules/`、`out/`、`release/`。

## 发布前验证

至少运行：

```bash
npm run docs:check
npm run typecheck
npm run lint
npm run test
npm run build
npm run security:check
node --check server/proxy-server.mjs
node --check server/ngrok-dev.mjs
node --check scripts/sync-release-notes.mjs
```

涉及代理、截图或桌面包行为时，还应按 `docs/release-checklist.md` 做对应冒烟验证。

## 创建发布提交和 tag

```bash
git add -A
git commit -m "Release vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main vX.Y.Z
```

推送 tag 会触发 `.github/workflows/release-windows.yml`。该工作流会运行文档检查、类型检查、Lint、测试、安全边界检查和 `npm run publish:win`，并用仓库自带 `GITHUB_TOKEN` 发布 GitHub Release。

## 发布后确认

1. 确认 `Release Windows` GitHub Actions run 成功。
2. 确认 `Sync Release Notes` 成功，GitHub Release body 来自 `RELEASE_NOTES.md` 对应版本。
3. 在本地同步 release 产物：

```bash
npm run dist
```

4. 检查 `release/`：

- 只保留当前版本安装包、`.blockmap`、`latest.yml` 和 `win-unpacked`。
- `release/latest.yml` 的 `version` 和 `path` 指向当前版本。

## 不要做的事

- 不要在本机手动创建或编辑 GitHub Release。
- 不要使用 Personal Access Token 发布。
- 不要让 `RELEASE_NOTES.md`、`announcements/releases.json` 和 GitHub Release body 三者长期不一致。
