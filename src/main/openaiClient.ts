import type {
  ApiConnectionMode,
  ApiMode,
  ApiProviderOption,
  ApiProviderType,
  ApiRuntimeDefaults,
  ModelListResult,
  ModelOption,
  ReasoningEffortSetting,
  StudyMetadata,
  TutorSettings
} from '../shared/types';
import { isAnthropicAdaptiveEffortModel, normalizeReasoningEffort } from '../shared/reasoning';
import {
  endpointForProvider,
  extractApiErrorMessage,
  modelsEndpointCandidatesForBaseUrl
} from '../shared/apiProtocol.mjs';
import { isOperationCanceled, throwIfAborted } from './cancel';
import {
  buildFollowUpQuestionPrompt,
  buildStudyMetadataInstructions,
  buildStudyMetadataPrompt,
  buildTutorInstructions,
  buildTutorTextPrompt,
  buildTutorUserPrompt
} from './prompts';
import { getApiProviderById, getApiProviderSummaries, parseApiMode, parseApiProviderType } from './apiProviders';
import {
  isRecord,
  metadataFromAnswer,
  buildLimitedFollowUpHistoryPrompt
} from './apiShared';
import type { FollowUpContext } from './apiShared';

export type { FollowUpContext } from './apiShared';

export interface ModelAnswer {
  text: string;
  responseId?: string;
  usedPreviousResponse?: boolean;
  usedLocalHistory?: boolean;
}

type AnswerDeltaHandler = (text: string) => void;

interface ApiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  apiMode: ApiMode;
  apiProviderType: ApiProviderType;
  reasoningEffort: ReasoningEffortSetting;
  providerId?: string;
  providerName?: string;
}

interface ApiConnectionConfig {
  apiKey: string;
  baseUrl: string;
  apiMode?: ApiMode;
  apiProviderType: ApiProviderType;
  providerId?: string;
  providerName?: string;
}

const LOCAL_ENV_HINT = '用户配置目录的 .env.local';

class ThirdPartyApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ThirdPartyApiError';
  }
}

interface StreamParsers {
  extractAnswer: (data: unknown) => ModelAnswer;
  extractDelta: (data: unknown) => string;
}

function requireThirdPartyBaseUrl(baseUrl: string): void {
  let url: URL;

  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('第三方 API Base URL 格式不正确，请填写类似 https://api.example.com/v1 的地址。');
  }

  if (url.hostname === 'api.openai.com' || url.hostname.endsWith('.openai.com')) {
    console.warn('[api] Base URL points at an openai.com host; continuing because it may be a user-managed compatible endpoint.');
  }
}

function parseApiConnectionMode(value: string | undefined): ApiConnectionMode {
  return value === 'proxy' ? 'proxy' : 'direct';
}

export function resolveApiConfig(settings: TutorSettings): ApiConfig {
  const connection = resolveApiConnectionConfig(settings);
  const model = settings.model.trim();
  const apiMode = settings.apiMode === 'env' ? connection.apiMode ?? parseApiMode(process.env.AI_API_MODE) : settings.apiMode;

  if (!model) {
    throw new Error('请在设置中选择或填写第三方模型名。');
  }

  const reasoningEffort = normalizeReasoningEffort(settings.reasoningEffort, connection.apiProviderType, model);

  return {
    ...connection,
    model,
    apiMode,
    reasoningEffort
  };
}

function resolveApiConnectionConfig(settings: TutorSettings): ApiConnectionConfig {
  if (settings.providerId.trim()) {
    const provider = getApiProviderById(settings.providerId);

    if (!provider) {
      throw new Error(`没有找到当前选择的 API 服务商：${settings.providerId}。请在设置中切换到可用 API。`);
    }

    requireThirdPartyBaseUrl(provider.baseUrl);

    if (!provider.apiKey) {
      throw new Error(`API 服务商「${provider.name}」没有配置 API Key。请检查${LOCAL_ENV_HINT}中该服务商的 API Key。`);
    }

    return {
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      apiMode: provider.apiMode,
      apiProviderType: provider.apiProviderType,
      providerId: provider.id,
      providerName: provider.name
    };
  }

  const apiKey = settings.apiKey.trim() || process.env.AI_API_KEY || '';
  const baseUrl = settings.apiBaseUrl.trim() || process.env.AI_BASE_URL || '';

  if (!baseUrl) {
    throw new Error(`请在${LOCAL_ENV_HINT}中设置 AI_BASE_URL，或设置环境变量 AI_BASE_URL。`);
  }

  requireThirdPartyBaseUrl(baseUrl);

  if (!apiKey) {
    throw new Error(`请在${LOCAL_ENV_HINT}中设置 AI_API_KEY，或设置环境变量 AI_API_KEY。`);
  }

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiProviderType: parseApiProviderType(process.env.AI_API_TYPE)
  };
}

