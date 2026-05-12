# 项目上下文备忘

这个文档用于在新对话中快速恢复上下文。它记录的是开发协作、发布流程和当前系统约定，不面向普通用户展示。

## 项目定位

- 项目名：Study Region Tutor。
- 技术栈：Electron + React + TypeScript。
- 用途：学习辅助工具，支持框选屏幕区域、截图、识别题目并给出学习性讲解。
- 安全边界：不要实现隐藏窗口、绕过监控、自动提交答案、自动点击网页、规避检测等考试作弊能力。
- 默认提示词应强调“思路、步骤、关键概念”，不要只输出最终答案；遇到正式考试、竞赛、测验或受限制平台时，只给学习性讲解和建议。

## 当前版本与发布

- 当前版本：`1.1.0`。
- GitHub 仓库：`echo0314ww/study-region-tutor`。
- Windows 发布通过 GitHub Actions 完成，不使用 Personal Access Token。
- 发布工作流使用仓库自带 `GITHUB_TOKEN`；`GH_TOKEN` 只作为 electron-builder 兼容变量指向同一个仓库 token。
- 推送 tag `vX.Y.Z` 会触发 `.github/workflows/release-windows.yml`，先运行 `npm run docs:check`、类型检查、Lint 和测试，再构建并发布 Windows 安装包。
- Windows 自动更新只自动检查，不自动下载或安装；发现新版本后设置页显示“立即更新”，用户点击后才下载，下载完成后再点击“重启安装”。
- Release 页面说明来自 `RELEASE_NOTES.md`。
- `.github/workflows/release-windows.yml` 在发布完成后会运行 `scripts/sync-release-notes.mjs`，把 `RELEASE_NOTES.md` 中对应 tag 的说明同步到 GitHub Release body。
- `.github/workflows/sync-release-notes.yml` 也会在 `RELEASE_NOTES.md` 更新后同步已有 release 说明。
- 每次正式发布新版本后，还要同步更新本地 `release/` 文件夹：删除旧版本安装包、旧 `.blockmap` 和旧 `latest.yml`，运行 `npm run dist` 重新生成当前版本产物，并确认 `release/latest.yml` 的 `version`、`path` 指向本次版本。

常用发布流程：

```bash
git status
git add 需要发布的文件
git commit -m "Release vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main vX.Y.Z
npm run dist
```

发布前应至少验证：

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

在当前 Codex 环境里，`npm run test` 和 `npm run build` 偶尔会因为 esbuild `spawn EPERM` 失败，需要用提升权限重跑。
`npm run dist` 也可能遇到同类限制；如果本地打包失败且报 `spawn EPERM`，用提升权限重跑。打包完成后检查 `release/`，只保留最新版本的安装包、`.blockmap`、`latest.yml` 和 `win-unpacked`。

## 文档分工

- `README.md`：给开发者和使用者看的运行、配置、代理、ngrok、公告、发布说明。
- `CHANGELOG.md`：给开发者看的详细版本记录。
- `RELEASE_NOTES.md`：给普通用户看的简短版本说明，会同步到 GitHub Releases。
- `PROJECT_CONTEXT.md`：给下一次 Codex 对话恢复上下文用。
- `docs/codex-handoff.md`：给新账号、新对话或新 Codex 会话接手项目时使用；进入项目后应优先阅读。
- `docs/architecture.md`：给维护者看的架构边界、目录职责、核心流程和文档地图。
- `docs/release-checklist.md`：功能完成和发布前的检查清单。
- `docs/dev-log/YYYY-MM-DD.md`：重要实施过程记录；不要再在根目录新建日期文件夹。
- `.editorconfig`：统一 UTF-8、换行符、缩进和 Markdown 尾随空格策略。
- `.gitattributes`：统一 Git 换行符归一化；源码和文档使用 LF，Windows 脚本使用 CRLF。
- `scripts/read-utf8.ps1`：Windows PowerShell 下按 UTF-8 读取中文文档，避免默认编码导致乱码。
- `scripts/check-docs.mjs`：检查版本号、发布说明、版本公告和文档结构是否一致，对应 `npm run docs:check`。
- 每次完成功能改进、体验优化、升级或扩展后，都要同步更新相关文档；至少检查 `CHANGELOG.md`、`RELEASE_NOTES.md`、`README.md` 和 `PROJECT_CONTEXT.md` 是否需要记录本次变化。若变化涉及版本公告或发布，还要同步 `announcements/releases.json`。提交前优先运行 `npm run docs:check`。

