# Study Region Tutor

一个跨平台桌面学习辅助应用。你可以点击顶部工具栏的“截图”进入拖拽截图模式，按住并拖出题目区域，松开后先显示待确认区域；点击“确认识别”后，应用才会截取这次框选的区域并开始识别讲解。

默认流程是：

1. 本地截取拖拽框选区域。
2. 把截图转换为 PNG base64 data URL。
3. 直接把图片发送到你配置的第三方 API。

如果直接图片模式请求失败，应用会自动退回本地 OCR 文本模式，并先展示可编辑的 OCR 结果确认面板。你检查、修正公式或删掉无关文字后，点击“发送讲解”才会把确认后的文本发送给第三方文本接口。设置面板里仍保留“本地 OCR 后发文字”模式，适合服务商不稳定或不支持图片输入时手动切换；该模式同样会先预览 OCR 文本。

这个项目面向学习场景，不用于考试作弊。应用不会隐藏窗口、绕过监控、自动提交答案、自动点击网页或规避检测。默认提示词会要求模型给出思路、步骤和关键概念；如果截图看起来来自正式考试、竞赛、测验或受限制平台，模型会提示遵守规则，并只提供学习性讲解。

## 第三方 API 要求

默认直接发送图片模式下，服务商需要支持多模态图片输入。应用现在支持三类上游协议：

- Chat Completions 兼容：`POST /chat/completions`
- Responses 兼容：`POST /responses`
- Gemini 原生：`POST /models/{model}:generateContent`，流式输出使用 `:streamGenerateContent?alt=sse`
- Anthropic 原生：`POST /messages`
- 模型列表：OpenAI-compatible 和 Anthropic 默认请求 `GET /models`，Gemini 默认请求 `GET /models` 并读取 `models[].name`，用于启动时加载设置面板里的可选模型列表

如果 Base URL 是服务商根地址且 `/models` 返回网页，应用会自动再尝试 `GET /v1/models`。当前 `https://tcdmx.com` 的模型列表实测位于 `/v1/models`。

当前实现会拒绝 `api.openai.com` 这类 OpenAI 官方 API 地址，避免误配回官方接口。

当前配置推荐：

```text
AI_BASE_URL=https://tcdmx.com
AI_API_MODE=responses
AI_API_TYPE=openai-compatible
AI_API_KEY=你的第三方 API Key
```

`AI_API_TYPE` 可选值为 `openai-compatible`、`gemini`、`anthropic`；不填写时默认 `openai-compatible`。`AI_API_MODE` 只对 `openai-compatible` 生效，Gemini 和 Anthropic 会忽略它并使用各自原生接口。

## 安装依赖

```bash
npm install
```

## Windows PowerShell 中文文档显示

项目文档使用 UTF-8 编码。Windows PowerShell 直接 `Get-Content README.md` 时，如果终端编码不是 UTF-8，中文可能显示为乱码。可以使用项目提供的辅助脚本读取：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/read-utf8.ps1 README.md
```

也可以在当前 PowerShell 会话中临时指定 UTF-8 后再读取：

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Get-Content README.md -Encoding UTF8
```

## 文档管理

项目文档按读者和用途分工：

- `README.md`：运行、配置、代理、ngrok、公告、验证和发布说明。
- `CHANGELOG.md`：开发者视角的详细版本记录。
- `RELEASE_NOTES.md`：普通用户可读的版本说明，会同步到 GitHub Releases。
- `PROJECT_CONTEXT.md`：给下一次 Codex 对话或维护者恢复上下文。
- `docs/codex-handoff.md`：给新账号、新对话或新 Codex 会话接手项目时使用。
- `docs/architecture.md`：当前架构边界、目录职责和核心流程。
- `docs/release-checklist.md`：功能完成和发布前检查清单。
- `docs/proxy-config.example.env`：代理服务和多协议 API 服务商的 `.env.local` 示例模板，不包含真实密钥。
- `docs/dev-log/YYYY-MM-DD.md`：重要实施过程记录，不再在根目录新建日期文件夹。
- `.editorconfig` 和 `.gitattributes`：统一编辑器编码、缩进和 Git 换行符归一化，减少跨环境协作噪音。

每次完成功能改进、体验优化、升级或扩展后，都要同步检查相关文档。可以先运行：