export function getRuntimeApiDefaults(): ApiRuntimeDefaults {
  const providers = getApiProviderSummaries();
  const defaultProvider = providers.find((provider) => provider.isDefault) || providers[0];
  const apiBaseUrl = defaultProvider?.baseUrl || process.env.AI_BASE_URL?.trim() || '';
  const apiMode = defaultProvider?.apiMode || (process.env.AI_API_MODE ? parseApiMode(process.env.AI_API_MODE) : undefined);

  return {
    apiConnectionMode: parseApiConnectionMode(process.env.TUTOR_API_CONNECTION_MODE),
    apiBaseUrl,
    ...(apiMode ? { apiMode } : {}),
    hasApiKey: defaultProvider?.hasApiKey || Boolean(process.env.AI_API_KEY?.trim()),
    providerId: defaultProvider?.id || '',
    providers,
    proxyUrl: process.env.TUTOR_PROXY_URL?.trim() || '',
    hasProxyToken: Boolean(process.env.TUTOR_PROXY_TOKEN?.trim())
  };
}

export function listApiProviders(): ApiProviderOption[] {
  return getApiProviderSummaries();
}

type OpenAiReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
type GeminiThinkingConfig = { thinkingLevel: 'minimal' | 'low' | 'medium' | 'high' } | { thinkingBudget: number };

function openAiReasoningEffort(config: ApiConfig): OpenAiReasoningEffort | undefined {
  if (config.apiProviderType !== 'openai-compatible' || config.reasoningEffort === 'off' || config.reasoningEffort === 'max') {
    return undefined;
  }

  return config.reasoningEffort;
}

function hasOpenAiReasoning(config: ApiConfig): boolean {
  return Boolean(openAiReasoningEffort(config));
}

function withReasoning<T extends Record<string, unknown>>(body: T, config: ApiConfig): T & { reasoning?: { effort: OpenAiReasoningEffort } } {
  const effort = openAiReasoningEffort(config);

  if (!effort) {
    return body;
  }

  return {
    ...body,
    reasoning: {
      effort
    }
  };
}

function withChatReasoning<T extends Record<string, unknown>>(body: T, config: ApiConfig): T & { reasoning_effort?: OpenAiReasoningEffort } {
  const effort = openAiReasoningEffort(config);

  return effort ? { ...body, reasoning_effort: effort } : body;
}

function geminiThinkingConfig(config: ApiConfig): GeminiThinkingConfig | undefined {
  const effort = config.reasoningEffort;
  const model = config.model.toLowerCase();

  if (effort === 'off') {
    return undefined;
  }

  if (model.includes('gemini-3')) {
    const level = effort === 'minimal' || effort === 'low' || effort === 'medium' || effort === 'high' ? effort : 'high';

    return { thinkingLevel: level };
  }

  if (model.includes('gemini-2.5') || model.includes('gemini-2-5')) {
    const budgetByEffort: Record<Exclude<ReasoningEffortSetting, 'off'>, number> = {
      minimal: 512,
      low: 1024,
      medium: 4096,
      high: 8192,
      xhigh: 16384,
      max: 24576
    };

    return { thinkingBudget: budgetByEffort[effort] };
  }

  return undefined;
}

function withGeminiThinking<T extends Record<string, unknown>>(
  body: T,
  config: ApiConfig
): T & { generationConfig?: { thinkingConfig: GeminiThinkingConfig } } {
  const thinkingConfig = geminiThinkingConfig(config);

  return thinkingConfig
    ? {
        ...body,
        generationConfig: {
          thinkingConfig
        }
      }
    : body;
}

function anthropicEffort(config: ApiConfig): AnthropicEffort | undefined {
  const effort = config.reasoningEffort;

  if (config.apiProviderType !== 'anthropic' || effort === 'off' || effort === 'minimal') {
    return undefined;
  }

  return effort;
}

function anthropicMaxTokens(effort: AnthropicEffort | undefined): number {
  switch (effort) {
    case 'max':
      return 20000;
    case 'xhigh':
      return 16000;
    case 'high':
      return 12000;
    case 'medium':
      return 8192;
    case 'low':
    default:
      return 4096;
  }
}

function anthropicBudgetTokens(effort: AnthropicEffort): number {
  switch (effort) {
    case 'max':
      return 16000;
    case 'xhigh':
      return 12000;
    case 'high':
      return 8000;
    case 'medium':
      return 4096;
    case 'low':
    default:
      return 1024;
  }
}

function withAnthropicThinking<T extends Record<string, unknown>>(
  body: T,
  config: ApiConfig
): T & {
  max_tokens: number;
  thinking?: { type: 'adaptive'; display: 'omitted' } | { type: 'enabled'; budget_tokens: number };
  output_config?: { effort: AnthropicEffort };
} {
  const effort = anthropicEffort(config);
  const base = {
    ...body,
    max_tokens: anthropicMaxTokens(effort)
  };

  if (!effort) {
    return base;
  }

  if (isAnthropicAdaptiveEffortModel(config.model)) {
    return {
      ...base,
      thinking: {
        type: 'adaptive',
        display: 'omitted'
      },
      output_config: {
        effort
      }
    };
  }

  return {
    ...base,
    thinking: {
      type: 'enabled',
      budget_tokens: anthropicBudgetTokens(effort)
    }
  };
}

