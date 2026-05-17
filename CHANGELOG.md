# 版本更新记录

## Unreleased

暂无。

## v1.4.0 - 2026-05-17

### 改进

- 核心操作界面、提示和状态文案完成中英文 i18n 收尾，新增 `translateMessage` 供 App/hooks 使用；历史版本向导内容仍按中文源维护。
- App.tsx 通过 7 个自定义 Hook 拆分状态和业务逻辑（useApiSettings、useExplainSession、useStudyLibrary、useCaptureFlow、useGuides、useDiagnostics、useConfirmDialog），主文件从 ~1876 行精简为布局编排层。
- 提取 ConfirmModal 为独立组件，内置 useFocusTrap 实现键盘焦点陷阱。
- KaTeX 安全加固：sanitizeKatexHtml 增加 `<script>`、`<iframe>` 和事件处理器过滤；数学公式元素添加 `role="math"` 和 `aria-label` 无障碍属性。
- SSRF 防护增加十进制 IP（如 2130706433）和八进制 IP（如 0177.0.0.1）检测。
- 代理客户端对非 HTTPS + 非 localhost 地址输出控制台警告。
- 样式无障碍：移除全局 `user-select: none`，改为仅在工具栏/覆盖层限制；内容区域允许文本选择。添加 `@media (forced-colors: active)` 高对比度支持和 `@media print` 打印样式。

### 修复

- OCR Worker 失败时清除缓存条目，避免后续请求继续使用失败的 Worker。
- 截图 scalePng 非整数维度使用 `Math.round()` 取整。
- mainWindow 空引用崩溃改为 null guard 保护。
- before-quit OCR Worker 清理添加 5 秒超时，防止退出卡死。
- display-metrics-changed 事件添加 200ms 防抖。
- 空 segmentBuffers 截图合成添加守卫。
- answerFormat.ts 移除冗余的双重 sqrt 输出。
- 推理降级添加 Gemini/Anthropic 路径支持。
- fetchModelOptions 添加 AbortSignal 参数。
- proxyClient 默认 30 秒超时，proxyStream 默认 120 秒超时。
- 会话轮次添加 200 上限保护。
- 学习库 sanitizeTurn 改用 `crypto.randomUUID()` 生成 ID。
- HistoryPanel metadata keyPoints React key 去重。

### 文档

- CONTRIBUTING.md 改为中文撰写。
- 新增 LICENSE 文件（MIT）。
- .github/pull_request_template.md 改为中文。
- 架构文档更新 Hook 架构说明和核心界面 i18n 状态。
- package.json 补全 author、repository、homepage、bugs、keywords、engines 元数据。
- 新增 `.env.example` 配置模板。
- vitest.config.ts 添加 v8 覆盖率配置。

### 维护

- 新增 `npm run test:coverage` 脚本。

## v1.3.0 - 2026-05-17

### 新增

- 新增暗色模式，支持亮色、暗色和跟随系统三种主题；CSS 全面改为语义化变量，`[data-theme=”dark”]` 覆写暗色值。
- 新增国际化 (i18n) 基础设施和中英文翻译表；当前语言设置继续控制回答/导出语言，界面文案会逐步接入 `useTranslation()`。
- 新增错题统计仪表盘面板，展示统计卡片、学科雷达图（SVG）、知识点/易错点柱形图（CSS）；纯 CSS + SVG 实现，无外部图表库依赖。
- 新增学习数据备份与恢复，支持导出全部学习库为 JSON 备份文件，支持从 JSON 备份导入并选择替换、合并优先导入或合并优先本地三种合并策略。
- 学习库概览新增掌握率、近 7 天复习、学科分布、高频知识点和常见易错点，便于快速查看复习状态和薄弱方向。
- 新增 PR / `main` 分支 CI 工作流，合入前运行文档检查、类型检查、Lint、测试、安全边界检查和构建。
- 新增 Dependabot 配置，按周检查 npm 和 GitHub Actions 依赖更新。
- 新增关键 IPC runtime 校验，覆盖截图讲解、区域 OCR、OCR 文本讲解、追问、模型列表、诊断、结构化学习信息提取、模型 / Prompt 评测、取消请求、结束本题、代理 Token 保存、公告/代理 URL、单题导出和学习库批量导出请求。
- 新增焦点陷阱 (`useFocusTrap`) hook，应用于公告面板、向导面板和首次配置向导，改善键盘导航和无障碍体验。
- 新增 `prefers-reduced-motion` 媒体查询支持，尊重用户系统减少动画设置。
- 新增 `:focus-visible` 样式，所有交互元素获得焦点时显示可见轮廓。

