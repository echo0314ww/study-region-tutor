import type {
  QuestionSessionTurn,
  StudyDifficulty,
  StudyMetadata,
  StudySubject,
  TutorSettings
} from '../shared/types';
import { buildFollowUpHistoryPrompt } from './prompts';

export interface FollowUpContext {
  problemContext: string;
  turns: QuestionSessionTurn[];
  previousResponseId?: string;
}

export const STUDY_SUBJECTS: StudySubject[] = ['general', 'math', 'english', 'physics', 'programming'];
export const STUDY_DIFFICULTIES: StudyDifficulty[] = ['easy', 'normal', 'hard'];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function safeMetadataString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

export function safeMetadataList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const items: string[] = [];

  for (const raw of value) {
    const item = safeMetadataString(raw, 32);

    if (!item || seen.has(item)) {
      continue;
    }

    seen.add(item);
    items.push(item);
  }

  return items.slice(0, 6);
}

export function metadataFromAnswer(text: string): StudyMetadata {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const source = fenced?.[1] || text;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');

  if (start < 0 || end <= start) {
    throw new Error('结构化信息提取结果不是 JSON 对象。');
  }

  const parsed = JSON.parse(source.slice(start, end + 1)) as unknown;

  if (!isRecord(parsed)) {
    throw new Error('结构化信息提取结果不是 JSON 对象。');
  }

  const subject = STUDY_SUBJECTS.includes(parsed.subject as StudySubject) ? (parsed.subject as StudySubject) : 'general';
  const difficulty = STUDY_DIFFICULTIES.includes(parsed.difficulty as StudyDifficulty)
    ? (parsed.difficulty as StudyDifficulty)
    : 'normal';

  return {
    subject,
    difficulty,
    topic: safeMetadataString(parsed.topic, 80),
    questionType: safeMetadataString(parsed.questionType, 80),
    keyPoints: safeMetadataList(parsed.keyPoints),
    mistakeTraps: safeMetadataList(parsed.mistakeTraps),
    tags: safeMetadataList(parsed.tags),
    summary: safeMetadataString(parsed.summary, 240),
    extractedAt: new Date().toISOString()
  };
}

export function limitContextText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `[前文较长，已保留末尾 ${maxLength} 个字符]\n${text.slice(-maxLength)}`;
}

export function limitHistoryTurns(turns: QuestionSessionTurn[]): QuestionSessionTurn[] {
  return turns.slice(-8).map((turn) => ({
    role: turn.role,
    content: limitContextText(turn.content, 6000)
  }));
}

export function buildLimitedFollowUpHistoryPrompt(
  context: FollowUpContext,
  question: string,
  settings: TutorSettings
): string {
  return buildFollowUpHistoryPrompt(
    limitContextText(context.problemContext, 18000),
    limitHistoryTurns(context.turns),
    question,
    settings
  );
}
