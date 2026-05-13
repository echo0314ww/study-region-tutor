import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, watch } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { clearInterval, setInterval } from 'node:timers';

const DEFAULT_PORT = 8787;
const DEFAULT_MAX_BODY_MB = 12;
const DEFAULT_RELEASE_ANNOUNCEMENT_FILE = 'announcements/releases.json';
const DEFAULT_ANNOUNCEMENT_FILE = 'announcements/current.json';
const ENV_FILES = ['.env', '.env.local'];

let activeConfig = loadConfigSafely();
let reloadTimer;
let activeAnnouncements = [];
let announcementReloadTimer;
let announcementWatchers = [];
let lastServiceUrlSignature = '';
const announcementClients = new Set();
const rateLimitBuckets = new Map();

function parseEnvValue(raw) {
  const value = raw.trim();

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

function parseEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const env = {};
  const content = readFileSync(path, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');

    if (separator <= 0) {
      continue;
    }

    env[trimmed.slice(0, separator).trim()] = parseEnvValue(trimmed.slice(separator + 1));
  }

  return env;
}

function readRuntimeEnv() {
  const env = { ...process.env };

  for (const file of ENV_FILES) {
    Object.assign(env, parseEnvFile(resolve(process.cwd(), file)));
  }

  return env;
}

function parseApiMode(value) {
  return value === 'responses' ? 'responses' : 'chat-completions';
}

function parseApiProviderType(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'gemini' || normalized === 'anthropic') {
    return normalized;
  }

  return 'openai-compatible';
}

function parseBoolean(value, fallback = true) {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  return !['0', 'false', 'no', 'off'].includes(normalized);
}

function normalizeProviderId(id) {
  return id.trim().toLowerCase();
}

