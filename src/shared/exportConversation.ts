import type {
  ExportConversationRequest,
  ExportStudyLibraryRequest,
  InputMode,
  QuestionSessionTurn,
  StudyDifficulty,
  StudyItemStatus,
  StudyLibraryExportItem,
  StudySubject,
  TutorLanguage
} from './types';

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

function subjectLabel(subject: StudySubject): string {
  const labels: Record<StudySubject, string> = {
    general: '通用',
    math: '数学',
    english: '英语',
    physics: '物理',
    programming: '编程'
  };

  return labels[subject];
}

function statusLabel(status: StudyItemStatus): string {
  const labels: Record<StudyItemStatus, string> = {
    new: '新题',
    reviewing: '复习中',
    mastered: '已掌握'
  };

  return labels[status];
}

function difficultyLabel(difficulty: StudyDifficulty): string {
  const labels: Record<StudyDifficulty, string> = {
    easy: '容易',
    normal: '普通',
    hard: '困难'
  };

  return labels[difficulty];
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

function firstTurnContent(item: StudyLibraryExportItem, role: QuestionSessionTurn['role']): string {
  return normalizeContent(item.turns.find((turn) => turn.role === role)?.content || '');
}

function studyItemMarkdown(item: StudyLibraryExportItem, index: number): string {
  const metadata = item.metadata;
  const sections = [
    `## ${index}. ${item.title || '未命名题目'}`,
    '',
    metadataLine('学科', subjectLabel(item.subject)),
    metadataLine('状态', statusLabel(item.status)),
    metadataLine('难度', difficultyLabel(item.difficulty)),
    metadataLine('标签', item.tags.length > 0 ? item.tags.join('、') : '无'),
    metadataLine('复习次数', String(item.reviewCount)),
    metadataLine('答对次数', String(item.correctCount)),
    metadataLine('答错次数', String(item.wrongCount)),
    metadataLine('下次复习', item.nextReviewAt || '未安排'),
    metadataLine('模型', item.model || '未记录'),
    '',
    '### 结构化信息',
    '',
    metadata
      ? [
          metadataLine('知识点', metadata.topic || '未识别'),
          metadataLine('题型', metadata.questionType || '未识别'),
          metadataLine('摘要', metadata.summary || '无'),
          metadataLine('关键点', metadata.keyPoints.length > 0 ? metadata.keyPoints.join('、') : '无'),
          metadataLine('易错点', metadata.mistakeTraps.length > 0 ? metadata.mistakeTraps.join('、') : item.mistakeReason || '无')
        ].join('\n')
      : '暂未提取结构化信息。',
    '',
    '### 题目/提问',
    '',
    firstTurnContent(item, 'user') || '未记录单独题目文本。',
    '',
    '### 讲解与追问',
    ''
  ];

  item.turns.forEach((turn, turnIndex) => {
    sections.push(`#### ${turn.role === 'user' ? '用户' : '助手'} ${turnIndex + 1}`, '', normalizeContent(turn.content), '');
  });

  return sections.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function buildStudyLibraryMarkdown(request: ExportStudyLibraryRequest): string {
  const sections = [
    '# Study Region Tutor 学习库',
    '',
    metadataLine('导出时间', request.exportedAt),
    metadataLine('应用版本', request.appVersion || '未知'),
    metadataLine('题目数量', String(request.items.length)),
    '',
    ...request.items.map((item, index) => studyItemMarkdown(item, index + 1)),
    '',
    '## 隐私说明',
    '',
    '本文件只包含学习库文字记录、复习状态和结构化学习信息，不包含截图、API Key、代理 Token 或代理服务地址。'
  ];

  return `${sections.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function csvCell(value: string | number | boolean): string {
  const text = String(value).replace(/\r\n/g, '\n');

  return `"${text.replace(/"/g, '""')}"`;
}

export function buildStudyLibraryAnkiCsv(request: ExportStudyLibraryRequest): string {
  const rows = [
    ['Front', 'Back', 'Subject', 'Tags', 'Status', 'Difficulty', 'NextReviewAt'].map(csvCell).join(',')
  ];

  for (const item of request.items) {
    const front = firstTurnContent(item, 'user') || item.title;
    const assistantTurns = item.turns
      .filter((turn) => turn.role === 'assistant')
      .map((turn) => normalizeContent(turn.content))
      .filter(Boolean)
      .join('\n\n');
    const metadata = item.metadata;
    const back = [
      metadata?.summary ? `摘要：${metadata.summary}` : '',
      assistantTurns,
      item.mistakeReason ? `易错点：${item.mistakeReason}` : ''
    ]
      .filter(Boolean)
      .join('\n\n');
    const tags = [...new Set([...item.tags, ...(metadata?.tags || []), metadata?.topic || ''].filter(Boolean))].join(' ');

    rows.push(
      [
        front,
        back,
        subjectLabel(item.subject),
        tags,
        statusLabel(item.status),
        difficultyLabel(item.difficulty),
        item.nextReviewAt
      ]
        .map(csvCell)
        .join(',')
    );
  }

  return `${rows.join('\n')}\n`;
}

export function buildObsidianStudyItemMarkdown(item: StudyLibraryExportItem): string {
  const tags = [...new Set([...item.tags, ...(item.metadata?.tags || [])])];
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(item.title || '未命名题目')}`,
    `subject: ${JSON.stringify(item.subject)}`,
    `status: ${JSON.stringify(item.status)}`,
    `difficulty: ${JSON.stringify(item.difficulty)}`,
    `tags: [${tags.map((tag) => JSON.stringify(tag)).join(', ')}]`,
    `nextReviewAt: ${JSON.stringify(item.nextReviewAt || '')}`,
    `reviewCount: ${item.reviewCount}`,
    '---'
  ];

  return `${[...frontmatter, '', studyItemMarkdown(item, 1)].join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