### 改进

- 渲染层自动更新状态订阅拆为独立 `useUpdateStatus` hook，继续推进 `App.tsx` 运行状态逻辑拆分。
- 收紧 KaTeX 公式渲染输出，移除辅助 annotation 中保留的原始 TeX，并在公式 tooltip 遇到危险协议时降级显示，降低不可信公式文本进入 DOM 属性的风险。
- BrowserWindow 启用 `sandbox: true`，并把该安全选项纳入 `npm run security:check`。
- 模型 / Prompt 评测面板新增前端组合数限制和停止评测入口，最多一次运行 20 组，取消后保留已完成结果。
- 学习库筛选文案改为”待处理/复习”，导出按钮明确只导出当前筛选结果，并对标题、标签、易错原因编辑做 debounce 保存。
- 渲染层启动时会主动补拉一次当前更新状态，避免错过主进程较早发出的自动更新状态。
- 学习库概览统计补充单元测试，覆盖复习时间、掌握率、学科分布和结构化知识点/易错点统计。
- “清空学习库”按钮改为危险操作样式，降低误操作风险。
- 提取 `openaiClient.ts` 和 `proxyClient.ts` 共享逻辑到 `apiShared.ts`，消除元数据解析、上下文截断和历史构建的重复代码。
- 学习库搜索文本使用 `WeakMap` 缓存，减少重复字符串拼接开销。
- 公告面板 `groupedAnnouncements` 计算包裹 `useMemo`，减少无关渲染时的重复分组计算。
- SSRF 防护补充 IPv6 保留地址检测，阻止 link-local、unique-local、IPv4-mapped IPv6 和扩展回环地址绕过。
- 代理服务上游请求添加 120 秒超时，防止慢上游阻塞连接。
- 代理服务请求体校验补充 `providerId`、`text`、`model`、`historyPrompt` 字段验证。
- 代理服务密钥脱敏补充 `x-goog-api-key` 和 `token=` URL 参数模式。
- 移除代理服务中无效的 HSTS 响应头（HTTP-only 服务不应声明 HSTS）。
- `proxyClient` 添加 30 秒默认超时。

### 修复

- 学习库主存储损坏时会回退读取旧版本地历史，避免用户看到空学习库。
- `openaiClient.ts` 空字符串模型名使用 `??` 替换 `||`，避免空字符串穿透到默认值。
- `ocr.ts` 图片最长边 >= 1400 时跳过不必要的缩放操作。
- `EvalPanel` 新增 `useEffect` 同步 `modelText` 与 `settings.model`，修复切换模型后评测面板模型名不更新的问题。
- `EvalPanel` 运行按钮使用 ref 防止双击竞态。
- `ConversationView` 加载完成时也触发滚动到底部，修复首次加载时内容不可见的问题。
- `SettingsPanel` 当当前模型不在模型列表中时自动切换 `isModelCustom` 状态。

### 维护

- 版本号更新为 `1.3.0`，并同步 `package-lock.json`。
- 新增 `v1.3.0` 应用内新增功能向导，历史版本向导继续保留 `v1.2.0` 及更早条目。
- 新增 `release-v1.3.0` 版本公告，并置于公告列表首位。
- CI 和 Windows 发布工作流补齐代理/ngrok/Release Notes 同步脚本语法检查；Windows 发布工作流移除手动触发入口，并校验只处理 `vX.Y.Z` tag。
- 文档策略补充 Unreleased 用户可见变化的应用内向导处理规则：未发布时不写入已发布版本向导，正式发布归档时再统一判断并补齐。
- 同步更新项目上下文、架构说明、接手入口、发布说明和版本公告，记录暗色模式、i18n、仪表盘、备份恢复、安全修复、Bug 修复、代码去重、无障碍和性能优化。

