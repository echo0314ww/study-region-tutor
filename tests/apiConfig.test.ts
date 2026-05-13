import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  askFollowUp,
  explainRecognizedTextWithMetadata,
  extractModelOptions,
  getRuntimeApiDefaults,
  listAvailableModels,
  resolveApiConfig
} from '../src/main/openaiClient';
import type { TutorSettings } from '../src/shared/types';

const baseSettings: TutorSettings = {
  apiConnectionMode: 'direct',
  providerId: '',
  model: 'vision-model',
  language: 'zh-CN',
  reasoningOnly: false,
  apiMode: 'chat-completions',
  apiBaseUrl: 'https://third-party.example/v1',
  apiKey: 'test-key',
  proxyUrl: '',
  proxyToken: '',
  inputMode: 'ocr-text',
  ocrLanguage: 'chi_sim',
  ocrMathMode: true,
  reasoningEffort: 'off'
};

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }

        controller.close();
      }
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    }
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_API_KEY;
  delete process.env.AI_BASE_URL;
  delete process.env.AI_API_MODE;
  delete process.env.AI_API_TYPE;
  delete process.env.AI_PROVIDERS;
  delete process.env.AI_DEFAULT_PROVIDER;
  delete process.env.AI_PROVIDER_TCDMX_NAME;
  delete process.env.AI_PROVIDER_TCDMX_BASE_URL;
  delete process.env.AI_PROVIDER_TCDMX_API_KEY;
  delete process.env.AI_PROVIDER_TCDMX_API_MODE;
  delete process.env.AI_PROVIDER_TCDMX_API_TYPE;
  delete process.env.AI_PROVIDER_XIEAPI_NAME;
  delete process.env.AI_PROVIDER_XIEAPI_BASE_URL;
  delete process.env.AI_PROVIDER_XIEAPI_API_KEY;
  delete process.env.AI_PROVIDER_XIEAPI_API_MODE;
  delete process.env.AI_PROVIDER_XIEAPI_API_TYPE;
  delete process.env.AI_PROVIDER_MAKELOVE_NAME;
  delete process.env.AI_PROVIDER_MAKELOVE_BASE_URL;
  delete process.env.AI_PROVIDER_MAKELOVE_API_KEY;
  delete process.env.AI_PROVIDER_MAKELOVE_API_MODE;
  delete process.env.AI_PROVIDER_MAKELOVE_API_TYPE;
  delete process.env.TUTOR_API_CONNECTION_MODE;
  delete process.env.TUTOR_PROXY_URL;
  delete process.env.TUTOR_PROXY_TOKEN;
});