```bash
npm run docs:check
```

`npm run validate` 也会包含这项检查。

## 配置第三方 API

第三方 API 的 Base URL 和 API Key 从用户配置目录里的 `.env.local`、`.env` 或环境变量读取，不在设置面板中明文填写。Windows 打包应用固定读取：

```text
%APPDATA%\study-region-tutor\.env.local
%APPDATA%\study-region-tutor\.env
```

通常展开后类似：

```text
C:\Users\你的用户名\AppData\Roaming\study-region-tutor\.env.local
```

设置面板里可以选择：

- API 服务商
- 接口模式：默认选 `使用当前 API 配置`
- 模型名：应用启动时会从第三方 API 获取可选模型列表，也可以点击刷新重新获取；如果服务商不支持模型列表，仍可手动填写
- 思考程度：按当前 API 服务商和模型动态显示可用档位；`使用模型默认` 表示不额外发送思考强度参数
- 输入方式：默认选 `直接发送图片`
- OCR 语言：默认选 `中文`
- 数学公式增强：默认开启，会对截图进行放大、灰度、二值化，并额外跑一条英文/公式优先 OCR 候选
- 输出语言
- 是否只讲思路

设置面板顶部提供“整体功能向导”和“本版本新增向导”入口。应用版本变化后首次打开会自动显示整体功能向导；用户可以跳过，也可以随时回到设置页重新查看。本版本新增向导的接口已经预留，当前版本暂无单独新增步骤。

设置面板还提供“一键诊断”。诊断会按步骤检查当前连接模式、配置文件、代理地址、代理 Token、API 服务商、模型列表和当前模型，并输出可复制的脱敏报告。每个失败项都会包含“可能原因”和“处理建议”，方便普通用户按提示修复，或把报告发给维护者排查。

思考程度不会再固定使用同一组选项。OpenAI-compatible 会映射到 `reasoning_effort` 或 Responses API 的 `reasoning.effort`，常见档位为 `minimal`、`low`、`medium`、`high`、`xhigh`。Claude / Anthropic 会按模型显示档位：Opus 4.6、Sonnet 4.6 和 Mythos 支持 `max`，Opus 4.7 额外支持 `xhigh`；请求层会优先使用 `thinking: { type: "adaptive" }` 和 `output_config.effort`，旧模型则回退到 `thinking.budget_tokens` 映射。Gemini 3 使用 `thinkingLevel`，Gemini 2.5 使用 `thinkingBudget`。主进程和代理服务都会再次归一化，避免把某个服务商不支持的档位直接发给上游。

也可以用环境变量提供连接配置。模型和思考程度不再从环境变量读取，请在设置面板中选择。

Windows PowerShell:

```powershell
$env:AI_BASE_URL="https://api.example.com/v1"
$env:AI_API_MODE="responses"
$env:AI_API_TYPE="openai-compatible"
$env:AI_API_KEY="你的第三方 API Key"
```

macOS / Linux:

```bash
export AI_BASE_URL="https://api.example.com/v1"
export AI_API_MODE="responses"
export AI_API_TYPE="openai-compatible"
export AI_API_KEY="你的第三方 API Key"
```

如果设置面板里填写了同名配置，会优先使用设置面板的值。

开发运行时，项目会优先读取项目根目录下的 `.env.local` 和 `.env`，再读取用户配置目录中的同名文件；打包后的应用只读取用户配置目录。环境变量优先级最高，会覆盖这些配置文件中的同名字段。项目根目录的 `.env.local` 已在 `.gitignore` 中，不会提交到仓库。
应用启动时只会把配置文件里的 Base URL 和接口模式落实到运行时设置里；API Key 只在主进程里使用，设置面板只显示是否已配置，不会回填或展示明文。

如果选择“本地直连”但本机配置缺失或模型列表刷新失败，设置页会隐藏后续 API 服务商、接口模式、模型和 OCR 等设置，只保留应用更新、API 连接模式和本地直连配置指引。指引会直接显示当前 Windows 用户实际应创建的 `.env.local` 路径，例如 `C:\Users\你的用户名\AppData\Roaming\study-region-tutor\.env.local`。按指引补好文件后，需要重启应用再使用本地直连。

## 本机局域网代理模式

