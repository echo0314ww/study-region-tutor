import type {
  Announcement,
  ApiRuntimeDefaults,
  ExplainRegionResult,
  OcrPreviewResult,
  RegionBounds,
  ShortcutAction,
  ShortcutBinding,
  TutorSettings
} from '../../shared/types';
import type React from 'react';
import type { DragState, FloatingPosition, PanelDragState } from './uiTypes';
import {
  BUILT_IN_PROXY_URL,
  DEFAULT_SHORTCUTS,
  DEFAULT_SETTINGS,
  MIN_REGION,
  MIN_RESULT_PANEL_HEIGHT,
  MIN_RESULT_PANEL_WIDTH,
  PROXY_TOKEN_INVALID_MESSAGE,
  READ_ANNOUNCEMENT_REVISION_KEY,
  SETTINGS_STORAGE_KEY
} from './constants';

const PERSISTED_SETTING_KEYS = [
  'apiConnectionMode',
  'providerId',
  'model',
  'language',
  'reasoningOnly',
  'apiMode',
  'apiBaseUrl',
  'proxyUrl',
  'inputMode',
  'ocrLanguage',
  'ocrMathMode',
  'reasoningEffort',
  'shortcuts',
  'promptTemplateId',
  'customPromptInstruction'
] as const;

type PersistedSettingKey = (typeof PERSISTED_SETTING_KEYS)[number];
type PersistedTutorSettings = Partial<Pick<TutorSettings, PersistedSettingKey>>;
type StringSettingKey = Exclude<PersistedSettingKey, 'reasoningOnly' | 'ocrMathMode' | 'shortcuts'>;

const FREE_TEXT_SETTING_KEYS = new Set<StringSettingKey>([
  'providerId',
  'model',
  'apiBaseUrl',
  'proxyUrl',
  'customPromptInstruction'
]);
const STRING_SETTING_OPTIONS: Partial<Record<StringSettingKey, readonly string[]>> = {
  apiConnectionMode: ['direct', 'proxy'],
  language: ['zh-CN', 'en'],
  apiMode: ['env', 'chat-completions', 'responses'],
  inputMode: ['ocr-text', 'image'],
  ocrLanguage: ['chi_sim', 'eng'],
  reasoningEffort: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  promptTemplateId: ['standard', 'concise', 'socratic', 'exam-safe', 'custom']
};

const SHORTCUT_ACTIONS = new Set<ShortcutAction>(DEFAULT_SHORTCUTS.map((shortcut) => shortcut.action));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeShortcutKey(key: string): string {
  const normalized = key.trim();

  if (normalized.length === 1) {
    return normalized.toUpperCase();
  }

  const aliases: Record<string, string> = {
    esc: 'Escape',
    escape: 'Escape',
    enter: 'Enter',
    return: 'Enter',
    space: 'Space',
    ' ': 'Space',
    arrowup: 'ArrowUp',
    arrowdown: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    arrowright: 'ArrowRight'
  };

  return aliases[normalized.toLowerCase()] || normalized;
}

export function normalizeShortcutText(value: string): string {
  const parts = value
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  const modifiers = new Set<string>();
  let key = '';

  for (const part of parts) {
    const normalized = part.toLowerCase();

    if (normalized === 'ctrl' || normalized === 'control') {
      modifiers.add('Ctrl');
    } else if (normalized === 'shift') {
      modifiers.add('Shift');
    } else if (normalized === 'alt' || normalized === 'option') {
      modifiers.add('Alt');
    } else if (normalized === 'meta' || normalized === 'cmd' || normalized === 'command') {
      modifiers.add('Meta');
    } else if (!key) {
      key = normalizeShortcutKey(part);
    }
  }

  return [...['Ctrl', 'Shift', 'Alt', 'Meta'].filter((modifier) => modifiers.has(modifier)), key]
    .filter(Boolean)
    .join('+');
}

