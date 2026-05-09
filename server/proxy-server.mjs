import { createServer } from 'node:http';
import { existsSync, readFileSync, watch } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { clearInterval, setInterval } from 'node:timers';

const DEFAULT_PORT = 8787;
const DEFAULT_MAX_BODY_MB = 12;
const DEFAULT_ANNOUNCEMENT_FILE = 'announcements/current.json';
const ENV_FILES = ['.env', '.env.local'];

let activeConfig = loadConfigSafely();
let reloadTimer;
let activeAnnouncements = [];
let announcementReloadTimer;
let announcementWatcher;
const announcementClients = new Set();

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

function loadConfig() {
  const env = readRuntimeEnv();
  const token = String(env.TUTOR_PROXY_TOKEN || '').trim();

  if (!token) {
    throw new Error('Missing TUTOR_PROXY_TOKEN in .env.local.');
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
  const announcementFile = String(env.ANNOUNCEMENT_FILE || DEFAULT_ANNOUNCEMENT_FILE).trim();

  return {
    loadedAt: new Date().toISOString(),
    token,
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
    maxBodyBytes: (Number.isFinite(maxBodyMb) && maxBodyMb > 0 ? maxBodyMb : DEFAULT_MAX_BODY_MB) * 1024 * 1024,
    announcementEnabled: parseBoolean(env.ANNOUNCEMENT_ENABLED, true),
    announcementPath: resolve(process.cwd(), announcementFile || DEFAULT_ANNOUNCEMENT_FILE),
    providers: providers.map((provider) => ({
      ...provider,
      isDefault: provider.id === defaultId
    }))
  };
}

function loadConfigSafely() {
  try {
    const config = loadConfig();
    console.log(`[proxy] loaded ${config.providers.length} provider(s) at ${config.loadedAt}`);
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
    activeConfig = loadConfigSafely();
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

function endpointFor(provider) {
  if (provider.apiMode === 'responses') {
    return provider.baseUrl.endsWith('/responses') ? provider.baseUrl : `${provider.baseUrl}/responses`;
  }

  return provider.baseUrl.endsWith('/chat/completions')
    ? provider.baseUrl
    : `${provider.baseUrl}/chat/completions`;
}

function modelsEndpointFor(baseUrl) {
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

function modelsEndpointCandidates(baseUrl) {
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

async function listModels(provider) {
  const candidates = modelsEndpointCandidates(provider.baseUrl);
  let lastError;

  for (const endpoint of candidates) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          Accept: 'application/json'
        }
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

function withReasoning(body, payload) {
  const effort = payload.reasoningEffort;

  if (!effort || effort === 'off') {
    return body;
  }

  return {
    ...body,
    reasoning: { effort }
  };
}

function withChatReasoning(body, payload) {
  const effort = payload.reasoningEffort;

  if (!effort || effort === 'off') {
    return body;
  }

  return {
    ...body,
    reasoning_effort: effort
  };
}

function buildExplainBody(provider, payload) {
  const task = payload.task || {};

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

function buildFollowUpBody(provider, payload, usePreviousResponse) {
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
  return ['info', 'warning', 'critical'].includes(value) ? value : 'info';
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
    level: normalizeAnnouncementLevel(String(raw.level || 'info').trim()),
    publishedAt: String(raw.publishedAt || new Date().toISOString()).trim(),
    popup: Boolean(raw.popup)
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
  return JSON.stringify(activeAnnouncements);
}

function loadAnnouncementSafely() {
  if (!activeConfig.announcementEnabled) {
    activeAnnouncements = [];
    return;
  }

  if (!existsSync(activeConfig.announcementPath)) {
    activeAnnouncements = [];
    console.log(`[proxy] announcement file not found: ${activeConfig.announcementPath}`);
    return;
  }

  try {
    const raw = readJsonFile(activeConfig.announcementPath);
    activeAnnouncements = normalizeAnnouncementFile(raw);
    console.log(`[proxy] loaded ${activeAnnouncements.length} announcement(s)`);
  } catch (error) {
    console.error(`[proxy] announcement load failed: ${errorMessage(error)}`);
    console.error('[proxy] keeping the previous valid announcement list.');
  }
}

function announcementPayload() {
  return {
    announcement: activeAnnouncements[0] || null,
    announcements: activeAnnouncements,
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
  announcementWatcher?.close();
  announcementWatcher = undefined;

  if (!activeConfig.announcementEnabled) {
    return;
  }

  const watchTarget = existsSync(activeConfig.announcementPath)
    ? activeConfig.announcementPath
    : dirname(activeConfig.announcementPath);

  if (!existsSync(watchTarget)) {
    return;
  }

  try {
    announcementWatcher = watch(watchTarget, { persistent: false }, scheduleAnnouncementReload);
  } catch (error) {
    console.error(`[proxy] announcement watcher failed: ${errorMessage(error)}`);
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

function isAuthorized(req) {
  const header = req.headers.authorization || '';
  const expected = `Bearer ${activeConfig.token}`;

  return header === expected;
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

async function postUpstreamStream(provider, body, onDelta, signal) {
  const parsers = streamParsers(provider);
  const response = await fetch(endpointFor(provider), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify({ ...body, stream: true }),
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

  try {
    return await postUpstreamStream(provider, bodyFactory(payload), (delta) => {
      if (delta) {
        emittedDelta = true;
        onDelta(delta);
      }
    }, signal);
  } catch (error) {
    if (!payload.reasoningEffort || emittedDelta || !isRetryable(error)) {
      throw error;
    }

    return postUpstreamStream(provider, bodyFactory({ ...payload, reasoningEffort: undefined }), onDelta, signal);
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

    if (provider.apiMode === 'responses' && payload.previousResponseId) {
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
        announcementEnabled: activeConfig.announcementEnabled,
        announcementCount: activeAnnouncements.length,
        hasAnnouncement: activeAnnouncements.length > 0
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

  if (!isAuthorized(req)) {
    sendJson(res, 401, { ok: false, error: 'Unauthorized proxy request.' });
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
  console.log('[proxy] use GET /health to check status; announcements are public; API proxy endpoints require Authorization: Bearer <TUTOR_PROXY_TOKEN>');
});