## v1.2.0 - 2026-05-16

### 新增

- 学习库/错题本升级为复习队列，新增复习次数、答对/答错次数、下次复习时间、难度和易错原因字段，支持“今日待复习”和“只看错题”筛选。
- 结果面板和学习库新增复习反馈操作，可标记“答错了”“有点忘”“答对了”“很熟练”，并按反馈自动安排下次复习时间。
- 讲解完成后异步提取结构化学习信息，包括学科、知识点、题型、难度、关键点、易错点、标签和摘要；提取失败时静默降级，不影响讲解和追问。
- 学习库新增批量导出当前筛选结果，支持 Markdown、Anki CSV 和 Obsidian 多文件 Markdown。
- 设置页新增“模型评测”面板，可用同一题目文本对比多个模型和 Prompt 模板，记录耗时、输出长度、成功/失败、评分和可复制结果。
- 新增 OCR 预处理模式，可选择自动增强、不增强、对比度增强、二值化或多路增强。
- 新增 `npm run security:check`，检查渲染层持久化白名单、BrowserWindow 安全选项和导出隐私边界；发布工作流也会运行该检查。

### 改进

- 学习库搜索范围扩展到难度、易错原因、结构化知识点、题型、摘要和易错点。
- 学习库导出继续复用脱敏边界，只导出文字记录、复习状态和结构化学习信息，不包含截图、API Key、代理 Token 或代理地址。
- 一键诊断新增安全边界检查项，明确提示敏感信息不会进入诊断报告或渲染层普通存储。
- 整体功能向导更新学习沉淀说明，覆盖复习反馈、待复习筛选和批量导出。

### 维护

- 扩展共享类型、IPC 和 preload API，覆盖结构化 metadata 提取、学习库批量导出和 Prompt 评测。
- 新增学习库复习调度、导出格式和安全边界测试；测试总数增加到 79 个。
- GitHub Actions Windows 发布流程新增 `npm run security:check` 步骤。

## v1.1.3 - 2026-05-15

### 新增

- 新增首次配置向导，按连接方式、代理/本地配置、服务商模型和快捷键四步引导用户完成初始化；设置页可随时重新打开。
- 新增代理管理面板，可查看代理地址、Token 状态、服务商数量、限流、公告状态和服务端地址，并可复制脱敏摘要。
- 新增默认全局快捷键，并允许在设置中逐项捕获新组合键、停用或恢复默认值。
- 新增学习库/错题本 MVP，由本地历史升级而来，保存会话文本、学科、标签、收藏和掌握状态，支持搜索、筛选、恢复查看、删除和清空；不保存截图、API Key 或代理 Token。
- 新增 Provider 配置生成器，可生成多服务商 `.env.local` 片段；新增 Prompt 模板设置，支持标准、简洁、启发式、考试边界和自定义补充。

### 改进

- OCR/公式增强结果升级为结构化候选，确认页可在多路候选之间一键切换后再发送讲解。
- 一键诊断新增“深度测试”入口，会实际请求文本讲解接口验证当前模型链路。
- 公告面板支持按 `category` 分组；旧公告未设置分类时会自动归入版本公告或普通公告。

### 文档

- 新增 `docs/START_HERE.md` 作为新账号、新对话或新 Codex 会话的统一接手入口，并补充任务到文档映射和硬性约束。
- 新增 `docs/release.md`、`docs/proxy.md`、`docs/provider-config.md`、`docs/announcements.md` 和 `docs/documentation-policy.md`，将发布、代理、provider、公告和文档治理从 README 中拆成专题文档。
- 新增 `docs/decisions/` ADR 和 `docs/templates/` 模板，固化 GitHub Actions 发布、敏感配置边界、向导更新策略和代理安全边界。
- 压缩 `README.md` 和 `PROJECT_CONTEXT.md`，让 README 回到快速入口，让 PROJECT_CONTEXT 回到当前状态卡片。

