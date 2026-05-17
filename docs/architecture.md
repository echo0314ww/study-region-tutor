# Architecture

本文档记录 Study Region Tutor 的当前架构边界，面向维护者和后续开发者。普通用户的安装、配置和使用说明仍以 `README.md` 为准。

## 项目定位

Study Region Tutor 是 Electron + React + TypeScript 桌面应用，用于学习场景下框选屏幕区域、识别题目并生成学习性讲解。项目不实现隐藏窗口、绕过监控、自动提交答案、自动点击网页或规避检测等能力。

## 目录职责

- `src/main/`：Electron 主进程，负责窗口、截图裁剪、配置读取、API 请求、诊断、导出文件、学习数据备份/恢复和自动更新。
- `src/preload/`：安全暴露给渲染层的 IPC API。
- `src/renderer/src/components/`：React UI 组件（SettingsPanel、HistoryPanel、ResultPanel 等）。
- `src/renderer/src/hooks/`：自定义 Hook（useApiSettings、useExplainSession、useStudyLibrary、useCaptureFlow、useGuides、useDiagnostics、useConfirmDialog）。
- `src/renderer/src/i18n/`：国际化翻译文件（zh-CN、en）和类型定义，约 500 个消息键。
- `src/renderer/`：React 渲染层，负责工具栏、截图状态、结果面板、设置面板、公告、设置向导、暗色模式、国际化、错题仪表盘和用户交互。
- `src/shared/`：主进程、preload、渲染层共享的类型、IPC 名称和纯函数。
- `server/`：本地代理、公告服务、API 转发和 ngrok 托管脚本。
- `announcements/`：版本更新公告和私人公告数据。
- `tests/`：Vitest 单元测试。
- `docs/`：架构说明、发布清单和实施记录。
- `docs/decisions/`：长期架构、发布、安全和流程决策记录。
- `docs/templates/`：实施记录、发布检查、ADR 和用户可见变化模板。
- `.github/workflows/`：GitHub Actions 工作流，负责 PR/主分支验证、Windows 发布和 Release Notes 同步。
- `.github/dependabot.yml`：Dependabot 配置，按周检查 npm 和 GitHub Actions 依赖更新。
- `.editorconfig` / `.gitattributes`：约束编辑器格式和 Git 换行符归一化。

## 核心流程

1. 用户点击工具栏 `截图`，渲染层进入拖拽截图模式。
2. 用户拖出题目区域后，应用先进入待确认状态。
3. 用户点击 `确认识别` 后，渲染层通过 IPC 请求主进程裁剪屏幕区域。
4. 主进程按显示器和缩放比例裁剪截图；跨显示器框选会拆分为多个裁剪段并合成为一张 PNG data URL。
5. 默认模式直接把图片发送给当前第三方 API 服务商；OpenAI-compatible、Gemini 原生和 Anthropic 原生由主进程或代理服务按 provider 类型转换请求格式。
6. 本地 OCR 模式会先展示可编辑识别文本；用户确认后才发送文本讲解请求。
7. 讲解成功后创建本题内存会话，后续追问只发送题目上下文、历史问答和新问题，不重新发送截图。
8. 讲解成功后，渲染层把本题保存到学习库；主进程可异步提取学科、知识点、题型、难度、关键点、易错点、标签和摘要，失败时静默降级。
9. 结果面板底部可以复制或导出当前题目的答案记录，也可以标记复习反馈；学习库可批量导出 Markdown、Anki CSV 或 Obsidian Markdown。

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

## 学习库、评测与导出

学习库数据保存在渲染层版本化 `localStorage` 中，只包含文字会话、非敏感设置摘要、复习状态和结构化学习信息。学习项包含复习次数、答对/答错次数、下次复习时间、难度、易错原因、学科、标签和可选 metadata。新学习库存储不存在时会读取旧版本地历史；如果新存储损坏，也会回退旧历史，避免直接显示空学习库。

结构化信息提取通过主进程或代理服务复用当前 provider 文本请求链路完成。渲染层只发送当前题目的文字会话；模型返回 JSON 后会经过白名单字段解析、长度限制和标签去重，解析失败不会影响原始学习记录。

模型 / Prompt 评测面板复用 OCR 文本讲解请求链路，用同一段题目文本对比多个模型和 Prompt 模板，并把耗时、输出长度、成功/失败、输出内容和用户评分保存在本地评测历史中。前端一次最多提交 20 组评测，并通过 `cancelRequest` 取消正在运行的评测；取消时保留已经完成的结果。