如果你想让 1-2 个用户使用你本机 `.env.local` 里的第三方 API 配置，而不把 API Key 发给用户，可以在开发电脑上启动一个代理服务。用户端只配置代理地址和访问 Token，截图/OCR 仍在用户电脑本地完成，真正的第三方 API Key 只留在代理服务所在电脑。

在你的 `.env.local` 中继续保留 `AI_PROVIDERS`、`AI_DEFAULT_PROVIDER` 和各个 `AI_PROVIDER_*` 配置，并额外添加：

```text
TUTOR_PROXY_PORT=8787
TUTOR_PROXY_URL=http://127.0.0.1:8787
TUTOR_PROXY_TOKEN=换成一段足够长的随机字符串
# 可选：npm run ngrok:dev 会读取这一项并自动配置 ngrok
NGROK_AUTHTOKEN=你的 ngrok authtoken
# 自动生成：npm run ngrok:dev 检测到公网地址后会写入或更新这一行
TUTOR_PUBLIC_PROXY_URL=https://xxxx.ngrok-free.app
```

`TUTOR_PROXY_TOKEN` 仍然作为旧版单 Token 配置使用。需要给多个用户分发独立 Token 时，可以改用具名 Token，并按需开启限流：

```text
TUTOR_PROXY_TOKENS=student_a,student_b,guest,admin
TUTOR_PROXY_TOKEN_STUDENT_A=给 student_a 的长随机 Token
TUTOR_PROXY_TOKEN_STUDENT_B=给 student_b 的长随机 Token
TUTOR_PROXY_TOKEN_GUEST=给 guest 的长随机 Token
TUTOR_PROXY_TOKEN_ADMIN=给 admin 的长随机 Token

# 可选：所有 Token 默认每分钟最多 20 次代理请求，突发容量 5 次
TUTOR_PROXY_RATE_LIMIT_PER_MINUTE=20
TUTOR_PROXY_RATE_LIMIT_BURST=5

# 可选：单独覆盖某个 Token 的额度
TUTOR_PROXY_RATE_LIMIT_STUDENT_A_PER_MINUTE=30
TUTOR_PROXY_RATE_LIMIT_STUDENT_A_BURST=8
TUTOR_PROXY_RATE_LIMIT_GUEST_PER_MINUTE=8
TUTOR_PROXY_RATE_LIMIT_GUEST_BURST=2
TUTOR_PROXY_RATE_LIMIT_ADMIN_PER_MINUTE=60
TUTOR_PROXY_RATE_LIMIT_ADMIN_BURST=15
```

限流只作用于需要 Token 的 API 代理接口，不影响公开的 `/health` 和公告接口。服务端返回 429 时，客户端会把错误纳入诊断报告；代理日志和 `/health` 只显示 Token 数量与是否启用限流，不会暴露 Token 明文。

启动代理服务：

```bash
npm run proxy:dev
```

服务会监听 `0.0.0.0:8787`，并自动监听 `.env.local` / `.env` 的变化。你只要修改 `.env.local` 里的服务商、Key、默认服务商或由 ngrok 脚本写入的 `TUTOR_PUBLIC_PROXY_URL`，代理服务会自动重新加载；用户端刷新设置里的“代理服务商”即可拿到最新配置。API Key 不会通过 `/providers` 或 `/models` 返回给用户端。

启动后终端会显示可用地址：

```text
[proxy] local:  http://127.0.0.1:8787
[proxy] lan:    http://192.168.1.23:8787
[proxy] public: https://xxxx.ngrok-free.app
```

其中 `local` 只适合你本机，`lan` 适合同一局域网用户，`public` 适合通过 ngrok 等公网隧道访问。代理服务会定期检测网卡 IP，局域网 IP 变化后终端日志和 `/health` 返回的地址列表会更新。

在用户电脑上：

1. 确保和你的电脑在同一个局域网。
2. 在设置面板把“API 连接模式”切换为“代理服务”。
3. 普通设置中只显示代理服务地址连接状态，不展示远程地址输入框；内置默认公网代理地址可用时会提示“默认代理服务地址连接成功”。
4. 首次使用 API 代理时，“代理访问 Token”填写你在 `.env.local` 中设置的 `TUTOR_PROXY_TOKEN`，或分配给该用户的具名 Token。
5. 点击“刷新代理服务商”，选择 API 服务商和模型后使用。