function normalizeShortcutBindings(raw: unknown): ShortcutBinding[] {
  const byAction = new Map<ShortcutAction, ShortcutBinding>();

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isRecord(item)) {
        continue;
      }

      const action = item.action;
      const key = item.key;
      const enabled = item.enabled;

      if (typeof action !== 'string' || !SHORTCUT_ACTIONS.has(action as ShortcutAction) || typeof key !== 'string') {
        continue;
      }

      byAction.set(action as ShortcutAction, {
        action: action as ShortcutAction,
        key: normalizeShortcutText(key),
        enabled: typeof enabled === 'boolean' ? enabled : true
      });
    }
  }

  return DEFAULT_SHORTCUTS.map((shortcut) => ({
    ...shortcut,
    ...(byAction.get(shortcut.action) || {})
  }));
}

function pickPersistableSettings(settings: TutorSettings): PersistedTutorSettings {
  return {
    apiConnectionMode: settings.apiConnectionMode,
    providerId: settings.providerId,
    model: settings.model,
    language: settings.language,
    reasoningOnly: settings.reasoningOnly,
    apiMode: settings.apiMode,
    apiBaseUrl: settings.apiBaseUrl,
    proxyUrl: settings.proxyUrl,
    inputMode: settings.inputMode,
    ocrLanguage: settings.ocrLanguage,
    ocrMathMode: settings.ocrMathMode,
    reasoningEffort: settings.reasoningEffort,
    shortcuts: normalizeShortcutBindings(settings.shortcuts),
    promptTemplateId: settings.promptTemplateId,
    customPromptInstruction: settings.customPromptInstruction
  };
}

function sanitizePersistedSettings(raw: unknown): PersistedTutorSettings {
  if (!isRecord(raw)) {
    return {};
  }

  const settings: PersistedTutorSettings = {};

  for (const key of PERSISTED_SETTING_KEYS) {
    const value = raw[key];

    const defaultValue = DEFAULT_SETTINGS[key];

    if (key === 'shortcuts') {
      settings.shortcuts = normalizeShortcutBindings(value);
      continue;
    }

    if (typeof defaultValue === 'boolean') {
      if (typeof value === 'boolean') {
        settings[key] = value as never;
      }
      continue;
    }

    if (
      typeof value === 'string' &&
      (FREE_TEXT_SETTING_KEYS.has(key as StringSettingKey) ||
        STRING_SETTING_OPTIONS[key as StringSettingKey]?.includes(value))
    ) {
      settings[key] = value as never;
    }
  }

  return settings;
}

export function defaultResultPanel(): RegionBounds {
  const width = Math.min(560, Math.max(MIN_RESULT_PANEL_WIDTH, window.innerWidth - 44));
  const height = Math.min(560, Math.max(MIN_RESULT_PANEL_HEIGHT, window.innerHeight - 112));

  return {
    x: window.innerWidth - width - 22,
    y: 84,
    width,
    height
  };
}

export function settingsWithApiDefaults(defaults: ApiRuntimeDefaults): TutorSettings {
  return {
    ...DEFAULT_SETTINGS,
    apiConnectionMode: defaults.apiConnectionMode || DEFAULT_SETTINGS.apiConnectionMode,
    providerId: defaults.providerId || DEFAULT_SETTINGS.providerId,
    apiBaseUrl: defaults.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl,
    apiMode: defaults.providerId ? 'env' : defaults.apiMode || DEFAULT_SETTINGS.apiMode,
    proxyUrl: DEFAULT_SETTINGS.proxyUrl
  };
}

export function settingsWithPersistedUserSettings(settings: TutorSettings): TutorSettings {
  const persisted = loadPersistedSettings();

  return {
    ...settings,
    ...persisted,
    shortcuts: normalizeShortcutBindings(persisted.shortcuts || settings.shortcuts),
    promptTemplateId: persisted.promptTemplateId || settings.promptTemplateId || DEFAULT_SETTINGS.promptTemplateId,
    customPromptInstruction: persisted.customPromptInstruction ?? settings.customPromptInstruction ?? '',
    apiKey: settings.apiKey,
    proxyToken: settings.proxyToken
  };
}