答案导出和学习库批量导出均由 `src/shared/exportConversation.ts` 生成内容，主进程只负责保存文件。学习库批量导出支持单文件 Markdown、Anki CSV 和 Obsidian 多文件 Markdown，仍不包含截图、API Key、代理 Token 或代理服务地址。

## IPC 边界

渲染层不直接读取文件系统、环境变量或 API Key。需要主进程能力时，通过 `src/shared/ipc.ts` 中定义的 IPC 通道和 `src/preload/index.ts` 暴露的受控 API 完成。

关键 IPC 请求会先经过 `src/shared/validators.ts` 的 runtime 校验，再进入主进程业务逻辑。当前已覆盖截图讲解、区域 OCR、OCR 文本讲解、追问、模型列表、诊断、结构化学习信息提取、模型 / Prompt 评测、取消请求、结束本题、代理 Token 保存、公告/代理 URL、单题导出和学习库批量导出，校验内容包括必填字段、枚举值、URL 协议、区域尺寸、字符串长度和数组长度。

当前主进程能力包括：

- 截图裁剪与 OCR。
- API 请求和追问。
- 设置、服务商、模型列表和连接模式。
- 一键诊断。
- 答案复制、单题 Markdown 导出和学习库批量导出。
- 结构化学习信息提取。
- 模型 / Prompt 对比评测。
- 学习数据备份导出（JSON 文件保存对话框）和备份导入（JSON 文件打开对话框 + 格式校验）。
- 自动更新。

## 暗色模式与国际化

暗色模式通过 `src/renderer/src/useTheme.ts` hook 实现，监听 `settings.theme`（`'light' | 'dark' | 'system'`）和 `prefers-color-scheme` 媒体查询，设置 `document.documentElement.dataset.theme`。CSS 全面使用语义化变量（`--color-bg-*`、`--color-text-*`、`--color-btn-*` 等），`[data-theme="dark"]` 覆写暗色值。

国际化基础设施位于 `src/renderer/src/i18n/`：`LocaleContext` 提供当前语言，`useTranslation()` hook 返回 `t(key, params?)` 函数，支持 `{param}` 插值；非组件 Hook 或 `App.tsx` 中需要按设置语言取文案时使用 `translateMessage(locale, key, params?)`。翻译文件位于 `zh-CN.ts` 和 `en.ts`，定义约 500 个消息键，覆盖核心操作界面、提示、状态和导出反馈。历史版本向导内容位于 `src/renderer/src/guides.ts`，作为版本内容源按中文维护。

## 渲染层 Hook 架构

`App.tsx` 通过自定义 Hook 拆分状态和业务逻辑，主文件仅保留布局编排和组合：

| Hook 文件 | 职责 |
| --- | --- |
| `hooks/useApiSettings.ts` | API 连接模式、服务商、模型列表、代理验证 |
| `hooks/useExplainSession.ts` | 截图讲解、OCR 发送、追问、流式请求管理 |
| `hooks/useStudyLibrary.ts` | 学习库 CRUD、自动保存、备份导入导出 |
| `hooks/useCaptureFlow.ts` | 截图模式状态切换、区域确认 |
| `hooks/useGuides.ts` | 功能向导显隐控制 |
| `hooks/useDiagnostics.ts` | 一键诊断状态管理 |
| `hooks/useConfirmDialog.ts` | 确认弹窗（退出、删除、清空） |

其余已有 Hook：`useAnnouncements`（公告订阅）、`usePointerInteractions`（鼠标穿透和拖动）、`useUpdateStatus`（自动更新状态）、`useTheme`（暗色模式）。

## 错题统计仪表盘

`src/renderer/src/components/DashboardPanel.tsx` 提供统计可视化，纯 CSS + SVG 实现（无外部图表库）：

- 统计卡片：总数、待复习、错题数、掌握率。
- 学科雷达图：SVG polygon，按学科分布绘制。
- 知识点/易错点柱形图：CSS 水平柱形图，按频次排序。

数据来源为 `studyLibrary.ts` 的 `studyDashboardStats()` 函数。

## 学习数据备份与恢复

备份格式定义在 `src/shared/types.ts` 的 `StudyLibraryBackup` 接口，版本号固定为 `1`。

