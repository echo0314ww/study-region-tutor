# Architecture

本文档记录 Study Region Tutor 的当前架构边界，面向维护者和后续开发者。普通用户的安装、配置和使用说明仍以 `README.md` 为准。

## 项目定位

Study Region Tutor 是 Electron + React + TypeScript 桌面应用，用于学习场景下框选屏幕区域、识别题目并生成学习性讲解。项目不实现隐藏窗口、绕过监控、自动提交答案、自动点击网页或规避检测等能力。

## 目录职责

- `src/main/`：Electron 主进程，负责窗口、截图裁剪、配置读取、API 请求、诊断、导出文件和自动更新。
- `src/preload/`：安全暴露给渲染层的 IPC API。
- `src/renderer/`：React 渲染层，负责工具栏、截图状态、结果面板、设置面板、公告、设置向导和用户交互。
- `src/shared/`：主进程、preload、渲染层共享的类型、IPC 名称和纯函数。
- `server/`：本地代理、公告服务、API 转发和 ngrok 托管脚本。
- `announcements/`：版本更新公告和私人公告数据。
- `tests/`：Vitest 单元测试。
- `docs/`：架构说明、发布清单和实施记录。
- `docs/decisions/`：长期架构、发布、安全和流程决策记录。
- `docs/templates/`：实施记录、发布检查、ADR 和用户可见变化模板。
- `.github/workflows/`：GitHub Actions 工作流，负责 Windows 发布和 Release Notes 同步。
- `.editorconfig` / `.gitattributes`：约束编辑器格式和 Git 换行符归一化。

## 核心流程

1. 用户点击工具栏 `截图`，渲染层进入拖拽截图模式。
2. 用户拖出题目区域后，应用先进入待确认状态。
3. 用户点击 `确认识别` 后，渲染层通过 IPC 请求主进程裁剪屏幕区域。
4. 主进程按显示器和缩放比例裁剪截图；跨显示器框选会拆分为多个裁剪段并合成为一张 PNG data URL。
5. 默认模式直接把图片发送给当前第三方 API 服务商；OpenAI-compatible、Gemini 原生和 Anthropic 原生由主进程或代理服务按 provider 类型转换请求格式。
6. 本地 OCR 模式会先展示可编辑识别文本；用户确认后才发送文本讲解请求。
7. 讲解成功后创建本题内存会话，后续追问只发送题目上下文、历史问答和新问题，不重新发送截图。
8. 结果面板底部可以复制或导出当前题目的答案记录，底层仍以 Markdown 文件格式保存。

## API 连接模式

- 本地直连：打包应用读取 `%APPDATA%\study-region-tutor\.env.local`、同目录 `.env` 或环境变量。开发运行时还会读取项目根目录 `.env.local` / `.env`。同名字段优先级为环境变量、`.env.local`、`.env`。
- 代理服务：用户端只保存代理地址和代理 Token，第三方 API Key 留在代理服务所在电脑或服务器。

服务商配置通过 `AI_API_TYPE` 或 `AI_PROVIDER_<ID>_API_TYPE` 区分协议，取值为 `openai-compatible`、`gemini` 或 `anthropic`。`openai-compatible` 继续使用 `AI_API_MODE` / `AI_PROVIDER_<ID>_API_MODE` 选择 Chat Completions 或 Responses；Gemini 和 Anthropic 忽略接口模式并走原生协议。

API 协议层中的端点拼接、模型列表候选地址和错误摘要由 `src/shared/apiProtocol.mjs` 维护，主进程直连和 `server/proxy-server.mjs` 都调用同一套纯函数，避免 provider 行为漂移。

思考程度配置由 `src/shared/reasoning.ts` 统一维护，设置面板只展示当前服务商和模型可用的档位。主进程 `src/main/openaiClient.ts` 和代理服务 `server/proxy-server.mjs` 都会在发起请求前归一化：OpenAI-compatible 使用 `reasoning_effort` / `reasoning.effort`，Claude 4.6/4.7/Mythos 使用 adaptive thinking + `output_config.effort`，旧 Claude 模型使用 `thinking.budget_tokens`，Gemini 3 使用 `thinkingLevel`，Gemini 2.5 使用 `thinkingBudget`。