function endpointFor(config: ApiConfig, stream = false): string {
  return endpointForProvider(config, config.model, stream);
}

function modelsEndpointCandidates(baseUrl: string, apiProviderType: ApiProviderType): string[] {
  return modelsEndpointCandidatesForBaseUrl(baseUrl, apiProviderType);
}

function modelOptionFromRecord(record: Record<string, unknown>): ModelOption | undefined {
  const id = typeof record.id === 'string' ? record.id : typeof record.name === 'string' ? record.name : undefined;

  if (!id) {
    return undefined;
  }

  return {
    id,
    ownedBy: typeof record.owned_by === 'string' ? record.owned_by : undefined
  };
}

export function extractModelOptions(data: unknown): ModelOption[] {
  const rawModels =
    Array.isArray(data)
      ? data
      : isRecord(data) && Array.isArray(data.data)
        ? data.data
        : isRecord(data) && Array.isArray(data.models)
          ? data.models
          : [];
  const seen = new Set<string>();
  const models: ModelOption[] = [];

  for (const rawModel of rawModels) {
    const option =
      typeof rawModel === 'string' ? { id: rawModel } : isRecord(rawModel) ? modelOptionFromRecord(rawModel) : undefined;

    if (!option || seen.has(option.id)) {
      continue;
    }

    seen.add(option.id);
    models.push(option);
  }

  return models;
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}


function apiDisplayName(config: { providerName?: string }): string {
  return config.providerName ? `第三方 API「${config.providerName}」` : '第三方 API';
}

function requestHeadersFor(
  config: Pick<ApiConnectionConfig, 'apiKey' | 'apiProviderType'>,
  accept = 'application/json',
  includeContentType = true
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept
  };

  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  if (config.apiProviderType === 'gemini') {
    headers['x-goog-api-key'] = config.apiKey;
    return headers;
  }

  if (config.apiProviderType === 'anthropic') {
    headers['x-api-key'] = config.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    return headers;
  }

  headers.Authorization = `Bearer ${config.apiKey}`;
  return headers;
}

async function fetchModelOptionsFromEndpoint(config: ApiConnectionConfig, endpoint: string): Promise<ModelOption[]> {
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: requestHeadersFor(config, 'application/json', false)
  });
  const text = await response.text();
  let data: unknown;

  try {
    data = text ? (JSON.parse(text) as unknown) : undefined;
  } catch {
    const preview = text.replace(/\s+/g, ' ').slice(0, 160);
    throw new Error(
      [
        `${apiDisplayName(config)} 模型列表返回了非 JSON 响应，请确认 API Base URL 是否支持 /models。`,
        `当前请求地址：${endpoint}`,
        `响应开头：${preview}`
      ].join('\n')
    );
  }

  if (!response.ok) {
    const errorMessage =
      isRecord(data) && isRecord(data.error) && typeof data.error.message === 'string'
        ? data.error.message
        : text.slice(0, 600);

    throw new ThirdPartyApiError(response.status, `${apiDisplayName(config)} 模型列表请求失败 (${response.status})：${errorMessage}`);
  }

  return extractModelOptions(data);
}