## v1.1.2 - 2026-05-14

### 新增

- 补充“本版本新增向导”内容，覆盖复制/导出入口迁移、按模型动态显示思考程度，以及 Gemini / Claude 原生协议配置提示。
- 设置页新增“历史版本向导回顾”，可按版本回顾以往新增功能；历史内容已从 `CHANGELOG.md` 中提炼并补齐 v0.1.0 到 v1.1.0 的用户可见变化。
- 非敏感设置持久化到渲染层版本化本地存储，保留连接模式、服务商、模型名、代理地址、输入方式、OCR 语言和思考程度等用户选择；API Key 和代理 Token 不写入普通 `localStorage`。

### 修复

- 代理服务热加载 `.env.local` / `.env` 时，如果新配置无效会立即进入配置错误状态，不再继续沿用上一份有效 provider；同时修复首次启动配置错误时误报 `activeConfig` 初始化异常的问题。
- 统一代理服务与 ngrok 脚本的环境变量优先级为环境变量、`.env.local`、`.env`，并增强 `.env` / `.env.local` 创建、删除、重命名和原子替换时的热更新。
- `TUTOR_PROXY_PORT` 运行中变化时，代理服务会尝试切换监听端口；`ngrok:dev` 会确认目标端口 `/health` 可访问后再重启隧道，降低端口不一致风险。
- 跨显示器框选截图现在会从多个显示器裁剪并合成完整 PNG，修复跨屏选择只截到单个显示器的问题。
- 公告已读状态和设置持久化写入 `localStorage` 失败时会降级处理，不再影响界面流程。

### 改进

- OCR worker 按语言复用并在空闲后释放，连续截图识别时减少重复初始化成本；取消请求仍会终止当前 worker。
- Renderer 增加基础 CSP，BrowserWindow 明确开启 `webSecurity` 并禁止 insecure content。

### 维护

- 新增 `server/runtime-env.mjs` 作为代理服务和 ngrok 脚本共用的环境加载模块，并补充优先级测试。
- 新增 `src/shared/apiProtocol.mjs` 复用端点拼接、模型列表候选地址和错误摘要逻辑，直连与代理两条路径共用同一套纯函数测试。
- 发布清单、接手文档和项目上下文新增向导检查要求：以后每次版本更新都要判断是否需要补充“本版本新增向导”，保留旧版本新增向导供历史回顾，并判断“整体功能向导”是否需要同步更新。

## v1.1.1 - 2026-05-13

### 改进

- 结果面板的 `复制 Markdown` / `导出 Markdown` 改为 `复制答案` / `导出答案`，并移动到底部追问动作区，与 `发送追问`、`截图下一题` 和 `结束本题` 并排。
- 第三方 API 服务商新增 `AI_API_TYPE` / `AI_PROVIDER_<ID>_API_TYPE`，支持 `openai-compatible`、`gemini`、`anthropic` 三种协议；本地直连和代理服务均可使用 Gemini 原生与 Anthropic 原生请求格式。
- 思考程度改为按服务商和模型动态适配：OpenAI-compatible 使用 `reasoning_effort` / `reasoning.effort`，Claude 4.6 可选择 `max` 并映射到 `output_config.effort`，Gemini 3 / 2.5 分别映射到 `thinkingLevel` / `thinkingBudget`。
- 代理服务文档和本机配置补充多具名 Token 与限流示例，便于按用户分配访问额度。

### 维护

- 新增 Makelove provider 兼容测试，覆盖 Gemini 和 Anthropic 原生协议的请求地址、鉴权头和请求体。
- 新增思考程度映射测试，覆盖 OpenAI-compatible `minimal`、Claude Opus 4.6 `max` 和 Gemini 2.5 `thinkingBudget`。

## v1.1.0 - 2026-05-12

### 新增

