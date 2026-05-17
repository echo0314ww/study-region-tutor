import type { StudyBackupMergeStrategy, TutorSettings } from '../../shared/types';
import {
  LOCAL_HISTORY_STORAGE_KEY,
  STUDY_LIBRARY_LIMIT,
  STUDY_LIBRARY_STORAGE_KEY
} from './constants';
import type {
  StudyDifficulty,
  StudyItem,
  StudyItemPatch,
  StudyItemStatus,
  StudyReviewGrade,
  StudySubject,
  UiConversationTurn
} from './uiTypes';

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

export const STUDY_DIFFICULTY_LABELS: Record<StudyDifficulty, string> = {
  easy: '容易',
  normal: '普通',
  hard: '困难'
};

export const STUDY_REVIEW_GRADE_LABELS: Record<StudyReviewGrade, string> = {
  again: '答错了',
  hard: '有点忘',
  good: '答对了',
  easy: '很熟练'
};

export function localizedSubjectLabel(subject: StudySubject, t: (key: string) => string): string {
  const keys: Record<StudySubject, string> = {
    general: 'subject.general', math: 'subject.math', english: 'subject.english',
    physics: 'subject.physics', programming: 'subject.programming'
  };
  return t(keys[subject]);
}

export function localizedStatusLabel(status: StudyItemStatus, t: (key: string) => string): string {
  const keys: Record<StudyItemStatus, string> = {
    new: 'status.new', reviewing: 'status.reviewing', mastered: 'status.mastered'
  };
  return t(keys[status]);
}

export function localizedDifficultyLabel(difficulty: StudyDifficulty, t: (key: string) => string): string {
  const keys: Record<StudyDifficulty, string> = {
    easy: 'difficulty.easy', normal: 'difficulty.normal', hard: 'difficulty.hard'
  };
  return t(keys[difficulty]);
}

export function localizedReviewGradeLabel(grade: StudyReviewGrade, t: (key: string) => string): string {
  const keys: Record<StudyReviewGrade, string> = {
    again: 'studyItem.reviewWrong', hard: 'studyItem.reviewHard',
    good: 'studyItem.reviewGood', easy: 'studyItem.reviewEasy'
  };
  return t(keys[grade]);
}

export const STUDY_SUBJECTS = Object.keys(STUDY_SUBJECT_LABELS) as StudySubject[];
export const STUDY_STATUSES = Object.keys(STUDY_STATUS_LABELS) as StudyItemStatus[];
export const STUDY_DIFFICULTIES = Object.keys(STUDY_DIFFICULTY_LABELS) as StudyDifficulty[];

export interface StudyItemFilter {
  query: string;
  subject: StudySubject | 'all';
  status: StudyItemStatus | 'all';
  favoritesOnly: boolean;
  dueOnly?: boolean;
  mistakesOnly?: boolean;
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

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function isStudySubject(value: unknown): value is StudySubject {
  return typeof value === 'string' && STUDY_SUBJECTS.includes(value as StudySubject);
}

function isStudyStatus(value: unknown): value is StudyItemStatus {
  return typeof value === 'string' && STUDY_STATUSES.includes(value as StudyItemStatus);
}

function isStudyDifficulty(value: unknown): value is StudyDifficulty {
  return typeof value === 'string' && STUDY_DIFFICULTIES.includes(value as StudyDifficulty);
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
    id: safeString(raw.id) || crypto.randomUUID(),
    role,
    content
  };
}

function sanitizeMetadata(raw: unknown): StudyItem['metadata'] {
  if (!isRecord(raw) || !isStudySubject(raw.subject) || !isStudyDifficulty(raw.difficulty)) {
    return undefined;
  }

  return {
    subject: raw.subject,
    topic: safeString(raw.topic).slice(0, 80),
    questionType: safeString(raw.questionType).slice(0, 80),
    difficulty: raw.difficulty,
    keyPoints: sanitizeTags(raw.keyPoints),
    mistakeTraps: sanitizeTags(raw.mistakeTraps),
    tags: sanitizeTags(raw.tags),
    summary: safeString(raw.summary).slice(0, 240),
    extractedAt: safeString(raw.extractedAt)
  };
}

export function deriveStudyTitle(turns: UiConversationTurn[]): string {
  const firstUser = turns.find((turn) => turn.role === 'user' && turn.content.trim());
  const firstAssistant = turns.find((turn) => turn.role === 'assistant' && turn.content.trim());
  const source = (firstUser || firstAssistant)?.content.replace(/\s+/g, ' ').trim() || '未命名题目';

  return source.length > 42 ? `${source.slice(0, 42)}...` : source;
}

