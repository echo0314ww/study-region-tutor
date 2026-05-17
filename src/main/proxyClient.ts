import type {
  ApiProviderOption,
  ModelListResult,
  ReasoningEffortSetting,
  StudyMetadata,
  TutorSettings
} from '../shared/types';
import { throwIfAborted } from './cancel';
import type { ModelAnswer } from './openaiClient';
import type { FollowUpContext } from './apiShared';
import { metadataFromAnswer, buildLimitedFollowUpHistoryPrompt } from './apiShared';
import {
  buildFollowUpQuestionPrompt,
  buildStudyMetadataInstructions,
  buildStudyMetadataPrompt,
  buildTutorInstructions,
  buildTutorTextPrompt,
  buildTutorUserPrompt
} from './prompts';
import { clearSavedProxyToken, getSavedProxyToken } from './proxyTokenStore';

type AnswerDeltaHandler = (text: string) => void;
type ProxyTokenSource = 'settings' | 'env' | 'saved';

interface ProxyEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface ProxyStreamEvent {
  type?: string;
  text?: string;
  message?: string;
  answer?: ModelAnswer;
}

interface ProxyTokenSelection {
  token: string;
  source: ProxyTokenSource;
}

const SAVED_PROXY_TOKEN_INVALID_MESSAGE = '代理访问 Token 已失效，请重新填写最新的 TUTOR_PROXY_TOKEN。';
const ENTERED_PROXY_TOKEN_INVALID_MESSAGE = '代理访问 Token 验证失败，请检查后重新填写。';
const ENV_PROXY_TOKEN_INVALID_MESSAGE = '环境变量 TUTOR_PROXY_TOKEN 验证失败，请检查当前启动环境。';

function proxyBaseUrl(settings: TutorSettings): string {
  const baseUrl = (settings.proxyUrl.trim() || process.env.TUTOR_PROXY_URL?.trim() || '').replace(/\/+$/, '');

  if (!baseUrl) {
    throw new Error('请在设置中填写代理服务地址，例如 http://127.0.0.1:8787。');
  }

  let parsed: URL;

  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('代理服务地址格式不正确，请填写类似 http://127.0.0.1:8787 的地址。');
  }

  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    console.warn(`[proxy] WARNING: proxy URL uses non-HTTPS protocol (${parsed.protocol}). Traffic may be unencrypted.`);
  }

  return baseUrl;
}

function proxyToken(settings: TutorSettings): ProxyTokenSelection {
  const settingsToken = settings.proxyToken.trim();

  if (settingsToken) {
    return { token: settingsToken, source: 'settings' };
  }

  const envToken = process.env.TUTOR_PROXY_TOKEN?.trim();

  if (envToken) {
    return { token: envToken, source: 'env' };
  }

  const savedToken = getSavedProxyToken();

  if (savedToken) {
    return { token: savedToken, source: 'saved' };
  }

  throw new Error('请在设置中填写代理服务访问 Token。');
}

function handleUnauthorizedProxyResponse(selection: ProxyTokenSelection): never {
  if (selection.source === 'saved') {
    clearSavedProxyToken();
    throw new Error(SAVED_PROXY_TOKEN_INVALID_MESSAGE);
  }

  if (selection.source === 'env') {
    throw new Error(ENV_PROXY_TOKEN_INVALID_MESSAGE);
  }

  throw new Error(ENTERED_PROXY_TOKEN_INVALID_MESSAGE);
}

function isUnauthorizedProxyResponse(response: Response): boolean {
  return response.status === 401 || response.status === 403;
}

function requireProxyToken(settings: TutorSettings): ProxyTokenSelection {
  const selection = proxyToken(settings);

  if (!selection.token) {
    throw new Error('请在设置中填写代理服务访问 Token。');
  }

  return selection;
}

function providerId(settings: TutorSettings): string {
  const id = settings.providerId.trim();

  if (!id) {
    throw new Error('请先从代理服务加载并选择一个 API 服务商。');
  }

  return id;
}

function reasoningEffort(settings: TutorSettings): ReasoningEffortSetting {
  return settings.reasoningEffort;
}


