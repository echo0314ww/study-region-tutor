# 项目上下文备忘

这个文档用于在新对话中快速恢复上下文。它记录的是开发协作、发布流程和当前系统约定，不面向普通用户展示。

## 项目定位

- 项目名：Study Region Tutor。
- 技术栈：Electron + React + TypeScript。
- 用途：学习辅助工具，支持框选屏幕区域、截图、识别题目并给出学习性讲解。
- 安全边界：不要实现隐藏窗口、绕过监控、自动提交答案、自动点击网页、规避检测等考试作弊能力。
- 默认提示词应强调“思路、步骤、关键概念”，不要只输出最终答案；遇到正式考试、竞赛、测验或受限制平台时，只给学习性讲解和建议。

## 当前版本与发布

- 当前版本：`1.0.0`。
- GitHub 仓库：`echo0314ww/study-region-tutor`。
- Windows 发布通过 GitHub Actions 完成，不使用 Personal Access Token。
- 发布工作流使用仓库自带 `GITHUB_TOKEN`；`GH_TOKEN` 只作为 electron-builder 兼容变量指向同一个仓库 token。
- 推送 tag `vX.Y.Z` 会触发 `.github/workflows/release-windows.yml`，构建并发布 Windows 安装包。
- Windows 自动更新只自动检查，不自动下载或安装；发现新版本后设置页显示“立即更新”，用户点击后才下载，下载完成后再点击“重启安装”。
- Release 页面说明来自 `RELEASE_NOTES.md`。
- `.github/workflows/release-windows.yml` 在发布完成后会运行 `scripts/sync-release-notes.mjs`，把 `RELEASE_NOTES.md` 中对应 tag 的说明同步到 GitHub Release body。
- `.github/workflows/sync-release-notes.yml` 也会在 `RELEASE_NOTES.md` 更新后同步已有 release 说明。

常用发布流程：

```bash
git status
git add 需要发布的文件
git commit -m "Release vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main vX.Y.Z
```

发布前应至少验证：

```bash
npm run typecheck
npm run lint
npm run test
npm run build
node --check server/proxy-server.mjs
node --check server/ngrok-dev.mjs
node --check scripts/sync-release-notes.mjs
```

在当前 Codex 环境里，`npm run test` 和 `npm run build` 偶尔会因为 esbuild `spawn EPERM` 失败，需要用提升权限重跑。

## 文档分工

- `README.md`：给开发者和使用者看的运行、配置、代理、ngrok、公告、发布说明。
- `CHANGELOG.md`：给开发者看的详细版本记录。
- `RELEASE_NOTES.md`：给普通用户看的简短版本说明，会同步到 GitHub Releases。
- `PROJECT_CONTEXT.md`：给下一次 Codex 对话恢复上下文用。
- `scripts/read-utf8.ps1`：Windows PowerShell 下按 UTF-8 读取中文文档，避免默认编码导致乱码。

Windows PowerShell 查看中文文档时，优先使用：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/read-utf8.ps1 README.md
```

## API 与代理模式

项目支持两种 API 连接模式：

- 本地直连：应用读取本机 `.env.local`、`.env` 或环境变量中的第三方 API 配置。
- 代理服务：用户端只填写代理访问 Token；第三方 API Key 保留在开发者电脑或代理服务端，不下发给用户。

重要约定：

- `.env.local` 不提交仓库，里面保存第三方 API Key、代理 Token、ngrok Token 等敏感配置。
- API 代理请求需要 `Authorization: Bearer <TUTOR_PROXY_TOKEN>`。
- 公告接口不需要 Token。
- 用户只填写 `TUTOR_PROXY_TOKEN` 即可使用 API 代理；不需要知道第三方 API Key。
- 用户端首次填写 `TUTOR_PROXY_TOKEN` 并成功刷新代理服务商后，会在本机保存代理 Token；后续可留空使用已保存 Token。保存优先使用 Electron `safeStorage`，鉴权失败时清除旧 Token 并要求重新填写。
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
- 顶部工具栏包含截图、识别并讲解、对话、公告、设置、退出应用等入口。
- 点击截图按钮后显示可拖动、可缩放的截图框。
- 识别和讲解过程中隐藏截图框。
- 结果窗口、设置窗口和顶部工具栏外的透明区域应尽量点击穿透，不阻挡底层网页或桌面。
- 结果窗口支持拖动和调整大小。
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

## 当前本地状态提醒

- `1.0.0` 发布材料已准备：版本号、更新记录、Release Notes 和版本更新公告已同步。
- `announcements/releases.json` 当前可见版本公告为 `release-v1.0.0`。
- 推送 tag `v1.0.0` 后，GitHub Actions 会使用仓库自带 `GITHUB_TOKEN` 构建并发布 Windows 安装包。
- 根目录曾出现未跟踪文件 `image/CHANGELOG/1778343915388.png`，创建时间为 `2026/5/10 00:25:15`，未纳入发布。
- 不要把 `.env.local`、API Key、代理 Token、ngrok Token 提交到仓库。

## 下次继续开发时优先检查

```bash
git status --short --branch
npm run typecheck
npm run lint
```

如果要发布新版本，先更新：

- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `RELEASE_NOTES.md`

然后提交、打 tag、推送，让 GitHub Actions 自动发布。