function deriveMistakeReason(turns: UiConversationTurn[]): string {
  const text = turns.map((turn) => turn.content).join('\n');
  const match = text.match(/(?:易错点|常见错误|注意)[:：]?\s*([^\n。；;]{4,80})/);

  return match?.[1]?.trim() || '';
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
  const reviewCount = safeNumber(raw.reviewCount);
  const correctCount = safeNumber(raw.correctCount);
  const wrongCount = safeNumber(raw.wrongCount);

  return {
    id,
    title: safeString(raw.title) || deriveStudyTitle(turns),
    createdAt,
    updatedAt,
    lastReviewedAt: safeString(raw.lastReviewedAt),
    nextReviewAt: safeString(raw.nextReviewAt),
    appVersion: safeString(raw.appVersion),
    model: safeString(raw.model),
    providerId: safeString(raw.providerId),
    inputMode: raw.inputMode === 'ocr-text' ? 'ocr-text' : 'image',
    language: raw.language === 'en' ? 'en' : 'zh-CN',
    subject,
    tags: sanitizeTags(raw.tags),
    favorite: safeBoolean(raw.favorite),
    status,
    reviewCount,
    correctCount,
    wrongCount,
    difficulty: isStudyDifficulty(raw.difficulty) ? raw.difficulty : wrongCount > 0 ? 'hard' : 'normal',
    mistakeReason: safeString(raw.mistakeReason).slice(0, 160) || deriveMistakeReason(turns),
    metadata: sanitizeMetadata(raw.metadata),
    turns
  };
}

function loadItemsFromKey(key: string): { exists: boolean; items: StudyItem[] } {
  const raw = localStorage.getItem(key);

  if (!raw) {
    return { exists: false, items: [] };
  }

  const parsed = JSON.parse(raw);

  const items = Array.isArray(parsed)
    ? parsed
        .map(sanitizeStudyItem)
        .filter((item) => item !== undefined)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, STUDY_LIBRARY_LIMIT)
    : [];

  return { exists: true, items };
}

export function loadStudyItems(): StudyItem[] {
  try {
    const studyLibrary = loadItemsFromKey(STUDY_LIBRARY_STORAGE_KEY);

    if (studyLibrary.exists) {
      return studyLibrary.items;
    }
  } catch {
    // Fall back to the legacy history key instead of showing an empty library
    // when the newer study-library payload is corrupted.
  }

  try {
    return loadItemsFromKey(LOCAL_HISTORY_STORAGE_KEY).items;
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
    nextReviewAt: existing?.nextReviewAt || '',
    appVersion: input.appVersion,
    model: input.settings.model.trim(),
    providerId: input.settings.providerId.trim(),
    inputMode: input.settings.inputMode,
    language: input.settings.language,
    subject: existing?.subject || inferSubjectFromTurns(turns),
    tags: existing?.tags || [],
    favorite: existing?.favorite || false,
    status: existing?.status || 'new',
    reviewCount: existing?.reviewCount || 0,
    correctCount: existing?.correctCount || 0,
    wrongCount: existing?.wrongCount || 0,
    difficulty: existing?.difficulty || 'normal',
    mistakeReason: existing?.mistakeReason || deriveMistakeReason(turns),
    metadata: existing?.metadata,
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
      mistakeReason:
        patch.mistakeReason === undefined ? item.mistakeReason : patch.mistakeReason.trim().slice(0, 160),
      updatedAt: now
    };
  });
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nextIntervalDays(item: StudyItem, grade: StudyReviewGrade): number {
  if (grade === 'again') {
    return 1;
  }

  if (grade === 'hard') {
    return 3;
  }

  const successfulReviews = item.correctCount + 1;

  if (grade === 'easy') {
    return successfulReviews >= 3 ? 60 : successfulReviews === 2 ? 30 : 14;
  }

  return successfulReviews >= 3 ? 30 : successfulReviews === 2 ? 14 : 7;
}

export function scheduleNextReview(item: StudyItem, grade: StudyReviewGrade, reviewedAt = new Date()): StudyItemPatch {
  const reviewedAtIso = reviewedAt.toISOString();
  const correctIncrement = grade === 'good' || grade === 'easy' ? 1 : 0;
  const wrongIncrement = grade === 'again' ? 1 : 0;
  const correctCount = item.correctCount + correctIncrement;
  const wrongCount = item.wrongCount + wrongIncrement;
  const reviewCount = item.reviewCount + 1;
  const nextReviewAt = addDays(reviewedAt, nextIntervalDays(item, grade)).toISOString();
  const status: StudyItemStatus =
    grade === 'again' || grade === 'hard' ? 'reviewing' : correctCount >= 3 ? 'mastered' : 'reviewing';
  const difficulty: StudyDifficulty = grade === 'again' || grade === 'hard' ? 'hard' : grade === 'easy' ? 'easy' : item.difficulty;

  return {
    lastReviewedAt: reviewedAtIso,
    nextReviewAt,
    reviewCount,
    correctCount,
    wrongCount,
    status,
    difficulty
  };
}

export function updateStudyItemReviewResult(
  items: StudyItem[],
  id: string,
  grade: StudyReviewGrade,
  reviewedAt = new Date()
): StudyItem[] {
  const item = items.find((current) => current.id === id);

  if (!item) {
    return items;
  }

  return updateStudyItemMetadata(items, id, scheduleNextReview(item, grade, reviewedAt));
}

