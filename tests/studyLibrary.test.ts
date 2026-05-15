import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, LOCAL_HISTORY_STORAGE_KEY, STUDY_LIBRARY_STORAGE_KEY } from '../src/renderer/src/constants';
import {
  filterStudyItems,
  loadStudyItems,
  saveStudyItems,
  tagsFromText,
  updateStudyItemMetadata,
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
      tags: []
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

  it('normalizes tag text', () => {
    expect(tagsFromText('数学, 导数，导数  复习')).toEqual(['数学', '导数', '复习']);
  });
});
