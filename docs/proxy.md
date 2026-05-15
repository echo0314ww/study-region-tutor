# Proxy And Ngrok

本文档记录代理服务、ngrok、代理 Token、多 Token 和限流配置。provider 协议配置见 `docs/provider-config.md`。

## 使用场景

代理模式适合维护者把第三方 API Key 保留在自己的电脑或服务器上，用户端只配置代理地址和访问 Token。截图和 OCR 仍在用户电脑本地完成，代理服务只处理用户主动发起的模型请求。

## 基础配置

在维护者机器的 `.env.local` 中配置：

```text
TUTOR_PROXY_PORT=8787
TUTOR_PROXY_TOKEN=换成一段足够长的随机字符串
NGROK_AUTHTOKEN=你的 ngrok authtoken
TUTOR_PUBLIC_PROXY_URL=https://xxxx.ngrok-free.app
```

`TUTOR_PUBLIC_PROXY_URL` 可由 `npm run ngrok:dev` 自动写回。

## 多 Token 与限流

旧版单 Token 配置仍可使用：

```text
TUTOR_PROXY_TOKEN=换成一段足够长的随机字符串
```

给多个用户分配独立 Token 时，使用具名 Token：

```text
TUTOR_PROXY_TOKENS=student_a,student_b,guest,admin
TUTOR_PROXY_TOKEN_STUDENT_A=给 student_a 的长随机 Token
TUTOR_PROXY_TOKEN_STUDENT_B=给 student_b 的长随机 Token
TUTOR_PROXY_TOKEN_GUEST=给 guest 的长随机 Token
TUTOR_PROXY_TOKEN_ADMIN=给 admin 的长随机 Token

TUTOR_PROXY_RATE_LIMIT_PER_MINUTE=20
TUTOR_PROXY_RATE_LIMIT_BURST=5

TUTOR_PROXY_RATE_LIMIT_STUDENT_A_PER_MINUTE=30
TUTOR_PROXY_RATE_LIMIT_STUDENT_A_BURST=8
```

限流只作用于需要 Token 的 API 代理接口，不影响公开的 `/health` 和公告接口。

## 启动代理

```bash
npm run proxy:dev
```

服务监听 `0.0.0.0:<TUTOR_PROXY_PORT>`，并输出本机、局域网和公网地址。公开接口：

```text
GET /health
GET /announcements/latest
GET /announcements/stream
```

需要 Token 的接口：

```text
GET /providers
POST /models
POST /explain/stream
POST /follow-up/stream
```

## 配置热更新

代理服务通过 `server/runtime-env.mjs` 读取运行配置，优先级为：

1. 命令行/系统环境变量
2. `.env.local`
3. `.env`

`proxy:dev` 会监听 `.env` / `.env.local` 的创建、删除、重命名、内容修改和编辑器原子替换。配置无效时，`/health` 和 API 代理接口会返回配置错误，不再沿用旧 provider。

如果运行中修改 `TUTOR_PROXY_PORT`，代理服务会尝试关闭旧监听并切换到新端口；切换失败时会回到旧端口并把 `/health` 标记为配置错误。

## ngrok

公网访问需要同时运行：

```bash
npm run proxy:dev
npm run ngrok:dev
```

`ngrok:dev` 会读取 `.env.local` 的 `NGROK_AUTHTOKEN` 和 `TUTOR_PROXY_PORT`，先确认本地 `/health` 可访问，再启动隧道并写回 `TUTOR_PUBLIC_PROXY_URL`。

如果 `NGROK_AUTHTOKEN` 或 `TUTOR_PROXY_PORT` 变化，`ngrok:dev` 会重新检查本地代理端口，确认可访问后再重启隧道。

## 用户端配置

1. 打开设置页。
2. 把“API 连接模式”切换为“代理服务”。
3. 首次使用时填写维护者分配的代理 Token。
4. 点击“刷新代理服务商”。
5. 选择服务商和模型。

刷新代理服务商成功后，应用会把代理 Token 保存在用户本机主进程安全存储路径。服务端 Token 更换后，旧 Token 会被拒绝，应用会清除旧 Token 并提示重新填写。

## 排障顺序

1. 访问 `http://127.0.0.1:8787/health`，确认本机代理在线。
2. 局域网用户访问 `http://维护者局域网IP:8787/health`。
3. 公网用户访问 ngrok HTTPS 地址的 `/health`。
4. 检查 Windows 防火墙是否允许 Node.js 入站连接。
5. 检查 `.env.local` 是否含有有效 provider 配置。
6. 检查用户 Token 是否仍有效。