export function isStudyItemDue(item: StudyItem, now = new Date()): boolean {
  if (item.status === 'mastered') {
    return Boolean(item.nextReviewAt) && new Date(item.nextReviewAt).getTime() <= now.getTime();
  }

  if (!item.nextReviewAt) {
    return true;
  }

  const dueAt = new Date(item.nextReviewAt);

  return Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= now.getTime();
}

export function getDueStudyItems(items: StudyItem[], now = new Date()): StudyItem[] {
  return items.filter((item) => isStudyItemDue(item, now));
}

export function studyLibraryStats(items: StudyItem[], now = new Date()): {
  total: number;
  due: number;
  newCount: number;
  reviewing: number;
  mastered: number;
  mistakes: number;
} {
  return {
    total: items.length,
    due: getDueStudyItems(items, now).length,
    newCount: items.filter((item) => item.status === 'new').length,
    reviewing: items.filter((item) => item.status === 'reviewing').length,
    mastered: items.filter((item) => item.status === 'mastered').length,
    mistakes: items.filter((item) => item.wrongCount > 0).length
  };
}

export interface StudyDashboardStats {
  total: number;
  due: number;
  mistakes: number;
  masteredRate: number;
  reviewedLast7Days: number;
  subjectCounts: Array<{ subject: StudySubject; count: number }>;
  topKnowledgePoints: Array<{ label: string; count: number }>;
  topMistakeTraps: Array<{ label: string; count: number }>;
}

function incrementCount(map: Map<string, number>, value: string): void {
  const label = value.trim();

  if (!label) {
    return;
  }

  map.set(label, (map.get(label) || 0) + 1);
}

function topCounts(map: Map<string, number>, limit: number): Array<{ label: string; count: number }> {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

export function studyDashboardStats(items: StudyItem[], now = new Date()): StudyDashboardStats {
  const baseStats = studyLibraryStats(items, now);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const subjectCounts = STUDY_SUBJECTS.map((subject) => ({
    subject,
    count: items.filter((item) => item.subject === subject).length
  })).filter((item) => item.count > 0);
  const keyPointCounts = new Map<string, number>();
  const mistakeTrapCounts = new Map<string, number>();

  for (const item of items) {
    for (const point of item.metadata?.keyPoints || []) {
      incrementCount(keyPointCounts, point);
    }

    for (const trap of item.metadata?.mistakeTraps || []) {
      incrementCount(mistakeTrapCounts, trap);
    }
  }

  return {
    total: baseStats.total,
    due: baseStats.due,
    mistakes: baseStats.mistakes,
    masteredRate: baseStats.total > 0 ? Math.round((baseStats.mastered / baseStats.total) * 100) : 0,
    reviewedLast7Days: items.filter((item) => {
      const reviewedAt = new Date(item.lastReviewedAt);

      return !Number.isNaN(reviewedAt.getTime()) && reviewedAt >= sevenDaysAgo && reviewedAt <= now;
    }).length,
    subjectCounts,
    topKnowledgePoints: topCounts(keyPointCounts, 5),
    topMistakeTraps: topCounts(mistakeTrapCounts, 5)
  };
}

const searchTextCache = new WeakMap<StudyItem, string>();

function searchableText(item: StudyItem): string {
  const cached = searchTextCache.get(item);
  if (cached !== undefined) return cached;

  const text = [
    item.title,
    item.model,
    item.providerId,
    STUDY_SUBJECT_LABELS[item.subject],
    STUDY_STATUS_LABELS[item.status],
    STUDY_DIFFICULTY_LABELS[item.difficulty],
    item.mistakeReason,
    item.metadata?.topic,
    item.metadata?.questionType,
    item.metadata?.summary,
    ...(item.metadata?.keyPoints || []),
    ...(item.metadata?.mistakeTraps || []),
    ...item.tags,
    ...item.turns.map((turn) => turn.content)
  ]
    .join('\n')
    .toLowerCase();

  searchTextCache.set(item, text);
  return text;
}

export function filterStudyItems(items: StudyItem[], filter: StudyItemFilter): StudyItem[] {
  const query = filter.query.trim().toLowerCase();

  return items.filter((item) => {
    if (filter.favoritesOnly && !item.favorite) {
      return false;
    }

    if (filter.dueOnly && !isStudyItemDue(item)) {
      return false;
    }

    if (filter.mistakesOnly && item.wrongCount === 0) {
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

export function mergeStudyItems(
  local: StudyItem[],
  imported: StudyItem[],
  strategy: StudyBackupMergeStrategy
): StudyItem[] {
  if (strategy === 'replace') {
    return imported.slice(0, STUDY_LIBRARY_LIMIT);
  }

  const localMap = new Map(local.map((item) => [item.id, item]));
  const importedMap = new Map(imported.map((item) => [item.id, item]));
  const merged = new Map<string, StudyItem>();

  for (const [id, item] of localMap) {
    merged.set(id, item);
  }

  for (const [id, item] of importedMap) {
    const existing = merged.get(id);

    if (!existing) {
      merged.set(id, item);
    } else if (strategy === 'merge-prefer-imported') {
      merged.set(id, item);
    }
    // 'merge-prefer-local': keep the existing local item
  }

  return [...merged.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, STUDY_LIBRARY_LIMIT);
}
