import type { RegionBounds, ShortcutBinding, TutorSettings } from '../../shared/types';
import type { DragMode } from './uiTypes';

export const MIN_REGION = 96;
export const MIN_RESULT_PANEL_WIDTH = 320;
export const MIN_RESULT_PANEL_HEIGHT = 220;
export const DRAG_CAPTURE_CANCEL_DISTANCE = 8;
export const HANDLE_NAMES: DragMode[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
export const BUILT_IN_PROXY_URL = 'https://mariyah-trailless-graig.ngrok-free.dev';
export const ANNOUNCEMENT_HEALTH_RETRY_MS = 15000;

export const DEFAULT_REGION: RegionBounds = {
  x: 220,
  y: 150,
  width: 620,
  height: 360
};

export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  { action: 'start-capture', key: 'Ctrl+Shift+S', enabled: true },
  { action: 'cancel-capture', key: 'Escape', enabled: true },
  { action: 'confirm-capture', key: 'Enter', enabled: true },
  { action: 'toggle-result', key: 'Ctrl+Shift+R', enabled: true },
  { action: 'open-settings', key: 'Ctrl+Shift+P', enabled: true },
  { action: 'open-announcements', key: 'Ctrl+Shift+A', enabled: true },
  { action: 'finish-question', key: 'Ctrl+Shift+Q', enabled: true }
];

export const DEFAULT_SETTINGS: TutorSettings = {
  apiConnectionMode: 'direct',
  providerId: '',
  model: '',
  language: 'zh-CN',
  theme: 'system',
  reasoningOnly: false,
  apiMode: 'env',
  apiBaseUrl: '',
  apiKey: '',
  proxyUrl: '',
  proxyToken: '',
  inputMode: 'image',
  ocrLanguage: 'chi_sim',
  ocrMathMode: true,
  ocrPreprocessMode: 'auto',
  reasoningEffort: 'off',
  shortcuts: DEFAULT_SHORTCUTS,
  promptTemplateId: 'standard',
  customPromptInstruction: ''
};

export const MODEL_PLACEHOLDER_VALUE = '__select_model__';
export const CUSTOM_MODEL_VALUE = '__custom_model__';
export const READ_ANNOUNCEMENT_REVISION_KEY = 'study-region-tutor-read-announcement-revision';
export const SETTINGS_STORAGE_KEY = 'study-region-tutor:settings:v1';
export const SETUP_WIZARD_COMPLETED_VERSION_KEY = 'study-region-tutor-setup-wizard-completed-version';
export const SETUP_WIZARD_DISMISSED_VERSION_KEY = 'study-region-tutor-setup-wizard-dismissed-version';
export const LOCAL_HISTORY_STORAGE_KEY = 'study-region-tutor:local-history:v1';
export const LOCAL_HISTORY_LIMIT = 30;
export const STUDY_LIBRARY_STORAGE_KEY = 'study-region-tutor:study-library:v1';
export const STUDY_LIBRARY_LIMIT = 80;
export const PROXY_TOKEN_INVALID_MESSAGE = '代理访问 Token 已失效，请重新填写最新的 TUTOR_PROXY_TOKEN。';
export const PRODUCT_GUIDE_SEEN_VERSION_KEY = 'study-region-tutor-product-guide-seen-version';
export const RELEASE_GUIDE_SEEN_VERSION_KEY = 'study-region-tutor-release-guide-seen-version';