export async function listAvailableModels(settings: TutorSettings): Promise<ModelListResult> {
  const config = resolveApiConnectionConfig(settings);
  const candidates = modelsEndpointCandidates(config.baseUrl, config.apiProviderType);
  let lastError: unknown;

  for (const endpoint of candidates) {
    try {
      return {
        models: await fetchModelOptionsFromEndpoint(config, endpoint)
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    [
      `${apiDisplayName(config)} 模型列表获取失败。`,
      `已尝试地址：${candidates.join(', ')}`,
      `最后错误：${messageFromError(lastError)}`
    ].join('\n')
  );
}

async function postJson(config: ApiConfig, body: unknown, signal?: AbortSignal): Promise<unknown> {
  throwIfAborted(signal);

  const response = await fetch(endpointFor(config), {
    method: 'POST',
    headers: requestHeadersFor(config),
    body: JSON.stringify(body),
    signal
  });

  const text = await response.text();
  let data: unknown;

  try {
    data = text ? (JSON.parse(text) as unknown) : undefined;
  } catch {
    const preview = text.replace(/\s+/g, ' ').slice(0, 160);
    throw new Error(
      [
        `${apiDisplayName(config)} 返回了非 JSON 响应，通常是 API Base URL 或接口模式配置不正确。`,
        `当前请求地址：${endpointFor(config)}`,
        `响应开头：${preview}`
      ].join('\n')
    );
  }

  if (!response.ok) {
    const errorMessage =
      isRecord(data) && isRecord(data.error) && typeof data.error.message === 'string'
        ? data.error.message
        : text.slice(0, 600);

    throw new ThirdPartyApiError(response.status, `${apiDisplayName(config)} 请求失败 (${response.status})：${errorMessage}`);
  }

  return data;
}

function extractStreamResponseId(data: unknown): string | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  if (typeof data.id === 'string') {
    return data.id;
  }

  if (isRecord(data.response) && typeof data.response.id === 'string') {
    return data.response.id;
  }

  return undefined;
}

function extractStreamFinalAnswer(data: unknown, extractAnswer: (payload: unknown) => ModelAnswer): ModelAnswer {
  if (isRecord(data) && isRecord(data.response)) {
    return extractAnswer(data.response);
  }

  return extractAnswer(data);
}

function emitAnswerDelta(onDelta: AnswerDeltaHandler, text: string): void {
  if (text) {
    onDelta(text);
  }
}

function streamRequestBodyFor(config: ApiConfig, body: Record<string, unknown>): Record<string, unknown> {
  if (config.apiProviderType === 'gemini') {
    return body;
  }

  return {
    ...body,
    stream: true
  };
}

async function postJsonStream(
  config: ApiConfig,
  body: Record<string, unknown>,
  parsers: StreamParsers,
  signal: AbortSignal | undefined,
  onDelta: AnswerDeltaHandler
): Promise<ModelAnswer> {
  throwIfAborted(signal);

  const response = await fetch(endpointFor(config, true), {
    method: 'POST',
    headers: requestHeadersFor(config, 'text/event-stream'),
    body: JSON.stringify(streamRequestBodyFor(config, body)),
    signal
  });

  if (!response.ok) {
    const text = await response.text();
    let data: unknown;

    try {
      data = text ? (JSON.parse(text) as unknown) : undefined;
    } catch {
      data = undefined;
    }

    const errorMessage = extractApiErrorMessage(data) || text.slice(0, 600);
    throw new ThirdPartyApiError(response.status, `${apiDisplayName(config)} 请求失败 (${response.status})：${errorMessage}`);
  }

  const reader = response.body?.getReader();

  if (!reader) {
    const text = await response.text();
    const data = text ? (JSON.parse(text) as unknown) : undefined;
    const answer = parsers.extractAnswer(data);
    emitAnswerDelta(onDelta, answer.text);
    return answer;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let rawText = '';
  let streamedText = '';
  let responseId: string | undefined;
  let finalAnswer: ModelAnswer | undefined;
  let sawSseData = false;
  const appendRawText = (text: string): void => {
    if (sawSseData || !text) {
      return;
    }

    rawText = (rawText + text).slice(0, 16_384);
  };

  const handlePayload = (payload: string): void => {
    const trimmed = payload.trim();

    if (!trimmed || trimmed === '[DONE]') {
      return;
    }

    sawSseData = true;

    let data: unknown;

    try {
      data = JSON.parse(trimmed) as unknown;
    } catch {
      streamedText += payload;
      emitAnswerDelta(onDelta, payload);
      return;
    }

    const streamError = extractApiErrorMessage(data);

    if (streamError) {
      throw new ThirdPartyApiError(500, `${apiDisplayName(config)} 流式请求失败：${streamError}`);
    }

    responseId = extractStreamResponseId(data) || responseId;

    const eventAnswer = extractStreamFinalAnswer(data, parsers.extractAnswer);

    if (eventAnswer.text) {
      finalAnswer = eventAnswer;
      responseId = eventAnswer.responseId || responseId;
    }

    const delta = parsers.extractDelta(data);

    if (delta) {
      streamedText += delta;
      emitAnswerDelta(onDelta, delta);
    }
  };

  const processBlock = (block: string): void => {
    const dataLines: string[] = [];

    for (const line of block.split('\n')) {
      if (line.startsWith('data:')) {
        const dataLine = line.slice('data:'.length).trimStart();

        if (dataLine.trim() !== '[DONE]') {
          dataLines.push(dataLine);
        }
      }
    }

    if (dataLines.length === 0) {
      return;
    }

    handlePayload(dataLines.join('\n'));
  };

  try {
    for (;;) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      appendRawText(chunk);
      buffer += chunk;

      let boundary = buffer.indexOf('\n\n');

      while (boundary !== -1) {
        processBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }

    const tail = decoder.decode().replace(/\r\n/g, '\n');

    if (tail) {
      appendRawText(tail);
      buffer += tail;
    }

    if (buffer.trim()) {
      processBlock(buffer);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  if (streamedText) {
    return {
      text: streamedText,
      responseId: responseId || finalAnswer?.responseId
    };
  }

  if (finalAnswer?.text) {
    emitAnswerDelta(onDelta, finalAnswer.text);
    return {
      ...finalAnswer,
      responseId: finalAnswer.responseId || responseId
    };
  }

  if (!sawSseData && rawText.trim()) {
    let data: unknown;

    try {
      data = JSON.parse(rawText) as unknown;
    } catch {
      const preview = rawText.replace(/\s+/g, ' ').slice(0, 160);
      throw new Error(
        [
          `${apiDisplayName(config)} 流式接口返回了无法解析的内容，请确认该接口支持 stream: true。`,
          `当前请求地址：${endpointFor(config)}`,
          `响应开头：${preview}`
        ].join('\n')
      );
    }

    const answer = parsers.extractAnswer(data);
    emitAnswerDelta(onDelta, answer.text);
    return answer;
  }

  return {
    text: '',
    responseId
  };
}

export function isRetryableApiError(error: unknown): boolean {
  if (error instanceof ThirdPartyApiError) {
    return [502, 503, 504].includes(error.status);
  }

  if (error instanceof Error) {
    return /\b(502|503|504)\b/.test(error.message) || /upstream/i.test(error.message);
  }

  return false;
}

function withoutReasoning(config: ApiConfig): ApiConfig {
  return {
    ...config,
    reasoningEffort: 'off'
  };
}

function normalizeRecognizedText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => line || lines[index - 1])
    .join('\n')
    .trim();
}

function extractResponsesText(data: unknown): string {
  if (isRecord(data) && typeof data.output_text === 'string') {
    return data.output_text;
  }

  if (!isRecord(data) || !Array.isArray(data.output)) {
    return '';
  }

  const parts: string[] = [];

  for (const item of data.output.slice(0, 200)) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content.slice(0, 200)) {
      if (isRecord(content) && typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }

  return parts.join('\n').trim();
}

function extractResponsesAnswer(data: unknown): ModelAnswer {
  return {
    text: extractResponsesText(data),
    responseId: isRecord(data) && typeof data.id === 'string' ? data.id : undefined
  };
}

function extractChatText(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.choices)) {
    return '';
  }

  const firstChoice = data.choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return '';
  }

  const { content } = firstChoice.message;

  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractChatAnswer(data: unknown): ModelAnswer {
  return {
    text: extractChatText(data)
  };
}

