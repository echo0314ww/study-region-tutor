# Documentation Policy

本文档定义文档更新规则，目标是减少重复、避免版本漂移，并保证新账号/新对话能清晰接手。

## 核心原则

- 每个事实只保留一个权威位置，其他文档只链接或摘要。
- README 面向快速使用，不承载完整运维和发布手册。
- PROJECT_CONTEXT 面向新对话恢复状态，不承载历史 changelog。
- 架构决策写入 `docs/decisions/`，不要只留在聊天记录里。
- 重要实施过程写入 `docs/dev-log/YYYY-MM-DD.md`，长期有效的结论要沉淀回专题文档。
- 发布材料必须自动校验，不能只靠人工记忆。

## 文档更新矩阵

| 改动类型 | 必改 | 可能需要 |
| --- | --- | --- |
| 用户可见 UI、截图、OCR、追问、设置页 | `CHANGELOG.md`、`RELEASE_NOTES.md`、`README.md`、`src/renderer/src/guides.ts` | `PROJECT_CONTEXT.md`、`tests/guides.test.ts` |
| 代理、ngrok、Token、限流 | `docs/proxy.md`、`docs/proxy-config.example.env`、`CHANGELOG.md` | `README.md`、`docs/architecture.md`、`docs/release-checklist.md` |
| provider 协议或模型参数 | `docs/provider-config.md`、`docs/architecture.md`、`CHANGELOG.md` | `README.md`、相关测试 |
| 公告格式或公告行为 | `docs/announcements.md`、`announcements/releases.json` | `README.md`、`RELEASE_NOTES.md` |
| 发布流程 | `docs/release.md`、`docs/release-checklist.md`、`docs/codex-handoff.md` | `PROJECT_CONTEXT.md` |
| 架构边界或 IPC 边界 | `docs/architecture.md`、`PROJECT_CONTEXT.md` | `docs/decisions/` |
| 安全/隐私边界 | `docs/architecture.md`、`docs/decisions/` | `README.md`、`docs/release-checklist.md` |
| 文档体系 | `docs/START_HERE.md`、本文档、`scripts/check-docs.mjs` | `README.md`、`docs/codex-handoff.md` |

## 版本相关文档

- `CHANGELOG.md` 面向开发者，记录详细变化。
- `RELEASE_NOTES.md` 面向普通用户，会同步到 GitHub Releases。
- `announcements/releases.json` 面向客户端公告，内容应更短。
- `src/renderer/src/guides.ts` 面向应用内向导，记录用户需要在 UI 中看到的新增入口、新流程、新配置或迁移提示。

发布前必须确认这四处没有互相矛盾。

## dev-log 模板

新增实施记录时，优先使用 `docs/templates/dev-log-template.md`。dev-log 只记录过程和决策背景；如果内容会长期影响维护，应同步更新专题文档或 ADR。

## 校验

每次文档或发布材料变化后运行：

```bash
npm run docs:check
npm run security:check
```

代码改动完成后优先运行：

```bash
npm run validate
```
