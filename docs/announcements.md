# Announcements

公告功能复用代理服务，不需要额外端口。公告接口公开，不需要代理 Token；API 代理接口仍需要 Token。

## 文件分工

```text
announcements/releases.json  # 版本更新公告
announcements/current.json   # 私人公告
```

代理服务默认先读取版本更新公告，再读取私人公告，并合并两个文件中可见公告。版本公告排在私人公告前；如果两个文件出现相同 `id`，保留先读取到的版本公告。

## 推荐格式

```json
{
  "allAnnouncement": ["release-v1.1.2"],
  "announcements": [
    {
      "id": "release-v1.1.2",
      "title": "v1.1.2 更新说明",
      "content": "- 新增功能 A。\n- 修复问题 B。",
      "level": "建议查看",
      "publishedAt": "2026-05-14 21:34"
    }
  ]
}
```

`announcements` 是公告池，`allAnnouncement` 是当前实际展示的公告 ID 列表。应用只显示 `allAnnouncement` 中列出的公告，并按数组顺序排列。

兼容字段：

- `visibleAnnouncementIds`
- `"all announcement"`

如果缺少这些字段，则显示 `announcements` 中全部公告。

## 版本公告规范

- ID 使用 `release-vX.Y.Z`，例如 `release-v1.1.2`。
- 标题使用 `vX.Y.Z 更新说明`。
- 每次发布时，把新版本 ID 放到 `announcements/releases.json` 的 `allAnnouncement` 第一位。
- `content` 面向普通用户，保持简短，不写内部实现细节。
- 不写 API Key、Token、账号密码、私密地址或个人凭据。

## 客户端展示规则

- `release-` 开头的版本公告默认折叠，点击标题后展开详情。
- 私人公告默认直接展示正文。
- `level` 可填写任意文本；留空时客户端只显示发布时间。
- `warning` 和 `critical` 会触发强调样式。
- 公告不会自动弹出。
- 代理服务会基于合并后的可见公告生成 `revision` 哈希；客户端只在哈希变化时显示未读红点。

## 发布联动

发布新版本时必须同时检查：

- `RELEASE_NOTES.md` 有对应版本。
- `announcements/releases.json` 有对应 `release-vX.Y.Z`。
- `allAnnouncement[0]` 是当前版本公告。
- `scripts/check-docs.mjs` 能通过。
