# Project Context

这个文档用于新对话快速恢复当前项目状态。完整文档入口见 `docs/START_HERE.md`。

## 当前版本

- 当前版本：`1.4.0`。
- GitHub 仓库：`echo0314ww/study-region-tutor`。
- 最近发布提交：准备 `Release v1.4.0`。
- 当前 Unreleased 改动：暂无，v1.4.0 发布材料已归档。

## 项目定位

- 项目名：Study Region Tutor。
- 技术栈：Electron + React + TypeScript。
- 用途：学习辅助工具，支持框选屏幕区域、截图、识别题目并给出学习性讲解。
- 安全边界：不要实现隐藏窗口、绕过监控、自动提交答案、自动点击网页、规避检测等考试作弊能力。
- 默认提示词应强调“思路、步骤、关键概念”；遇到正式考试、竞赛、测验或受限制平台时，只给学习性讲解和建议。

## 已完成能力

- 拖拽截图，框选后先确认，确认后才裁剪并发送识别。
- 跨显示器框选会按显示器裁剪并合成完整 PNG。
- 默认直接发送图片；图片接口失败时退回本地 OCR，并先展示可编辑 OCR 结果确认页。
- OCR worker 按语言复用并在空闲后释放。
- OCR 支持自动增强、不增强、对比度、二值化和多路增强预处理模式。
- 本题追问使用内存会话，不重新发送原始截图。
- 结果面板支持复制答案和导出答案，默认不包含截图或敏感配置。
- 结果面板支持对当前题标记复习反馈，学习库会记录复习次数、答对/答错次数、下次复习时间、难度和易错原因。
- 设置页支持一键诊断、整体功能向导、本版本新增向导和历史版本向导回顾。
- 设置页支持首次配置向导、代理管理面板、快捷键自定义、学习库/错题本、Provider 配置生成器、Prompt 模板和模型/Prompt 评测。
- 学习库支持待处理/复习、错题筛选、结构化知识点/题型/难度/关键点/易错点归类，以及 Markdown、Anki CSV、Obsidian 当前筛选结果批量导出。
- 一键诊断支持快速诊断和会实际请求文本讲解接口的深度测试。
- 一键诊断和发布流程包含安全边界检查；`npm run security:check` 会检查持久化白名单、BrowserWindow 安全选项和导出隐私提示。
- 答案渲染会转义普通 HTML 文本，KaTeX 渲染不信任公式源码中的危险链接协议，也不会保留辅助 annotation 中的原始 TeX。
- 非敏感设置会保存到渲染层版本化 `localStorage`；API Key 和代理 Token 不进入普通 `localStorage`。
- 支持本地直连和代理服务。
- 支持 OpenAI-compatible、Gemini 原生和 Anthropic 原生 provider。
- 支持多 provider、模型列表刷新、按 provider/model 动态显示思考程度。
- 代理服务支持多 Token、限流、配置热更新、端口热切换和 ngrok 健康检查。
- 公告系统支持版本更新公告、私人公告和按分类分组，公告不会自动弹出。
- Renderer 有基础 CSP；BrowserWindow 保持 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、`webSecurity: true`。
- 支持暗色模式（亮色、暗色、跟随系统）；CSS 全面使用语义化变量，`[data-theme="dark"]` 覆写暗色值。
- 已建立中英文 i18n 基础设施；核心操作界面、提示和状态文案已接入翻译系统，App/hooks 可通过 `translateMessage` 使用翻译文本；历史版本向导内容仍按中文源维护。
- App.tsx 通过 7 个自定义 Hook 拆分（useApiSettings、useExplainSession、useStudyLibrary、useCaptureFlow、useGuides、useDiagnostics、useConfirmDialog），主文件仅保留布局编排。
- 错题统计仪表盘展示学科雷达图、知识点/易错点柱形图和统计卡片（纯 CSS + SVG 实现）。
- 学习数据支持 JSON 备份导出和导入，导入时可选择替换、合并优先导入或合并优先本地三种策略。
- 无障碍：焦点陷阱（公告/向导/配置向导面板）、`:focus-visible` 轮廓、`prefers-reduced-motion` 禁用动画、危险操作按钮样式区分。
- SSRF 防护覆盖 IPv6 保留地址；代理上游请求有 120 秒超时；proxyClient 有 30 秒默认超时。
- 提取 `apiShared.ts` 消除 openaiClient/proxyClient 元数据解析和上下文截断重复代码。

