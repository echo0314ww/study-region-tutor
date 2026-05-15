# Release vX.Y.Z Check

## 发布材料

- [ ] `package.json` version 为 `X.Y.Z`
- [ ] `package-lock.json` version 为 `X.Y.Z`
- [ ] `CHANGELOG.md` 有 `## vX.Y.Z - YYYY-MM-DD`
- [ ] `RELEASE_NOTES.md` 有 `## vX.Y.Z`
- [ ] `announcements/releases.json` 有 `release-vX.Y.Z`
- [ ] `PROJECT_CONTEXT.md` 当前版本为 `X.Y.Z`

## 向导检查

- [ ] 已确认本版本新增向导是否需要更新
- [ ] 已确认历史版本向导回顾仍保留旧版本条目
- [ ] 已确认整体功能向导是否需要更新

## 验证

- [ ] `npm run docs:check`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `node --check server/proxy-server.mjs`
- [ ] `node --check server/ngrok-dev.mjs`
- [ ] `node --check scripts/sync-release-notes.mjs`

## 发布后

- [ ] GitHub Actions `Release Windows` 成功
- [ ] GitHub Actions `Sync Release Notes` 成功
- [ ] `npm run dist` 已同步本地 `release/`
- [ ] `release/latest.yml` 指向 `X.Y.Z`
