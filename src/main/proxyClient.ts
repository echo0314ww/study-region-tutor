import type {
  ApiProviderOption,
  ModelListResult,
  QuestionSessionTurn,
  ReasoningEffort,
  TutorSettings
} from '../shared/types';
import { throwIfAborted } from './cancel';
import type { FollowUpContext, ModelAnswer } from './openaiClient';
import {
  buildFollowUpHistoryPrompt,
  buildFollowUpQuestionPrompt,
  buildTutorInstructions,
  buildTutorTextPrompt,
  buildTutorUserPrompt
} from './prompts';

type AnswerDeltaHandler = (text: string) => void;

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

function proxyBaseUrl(settings: TutorSettings): string {
  const baseUrl = (settings.proxyUrl.trim() || process.env.TUTOR_PROXY_URL?.trim() || '').replace(/\/+$/, '');

  if (!baseUrl) {
    throw new Error('请在设置中填写代理服务地址，例如 http://127.0.0.1:8787。');
  }

  try {
    new URL(baseUrl);
  } catch {
    throw new Error('代理服务地址格式不正确，请填写类似 http://127.0.0.1:8787 的地址。');
  }

  return baseUrl;
}

function proxyToken(settings: TutorSettings): string {
  const token = settings.proxyToken.trim() || process.env.TUTOR_PROXY_TOKEN?.trim() || '';

  if (!token) {
    throw new Error('请在设置中填写代理服务访问 Token。');
  }

  return token;
}

function providerId(settings: TutorSettings): string {
  const id = settings.providerId.trim();

  if (!id) {
    throw new Error('请先从代理服务加载并选择一个 API 服务商。');
  }

  return id;
}

function reasoningEffort(settings: TutorSettings): ReasoningEffort | undefined {
  return settings.reasoningEffort === 'off' ? undefined : settings.reasoningEffort;
}

async function proxyJson<T>(settings: TutorSettings, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${proxyBaseUrl(settings)}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${proxyToken(settings)}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  let data: ProxyEnvelope<T> | undefined;

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

  const response = await fetch(`${proxyBaseUrl(settings)}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${proxyToken(settings)}`,
      Accept: 'text/event-stream',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal
  });

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

  for (;;) {
    throwIfAborted(signal);
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');

    while (boundary !== -1) {
      processBlock(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }
  }

  const tail = decoder.decode();

  if (tail) {
    buffer = (buffer + tail).replace(/\r\n/g, '\n');
  }

  if (buffer.trim()) {
    processBlock(buffer);
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
