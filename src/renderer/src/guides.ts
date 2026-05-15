import type { GuideDefinition, GuideKind, GuideStep, GuideVersionSection } from './uiTypes';

interface ReleaseGuideContent {
  title: string;
  subtitle: string;
  steps: GuideStep[];
}

const releaseGuidesByVersion: Record<string, ReleaseGuideContent> = {
  '1.2.0': {
    title: 'v1.2.0 新增功能',
    subtitle: '复习队列、知识点提取、批量导出、模型评测和 OCR 预处理。',
    steps: [
      {
        title: '学习库可以安排复习',
        body: '学习库新增今日待复习、错题筛选、复习次数、答对/答错次数、下次复习时间、难度和易错原因。',
        action: '在结果面板或学习库里标记“答错了”“有点忘”“答对了”“很熟练”，应用会自动安排下次复习。'
      },
      {
        title: '题目会自动归类',
        body: '讲解完成后，应用会异步提取学科、知识点、题型、难度、关键点、易错点和标签，便于后续搜索和整理。',
        action: '提取失败不会影响当前讲解；学习库仍会保留原有题目文本和对话记录。'
      },
      {
        title: '学习记录更容易带走',
        body: '学习库可以把当前筛选结果批量导出为 Markdown、Anki CSV 或 Obsidian Markdown。',
        action: '导出内容只包含文字记录、复习状态和结构化学习信息，不包含截图、API Key 或代理 Token。'
      },
      {
        title: '模型和 OCR 更可调',
        body: '设置页新增模型评测，可用同一道题比较不同模型和 Prompt 模板；OCR 新增自动增强、对比度、二值化和多路增强模式。',
        action: '发布前检查新增安全边界校验，帮助确认敏感配置不会进入普通存储、诊断报告或导出文件。'
      }
    ]
  },
  '1.1.3': {
    title: 'v1.1.3 新增功能',
    subtitle: '首次配置、快捷键、学习库、OCR 候选和文档体系更新。',
    steps: [
      {
        title: '首次配置更集中',
        body: '首次打开会通过配置向导引导选择本地直连或代理服务、刷新服务商和模型，并确认常用快捷键。',
        action: '设置页顶部可以随时重新打开配置向导。'
      },
      {
        title: '学习库可以管理题目',
        body: '本地历史升级为学习库/错题本，会保存讲解文本、学科、标签、收藏和掌握状态，支持搜索、筛选、恢复、删除和清空。',
        action: '学习库不保存截图、API Key 或代理 Token。'
      },
      {
        title: 'OCR 候选可切换',
        body: 'OCR 确认页会展示多路候选，复杂公式或低清截图可以先切换候选、编辑文本，再发送讲解。',
        action: '如果识别为空或明显错误，建议重新框选更清晰的题目区域。'
      },
      {
        title: '排障和扩展入口更完整',
        body: '设置页新增代理管理、深度诊断、Provider 配置生成器和 Prompt 模板；公告面板支持按分类分组。',
        action: '遇到连接问题时先运行诊断并复制脱敏报告。'
      }
    ]
  },
  '1.1.2': {
    title: 'v1.1.2 新增功能',
    subtitle: '向导回顾、代理热更新、跨屏截图和设置持久化更新。',
    steps: [
      {
        title: '可以回顾历史版本向导',
        body: '设置页新增“历史版本向导回顾”，会按版本保留以往新增功能说明；直接安装最新版时，也能补看之前的变化。',
        action: '本版本新增向导仍只展示当前版本变化，历史回顾由用户在设置页主动打开。'
      },
      {
        title: '代理配置变更立即生效',
        body: '代理服务会监听 .env 和 .env.local 的创建、删除、重命名和内容变化；配置无效时会进入明确错误状态，不再沿用旧 provider。',
        action: '维护者修改 TUTOR_PROXY_PORT 后，ngrok 会确认新端口健康再重启隧道。'
      },
      {
        title: '跨显示器截图更完整',
        body: '跨显示器或负坐标副屏框选时，应用会从多个显示器裁剪并合成完整 PNG，减少识别内容缺失。',
        action: '单显示器截图流程保持不变。'
      },
      {
        title: '常用设置会保留',
        body: '连接模式、服务商、模型名、代理地址、输入方式、OCR 语言和思考程度等非敏感设置会在重启后保留。',
        action: 'API Key 和代理 Token 不会写入普通 localStorage。'
      }
    ]
  },
  '1.1.1': {
    title: 'v1.1.1 新增功能',
    subtitle: '复制导出、思考档位和原生协议支持更新。',
    steps: [
      {
        title: '复制和导出移到底部',
        body: '回答窗口底部现在有“复制答案”和“导出答案”，会和发送追问、截图下一题、结束本题放在同一个操作区。',
        action: '导出内容仍是 Markdown 文本记录，默认不包含截图、API Key、代理 Token 或代理地址。'
      },
      {
        title: '思考程度按模型变化',
        body: '设置页会根据当前服务商和模型显示可用档位，不再固定显示同一组选项。Claude Opus 4.6 可选择 max，Gemini 会使用对应的 thinking 参数。',
        action: '不确定该选哪档时，保持“使用模型默认”即可。'
      },
      {
        title: '原生 Gemini 和 Claude 支持',
        body: '本地直连和代理服务都可以按 OpenAI-compatible、Gemini 或 Anthropic 原生协议配置服务商，Makelove 等聚合服务商也可以按实际协议接入。',
        action: '普通用户使用代理服务时通常不需要改配置；维护者可在配置模板中查看 AI_API_TYPE 示例。'
      }
    ]
  },
  '1.1.0': {
    title: 'v1.1.0 新增功能',
    subtitle: '诊断、向导、导出和代理 Token 管理更新。',
    steps: [
      {
        title: '一键诊断',
        body: '设置页新增“一键诊断”，会检查配置文件、代理地址、代理 Token、服务商、模型列表和当前模型。',
        action: '遇到连接失败时，先复制脱敏诊断报告再发给维护者。'
      },
      {
        title: '功能向导入口',
        body: '版本变化后首次打开会显示整体功能向导，设置页顶部也可以重新打开整体功能向导和本版本新增向导。',
        action: '如果跳过了向导，可以随时从设置页重新查看。'
      },
      {
        title: '答案记录导出',
        body: '结果面板支持复制和导出当前题目的讲解与追问记录，方便整理到笔记软件。',
        action: '导出默认不包含截图、API Key、代理 Token 或代理地址。'
      },
      {
        title: '代理多 Token 和限流',
        body: '代理服务支持多个具名 Token，并可按 Token 配置限流，适合维护者给不同用户分配访问额度。',
        action: '普通用户仍只需要填写维护者提供的代理 Token。'
      }
    ]
  },
  '1.0.3': {
    title: 'v1.0.3 新增功能',
    subtitle: '截图确认、窗口避让和追问体验更新。',
    steps: [
      {
        title: '拖拽截图先确认',
        body: '点击“截图”后，按住鼠标拖出题目区域，松开后先确认范围，点击“确认识别”后才开始识别。',
        action: '框错时可以右键、Esc 或点击“重选截图”取消。'
      },
      {
        title: '下一题时先隐藏结果窗',
        body: '点击“截图下一题”或“结束本题”后，结果窗口会先隐藏并进入截图模式，减少框选下一题时的遮挡。',
        action: '下一题确认识别后，结果窗口会重新显示。'
      },
      {
        title: '长回答更容易浏览',
        body: '回答正文开始出现后会隐藏处理过程，长回答滚动离开底部时会显示“跳到底部”。',
        action: '选择题或长解析可以直接跳到末尾查看结论。'
      },
      {
        title: '追问更像对话',
        body: '本题追问中的用户消息改为右对齐，助手讲解保持左侧文档式排版。',
        action: '同一题内继续追问时更容易区分双方内容。'
      }
    ]
  },
  '1.0.2': {
    title: 'v1.0.2 新增功能',
    subtitle: 'OCR 确认、公式显示和窗口拖动更新。',
    steps: [
      {
        title: 'OCR 结果先确认',
        body: '本地 OCR 模式和图片接口失败后的 OCR 兜底都会先展示识别文本，用户可以编辑后再发送讲解。',
        action: '题目截图模糊或公式复杂时，先修正识别文本可以减少误答。'
      },
      {
        title: '图片失败不自动误发',
        body: '图片直传失败时，应用会转为本地 OCR 并等待你确认文本，不会自动把可能有误的 OCR 内容继续发给模型。',
        action: '确认后才会创建本题会话并保留追问能力。'
      },
      {
        title: '数学公式显示升级',
        body: '回答中的分数、根号、上下标等公式会用 KaTeX 渲染，常见普通文本公式也会尽量转成公式块显示。',
        action: '应用会自动隐藏重复的公式标签和扁平公式文本。'
      },
      {
        title: '窗口可以拖动摆放',
        body: '顶部工具栏和设置面板支持拖动位置，本地直连配置指引会显示实际读取的配置文件路径。',
        action: '可以把工具栏或设置面板移到不遮挡题目的位置。'
      }
    ]
  },
  '1.0.1': {
    title: 'v1.0.1 新增功能',
    subtitle: '本地直连配置位置和失败指引调整。',
    steps: [
      {
        title: '配置文件位置固定',
        body: '本地直连会固定读取用户配置目录中的 .env.local 或 .env，开发运行时仍支持项目根目录配置。',
        action: '设置页会显示实际路径，方便复制和检查。'
      },
      {
        title: '配置失败更清晰',
        body: '本地直连缺少配置或模型列表刷新失败时，设置页只保留应用更新、连接模式和配置指引。',
        action: '普通用户不会再看到大段技术错误或后续无效设置项。'
      }
    ]
  },
  '1.0.0': {
    title: 'v1.0.0 新增功能',
    subtitle: '退出、公告、代理 Token 保存和更新流程调整。',
    steps: [
      {
        title: '可以从工具栏退出',
        body: '顶部工具栏新增退出应用按钮，点击并二次确认后即可关闭应用。',
        action: '避免需要从系统托盘或任务管理器关闭。'
      },
      {
        title: '公告面板上线',
        body: '公告分为版本更新公告和私人公告，版本公告默认折叠，点击标题后展开详情。',
        action: '公告不会自动弹出，红点只提示有未读内容。'
      },
      {
        title: '代理 Token 可本机保存',
        body: '代理服务模式首次成功填写 Token 后会保存在本机，后续打开应用可以直接使用。',
        action: '如果服务端 Token 更换，应用会提示重新填写。'
      },
      {
        title: '更新由用户确认安装',
        body: '检查更新发现新版本后，不再自动下载安装包。需要点击“立即更新”下载，下载完成后再点击“重启安装”。',
        action: '避免应用在用户不知情时自动切换版本。'
      }
    ]
  },
  '0.5.0': {
    title: 'v0.5.0 新增功能',
    subtitle: 'ngrok 托管、代理健康信息和设置简化。',
    steps: [
      {
        title: 'ngrok 托管脚本',
        body: '新增 npm run ngrok:dev，可读取本机配置启动公网隧道，并把公网代理地址写回配置文件。',
        action: '维护者给远程用户提供代理时，可以同时运行 proxy:dev 和 ngrok:dev。'
      },
      {
        title: '代理健康信息更完整',
        body: '代理 /health 会返回本机、局域网和公网访问地址，方便确认用户应该连接哪个入口。',
        action: '诊断连接问题时先看代理服务是否在线。'
      },
      {
        title: '高级设置更聚焦',
        body: '普通设置页默认隐藏远程服务地址，高级设置只保留代理地址输入、连接验证和恢复默认地址。',
        action: '普通用户只关注连接状态，维护者再进入高级设置调试。'
      },
      {
        title: '公告连接更安静',
        body: '默认代理离线时，公告请求会在后台重试，不再启动时连续弹出错误。',
        action: '代理未启动时也不会打断用户操作。'
      }
    ]
  },
  '0.4.0': {
    title: 'v0.4.0 新增功能',
    subtitle: '公告能力和更轻量的启动界面。',
    steps: [
      {
        title: '公告功能上线',
        body: '应用可以通过代理服务接收并显示远程公告，公告接口不需要 Token。',
        action: '维护者可以按指定公告 ID 控制用户看到的内容。'
      },
      {
        title: '启动界面更轻量',
        body: '应用启动后默认只显示顶部工具栏，截图框和对话结果窗口改为按需打开。',
        action: '需要截图、查看结果或打开设置时，再从工具栏进入。'
      },
      {
        title: '顶部公告入口',
        body: '工具栏新增公告入口，并支持未读提示。',
        action: '打开公告面板后，当前公告内容会被标记为已读。'
      }
    ]
  },
  '0.3.1': {
    title: 'v0.3.1 新增功能',
    subtitle: '悬浮窗透明区域点击穿透体验优化。',
    steps: [
      {
        title: '透明区域不挡点击',
        body: '识别和讲解过程中，应用透明区域会点击穿透，不再阻挡底层网页或桌面操作。',
        action: '结果窗口、设置窗口和工具栏仍可正常拖动、缩放、滚动和输入。'
      }
    ]
  },
  '0.3.0': {
    title: 'v0.3.0 新增功能',
    subtitle: '代理服务模式上线。',
    steps: [
      {
        title: '通过代理使用第三方 API',
        body: '新增本机局域网代理服务，用户端可以通过代理地址和访问 Token 使用第三方 API。',
        action: '第三方 API Key 留在代理服务端，不下发给用户。'
      },
      {
        title: '连接模式可切换',
        body: '设置页新增 API 连接模式，可以在本地直连和代理服务之间切换。',
        action: '普通用户优先使用维护者提供的代理服务。'
      },
      {
        title: '截图和 OCR 仍在本地',
        body: '代理服务只处理用户主动发起的图片讲解、OCR 文本讲解和追问请求。',
        action: '框选截图和 OCR 识别仍在用户电脑本地完成。'
      }
    ]
  },
  '0.2.0': {
    title: 'v0.2.0 新增功能',
    subtitle: '多 API 服务商配置和运行时切换。',
    steps: [
      {
        title: '配置多个 API 服务商',
        body: '可以在配置文件里同时设置多个 OpenAI-compatible API 服务商，并指定默认服务商。',
        action: '旧版单 API 配置仍然兼容。'
      },
      {
        title: '设置页切换服务商',
        body: '设置页新增 API 服务商选择，切换后会自动重新加载当前服务商的模型列表。',
        action: '请求失败时，错误提示会带上当前服务商，方便切换后重试。'
      },
      {
        title: 'API Key 不进界面',
        body: 'API Key 只在主进程读取和使用，不会返回渲染进程或明文显示到界面。',
        action: '模型选择和思考强度继续由设置界面控制。'
      }
    ]
  },
  '0.1.0': {
    title: 'v0.1.0 新增功能',
    subtitle: '基础截图识别和学习讲解能力。',
    steps: [
      {
        title: '框选题目区域',
        body: '应用提供框选屏幕区域、截图识别和学习讲解的基础流程。',
        action: '默认只处理用户主动框选并确认的题目区域。'
      },
      {
        title: '生成学习性讲解',
        body: '模型回答应侧重思路、步骤和关键概念，帮助理解题目。',
        action: '遇到正式考试、竞赛、测验或受限制平台时，只给学习性讲解和建议。'
      }
    ]
  }
};

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
        title: '沉淀学习记录',
        body: '结果窗口底部支持收藏当前题、标记复习结果、复制答案或导出答案；完成讲解后也会自动保存到学习库，便于后续搜索、复习和标记掌握状态。',
        action: '学习库支持待复习筛选、错题筛选、批量 Markdown/Anki/Obsidian 导出，导出内容默认不包含截图、API Key、代理 Token 或代理地址。'
      }
    ]
  };
}

