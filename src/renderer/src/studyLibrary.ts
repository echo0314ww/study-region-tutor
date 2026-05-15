import type { TutorSettings } from '../../shared/types';
import {
  LOCAL_HISTORY_STORAGE_KEY,
  STUDY_LIBRARY_LIMIT,
  STUDY_LIBRARY_STORAGE_KEY
} from './constants';
import type { StudyItem, StudyItemPatch, StudyItemStatus, StudySubject, UiConversationTurn } from './uiTypes';

export const STUDY_SUBJECT_LABELS: Record<StudySubject, string> = {
  general: '通用',
  math: '数学',
  english: '英语',
  physics: '物理',
  programming: '编程'
};

export const STUDY_STATUS_LABELS: Record<StudyItemStatus, string> = {
  new: '新题',
  reviewing: '复习中',
  mastered: '已掌握'
};

export const STUDY_SUBJECTS = Object.keys(STUDY_SUBJECT_LABELS) as StudySubject[];
export const STUDY_STATUSES = Object.keys(STUDY_STATUS_LABELS) as StudyItemStatus[];

export interface StudyItemFilter {
  query: string;
  subject: StudySubject | 'all';
  status: StudyItemStatus | 'all';
  favoritesOnly: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function safeBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false;
}

function isStudySubject(value: unknown): value is StudySubject {
  return typeof value === 'string' && STUDY_SUBJECTS.includes(value as StudySubject);
}

function isStudyStatus(value: unknown): value is StudyItemStatus {
  return typeof value === 'string' && STUDY_STATUSES.includes(value as StudyItemStatus);
}

function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const value of raw) {
    const tag = safeString(value).replace(/\s+/g, ' ').trim();

    if (!tag || seen.has(tag)) {
      continue;
    }

    seen.add(tag);
    tags.push(tag.slice(0, 20));
  }

  return tags.slice(0, 8);
}