IPC 通道：
- `tutor:export-study-backup`：接收 `StudyLibraryBackup` 对象，通过 `dialog.showSaveDialog` 保存 JSON 文件。
- `tutor:import-study-backup`：通过 `dialog.showOpenDialog` 选择 JSON 文件，校验格式后返回 `StudyLibraryBackup`。

渲染层 `studyLibrary.ts` 提供 `mergeStudyItems(local, imported, strategy)` 函数，支持三种合并策略：
- `replace`：用导入数据完全替换本地。
- `merge-prefer-imported`：按 ID 合并，冲突时保留导入数据。
- `merge-prefer-local`：按 ID 合并，冲突时保留本地数据。

## 隐私与安全约定

- 默认只裁剪用户确认后的框选区域，不上传整屏。
- API Key 只在主进程或代理服务端读取和使用，不回填到设置界面。
- 渲染层 `localStorage` 只保存非敏感设置，例如连接模式、模型名、代理地址和 OCR 选项；API Key 和代理 Token 不进入普通 `localStorage`。
- 代理 Token 可以保存在用户本机主进程安全存储路径中，但不会写入导出 Markdown。
- 诊断报告必须脱敏，不能输出 API Key、代理 Token、ngrok Token 或完整敏感请求头；诊断中包含安全边界检查项。
- 答案渲染不信任模型输出中的 HTML 或公式源码。普通文本由 React 转义；KaTeX 使用 `trust: false`，并移除辅助 annotation 中的原始 TeX，遇到 `javascript:`、`data:`、`vbscript:` 等危险协议时不会把原始公式放入 tooltip。
- `npm run security:check` 检查渲染层持久化白名单、BrowserWindow 安全选项和导出隐私边界，GitHub Actions 发布流程也会运行该检查。
- Renderer HTML 带有基础 CSP；BrowserWindow 保持 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false` 和 `webSecurity: true`，preload 只暴露受控 IPC API。
- 文档和公告不得包含真实密钥、Token 或个人账号凭据。

## 发布链路

Windows 正式发布通过 GitHub Actions 完成，不在本机手动发布 GitHub Release。

- `.github/workflows/ci.yml`：PR 和 `main` 推送时运行文档检查、类型检查、Lint、测试、安全边界检查、脚本语法检查和构建。
- `.github/workflows/release-windows.yml`：推送 release tag 时运行，并先校验 tag 必须是 `vX.Y.Z`；通过后执行依赖安装、文档检查、类型检查、Lint、测试、安全边界检查、脚本语法检查和 `npm run publish:win`。脚本语法检查覆盖 `server/proxy-server.mjs`、`server/ngrok-dev.mjs`、`server/runtime-env.mjs` 和 `scripts/sync-release-notes.mjs`。
- `.github/workflows/sync-release-notes.yml`：当 `RELEASE_NOTES.md`、同步脚本或工作流变化时，把 `RELEASE_NOTES.md` 中的版本说明同步到已有 GitHub Release。
- `scripts/sync-release-notes.mjs`：从 `RELEASE_NOTES.md` 读取对应 tag 的说明，并写入 GitHub Release body。
- `npm run dist`：只用于 GitHub Actions 发布成功后同步本地 `release/` 产物。

发布权限使用仓库自带 `GITHUB_TOKEN`；`GH_TOKEN` 只是 electron-builder 的兼容变量，不需要 Personal Access Token。

## 文档地图

- `docs/START_HERE.md`：新账号、新对话或新 Codex 会话接手项目时的唯一入口。
- `README.md`：快速使用、基础配置、验证和文档入口。
- `CONTRIBUTING.md`：贡献指南（环境要求、代码规范、PR 流程、文档同步）。
- `LICENSE`：MIT 许可证。
- `.env.example`：环境变量配置模板，包含客户端、代理服务和 AI Provider 示例。
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
- `docs/decisions/`：架构决策记录（含 Hook 架构拆分、GitHub Actions 发布、敏感配置边界、向导更新策略、代理安全边界）。
- `docs/templates/`：常用文档模板。
- `.github/workflows/`：CI、Windows 发布和 Release Notes 同步工作流。
- `.github/pull_request_template.md`：PR 模板。
- `.github/dependabot.yml`：Dependabot 依赖更新配置。
- `announcements/releases.json`：可推送给客户端的版本更新公告。
