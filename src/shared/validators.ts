import type {
  ApiConnectionMode,
  ApiModeSetting,
  CancelRequest,
  EndQuestionSessionRequest,
  ExportConversationRequest,
  ExportStudyLibraryRequest,
  ExtractStudyMetadataRequest,
  ExplainRecognizedTextRequest,
  ExplainRequest,
  FollowUpRequest,
  InputMode,
  OcrLanguage,
  OcrPreviewReason,
  OcrPreprocessMode,
  PromptTemplateId,
  QuestionSessionTurn,
  ReasoningEffortSetting,
  RecognizeRegionRequest,
  RegionBounds,
  RunDiagnosticsRequest,
  RunPromptEvalRequest,
  ShortcutAction,
  StudyDifficulty,
  StudyItemStatus,
  StudyLibraryExportFormat,
  StudyLibraryExportItem,
  StudyMetadata,
  StudySubject,
  ThemeSetting,
  TutorLanguage,
  TutorSettings
} from './types';

const API_CONNECTION_MODES = ['direct', 'proxy'] as const satisfies readonly ApiConnectionMode[];
const API_MODE_SETTINGS = ['chat-completions', 'responses', 'env'] as const satisfies readonly ApiModeSetting[];
const INPUT_MODES = ['ocr-text', 'image'] as const satisfies readonly InputMode[];
const OCR_LANGUAGES = ['chi_sim', 'eng'] as const satisfies readonly OcrLanguage[];
const OCR_PREPROCESS_MODES = ['auto', 'none', 'contrast', 'binary', 'multi'] as const satisfies readonly OcrPreprocessMode[];
const OCR_PREVIEW_REASONS = ['ocr-mode', 'image-fallback'] as const satisfies readonly OcrPreviewReason[];
const TUTOR_LANGUAGES = ['zh-CN', 'en'] as const satisfies readonly TutorLanguage[];
const THEME_SETTINGS = ['light', 'dark', 'system'] as const satisfies readonly ThemeSetting[];
const REASONING_EFFORTS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const satisfies readonly ReasoningEffortSetting[];
const PROMPT_TEMPLATE_IDS = ['standard', 'concise', 'socratic', 'exam-safe', 'custom'] as const satisfies readonly PromptTemplateId[];
const SHORTCUT_ACTIONS = [
  'start-capture',
  'cancel-capture',
  'confirm-capture',
  'toggle-result',
  'open-settings',
  'open-announcements',
  'finish-question'
] as const satisfies readonly ShortcutAction[];
const STUDY_SUBJECTS = ['general', 'math', 'english', 'physics', 'programming'] as const satisfies readonly StudySubject[];
const STUDY_STATUSES = ['new', 'reviewing', 'mastered'] as const satisfies readonly StudyItemStatus[];
const STUDY_DIFFICULTIES = ['easy', 'normal', 'hard'] as const satisfies readonly StudyDifficulty[];
const STUDY_EXPORT_FORMATS = ['markdown', 'anki-csv', 'obsidian'] as const satisfies readonly StudyLibraryExportFormat[];

const MAX_SHORT_TEXT = 512;
const MAX_LONG_TEXT = 100_000;
const MAX_EXPORT_ITEMS = 2_000;
const MAX_TURNS = 200;
const MAX_EVAL_VARIANTS = 20;
const MAX_PROXY_TOKEN_LENGTH = 4_096;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function fail(path: string, message: string): never {
  throw new ValidationError(`Invalid ${path}: ${message}`);
}

function stringValue(value: unknown, path: string, maxLength = MAX_SHORT_TEXT): string {
  if (typeof value !== 'string') {
    fail(path, 'expected string');
  }

  if (value.length > maxLength) {
    fail(path, `expected at most ${maxLength} characters`);
  }

  return value;
}

function nonEmptyString(value: unknown, path: string, maxLength = MAX_SHORT_TEXT): string {
  const text = stringValue(value, path, maxLength);

  if (!text.trim()) {
    fail(path, 'expected non-empty string');
  }

  return text;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    fail(path, 'expected boolean');
  }

  return value;
}

export function parseBooleanFlag(value: unknown, path = 'value'): boolean {
  return booleanValue(value, path);
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    fail(path, 'expected non-negative integer');
  }

  return value;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], path: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    fail(path, `expected one of ${values.join(', ')}`);
  }

  return value as T;
}