function textFromContentParts(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

function extractResponsesStreamDelta(data: unknown): string {
  if (!isRecord(data)) {
    return '';
  }

  if (typeof data.delta === 'string') {
    const type = typeof data.type === 'string' ? data.type : '';

    if (!type || type.includes('output_text')) {
      return data.delta;
    }
  }

  return extractChatStreamDelta(data);
}

function extractChatStreamDelta(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.choices)) {
    return '';
  }

  const firstChoice = data.choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.delta)) {
    return '';
  }

  return textFromContentParts(firstChoice.delta.content);
}

function extractGeminiText(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.candidates)) {
    return '';
  }

  const parts: string[] = [];

  for (const candidate of data.candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
      continue;
    }

    for (const part of candidate.content.parts) {
      if (isRecord(part) && typeof part.text === 'string') {
        parts.push(part.text);
      }
    }
  }

  return parts.join('').trim();
}

function extractGeminiAnswer(data: unknown): ModelAnswer {
  return {
    text: extractGeminiText(data)
  };
}

function extractGeminiStreamDelta(data: unknown): string {
  return extractGeminiText(data);
}

function extractAnthropicText(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.content)) {
    return '';
  }

  return data.content
    .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractAnthropicAnswer(data: unknown): ModelAnswer {
  return {
    text: extractAnthropicText(data)
  };
}

function extractAnthropicStreamDelta(data: unknown): string {
  if (!isRecord(data)) {
    return '';
  }

  if (isRecord(data.delta) && typeof data.delta.text === 'string') {
    return data.delta.text;
  }

  return '';
}

function imageDataFromDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:([^;,]+)(?:;[^,]*)*;base64,(.*)$/s.exec(dataUrl);

  if (!match) {
    throw new Error('截图数据格式不正确，无法发送给当前 API 服务商。');
  }

  return {
    mimeType: match[1],
    data: match[2]
  };
}

async function explainWithResponses(
  dataUrl: string,
  settings: TutorSettings,
  config: ApiConfig,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  // Some third-party providers implement OpenAI-compatible Responses API.
  const body = withReasoning(
    {
      model: config.model,
      instructions: buildTutorInstructions(settings),
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: buildTutorUserPrompt(settings)
            },
            {
              type: 'input_image',
              image_url: dataUrl,
              detail: 'auto'
            }
          ]
        }
      ]
    },
    config
  );

  if (onDelta) {
    return postJsonStream(config, body, {
      extractAnswer: extractResponsesAnswer,
      extractDelta: extractResponsesStreamDelta
    }, signal, onDelta);
  }

  const response = await postJson(config, body, signal);

  return extractResponsesAnswer(response);
}

