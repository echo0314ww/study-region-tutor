# Study Region Tutor

Study Region Tutor 是一个 Electron + React + TypeScript 桌面学习辅助应用。用户点击顶部工具栏的“截图”后，拖拽框选题目区域，确认后应用会裁剪截图、识别内容，并生成学习性讲解。

项目面向学习场景，不用于考试作弊。应用不会隐藏窗口、绕过监控、自动提交答案、自动点击网页或规避检测。默认提示词要求模型给出思路、步骤和关键概念；遇到正式考试、竞赛、测验或受限制平台时，只提供学习性讲解和建议。

## 快速开始

```bash
npm install
npm run dev
```

开发模式启动后默认只显示顶部工具栏。常用入口：

- `截图`：进入拖拽截图模式，框选后先确认，点击“确认识别”后才开始识别讲解。
- `停止`：识别或追问过程中取消当前请求。
- `对话`：显示或隐藏结果/追问面板。
- `公告`：显示公告面板。
- `设置`：配置连接模式、服务商、模型、OCR 和向导。
- `退出应用`：确认后退出。

如果要同时准备代理、ngrok 和应用开发服务的三个 PowerShell 标签页：

```bash
npm run dev:tabs
```

该脚本只打开标签页，不会自动运行 npm 命令。

## 文档入口

新账号、新对话或新 Codex 会话先读：

- `docs/START_HERE.md`：唯一接手入口，包含任务到文档映射和硬性约束。
- `PROJECT_CONTEXT.md`：当前版本、已完成能力、当前约束和最近风险。
- `docs/architecture.md`：模块边界、核心流程、IPC、隐私与安全约定。
- `docs/documentation-policy.md`：文档更新矩阵、版本材料分工和校验要求。

专题文档：

- `docs/release.md`：发布流程。
- `docs/proxy.md`：代理服务、ngrok、Token、限流和排障。
- `docs/provider-config.md`：OpenAI-compatible、Gemini、Anthropic provider 配置。
- `docs/announcements.md`：公告文件、版本公告和客户端展示规则。
- `docs/release-checklist.md`：功能完成和发布前检查清单。
- `docs/codex-handoff.md`：Codex 接手和协作规范。
- `docs/proxy-config.example.env`：代理和 provider 配置模板，不含真实密钥。

Windows PowerShell 查看中文文档时，优先使用：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/read-utf8.ps1 docs/START_HERE.md
```

## API 连接模式

应用支持两种连接模式：

- 本地直连：第三方 API 配置保存在用户机器配置目录或环境变量中。
- 代理服务：用户端只填写代理地址和代理 Token；第三方 API Key 保留在维护者机器或服务器。

打包应用读取：

```text
%APPDATA%\study-region-tutor\.env.local
%APPDATA%\study-region-tutor\.env
```

开发运行时还会读取项目根目录 `.env.local` / `.env`。同名字段优先级为：

1. 命令行/系统环境变量
2. `.env.local`
3. `.env`

基础 provider 示例：

```text
AI_BASE_URL=https://api.example.com/v1
AI_API_MODE=responses
AI_API_TYPE=openai-compatible
AI_API_KEY=你的第三方 API Key
```

`AI_API_TYPE` 可选 `openai-compatible`、`gemini`、`anthropic`。多 provider、Makelove、Gemini 原生和 Anthropic 原生示例见 `docs/provider-config.md`。

## 设置与向导

设置页可配置：

- API 连接模式
- API 服务商
- 模型名，支持模型列表刷新和手动填写
- 思考程度，按当前 provider 和模型动态显示可用档位
- 输入方式，默认直接发送图片
- OCR 语言和数学公式增强
- OCR 预处理模式
- 输出语言
- 是否只讲思路

设置页顶部提供三类向导：

- 整体功能向导
- 本版本新增向导
- 历史版本向导回顾

应用版本变化后首次打开会先显示整体功能向导，再显示当前版本新增向导。用户可以跳过，也可以随时从设置页重新查看。每次版本发布前必须确认这三类向导是否需要更新。

设置页还提供“一键诊断”。诊断会检查连接模式、配置文件、代理地址、代理 Token、API 服务商、模型列表、当前模型和安全边界，并输出可复制的脱敏报告。

## 截图、OCR 与追问

默认流程：

1. 用户拖拽框选题目区域。
2. 应用先展示待确认区域。
3. 用户点击“确认识别”。
4. 主进程按显示器和缩放比例裁剪截图；跨显示器框选会拆分裁剪并合成为完整 PNG。
5. 默认直接把图片发送给当前第三方 API。
6. 图片请求失败时，自动退回本地 OCR，并先展示可编辑 OCR 结果确认页。
7. 用户确认 OCR 文本后，才发送文本讲解请求。

每次讲解成功后，应用会为当前题目创建内存会话。后续追问只发送题目上下文、已有问答历史和新问题，不重新发送原始截图。关闭应用或结束本题后，会话即清除。

结果面板支持：

- 发送追问
- 截图下一题
- 结束本题
- 跳到底部
- 复制答案
- 导出答案

复制和导出的答案为 Markdown 文本记录，默认不包含截图、API Key、代理 Token 或代理地址。

## 学习库与复习

讲解成功后，应用会自动把当前题加入学习库。学习库支持：

- 按标题、讲解、标签、知识点、题型和易错点搜索。
- 按学科、掌握状态、收藏、今日待复习和错题筛选。
- 记录复习次数、答对/答错次数、下次复习时间、难度和易错原因。
- 对当前题标记“答错了”“有点忘”“答对了”或“很熟练”，并自动安排下次复习。
- 批量导出当前筛选结果为 Markdown、Anki CSV 或 Obsidian Markdown。

讲解完成后，应用会异步提取学科、知识点、题型、难度、关键点、易错点、标签和摘要。提取失败不会影响当前讲解或追问。

设置页还提供“模型评测”，可用同一道 OCR 文本比较多个模型和 Prompt 模板，记录耗时、输出长度、成功/失败和主观评分。

## 隐私与安全

- 默认只裁剪用户确认后的框选区域，不上传整屏。
- API Key 只在主进程或代理服务端读取和使用，不回填设置界面。
- 渲染层 `localStorage` 只保存非敏感设置，例如连接模式、模型名、代理地址和 OCR 选项。
- API Key、代理 Token、ngrok Token 不进入普通 `localStorage`、导出文件、公告或文档示例真实值。
- 诊断报告必须脱敏。
- 学习库和批量导出只包含文字记录、复习状态和结构化学习信息，不包含截图或敏感配置。
- 公告接口公开，不需要 Token；API 代理接口必须需要 Token。

## 验证

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

也可以运行：

```bash
npm run validate
```

当前 Windows Codex 环境中，`npm run test`、`npm run build`、`npm run dist` 偶尔会因为 esbuild `spawn EPERM` 失败；提升权限重跑通常可以通过。

## 打包与发布

本地打包：

```bash
npm run dist
```

正式发布统一走 GitHub Actions，不在本机手动发布 GitHub Release。推送 `vX.Y.Z` tag 后，`.github/workflows/release-windows.yml` 会运行文档检查、类型检查、Lint、测试、安全边界检查和 `npm run publish:win`，并用仓库自带 `GITHUB_TOKEN` 发布 Windows 安装包。

发布步骤和发布后本地 `release/` 同步要求见 `docs/release.md`。

## macOS 屏幕录制权限

如果 macOS 截图失败，请打开：

```text
系统设置 > 隐私与安全性 > 屏幕录制
```

给本应用授权后重启应用。开发模式下，可能需要给 Terminal、iTerm、VS Code 或当前启动 Electron 的宿主程序授权。