## 当前文档体系

- `docs/START_HERE.md`：新账号、新对话或新 Codex 会话唯一入口。
- `README.md`：快速使用、基础配置、验证和文档入口。
- `docs/architecture.md`：架构边界、模块职责、IPC、隐私与安全约定。
- `docs/codex-handoff.md`：Codex 接手和协作规范。
- `docs/documentation-policy.md`：文档更新矩阵和版本材料分工。
- `docs/release.md`：正式发布流程。
- `docs/release-checklist.md`：功能完成和发布前检查清单。
- `docs/proxy.md`：代理、ngrok、Token、限流和排障。
- `docs/provider-config.md`：第三方 provider 协议配置。
- `docs/announcements.md`：公告格式和版本公告规范。
- `docs/decisions/`：架构和流程决策记录。
- `docs/templates/`：dev-log、发布检查、ADR 和用户可见变化模板。
- `docs/dev-log/YYYY-MM-DD.md`：重要实施过程记录。

## 硬性约束

- 不读取、提交或复制 `.env.local`、API Key、代理 Token、ngrok Token、GitHub token。
- API Key 只在主进程或代理服务端读取和使用。
- 代理 Token 可保存在主进程安全存储路径，但不能进入普通前端存储。
- 诊断报告、导出 Markdown、公告和日志不得输出敏感明文。
- 涉及用户可见变化时，必须检查 `src/renderer/src/guides.ts`：本版本新增向导、历史版本向导回顾、整体功能向导。
- 已发布版本的新增向导条目继续保留，不要删除。
- 当前 Unreleased 用户可见变化不写入已发布版本向导；正式发布归档时再统一判断并补齐 `src/renderer/src/guides.ts`。
- 发布统一走 GitHub Actions，不在本机手动发布 GitHub Release。
- 发布工作流路径：`.github/workflows/release-windows.yml`。
- Windows 发布工作流不保留手动发布入口，并会校验 tag；只有 `vX.Y.Z` 格式继续执行正式发布。
- GitHub Actions 使用仓库自带 `GITHUB_TOKEN`；不需要 Personal Access Token。
- GitHub Actions 发布成功后，本机再运行 `npm run dist` 同步 `release/`。

## 发布流程摘要

发布前更新：

- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `RELEASE_NOTES.md`
- `announcements/releases.json`
- `PROJECT_CONTEXT.md`
- 必要时更新 `src/renderer/src/guides.ts` 和 `tests/guides.test.ts`

验证：

```bash
npm run docs:check
npm run typecheck
npm run lint
npm run test
npm run build
npm run security:check
node --check server/proxy-server.mjs
node --check server/ngrok-dev.mjs
node --check server/runtime-env.mjs
node --check scripts/sync-release-notes.mjs
```

发布：

```bash
git add -A
git commit -m "Release vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main vX.Y.Z
```

发布后运行：

```bash
npm run dist
```

并确认 `release/latest.yml` 指向当前版本。

## 新任务起步命令

```bash
git status --short --branch
npm run docs:check
npm run typecheck
npm run lint
```

当前 Windows Codex 环境中，`npm run test`、`npm run build`、`npm run dist` 偶尔会因为 esbuild `spawn EPERM` 失败；提升权限重跑通常可以通过。

## 最近注意事项

- 文档体系正在从“大 README + 长 PROJECT_CONTEXT”迁移为“START_HERE + 专题文档 + 自动校验”。
- README 应保持快速入口，不再承载完整代理、公告和发布手册。
- PROJECT_CONTEXT 应保持当前状态卡片，不再积累完整历史 changelog。
- 长期有效的流程和约束应沉淀到 `docs/` 专题文档或 `docs/decisions/`。