async function explainWithChatCompletions(
  dataUrl: string,
  settings: TutorSettings,
  config: ApiConfig,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  // Most third-party “OpenAI-compatible” providers support this vision message shape.
  const body = withChatReasoning(
    {
      model: config.model,
      messages: [
      {
        role: 'system',
        content: buildTutorInstructions(settings)
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildTutorUserPrompt(settings)
          },
          {
            type: 'image_url',
            image_url: {
              url: dataUrl
            }
          }
        ]
      }
      ]
    },
    config
  );

  if (onDelta) {
    return postJsonStream(config, body, {
      extractAnswer: extractChatAnswer,
      extractDelta: extractChatStreamDelta
    }, signal, onDelta);
  }

  const response = await postJson(config, body, signal);

  return extractChatAnswer(response);
}

async function explainWithGemini(
  dataUrl: string,
  settings: TutorSettings,
  config: ApiConfig,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  const image = imageDataFromDataUrl(dataUrl);
  const body = withGeminiThinking(
    {
      system_instruction: {
        parts: [{ text: buildTutorInstructions(settings) }]
      },
      contents: [
        {
          role: 'user',
          parts: [
            { text: buildTutorUserPrompt(settings) },
            {
              inline_data: {
                mime_type: image.mimeType,
                data: image.data
              }
            }
          ]
        }
      ]
    },
    config
  );

  if (onDelta) {
    return postJsonStream(config, body, {
      extractAnswer: extractGeminiAnswer,
      extractDelta: extractGeminiStreamDelta
    }, signal, onDelta);
  }

  return extractGeminiAnswer(await postJson(config, body, signal));
}

async function explainWithAnthropic(
  dataUrl: string,
  settings: TutorSettings,
  config: ApiConfig,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  const image = imageDataFromDataUrl(dataUrl);
  const body = withAnthropicThinking({
    model: config.model,
    system: buildTutorInstructions(settings),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildTutorUserPrompt(settings) },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: image.mimeType,
              data: image.data
            }
          }
        ]
      }
    ]
  }, config);

  if (onDelta) {
    return postJsonStream(config, body, {
      extractAnswer: extractAnthropicAnswer,
      extractDelta: extractAnthropicStreamDelta
    }, signal, onDelta);
  }

  return extractAnthropicAnswer(await postJson(config, body, signal));
}

async function explainTextWithResponses(
  recognizedText: string,
  settings: TutorSettings,
  config: ApiConfig,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  const body = withReasoning(
    {
      model: config.model,
      instructions: buildTutorInstructions(settings),
      input: buildTutorTextPrompt(recognizedText, settings)
    },
    config
  );

  if (onDelta) {
    return postJsonStream(config, body, {
      extractAnswer: extractResponsesAnswer,
      extractDelta: extractResponsesStreamDelta
    }, signal, onDelta);
  }

  const response = await postJson(config, body, signal);

  return extractResponsesAnswer(response);
}

async function explainTextWithChatCompletions(
  recognizedText: string,
  settings: TutorSettings,
  config: ApiConfig,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  const body = withChatReasoning(
    {
      model: config.model,
      messages: [
      {
        role: 'system',
        content: buildTutorInstructions(settings)
      },
      {
        role: 'user',
        content: buildTutorTextPrompt(recognizedText, settings)
      }
      ]
    },
    config
  );

  if (onDelta) {
    return postJsonStream(config, body, {
      extractAnswer: extractChatAnswer,
      extractDelta: extractChatStreamDelta
    }, signal, onDelta);
  }

  const response = await postJson(config, body, signal);

  return extractChatAnswer(response);
}

async function explainTextWithGemini(
  recognizedText: string,
  settings: TutorSettings,
  config: ApiConfig,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  const body = withGeminiThinking(
    {
      system_instruction: {
        parts: [{ text: buildTutorInstructions(settings) }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: buildTutorTextPrompt(recognizedText, settings) }]
        }
      ]
    },
    config
  );

  if (onDelta) {
    return postJsonStream(config, body, {
      extractAnswer: extractGeminiAnswer,
      extractDelta: extractGeminiStreamDelta
    }, signal, onDelta);
  }

  return extractGeminiAnswer(await postJson(config, body, signal));
}

async function explainTextWithAnthropic(
  recognizedText: string,
  settings: TutorSettings,
  config: ApiConfig,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  const body = withAnthropicThinking({
    model: config.model,
    system: buildTutorInstructions(settings),
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: buildTutorTextPrompt(recognizedText, settings) }]
      }
    ]
  }, config);

  if (onDelta) {
    return postJsonStream(config, body, {
      extractAnswer: extractAnthropicAnswer,
      extractDelta: extractAnthropicStreamDelta
    }, signal, onDelta);
  }

  return extractAnthropicAnswer(await postJson(config, body, signal));
}