- 设置页新增“一键诊断”，会检查当前连接模式、配置文件、代理地址、代理 Token、API 服务商、模型列表和当前模型，并输出包含失败原因、处理建议和脱敏技术细节的诊断报告。
- 新增整体功能向导框架：每次应用版本变化后首次打开会显示整体功能向导；设置页顶部可重新打开整体功能向导和本版本新增向导，本版本新增向导接口已预留。
- 结果面板新增 `复制 Markdown` 和 `导出 Markdown`，可导出当前题目的讲解和追问记录，默认不包含截图、API Key、代理 Token 或代理地址。
- 代理服务新增具名多 Token 配置和内存级限流，兼容旧版 `TUTOR_PROXY_TOKEN`，并在 `/health` 中返回 Token 数量和是否启用限流。

### 维护

- 新增 `src/main/diagnostics.ts`、`src/main/exportConversation.ts`、`src/shared/exportConversation.ts`、`GuidePanel`、`DiagnosticReport` 和导出格式测试。
- 新增 `.editorconfig`、`.gitattributes`、`docs/codex-handoff.md`、`docs/architecture.md`、`docs/release-checklist.md`、`scripts/check-docs.mjs` 和 `npm run docs:check`，规范文档结构、Codex 接手流程、换行符归一化和发版前文档检查。
- `.github/workflows/release-windows.yml` 新增 `npm run docs:check` 步骤，确保 GitHub Actions 发布前检查文档结构、版本说明和版本公告一致性。
- 将实施记录迁移到 `docs/dev-log/2026-05-12.md`，记录本次一键诊断、设置向导、结果导出、代理多 Token/限流和文档管理规范化过程。

## v1.0.3 - 2026-05-12

### 改进

- 顶部“截图”改为拖拽截图模式：点击后进入全屏十字光标覆盖层，按住拖拽框选题目，松开后先进入待确认状态；点击“确认识别”后才开始识别并讲解。
- 待确认状态支持“确认识别”和“重选截图”，右键或 Esc 可取消本次截图。
- 点击“截图下一题”或“结束本题”后会隐藏结果窗口并进入拖拽截图模式；下一题框选并确认识别后，结果窗口再重新显示，避免遮挡下一题框选区域。
- 启动、窗口聚焦和页面恢复可见时会主动同步鼠标穿透状态，避免应用刚打开时透明区域拦截底层网页或桌面点击。
- 流式回答一旦开始显示正文，结果窗口会立即隐藏“处理过程”；若请求失败，仍会在错误信息中保留处理过程用于排查。
- 结果内容可滚动且当前不在底部时，会显示“跳到底部”按钮，便于快速查看选择题等回答末尾的最终结论。
- 本题追问中的用户消息改为右对齐气泡样式，助手讲解保持原有左侧文档式排版。

### 文档

- 补充项目文档维护约定：每次完成功能改进、体验优化、升级或扩展后，都要同步检查并更新相关文档。

## v1.0.2 - 2026-05-11

### 新增

- 新增 OCR 结果确认页：本地 OCR 模式和图片接口失败后的 OCR 兜底都会先展示识别文本，用户可编辑、删除多余内容后再发送给模型。
- 新增 KaTeX 公式渲染，支持行内/块级 LaTeX 公式显示，分数、根号、上下标等复杂公式会以数学排版呈现。
- 新增 `npm run dev:tabs` 及对应脚本，可一键打开常用开发窗口。

### 改进

- OCR 文本确认前不会发送给第三方 API；确认后才创建本题会话，并保留后续追问能力。
- 图片直传失败时不再自动把 OCR 文本继续发给模型，而是进入 OCR 确认页，方便用户修正识别错误。
- 强化题目讲解提示词，要求公式尽量直接输出标准 LaTeX，避免 `2√3`、`8√3/2` 等纯文本公式影响显示效果。
- 公式展示默认只保留渲染后的公式本体，移除行内公式兜底样式中的胶囊背景；仅在 KaTeX 渲染失败时回退显示可读文本。
- 自动清理 `LaTeX:` / `补充 LaTeX:` 等公式标签，以及 `\(...\)`、`\[...\]`、`$$...$$` 等分隔符残留；独占一行的行内公式会提升为块级公式显示。
- 对 `x²/16 + y²/12 = 1`、`4√7/7`、`ab/2` 等常见扁平公式做轻量 LaTeX 转换，模型偶尔未按提示输出标准 LaTeX 时也尽量按公式块渲染。
- 自动移除紧邻 LaTeX 公式前的重复扁平公式行，避免出现“普通文本公式 + 渲染公式”两份内容。
- 顶部工具栏和设置面板支持拖动摆放；本地直连配置指引会显示实际读取的用户配置文件路径。