“刷新代理服务商”成功后，应用会把本次填写的代理访问 Token 保存在用户电脑本机，后续再次打开应用时可以留空使用已保存 Token。保存时会优先使用 Electron `safeStorage` 加密；如果系统不支持安全存储，则退回本机文件保存。

如果你之后修改了代理服务端的 `TUTOR_PROXY_TOKEN`，用户电脑上保存的旧 Token 会在下次请求代理服务商、模型列表、讲解或追问时被服务端拒绝。应用会清除旧 Token，并提示重新填写最新的 `TUTOR_PROXY_TOKEN`。

如果提示“默认代理服务地址连接失败，请到高级设置自行配置远程服务地址”，点击设置标题旁的“高级设置”进入独立调试视图。该视图只用于代理地址调试：填写代理服务地址、点击“验证是否连接成功”、必要时点击“恢复默认地址”。同一局域网填写 `http://你的电脑局域网IP:8787`，公网用户填写 ngrok 的 HTTPS 地址。验证成功后返回普通设置页，再刷新代理服务商并选择 API 服务。

如果用户电脑访问不到代理服务，请检查 Windows 防火墙是否允许 Node.js 入站连接，或者先用 `http://你的电脑局域网IP:8787/health` 测试连通性。公网访问需要额外启动 ngrok 托管脚本：

```bash
npm run ngrok:dev
```

这个脚本会读取 `.env.local` 里的 `NGROK_AUTHTOKEN` 和 `TUTOR_PROXY_PORT`，自动配置 ngrok、启动 `ngrok http <端口>`，并把检测到的 HTTPS 公网地址写回 `.env.local` 的 `TUTOR_PUBLIC_PROXY_URL`。写入时会保留 `.env.local` 原有内容，只更新这一行；`npm run proxy:dev` 检测到文件变化后会自动重新加载，并在 `/health` 里显示新的公网地址。

公网访问时，你的电脑需要同时保持两个终端运行：

```bash
npm run proxy:dev
npm run ngrok:dev
```

如果之后修改了 `.env.local` 里的 `NGROK_AUTHTOKEN` 或 `TUTOR_PROXY_PORT`，`npm run ngrok:dev` 会自动重启 ngrok 隧道并重新写入 `TUTOR_PUBLIC_PROXY_URL`。ngrok 免费隧道地址可能每次启动都会变化，请以 `.env.local` 中最新的 `TUTOR_PUBLIC_PROXY_URL` 或 `/health` 返回的 `serviceUrls.public` 为准。

代理服务可用性检查：

```bash
npm run proxy:check
```

## 公告推送

公告功能复用同一个本地代理服务，不需要额外启动新端口：

```bash
npm run proxy:dev
```

公告文件分为两类：

```text
announcements/releases.json  # 版本更新公告
announcements/current.json   # 私人公告
```

`proxy:dev` 默认会先读取 `announcements/releases.json`，再读取 `announcements/current.json`，并把两个文件中可见的公告合并推送给客户端。版本更新公告会排在私人公告前面；如果两个文件里出现相同 `id`，会保留先读取到的版本公告。任意一个文件不存在时不会影响另一个文件发布。

推荐使用“公告池 + 可见公告 ID 列表”格式：

```json
{
  "allAnnouncement": ["welcome-001", "welcome-005"],
  "announcements": [
    {
      "id": "welcome-001",
      "title": "系统公告",
      "content": "第一条公告内容。",
      "level": "info",
      "publishedAt": "2026-05-09T20:00:00+08:00"
    },
    {
      "id": "welcome-005",
      "title": "重要公告",
      "content": "第五条公告内容。",
      "level": "warning",
      "publishedAt": "2026-05-09T20:00:00+08:00"
    }
  ]
}
```

`announcements` 是公告池，`allAnnouncement` 是当前要显示的公告 ID 列表。应用只会显示各文件 `allAnnouncement` 中列出的公告，并按该数组顺序排列。也兼容 `visibleAnnouncementIds` 和 `"all announcement"` 字段名；如果缺少这些字段，则显示 `announcements` 中的全部公告。`level` 是可选的公告标签，可填写任意文本，也可以留空；留空时客户端只显示发布时间，不会自动兜底成其他内容。`warning` 和 `critical` 仍会触发公告面板的对应强调样式。

