# 0004 Proxy Security Boundary

## Status

Accepted

## Context

代理服务允许用户通过维护者机器或服务器使用第三方 API，但不能把第三方 API Key 下发给用户端。

## Decision

代理服务公开接口不需要 Token：

- `GET /health`
- `GET /announcements/latest`
- `GET /announcements/stream`

API 代理接口必须需要 Token：

- `GET /providers`
- `POST /models`
- `POST /explain/stream`
- `POST /follow-up/stream`

代理服务只返回脱敏 provider 信息和模型列表，不返回 API Key。日志、健康检查和诊断只显示 Token 数量、限流状态和脱敏错误。

## Consequences

- 用户只需要代理地址和代理 Token。
- 公告可公开读取。
- API Key 保留在维护者端。
- 代理相关改动必须同步检查鉴权和脱敏路径。