### 维护

- 收紧 OCR 预览 IPC 类型，删除不再需要的 `RecognizeRegionRequest.reason` 入参。
- 清理公式解析中的冗余兜底逻辑，显示块解析时直接剥离闭合分隔符，并收紧公式去重规则。
- 拆分渲染层结构，将 `App.tsx` 中的面板 JSX、公告状态和鼠标穿透/拖动逻辑拆到独立组件与自定义 hook 中。
- 新增 `constants.ts`、`uiTypes.ts`、`uiUtils.ts`、`useAnnouncements.ts`、`usePointerInteractions.ts` 以及 `src/renderer/src/components/` 面板组件，`App.tsx` 回收为主流程编排层。
- 补充 OCR 确认发送和公式解析测试，覆盖可编辑 OCR 文本、LaTeX 标签隐藏和公式分隔符清理。

## v1.0.1 - 2026-05-10

### 改进

- 本地直连配置改为固定读取用户配置目录 `%APPDATA%\study-region-tutor\.env.local` / `.env`；开发运行时仍优先支持项目根目录 `.env.local` / `.env`。
- 本地直连缺少配置或模型列表刷新失败时，设置页只保留应用更新、API 连接模式和配置指引，不再展示技术错误和后续 API/OCR 设置项。

## v1.0.0 - 2026-05-10

### 新增

- 新增 `PROJECT_CONTEXT.md`，记录项目定位、发布流程、代理/ngrok/公告约定和当前待发布改动，方便新对话快速恢复上下文。
- 新增 `scripts/read-utf8.ps1`，用于在 Windows PowerShell 中按 UTF-8 读取中文文档，避免终端默认编码导致乱码。
- 顶部工具栏新增“退出应用”按钮，点击并二次确认后退出应用。
- 新增 `announcements/releases.json`，专门用于发布版本更新公告，并补充 v0.1.0 到 v1.0.0 的版本更新公告。
- 发布流程继续使用 GitHub Actions 仓库自带的 `GITHUB_TOKEN`，不需要 Personal Access Token。

### 改进

- 版本更新公告在公告面板中默认折叠显示，点击标题后再展开具体更新内容，避免长更新日志占满公告栏。
- 公告服务现在会合并读取版本更新公告和私人公告，默认版本公告显示在私人公告前面。
- 公告红点改为基于合并后可见公告内容的 `revision` 哈希判断；仅保存但内容不变时红点不会变化，打开公告面板后标记当前哈希为已读。
- 移除公告自动弹出逻辑和对应配置字段，公告面板只会由用户主动点击打开。
- 公告 `level` 字段改为任意文本标签，并取消默认兜底；留空时公告列表只显示发布时间。
- 代理服务模式会在用户首次成功填写 `TUTOR_PROXY_TOKEN` 后记住代理访问 Token；后续打开应用可直接使用，旧 Token 失效时会自动清除并提示重填。
- 调整高级设置中的代理地址验证提示：区分内置默认代理地址和用户自填代理地址，分别显示成功与失败时的对应文案。
- README 补充 Windows PowerShell 查看中文文档的 UTF-8 读取说明。
- 调整 Windows 自动更新流程：“检查更新”不再自动下载更新包，发现新版本后需点击“立即更新”才开始下载。

## v0.5.0 - 2026-05-10

### 新增

- 代理服务支持 `TUTOR_PUBLIC_PROXY_URL`，可在启动日志和 `/health` 中显示 ngrok 等公网入口。
- `/health` 新增 `serviceUrls.local`、`serviceUrls.lan`、`serviceUrls.public`，用于区分本机、局域网和公网访问地址。
- 新增 `npm run ngrok:dev`，可自动读取 `.env.local` 的 `NGROK_AUTHTOKEN` 和 `TUTOR_PROXY_PORT`，启动 ngrok 隧道并回写 `TUTOR_PUBLIC_PROXY_URL`。