代理服务通过 `server/runtime-env.mjs` 读取运行配置，统一为环境变量优先、`.env.local` 次之、`.env` 最后。`proxy:dev` 同时监听项目根目录和已存在的 env 文件，因此 `.env` / `.env.local` 的创建、删除、重命名和原子替换都会触发配置重载；`TUTOR_PROXY_PORT` 变化时会尝试重启监听端口。

代理服务公开接口不需要 Token：

- `GET /health`
- `GET /announcements/latest`
- `GET /announcements/stream`

API 代理接口需要 Token：

- `GET /providers`
- `POST /models`
- `POST /explain/stream`
- `POST /follow-up/stream`

## IPC 边界

渲染层不直接读取文件系统、环境变量或 API Key。需要主进程能力时，通过 `src/shared/ipc.ts` 中定义的 IPC 通道和 `src/preload/index.ts` 暴露的受控 API 完成。

当前主进程能力包括：

- 截图裁剪与 OCR。
- API 请求和追问。
- 设置、服务商、模型列表和连接模式。
- 一键诊断。
- 答案复制与 Markdown 导出。
- 自动更新。

## 隐私与安全约定

- 默认只裁剪用户确认后的框选区域，不上传整屏。
- API Key 只在主进程或代理服务端读取和使用，不回填到设置界面。
- 渲染层 `localStorage` 只保存非敏感设置，例如连接模式、模型名、代理地址和 OCR 选项；API Key 和代理 Token 不进入普通 `localStorage`。
- 代理 Token 可以保存在用户本机主进程安全存储路径中，但不会写入导出 Markdown。
- 诊断报告必须脱敏，不能输出 API Key、代理 Token、ngrok Token 或完整敏感请求头。
- Renderer HTML 带有基础 CSP；BrowserWindow 保持 `contextIsolation: true`、`nodeIntegration: false` 和 `webSecurity: true`。`sandbox` 仍为 `false`，后续若要启用需要先验证当前 preload/IPC 打包方式。
- 文档和公告不得包含真实密钥、Token 或个人账号凭据。

## 发布链路

Windows 正式发布通过 GitHub Actions 完成，不在本机手动发布 GitHub Release。

- `.github/workflows/release-windows.yml`：推送 `vX.Y.Z` tag 或手动 `workflow_dispatch` 时运行，执行依赖安装、文档检查、类型检查、Lint、测试和 `npm run publish:win`。
- `.github/workflows/sync-release-notes.yml`：当 `RELEASE_NOTES.md`、同步脚本或工作流变化时，把 `RELEASE_NOTES.md` 中的版本说明同步到已有 GitHub Release。
- `scripts/sync-release-notes.mjs`：从 `RELEASE_NOTES.md` 读取对应 tag 的说明，并写入 GitHub Release body。
- `npm run dist`：只用于 GitHub Actions 发布成功后同步本地 `release/` 产物。

发布权限使用仓库自带 `GITHUB_TOKEN`；`GH_TOKEN` 只是 electron-builder 的兼容变量，不需要 Personal Access Token。

## 文档地图

- `docs/START_HERE.md`：新账号、新对话或新 Codex 会话接手项目时的唯一入口。
- `README.md`：快速使用、基础配置、验证和文档入口。
- `docs/documentation-policy.md`：文档更新矩阵、版本材料分工和文档校验规则。
- `CHANGELOG.md`：开发者视角的版本变化。
- `RELEASE_NOTES.md`：普通用户可读的版本说明，会同步到 GitHub Releases。
- `PROJECT_CONTEXT.md`：Codex 或维护者在新对话中恢复上下文。
- `docs/codex-handoff.md`：新账号、新对话或新 Codex 会话接手项目时的启动顺序和协作规范。
- `docs/architecture.md`：当前架构边界和模块职责。
- `docs/release.md`：正式发布流程和发布后本地产物同步要求。
- `docs/release-checklist.md`：功能完成和发布前检查清单。
- `docs/proxy.md`：代理服务、ngrok、Token、限流和排障。
- `docs/provider-config.md`：第三方 API provider 协议和配置示例。
- `docs/announcements.md`：公告文件格式、版本公告和客户端展示规则。
- `docs/proxy-config.example.env`：代理服务、多 Token、限流和多协议 API 服务商的配置模板。
- `docs/dev-log/YYYY-MM-DD.md`：重要实施过程记录。
- `docs/decisions/`：架构决策记录。
- `docs/templates/`：常用文档模板。
- `announcements/releases.json`：可推送给客户端的版本更新公告。
