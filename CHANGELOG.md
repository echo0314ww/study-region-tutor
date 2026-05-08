# 版本更新记录

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
