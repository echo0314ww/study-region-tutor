import type {
  ApiConnectionMode,
  ApiMode,
  ApiProviderOption,
  ApiRuntimeDefaults,
  ModelListResult,
  ModelOption,
  QuestionSessionTurn,
  ReasoningEffort,
  TutorSettings
} from '../shared/types';
import { isOperationCanceled, throwIfAborted } from './cancel';
import {
  buildFollowUpHistoryPrompt,
  buildFollowUpQuestionPrompt,
  buildTutorInstructions,
  buildTutorTextPrompt,
  buildTutorUserPrompt
} from './prompts';
import { getApiProviderById, getApiProviderSummaries, parseApiMode } from './apiProviders';

export interface ModelAnswer {
  text: string;
  responseId?: string;
  usedPreviousResponse?: boolean;
  usedLocalHistory?: boolean;
}

export interface FollowUpContext {
  problemContext: string;
  turns: QuestionSessionTurn[];
  previousResponseId?: string;
}

type AnswerDeltaHandler = (text: string) => void;

interface ApiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  apiMode: ApiMode;
  reasoningEffort?: ReasoningEffort;
  providerId?: string;
  providerName?: string;
}

interface ApiConnectionConfig {
  apiKey: string;
  baseUrl: string;
  apiMode?: ApiMode;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireThirdPartyBaseUrl(baseUrl: string): void {
  let url: URL;

  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('第三方 API Base URL 格式不正确，请填写类似 https://api.example.com/v1 的地址。');
  }

  if (url.hostname === 'api.openai.com' || url.hostname.endsWith('.openai.com')) {
    throw new Error('当前配置指向 OpenAI 官方 API。请填写第三方 OpenAI-compatible API Base URL。');
  }
}

function parseApiConnectionMode(value: string | undefined): ApiConnectionMode {
  return value === 'proxy' ? 'proxy' : 'direct';
}