### 改进

- 设置面板代理模式下默认隐藏远程服务地址输入框，改为在“高级设置”中手动修改。
- ngrok 隧道脚本会监听 `.env.local` / `.env`，当 token 或端口变化时自动重启隧道，并保留 `.env.local` 原有内容只更新公网地址行。
- 代理模式内置默认公网代理地址，普通设置区改为显示默认代理地址连接状态；“高级设置”改为独立调试视图，只保留代理地址输入、连接验证和恢复默认地址。
- 公告连接改为先检测代理 `/health`，默认代理离线时不再启动即请求公告接口刷屏报错，而是在后台定时重试。
- 精简设置面板，移除本地直连模式下的 API Base URL、API Key 明细输入区和当前服务商详情提示，避免展示不必要的配置细节。

## v0.4.0 - 2026-05-09

### 新增

- 将公告推送接入现有 `proxy:dev` 服务，新增公开的 `/announcements/latest` 和 `/announcements/stream` 接口。
- 新增 `announcements/current.json`，保存后可通过 SSE 将公告实时推送到已连接的用户端。
- 公告文件支持 `allAnnouncement` + `announcements` 的公告池格式，可只显示指定 ID 的公告并按指定顺序展示。
- 顶部工具栏新增公告入口，支持未读提示、自动弹出和本地已读记录。
- 应用启动时默认只显示顶部工具栏，截图框和对话结果窗口改为按需打开；工具栏新增截图按钮，原结果按钮调整为对话入口。

### 安全

- 公告接口不需要 Token；API 代理接口仍然保留 `TUTOR_PROXY_TOKEN` 鉴权。

## v0.3.1 - 2026-05-09

### 改进

- 识别框隐藏后的识别、讲解和答案阶段，应用透明区域会点击穿透，不再阻挡底层网页或桌面操作。
- 结果窗口、设置窗口和顶部工具栏保留悬浮窗交互，可继续点击、拖动、缩放、滚动和输入。

### 保持不变

- 截图流程、框选区域裁剪、多显示器和缩放比例处理保持不变，仍然只截取当前框选题目区域。

## v0.3.0 - 2026-05-08

### 新增

- 新增本机局域网代理服务，可读取并监听开发电脑的 `.env.local`，让用户端通过代理地址和访问 Token 使用第三方 API。
- 设置面板新增“API 连接模式”，支持在“本地直连”和“代理服务”之间切换。
- 代理模式支持刷新服务商列表、刷新模型列表、直接图片讲解、OCR 文字讲解和本题追问流式输出。

### 安全

- 代理服务只向用户端返回脱敏后的服务商信息和模型列表，不返回第三方 API Key。
- 用户端截图和 OCR 仍在本地完成；代理服务只接收用户主动发起的图片或 OCR 文本请求。

## v0.2.0 - 2026-05-08

### 新增

- 新增多第三方 API Provider 配置能力，支持在 `.env.local` 中同时配置多个 OpenAI-compatible API。
- 设置面板新增“API 服务商”下拉框，可以在运行时切换当前使用的 API。
- 切换 API 服务商后，会自动重新请求当前服务商的 `/models` 模型列表。
- 请求失败时，结果窗口会提示当前使用的 API 服务商，并引导用户切换其他 API 后重试。
- 新增主进程 Provider 解析模块，API Key 只在主进程读取和使用，不会返回渲染进程或明文展示。

### 兼容

- 保留旧版单 API 配置：`AI_BASE_URL`、`AI_API_MODE`、`AI_API_KEY` 仍可继续使用。
- 多 API 配置使用 `AI_PROVIDERS` 和 `AI_PROVIDER_<ID>_*`，默认服务商由 `AI_DEFAULT_PROVIDER` 指定。
- 模型选择和思考强度继续由设置界面控制，不再依赖配置文件中的模型字段。

### 验证

- 补充多 API 配置解析和模型列表请求测试。
- 已通过 `npm run typecheck`、`npm run lint`、`npm run test`、`npm run build`。