function normalizeTokenId(id) {
  return String(id || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function providerEnvKey(id) {
  return id
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

function parsePositiveInteger(value) {
  const number = Number.parseInt(String(value || ''), 10);

  return Number.isFinite(number) && number > 0 ? number : 0;
}

function loadProxyTokens(env) {
  const tokens = [];
  const seenIds = new Set();
  const legacyToken = String(env.TUTOR_PROXY_TOKEN || '').trim();

  if (legacyToken) {
    tokens.push({
      id: 'default',
      token: legacyToken,
      perMinute: parsePositiveInteger(env.TUTOR_PROXY_RATE_LIMIT_DEFAULT_PER_MINUTE),
      burst: parsePositiveInteger(env.TUTOR_PROXY_RATE_LIMIT_DEFAULT_BURST)
    });
    seenIds.add('default');
  }

  for (const rawId of String(env.TUTOR_PROXY_TOKENS || '').split(',')) {
    const id = normalizeTokenId(rawId);

    if (!id || seenIds.has(id)) {
      continue;
    }

    const key = providerEnvKey(id);
    const token = String(env[`TUTOR_PROXY_TOKEN_${key}`] || '').trim();

    if (!token) {
      console.warn(`[proxy] token "${id}" is listed in TUTOR_PROXY_TOKENS but TUTOR_PROXY_TOKEN_${key} is missing.`);
      continue;
    }

    tokens.push({
      id,
      token,
      perMinute: parsePositiveInteger(env[`TUTOR_PROXY_RATE_LIMIT_${key}_PER_MINUTE`]),
      burst: parsePositiveInteger(env[`TUTOR_PROXY_RATE_LIMIT_${key}_BURST`])
    });
    seenIds.add(id);
  }

  return tokens;
}

function normalizeOptionalUrl(value, label) {
  const url = String(value || '').trim().replace(/\/+$/, '');

  if (!url) {
    return '';
  }

  try {
    new URL(url);
  } catch {
    throw new Error(`${label} must be a valid URL, for example https://example.ngrok-free.app.`);
  }

  return url;
}

function lanServiceUrls(port) {
  const urls = [];

  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) {
      const isIpv4 = address.family === 'IPv4' || address.family === 4;

      if (isIpv4 && !address.internal) {
        urls.push(`http://${address.address}:${port}`);
      }
    }
  }

  return [...new Set(urls)].sort();
}

function serviceUrls(config = activeConfig) {
  return {
    local: [`http://127.0.0.1:${config.port}`],
    lan: lanServiceUrls(config.port),
    public: config.publicProxyUrl ? [config.publicProxyUrl] : []
  };
}

function logServiceUrls(config = activeConfig) {
  const urls = serviceUrls(config);
  const signature = JSON.stringify(urls);

  if (signature === lastServiceUrlSignature) {
    return;
  }

  lastServiceUrlSignature = signature;
  console.log(`[proxy] local:  ${urls.local.join(', ')}`);
  console.log(`[proxy] lan:    ${urls.lan.length ? urls.lan.join(', ') : '(none detected)'}`);
  console.log(`[proxy] public: ${urls.public.length ? urls.public.join(', ') : '(not configured; set TUTOR_PUBLIC_PROXY_URL)'}`);
}

function loadConfig() {
  const env = readRuntimeEnv();
  const tokens = loadProxyTokens(env);

  if (tokens.length === 0) {
    throw new Error('Missing TUTOR_PROXY_TOKEN or named TUTOR_PROXY_TOKENS in .env.local.');
  }

  const providerIds = String(env.AI_PROVIDERS || '')
    .split(',')
    .map(normalizeProviderId)
    .filter(Boolean);
  const seen = new Set();
  const providers = [];

  for (const id of providerIds) {
    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    const key = providerEnvKey(id);
    const baseUrl = String(env[`AI_PROVIDER_${key}_BASE_URL`] || '').trim();

    if (!baseUrl) {
      continue;
    }

    const apiKey = String(env[`AI_PROVIDER_${key}_API_KEY`] || '').trim();

    providers.push({
      id,
      name: String(env[`AI_PROVIDER_${key}_NAME`] || id).trim(),
      baseUrl: normalizeBaseUrl(baseUrl),
      apiMode: parseApiMode(String(env[`AI_PROVIDER_${key}_API_MODE`] || env.AI_API_MODE || '')),
      apiProviderType: parseApiProviderType(String(env[`AI_PROVIDER_${key}_API_TYPE`] || env.AI_API_TYPE || '')),
      apiKey,
      hasApiKey: Boolean(apiKey)
    });
  }

  if (providers.length === 0) {
    const baseUrl = String(env.AI_BASE_URL || '').trim();
    const apiKey = String(env.AI_API_KEY || '').trim();

    if (baseUrl) {
      providers.push({
        id: 'default',
        name: 'Default API',
        baseUrl: normalizeBaseUrl(baseUrl),
        apiMode: parseApiMode(String(env.AI_API_MODE || '')),
        apiProviderType: parseApiProviderType(String(env.AI_API_TYPE || '')),
        apiKey,
        hasApiKey: Boolean(apiKey)
      });
    }
  }

  if (providers.length === 0) {
    throw new Error('No API providers configured.');
  }

  const requestedDefault = normalizeProviderId(String(env.AI_DEFAULT_PROVIDER || ''));
  const defaultId = providers.some((provider) => provider.id === requestedDefault) ? requestedDefault : providers[0].id;
  const port = Number.parseInt(String(env.TUTOR_PROXY_PORT || DEFAULT_PORT), 10);
  const maxBodyMb = Number.parseInt(String(env.TUTOR_PROXY_MAX_BODY_MB || DEFAULT_MAX_BODY_MB), 10);
  const defaultRateLimitPerMinute = parsePositiveInteger(env.TUTOR_PROXY_RATE_LIMIT_PER_MINUTE);
  const defaultRateLimitBurst = parsePositiveInteger(env.TUTOR_PROXY_RATE_LIMIT_BURST);
  const announcementFile = String(env.ANNOUNCEMENT_FILE || DEFAULT_ANNOUNCEMENT_FILE).trim();
  const releaseAnnouncementFile = String(
    env.ANNOUNCEMENT_RELEASE_FILE || DEFAULT_RELEASE_ANNOUNCEMENT_FILE
  ).trim();
  const publicProxyUrl = normalizeOptionalUrl(env.TUTOR_PUBLIC_PROXY_URL, 'TUTOR_PUBLIC_PROXY_URL');
  const announcementPaths = uniqueInOrder([releaseAnnouncementFile, announcementFile].filter(Boolean)).map((file) =>
    resolve(process.cwd(), file)
  );

  return {
    loadedAt: new Date().toISOString(),
    tokens,
    rateLimit: {
      perMinute: defaultRateLimitPerMinute,
      burst: defaultRateLimitBurst
    },
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
    maxBodyBytes: (Number.isFinite(maxBodyMb) && maxBodyMb > 0 ? maxBodyMb : DEFAULT_MAX_BODY_MB) * 1024 * 1024,
    publicProxyUrl,
    announcementEnabled: parseBoolean(env.ANNOUNCEMENT_ENABLED, true),
    announcementPaths,
    providers: providers.map((provider) => ({
      ...provider,
      isDefault: provider.id === defaultId
    }))
  };
}

function loadConfigSafely() {
  try {
    const config = loadConfig();
    console.log(
      `[proxy] loaded ${config.providers.length} provider(s), ${config.tokens.length} proxy token(s) at ${config.loadedAt}`
    );
    return config;
  } catch (error) {
    console.error(`[proxy] config load failed: ${errorMessage(error)}`);

    if (activeConfig) {
      console.error('[proxy] keeping the previous valid config.');
      return activeConfig;
    }

    throw error;
  }
}

function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    const previousPort = activeConfig.port;
    const nextConfig = loadConfigSafely();
    activeConfig = { ...nextConfig, port: previousPort };
    logServiceUrls(activeConfig);
    scheduleAnnouncementReload();
  }, 180);
}

for (const file of ENV_FILES) {
  const path = resolve(process.cwd(), file);

  if (existsSync(path)) {
    watch(path, { persistent: false }, scheduleReload);
  }
}

function providerSummary(provider) {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiMode: provider.apiMode,
    apiProviderType: provider.apiProviderType,
    hasApiKey: provider.hasApiKey,
    isDefault: provider.isDefault
  };
}

function getProvider(providerId) {
  const id = normalizeProviderId(String(providerId || ''));
  const provider = id
    ? activeConfig.providers.find((item) => item.id === id)
    : activeConfig.providers.find((item) => item.isDefault) || activeConfig.providers[0];

  if (!provider) {
    throw new Error(`API provider not found: ${providerId || '(default)'}`);
  }

  if (!provider.apiKey) {
    throw new Error(`API provider "${provider.name}" has no API key configured.`);
  }

  return provider;
}

