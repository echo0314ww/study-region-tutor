import type {
  Announcement,
  ApiRuntimeDefaults,
  ExplainRegionResult,
  OcrPreviewResult,
  RegionBounds,
  TutorSettings
} from '../../shared/types';
import type { DragState, FloatingPosition, PanelDragState } from './uiTypes';
import {
  BUILT_IN_PROXY_URL,
  DEFAULT_SETTINGS,
  MIN_REGION,
  MIN_RESULT_PANEL_HEIGHT,
  MIN_RESULT_PANEL_WIDTH,
  PROXY_TOKEN_INVALID_MESSAGE,
  READ_ANNOUNCEMENT_REVISION_KEY
} from './constants';

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
  localStorage.setItem(READ_ANNOUNCEMENT_REVISION_KEY, revision);
}

export function isReleaseAnnouncement(announcement: Announcement): boolean {
  return announcement.id.startsWith('release-');
}

export function announcementMetaText(announcement: Announcement): string {
  return announcement.level ? `${announcement.level} · ${announcement.publishedAt}` : announcement.publishedAt;
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
