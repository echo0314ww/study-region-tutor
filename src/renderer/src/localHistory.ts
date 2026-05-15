import type { TutorSettings } from '../../shared/types';
import { LOCAL_HISTORY_LIMIT, LOCAL_HISTORY_STORAGE_KEY } from './constants';
import type { LocalHistoryItem, UiConversationTurn } from './uiTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
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

function sanitizeHistoryItem(raw: unknown): LocalHistoryItem | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const id = safeString(raw.id);
  const turns = Array.isArray(raw.turns) ? raw.turns.map(sanitizeTurn).filter((turn) => turn !== undefined) : [];

  if (!id || turns.length === 0) {
    return undefined;
  }

  return {
    id,
    title: safeString(raw.title) || deriveHistoryTitle(turns),
    createdAt: safeString(raw.createdAt) || new Date().toISOString(),
    updatedAt: safeString(raw.updatedAt) || new Date().toISOString(),
    appVersion: safeString(raw.appVersion),
    model: safeString(raw.model),
    providerId: safeString(raw.providerId),
    inputMode: raw.inputMode === 'ocr-text' ? 'ocr-text' : 'image',
    language: raw.language === 'en' ? 'en' : 'zh-CN',
    turns
  };
}

export function loadLocalHistory(): LocalHistoryItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
          .map(sanitizeHistoryItem)
          .filter((item) => item !== undefined)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, LOCAL_HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function saveLocalHistory(items: LocalHistoryItem[]): void {
  try {
    localStorage.setItem(LOCAL_HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, LOCAL_HISTORY_LIMIT)));
  } catch (error) {
    console.warn(`Unable to persist local history: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function deriveHistoryTitle(turns: UiConversationTurn[]): string {
  const firstUser = turns.find((turn) => turn.role === 'user' && turn.content.trim());
  const firstAssistant = turns.find((turn) => turn.role === 'assistant' && turn.content.trim());
  const source = (firstUser || firstAssistant)?.content.replace(/\s+/g, ' ').trim() || '未命名题目';

  return source.length > 36 ? `${source.slice(0, 36)}...` : source;
}

export function upsertLocalHistoryItem(
  items: LocalHistoryItem[],
  input: {
    id: string;
    appVersion: string;
    settings: TutorSettings;
    turns: UiConversationTurn[];
  }
): LocalHistoryItem[] {
  const turns = input.turns.filter((turn) => turn.content.trim());

  if (turns.length === 0) {
    return items;
  }

  const now = new Date().toISOString();
  const existing = items.find((item) => item.id === input.id);
  const nextItem: LocalHistoryItem = {
    id: input.id,
    title: deriveHistoryTitle(turns),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    appVersion: input.appVersion,
    model: input.settings.model.trim(),
    providerId: input.settings.providerId.trim(),
    inputMode: input.settings.inputMode,
    language: input.settings.language,
    turns
  };

  return [nextItem, ...items.filter((item) => item.id !== input.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, LOCAL_HISTORY_LIMIT);
}