function arrayValue<T>(
  value: unknown,
  path: string,
  maxItems: number,
  parser: (item: unknown, itemPath: string) => T
): T[] {
  if (!Array.isArray(value)) {
    fail(path, 'expected array');
  }

  if (value.length > maxItems) {
    fail(path, `expected at most ${maxItems} items`);
  }

  return value.map((item, index) => parser(item, `${path}[${index}]`));
}

export function parseRegionBounds(value: unknown, path = 'region'): RegionBounds {
  if (!isRecord(value)) {
    fail(path, 'expected object');
  }

  const x = numberValue(value.x, `${path}.x`);
  const y = numberValue(value.y, `${path}.y`);
  const width = positiveNumber(value.width, `${path}.width`);
  const height = positiveNumber(value.height, `${path}.height`);

  if (x < -100_000 || x > 100_000 || y < -100_000 || y > 100_000 || width > 50_000 || height > 50_000) {
    fail(path, 'expected a bounded screen region');
  }

  return { x, y, width, height };
}

function numberValue(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, 'expected finite number');
  }

  return value;
}

function positiveNumber(value: unknown, path: string): number {
  const number = numberValue(value, path);

  if (number <= 0) {
    fail(path, 'expected positive number');
  }

  return number;
}

export function parseTutorSettings(value: unknown, path = 'settings'): TutorSettings {
  if (!isRecord(value)) {
    fail(path, 'expected object');
  }

  const shortcuts =
    value.shortcuts === undefined
      ? undefined
      : arrayValue(value.shortcuts, `${path}.shortcuts`, 20, (item, itemPath) => {
          if (!isRecord(item)) {
            fail(itemPath, 'expected object');
          }

          return {
            action: enumValue(item.action, SHORTCUT_ACTIONS, `${itemPath}.action`),
            key: stringValue(item.key, `${itemPath}.key`, 64),
            enabled: booleanValue(item.enabled, `${itemPath}.enabled`)
          };
        });

  return {
    apiConnectionMode: enumValue(value.apiConnectionMode, API_CONNECTION_MODES, `${path}.apiConnectionMode`),
    providerId: stringValue(value.providerId, `${path}.providerId`, 128),
    model: stringValue(value.model, `${path}.model`, 256),
    language: enumValue(value.language, TUTOR_LANGUAGES, `${path}.language`),
    reasoningOnly: booleanValue(value.reasoningOnly, `${path}.reasoningOnly`),
    apiMode: enumValue(value.apiMode, API_MODE_SETTINGS, `${path}.apiMode`),
    apiBaseUrl: stringValue(value.apiBaseUrl, `${path}.apiBaseUrl`, 2_048),
    apiKey: stringValue(value.apiKey, `${path}.apiKey`, 4_096),
    proxyUrl: stringValue(value.proxyUrl, `${path}.proxyUrl`, 2_048),
    proxyToken: stringValue(value.proxyToken, `${path}.proxyToken`, 4_096),
    inputMode: enumValue(value.inputMode, INPUT_MODES, `${path}.inputMode`),
    ocrLanguage: enumValue(value.ocrLanguage, OCR_LANGUAGES, `${path}.ocrLanguage`),
    ocrMathMode: booleanValue(value.ocrMathMode, `${path}.ocrMathMode`),
    ocrPreprocessMode: enumValue(value.ocrPreprocessMode, OCR_PREPROCESS_MODES, `${path}.ocrPreprocessMode`),
    reasoningEffort: enumValue(value.reasoningEffort, REASONING_EFFORTS, `${path}.reasoningEffort`),
    ...(shortcuts ? { shortcuts } : {}),
    ...(value.theme === undefined
      ? { theme: 'system' as const }
      : { theme: enumValue(value.theme, THEME_SETTINGS, `${path}.theme`) }),
    ...(value.promptTemplateId === undefined
      ? {}
      : { promptTemplateId: enumValue(value.promptTemplateId, PROMPT_TEMPLATE_IDS, `${path}.promptTemplateId`) }),
    ...(value.customPromptInstruction === undefined
      ? {}
      : { customPromptInstruction: stringValue(value.customPromptInstruction, `${path}.customPromptInstruction`, 4_000) })
  };
}

export function parseOptionalTutorSettings(value: unknown): TutorSettings | undefined {
  return value === undefined ? undefined : parseTutorSettings(value);
}

export function parseProxyToken(value: unknown): string {
  return stringValue(value, 'proxyToken', MAX_PROXY_TOKEN_LENGTH);
}