版本更新公告推荐使用 `release-vX.Y.Z` 作为 ID，例如：

```json
{
  "id": "release-v0.6.0",
  "title": "v0.6.0 更新说明",
  "content": "- 新增功能 A。\n- 优化体验 B。",
  "level": "info",
  "publishedAt": "2026-05-10T20:00:00+08:00"
}
```

每次发版时，把新的版本公告追加到 `announcements/releases.json`，并把它的 ID 放到该文件 `allAnnouncement` 的第一位。当前 `announcements/releases.json` 已包含 v0.1.0 到 v1.1.0 的版本公告；`announcements/current.json` 保留给私人公告。

客户端会把 `release-` 开头的版本更新公告默认折叠显示，只展示标题、级别和发布时间；用户点击该条公告后才展开具体更新内容。私人公告默认直接展示正文。

公告不会自动弹出。代理服务会对当前合并后的可见公告内容生成 `revision` 哈希；客户端只在 `revision` 与本机已读记录不一致时显示公告按钮红点，用户打开公告面板后即把当前 `revision` 标记为已读。如果只是保存文件但内容完全没有变化，哈希不变，红点状态也不会变化。

旧版单条公告格式仍然可用：

```json
{
  "id": "welcome-001",
  "title": "系统公告",
  "content": "单条公告内容。",
  "level": "info",
  "publishedAt": "2026-05-09T20:00:00+08:00"
}
```

保存 `announcements/releases.json` 或 `announcements/current.json` 后，已连接到该代理地址的应用会通过 SSE 实时收到合并后的公告。公告接口是公开接口，不需要 `TUTOR_PROXY_TOKEN`；API 代理接口仍然需要 Token。

公开接口：

```text
GET /health
GET /announcements/latest
GET /announcements/stream
```

`/health` 会返回 `serviceUrls.local`、`serviceUrls.lan`、`serviceUrls.public`、`tokenCount` 和 `rateLimitEnabled`，方便确认当前代理服务可复制给本机、局域网或公网用户的地址，以及代理端是否已启用多 Token/限流配置。

需要 Token 的接口：

```text
GET /providers
POST /models
POST /explain/stream
POST /follow-up/stream
```

用户只要能访问你的代理地址，例如：

```text
http://你的电脑局域网IP:8787
```

就可以收到公告；如果还要使用你提供的 API 代理能力，首次使用时需要填写 `TUTOR_PROXY_TOKEN`，刷新代理服务商成功后会在本机记住。公告内容不要写 API Key、Token、账号密码或其他私密信息。

## 开发运行

如果要同时准备代理、ngrok 和应用开发服务的三个 PowerShell 标签页，可以先运行：

```bash
npm run dev:tabs
```

也可以直接双击根目录的 `open-dev-tabs.bat`。这个脚本只会在同一个 Windows Terminal 窗口中打开三个标签页，并让每个标签页进入项目根目录，不会自动执行任何 npm 命令。

打开后，在三个标签页中分别手动运行：

```bash
npm run proxy:dev
npm run ngrok:dev
npm run dev
```

如果只需要启动应用开发服务，直接运行：

```bash
npm run dev
```

启动后默认只显示顶部工具栏，不会立刻展开截图层或结果面板。工具栏包含：

- `截图`：进入拖拽截图模式；按住拖拽框选题目，松开后进入待确认状态；点击“确认识别”后才开始识别并讲解；单击、右键或 Esc 会取消本次截图
- `停止`：识别中或追问中可用，用于取消当前请求
- `对话`：显示或隐藏结果/追问面板
- `公告`：显示公告面板
- `设置`：显示设置面板
- `退出应用`：确认后退出应用

顶部工具栏左侧的拖动手柄可以移动工具栏；设置面板标题栏也可以拖动。位置只在本次运行期间保留，退出应用后会恢复默认位置。

启动后工具栏外的透明区域会主动点击穿透，不需要先点击工具栏；鼠标移到工具栏、结果面板或设置面板时，应用会临时关闭穿透以便正常交互。

渲染层当前已按职责拆分：`App.tsx` 主要保留截图、OCR、API 请求和会话编排，具体界面放在 `src/renderer/src/components/`，公告连接逻辑在 `useAnnouncements`，鼠标穿透、工具栏/面板拖动和结果窗口拖动缩放在 `usePointerInteractions`。

