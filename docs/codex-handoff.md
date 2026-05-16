# Codex Handoff Guide

这份文档给以后任何新账号、新对话或新 Codex 会话接手项目时使用。目标是让开发过程持续遵守同一套工程、文档和发布规范。

## 新对话启动顺序

1. 先读 `docs/START_HERE.md`，确认任务类型、硬性约束和应读文档。
2. 再读 `PROJECT_CONTEXT.md`，恢复当前版本、未发布改动、发布方式和最近风险。
3. 再读 `docs/architecture.md`，确认模块边界、核心流程、IPC 边界和安全约定。
4. 按任务类型阅读 `docs/proxy.md`、`docs/provider-config.md`、`docs/announcements.md`、`docs/release.md` 或 `docs/documentation-policy.md`。
5. 查看最近的 `docs/dev-log/YYYY-MM-DD.md`，了解最近一次重要实施过程。
6. 运行或查看 `git status --short --branch`，确认当前工作区已有改动；不要回滚不是自己写的改动。

Windows PowerShell 查看中文文档时，优先使用：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/read-utf8.ps1 docs/START_HERE.md
```

## 开发原则

- 不读取、提交或复制 `.env.local`、API Key、代理 Token、ngrok Token、GitHub token。
- 不实现隐藏窗口、绕过监控、自动提交答案、自动点击网页或规避检测等考试作弊能力。
- 先按现有目录职责找代码，不随意新建平行结构。
- 保持 `.editorconfig` 和 `.gitattributes` 的编码、缩进和换行符约定，避免跨环境产生无意义 diff。
- 涉及主进程能力时，保持 `src/shared/ipc.ts`、`src/preload/index.ts`、主进程 handler 和渲染层调用同步。
- 涉及用户可见功能时，同步考虑设置页、一键诊断、错误提示、导出内容和文档说明。
- 涉及版本更新或用户可见变化时，必须检查 `src/renderer/src/guides.ts`：判断是否需要添加“本版本新增向导”，并判断“整体功能向导”是否需要更新。用户可感知的新入口、新流程、新配置、迁移提示应优先写入本版本新增向导；已发布版本的新增向导条目继续保留，用于“历史版本向导回顾”；整体流程变化才更新整体功能向导。
- 涉及代理服务时，保持 Token 脱敏、API Key 不下发、公开接口不需要 Token、API 代理接口需要 Token。
- 涉及 API 服务商时，注意 `AI_API_TYPE` / `AI_PROVIDER_<ID>_API_TYPE` 的协议分支：`openai-compatible` 走 Chat Completions 或 Responses，`gemini` 和 `anthropic` 走原生请求格式。
- 涉及 API 端点、模型列表候选地址或 API 错误摘要时，优先修改 `src/shared/apiProtocol.mjs`，主进程直连和代理服务都复用这里的纯函数。
- 涉及代理服务和 ngrok 环境读取时，优先修改 `server/runtime-env.mjs`，保持环境变量、`.env.local`、`.env` 的优先级一致。
- 涉及思考程度时，先看 `src/shared/reasoning.ts`。设置面板、主进程和代理服务都要按服务商/模型归一化，不要再固定套用 `low/medium/high/xhigh`：Claude 4.6 可用 `max` 并映射到 `output_config.effort`，Gemini 3/2.5 分别使用 `thinkingLevel` / `thinkingBudget`。
- 涉及前端设置持久化时，只把非敏感设置写入渲染层 `localStorage`；API Key 和代理 Token 不得进入普通 `localStorage`。
- 涉及长期流程、边界或取舍时，优先新增或更新 `docs/decisions/` 中的 ADR，不要只留在聊天记录里。

## 文档更新矩阵

完整规则见 `docs/documentation-policy.md`。常用矩阵如下：

- 用户使用、配置、排障、代理、ngrok、公告、发布方式变化：更新 `README.md`。
- 功能、修复、内部维护变化：更新 `CHANGELOG.md` 的 `Unreleased`。
- 普通用户需要知道的变化：更新 `RELEASE_NOTES.md` 的 `Unreleased`。
- 新对话必须知道的状态、约定、未发布改动：更新 `PROJECT_CONTEXT.md`。
- 架构边界、目录职责、IPC 或核心流程变化：更新 `docs/architecture.md`。
- 发布流程或验证命令变化：更新 `docs/release-checklist.md`。
- 代理、ngrok、Token 或限流变化：更新 `docs/proxy.md` 和 `docs/proxy-config.example.env`。
- Provider 协议、模型列表或思考程度变化：更新 `docs/provider-config.md` 和 `docs/architecture.md`。
- 公告格式或公告展示变化：更新 `docs/announcements.md` 和相关公告文件。
- 版本新增向导、历史版本向导回顾或整体功能向导变化：更新 `src/renderer/src/guides.ts`，必要时补充 `tests/guides.test.ts`，并在 `CHANGELOG.md` / `RELEASE_NOTES.md` 记录用户可见变化。
- 重要实施过程、设计取舍或排障记录：新增或更新 `docs/dev-log/YYYY-MM-DD.md`。
- 版本公告或正式发版：更新 `announcements/releases.json`。

改动完成后至少运行：

```bash
npm run docs:check
```

代码改动完成后优先运行：

```bash
npm run validate
```

当前 Windows Codex 环境中，`npm run test`、`npm run build`、`npm run validate` 偶尔会因为 esbuild `spawn EPERM` 失败；这属于环境权限问题，提升权限重跑通常可以通过。

## GitHub Actions 发布约定

Windows 正式发布统一走 GitHub Actions，不在本机手动发布 GitHub Release。

- 发布工作流：`.github/workflows/release-windows.yml`。
- 触发方式：推送 release tag；工作流会校验 tag 必须是 `vX.Y.Z`，不保留手动发布入口。
- 权限：使用仓库自带 `GITHUB_TOKEN`，并把 `GH_TOKEN` 指向同一个 token 供 electron-builder 使用。
- 构建命令：工作流执行 `npm ci`、`npm run docs:check`、`npm run typecheck`、`npm run lint`、`npm run test`、`npm run security:check`、脚本语法检查和 `npm run publish:win`。
- Release 说明：tag 发布后，工作流运行 `scripts/sync-release-notes.mjs --tag <tag>`，从 `RELEASE_NOTES.md` 同步对应版本到 GitHub Release body。
- 已有 Release 说明同步：`.github/workflows/sync-release-notes.yml` 会在 `RELEASE_NOTES.md` 或同步脚本变化后更新已有 Release。

发布前必须确认：

- `package.json` 和 `package-lock.json` 版本一致。
- `CHANGELOG.md`、`RELEASE_NOTES.md`、`PROJECT_CONTEXT.md` 已更新到当前版本或 Unreleased 状态。
- `announcements/releases.json` 中有 `release-vX.Y.Z`，并放入 `allAnnouncement`。
- 已检查“本版本新增向导”、“历史版本向导回顾”和“整体功能向导”：需要更新则已更新，不需要更新则在实施记录或提交说明中写明原因；不要删除旧版本新增向导条目。
- `npm run docs:check` 和 `npm run security:check` 通过。
- `docs/START_HERE.md`、`PROJECT_CONTEXT.md` 和相关专题文档没有过期版本描述。

GitHub Actions 发布成功后，再在本机运行：

```bash
npm run dist
```

然后确认本地 `release/` 只保留最新安装包、`.blockmap`、`latest.yml` 和 `win-unpacked`。