async function proxyJson<T>(settings: TutorSettings, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const tokenSelection = requireProxyToken(settings);
  const signals = [AbortSignal.timeout(30_000), ...(signal ? [signal] : [])];
  const effectiveSignal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);
  const response = await fetch(`${proxyBaseUrl(settings)}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${tokenSelection.token}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: effectiveSignal
  });
  const text = await response.text();
  let data: ProxyEnvelope<T> | undefined;

  if (isUnauthorizedProxyResponse(response)) {
    handleUnauthorizedProxyResponse(tokenSelection);
  }

  try {
    data = text ? (JSON.parse(text) as ProxyEnvelope<T>) : undefined;
  } catch {
    throw new Error(`代理服务返回了非 JSON 响应：${text.replace(/\s+/g, ' ').slice(0, 160)}`);
  }

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `代理服务请求失败 (${response.status})。`);
  }

  return data.data as T;
}

export async function proxyListApiProviders(settings: TutorSettings): Promise<ApiProviderOption[]> {
  const response = await proxyJson<{ providers: ApiProviderOption[] }>(settings, '/providers');

  return response.providers;
}

export async function proxyListAvailableModels(settings: TutorSettings): Promise<ModelListResult> {
  return proxyJson<ModelListResult>(settings, '/models', {
    providerId: providerId(settings)
  });
}


function streamPayloadBase(settings: TutorSettings): Record<string, unknown> {
  const model = settings.model.trim();

  if (!model) {
    throw new Error('请在设置中选择模型。');
  }

  return {
    providerId: providerId(settings),
    model,
    reasoningEffort: reasoningEffort(settings),
    settings: {
      language: settings.language,
      reasoningOnly: settings.reasoningOnly
    }
  };
}

async function proxyStream(
  settings: TutorSettings,
  path: string,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
  onDelta: AnswerDeltaHandler | undefined
): Promise<ModelAnswer> {
  throwIfAborted(signal);
  const tokenSelection = requireProxyToken(settings);
  const streamSignals = [AbortSignal.timeout(120_000), ...(signal ? [signal] : [])];
  const effectiveSignal = streamSignals.length === 1 ? streamSignals[0] : AbortSignal.any(streamSignals);

  const response = await fetch(`${proxyBaseUrl(settings)}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenSelection.token}`,
      Accept: 'text/event-stream',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: effectiveSignal
  });

  if (isUnauthorizedProxyResponse(response)) {
    handleUnauthorizedProxyResponse(tokenSelection);
  }

  if (!response.ok) {
    const text = await response.text();

    try {
      const data = JSON.parse(text) as ProxyEnvelope<unknown>;
      throw new Error(data.error || `代理服务请求失败 (${response.status})。`);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`代理服务请求失败 (${response.status})：${text.replace(/\s+/g, ' ').slice(0, 240)}`);
      }

      throw error;
    }
  }

  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error('代理服务没有返回可读取的流式响应。');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let answerText = '';
  let finalAnswer: ModelAnswer | undefined;

  const handleEvent = (payload: string): void => {
    const trimmed = payload.trim();

    if (!trimmed) {
      return;
    }

    let event: ProxyStreamEvent;

    try {
      event = JSON.parse(trimmed) as ProxyStreamEvent;
    } catch {
      answerText += payload;
      onDelta?.(payload);
      return;
    }

    if (event.type === 'delta' && event.text) {
      answerText += event.text;
      onDelta?.(event.text);
      return;
    }

    if (event.type === 'done' && event.answer) {
      finalAnswer = event.answer;
      return;
    }

    if (event.type === 'error') {
      throw new Error(event.message || '代理服务流式请求失败。');
    }
  };

  const processBlock = (block: string): void => {
    const dataLines: string[] = [];

    for (const line of block.split('\n')) {
      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart());
      }
    }

    if (dataLines.length > 0) {
      handleEvent(dataLines.join('\n'));
    }
  };

  try {
    for (;;) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');

      while (boundary !== -1) {
        processBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }

    const tail = decoder.decode().replace(/\r\n/g, '\n');

    if (tail) {
      buffer += tail;
    }

    if (buffer.trim()) {
      processBlock(buffer);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return finalAnswer || { text: answerText };
}

export async function proxyExplainImageWithMetadata(
  dataUrl: string,
  settings: TutorSettings,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  const answer = await proxyStream(
    settings,
    '/explain/stream',
    {
      ...streamPayloadBase(settings),
      task: {
        type: 'image',
        instructions: buildTutorInstructions(settings),
        userPrompt: buildTutorUserPrompt(settings),
        imageDataUrl: dataUrl
      }
    },
    signal,
    onDelta
  );

  if (!answer.text) {
    throw new Error('代理服务返回了无法解析的文本结构。');
  }

  return answer;
}

export async function proxyExplainRecognizedTextWithMetadata(
  recognizedText: string,
  settings: TutorSettings,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  const answer = await proxyStream(
    settings,
    '/explain/stream',
    {
      ...streamPayloadBase(settings),
      task: {
        type: 'text',
        instructions: buildTutorInstructions(settings),
        textPrompt: buildTutorTextPrompt(recognizedText, settings)
      }
    },
    signal,
    onDelta
  );

  if (!answer.text) {
    throw new Error('代理服务返回了无法解析的文本结构。');
  }

  return answer;
}

export async function proxyGenerateTextCompletion(
  instructions: string,
  prompt: string,
  settings: TutorSettings,
  signal?: AbortSignal
): Promise<ModelAnswer> {
  const answer = await proxyStream(
    settings,
    '/explain/stream',
    {
      ...streamPayloadBase(settings),
      task: {
        type: 'text',
        instructions,
        textPrompt: prompt
      }
    },
    signal,
    undefined
  );

  if (!answer.text) {
    throw new Error('代理服务返回了无法解析的文本结构。');
  }

  return answer;
}

export async function proxyExtractStudyMetadataFromText(
  text: string,
  settings: TutorSettings,
  signal?: AbortSignal
): Promise<StudyMetadata> {
  const answer = await proxyGenerateTextCompletion(
    buildStudyMetadataInstructions(settings),
    buildStudyMetadataPrompt(text),
    settings,
    signal
  );

  return metadataFromAnswer(answer.text);
}

export async function proxyAskFollowUp(
  question: string,
  context: FollowUpContext,
  settings: TutorSettings,
  signal?: AbortSignal,
  onDelta?: AnswerDeltaHandler
): Promise<ModelAnswer> {
  const trimmed = question.trim();

  if (!trimmed) {
    throw new Error('请输入追问内容。');
  }

  const answer = await proxyStream(
    settings,
    '/follow-up/stream',
    {
      ...streamPayloadBase(settings),
      instructions: buildTutorInstructions(settings),
      questionPrompt: buildFollowUpQuestionPrompt(trimmed, settings),
      historyPrompt: buildLimitedFollowUpHistoryPrompt(context, trimmed, settings),
      previousResponseId: context.previousResponseId
    },
    signal,
    onDelta
  );

  if (!answer.text) {
    throw new Error('代理服务返回了无法解析的文本结构。');
  }

  return answer;
}