describe('resolveApiConfig', () => {
  it('uses settings from the UI first', () => {
    expect(resolveApiConfig(baseSettings)).toEqual({
      apiKey: 'test-key',
      baseUrl: 'https://third-party.example/v1',
      model: 'vision-model',
      apiMode: 'chat-completions',
      apiProviderType: 'openai-compatible',
      reasoningEffort: 'off'
    });
  });

  it('falls back to retained environment variables for credentials and API mode', () => {
    process.env.AI_API_KEY = 'env-key';
    process.env.AI_BASE_URL = 'https://provider.example/api/v1';
    process.env.AI_API_MODE = 'responses';

    expect(
      resolveApiConfig({
        ...baseSettings,
        apiBaseUrl: '',
        apiKey: '',
        apiMode: 'env',
        reasoningEffort: 'xhigh'
      })
    ).toEqual({
      apiKey: 'env-key',
      baseUrl: 'https://provider.example/api/v1',
      model: 'vision-model',
      apiMode: 'responses',
      apiProviderType: 'openai-compatible',
      reasoningEffort: 'xhigh'
    });
  });

  it('resolves the selected configured API provider without exposing other providers', () => {
    process.env.AI_PROVIDERS = 'tcdmx,xieapi';
    process.env.AI_DEFAULT_PROVIDER = 'xieapi';
    process.env.AI_PROVIDER_TCDMX_NAME = 'TCDMX';
    process.env.AI_PROVIDER_TCDMX_BASE_URL = 'https://tcdmx.com';
    process.env.AI_PROVIDER_TCDMX_API_KEY = 'tcdmx-key';
    process.env.AI_PROVIDER_TCDMX_API_MODE = 'responses';
    process.env.AI_PROVIDER_XIEAPI_NAME = 'Xie API';
    process.env.AI_PROVIDER_XIEAPI_BASE_URL = 'https://xie.example/v1';
    process.env.AI_PROVIDER_XIEAPI_API_KEY = 'xie-key';
    process.env.AI_PROVIDER_XIEAPI_API_MODE = 'chat-completions';

    expect(
      resolveApiConfig({
        ...baseSettings,
        providerId: 'tcdmx',
        apiBaseUrl: '',
        apiKey: '',
        apiMode: 'env'
      })
    ).toEqual({
      apiKey: 'tcdmx-key',
      baseUrl: 'https://tcdmx.com',
      model: 'vision-model',
      apiMode: 'responses',
      apiProviderType: 'openai-compatible',
      reasoningEffort: 'off',
      providerId: 'tcdmx',
      providerName: 'TCDMX'
    });

    const defaults = getRuntimeApiDefaults();

    expect(defaults.providerId).toBe('xieapi');
    expect(defaults.providers).toEqual([
      {
        id: 'tcdmx',
        name: 'TCDMX',
        baseUrl: 'https://tcdmx.com',
        apiMode: 'responses',
        apiProviderType: 'openai-compatible',
        hasApiKey: true,
        isDefault: false
      },
      {
        id: 'xieapi',
        name: 'Xie API',
        baseUrl: 'https://xie.example/v1',
        apiMode: 'chat-completions',
        apiProviderType: 'openai-compatible',
        hasApiKey: true,
        isDefault: true
      }
    ]);
    expect(JSON.stringify(defaults.providers)).not.toContain('xie-key');
  });

  it('requires the model to be selected in the settings UI', () => {
    expect(() =>
      resolveApiConfig({
        ...baseSettings,
        model: ''
      })
    ).toThrow('模型名');
  });

  it('does not send a model request after cancellation', async () => {
    const fetchMock = vi.fn();
    const controller = new AbortController();

    vi.stubGlobal('fetch', fetchMock);
    controller.abort();

    await expect(
      explainRecognizedTextWithMetadata(
        '测试题目文本',
        {
          ...baseSettings,
          apiMode: 'responses'
        },
        controller.signal
      )
    ).rejects.toThrow('已停止当前识别/回答');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps Responses response ids for question sessions', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ id: 'resp_1', output_text: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      explainRecognizedTextWithMetadata('测试题目文本', {
        ...baseSettings,
        apiMode: 'responses'
      })
    ).resolves.toEqual({
      text: 'ok',
      responseId: 'resp_1'
    });
  });

  it('sends the user-confirmed OCR text to the text endpoint', async () => {
    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
      return new Response(JSON.stringify({ id: 'resp_confirmed_ocr', output_text: 'confirmed ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      explainRecognizedTextWithMetadata('用户修正后的公式：x^2 + y^2 = 1', {
        ...baseSettings,
        apiMode: 'responses'
      })
    ).resolves.toEqual({
      text: 'confirmed ok',
      responseId: 'resp_confirmed_ocr'
    });

    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(String(body.input)).toContain('用户修正后的公式：x^2 + y^2 = 1');
  });

  it('streams Responses answer deltas as they arrive', async () => {
    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
      sseResponse([
        'data: {"type":"response.output_text.delta","delta":"第一步"}\n\n',
        'data: {"type":"response.output_text.delta","delta":"：分析题意"}\n\n',
        'data: {"type":"response.completed","response":{"id":"resp_stream","output_text":"第一步：分析题意"}}\n\n',
        'data: [DONE]\n\n'
      ])
    );
    const deltas: string[] = [];

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      explainRecognizedTextWithMetadata(
        '测试题目文本',
        {
          ...baseSettings,
          apiMode: 'responses'
        },
        undefined,
        (delta) => deltas.push(delta)
      )
    ).resolves.toEqual({
      text: '第一步：分析题意',
      responseId: 'resp_stream'
    });

    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(body.stream).toBe(true);
    expect(deltas).toEqual(['第一步', '：分析题意']);
  });

  it('streams Chat Completions answer deltas as they arrive', async () => {
    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"先看"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"条件"}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    );
    const deltas: string[] = [];

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      explainRecognizedTextWithMetadata(
        '测试题目文本',
        {
          ...baseSettings,
          apiMode: 'chat-completions'
        },
        undefined,
        (delta) => deltas.push(delta)
      )
    ).resolves.toEqual({
      text: '先看条件',
      responseId: undefined
    });

    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(body.stream).toBe(true);
    expect(deltas).toEqual(['先看', '条件']);
  });

  it('uses previous_response_id for Responses follow-up questions', async () => {
    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
      return new Response(JSON.stringify({ id: 'resp_2', output_text: 'follow-up ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      askFollowUp(
        '为什么这样做？',
        {
          problemContext: '题目上下文',
          turns: [{ role: 'assistant', content: '首次讲解' }],
          previousResponseId: 'resp_1'
        },
        {
          ...baseSettings,
          apiMode: 'responses'
        }
      )
    ).resolves.toEqual({
      text: 'follow-up ok',
      responseId: 'resp_2',
      usedPreviousResponse: true,
      usedLocalHistory: false
    });

    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(body).toMatchObject({
      previous_response_id: 'resp_1'
    });
  });

  it('falls back to local history when previous_response_id is not accepted', async () => {
    const responses = [
      new Response(JSON.stringify({ error: { message: 'previous_response_id unsupported' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }),
      new Response(JSON.stringify({ id: 'resp_history', output_text: 'history ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    ];
    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
      return (
        responses.shift() ||
        new Response(JSON.stringify({ error: { message: 'previous_response_id unsupported' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      askFollowUp(
        '还能再解释一下吗？',
        {
          problemContext: '题目上下文',
          turns: [{ role: 'assistant', content: '首次讲解' }],
          previousResponseId: 'resp_1'
        },
        {
          ...baseSettings,
          apiMode: 'responses'
        }
      )
    ).resolves.toEqual({
      text: 'history ok',
      responseId: 'resp_history',
      usedPreviousResponse: false,
      usedLocalHistory: true
    });

    const secondInit = fetchMock.mock.calls[1]?.[1];
    const secondBody = JSON.parse(String(secondInit?.body)) as Record<string, unknown>;

    expect(secondBody).not.toHaveProperty('previous_response_id');
    expect(String(secondBody.input)).toContain('题目上下文');
  });

  it('exposes runtime API defaults without leaking the API key', () => {
    process.env.AI_API_KEY = 'env-key';
    process.env.AI_BASE_URL = 'https://provider.example/api/v1';
    process.env.AI_API_MODE = 'responses';

    const defaults = getRuntimeApiDefaults();

    expect(defaults).toEqual({
      apiConnectionMode: 'direct',
      apiBaseUrl: 'https://provider.example/api/v1',
      apiMode: 'responses',
      hasApiKey: true,
      providerId: 'default',
      providers: [
        {
          id: 'default',
          name: 'Default API',
          baseUrl: 'https://provider.example/api/v1',
          apiMode: 'responses',
          apiProviderType: 'openai-compatible',
          hasApiKey: true,
          isDefault: true
        }
      ],
      proxyUrl: '',
      hasProxyToken: false
    });
    expect(defaults).not.toHaveProperty('apiKey');
  });

  it('exposes proxy defaults without leaking the proxy token', () => {
    process.env.AI_API_KEY = 'env-key';
    process.env.AI_BASE_URL = 'https://provider.example/api/v1';
    process.env.TUTOR_API_CONNECTION_MODE = 'proxy';
    process.env.TUTOR_PROXY_URL = 'http://127.0.0.1:8787';
    process.env.TUTOR_PROXY_TOKEN = 'secret-proxy-token';

    const defaults = getRuntimeApiDefaults();

    expect(defaults.apiConnectionMode).toBe('proxy');
    expect(defaults.proxyUrl).toBe('http://127.0.0.1:8787');
    expect(defaults.hasProxyToken).toBe(true);
    expect(defaults).not.toHaveProperty('proxyToken');
  });

  it('rejects official OpenAI API hosts for this third-party mode', () => {
    expect(() =>
      resolveApiConfig({
        ...baseSettings,
        apiBaseUrl: 'https://api.openai.com/v1'
      })
    ).toThrow('第三方');
  });

  it('extracts model ids from OpenAI-compatible model list shapes', () => {
    expect(
      extractModelOptions({
        data: [{ id: 'gpt-5.5', owned_by: 'provider' }, { id: 'gpt-5.4' }, { id: 'gpt-5.5' }]
      })
    ).toEqual([
      { id: 'gpt-5.5', ownedBy: 'provider' },
      { id: 'gpt-5.4', ownedBy: undefined }
    ]);

    expect(extractModelOptions({ models: ['model-a', { name: 'model-b' }] })).toEqual([
      { id: 'model-a' },
      { id: 'model-b', ownedBy: undefined }
    ]);
  });

  it('requests the third-party /models endpoint with current credentials', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ data: [{ id: 'model-a' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(listAvailableModels(baseSettings)).resolves.toEqual({
      models: [{ id: 'model-a', ownedBy: undefined }]
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://third-party.example/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          Accept: 'application/json'
        })
      })
    );
  });

  it('requests model lists from the selected configured provider', async () => {
    process.env.AI_PROVIDERS = 'tcdmx,xieapi';
    process.env.AI_PROVIDER_TCDMX_BASE_URL = 'https://tcdmx.com';
    process.env.AI_PROVIDER_TCDMX_API_KEY = 'tcdmx-key';
    process.env.AI_PROVIDER_TCDMX_API_MODE = 'responses';
    process.env.AI_PROVIDER_XIEAPI_BASE_URL = 'https://xie.example/v1';
    process.env.AI_PROVIDER_XIEAPI_API_KEY = 'xie-key';
    process.env.AI_PROVIDER_XIEAPI_API_MODE = 'chat-completions';
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ data: [{ id: 'xie-model' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listAvailableModels({
        ...baseSettings,
        providerId: 'xieapi',
        apiBaseUrl: '',
        apiKey: '',
        model: ''
      })
    ).resolves.toEqual({
      models: [{ id: 'xie-model', ownedBy: undefined }]
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://xie.example/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer xie-key'
        })
      })
    );
  });

  it('uses Gemini native request shape for a Makelove provider configured as gemini', async () => {
    process.env.AI_PROVIDERS = 'makelove';
    process.env.AI_PROVIDER_MAKELOVE_NAME = 'Makelove';
    process.env.AI_PROVIDER_MAKELOVE_BASE_URL = 'https://makelove.example/gemini/v1beta';
    process.env.AI_PROVIDER_MAKELOVE_API_KEY = 'makelove-gemini-key';
    process.env.AI_PROVIDER_MAKELOVE_API_TYPE = 'gemini';

    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'gemini ok' }] } }]
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      explainRecognizedTextWithMetadata('题目文本', {
        ...baseSettings,
        providerId: 'makelove',
        apiBaseUrl: '',
        apiKey: '',
        model: 'models/gemini-1.5-pro',
        apiMode: 'env'
      })
    ).resolves.toEqual({
      text: 'gemini ok'
    });

    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(fetchMock).toHaveBeenCalledWith(
      'https://makelove.example/gemini/v1beta/models/gemini-1.5-pro:generateContent',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-goog-api-key': 'makelove-gemini-key'
        })
      })
    );
    expect(body).toHaveProperty('system_instruction');
    expect(body).toHaveProperty('contents');
    expect(body).not.toHaveProperty('messages');
  });

  it('uses Anthropic native request shape for a Makelove provider configured as anthropic', async () => {
    process.env.AI_PROVIDERS = 'makelove';
    process.env.AI_PROVIDER_MAKELOVE_NAME = 'Makelove';
    process.env.AI_PROVIDER_MAKELOVE_BASE_URL = 'https://makelove.example/anthropic/v1';
    process.env.AI_PROVIDER_MAKELOVE_API_KEY = 'makelove-anthropic-key';
    process.env.AI_PROVIDER_MAKELOVE_API_TYPE = 'anthropic';

    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'anthropic ok' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      explainRecognizedTextWithMetadata('题目文本', {
        ...baseSettings,
        providerId: 'makelove',
        apiBaseUrl: '',
        apiKey: '',
        model: 'claude-3-5-sonnet-latest',
        apiMode: 'env'
      })
    ).resolves.toEqual({
      text: 'anthropic ok'
    });

    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(fetchMock).toHaveBeenCalledWith(
      'https://makelove.example/anthropic/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'makelove-anthropic-key',
          'anthropic-version': '2023-06-01'
        })
      })
    );
    expect(body).toMatchObject({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 4096
    });
    expect(body).toHaveProperty('messages');
    expect(body).not.toHaveProperty('input');
  });

  it('sends OpenAI-compatible reasoning effort only for supported effort values', async () => {
    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
      return new Response(JSON.stringify({ choices: [{ message: { content: 'reasoning ok' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      explainRecognizedTextWithMetadata('棰樼洰鏂囨湰', {
        ...baseSettings,
        reasoningEffort: 'minimal'
      })
    ).resolves.toEqual({
      text: 'reasoning ok'
    });

    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(body.reasoning_effort).toBe('minimal');
  });

  it('maps Claude Opus 4.6 max thinking to Anthropic adaptive effort', async () => {
    process.env.AI_PROVIDERS = 'makelove';
    process.env.AI_PROVIDER_MAKELOVE_NAME = 'Makelove';
    process.env.AI_PROVIDER_MAKELOVE_BASE_URL = 'https://makelove.example/anthropic/v1';
    process.env.AI_PROVIDER_MAKELOVE_API_KEY = 'makelove-anthropic-key';
    process.env.AI_PROVIDER_MAKELOVE_API_TYPE = 'anthropic';

    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'claude thinking ok' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      explainRecognizedTextWithMetadata('棰樼洰鏂囨湰', {
        ...baseSettings,
        providerId: 'makelove',
        apiBaseUrl: '',
        apiKey: '',
        model: 'claude-opus-4-6',
        apiMode: 'env',
        reasoningEffort: 'max'
      })
    ).resolves.toEqual({
      text: 'claude thinking ok'
    });

    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(body).toMatchObject({
      max_tokens: 20000,
      thinking: {
        type: 'adaptive',
        display: 'omitted'
      },
      output_config: {
        effort: 'max'
      }
    });
  });

  it('maps Gemini 2.5 max thinking to thinkingBudget', async () => {
    process.env.AI_PROVIDERS = 'makelove';
    process.env.AI_PROVIDER_MAKELOVE_NAME = 'Makelove';
    process.env.AI_PROVIDER_MAKELOVE_BASE_URL = 'https://makelove.example/gemini/v1beta';
    process.env.AI_PROVIDER_MAKELOVE_API_KEY = 'makelove-gemini-key';
    process.env.AI_PROVIDER_MAKELOVE_API_TYPE = 'gemini';

    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'gemini thinking ok' }] } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      explainRecognizedTextWithMetadata('棰樼洰鏂囨湰', {
        ...baseSettings,
        providerId: 'makelove',
        apiBaseUrl: '',
        apiKey: '',
        model: 'models/gemini-2.5-pro',
        apiMode: 'env',
        reasoningEffort: 'max'
      })
    ).resolves.toEqual({
      text: 'gemini thinking ok'
    });

    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(body).toMatchObject({
      generationConfig: {
        thinkingConfig: {
          thinkingBudget: 24576
        }
      }
    });
  });

  it('falls back to /v1/models when a root provider returns an HTML page for /models', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('<!doctype html><html></html>', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'gpt-5.5' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listAvailableModels({
        ...baseSettings,
        apiBaseUrl: 'https://third-party.example',
        model: ''
      })
    ).resolves.toEqual({
      models: [{ id: 'gpt-5.5', ownedBy: undefined }]
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://third-party.example/models',
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://third-party.example/v1/models',
      expect.objectContaining({ method: 'GET' })
    );
  });
});