Windows PowerShell 查看中文文档时，优先使用：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/read-utf8.ps1 README.md
```

## API 与代理模式

项目支持两种 API 连接模式：

- 本地直连：打包应用读取用户配置目录 `%APPDATA%\study-region-tutor\.env.local`、同目录 `.env` 或环境变量中的第三方 API 配置；开发运行时额外优先读取项目根目录 `.env.local` / `.env`。
- 代理服务：用户端只填写代理访问 Token；第三方 API Key 保留在开发者电脑或代理服务端，不下发给用户。

重要约定：

- 项目根目录 `.env.local` 不提交仓库，里面保存第三方 API Key、代理 Token、ngrok Token 等敏感配置；用户本地直连配置放在 `%APPDATA%\study-region-tutor\.env.local`。
- API 代理请求需要 `Authorization: Bearer <TUTOR_PROXY_TOKEN>`。
- 公告接口不需要 Token。
- 用户只填写 `TUTOR_PROXY_TOKEN` 即可使用 API 代理；不需要知道第三方 API Key。
- 用户端首次填写 `TUTOR_PROXY_TOKEN` 并成功刷新代理服务商后，会在本机保存代理 Token；后续可留空使用已保存 Token。保存优先使用 Electron `safeStorage`，鉴权失败时清除旧 Token 并要求重新填写。
- 本地直连配置缺失或模型列表刷新失败时，设置页只显示应用更新、API 连接模式和本地直连配置指引，隐藏后续 API/OCR 设置；配置指引应显示当前用户实际 `.env.local` 路径，例如 `C:\Users\用户名\AppData\Roaming\study-region-tutor\.env.local`，不要只显示 `%APPDATA%` 占位符。
- 如果使用内置默认代理地址，普通设置页不显示远程服务地址输入框，只显示连接状态。
- 高级设置是独立调试视图，只保留：代理服务地址输入框、验证是否连接成功、恢复默认地址、验证结果提示。

常见 `.env.local` 字段：

```env
TUTOR_PROXY_PORT=8787
TUTOR_PROXY_TOKEN=一段足够长的随机字符串
NGROK_AUTHTOKEN=你的 ngrok token
TUTOR_PUBLIC_PROXY_URL=https://xxxx.ngrok-free.app
```

`TUTOR_PUBLIC_PROXY_URL` 可以由 `npm run ngrok:dev` 自动写回 `.env.local`。

## ngrok 使用方式

本地给用户提供公网代理时，需要同时保持两个命令运行：

```bash
npm run proxy:dev
npm run ngrok:dev
```

- 本地调试需要同时准备 `proxy:dev`、`ngrok:dev` 和 `dev` 三个 PowerShell 标签页时，可以运行 `npm run dev:tabs` 或双击根目录 `open-dev-tabs.bat`。该脚本只打开同一个 Windows Terminal 窗口中的三个标签页，并让它们进入项目根目录；不会自动运行 npm 命令。
- `proxy:dev`：启动本地代理、公告服务和 API 转发服务。
- `ngrok:dev`：启动 ngrok 隧道，读取 `.env.local` 中的 `NGROK_AUTHTOKEN` 和 `TUTOR_PROXY_PORT`，并把公网地址写回 `TUTOR_PUBLIC_PROXY_URL`。
- 如果 `NGROK_AUTHTOKEN` 或端口变化，`ngrok:dev` 会自动重启隧道。
- 如果用户无法连接，优先检查 `proxy:dev`、`ngrok:dev` 是否仍在运行，以及 Windows 防火墙是否允许 Node.js 入站。

## 公告功能

- 公告复用 `proxy:dev` 服务。
- 公告文件分工：`announcements/releases.json` 用于版本更新公告，`announcements/current.json` 用于私人公告。
- `proxy:dev` 默认先读取版本更新公告，再读取私人公告，并合并两个文件中可见公告；版本公告排在私人公告前面。
- 支持 `allAnnouncement` + `announcements` 格式。
- `allAnnouncement` 用于指定实际展示哪些公告 ID，以及展示顺序。
- `level` 是可选公告标签，可填写任意文本或留空；留空时客户端只显示发布时间，不做默认兜底。`warning` 和 `critical` 仍会触发公告面板强调样式。
- 版本公告 ID 推荐使用 `release-vX.Y.Z`，每次发版时把新版本 ID 放到 `announcements/releases.json` 的 `allAnnouncement` 第一位。
- 客户端会把 `release-` 开头的版本公告默认折叠，点击标题后展开详情；私人公告默认直接展示正文。
- 公告不会自动弹出；服务端会根据合并后的可见公告内容生成 `revision` 哈希，客户端只在该哈希与本机已读记录不一致时显示红点，打开公告面板后标记当前哈希为已读。
- 公告接口公开，不需要 Token。
- 客户端连接公告前会先检测代理 `/health`，默认代理离线时不会刷屏报错，而是后台定时重试。

示例结构：

```json
{
  "allAnnouncement": ["welcome-001", "welcome-005"],
  "announcements": [
    {
      "id": "welcome-001",
      "title": "系统公告",
      "content": "公告内容",
      "level": "info",
      "publishedAt": "2026-05-09T20:00:00+08:00"
    }
  ]
}
```

## UI 当前约定

- 应用启动后默认只显示顶部工具栏。
- 顶部工具栏包含截图、对话、公告、设置、退出应用等入口；识别或追问进行中会显示识别状态和停止按钮。
- 顶部工具栏可通过左侧拖动手柄移动；设置面板可通过标题栏拖动。位置只在本次运行期间保留，不写入本地存储。
- 渲染层已按职责拆分：`App.tsx` 保留主流程编排，面板 UI 放在 `src/renderer/src/components/`，公告连接状态在 `useAnnouncements`，鼠标穿透/拖动逻辑在 `usePointerInteractions`。
- 点击截图按钮后进入拖拽截图模式：显示全屏十字光标覆盖层，按住拖拽框选题目，松开后先进入待确认状态；工具栏显示“确认识别”和“重选截图”，点击“确认识别”后才调用识别/讲解。
- 拖拽中单击、右键或 Esc 取消本次截图；待确认状态下右键或 Esc 取消。
- 确认识别后隐藏拖拽截图层并显示结果窗口。
- 点击“截图下一题”或“结束本题”后，会结束/清空当前题目会话、隐藏结果窗口并进入拖拽截图模式；下一题框选并确认识别后，结果窗口再重新显示。
- 本地 OCR 模式和图片接口失败后的 OCR 兜底都会先进入“可编辑 OCR 结果确认”状态；用户点击“发送讲解”前，不会把 OCR 文本发送给第三方 API，也不会创建题目会话。
- 流式回答一旦出现正文，就要立即隐藏结果窗口里的可见处理过程；`latestProgressTextRef` 仍保留最近处理过程，失败时可拼到错误信息里用于排查。
- 结果窗口、设置窗口和顶部工具栏外的透明区域应尽量点击穿透，不阻挡底层网页或桌面；启动、窗口聚焦和页面恢复可见时要主动同步鼠标穿透状态，避免必须先点工具栏一次。
- 结果窗口支持拖动和调整大小。
- 结果内容可滚动且当前不在底部时，右下角显示“跳到底部”按钮，点击后直接滚到回答末尾；到达底部后按钮隐藏。
- 本题追问历史中，用户消息右对齐并使用轻量气泡样式；助手讲解保持左侧文档式排版，不压缩长答案阅读宽度。
- 结果窗口使用 KaTeX 渲染标准 LaTeX；提示词要求模型直接用 `\(...\)` / `\[...\]` 输出公式，不再写“补充 LaTeX:”或扁平公式文本。独占一行的行内公式会提升为块级显示，紧邻 LaTeX 的重复扁平公式会被隐藏；`x²/16 + y²/12 = 1`、`4√7/7` 等常见扁平公式会尽量转换成 LaTeX 后渲染；渲染失败时才退回普通可读文本。
- 设置面板不再展示不必要的 API Base URL 和 API Key 明细。
- 高级设置中代理验证提示文案当前要求：
  - 默认地址成功：`默认代理服务地址连接成功，可以返回普通设置选择 API 服务。`
  - 默认地址失败：`默认代理服务地址连接失败，请检查地址是否正确，或向开发者申请正确代理服务地址。`
  - 用户自填地址成功：`代理服务地址连接成功，可以返回普通设置选择 API 服务。`
  - 用户自填地址失败：提示检查地址或确认代理服务已启动。

## 模型选择

- 设置页的“刷新模型列表”会向当前 API 服务商请求 `/models`，将返回结果填入模型下拉框。
- 如果服务商 `/models` 不完整或不可用，可以选择“手动填写模型名”。
- 手动输入的模型名会作为 API 请求体里的 `model` 字段，用于图片讲解、OCR 文本讲解和追问。

## v1.1.0 已归档发布内容

- 设置页新增“一键诊断”：主进程通过 `src/main/diagnostics.ts` 检查当前连接模式、配置文件、代理地址、代理 Token、API 服务商、模型列表和当前模型，返回 `DiagnosticResult`。诊断报告必须给普通用户可执行的“可能原因”和“处理建议”，并只暴露脱敏技术细节。
- 设置向导框架已落地：`GuideKind` 支持 `product` 和 `release`；当前实现整体功能向导，版本新增向导保留入口和空态。应用版本变化后首次打开会自动显示整体功能向导，设置页顶部可重新打开两类向导。
- 结果面板新增复制/导出 Markdown：`src/shared/exportConversation.ts` 生成 Markdown，主进程 `src/main/exportConversation.ts` 使用保存对话框写入文件；默认不导出截图、API Key、代理 Token 或代理地址。
- 代理服务新增多 Token 与限流：旧 `TUTOR_PROXY_TOKEN` 继续作为 `default` 兼容；可用 `TUTOR_PROXY_TOKENS` + `TUTOR_PROXY_TOKEN_<ID>` 配置具名 Token，并用 `TUTOR_PROXY_RATE_LIMIT_PER_MINUTE` / `TUTOR_PROXY_RATE_LIMIT_BURST` 或单 Token 覆盖项启用限流。限流状态为内存级，按 token id + endpoint 计算。
- `/health` 现在额外返回 `tokenCount`、`rateLimitEnabled` 和 `providerCount`；客户端诊断会把这些信息作为代理健康技术细节展示。
- 文档管理规范化：新增 `.editorconfig`、`.gitattributes`、`docs/codex-handoff.md`、`docs/architecture.md`、`docs/release-checklist.md`、`scripts/check-docs.mjs` 和 `npm run docs:check`；实施记录迁移到 `docs/dev-log/2026-05-12.md`。
- GitHub Actions 发布工作流已接入 `npm run docs:check`，后续推送 tag 发布前会自动校验文档结构和版本公告一致性。

## 当前本地状态提醒

- `v1.0.2` 发布内容：OCR 结果确认页、图片失败后的 OCR 确认兜底、KaTeX 公式渲染、扁平公式转 LaTeX、提示词公式输出约束、工具栏/设置面板拖动、开发标签页脚本，以及 `App.tsx` 渲染层拆分。
- `v1.0.3` 发布内容：顶部“截图”改为拖拽截图模式，拖拽完成后先待确认，点击“确认识别”后才提交识别；点击“截图下一题”或“结束本题”后隐藏结果窗口并进入截图模式，下一题确认识别后再显示结果窗口；启动/聚焦/恢复可见时主动同步鼠标穿透状态；流式回答正文出现后立即隐藏可见处理过程；长回答支持一键跳到底部；用户追问右对齐显示。
- `v1.1.0` 发布内容：一键诊断、整体功能向导框架、Markdown 导出、代理服务多 Token/限流、Codex 接手文档、文档自检和 GitHub Actions 发布前文档检查。
- 当前 Unreleased 改动：暂无。
- 已新增文档维护约定和 `npm run docs:check`：以后每次完成功能改进、体验优化、升级或扩展后，都要同步检查并更新相关文档。
- `announcements/releases.json` 当前可见版本公告为 `release-v1.1.0`。
- `v1.1.0` 发布材料已同步到 `package.json`、`package-lock.json`、`CHANGELOG.md`、`RELEASE_NOTES.md`、`README.md`、`PROJECT_CONTEXT.md` 和版本公告。
- 推送 tag `v1.1.0` 后，GitHub Actions 会使用仓库自带 `GITHUB_TOKEN` 构建并发布 Windows 安装包。
- 发布流程统一走 GitHub Actions，不在本机手动发布 GitHub Release；本机只在 GitHub Actions 发布成功后运行 `npm run dist` 同步 `release/`。
- 发布完成后仍需同步本地 `release/` 文件夹，确认 `release/latest.yml` 和安装包都指向当前最新版本。
- 不要把 `.env.local`、API Key、代理 Token、ngrok Token 提交到仓库。

## 下次继续开发时优先检查

```bash
git status --short --branch
npm run docs:check
npm run typecheck
npm run lint
```

如果要发布新版本，先更新：

- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `RELEASE_NOTES.md`

然后提交、打 tag、推送，让 GitHub Actions 自动发布。发布完成后运行 `npm run dist` 更新本地 `release/`，并确认本地 `release/latest.yml` 和安装包都是最新版本。
