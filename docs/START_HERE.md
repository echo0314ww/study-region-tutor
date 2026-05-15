# Start Here

这是新账号、新对话或新 Codex 会话接手 Study Region Tutor 时的唯一入口。先读这份文档，再按任务类型跳到对应资料。

## 5 分钟接手顺序

1. 运行或查看 `git status --short --branch`，确认工作区是否已有改动。
2. 阅读 `PROJECT_CONTEXT.md`，恢复当前版本、已完成功能、当前约束和最近风险。
3. 阅读 `docs/architecture.md`，确认模块边界、IPC 边界、隐私与安全约定。
4. 按任务类型阅读下方“任务到文档映射”。
5. 运行 `npm run docs:check`，确认文档、版本公告和发布材料没有漂移。

Windows PowerShell 查看中文文档时，优先使用：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/read-utf8.ps1 docs/START_HERE.md
```

## 项目已经做了什么

- Electron + React + TypeScript 桌面应用，支持框选屏幕区域、截图、识别题目并生成学习性讲解。
- 默认直接发送图片给第三方 API；图片接口失败时退回本地 OCR，并先展示可编辑 OCR 结果确认页。
- 支持本地直连和代理服务两种 API 连接模式；代理服务保留第三方 API Key 在维护者端，用户只填写代理 Token。
- 支持 OpenAI-compatible、Gemini 原生和 Anthropic 原生三类 provider 协议。
- 支持多 provider、模型列表刷新、按 provider/model 动态显示思考程度。
- 支持公告系统、版本更新公告、私人公告和公告已读红点。
- 支持整体功能向导、本版本新增向导和历史版本向导回顾。
- 支持首次配置向导、代理管理面板、快捷键自定义、本地历史、Provider 配置生成器和 Prompt 模板。
- OCR 确认页支持多路候选切换；诊断支持快速检查和实际请求文本接口的深度测试；公告支持按分类分组。
- 发布统一走 GitHub Actions，推送 `vX.Y.Z` tag 后自动构建并发布 Windows 安装包。
- 已有 `npm run docs:check` 检查版本、文档结构、版本公告、发布说明、向导和敏感信息风险。

## 任务到文档映射

| 任务类型 | 必读文档 | 常见同步项 |
| --- | --- | --- |
| 普通使用、快速运行 | `README.md` | 无 |
| UI、截图、OCR、追问、设置页 | `docs/architecture.md`、`PROJECT_CONTEXT.md` | `README.md`、`CHANGELOG.md`、`RELEASE_NOTES.md`、`src/renderer/src/guides.ts` |
| 代理、ngrok、Token、限流 | `docs/proxy.md`、`docs/provider-config.md` | `docs/proxy-config.example.env`、`docs/architecture.md`、`docs/release-checklist.md` |
| provider 协议或模型参数 | `docs/provider-config.md`、`docs/architecture.md` | `src/shared/apiProtocol.mjs`、`src/shared/reasoning.ts`、相关测试 |
| 公告或版本公告 | `docs/announcements.md` | `announcements/releases.json`、`RELEASE_NOTES.md` |
| 发布版本 | `docs/release.md`、`docs/release-checklist.md` | `package.json`、`package-lock.json`、`CHANGELOG.md`、`RELEASE_NOTES.md`、`announcements/releases.json`、`PROJECT_CONTEXT.md` |
| 文档体系或协作规范 | `docs/documentation-policy.md`、`docs/codex-handoff.md` | `scripts/check-docs.mjs`、`docs/templates/` |
| 架构决策 | `docs/decisions/` | `docs/architecture.md`、`PROJECT_CONTEXT.md` |

## 硬性约束

- 不读取、提交或复制 `.env.local`、API Key、代理 Token、ngrok Token、GitHub token。
- 不实现隐藏窗口、绕过监控、自动提交答案、自动点击网页或规避检测等考试作弊能力。
- 默认提示词和产品行为必须面向学习讲解；遇到正式考试、竞赛、测验或受限制平台，只给学习性讲解和建议。
- API Key 只在主进程或代理服务端读取和使用，不进入渲染层 `localStorage`、导出文件、诊断报告或公告。
- 发布统一走 GitHub Actions：推送 `vX.Y.Z` tag 触发 `.github/workflows/release-windows.yml`，不要在本机手动发布 GitHub Release。
- GitHub Actions 使用仓库自带 `GITHUB_TOKEN`；不需要 Personal Access Token。
- 每次版本发布前必须确认“本版本新增向导”、“历史版本向导回顾”和“整体功能向导”是否需要更新；旧版本新增向导条目不得删除。
- 每次正式发布后，GitHub Actions 成功后再运行 `npm run dist` 同步本地 `release/`，并确认 `release/latest.yml` 指向最新版本。

## 常用命令

```bash
npm run docs:check
npm run typecheck
npm run lint
npm run test
npm run build
node --check server/proxy-server.mjs
node --check server/ngrok-dev.mjs
node --check scripts/sync-release-notes.mjs
```

当前 Windows Codex 环境中，`npm run test`、`npm run build`、`npm run dist` 可能因为 esbuild `spawn EPERM` 失败；这通常是权限问题，提升权限重跑即可。
