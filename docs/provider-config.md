# Provider Configuration

本文档记录第三方 API provider 配置方式。代理/ngrok 运维见 `docs/proxy.md`。

## 支持的协议

`AI_API_TYPE` 或 `AI_PROVIDER_<ID>_API_TYPE` 支持：

- `openai-compatible`
- `gemini`
- `anthropic`

不填写时默认 `openai-compatible`。

## 单 provider 示例

```text
AI_BASE_URL=https://api.example.com/v1
AI_API_MODE=responses
AI_API_TYPE=openai-compatible
AI_API_KEY=你的第三方 API Key
```

`AI_API_MODE` 只对 `openai-compatible` 生效，可选：

- `responses`
- `chat-completions`

Gemini 和 Anthropic 会忽略 `AI_API_MODE`，走各自原生协议。

## 多 provider 示例

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

## Gemini 原生示例

```text
AI_PROVIDERS=makelove
AI_DEFAULT_PROVIDER=makelove
AI_PROVIDER_MAKELOVE_NAME=Makelove Gemini
AI_PROVIDER_MAKELOVE_BASE_URL=https://你的-makelove-地址/v1beta
AI_PROVIDER_MAKELOVE_API_TYPE=gemini
AI_PROVIDER_MAKELOVE_API_KEY=你的 Makelove Key
```

## Anthropic 原生示例

```text
AI_PROVIDERS=makelove
AI_DEFAULT_PROVIDER=makelove
AI_PROVIDER_MAKELOVE_NAME=Makelove Claude
AI_PROVIDER_MAKELOVE_BASE_URL=https://你的-makelove-地址/v1
AI_PROVIDER_MAKELOVE_API_TYPE=anthropic
AI_PROVIDER_MAKELOVE_API_KEY=你的 Makelove Key
```

## 模型列表

- OpenAI-compatible 和 Anthropic 默认请求 `GET /models`。
- Gemini 默认请求 `GET /models` 并读取 `models[].name`。
- 如果 Base URL 是服务商根地址且 `/models` 返回网页，应用会再尝试 `GET /v1/models`。

## 思考程度

思考程度由 `src/shared/reasoning.ts` 统一归一化：

- OpenAI-compatible：映射到 `reasoning_effort` 或 Responses API 的 `reasoning.effort`。
- Claude / Anthropic：新模型优先使用 `thinking: { type: "adaptive" }` 和 `output_config.effort`；旧模型回退到 `thinking.budget_tokens`。
- Gemini 3：使用 `thinkingLevel`。
- Gemini 2.5：使用 `thinkingBudget`。

设置面板只展示当前服务商和模型可用的档位；主进程和代理服务在发送请求前会再次归一化。

## 安全约定

- API Key 只在主进程或代理服务端读取和使用。
- API Key 不回填设置面板，不进入 renderer `localStorage`。
- 诊断报告、导出 Markdown、公告和日志不得输出 API Key 明文。
- 当前实现会拒绝 `api.openai.com` 这类 OpenAI 官方 API 地址，避免误配回官方接口。