## 本题追问

每次截图识别并讲解成功后，应用会为当前题目创建一个内存会话。你可以在结果面板底部继续输入追问，程序不会重新截图，也不会再次发送原始截图，只会把本题文本上下文、已有问答历史和新的追问发送给第三方 API。
追问历史中，用户消息会右对齐显示，助手讲解仍保持左侧长文排版，方便在对话感和阅读性之间平衡。

Responses 兼容模式下，如果服务商返回了 `response_id`，追问会优先使用 `previous_response_id` 续接；如果服务商不支持，应用会自动退回本地历史上下文模式。Chat Completions 兼容模式会直接使用本地历史上下文。

结果面板提供：

- `发送追问`：围绕当前题目继续提问
- `截图下一题`：结束当前题目会话，隐藏结果面板并进入拖拽截图模式；框选下一题并确认识别后，结果面板会在识别开始时重新显示
- `结束本题`：清空当前题目会话，隐藏结果面板并进入拖拽截图模式，等待下一次框选识别
- `跳到底部`：当回答内容可滚动且当前不在底部时显示，可直接跳到回答末尾
- `复制答案` / `导出答案`：位于结果面板底部动作区，把当前题目的讲解和追问记录整理为 Markdown；默认不包含截图、API Key、代理 Token 或代理服务地址

当应用进入 OCR 预览时，结果面板会显示可编辑的识别文本。用户确认前，OCR 文本不会发送给第三方 API；点击“发送讲解”后才会创建本题会话并进入正常追问流程。

结果面板使用 KaTeX 渲染标准 LaTeX 公式。模型输出 `\(...\)`、`\[...\]`、`$...$` 或 `$$...$$` 时，会优先只显示真正排版后的分式、根号、上下标等数学公式；独占一行的行内公式会提升为块级显示，`LaTeX:` / `补充 LaTeX:` 这类引导标签和重复的扁平公式文本会被隐藏。对于 `x²/16 + y²/12 = 1`、`4√7/7` 这类常见扁平公式，应用也会尽量转换成 LaTeX 后渲染；只有渲染失败时，才会显示普通可读文本作为兜底。

识别或追问过程中可以点击工具栏里的 `停止`。应用会取消当前请求，第三方 API 请求会通过 AbortSignal 中断；OCR 会在取消后尽快终止当前 worker 或在当前候选结束后丢弃结果。
框选完成但未确认时，应用会保留待确认区域；确认识别后，拖拽截图层会隐藏，避免遮挡阅读。准备下一题或结束本题时才会重新进入截图模式。

## 验证

```bash
npm run docs:check
npm run typecheck
npm run lint
npm run test
npm run build
npm run proxy:check
node --check server/ngrok-dev.mjs
```

也可以一次执行：

```bash
npm run validate
```

## 打包应用

```bash
npm run dist
```

当前项目只打包 Windows x64 NSIS 安装包，产物会输出到 `release/`。
每次正式发布新版本后，都要同步更新本地 `release/` 文件夹：清理旧版本安装包、旧 `.blockmap` 和旧 `latest.yml`，运行 `npm run dist` 重新生成当前版本产物，并确认 `release/latest.yml` 中的 `version` 和 `path` 指向最新版本。本地 `release/` 只保留最新版本产物。

## Windows 自动更新

项目已接入 `electron-updater`，只面向 Windows 版本使用 GitHub Releases 自动更新。设置面板里可以手动“检查更新”；打包后的应用启动时也会自动检查一次。

“检查更新”只负责确认 GitHub Releases 上是否有新版本，不会自动下载或安装。发现新版本后，按钮旁会出现“立即更新”；用户点击后才开始下载更新包。下载完成后会显示“重启安装”，再次确认后才会退出并安装更新。

发布前先把 `package.json` 里的 GitHub 发布配置改成你的仓库：

```json
"publish": [
  {
    "provider": "github",
    "owner": "你的 GitHub 用户名或组织名",
    "repo": "你的仓库名",
    "releaseType": "release"
  }
]
```

首次发布：