export async function generateTextCompletion(
  instructions: string,
  prompt: string,
  settings: TutorSettings,
  signal?: AbortSignal
): Promise<ModelAnswer> {
  throwIfAborted(signal);
  const config = resolveApiConfig(settings);

  if (config.apiProviderType === 'gemini') {
    const body = withGeminiThinking(
      {
        system_instruction: {
          parts: [{ text: instructions }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ]
      },
      config
    );

    return extractGeminiAnswer(await postJson(config, body, signal));
  }

  if (config.apiProviderType === 'anthropic') {
    const body = withAnthropicThinking({
      model: config.model,
      system: instructions,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }]
        }
      ]
    }, config);

    return extractAnthropicAnswer(await postJson(config, body, signal));
  }

  if (config.apiMode === 'responses') {
    const body = withReasoning(
      {
        model: config.model,
        instructions,
        input: prompt
      },
      config
    );

    return extractResponsesAnswer(await postJson(config, body, signal));
  }

  const body = withChatReasoning(
    {
      model: config.model,
      messages: [
        {
          role: 'system',
          content: instructions
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    },
    config
  );

  return extractChatAnswer(await postJson(config, body, signal));
}

export async function extractStudyMetadataFromText(
  text: string,
  settings: TutorSettings,
  signal?: AbortSignal
): Promise<StudyMetadata> {
  const answer = await generateTextCompletion(
    buildStudyMetadataInstructions(settings),
    buildStudyMetadataPrompt(text),
    settings,
    signal
  );

  if (!answer.text) {
    throw new Error('结构化信息提取没有返回内容。');
  }

  return metadataFromAnswer(answer.text);
}

async function askFollowUpWithPreviousResponse(
  question: string,
  settings: TutorSettings,
  config: ApiConfig,
  previousResponseId: string,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  const body = withReasoning(
    {
      model: config.model,
      previous_response_id: previousResponseId,
      instructions: buildTutorInstructions(settings),
      input: buildFollowUpQuestionPrompt(question, settings)
    },
    config
  );
  const answer = onDelta
    ? await postJsonStream(config, body, {
        extractAnswer: extractResponsesAnswer,
        extractDelta: extractResponsesStreamDelta
      }, signal, onDelta)
    : extractResponsesAnswer(await postJson(config, body, signal));

  return {
    ...answer,
    usedPreviousResponse: true,
    usedLocalHistory: false
  };
}

async function askFollowUpWithResponsesHistory(
  question: string,
  context: FollowUpContext,
  settings: TutorSettings,
  config: ApiConfig,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  const body = withReasoning(
    {
      model: config.model,
      instructions: buildTutorInstructions(settings),
      input: buildLimitedFollowUpHistoryPrompt(context, question, settings)
    },
    config
  );
  const answer = onDelta
    ? await postJsonStream(config, body, {
        extractAnswer: extractResponsesAnswer,
        extractDelta: extractResponsesStreamDelta
      }, signal, onDelta)
    : extractResponsesAnswer(await postJson(config, body, signal));

  return {
    ...answer,
    usedPreviousResponse: false,
    usedLocalHistory: true
  };
}

async function askFollowUpWithChatHistory(
  question: string,
  context: FollowUpContext,
  settings: TutorSettings,
  config: ApiConfig,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  const body = withChatReasoning(
    {
      model: config.model,
      messages: [
      {
        role: 'system',
        content: buildTutorInstructions(settings)
      },
      {
        role: 'user',
        content: buildLimitedFollowUpHistoryPrompt(context, question, settings)
      }
      ]
    },
    config
  );
  const answer = onDelta
    ? await postJsonStream(config, body, {
        extractAnswer: extractChatAnswer,
        extractDelta: extractChatStreamDelta
      }, signal, onDelta)
    : extractChatAnswer(await postJson(config, body, signal));

  return {
    ...answer,
    usedPreviousResponse: false,
    usedLocalHistory: true
  };
}

async function askFollowUpWithGeminiHistory(
  question: string,
  context: FollowUpContext,
  settings: TutorSettings,
  config: ApiConfig,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  const body = withGeminiThinking(
    {
      system_instruction: {
        parts: [{ text: buildTutorInstructions(settings) }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: buildLimitedFollowUpHistoryPrompt(context, question, settings) }]
        }
      ]
    },
    config
  );
  const answer = onDelta
    ? await postJsonStream(config, body, {
        extractAnswer: extractGeminiAnswer,
        extractDelta: extractGeminiStreamDelta
      }, signal, onDelta)
    : extractGeminiAnswer(await postJson(config, body, signal));

  return {
    ...answer,
    usedPreviousResponse: false,
    usedLocalHistory: true
  };
}

async function askFollowUpWithAnthropicHistory(
  question: string,
  context: FollowUpContext,
  settings: TutorSettings,
  config: ApiConfig,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  const body = withAnthropicThinking({
    model: config.model,
    system: buildTutorInstructions(settings),
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: buildLimitedFollowUpHistoryPrompt(context, question, settings) }]
      }
    ]
  }, config);
  const answer = onDelta
    ? await postJsonStream(config, body, {
        extractAnswer: extractAnthropicAnswer,
        extractDelta: extractAnthropicStreamDelta
      }, signal, onDelta)
    : extractAnthropicAnswer(await postJson(config, body, signal));

  return {
    ...answer,
    usedPreviousResponse: false,
    usedLocalHistory: true
  };
}