export function tagsFromText(value: string): string[] {
  return sanitizeTags(
    value
      .split(/[,，、\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function sanitizeTurn(raw: unknown): UiConversationTurn | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const role = raw.role === 'user' || raw.role === 'assistant' ? raw.role : undefined;
  const content = safeString(raw.content);

  if (!role || !content.trim()) {
    return undefined;
  }

  return {
    id: safeString(raw.id) || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content
  };
}

export function deriveStudyTitle(turns: UiConversationTurn[]): string {
  const firstUser = turns.find((turn) => turn.role === 'user' && turn.content.trim());
  const firstAssistant = turns.find((turn) => turn.role === 'assistant' && turn.content.trim());
  const source = (firstUser || firstAssistant)?.content.replace(/\s+/g, ' ').trim() || '未命名题目';

  return source.length > 42 ? `${source.slice(0, 42)}...` : source;
}

function inferSubjectFromTurns(turns: UiConversationTurn[]): StudySubject {
  const text = turns
    .map((turn) => turn.content)
    .join('\n')
    .toLowerCase();

  if (/[{}_^\\]|\\frac|\\sqrt|方程|函数|三角|几何|导数|概率|矩阵|积分|坐标/.test(text)) {
    return 'math';
  }

  if (/语法|单词|阅读理解|作文|translation|grammar|vocabulary|sentence|tense/.test(text)) {
    return 'english';
  }

  if (/物理|速度|加速度|力|电场|磁场|能量|功率|牛顿|压强|电路/.test(text)) {
    return 'physics';
  }

  if (/```|function|const |let |class |算法|代码|复杂度|typescript|python|java/.test(text)) {
    return 'programming';
  }

  return 'general';
}

function sanitizeStudyItem(raw: unknown): StudyItem | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const id = safeString(raw.id);
  const turns = Array.isArray(raw.turns) ? raw.turns.map(sanitizeTurn).filter((turn) => turn !== undefined) : [];

  if (!id || turns.length === 0) {
    return undefined;
  }

  const subject = isStudySubject(raw.subject) ? raw.subject : inferSubjectFromTurns(turns);
  const status = isStudyStatus(raw.status) ? raw.status : 'new';
  const createdAt = safeString(raw.createdAt) || new Date().toISOString();
  const updatedAt = safeString(raw.updatedAt) || createdAt;

  return {
    id,
    title: safeString(raw.title) || deriveStudyTitle(turns),
    createdAt,
    updatedAt,
    lastReviewedAt: safeString(raw.lastReviewedAt),
    appVersion: safeString(raw.appVersion),
    model: safeString(raw.model),
    providerId: safeString(raw.providerId),
    inputMode: raw.inputMode === 'ocr-text' ? 'ocr-text' : 'image',
    language: raw.language === 'en' ? 'en' : 'zh-CN',
    subject,
    tags: sanitizeTags(raw.tags),
    favorite: safeBoolean(raw.favorite),
    status,
    turns
  };
}

function loadItemsFromKey(key: string): StudyItem[] {
  const raw = localStorage.getItem(key);

  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw);

  return Array.isArray(parsed)
    ? parsed
        .map(sanitizeStudyItem)
        .filter((item) => item !== undefined)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, STUDY_LIBRARY_LIMIT)
    : [];
}

export function loadStudyItems(): StudyItem[] {
  try {
    return localStorage.getItem(STUDY_LIBRARY_STORAGE_KEY) !== null
      ? loadItemsFromKey(STUDY_LIBRARY_STORAGE_KEY)
      : loadItemsFromKey(LOCAL_HISTORY_STORAGE_KEY);
  } catch {
    return [];
  }
}

export function saveStudyItems(items: StudyItem[]): void {
  try {
    localStorage.setItem(STUDY_LIBRARY_STORAGE_KEY, JSON.stringify(items.slice(0, STUDY_LIBRARY_LIMIT)));
  } catch (error) {
    console.warn(`Unable to persist study library: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function upsertStudyItem(
  items: StudyItem[],
  input: {
    id: string;
    appVersion: string;
    settings: TutorSettings;
    turns: UiConversationTurn[];
  }
): StudyItem[] {
  const turns = input.turns.filter((turn) => turn.content.trim());

  if (turns.length === 0) {
    return items;
  }

  const now = new Date().toISOString();
  const existing = items.find((item) => item.id === input.id);
  const nextItem: StudyItem = {
    id: input.id,
    title: existing?.title || deriveStudyTitle(turns),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastReviewedAt: existing?.lastReviewedAt || '',
    appVersion: input.appVersion,
    model: input.settings.model.trim(),
    providerId: input.settings.providerId.trim(),
    inputMode: input.settings.inputMode,
    language: input.settings.language,
    subject: existing?.subject || inferSubjectFromTurns(turns),
    tags: existing?.tags || [],
    favorite: existing?.favorite || false,
    status: existing?.status || 'new',
    turns
  };

  return [nextItem, ...items.filter((item) => item.id !== input.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, STUDY_LIBRARY_LIMIT);
}

export function updateStudyItemMetadata(items: StudyItem[], id: string, patch: StudyItemPatch): StudyItem[] {
  const now = new Date().toISOString();

  return items.map((item) => {
    if (item.id !== id) {
      return item;
    }

    return {
      ...item,
      ...patch,
      title: patch.title === undefined ? item.title : patch.title.trim() || deriveStudyTitle(item.turns),
      tags: patch.tags === undefined ? item.tags : sanitizeTags(patch.tags),
      updatedAt: now
    };
  });
}

function searchableText(item: StudyItem): string {
  return [
    item.title,
    item.model,
    item.providerId,
    STUDY_SUBJECT_LABELS[item.subject],
    STUDY_STATUS_LABELS[item.status],
    ...item.tags,
    ...item.turns.map((turn) => turn.content)
  ]
    .join('\n')
    .toLowerCase();
}

export function filterStudyItems(items: StudyItem[], filter: StudyItemFilter): StudyItem[] {
  const query = filter.query.trim().toLowerCase();

  return items.filter((item) => {
    if (filter.favoritesOnly && !item.favorite) {
      return false;
    }

    if (filter.subject !== 'all' && item.subject !== filter.subject) {
      return false;
    }

    if (filter.status !== 'all' && item.status !== filter.status) {
      return false;
    }

    return !query || searchableText(item).includes(query);
  });
}