1. 把代码推送到 GitHub。
2. 确认 `.github/workflows/release-windows.yml` 的 `permissions.contents` 为 `write`，工作流会使用仓库自带的 `GITHUB_TOKEN` 发布，不需要准备 Personal Access Token。
3. 修改 `package.json` 的 `version`，例如 `1.0.0`。
4. 提交并推送版本 tag：

```bash
git add .
git commit -m "Release v1.0.0"
git tag -a v1.0.0 -m "v1.0.0"
git push origin main v1.0.0
```

GitHub Actions 会先执行 `npm run docs:check`、类型检查、Lint 和测试，再使用 `GITHUB_TOKEN` 调用 `npm run publish:win`，生成 Windows 安装包和 `latest.yml`，并发布到 GitHub Releases。`GH_TOKEN` 只作为 electron-builder 兼容变量指向同一个仓库 token，不需要 Personal Access Token。用户安装这个版本后，后续每次你提升版本号并推送新 tag，用户端就能检查到更新；用户点击“立即更新”后才会下载更新包，下载完成后点击“重启安装”才会安装。

GitHub Releases 发布成功后，还需要在本机同步一次本地构建产物：

```bash
npm run dist
```

完成后检查 `release/`，只保留最新版本的安装包、`.blockmap`、`latest.yml` 和 `win-unpacked`。如果旧版本文件还在，先删除旧文件再重新打包。

后续更新发布：

```bash
git status
git add .
git commit -m "你的更新说明"
npm version patch
git push origin main --follow-tags
```

这些命令的作用：

- `git status`：查看本地改了哪些文件，确认没有误提交敏感文件。
- `git add .`：把当前改动加入待提交列表；`.env.local`、`node_modules/`、`out/`、`release/` 会被 `.gitignore` 忽略。
- `git commit -m "你的更新说明"`：把改动保存成一次 Git 提交。
- `npm version patch`：自动把版本号加一位，例如 `0.1.0 -> 0.1.1`，并创建 `v0.1.1` tag。
- `git push origin main --follow-tags`：推送代码提交和本次版本 tag，触发 GitHub Actions 使用 `GITHUB_TOKEN` 自动构建并发布新版 Windows 安装包。
- `npm run dist`：在 GitHub Release 发布成功后更新本地 `release/` 文件夹，确保本地只保留最新版本产物。

如果是明显的新功能，可以把 `patch` 换成 `minor`，例如 `0.1.1 -> 0.2.0`：

```bash
npm version patch   # 小修小改、bug 修复：0.1.0 -> 0.1.1
npm version minor   # 新功能：0.1.0 -> 0.2.0
npm version major   # 大改动、不兼容：0.1.0 -> 1.0.0

```