export function releaseGuide(version: string): GuideDefinition {
  const release = releaseGuidesByVersion[version];

  return {
    kind: 'release',
    version,
    title: '本版本新增向导',
    subtitle: release?.subtitle || '当前版本暂未配置单独的新增功能向导，后续版本会在这里展示变更说明。',
    steps: release?.steps || []
  };
}

export function historyGuide(version: string): GuideDefinition {
  const historyVersions = releaseGuideHistory(version);

  return {
    kind: 'history',
    version,
    title: '历史版本向导回顾',
    subtitle: '按版本回顾以往新增功能，适合直接安装最新版后快速补看变化。',
    steps: [],
    historyVersions
  };
}

export function releaseGuideHistory(version: string): GuideVersionSection[] {
  return releaseGuideVersionList()
    .filter((guideVersion) => shouldIncludeInHistory(guideVersion, version))
    .map((guideVersion) => ({ version: guideVersion, ...releaseGuidesByVersion[guideVersion] }));
}

export function releaseGuideVersionList(): string[] {
  return Object.keys(releaseGuidesByVersion).sort(compareVersions).reverse();
}

export function guideDefinition(kind: GuideKind, version: string): GuideDefinition {
  if (kind === 'history') {
    return historyGuide(version);
  }

  return kind === 'release' ? releaseGuide(version) : productGuide(version);
}

export function hasGuideContent(kind: GuideKind, version: string): boolean {
  const guide = guideDefinition(kind, version);
  return guide.steps.length > 0 || Boolean(guide.historyVersions?.length);
}

function shouldIncludeInHistory(guideVersion: string, currentVersion: string): boolean {
  const comparison = compareVersions(guideVersion, currentVersion);

  if (Number.isNaN(comparison)) {
    return true;
  }

  return comparison < 0;
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  if (!leftParts || !rightParts) {
    return Number.NaN;
  }

  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function parseVersion(version: string): number[] | null {
  const normalized = version.trim().replace(/^v/i, '');

  if (!/^\d+(?:\.\d+)*$/.test(normalized)) {
    return null;
  }

  return normalized.split('.').map((part) => Number(part));
}
