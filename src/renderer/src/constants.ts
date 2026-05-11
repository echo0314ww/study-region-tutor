import type { RegionBounds, TutorSettings } from '../../shared/types';
import type { DragMode } from './uiTypes';

export const MIN_REGION = 96;
export const MIN_RESULT_PANEL_WIDTH = 320;
export const MIN_RESULT_PANEL_HEIGHT = 220;
export const HANDLE_NAMES: DragMode[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
export const BUILT_IN_PROXY_URL = 'https://mariyah-trailless-graig.ngrok-free.dev';
export const ANNOUNCEMENT_HEALTH_RETRY_MS = 15000;

export const DEFAULT_REGION: RegionBounds = {
  x: 220,
  y: 150,
  width: 620,
  height: 360
};

export const DEFAULT_SETTINGS: TutorSettings = {
  apiConnectionMode: 'direct',
  providerId: '',
  model: '',
  language: 'zh-CN',
  reasoningOnly: false,
  apiMode: 'env',
  apiBaseUrl: '',
  apiKey: '',
  proxyUrl: '',
  proxyToken: '',
  inputMode: 'image',
  ocrLanguage: 'chi_sim',
  ocrMathMode: true,
  reasoningEffort: 'low'
};

export const MODEL_PLACEHOLDER_VALUE = '__select_model__';
export const CUSTOM_MODEL_VALUE = '__custom_model__';
export const READ_ANNOUNCEMENT_REVISION_KEY = 'study-region-tutor-read-announcement-revision';
export const PROXY_TOKEN_INVALID_MESSAGE = '代理访问 Token 已失效，请重新填写最新的 TUTOR_PROXY_TOKEN。';
