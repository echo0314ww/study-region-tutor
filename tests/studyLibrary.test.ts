import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, LOCAL_HISTORY_STORAGE_KEY, STUDY_LIBRARY_STORAGE_KEY } from '../src/renderer/src/constants';
import {
  filterStudyItems,
  getDueStudyItems,
  loadStudyItems,
  saveStudyItems,
  scheduleNextReview,
  studyDashboardStats,
  studyLibraryStats,
  tagsFromText,
  updateStudyItemMetadata,
  updateStudyItemReviewResult,
  upsertStudyItem
} from '../src/renderer/src/studyLibrary';
import type { StudyItem, UiConversationTurn } from '../src/renderer/src/uiTypes';

function installLocalStorage(storage: Pick<Storage, 'getItem' | 'setItem'>): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true
  });
}

function turns(content = '求函数 f(x)=x^2 的导数'): UiConversationTurn[] {
  return [
    {
      id: 'turn-user',
      role: 'user',
      content
    },
    {
      id: 'turn-assistant',
      role: 'assistant',
      content: '使用 \\[f\\prime(x)=2x\\]。'
    }
  ];
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('study library', () => {
  it('migrates legacy local history items into study items', () => {
    const values = new Map<string, string>();
    values.set(
      LOCAL_HISTORY_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'legacy-1',
          title: 'legacy math item',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-02T00:00:00.000Z',
          appVersion: '1.1.2',
          model: 'model-a',
          providerId: 'provider-a',
          inputMode: 'image',
          language: 'zh-CN',
          turns: turns()
        }
      ])
    );
    installLocalStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value)
    });

    const items = loadStudyItems();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'legacy-1',
      subject: 'math',
      favorite: false,
      status: 'new',
      tags: [],
      reviewCount: 0,
      correctCount: 0,
      wrongCount: 0,
      difficulty: 'normal'
    });
  });

  it('does not resurrect legacy history after an empty study library is saved', () => {
    const values = new Map<string, string>();
    values.set(STUDY_LIBRARY_STORAGE_KEY, '[]');
    values.set(
      LOCAL_HISTORY_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'legacy-1',
          title: 'legacy item',
          turns: turns()
        }
      ])
    );
    installLocalStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value)
    });

    expect(loadStudyItems()).toEqual([]);
  });

  it('falls back to legacy history when the study library payload is corrupted', () => {
    const values = new Map<string, string>();
    values.set(STUDY_LIBRARY_STORAGE_KEY, '{');
    values.set(
      LOCAL_HISTORY_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'legacy-1',
          title: 'legacy item',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-02T00:00:00.000Z',
          turns: turns()
        }
      ])
    );
    installLocalStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value)
    });

    expect(loadStudyItems()).toHaveLength(1);
    expect(loadStudyItems()[0]?.id).toBe('legacy-1');
  });

  it('upserts study items without persisting secrets from settings', () => {
    const values = new Map<string, string>();
    installLocalStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value)
    });

    const items = upsertStudyItem([], {
      id: 'study-1',
      appVersion: '1.1.2',
      settings: {
        ...DEFAULT_SETTINGS,
        model: 'model-a',
        providerId: 'provider-a',
        apiKey: 'secret-api-key',
        proxyToken: 'secret-proxy-token'
      },
      turns: turns()
    });

    saveStudyItems(items);

    const stored = values.get(STUDY_LIBRARY_STORAGE_KEY) || '';
    expect(stored).toContain('model-a');
    expect(stored).not.toContain('secret-api-key');
    expect(stored).not.toContain('secret-proxy-token');
  });

  it('filters by query, subject, status and favorite state', () => {
    const baseItem = upsertStudyItem([], {
      id: 'study-1',
      appVersion: '1.1.2',
      settings: DEFAULT_SETTINGS,
      turns: turns('一道物理电路题')
    })[0] as StudyItem;
    const [item] = updateStudyItemMetadata([baseItem], baseItem.id, {
      subject: 'physics',
      status: 'reviewing',
      favorite: true,
      tags: ['电路', '复习']
    });

    expect(
      filterStudyItems([item], {
        query: '电路',
        subject: 'physics',
        status: 'reviewing',
        favoritesOnly: true
      })
    ).toHaveLength(1);
    expect(
      filterStudyItems([item], {
        query: '函数',
        subject: 'physics',
        status: 'reviewing',
        favoritesOnly: true
      })
    ).toHaveLength(0);
  });

  it('schedules review intervals and updates review counters', () => {
    const baseItem = upsertStudyItem([], {
      id: 'study-1',
      appVersion: '1.1.2',
      settings: DEFAULT_SETTINGS,
      turns: turns('一道导数题')
    })[0] as StudyItem;
    const reviewedAt = new Date('2026-05-15T00:00:00.000Z');
    const patch = scheduleNextReview(baseItem, 'again', reviewedAt);

    expect(patch.status).toBe('reviewing');
    expect(patch.wrongCount).toBe(1);
    expect(patch.nextReviewAt).toBe('2026-05-16T00:00:00.000Z');

    const [reviewed] = updateStudyItemReviewResult([baseItem], baseItem.id, 'good', reviewedAt);

    expect(reviewed.reviewCount).toBe(1);
    expect(reviewed.correctCount).toBe(1);
    expect(reviewed.nextReviewAt).toBe('2026-05-22T00:00:00.000Z');
  });

  it('filters due and mistaken study items', () => {
    const baseItem = upsertStudyItem([], {
      id: 'study-1',
      appVersion: '1.1.2',
      settings: DEFAULT_SETTINGS,
      turns: turns('一道导数题')
    })[0] as StudyItem;
    const [item] = updateStudyItemMetadata([baseItem], baseItem.id, {
      status: 'reviewing',
      wrongCount: 2,
      nextReviewAt: '2026-05-14T00:00:00.000Z'
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T00:00:00.000Z'));

    expect(getDueStudyItems([item])).toHaveLength(1);
    expect(studyLibraryStats([item]).mistakes).toBe(1);
    expect(
      filterStudyItems([item], {
        query: '',
        subject: 'all',
        status: 'all',
        favoritesOnly: false,
        dueOnly: true,
        mistakesOnly: true
      })
    ).toHaveLength(1);
  });

  it('normalizes tag text', () => {
    expect(tagsFromText('数学, 导数，导数  复习')).toEqual(['数学', '导数', '复习']);
  });

  it('builds dashboard statistics from review and metadata fields', () => {
    const reviewedAt = new Date('2026-05-15T00:00:00.000Z');
    const baseItem = upsertStudyItem([], {
      id: 'study-1',
      appVersion: '1.2.0',
      settings: DEFAULT_SETTINGS,
      turns: turns('一道导数题')
    })[0] as StudyItem;
    const [item] = updateStudyItemMetadata([baseItem], baseItem.id, {
      subject: 'math',
      status: 'mastered',
      wrongCount: 1,
      lastReviewedAt: '2026-05-14T00:00:00.000Z',
      metadata: {
        subject: 'math',
        topic: '导数',
        questionType: '计算题',
        difficulty: 'normal',
        keyPoints: ['导数', '链式法则'],
        mistakeTraps: ['符号错误'],
        tags: ['数学'],
        summary: '练习导数计算',
        extractedAt: '2026-05-14T00:00:00.000Z'
      }
    });

    const stats = studyDashboardStats([item], reviewedAt);

    expect(stats.masteredRate).toBe(100);
    expect(stats.reviewedLast7Days).toBe(1);
    expect(stats.mistakes).toBe(1);
    expect(stats.subjectCounts).toEqual([{ subject: 'math', count: 1 }]);
    expect(stats.topKnowledgePoints).toEqual([
      { label: '导数', count: 1 },
      { label: '链式法则', count: 1 }
    ]);
    expect(stats.topMistakeTraps).toEqual([{ label: '符号错误', count: 1 }]);
  });
});