如果在国内网络下 GitHub 下载 Electron 或 electron-builder 二进制较慢，可以先在 PowerShell 设置镜像：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
```

当前 Windows 打包配置关闭了 `signAndEditExecutable`，这样普通权限也能生成安装包。这个版本不会带代码签名证书，Windows 可能显示未知发布者；正式公开分发前建议购买/配置代码签名证书，再恢复 exe 编辑和签名流程。

不要把 `.env.local`、第三方 API Key 或 GitHub token 打包给别人。别人使用本地直连时，应在自己电脑的 `%APPDATA%\study-region-tutor\.env.local` 中填写第三方 API 配置；普通用户更建议使用你另行搭建的代理服务。

## macOS 屏幕录制权限

如果 macOS 截图失败，请打开：

`系统设置 > 隐私与安全性 > 屏幕录制`

给本应用授权后重启应用。开发模式下，你可能需要给 Terminal、iTerm、VS Code 或当前启动 Electron 的宿主程序授权。

## 截图与隐私

- 默认只裁剪确认后的拖拽框选区域，不上传整屏。
- 默认直接发送图片模式下，截图会以 PNG base64 data URL 形式传给你配置的第三方 API。
- 结果窗口会实时显示截图、图片请求、OCR 兜底、OCR 预览确认和文本请求等处理过程；第三方 API 支持 `stream: true` 时，讲解内容也会边生成边显示，正文开始出现后会立即隐藏处理过程。
- 如果图片接口失败，会自动改用本地 OCR 文本模式，并在发送文本前让用户检查和编辑 OCR 结果。
- 手动切换到 OCR 文本模式后，不会把截图传给第三方 API；用户确认前也不会发送 OCR 文本。
- 当前题目的追问会话只保存在内存中，关闭应用或结束本题后即清除；后续追问不会保存或重发截图 base64。
- 默认不保存截图到磁盘。
- 默认不记录截图内容。
- 第三方服务商可能有自己的数据处理规则，请按你的服务商文档确认隐私与合规要求。

## OCR 说明

本地 OCR 使用 `tesseract.js`。首次识别中文时可能需要下载 `chi_sim` 语言数据，因此第一次会慢一些，也需要网络可访问语言数据源。

默认开启“数学公式增强”后，应用会生成多路 OCR 候选：

- 原图识别
- 放大、灰度、二值化后的中文识别
- 放大、增强后的英文/公式优先识别

这些候选会先显示在 OCR 结果确认面板中，方便你手动修正公式、删掉无关文字或补充题干。点击“发送讲解”后，确认后的文本才会发送给第三方文本 API，由模型综合整理公式。OCR 对复杂排版、分式根号、手写内容和低清晰度截图仍然可能不准；如果公式不能确定，模型提示词会要求标出不确定处，而不是凭空补全。

## 坐标与多显示器

坐标采用 Electron 的 DIP 坐标在渲染进程和主进程间传递；主进程会根据当前显示器的 `scaleFactor` 换算为物理像素，再裁剪 `desktopCapturer` 返回的屏幕缩略图。多显示器场景下，会优先选择框选区域中心所在显示器；如果中心点不在任何显示器内，则选择与框选区域重叠面积最大的显示器。
## 多第三方 API 配置

可以在用户配置目录的 `.env.local` 中配置多个第三方 API，并用 `AI_DEFAULT_PROVIDER` 指定默认服务商：

```text
AI_PROVIDERS=tcdmx,xieapi
AI_DEFAULT_PROVIDER=tcdmx

AI_PROVIDER_TCDMX_NAME=TCDMX
AI_PROVIDER_TCDMX_BASE_URL=https://tcdmx.com
AI_PROVIDER_TCDMX_API_MODE=responses
AI_PROVIDER_TCDMX_API_TYPE=openai-compatible
AI_PROVIDER_TCDMX_API_KEY=你的 TCDMX Key

AI_PROVIDER_XIEAPI_NAME=Xie API
AI_PROVIDER_XIEAPI_BASE_URL=https://api.example.com/v1
AI_PROVIDER_XIEAPI_API_MODE=chat-completions
AI_PROVIDER_XIEAPI_API_TYPE=openai-compatible
AI_PROVIDER_XIEAPI_API_KEY=你的 Xie API Key
```

`AI_PROVIDER_<ID>_API_TYPE` 的取值同样是 `openai-compatible`、`gemini`、`anthropic`。如果你的聚合服务商（例如 makelove）把 Gemini 或 Claude 模型暴露为原生协议，需要按对应协议配置；如果它提供 OpenAI-compatible 转换层，则继续使用 `openai-compatible`。

Makelove Gemini 原生示例：

```text
AI_PROVIDERS=makelove
AI_DEFAULT_PROVIDER=makelove
AI_PROVIDER_MAKELOVE_NAME=Makelove Gemini
AI_PROVIDER_MAKELOVE_BASE_URL=https://你的-makelove-地址/v1beta
AI_PROVIDER_MAKELOVE_API_TYPE=gemini
AI_PROVIDER_MAKELOVE_API_KEY=你的 Makelove Key
```

Makelove Claude / Anthropic 原生示例：

```text
AI_PROVIDERS=makelove
AI_DEFAULT_PROVIDER=makelove
AI_PROVIDER_MAKELOVE_NAME=Makelove Claude
AI_PROVIDER_MAKELOVE_BASE_URL=https://你的-makelove-地址/v1
AI_PROVIDER_MAKELOVE_API_TYPE=anthropic
AI_PROVIDER_MAKELOVE_API_KEY=你的 Makelove Key
```

应用启动后会在设置面板显示“API 服务商”下拉框，默认选中 `AI_DEFAULT_PROVIDER`。切换服务商后会重新请求该服务商的 `/models` 列表；请求失败时，结果窗口会提示当前使用的服务商，方便你切换到其他 API 后重试。API Key 只在主进程中使用，不会回填或明文展示到设置界面。
