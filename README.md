# Study Region Tutor

一个跨平台桌面学习辅助应用。你可以拖拽、缩放屏幕上的半透明识别框，点击“识别并讲解”后，应用只截取识别框覆盖的区域。

默认流程是：

1. 本地截取框选区域。
2. 把截图转换为 PNG base64 data URL。
3. 直接把图片发送到你配置的第三方 OpenAI-compatible API。

如果直接图片模式请求失败，应用会自动退回本地 OCR 文本模式，并只把 OCR 结果继续发送给文本接口。设置面板里仍保留“本地 OCR 后发文字”模式，适合服务商不稳定或不支持图片输入时手动切换。

这个项目面向学习场景，不用于考试作弊。应用不会隐藏窗口、绕过监控、自动提交答案、自动点击网页或规避检测。默认提示词会要求模型给出思路、步骤和关键概念；如果截图看起来来自正式考试、竞赛、测验或受限制平台，模型会提示遵守规则，并只提供学习性讲解。

## 第三方 API 要求

默认直接发送图片模式下，服务商需要支持多模态图片输入，并至少兼容下面一种接口：

- Chat Completions 兼容：`POST /chat/completions`
- Responses 兼容：`POST /responses`
- 模型列表：`GET /models`，用于启动时加载设置面板里的可选模型列表

如果 Base URL 是服务商根地址且 `/models` 返回网页，应用会自动再尝试 `GET /v1/models`。当前 `https://tcdmx.com` 的模型列表实测位于 `/v1/models`。

当前实现会拒绝 `api.openai.com` 这类 OpenAI 官方 API 地址，避免误配回官方接口。

当前配置推荐：

```text
AI_BASE_URL=https://tcdmx.com
AI_API_MODE=responses
AI_API_KEY=你的第三方 API Key
```

## 安装依赖

```bash
npm install
```

## 配置第三方 API

可以在应用的设置面板里填写：

- API Base URL，例如 `https://api.example.com/v1`
- API Key
- 接口模式：默认选 `Chat Completions 兼容`
- 模型名：应用启动时会从第三方 API 获取可选模型列表，也可以点击刷新重新获取；如果服务商不支持模型列表，仍可手动填写
- 思考程度：可选 `low`、`medium`、`high`、`xhigh`
- 输入方式：默认选 `直接发送图片`
- OCR 语言：默认选 `中文`
- 数学公式增强：默认开启，会对截图进行放大、灰度、二值化，并额外跑一条英文/公式优先 OCR 候选
- 输出语言
- 是否只讲思路

也可以用环境变量提供连接配置。模型和思考程度不再从环境变量读取，请在设置面板中选择。

Windows PowerShell:

```powershell
$env:AI_BASE_URL="https://api.example.com/v1"
$env:AI_API_MODE="responses"
$env:AI_API_KEY="你的第三方 API Key"
```

macOS / Linux:

```bash
export AI_BASE_URL="https://api.example.com/v1"
export AI_API_MODE="responses"
export AI_API_KEY="你的第三方 API Key"
```

如果设置面板里填写了同名配置，会优先使用设置面板的值。

项目也会读取工作目录下的 `.env.local` 和 `.env`，其中 `.env.local` 已在 `.gitignore` 中，不会提交到仓库。
应用启动时只会把配置文件里的 Base URL 和接口模式落实到运行时设置里；API Key 只在主进程里使用，设置面板只显示是否已配置，不会回填或展示明文。

## 开发运行

```bash
npm run dev
```

启动后会出现一个半透明覆盖窗口，包含：

- 可拖拽、可缩放的识别区域
- “识别并讲解”按钮
- 识别中或追问中的“停止”按钮
- 结果面板
- 设置面板

## 本题追问

每次“识别并讲解”成功后，应用会为当前题目创建一个内存会话。你可以在结果面板底部继续输入追问，程序不会重新截图，也不会再次发送原始截图，只会把本题文本上下文、已有问答历史和新的追问发送给第三方 API。

Responses 兼容模式下，如果服务商返回了 `response_id`，追问会优先使用 `previous_response_id` 续接；如果服务商不支持，应用会自动退回本地历史上下文模式。Chat Completions 兼容模式会直接使用本地历史上下文。

结果面板提供：

- `发送追问`：围绕当前题目继续提问
- `截图下一题`：结束当前题目会话，重新显示识别框；调整框选区域后再点击“识别并讲解”
- `结束本题`：清空当前题目会话，并重新显示识别框，等待下一次识别

