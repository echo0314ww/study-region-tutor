# 0005 App.tsx Hook 架构拆分

## Status

Accepted

## Context

`App.tsx` 增长到约 1876 行，包含 43 个 `useState`、37 个 `useCallback` 和 16 个 `useEffect`，维护成本高、职责模糊。不同业务逻辑（API 设置、讲解会话、学习库、截图流程、向导、诊断、确认弹窗）交织在同一个文件中，修改一个功能容易影响其他功能。

## Decision

将 `App.tsx` 的状态和业务逻辑拆分为 7 个自定义 Hook，主文件仅保留布局编排和 Hook 组合：

| Hook | 职责 |
| --- | --- |
| `useApiSettings` | API 连接模式、服务商、模型列表、代理验证 |
| `useExplainSession` | 截图讲解、OCR 发送、追问、流式请求管理 |
| `useStudyLibrary` | 学习库 CRUD、自动保存、备份导入导出 |
| `useCaptureFlow` | 截图模式状态切换、区域确认 |
| `useGuides` | 功能向导显隐控制 |
| `useDiagnostics` | 一键诊断状态管理 |
| `useConfirmDialog` | 确认弹窗（退出、删除、清空） |

拆分粒度按功能域划分，每个 Hook 对外只暴露状态和操作函数。Hook 之间通过参数传递交互（如 `useExplainSession` 接收当前 API 设置），不直接互相引用内部状态。

## Consequences

- `App.tsx` 从 ~1876 行精简为 ~250 行布局编排代码。
- 各功能域可以独立阅读、测试和修改。
- 新增功能时容易确定代码应放在哪个 Hook。
- Hook 之间的依赖通过参数明确传递，不存在隐式耦合。
- 已有的 `useAnnouncements`、`usePointerInteractions`、`useUpdateStatus`、`useTheme` 保持不变，与新 Hook 并列使用。
