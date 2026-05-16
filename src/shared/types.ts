export type TutorLanguage = 'zh-CN' | 'en';
export type ApiMode = 'chat-completions' | 'responses';
export type ApiModeSetting = ApiMode | 'env';
export type ApiProviderType = 'openai-compatible' | 'gemini' | 'anthropic';
export type ApiConnectionMode = 'direct' | 'proxy';
export type InputMode = 'ocr-text' | 'image';
export type OcrPreviewReason = 'ocr-mode' | 'image-fallback';
export type OcrLanguage = 'chi_sim' | 'eng';
export type OcrPreprocessMode = 'auto' | 'none' | 'contrast' | 'binary' | 'multi';
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ReasoningEffortSetting = ReasoningEffort | 'off';
export type SessionRole = 'user' | 'assistant';
export type DiagnosticStatus = 'pass' | 'warn' | 'fail';
export type StudySubject = 'general' | 'math' | 'english' | 'physics' | 'programming';
export type StudyItemStatus = 'new' | 'reviewing' | 'mastered';
export type StudyDifficulty = 'easy' | 'normal' | 'hard';
export type StudyReviewGrade = 'again' | 'hard' | 'good' | 'easy';
export type StudyLibraryExportFormat = 'markdown' | 'anki-csv' | 'obsidian';
export type ThemeSetting = 'light' | 'dark' | 'system';
export type ShortcutAction =
  | 'start-capture'
  | 'cancel-capture'
  | 'confirm-capture'
  | 'toggle-result'
  | 'open-settings'
  | 'open-announcements'
  | 'finish-question';
export type PromptTemplateId = 'standard' | 'concise' | 'socratic' | 'exam-safe' | 'custom';
export interface RegionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShortcutBinding {
  action: ShortcutAction;
  key: string;
  enabled: boolean;
}

export interface TutorSettings {
  apiConnectionMode: ApiConnectionMode;
  providerId: string;
  model: string;
  language: TutorLanguage;
  theme: ThemeSetting;
  reasoningOnly: boolean;
  apiMode: ApiModeSetting;
  apiBaseUrl: string;
  apiKey: string;
  proxyUrl: string;
  proxyToken: string;
  inputMode: InputMode;
  ocrLanguage: OcrLanguage;
  ocrMathMode: boolean;
  ocrPreprocessMode: OcrPreprocessMode;
  reasoningEffort: ReasoningEffortSetting;
  shortcuts?: ShortcutBinding[];
  promptTemplateId?: PromptTemplateId;
  customPromptInstruction?: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  level: string;
  publishedAt: string;
  category?: string;
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
  serviceUrls?: {
    local?: string[];
    lan?: string[];
    public?: string[];
  };
  announcementEnabled?: boolean;
  announcementCount?: number;
  loadedAt?: string;
}

export interface ApiProviderOption {
  id: string;
  name: string;
  baseUrl: string;
  apiMode: ApiMode;
  apiProviderType: ApiProviderType;
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
  candidates?: OcrCandidate[];
  selectedCandidateId?: string;
}

export interface OcrCandidate {
  id: string;
  label: string;
  language: OcrLanguage;
  confidence: number;
  text: string;
}

export interface OcrRecognitionResult {
  recognizedText: string;
  candidates: OcrCandidate[];
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

export interface StudyMetadata {
  subject: StudySubject;
  topic: string;
  questionType: string;
  difficulty: StudyDifficulty;
  keyPoints: string[];
  mistakeTraps: string[];
  tags: string[];
  summary: string;
  extractedAt: string;
}

export interface ExtractStudyMetadataRequest {
  text: string;
  settings: TutorSettings;
}

export interface ExtractStudyMetadataResult {
  metadata: StudyMetadata;
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

export interface StudyLibraryExportItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastReviewedAt: string;
  nextReviewAt: string;
  appVersion: string;
  model: string;
  providerId: string;
  inputMode: InputMode;
  language: TutorLanguage;
  subject: StudySubject;
  tags: string[];
  favorite: boolean;
  status: StudyItemStatus;
  reviewCount: number;
  correctCount: number;
  wrongCount: number;
  difficulty: StudyDifficulty;
  mistakeReason: string;
  metadata?: StudyMetadata;
  turns: QuestionSessionTurn[];
}

export interface ExportStudyLibraryRequest {
  appVersion: string;
  exportedAt: string;
  format: StudyLibraryExportFormat;
  items: StudyLibraryExportItem[];
}

export type StudyBackupMergeStrategy = 'replace' | 'merge-prefer-imported' | 'merge-prefer-local';

export interface StudyLibraryBackup {
  version: 1;
  exportedAt: string;
  appVersion: string;
  itemCount: number;
  items: StudyLibraryExportItem[];
}

export interface PromptEvalVariant {
  id: string;
  providerId: string;
  model: string;
  promptTemplateId: PromptTemplateId;
  customPromptInstruction?: string;
}

export interface PromptEvalRun {
  id: string;
  createdAt: string;
  providerId: string;
  model: string;
  promptTemplateId: PromptTemplateId;
  latencyMs: number;
  outputLength: number;
  success: boolean;
  output: string;
  error?: string;
  rating?: 1 | 2 | 3 | 4 | 5;
}

export interface RunPromptEvalRequest {
  requestId?: string;
  inputText: string;
  settings: TutorSettings;
  variants: PromptEvalVariant[];
}

export interface RunPromptEvalResult {
  runs: PromptEvalRun[];
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
  outputScaleFactor: number;
  outputPixels: RegionBounds;
  segments: CropSegment[];
}

export interface CropSegment {
  displayId: number;
  sourceDipBounds: RegionBounds;
  sourceDipRegion: RegionBounds;
  cropPixels: RegionBounds;
  outputPixels: RegionBounds;
}

export interface DebugSnapshot {
  region: RegionBounds;
  displayId: number | string;
  scaleFactor: number;
  cropPixels: RegionBounds;
}
