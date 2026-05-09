export type TutorLanguage = 'zh-CN' | 'en';
export type ApiMode = 'chat-completions' | 'responses';
export type ApiModeSetting = ApiMode | 'env';
export type ApiConnectionMode = 'direct' | 'proxy';
export type InputMode = 'ocr-text' | 'image';
export type OcrLanguage = 'chi_sim' | 'eng';
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
export type ReasoningEffortSetting = ReasoningEffort | 'off';
export type SessionRole = 'user' | 'assistant';
export type AnnouncementLevel = 'info' | 'warning' | 'critical';

export interface RegionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TutorSettings {
  apiConnectionMode: ApiConnectionMode;
  providerId: string;
  model: string;
  language: TutorLanguage;
  reasoningOnly: boolean;
  apiMode: ApiModeSetting;
  apiBaseUrl: string;
  apiKey: string;
  proxyUrl: string;
  proxyToken: string;
  inputMode: InputMode;
  ocrLanguage: OcrLanguage;
  ocrMathMode: boolean;
  reasoningEffort: ReasoningEffortSetting;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  level: AnnouncementLevel;
  publishedAt: string;
  popup: boolean;
}

export interface AnnouncementEvent {
  announcement: Announcement | null;
  announcements: Announcement[];
  sourceUrl: string;
  receivedAt: string;
}

export interface ApiProviderOption {
  id: string;
  name: string;
  baseUrl: string;
  apiMode: ApiMode;
  hasApiKey: boolean;
  isDefault: boolean;
}

export interface ApiRuntimeDefaults {
  apiConnectionMode: ApiConnectionMode;
  apiBaseUrl: string;
  apiMode?: ApiMode;
  hasApiKey: boolean;
  providerId: string;
  providers: ApiProviderOption[];
  proxyUrl: string;
  hasProxyToken: boolean;
}

export interface ExplainRequest {
  requestId: string;
  region: RegionBounds;
  settings: TutorSettings;
}

export interface ExplainResult {
  text: string;
  sessionId: string;
}

export interface ExplainProgressEvent {
  requestId: string;
  text: string;
}

export interface AnswerDeltaEvent {
  requestId: string;
  text: string;
  reset?: boolean;
}

export interface QuestionSessionTurn {
  role: SessionRole;
  content: string;
}

export interface FollowUpRequest {
  requestId: string;
  sessionId: string;
  question: string;
  settings: TutorSettings;
}

export interface FollowUpResult {
  text: string;
  sessionId: string;
}

export interface CancelRequest {
  requestId: string;
}

export interface EndQuestionSessionRequest {
  sessionId: string;
}

export interface ModelOption {
  id: string;
  ownedBy?: string;
}

export interface ModelListResult {
  models: ModelOption[];
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateStatusEvent {
  status: UpdateStatus;
  message: string;
  version?: string;
  percent?: number;
}

export interface DisplayLike {
  id: number;
  scaleFactor: number;
  bounds: RegionBounds;
}

export interface CropPlan {
  displayId: number;
  sourceDipBounds: RegionBounds;
  cropPixels: RegionBounds;
}

export interface DebugSnapshot {
  region: RegionBounds;
  displayId: number;
  scaleFactor: number;
  cropPixels: RegionBounds;
}
