import type { GuideDefinition, GuideKind } from './uiTypes';

export function productGuide(version: string): GuideDefinition {
  return {
    kind: 'product',
    version,
    title: '整体功能向导',
    subtitle: '快速熟悉截图、识别、追问、诊断和导出流程。',
    steps: [
      {
        title: '从截图开始',
        body: '点击顶部“截图”后，按住鼠标拖出题目区域，松开后先确认范围。只有点击“确认识别”后，应用才会截图并开始讲解。',
        action: '如果框错了，可以右键、Esc 或点击“重选截图”取消。'
      },
      {
        title: '选择合适的输入方式',
        body: '默认会直接把框选图片发给配置好的第三方 API。服务商不支持图片时，应用会自动转到本地 OCR，并让你先检查识别文本。',
        action: '如果题目里公式较多，可以开启“数学公式增强”。'
      },
      {
        title: '配置 API 连接',
        body: '本地直连会读取这台电脑上的第三方 API 配置；代理服务只需要填写开发者提供的 TUTOR_PROXY_TOKEN，API Key 留在代理服务端。',
        action: '普通用户优先使用代理服务，本机开发调试再使用本地直连。'
      },
      {
        title: '用诊断报告排错',
        body: '设置页提供“一键诊断”，会检查配置文件、代理地址、Token、服务商、模型列表和当前模型，并给出失败原因和修复建议。',
        action: '出错时先复制诊断报告，再发给维护者排查。'
      },
      {
        title: '围绕本题追问',
        body: '首次讲解完成后，可以在结果窗口底部继续追问。应用只发送本题文字上下文和问答历史，不会重新发送原始截图。',
        action: '点击“截图下一题”会结束当前题目并进入新的框选流程。'
      },
      {
        title: '导出学习记录',
        body: '结果窗口底部支持复制答案或导出答案，默认只包含文字讲解和追问记录，不包含截图、API Key、代理 Token 或代理地址。',
        action: '适合把解题思路整理到笔记软件中。'
      }
    ]
  };
}

export function releaseGuide(version: string): GuideDefinition {
  return {
    kind: 'release',
    version,
    title: '本版本新增向导',
    subtitle: '当前版本暂未配置单独的新增功能向导，后续版本会在这里展示变更说明。',
    steps: []
  };
}

export function guideDefinition(kind: GuideKind, version: string): GuideDefinition {
  return kind === 'release' ? releaseGuide(version) : productGuide(version);
}

export function hasGuideContent(kind: GuideKind, version: string): boolean {
  return guideDefinition(kind, version).steps.length > 0;
}
