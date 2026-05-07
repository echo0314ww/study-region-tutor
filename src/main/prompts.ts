import type { QuestionSessionTurn, TutorSettings } from '../shared/types';

export function buildTutorInstructions(settings: TutorSettings): string {
  const language = settings.language === 'zh-CN' ? '中文' : 'English';
  const finalResultGuidance = settings.reasoningOnly
    ? '用户开启了“只讲思路”，请不要直接给出最终答案，重点解释概念、方法、公式选择和下一步该怎么想。'
    : '请给出解题思路、关键步骤、必要公式和最终结果，但不要只给答案。';

  return [
    '你是一个学习辅导助手。',
    '请先识别截图中的题目文本，再判断题型。',
    `请用${language}回答。`,
    finalResultGuidance,
    '如果内容看起来来自正在进行的正式考试、竞赛、测验或受限制平台，请提示用户遵守规则，不要直接代答或给最终答案，只提供概念讲解和学习建议。',
    '请把回答分成：题目识别、题型判断、思路、步骤、关键概念、结果或学习建议。',
    '数学表达式请优先写成清晰可读的普通文本，例如“椭圆方程：x²/4 + y² = 1”；如需 LaTeX，请放在下一行作为补充，不要只输出裸 LaTeX。'
  ].join('\n');
}

export function buildTutorUserPrompt(settings: TutorSettings): string {
  const language = settings.language === 'zh-CN' ? '中文' : 'English';

  return [
    `请分析这张截图中的学习题目，并用${language}输出。`,
    settings.reasoningOnly
      ? '请只讲解思路和关键概念，避免直接给出最终答案。'
      : '请给出可学习的分步骤讲解，必要时包含最终结果。',
    '涉及公式、方程、区间、最值时，请先用可读数学文本写明，再补充 LaTeX。'
  ].join('\n');
}

export function buildTutorTextPrompt(recognizedText: string, settings: TutorSettings): string {
  const language = settings.language === 'zh-CN' ? '中文' : 'English';

  return [
    `下面是用户框选区域经过本地 OCR 得到的题目文字。请用${language}回答。`,
    '请先整理/纠正 OCR 中明显的识别错误，再判断题型并讲解。',
    '如果 OCR 文本包含多个候选结果，请综合比较；遇到数学公式时，重点保留变量、上下标、括号、分式、根号、等号/不等号和单位。',
    '不要凭空补全无法确定的公式；不确定处请用“[不确定]”标注，并说明需要用户重新框选或放大截图。',
    '数学表达式输出要求：先写可读文本，例如“m ∈ (-3√3/2, 3√3/2)”或“k 最大值为 4/3”；再用 LaTeX 作为补充。不要只给 \\[...\\] 或 $$...$$。',
    settings.reasoningOnly
      ? '用户开启了“只讲思路”，请只讲解思路和关键概念，避免直接给出最终答案。'
      : '请给出可学习的分步骤讲解，必要时包含最终结果。',
    '如果 OCR 文本不足以确定题意，请明确指出不确定处，并给出可继续学习的方向。',
    '',
    'OCR 识别文本：',
    recognizedText
  ].join('\n');
}

export function buildFollowUpQuestionPrompt(question: string, settings: TutorSettings): string {
  const language = settings.language === 'zh-CN' ? '中文' : 'English';

  return [
    `这是围绕同一道学习题目的继续追问，请用${language}回答。`,
    settings.reasoningOnly
      ? '用户仍然开启“只讲思路”，请继续只讲方法、概念和下一步思路。'
      : '请结合前文题目和讲解，直接回答用户的新疑问，必要时补充步骤和结果。',
    '如果这个追问涉及正式考试、竞赛、测验或受限制平台，请继续遵守学习辅导边界，不要直接代答。',
    '',
    '用户追问：',
    question
  ].join('\n');
}

export function buildFollowUpHistoryPrompt(
  problemContext: string,
  turns: QuestionSessionTurn[],
  question: string,
  settings: TutorSettings
): string {
  const language = settings.language === 'zh-CN' ? '中文' : 'English';
  const history = turns
    .map((turn, index) => {
      const speaker = turn.role === 'user' ? '用户' : '助手';
      return `第 ${index + 1} 轮 ${speaker}：\n${turn.content}`;
    })
    .join('\n\n');

  return [
    `请用${language}回答用户围绕当前题目的追问。`,
    '下面是当前题目的上下文和本题会话历史。请只基于这些内容继续讲解，不要要求用户重新上传同一张截图。',
    settings.reasoningOnly
      ? '用户开启了“只讲思路”，请继续避免直接给最终答案。'
      : '请给出清晰的学习性解释，必要时补充步骤、公式和结果。',
    '如果当前题目看起来来自正式考试、竞赛、测验或受限制平台，请只提供概念讲解和学习建议。',
    '',
    '当前题目上下文：',
    problemContext,
    '',
    '本题会话历史：',
    history || '暂无历史。',
    '',
    '用户新的追问：',
    question
  ].join('\n');
}