export function loadPersistedSettings(): PersistedTutorSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);

    return raw ? sanitizePersistedSettings(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function savePersistedSettings(settings: TutorSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(pickPersistableSettings(settings)));
  } catch (error) {
    console.warn(`Unable to persist non-sensitive settings: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function effectiveProxyUrl(settings: TutorSettings): string {
  return settings.proxyUrl.trim() || BUILT_IN_PROXY_URL;
}

export function settingsWithEffectiveProxyUrl(settings: TutorSettings): TutorSettings {
  if (settings.apiConnectionMode !== 'proxy') {
    return settings;
  }

  const proxyUrl = effectiveProxyUrl(settings);

  return proxyUrl ? { ...settings, proxyUrl } : settings;
}

export function hasDirectApiConfig(defaults: ApiRuntimeDefaults | null): boolean {
  if (!defaults) {
    return false;
  }

  return (
    defaults.providers.some((provider) => provider.baseUrl.trim() && provider.hasApiKey) ||
    Boolean(defaults.apiBaseUrl.trim() && defaults.hasApiKey)
  );
}

export function hasSelectedDirectApiConfig(defaults: ApiRuntimeDefaults | null, providerId: string): boolean {
  if (!defaults) {
    return false;
  }

  const selectedProvider = providerId
    ? defaults.providers.find((provider) => provider.id === providerId)
    : defaults.providers.find((provider) => provider.isDefault) || defaults.providers[0];

  if (selectedProvider) {
    return Boolean(selectedProvider.baseUrl.trim() && selectedProvider.hasApiKey);
  }

  return Boolean(defaults.apiBaseUrl.trim() && defaults.hasApiKey);
}

export function loadReadAnnouncementRevision(): string {
  try {
    return localStorage.getItem(READ_ANNOUNCEMENT_REVISION_KEY) || '';
  } catch {
    return '';
  }
}

export function saveReadAnnouncementRevision(revision: string): void {
  try {
    localStorage.setItem(READ_ANNOUNCEMENT_REVISION_KEY, revision);
  } catch (error) {
    console.warn(`Unable to persist announcement read state: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function isReleaseAnnouncement(announcement: Announcement): boolean {
  return announcement.id.startsWith('release-');
}

export function announcementMetaText(announcement: Announcement): string {
  return announcement.level ? `${announcement.level} · ${announcement.publishedAt}` : announcement.publishedAt;
}

export function announcementCategory(announcement: Announcement): string {
  if (announcement.category?.trim()) {
    return announcement.category.trim();
  }

  return isReleaseAnnouncement(announcement) ? '版本公告' : '普通公告';
}

export function shortcutActionLabel(action: ShortcutAction): string {
  const labels: Record<ShortcutAction, string> = {
    'start-capture': '开始截图',
    'cancel-capture': '取消截图/关闭当前操作',
    'confirm-capture': '确认识别',
    'toggle-result': '打开/关闭结果',
    'open-settings': '打开/关闭设置',
    'open-announcements': '打开/关闭公告',
    'finish-question': '结束当前题目'
  };

  return labels[action];
}

export function shortcutFromKeyboardEvent(event: KeyboardEvent | React.KeyboardEvent): string {
  const key = normalizeShortcutKey(event.key);

  if (!key || ['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
    return '';
  }

  return normalizeShortcutText(
    [
      event.ctrlKey ? 'Ctrl' : '',
      event.shiftKey ? 'Shift' : '',
      event.altKey ? 'Alt' : '',
      event.metaKey ? 'Meta' : '',
      key
    ]
      .filter(Boolean)
      .join('+')
  );
}

export function shortcutBindings(settings: TutorSettings): ShortcutBinding[] {
  return normalizeShortcutBindings(settings.shortcuts);
}

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isCanceledError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === 'AbortError' || error.message.includes('已停止当前识别/回答');
}

export function isProxyTokenInvalidMessage(message: string): boolean {
  return message.includes(PROXY_TOKEN_INVALID_MESSAGE);
}

export function isOcrPreviewResult(response: ExplainRegionResult): response is OcrPreviewResult {
  return 'type' in response && response.type === 'ocr-preview';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function isInteractiveElement(element: Element | null): boolean {
  return Boolean(element?.closest('[data-interactive="true"]'));
}

export function clampRegion(region: RegionBounds): RegionBounds {
  const maxWidth = Math.max(MIN_REGION, window.innerWidth - 24);
  const maxHeight = Math.max(MIN_REGION, window.innerHeight - 24);
  const width = clamp(region.width, MIN_REGION, maxWidth);
  const height = clamp(region.height, MIN_REGION, maxHeight);

  return {
    x: clamp(region.x, 12, Math.max(12, window.innerWidth - width - 12)),
    y: clamp(region.y, 12, Math.max(12, window.innerHeight - height - 12)),
    width,
    height
  };
}

export function clampResultPanel(panel: RegionBounds): RegionBounds {
  const maxWidth = Math.max(MIN_RESULT_PANEL_WIDTH, window.innerWidth - 24);
  const maxHeight = Math.max(MIN_RESULT_PANEL_HEIGHT, window.innerHeight - 24);
  const width = clamp(panel.width, MIN_RESULT_PANEL_WIDTH, maxWidth);
  const height = clamp(panel.height, MIN_RESULT_PANEL_HEIGHT, maxHeight);

  return {
    x: clamp(panel.x, 12, Math.max(12, window.innerWidth - width - 12)),
    y: clamp(panel.y, 12, Math.max(12, window.innerHeight - height - 12)),
    width,
    height
  };
}

export function clampFloatingPosition(position: FloatingPosition, width: number, height: number): FloatingPosition {
  const margin = 12;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);

  return {
    x: clamp(position.x, margin, maxX),
    y: clamp(position.y, margin, maxY)
  };
}

export function resizeRegion(drag: DragState, currentX: number, currentY: number): RegionBounds {
  const dx = currentX - drag.startX;
  const dy = currentY - drag.startY;
  const next = { ...drag.startRegion };

  if (drag.mode === 'move') {
    next.x += dx;
    next.y += dy;
    return clampRegion(next);
  }

  if (drag.mode.includes('e')) {
    next.width += dx;
  }

  if (drag.mode.includes('s')) {
    next.height += dy;
  }

  if (drag.mode.includes('w')) {
    next.x += dx;
    next.width -= dx;
  }

  if (drag.mode.includes('n')) {
    next.y += dy;
    next.height -= dy;
  }

  if (next.width < MIN_REGION) {
    next.x = drag.startRegion.x + drag.startRegion.width - MIN_REGION;
    next.width = MIN_REGION;
  }

  if (next.height < MIN_REGION) {
    next.y = drag.startRegion.y + drag.startRegion.height - MIN_REGION;
    next.height = MIN_REGION;
  }

  return clampRegion(next);
}

export function resizeResultPanel(drag: PanelDragState, currentX: number, currentY: number): RegionBounds {
  const dx = currentX - drag.startX;
  const dy = currentY - drag.startY;
  const next = { ...drag.startPanel };

  if (drag.mode === 'move') {
    next.x += dx;
    next.y += dy;
    return clampResultPanel(next);
  }

  if (drag.mode.includes('e')) {
    next.width += dx;
  }

  if (drag.mode.includes('s')) {
    next.height += dy;
  }

  if (drag.mode.includes('w')) {
    next.x += dx;
    next.width -= dx;
  }

  if (drag.mode.includes('n')) {
    next.y += dy;
    next.height -= dy;
  }

  if (next.width < MIN_RESULT_PANEL_WIDTH) {
    if (drag.mode.includes('w')) {
      next.x = drag.startPanel.x + drag.startPanel.width - MIN_RESULT_PANEL_WIDTH;
    }

    next.width = MIN_RESULT_PANEL_WIDTH;
  }

  if (next.height < MIN_RESULT_PANEL_HEIGHT) {
    if (drag.mode.includes('n')) {
      next.y = drag.startPanel.y + drag.startPanel.height - MIN_RESULT_PANEL_HEIGHT;
    }

    next.height = MIN_RESULT_PANEL_HEIGHT;
  }

  return clampResultPanel(next);
}