export function resolveApiConfig(settings: TutorSettings): ApiConfig {
  const connection = resolveApiConnectionConfig(settings);
  const model = settings.model.trim();
  const apiMode = settings.apiMode === 'env' ? connection.apiMode || parseApiMode(process.env.AI_API_MODE) : settings.apiMode;
  const reasoningEffort = settings.reasoningEffort === 'off' ? undefined : settings.reasoningEffort;

  if (!model) {
    throw new Error('请在设置中选择或填写第三方模型名。');
  }

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
    baseUrl: baseUrl.replace(/\/+$/, '')
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

function withReasoning<T extends Record<string, unknown>>(body: T, config: ApiConfig): T & { reasoning?: { effort: ReasoningEffort } } {
  if (!config.reasoningEffort) {
    return body;
  }

  return {
    ...body,
    reasoning: {
      effort: config.reasoningEffort
    }
  };
}

function endpointFor(config: ApiConfig): string {
  if (config.apiMode === 'responses') {
    return config.baseUrl.endsWith('/responses') ? config.baseUrl : `${config.baseUrl}/responses`;
  }

  return config.baseUrl.endsWith('/chat/completions') ? config.baseUrl : `${config.baseUrl}/chat/completions`;
}

function modelsEndpointFor(baseUrl: string): string {
  if (baseUrl.endsWith('/models')) {
    return baseUrl;
  }

  if (baseUrl.endsWith('/responses')) {
    return `${baseUrl.slice(0, -'/responses'.length)}/models`;
  }

  if (baseUrl.endsWith('/chat/completions')) {
    return `${baseUrl.slice(0, -'/chat/completions'.length)}/models`;
  }

  return `${baseUrl}/models`;
}

function modelsEndpointCandidates(baseUrl: string): string[] {
  const candidates = [modelsEndpointFor(baseUrl)];

  try {
    const url = new URL(baseUrl);
    const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';

    if (normalizedPath === '/' || normalizedPath === '/responses' || normalizedPath === '/chat/completions') {
      candidates.push(`${url.origin}/v1/models`);
    }
  } catch {
    return candidates;
  }

  return [...new Set(candidates)];
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

async function fetchModelOptionsFromEndpoint(config: ApiConnectionConfig, endpoint: string): Promise<ModelOption[]> {
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: 'application/json'
    }
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
  const candidates = modelsEndpointCandidates(config.baseUrl);
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
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
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

function extractApiErrorMessage(data: unknown): string | undefined {
  if (isRecord(data) && isRecord(data.error) && typeof data.error.message === 'string') {
    return data.error.message;
  }

  if (isRecord(data) && typeof data.message === 'string' && data.type === 'error') {
    return data.message;
  }

  return undefined;
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

async function postJsonStream(
  config: ApiConfig,
  body: Record<string, unknown>,
  parsers: StreamParsers,
  signal: AbortSignal | undefined,
  onDelta: AnswerDeltaHandler
): Promise<ModelAnswer> {
  throwIfAborted(signal);

  const response = await fetch(endpointFor(config), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify({ ...body, stream: true }),
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
        dataLines.push(line.slice('data:'.length).trimStart());
      }
    }

    if (dataLines.length === 0) {
      return;
    }

    handlePayload(dataLines.join('\n'));
  };

  for (;;) {
    throwIfAborted(signal);
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    const chunk = decoder.decode(value, { stream: true });
    rawText += chunk;
    buffer = (buffer + chunk).replace(/\r\n/g, '\n');

    let boundary = buffer.indexOf('\n\n');

    while (boundary !== -1) {
      processBlock(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }
  }

  const tail = decoder.decode();

  if (tail) {
    rawText += tail;
    buffer = (buffer + tail).replace(/\r\n/g, '\n');
  }

  if (buffer.trim()) {
    processBlock(buffer);
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
    reasoningEffort: undefined
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

  for (const item of data.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
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
  const body = {
    model: config.model,
    ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
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
  };

  if (onDelta) {
    return postJsonStream(config, body, {
      extractAnswer: extractChatAnswer,
      extractDelta: extractChatStreamDelta
    }, signal, onDelta);
  }

  const response = await postJson(config, body, signal);

  return extractChatAnswer(response);
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
  const body = {
    model: config.model,
    ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
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
  };

  if (onDelta) {
    return postJsonStream(config, body, {
      extractAnswer: extractChatAnswer,
      extractDelta: extractChatStreamDelta
    }, signal, onDelta);
  }

  const response = await postJson(config, body, signal);

  return extractChatAnswer(response);
}

function limitContextText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `[前文较长，已保留末尾 ${maxLength} 个字符]\n${text.slice(-maxLength)}`;
}

function limitHistoryTurns(turns: QuestionSessionTurn[]): QuestionSessionTurn[] {
  return turns.slice(-8).map((turn) => ({
    role: turn.role,
    content: limitContextText(turn.content, 6000)
  }));
}

function buildLimitedFollowUpHistoryPrompt(
  context: FollowUpContext,
  question: string,
  settings: TutorSettings
): string {
  return buildFollowUpHistoryPrompt(
    limitContextText(context.problemContext, 18000),
    limitHistoryTurns(context.turns),
    question,
    settings
  );
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
  const body = {
    model: config.model,
    ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
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
  };
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

async function askFollowUpWithLocalHistory(
  question: string,
  context: FollowUpContext,
  settings: TutorSettings,
  config: ApiConfig,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
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

  if (config.apiMode === 'responses' && context.previousResponseId) {
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

    if (config.reasoningEffort && isRetryableApiError(error)) {
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
    config.apiMode === 'responses'
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
      config.apiMode === 'responses'
        ? await explainTextWithResponses(trimmed, settings, config, signal, onDelta)
        : await explainTextWithChatCompletions(trimmed, settings, config, signal, onDelta);
  } catch (error) {
    if (!config.reasoningEffort || !isRetryableApiError(error)) {
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