function encodePathSegment(value) {
  return String(value).split('/').map(encodeURIComponent).join('/');
}

function geminiModelPath(model) {
  return encodePathSegment(String(model || '').trim().replace(/^models\//, ''));
}

function endpointFor(provider, model, stream = false) {
  if (provider.apiProviderType === 'gemini') {
    const action = stream ? 'streamGenerateContent' : 'generateContent';
    const suffix = stream ? '?alt=sse' : '';
    return `${provider.baseUrl}/models/${geminiModelPath(model)}:${action}${suffix}`;
  }

  if (provider.apiProviderType === 'anthropic') {
    return provider.baseUrl.endsWith('/messages') ? provider.baseUrl : `${provider.baseUrl}/messages`;
  }

  if (provider.apiMode === 'responses') {
    return provider.baseUrl.endsWith('/responses') ? provider.baseUrl : `${provider.baseUrl}/responses`;
  }

  return provider.baseUrl.endsWith('/chat/completions')
    ? provider.baseUrl
    : `${provider.baseUrl}/chat/completions`;
}

function modelsEndpointFor(baseUrl, apiProviderType) {
  if (baseUrl.endsWith('/models')) {
    return baseUrl;
  }

  if (apiProviderType === 'anthropic' && baseUrl.endsWith('/messages')) {
    return `${baseUrl.slice(0, -'/messages'.length)}/models`;
  }

  if (apiProviderType === 'gemini' || apiProviderType === 'anthropic') {
    return `${baseUrl}/models`;
  }

  if (baseUrl.endsWith('/responses')) {
    return `${baseUrl.slice(0, -'/responses'.length)}/models`;
  }

  if (baseUrl.endsWith('/chat/completions')) {
    return `${baseUrl.slice(0, -'/chat/completions'.length)}/models`;
  }

  return `${baseUrl}/models`;
}

function modelsEndpointCandidates(baseUrl, apiProviderType) {
  const candidates = [modelsEndpointFor(baseUrl, apiProviderType)];

  try {
    const url = new URL(baseUrl);
    const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';

    if (apiProviderType === 'gemini' && normalizedPath === '/') {
      candidates.push(`${url.origin}/v1beta/models`);
    }

    if (apiProviderType === 'anthropic' && normalizedPath === '/') {
      candidates.push(`${url.origin}/v1/models`);
    }

    if (
      apiProviderType === 'openai-compatible' &&
      (normalizedPath === '/' || normalizedPath === '/responses' || normalizedPath === '/chat/completions')
    ) {
      candidates.push(`${url.origin}/v1/models`);
    }
  } catch {
    return candidates;
  }

  return [...new Set(candidates)];
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function extractModelOptions(data) {
  const rawModels = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.data)
      ? data.data
      : isRecord(data) && Array.isArray(data.models)
        ? data.models
        : [];
  const seen = new Set();
  const models = [];

  for (const rawModel of rawModels) {
    const id =
      typeof rawModel === 'string'
        ? rawModel
        : isRecord(rawModel) && typeof rawModel.id === 'string'
          ? rawModel.id
          : isRecord(rawModel) && typeof rawModel.name === 'string'
            ? rawModel.name
            : undefined;

    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    models.push({
      id,
      ownedBy: isRecord(rawModel) && typeof rawModel.owned_by === 'string' ? rawModel.owned_by : undefined
    });
  }

  return models;
}

function extractResponsesText(data) {
  if (isRecord(data) && typeof data.output_text === 'string') {
    return data.output_text;
  }

  if (!isRecord(data) || !Array.isArray(data.output)) {
    return '';
  }

  return data.output
    .flatMap((item) => (isRecord(item) && Array.isArray(item.content) ? item.content : []))
    .map((content) => (isRecord(content) && typeof content.text === 'string' ? content.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractResponsesAnswer(data) {
  return {
    text: extractResponsesText(data),
    responseId: isRecord(data) && typeof data.id === 'string' ? data.id : undefined
  };
}

function textFromContentParts(content) {
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

function extractChatAnswer(data) {
  if (!isRecord(data) || !Array.isArray(data.choices)) {
    return { text: '' };
  }

  const firstChoice = data.choices[0];
  const content = isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message.content : undefined;

  return {
    text: textFromContentParts(content)
  };
}

function extractResponsesStreamDelta(data) {
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

function extractChatStreamDelta(data) {
  if (!isRecord(data) || !Array.isArray(data.choices)) {
    return '';
  }

  const firstChoice = data.choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.delta)) {
    return '';
  }

  return textFromContentParts(firstChoice.delta.content);
}

function extractGeminiText(data) {
  if (!isRecord(data) || !Array.isArray(data.candidates)) {
    return '';
  }

  const parts = [];

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

function extractGeminiAnswer(data) {
  return {
    text: extractGeminiText(data)
  };
}

function extractGeminiStreamDelta(data) {
  return extractGeminiText(data);
}

function extractAnthropicText(data) {
  if (!isRecord(data) || !Array.isArray(data.content)) {
    return '';
  }

  return data.content
    .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractAnthropicAnswer(data) {
  return {
    text: extractAnthropicText(data)
  };
}

function extractAnthropicStreamDelta(data) {
  if (!isRecord(data)) {
    return '';
  }

  if (isRecord(data.delta) && typeof data.delta.text === 'string') {
    return data.delta.text;
  }

  return '';
}

function imageDataFromDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(String(dataUrl || ''));

  if (!match) {
    throw new Error('Invalid image data URL for the selected API provider.');
  }

  return {
    mimeType: match[1],
    data: match[2]
  };
}

function extractApiErrorMessage(data) {
  if (isRecord(data) && isRecord(data.error) && typeof data.error.message === 'string') {
    return data.error.message;
  }

  if (isRecord(data) && typeof data.message === 'string' && data.type === 'error') {
    return data.message;
  }

  return undefined;
}

function extractStreamResponseId(data) {
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

function extractStreamFinalAnswer(data, extractAnswer) {
  if (isRecord(data) && isRecord(data.response)) {
    return extractAnswer(data.response);
  }

  return extractAnswer(data);
}

function requestHeadersFor(provider, accept = 'application/json', includeContentType = true) {
  const headers = {
    Accept: accept
  };

  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  if (provider.apiProviderType === 'gemini') {
    headers['x-goog-api-key'] = provider.apiKey;
    return headers;
  }

  if (provider.apiProviderType === 'anthropic') {
    headers['x-api-key'] = provider.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    return headers;
  }

  headers.Authorization = `Bearer ${provider.apiKey}`;
  return headers;
}

async function listModels(provider) {
  const candidates = modelsEndpointCandidates(provider.baseUrl, provider.apiProviderType);
  let lastError;

  for (const endpoint of candidates) {
    try {
      const response = await fetch(endpoint, {
        headers: requestHeadersFor(provider, 'application/json', false)
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : undefined;

      if (!response.ok) {
        const message = extractApiErrorMessage(data) || text.slice(0, 600);
        throw new Error(`HTTP ${response.status}: ${message}`);
      }

      return extractModelOptions(data);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Model list request failed. Tried ${candidates.join(', ')}. Last error: ${errorMessage(lastError)}`);
}

function modelKey(model) {
  return String(model || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function isAnthropicAdaptiveEffortModel(model) {
  const key = modelKey(model);

  return (
    key.includes('opus-4-6') ||
    key.includes('opus-4-7') ||
    key.includes('sonnet-4-6') ||
    key.includes('mythos')
  );
}

function normalizeReasoningEffort(provider, payload) {
  const value = String(payload.reasoningEffort || 'off');
  const key = modelKey(payload.model);
  const is = (...values) => values.includes(value);

  if (provider.apiProviderType === 'anthropic') {
    if (is('off', 'low', 'medium', 'high')) {
      return value;
    }

    if (key.includes('opus-4-7') && is('xhigh', 'max')) {
      return value;
    }

    if ((key.includes('opus-4-6') || key.includes('sonnet-4-6') || key.includes('mythos')) && is('xhigh', 'max')) {
      return 'max';
    }

    return value === 'minimal' ? 'low' : 'high';
  }

  if (provider.apiProviderType === 'gemini') {
    if (key.includes('gemini-3')) {
      if (key.includes('flash') && is('off', 'minimal', 'low', 'medium', 'high')) {
        return value;
      }

      if (is('off', 'low', 'high')) {
        return value;
      }

      return value === 'off' ? 'off' : 'high';
    }

    if (key.includes('gemini-2-5') || key.includes('gemini-2.5')) {
      if (is('off', 'low', 'medium', 'high', 'max')) {
        return value;
      }

      if (value === 'minimal') {
        return 'low';
      }

      return value === 'xhigh' ? 'max' : 'high';
    }

    return 'off';
  }

  if (is('off', 'minimal', 'low', 'medium', 'high', 'xhigh')) {
    return value;
  }

  return value === 'max' ? 'xhigh' : 'low';
}

function withNormalizedReasoning(provider, payload) {
  return {
    ...payload,
    reasoningEffort: normalizeReasoningEffort(provider, payload)
  };
}

function openAiReasoningEffort(payload) {
  const effort = payload.reasoningEffort;

  if (!effort || effort === 'off' || effort === 'max') {
    return undefined;
  }

  return effort;
}

function hasOpenAiReasoning(provider, payload) {
  return provider.apiProviderType === 'openai-compatible' && Boolean(openAiReasoningEffort(payload));
}

function withReasoning(body, payload) {
  const effort = openAiReasoningEffort(payload);

  if (!effort) {
    return body;
  }

  return {
    ...body,
    reasoning: { effort }
  };
}

function withChatReasoning(body, payload) {
  const effort = openAiReasoningEffort(payload);

  if (!effort) {
    return body;
  }

  return {
    ...body,
    reasoning_effort: effort
  };
}

function geminiThinkingConfig(payload) {
  const effort = payload.reasoningEffort;
  const model = String(payload.model || '').toLowerCase();

  if (!effort || effort === 'off') {
    return undefined;
  }

  if (model.includes('gemini-3')) {
    const level = ['minimal', 'low', 'medium', 'high'].includes(effort) ? effort : 'high';
    return { thinkingLevel: level };
  }

  if (model.includes('gemini-2.5') || model.includes('gemini-2-5')) {
    const budgets = {
      minimal: 512,
      low: 1024,
      medium: 4096,
      high: 8192,
      xhigh: 16384,
      max: 24576
    };

    return { thinkingBudget: budgets[effort] || 8192 };
  }

  return undefined;
}

function withGeminiThinking(body, payload) {
  const thinkingConfig = geminiThinkingConfig(payload);

  return thinkingConfig
    ? {
        ...body,
        generationConfig: {
          thinkingConfig
        }
      }
    : body;
}

function anthropicEffort(payload) {
  const effort = payload.reasoningEffort;

  return !effort || effort === 'off' || effort === 'minimal' ? undefined : effort;
}

function anthropicMaxTokens(effort) {
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

function anthropicBudgetTokens(effort) {
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

function withAnthropicThinking(body, payload) {
  const effort = anthropicEffort(payload);
  const base = {
    ...body,
    max_tokens: anthropicMaxTokens(effort)
  };

  if (!effort) {
    return base;
  }

  if (isAnthropicAdaptiveEffortModel(payload.model)) {
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

function buildGeminiExplainBody(payload) {
  const task = payload.task || {};
  const parts = [];

  if (task.type === 'image') {
    const image = imageDataFromDataUrl(task.imageDataUrl);
    parts.push({ text: task.userPrompt });
    parts.push({
      inline_data: {
        mime_type: image.mimeType,
        data: image.data
      }
    });
  } else {
    parts.push({ text: task.textPrompt });
  }

  return withGeminiThinking({
    system_instruction: {
      parts: [{ text: task.instructions }]
    },
    contents: [
      {
        role: 'user',
        parts
      }
    ]
  }, payload);
}

function buildAnthropicExplainBody(payload) {
  const task = payload.task || {};
  const content = [];

  if (task.type === 'image') {
    const image = imageDataFromDataUrl(task.imageDataUrl);
    content.push({ type: 'text', text: task.userPrompt });
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mimeType,
        data: image.data
      }
    });
  } else {
    content.push({ type: 'text', text: task.textPrompt });
  }

  return withAnthropicThinking({
    model: payload.model,
    system: task.instructions,
    messages: [
      {
        role: 'user',
        content
      }
    ]
  }, payload);
}

function buildExplainBody(provider, payload) {
  const task = payload.task || {};

  if (provider.apiProviderType === 'gemini') {
    return buildGeminiExplainBody(payload);
  }

  if (provider.apiProviderType === 'anthropic') {
    return buildAnthropicExplainBody(payload);
  }

  if (provider.apiMode === 'responses') {
    if (task.type === 'image') {
      return withReasoning(
        {
          model: payload.model,
          instructions: task.instructions,
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: task.userPrompt },
                { type: 'input_image', image_url: task.imageDataUrl, detail: 'auto' }
              ]
            }
          ]
        },
        payload
      );
    }

    return withReasoning(
      {
        model: payload.model,
        instructions: task.instructions,
        input: task.textPrompt
      },
      payload
    );
  }

  if (task.type === 'image') {
    return withChatReasoning(
      {
        model: payload.model,
        messages: [
          { role: 'system', content: task.instructions },
          {
            role: 'user',
            content: [
              { type: 'text', text: task.userPrompt },
              { type: 'image_url', image_url: { url: task.imageDataUrl } }
            ]
          }
        ]
      },
      payload
    );
  }

  return withChatReasoning(
    {
      model: payload.model,
      messages: [
        { role: 'system', content: task.instructions },
        { role: 'user', content: task.textPrompt }
      ]
    },
    payload
  );
}

function buildGeminiFollowUpBody(payload) {
  return withGeminiThinking({
    system_instruction: {
      parts: [{ text: payload.instructions }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: payload.historyPrompt }]
      }
    ]
  }, payload);
}

function buildAnthropicFollowUpBody(payload) {
  return withAnthropicThinking({
    model: payload.model,
    system: payload.instructions,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: payload.historyPrompt }]
      }
    ]
  }, payload);
}

function buildFollowUpBody(provider, payload, usePreviousResponse) {
  if (provider.apiProviderType === 'gemini') {
    return buildGeminiFollowUpBody(payload);
  }

  if (provider.apiProviderType === 'anthropic') {
    return buildAnthropicFollowUpBody(payload);
  }

  if (provider.apiMode === 'responses') {
    return withReasoning(
      {
        model: payload.model,
        instructions: payload.instructions,
        ...(usePreviousResponse ? { previous_response_id: payload.previousResponseId } : {}),
        input: usePreviousResponse ? payload.questionPrompt : payload.historyPrompt
      },
      payload
    );
  }

  return withChatReasoning(
    {
      model: payload.model,
      messages: [
        { role: 'system', content: payload.instructions },
        { role: 'user', content: payload.historyPrompt }
      ]
    },
    payload
  );
}

function streamParsers(provider) {
  if (provider.apiProviderType === 'gemini') {
    return {
      extractAnswer: extractGeminiAnswer,
      extractDelta: extractGeminiStreamDelta
    };
  }

  if (provider.apiProviderType === 'anthropic') {
    return {
      extractAnswer: extractAnthropicAnswer,
      extractDelta: extractAnthropicStreamDelta
    };
  }

  return provider.apiMode === 'responses'
    ? {
        extractAnswer: extractResponsesAnswer,
        extractDelta: extractResponsesStreamDelta
      }
    : {
        extractAnswer: extractChatAnswer,
        extractDelta: extractChatStreamDelta
      };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(body));
}

function sendEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function startSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
}

function normalizeAnnouncementLevel(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

function normalizeAnnouncement(raw) {
  if (!isRecord(raw)) {
    throw new Error('Announcement must be a JSON object.');
  }

  const id = String(raw.id || '').trim();
  const title = String(raw.title || '').trim();
  const content = String(raw.content || '').trim();

  if (!id) {
    throw new Error('Announcement id is required.');
  }

  if (!title) {
    throw new Error('Announcement title is required.');
  }

  if (!content) {
    throw new Error('Announcement content is required.');
  }

  return {
    id,
    title,
    content,
    level: normalizeAnnouncementLevel(raw.level),
    publishedAt: String(raw.publishedAt || new Date().toISOString()).trim()
  };
}

function visibleAnnouncementIds(raw) {
  if (!isRecord(raw)) {
    return undefined;
  }

  const value = raw.allAnnouncement ?? raw['all announcement'] ?? raw.visibleAnnouncementIds;

  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((id) => String(id).trim()).filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function uniqueInOrder(values) {
  const seen = new Set();
  const unique = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    unique.push(value);
  }

  return unique;
}

function normalizeAnnouncementFile(raw) {
  if (!isRecord(raw)) {
    throw new Error('Announcement file must contain a JSON object.');
  }

  // Backward compatibility: the old format was one announcement object.
  if (typeof raw.id === 'string' && typeof raw.title === 'string' && typeof raw.content === 'string') {
    return [normalizeAnnouncement(raw)];
  }

  if (!Array.isArray(raw.announcements)) {
    throw new Error('Announcement file must contain an announcements array.');
  }

  const announcements = raw.announcements.map(normalizeAnnouncement);
  const byId = new Map();

  for (const announcement of announcements) {
    if (!byId.has(announcement.id)) {
      byId.set(announcement.id, announcement);
    }
  }

  const visibleIds = visibleAnnouncementIds(raw);

  if (visibleIds === undefined) {
    return announcements;
  }

  return uniqueInOrder(visibleIds)
    .map((id) => byId.get(id))
    .filter(Boolean);
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

function announcementSignature() {
  return createHash('sha256').update(JSON.stringify(activeAnnouncements)).digest('hex');
}

function loadAnnouncementSafely() {
  if (!activeConfig.announcementEnabled) {
    activeAnnouncements = [];
    return;
  }

  try {
    const nextAnnouncements = [];

    for (const announcementPath of activeConfig.announcementPaths) {
      if (!existsSync(announcementPath)) {
        console.log(`[proxy] announcement file not found: ${announcementPath}`);
        continue;
      }

      const raw = readJsonFile(announcementPath);
      nextAnnouncements.push(...normalizeAnnouncementFile(raw));
    }

    const byId = new Map();

    for (const announcement of nextAnnouncements) {
      if (!byId.has(announcement.id)) {
        byId.set(announcement.id, announcement);
      }
    }

    activeAnnouncements = [...byId.values()];
    console.log(
      `[proxy] loaded ${activeAnnouncements.length} announcement(s) from ${activeConfig.announcementPaths.length} file(s)`
    );
  } catch (error) {
    console.error(`[proxy] announcement load failed: ${errorMessage(error)}`);
    console.error('[proxy] keeping the previous valid announcement list.');
  }
}

function announcementPayload() {
  const revision = announcementSignature();

  return {
    announcement: activeAnnouncements[0] || null,
    announcements: activeAnnouncements,
    revision,
    sourceUrl: '',
    receivedAt: new Date().toISOString()
  };
}

function broadcastAnnouncement() {
  const payload = {
    type: 'announcement',
    ...announcementPayload()
  };

  for (const client of announcementClients) {
    sendEvent(client, payload);
  }
}

function scheduleAnnouncementReload() {
  clearTimeout(announcementReloadTimer);
  announcementReloadTimer = setTimeout(() => {
    const previousSignature = announcementSignature();
    loadAnnouncementSafely();
    resetAnnouncementWatcher();

    if (previousSignature !== announcementSignature()) {
      broadcastAnnouncement();
    }
  }, 180);
}

function resetAnnouncementWatcher() {
  for (const watcher of announcementWatchers) {
    watcher.close();
  }

  announcementWatchers = [];

  if (!activeConfig.announcementEnabled) {
    return;
  }

  const watchTargets = uniqueInOrder(
    activeConfig.announcementPaths.map((announcementPath) =>
      existsSync(announcementPath) ? announcementPath : dirname(announcementPath)
    )
  );

  for (const watchTarget of watchTargets) {
    if (!existsSync(watchTarget)) {
      continue;
    }

    try {
      announcementWatchers.push(watch(watchTarget, { persistent: false }, scheduleAnnouncementReload));
    } catch (error) {
      console.error(`[proxy] announcement watcher failed: ${errorMessage(error)}`);
    }
  }
}

function handleLatestAnnouncement(res) {
  sendJson(res, 200, {
    ok: true,
    data: announcementPayload()
  });
}

function handleAnnouncementStream(req, res) {
  startSse(res);
  announcementClients.add(res);
  sendEvent(res, {
    type: 'announcement',
    ...announcementPayload()
  });

  const heartbeat = setInterval(() => {
    sendEvent(res, { type: 'ping', at: new Date().toISOString() });
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    announcementClients.delete(res);
  });
}

function authorizeRequest(req) {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return undefined;
  }

  const token = header.slice('Bearer '.length).trim();

  if (!token) {
    return undefined;
  }

  return activeConfig.tokens.find((item) => item.token === token);
}

function rateLimitSettingsFor(identity, config = activeConfig) {
  const perMinute = identity.perMinute || config.rateLimit.perMinute;

  if (!perMinute) {
    return undefined;
  }

  return {
    perMinute,
    burst: identity.burst || config.rateLimit.burst || Math.max(1, Math.ceil(perMinute / 4))
  };
}

function checkRateLimit(identity, endpoint) {
  const settings = rateLimitSettingsFor(identity);

  if (!settings) {
    return { ok: true };
  }

  const now = Date.now();
  const key = `${identity.id}:${endpoint}`;
  const refillPerMs = settings.perMinute / 60000;
  const previous = rateLimitBuckets.get(key) || {
    tokens: settings.burst,
    updatedAt: now
  };
  const tokens = Math.min(settings.burst, previous.tokens + (now - previous.updatedAt) * refillPerMs);

  if (tokens < 1) {
    rateLimitBuckets.set(key, { tokens, updatedAt: now });
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / refillPerMs / 1000))
    };
  }

  rateLimitBuckets.set(key, {
    tokens: tokens - 1,
    updatedAt: now
  });

  return { ok: true };
}

function isRateLimitEnabled(config = activeConfig) {
  return Boolean(config.rateLimit.perMinute || config.tokens.some((token) => token.perMinute));
}

function readJsonBody(req) {
  return new Promise((resolveBody, reject) => {
    let total = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      total += chunk.length;

      if (total > activeConfig.maxBodyBytes) {
        reject(new Error(`Request body is too large. Limit is ${Math.round(activeConfig.maxBodyBytes / 1024 / 1024)} MB.`));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');

      if (!text.trim()) {
        resolveBody({});
        return;
      }

      try {
        resolveBody(JSON.parse(text));
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function streamRequestBodyFor(provider, body) {
  if (provider.apiProviderType === 'gemini') {
    return body;
  }

  return {
    ...body,
    stream: true
  };
}

async function postUpstreamStream(provider, body, onDelta, signal, model = body.model) {
  const parsers = streamParsers(provider);
  const response = await fetch(endpointFor(provider, model, true), {
    method: 'POST',
    headers: requestHeadersFor(provider, 'text/event-stream'),
    body: JSON.stringify(streamRequestBodyFor(provider, body)),
    signal
  });

  if (!response.ok) {
    const text = await response.text();
    let data;

    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }

    const message = extractApiErrorMessage(data) || text.slice(0, 600);
    const error = new Error(`${provider.name} request failed (${response.status}): ${message}`);
    error.status = response.status;
    throw error;
  }

  const reader = response.body?.getReader();

  if (!reader) {
    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;
    const answer = parsers.extractAnswer(data);
    onDelta(answer.text);
    return answer;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let rawText = '';
  let streamedText = '';
  let responseId;
  let finalAnswer;
  let sawSseData = false;

  const handlePayload = (payload) => {
    const trimmed = payload.trim();

    if (!trimmed || trimmed === '[DONE]') {
      return;
    }

    sawSseData = true;
    let data;

    try {
      data = JSON.parse(trimmed);
    } catch {
      streamedText += payload;
      onDelta(payload);
      return;
    }

    const streamError = extractApiErrorMessage(data);

    if (streamError) {
      throw new Error(`${provider.name} stream failed: ${streamError}`);
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
      onDelta(delta);
    }
  };

  const processBlock = (block) => {
    const dataLines = [];

    for (const line of block.split('\n')) {
      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart());
      }
    }

    if (dataLines.length > 0) {
      handlePayload(dataLines.join('\n'));
    }
  };

  for (;;) {
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
    return { text: streamedText, responseId: responseId || finalAnswer?.responseId };
  }

  if (finalAnswer?.text) {
    onDelta(finalAnswer.text);
    return { ...finalAnswer, responseId: finalAnswer.responseId || responseId };
  }

  if (!sawSseData && rawText.trim()) {
    const data = JSON.parse(rawText);
    const answer = parsers.extractAnswer(data);
    onDelta(answer.text);
    return answer;
  }

  return { text: '', responseId };
}

function isRetryable(error) {
  return [502, 503, 504].includes(error?.status) || /\b(502|503|504)\b/.test(errorMessage(error)) || /upstream/i.test(errorMessage(error));
}

async function postWithOptionalReasoningFallback(provider, payload, bodyFactory, onDelta, signal) {
  let emittedDelta = false;
  const normalizedPayload = withNormalizedReasoning(provider, payload);

  try {
    return await postUpstreamStream(provider, bodyFactory(normalizedPayload), (delta) => {
      if (delta) {
        emittedDelta = true;
        onDelta(delta);
      }
    }, signal, normalizedPayload.model);
  } catch (error) {
    if (!hasOpenAiReasoning(provider, normalizedPayload) || emittedDelta || !isRetryable(error)) {
      throw error;
    }

    return postUpstreamStream(
      provider,
      bodyFactory({ ...normalizedPayload, reasoningEffort: 'off' }),
      onDelta,
      signal,
      normalizedPayload.model
    );
  }
}

function createClientAbortController(res) {
  const controller = new AbortController();
  let completed = false;

  res.on('close', () => {
    if (!completed) {
      controller.abort();
    }
  });

  return {
    signal: controller.signal,
    complete: () => {
      completed = true;
    }
  };
}

async function handleExplainStream(res, payload) {
  const provider = getProvider(payload.providerId);
  const clientAbort = createClientAbortController(res);

  startSse(res);

  try {
    const answer = await postWithOptionalReasoningFallback(provider, payload, (current) => buildExplainBody(provider, current), (delta) => {
      sendEvent(res, { type: 'delta', text: delta });
    }, clientAbort.signal);

    sendEvent(res, { type: 'done', answer });
    clientAbort.complete();
    res.end();
  } catch (error) {
    sendEvent(res, { type: 'error', message: errorMessage(error) });
    clientAbort.complete();
    res.end();
  }
}

async function handleFollowUpStream(res, payload) {
  const provider = getProvider(payload.providerId);
  const clientAbort = createClientAbortController(res);

  startSse(res);

  try {
    let answer;
    let emittedDelta = false;

    if (provider.apiProviderType === 'openai-compatible' && provider.apiMode === 'responses' && payload.previousResponseId) {
      try {
        answer = await postWithOptionalReasoningFallback(
          provider,
          payload,
          (current) => buildFollowUpBody(provider, current, true),
          (delta) => {
            if (delta) {
              emittedDelta = true;
              sendEvent(res, { type: 'delta', text: delta });
            }
          },
          clientAbort.signal
        );
      } catch (error) {
        if (emittedDelta) {
          throw error;
        }
      }
    }

    if (!answer) {
      answer = await postWithOptionalReasoningFallback(
        provider,
        payload,
        (current) => buildFollowUpBody(provider, current, false),
        (delta) => {
          sendEvent(res, { type: 'delta', text: delta });
        },
        clientAbort.signal
      );
    }

    sendEvent(res, { type: 'done', answer });
    clientAbort.complete();
    res.end();
  } catch (error) {
    sendEvent(res, { type: 'error', message: errorMessage(error) });
    clientAbort.complete();
    res.end();
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function route(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, { ok: true });
    return;
  }

  if (url.pathname === '/health' && req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      data: {
        status: 'ok',
        loadedAt: activeConfig.loadedAt,
        providerCount: activeConfig.providers.length,
        serviceUrls: serviceUrls(activeConfig),
        announcementEnabled: activeConfig.announcementEnabled,
        announcementCount: activeAnnouncements.length,
        hasAnnouncement: activeAnnouncements.length > 0,
        tokenCount: activeConfig.tokens.length,
        rateLimitEnabled: isRateLimitEnabled(activeConfig)
      }
    });
    return;
  }

  if (url.pathname === '/announcements/latest' && req.method === 'GET') {
    handleLatestAnnouncement(res);
    return;
  }

  if (url.pathname === '/announcements/stream' && req.method === 'GET') {
    handleAnnouncementStream(req, res);
    return;
  }

  const identity = authorizeRequest(req);

  if (!identity) {
    sendJson(res, 401, { ok: false, error: 'Unauthorized proxy request.' });
    return;
  }

  const limit = checkRateLimit(identity, url.pathname);

  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds || 1));
    sendJson(res, 429, {
      ok: false,
      error: `Rate limit exceeded for token "${identity.id}". Please retry later.`
    });
    return;
  }

  if (url.pathname === '/providers' && req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      data: {
        providers: activeConfig.providers.map(providerSummary)
      }
    });
    return;
  }

  if (url.pathname === '/models' && req.method === 'POST') {
    const payload = await readJsonBody(req);
    const provider = getProvider(payload.providerId);
    const models = await listModels(provider);
    sendJson(res, 200, { ok: true, data: { models } });
    return;
  }

  if (url.pathname === '/explain/stream' && req.method === 'POST') {
    await handleExplainStream(res, await readJsonBody(req));
    return;
  }

  if (url.pathname === '/follow-up/stream' && req.method === 'POST') {
    await handleFollowUpStream(res, await readJsonBody(req));
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found.' });
}

const server = createServer((req, res) => {
  route(req, res).catch((error) => {
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, error: errorMessage(error) });
      return;
    }

    try {
      sendEvent(res, { type: 'error', message: errorMessage(error) });
      res.end();
    } catch {
      res.destroy();
    }
  });
});

loadAnnouncementSafely();
resetAnnouncementWatcher();

server.listen(activeConfig.port, '0.0.0.0', () => {
  console.log(`[proxy] listening on http://0.0.0.0:${activeConfig.port}`);
  logServiceUrls(activeConfig);
  console.log('[proxy] use GET /health to check status; announcements are public; API proxy endpoints require Authorization: Bearer <TUTOR_PROXY_TOKEN>');
});

setInterval(() => {
  logServiceUrls(activeConfig);
}, 30000);