function isPrivateOrReservedIpv6(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, '');
  const lower = bare.toLowerCase();

  if (/^(0{0,4}:){7}0{0,3}1$/.test(lower)) return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe80%')) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;

  const mappedMatch = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mappedMatch) {
    const parts = mappedMatch[1].split('.').map(Number);
    if (
      parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    ) return true;
  }

  const hexMappedMatch = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hexMappedMatch) {
    const hi = parseInt(hexMappedMatch[1], 16);
    const o1 = (hi >> 8) & 0xff;
    const o2 = hi & 0xff;
    if (
      o1 === 10 || o1 === 127 || o1 === 0 ||
      (o1 === 169 && o2 === 254) ||
      (o1 === 172 && o2 >= 16 && o2 <= 31) ||
      (o1 === 192 && o2 === 168)
    ) return true;
  }

  const compatMatch = /^::(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (compatMatch) return true;

  const hexCompatMatch = /^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hexCompatMatch && !/^::ffff:/.test(lower)) return true;

  return false;
}

export function parseOptionalSourceUrl(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const text = stringValue(value, 'sourceUrl', 2_048).trim();

  if (!text) {
    return '';
  }

  let url: URL;

  try {
    url = new URL(text);
  } catch {
    fail('sourceUrl', 'expected a valid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    fail('sourceUrl', 'expected http or https URL');
  }

  if (url.username || url.password) {
    fail('sourceUrl', 'expected URL without credentials');
  }

  const hostname = url.hostname.toLowerCase();
  const ipv4Parts = hostname.split('.').map((part) => Number(part));
  const isIpv4 = ipv4Parts.length === 4 && ipv4Parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  const isPrivateIpv4 =
    isIpv4 &&
    (ipv4Parts[0] === 10 ||
      ipv4Parts[0] === 127 ||
      (ipv4Parts[0] === 169 && ipv4Parts[1] === 254) ||
      (ipv4Parts[0] === 172 && ipv4Parts[1] >= 16 && ipv4Parts[1] <= 31) ||
      (ipv4Parts[0] === 192 && ipv4Parts[1] === 168));
  const isLoopbackOrLocal =
    hostname === 'localhost' || hostname === '::1' || hostname === '[::1]' || hostname.endsWith('.localhost');

  if (isPrivateIpv4 || isLoopbackOrLocal || isPrivateOrReservedIpv6(hostname)) {
    fail('sourceUrl', 'expected a trusted public proxy URL');
  }

  return text.replace(/\/+$/, '');
}

export function parseRunDiagnosticsRequest(value: unknown): RunDiagnosticsRequest {
  if (!isRecord(value)) {
    fail('runDiagnosticsRequest', 'expected object');
  }

  return {
    settings: parseTutorSettings(value.settings, 'runDiagnosticsRequest.settings'),
    appVersion: stringValue(value.appVersion, 'runDiagnosticsRequest.appVersion', 80),
    ...(value.deepCheck === undefined ? {} : { deepCheck: booleanValue(value.deepCheck, 'runDiagnosticsRequest.deepCheck') })
  };
}

export function parseExtractStudyMetadataRequest(value: unknown): ExtractStudyMetadataRequest {
  if (!isRecord(value)) {
    fail('extractStudyMetadataRequest', 'expected object');
  }

  return {
    text: stringValue(value.text, 'extractStudyMetadataRequest.text', MAX_LONG_TEXT),
    settings: parseTutorSettings(value.settings, 'extractStudyMetadataRequest.settings')
  };
}

export function parseRunPromptEvalRequest(value: unknown): RunPromptEvalRequest {
  if (!isRecord(value)) {
    fail('runPromptEvalRequest', 'expected object');
  }

  const variants = arrayValue(value.variants, 'runPromptEvalRequest.variants', MAX_EVAL_VARIANTS, (item, itemPath) => {
    if (!isRecord(item)) {
      fail(itemPath, 'expected object');
    }

    return {
      id: nonEmptyString(item.id, `${itemPath}.id`, 128),
      providerId: stringValue(item.providerId, `${itemPath}.providerId`, 128),
      model: stringValue(item.model, `${itemPath}.model`, 256),
      promptTemplateId: enumValue(item.promptTemplateId, PROMPT_TEMPLATE_IDS, `${itemPath}.promptTemplateId`),
      ...(item.customPromptInstruction === undefined
        ? {}
        : { customPromptInstruction: stringValue(item.customPromptInstruction, `${itemPath}.customPromptInstruction`, 4_000) })
    };
  });

  if (variants.length === 0) {
    fail('runPromptEvalRequest.variants', 'expected at least one item');
  }

  return {
    ...(value.requestId === undefined
      ? {}
      : { requestId: nonEmptyString(value.requestId, 'runPromptEvalRequest.requestId', 128) }),
    inputText: stringValue(value.inputText, 'runPromptEvalRequest.inputText', MAX_LONG_TEXT),
    settings: parseTutorSettings(value.settings, 'runPromptEvalRequest.settings'),
    variants
  };
}

export function parseCancelRequest(value: unknown): CancelRequest {
  if (!isRecord(value)) {
    fail('cancelRequest', 'expected object');
  }

  return {
    requestId: nonEmptyString(value.requestId, 'cancelRequest.requestId', 128)
  };
}

export function parseEndQuestionSessionRequest(value: unknown): EndQuestionSessionRequest {
  if (!isRecord(value)) {
    fail('endQuestionSessionRequest', 'expected object');
  }

  return {
    sessionId: nonEmptyString(value.sessionId, 'endQuestionSessionRequest.sessionId', 128)
  };
}

function parseBaseRegionRequest(value: unknown, path: string): Pick<ExplainRequest, 'requestId' | 'region' | 'settings'> {
  if (!isRecord(value)) {
    fail(path, 'expected object');
  }

  return {
    requestId: nonEmptyString(value.requestId, `${path}.requestId`, 128),
    region: parseRegionBounds(value.region, `${path}.region`),
    settings: parseTutorSettings(value.settings, `${path}.settings`)
  };
}

export function parseExplainRequest(value: unknown): ExplainRequest {
  return parseBaseRegionRequest(value, 'explainRequest');
}

export function parseRecognizeRegionRequest(value: unknown): RecognizeRegionRequest {
  return parseBaseRegionRequest(value, 'recognizeRegionRequest');
}

export function parseExplainRecognizedTextRequest(value: unknown): ExplainRecognizedTextRequest {
  if (!isRecord(value)) {
    fail('explainRecognizedTextRequest', 'expected object');
  }

  return {
    requestId: nonEmptyString(value.requestId, 'explainRecognizedTextRequest.requestId', 128),
    recognizedText: stringValue(value.recognizedText, 'explainRecognizedTextRequest.recognizedText', MAX_LONG_TEXT),
    settings: parseTutorSettings(value.settings, 'explainRecognizedTextRequest.settings'),
    sourceMode: enumValue(value.sourceMode, INPUT_MODES, 'explainRecognizedTextRequest.sourceMode'),
    reason: enumValue(value.reason, OCR_PREVIEW_REASONS, 'explainRecognizedTextRequest.reason'),
    ...(value.fallbackReason === undefined
      ? {}
      : { fallbackReason: stringValue(value.fallbackReason, 'explainRecognizedTextRequest.fallbackReason', 4_000) })
  };
}

export function parseFollowUpRequest(value: unknown): FollowUpRequest {
  if (!isRecord(value)) {
    fail('followUpRequest', 'expected object');
  }

  return {
    requestId: nonEmptyString(value.requestId, 'followUpRequest.requestId', 128),
    sessionId: nonEmptyString(value.sessionId, 'followUpRequest.sessionId', 128),
    question: stringValue(value.question, 'followUpRequest.question', MAX_LONG_TEXT),
    settings: parseTutorSettings(value.settings, 'followUpRequest.settings')
  };
}

export function parseExportConversationRequest(value: unknown): ExportConversationRequest {
  if (!isRecord(value)) {
    fail('exportConversationRequest', 'expected object');
  }

  return {
    appVersion: stringValue(value.appVersion, 'exportConversationRequest.appVersion', 80),
    exportedAt: stringValue(value.exportedAt, 'exportConversationRequest.exportedAt', 80),
    model: stringValue(value.model, 'exportConversationRequest.model', 256),
    language: enumValue(value.language, TUTOR_LANGUAGES, 'exportConversationRequest.language'),
    inputMode: enumValue(value.inputMode, INPUT_MODES, 'exportConversationRequest.inputMode'),
    reasoningOnly: booleanValue(value.reasoningOnly, 'exportConversationRequest.reasoningOnly'),
    turns: arrayValue(value.turns, 'exportConversationRequest.turns', MAX_TURNS, parseQuestionSessionTurn)
  };
}

function parseQuestionSessionTurn(value: unknown, path: string): QuestionSessionTurn {
  if (!isRecord(value)) {
    fail(path, 'expected object');
  }

  return {
    role: enumValue(value.role, ['user', 'assistant'], `${path}.role`),
    content: stringValue(value.content, `${path}.content`, MAX_LONG_TEXT)
  };
}

function parseStudyMetadata(value: unknown, path: string): StudyMetadata {
  if (!isRecord(value)) {
    fail(path, 'expected object');
  }

  return {
    subject: enumValue(value.subject, STUDY_SUBJECTS, `${path}.subject`),
    topic: stringValue(value.topic, `${path}.topic`, 80),
    questionType: stringValue(value.questionType, `${path}.questionType`, 80),
    difficulty: enumValue(value.difficulty, STUDY_DIFFICULTIES, `${path}.difficulty`),
    keyPoints: arrayValue(value.keyPoints, `${path}.keyPoints`, 20, (item, itemPath) =>
      stringValue(item, itemPath, 80)
    ),
    mistakeTraps: arrayValue(value.mistakeTraps, `${path}.mistakeTraps`, 20, (item, itemPath) =>
      stringValue(item, itemPath, 80)
    ),
    tags: arrayValue(value.tags, `${path}.tags`, 20, (item, itemPath) => stringValue(item, itemPath, 40)),
    summary: stringValue(value.summary, `${path}.summary`, 500),
    extractedAt: stringValue(value.extractedAt, `${path}.extractedAt`, 80)
  };
}

function parseStudyLibraryExportItem(value: unknown, path: string): StudyLibraryExportItem {
  if (!isRecord(value)) {
    fail(path, 'expected object');
  }

  return {
    id: nonEmptyString(value.id, `${path}.id`, 128),
    title: stringValue(value.title, `${path}.title`, 500),
    createdAt: stringValue(value.createdAt, `${path}.createdAt`, 80),
    updatedAt: stringValue(value.updatedAt, `${path}.updatedAt`, 80),
    lastReviewedAt: stringValue(value.lastReviewedAt, `${path}.lastReviewedAt`, 80),
    nextReviewAt: stringValue(value.nextReviewAt, `${path}.nextReviewAt`, 80),
    appVersion: stringValue(value.appVersion, `${path}.appVersion`, 80),
    model: stringValue(value.model, `${path}.model`, 256),
    providerId: stringValue(value.providerId, `${path}.providerId`, 128),
    inputMode: enumValue(value.inputMode, INPUT_MODES, `${path}.inputMode`),
    language: enumValue(value.language, TUTOR_LANGUAGES, `${path}.language`),
    subject: enumValue(value.subject, STUDY_SUBJECTS, `${path}.subject`),
    tags: arrayValue(value.tags, `${path}.tags`, 100, (item, itemPath) => stringValue(item, itemPath, 80)),
    favorite: booleanValue(value.favorite, `${path}.favorite`),
    status: enumValue(value.status, STUDY_STATUSES, `${path}.status`),
    reviewCount: nonNegativeInteger(value.reviewCount, `${path}.reviewCount`),
    correctCount: nonNegativeInteger(value.correctCount, `${path}.correctCount`),
    wrongCount: nonNegativeInteger(value.wrongCount, `${path}.wrongCount`),
    difficulty: enumValue(value.difficulty, STUDY_DIFFICULTIES, `${path}.difficulty`),
    mistakeReason: stringValue(value.mistakeReason, `${path}.mistakeReason`, 500),
    ...(value.metadata === undefined ? {} : { metadata: parseStudyMetadata(value.metadata, `${path}.metadata`) }),
    turns: arrayValue(value.turns, `${path}.turns`, MAX_TURNS, parseQuestionSessionTurn)
  };
}

export function parseExportStudyLibraryRequest(value: unknown): ExportStudyLibraryRequest {
  if (!isRecord(value)) {
    fail('exportStudyLibraryRequest', 'expected object');
  }

  return {
    appVersion: stringValue(value.appVersion, 'exportStudyLibraryRequest.appVersion', 80),
    exportedAt: stringValue(value.exportedAt, 'exportStudyLibraryRequest.exportedAt', 80),
    format: enumValue(value.format, STUDY_EXPORT_FORMATS, 'exportStudyLibraryRequest.format'),
    items: arrayValue(value.items, 'exportStudyLibraryRequest.items', MAX_EXPORT_ITEMS, parseStudyLibraryExportItem)
  };
}
