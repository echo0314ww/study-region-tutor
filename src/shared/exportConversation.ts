import type { ExportConversationRequest, InputMode, QuestionSessionTurn, TutorLanguage } from './types';

function languageLabel(language: TutorLanguage): string {
  return language === 'zh-CN' ? '中文' : 'English';
}

function inputModeLabel(inputMode: InputMode): string {
  return inputMode === 'image' ? '直接发送图片' : '本地 OCR 后发送文字';
}

function turnHeading(turn: QuestionSessionTurn, index: number): string {
  return turn.role === 'user' ? `### 用户追问 ${index}` : `### 助手讲解 ${index}`;
}

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n').trim();
}

function metadataLine(label: string, value: string | boolean): string {
  return `- ${label}：${value}`;
}

export function buildConversationMarkdown(request: ExportConversationRequest): string {
  const turns = request.turns.filter((turn) => normalizeContent(turn.content));
  const firstAssistantIndex = turns.findIndex((turn) => turn.role === 'assistant');
  const firstAssistant = firstAssistantIndex >= 0 ? turns[firstAssistantIndex] : undefined;
  const followUpTurns = firstAssistantIndex >= 0 ? turns.filter((_, index) => index !== firstAssistantIndex) : turns;
  let followUpCount = 0;

  const sections = [
    '# Study Region Tutor 题目讲解',
    '',
    metadataLine('导出时间', request.exportedAt),
    metadataLine('应用版本', request.appVersion || '未知'),
    metadataLine('模型', request.model || '未选择'),
    metadataLine('输入方式', inputModeLabel(request.inputMode)),
    metadataLine('输出语言', languageLabel(request.language)),
    metadataLine('只讲思路', request.reasoningOnly ? '是' : '否'),
    '',
    '## 讲解',
    '',
    firstAssistant ? normalizeContent(firstAssistant.content) : '暂无讲解内容。'
  ];

  if (followUpTurns.length > 0) {
    sections.push('', '## 追问记录', '');

    for (const turn of followUpTurns) {
      followUpCount += 1;
      sections.push(turnHeading(turn, followUpCount), '', normalizeContent(turn.content), '');
    }
  }

  sections.push(
    '## 隐私说明',
    '',
    '本文件只包含当前题目的文字讲解和追问记录，不包含截图、API Key、代理 Token 或代理服务地址。'
  );

  return `${sections.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
