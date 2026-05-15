# 0002 Sensitive Config Boundary

## Status

Accepted

## Context

项目会使用第三方 API Key、代理 Token、ngrok Token 和 GitHub token。应用同时有主进程、渲染层、代理服务、诊断报告、导出文件和公告系统。

## Decision

敏感配置只允许存在于用户本地配置文件、系统环境变量、主进程安全存储路径或代理服务端运行环境。

敏感信息不得写入：

- renderer `localStorage`
- 导出 Markdown
- 诊断报告明文
- 公告文件
- 文档示例中的真实值
- Git 仓库

## Consequences

- 设置页可以显示“是否已配置”，但不能回填 API Key 明文。
- 代理 Token 可由主进程安全存储保存，但不能进入普通前端存储。
- 文档示例只能使用占位符。
- `docs:check` 应尽量扫描常见真实密钥模式。
