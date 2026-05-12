export type TutorLanguage = 'zh-CN' | 'en';
export type ApiMode = 'chat-completions' | 'responses';
export type ApiModeSetting = ApiMode | 'env';
export type ApiConnectionMode = 'direct' | 'proxy';
export type InputMode = 'ocr-text' | 'image';
export type OcrPreviewReason = 'ocr-mode' | 'image-fallback';
export type OcrLanguage = 'chi_sim' | 'eng';
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
export type ReasoningEffortSetting = ReasoningEffort | 'off';
export type SessionRole = 'user' | 'assistant';
export type DiagnosticStatus = 'pass' | 'warn' | 'fail';
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
  level: string;
  publishedAt: string;
}

export interface AnnouncementEvent {
  announcement: Announcement | null;
  announcements: Announcement[];
  revision: string;
  sourceUrl: string;
  receivedAt: string;
}

export interface ProxyHealthResult {
  ok: boolean;
  sourceUrl: string;
  message: string;
  tokenCount?: number;
  rateLimitEnabled?: boolean;
  providerCount?: number;
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
  localEnvPath?: string;
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

export interface OcrPreviewResult {
  type: 'ocr-preview';
  recognizedText: string;
  processLog: string;
  sourceMode: InputMode;
  reason: OcrPreviewReason;
  fallbackReason?: string;
}

export type ExplainRegionResult = ExplainResult | OcrPreviewResult;

export interface RecognizeRegionRequest {
  requestId: string;
  region: RegionBounds;
  settings: TutorSettings;
}

export interface ExplainRecognizedTextRequest {
  requestId: string;
  recognizedText: string;
  settings: TutorSettings;
  sourceMode: InputMode;
  reason: OcrPreviewReason;
  fallbackReason?: string;
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

export interface DiagnosticStep {
  id: string;
  title: string;
  status: DiagnosticStatus;
  summary: string;
  cause?: string;
  solution?: string;
  technicalDetail?: string;
}

export interface DiagnosticResult {
  ok: boolean;
  mode: ApiConnectionMode;
  generatedAt: string;
  appVersion: string;
  steps: DiagnosticStep[];
}

export interface RunDiagnosticsRequest {
  settings: TutorSettings;
  appVersion: string;
  deepCheck?: boolean;
}

export interface ExportConversationRequest {
  appVersion: string;
  exportedAt: string;
  model: string;
  language: TutorLanguage;
  inputMode: InputMode;
  reasoningOnly: boolean;
  turns: QuestionSessionTurn[];
}

export interface ExportConversationResult {
  canceled: boolean;
  filePath?: string;
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