识别或追问过程中可以点击工具栏里的 `停止`。应用会取消当前请求，第三方 API 请求会通过 AbortSignal 中断；OCR 会在取消后尽快终止当前 worker 或在当前候选结束后丢弃结果。
识别和回答当前题目时，屏幕上的半透明识别框会隐藏，避免遮挡阅读；只有准备下一题、取消或出错后才会重新显示。

## 验证

```bash
npm run typecheck
npm run lint
npm run test
npm run build
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

## Windows 自动更新

项目已接入 `electron-updater`，只面向 Windows 版本使用 GitHub Releases 自动更新。设置面板里可以手动“检查更新”；打包后的应用启动时也会自动检查一次。

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
2. 准备一个 GitHub token，并在当前终端设置为 `GH_TOKEN`。
3. 修改 `package.json` 的 `version`，例如 `0.1.1`。
4. 运行：

```bash
npm run publish:win
```

`electron-builder` 会生成 Windows 安装包和 `latest.yml`，并发布到 GitHub Releases。用户安装这个版本后，后续每次你提升版本号并重新运行 `npm run publish:win`，用户端就能检查并下载安装更新。

后续更新发布：

```bash
git status
git add .
git commit -m "你的更新说明"
npm version patch
git push
git push --tags
```

这些命令的作用：

- `git status`：查看本地改了哪些文件，确认没有误提交敏感文件。
- `git add .`：把当前改动加入待提交列表；`.env.local`、`node_modules/`、`out/`、`release/` 会被 `.gitignore` 忽略。
- `git commit -m "你的更新说明"`：把改动保存成一次 Git 提交。
- `npm version patch`：自动把版本号加一位，例如 `0.1.0 -> 0.1.1`，并创建 `v0.1.1` tag。
- `git push`：推送代码提交。
- `git push --tags`：推送版本 tag，触发 GitHub Actions 自动构建并发布新版 Windows 安装包。

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

不要把 `.env.local`、第三方 API Key 或 GitHub token 打包给别人。别人使用时应在设置面板填写自己的第三方 API 配置，或者你另行搭建后端代理服务。

## macOS 屏幕录制权限

如果 macOS 截图失败，请打开：

`系统设置 > 隐私与安全性 > 屏幕录制`

给本应用授权后重启应用。开发模式下，你可能需要给 Terminal、iTerm、VS Code 或当前启动 Electron 的宿主程序授权。

## 截图与隐私

- 默认只裁剪识别框覆盖区域，不上传整屏。
- 默认直接发送图片模式下，截图会以 PNG base64 data URL 形式传给你配置的第三方 API。
- 结果窗口会实时显示截图、图片请求、OCR 兜底和文本请求等处理过程；第三方 API 支持 `stream: true` 时，讲解内容也会边生成边显示。
- 如果图片接口失败，会自动改用本地 OCR 文本模式。
- 手动切换到 OCR 文本模式后，不会把截图传给第三方 API，只会发送 OCR 后的文字。
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

这些候选会一起发送给第三方文本 API，由模型综合整理公式。OCR 对复杂排版、分式根号、手写内容和低清晰度截图仍然可能不准；如果公式不能确定，模型提示词会要求标出不确定处，而不是凭空补全。

## 坐标与多显示器

坐标采用 Electron 的 DIP 坐标在渲染进程和主进程间传递；主进程会根据当前显示器的 `scaleFactor` 换算为物理像素，再裁剪 `desktopCapturer` 返回的屏幕缩略图。多显示器场景下，会优先选择识别框中心所在显示器；如果中心点不在任何显示器内，则选择与识别框重叠面积最大的显示器。
## 多第三方 API 配置

可以在 `.env.local` 中配置多个第三方 API，并用 `AI_DEFAULT_PROVIDER` 指定默认服务商：

```text
AI_PROVIDERS=tcdmx,xieapi
AI_DEFAULT_PROVIDER=tcdmx

AI_PROVIDER_TCDMX_NAME=TCDMX
AI_PROVIDER_TCDMX_BASE_URL=https://tcdmx.com
AI_PROVIDER_TCDMX_API_MODE=responses
AI_PROVIDER_TCDMX_API_KEY=你的 TCDMX Key

AI_PROVIDER_XIEAPI_NAME=Xie API
AI_PROVIDER_XIEAPI_BASE_URL=https://api.example.com/v1
AI_PROVIDER_XIEAPI_API_MODE=chat-completions
AI_PROVIDER_XIEAPI_API_KEY=你的 Xie API Key
```

应用启动后会在设置面板显示“API 服务商”下拉框，默认选中 `AI_DEFAULT_PROVIDER`。切换服务商后会重新请求该服务商的 `/models` 列表；请求失败时，结果窗口会提示当前使用的服务商，方便你切换到其他 API 后重试。API Key 只在主进程中使用，不会回填或明文展示到设置界面。