async function askFollowUpWithLocalHistory(
  question: string,
  context: FollowUpContext,
  settings: TutorSettings,
  config: ApiConfig,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  if (config.apiProviderType === 'gemini') {
    return askFollowUpWithGeminiHistory(question, context, settings, config, signal, onDelta);
  }

  if (config.apiProviderType === 'anthropic') {
    return askFollowUpWithAnthropicHistory(question, context, settings, config, signal, onDelta);
  }

  return config.apiMode === 'responses'
    ? askFollowUpWithResponsesHistory(question, context, settings, config, signal, onDelta)
    : askFollowUpWithChatHistory(question, context, settings, config, signal, onDelta);
}

export async function askFollowUp(
  question: string,
  context: FollowUpContext,
  settings: TutorSettings,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  throwIfAborted(signal);
  const trimmed = question.trim();

  if (!trimmed) {
    throw new Error('请输入追问内容。');
  }

  const config = resolveApiConfig(settings);
  let previousResponseError: unknown;

  if (config.apiProviderType === 'openai-compatible' && config.apiMode === 'responses' && context.previousResponseId) {
    try {
      const answer = await askFollowUpWithPreviousResponse(
        trimmed,
        settings,
        config,
        context.previousResponseId,
        signal,
        onDelta
      );

      if (!answer.text) {
        throw new Error('第三方 API 返回了无法解析的文本结构。');
      }

      return answer;
    } catch (error) {
      if (isOperationCanceled(error)) {
        throw error;
      }

      previousResponseError = error;
    }
  }

  try {
    const answer = await askFollowUpWithLocalHistory(trimmed, context, settings, config, signal, onDelta);

    if (!answer.text) {
      throw new Error('第三方 API 返回了无法解析的文本结构。');
    }

    return answer;
  } catch (error) {
    if (isOperationCanceled(error)) {
      throw error;
    }

    if (hasOpenAiReasoning(config) && isRetryableApiError(error)) {
      const fallbackAnswer = await askFollowUpWithLocalHistory(
        trimmed,
        context,
        settings,
        withoutReasoning(config),
        signal,
        onDelta
      );

      if (fallbackAnswer.text) {
        return fallbackAnswer;
      }
    }

    if (previousResponseError) {
      throw new Error(
        [
          '追问请求失败。',
          `previous_response_id 模式错误：${messageFromError(previousResponseError)}`,
          `本地历史上下文模式错误：${messageFromError(error)}`
        ].join('\n')
      );
    }

    throw error;
  }
}

export async function explainImageWithMetadata(
  dataUrl: string,
  settings: TutorSettings,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  throwIfAborted(signal);
  const config = resolveApiConfig(settings);
  const answer =
    config.apiProviderType === 'gemini'
      ? await explainWithGemini(dataUrl, settings, config, signal, onDelta)
      : config.apiProviderType === 'anthropic'
        ? await explainWithAnthropic(dataUrl, settings, config, signal, onDelta)
        : config.apiMode === 'responses'
          ? await explainWithResponses(dataUrl, settings, config, signal, onDelta)
          : await explainWithChatCompletions(dataUrl, settings, config, signal, onDelta);

  if (!answer.text) {
    throw new Error('第三方 API 返回了无法解析的文本结构，请确认接口模式与服务商文档一致。');
  }

  return answer;
}

export async function explainRecognizedTextWithMetadata(
  recognizedText: string,
  settings: TutorSettings,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  throwIfAborted(signal);
  const trimmed = normalizeRecognizedText(recognizedText);

  if (!trimmed) {
    throw new Error('OCR 没有识别到文字。请放大框选区域、提高截图清晰度，或切换回图片模式测试。');
  }

  const config = resolveApiConfig(settings);
  let answer: ModelAnswer;

  try {
    answer =
      config.apiProviderType === 'gemini'
        ? await explainTextWithGemini(trimmed, settings, config, signal, onDelta)
        : config.apiProviderType === 'anthropic'
          ? await explainTextWithAnthropic(trimmed, settings, config, signal, onDelta)
          : config.apiMode === 'responses'
            ? await explainTextWithResponses(trimmed, settings, config, signal, onDelta)
            : await explainTextWithChatCompletions(trimmed, settings, config, signal, onDelta);
  } catch (error) {
    if (!hasOpenAiReasoning(config) || !isRetryableApiError(error)) {
      throw error;
    }

    const fallbackConfig = withoutReasoning(config);

    answer =
      fallbackConfig.apiMode === 'responses'
        ? await explainTextWithResponses(trimmed, settings, fallbackConfig, signal, onDelta)
        : await explainTextWithChatCompletions(trimmed, settings, fallbackConfig, signal, onDelta);
  }

  if (!answer.text) {
    throw new Error('第三方 API 返回了无法解析的文本结构，请确认接口模式与服务商文档一致。');
  }

  return answer;
}
