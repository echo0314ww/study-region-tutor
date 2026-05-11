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
    '普通解释使用自然语言；凡是数学公式、计算链、方程、区间、最值或最终结果，必须直接写成标准 LaTeX，并用 \\(...\\) 或 \\[...\\] 包起来。分式用 \\frac{}{}，根号用 \\sqrt{}，上下标用 ^ 和 _，三角形面积可写 S_{\\triangle MON}。',
    '能单独成行的公式、推导链和最终答案请使用 \\[...\\] 块级公式，说明句和公式分成两行；短变量或点坐标可放在自然语言行内。每个公式只写一遍，不要先写扁平文本再补 LaTeX。不要输出“补充 LaTeX:”或“LaTeX:”标签，也不要输出 2√3、8√3/2、x²/16 这类扁平公式文本。'
  ].join('\n');
}

export function buildTutorUserPrompt(settings: TutorSettings): string {
  const language = settings.language === 'zh-CN' ? '中文' : 'English';

  return [
    `请分析这张截图中的学习题目，并用${language}输出。`,
    settings.reasoningOnly
      ? '请只讲解思路和关键概念，避免直接给出最终答案。'
      : '请给出可学习的分步骤讲解，必要时包含最终结果。',
    '涉及公式、方程、区间、最值、分式、根号或上下标时，请直接使用标准 LaTeX 表达并用 \\(...\\) 或 \\[...\\] 包起来；能独占一行的公式请用 \\[...\\]。同一个公式只写一遍，不要再写扁平公式文本或“LaTeX:”标签。'
  ].join('\n');
}

export function buildTutorTextPrompt(recognizedText: string, settings: TutorSettings): string {
  const language = settings.language === 'zh-CN' ? '中文' : 'English';

  return [
    `下面是用户框选区域经过本地 OCR 得到的题目文字。请用${language}回答。`,
    '请先整理/纠正 OCR 中明显的识别错误，再判断题型并讲解。',
    '如果 OCR 文本包含多个候选结果，请综合比较；遇到数学公式时，重点保留变量、上下标、括号、分式、根号、等号/不等号和单位。',
    '不要凭空补全无法确定的公式；不确定处请用“[不确定]”标注，并说明需要用户重新框选或放大截图。',
    '数学表达式输出要求：普通解释用自然语言；公式、计算链和结果必须直接写成标准 LaTeX，并用 \\(...\\) 或 \\[...\\] 包起来。能独占一行的公式请使用 \\[...\\]，说明句和公式分成两行。含分式、根号、上下标时不要写 2√3、8√3/2、x²/16 这类扁平文本，要写 \\sqrt{}、\\frac{}{}、^、_。同一个公式只写一遍，不要输出“补充 LaTeX:”或“LaTeX:”标签。',
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
    '如果回答里出现新的分式、根号、上下标或复杂公式，请直接写成标准 LaTeX，并用 \\(...\\) 或 \\[...\\] 包起来；长公式单独使用 \\[...\\]，同一个公式只写一遍，不要输出“LaTeX:”标签或扁平公式文本。',
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
    '如果继续讲解中出现新的分式、根号、上下标或复杂公式，请直接写成标准 LaTeX，并用 \\(...\\) 或 \\[...\\] 包起来；长公式单独使用 \\[...\\]，同一个公式只写一遍，不要输出“LaTeX:”标签或扁平公式文本。',
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
