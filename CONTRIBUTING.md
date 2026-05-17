# 贡献指南

感谢你对 Study Region Tutor 的关注！以下指南可以帮助你快速参与项目开发。

## 环境要求

- Node.js >= 18.0.0
- npm（随 Node.js 安装）
- Git

## 快速开始

1. Fork 并克隆仓库：
   ```bash
   git clone https://github.com/echo0314ww/study-region-tutor.git
   cd study-region-tutor
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 启动开发服务器：
   ```bash
   npm run dev
   ```

## 项目结构

```
src/
  main/           - Electron 主进程（窗口管理、IPC、系统 API、OCR、API 请求）
  preload/        - 安全暴露给渲染层的 IPC API
  renderer/src/
    components/   - React UI 组件
    hooks/        - 自定义 Hook（useApiSettings、useExplainSession、useStudyLibrary 等）
    i18n/         - 国际化翻译文件和类型定义
  shared/         - 主进程与渲染层共享的类型和工具函数
server/           - 代理服务和 ngrok 托管脚本
tests/            - Vitest 单元测试
docs/             - 专题文档、架构决策和开发日志
```

## 代码规范

- **TypeScript 严格模式**：项目全局启用，所有代码必须通过类型检查。
- **ESLint**：必须通过 `npm run lint` 检查。
- **国际化**：界面文本使用 `src/renderer/src/i18n/` 中的翻译系统，不要硬编码用户可见字符串。
  - 使用 `const { t } = useTranslation()` 获取翻译函数
  - 非组件 Hook 或 `App.tsx` 中按设置语言取文案时使用 `translateMessage(locale, key, params?)`
  - 新增界面文案需同时添加 `zh-CN.ts` 和 `en.ts` 翻译
  - 历史版本向导内容集中维护在 `src/renderer/src/guides.ts`，按版本内容源同步更新
- **函数应小而专注**：优先使用组合而非继承。
- **命名有意义**：变量和函数名应能自解释。

## 运行验证

```bash
# 运行全部测试
npm test

# 运行测试并生成覆盖率报告
npm run test:coverage

# 基础验证（类型检查 + Lint + 测试 + 文档检查 + 安全检查）
npm run validate
```

发布前还需要额外运行 `npm run build` 和脚本语法检查，具体以 `docs/release-checklist.md` 为准。

## 提交 Pull Request

1. 从 `main` 创建功能分支：
   ```bash
   git checkout -b feat/你的功能 main
   ```

2. 完成修改后确保验证通过：
   ```bash
   npm run validate
   ```

3. 提交时写清楚、有描述性的提交消息。

4. 推送分支并向 `main` 发起 Pull Request。

5. PR 描述中请说明：
   - 改动内容
   - 为什么需要这个改动
   - 如何测试的

## 文档同步

改动涉及用户可见变化时，请同步检查以下文档是否需要更新：

- `CHANGELOG.md` — 开发者视角版本记录
- `RELEASE_NOTES.md` — 面向用户的简要说明
- `README.md` — 快速入口
- `src/renderer/src/guides.ts` — 应用内向导

详细规则见 `docs/documentation-policy.md`。

## 安全边界

- 不要提交 `.env.local`、API Key、代理 Token 等敏感信息
- API Key 只在主进程或代理服务端使用，不进入渲染层
- 导出文件和诊断报告必须脱敏

## 有问题？

欢迎在 [Issues](https://github.com/echo0314ww/study-region-tutor/issues) 提问或反馈。
