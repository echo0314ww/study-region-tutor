import type { WebContents } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc';
import type { AnnouncementEvent, ProxyHealthResult } from '../shared/types';

interface ProxyEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface AnnouncementStreamEvent extends Partial<AnnouncementEvent> {
  type?: string;
}

const INITIAL_RETRY_DELAY_MS = 5000;
const MAX_RETRY_DELAY_MS = 60000;
const MAX_CONSECUTIVE_FAILURES = 8;
const PROXY_REQUEST_TIMEOUT_MS = 10000;

let activeBaseUrl = '';
let activeWebContents: WebContents | undefined;
let activeController: AbortController | undefined;
let reconnectTimer: NodeJS.Timeout | undefined;
let consecutiveFailures = 0;

function normalizeBaseUrl(sourceUrl?: string): string {
  const baseUrl = (sourceUrl === undefined ? process.env.TUTOR_PROXY_URL?.trim() || '' : sourceUrl.trim()).replace(
    /\/+$/,
    ''
  );

  if (!baseUrl) {
    return '';
  }

  let url: URL;

  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('远程服务地址格式不正确，请填写类似 http://127.0.0.1:8787 的地址。');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('远程服务地址只支持 http 或 https。');
  }

  if (url.username || url.password) {
    throw new Error('远程服务地址不能包含用户名或密码。');
  }

  return baseUrl;
}

function timeoutSignal(milliseconds = PROXY_REQUEST_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(milliseconds);
}

function parseEnvelope<T>(text: string): ProxyEnvelope<T> {
  try {
    return text ? (JSON.parse(text) as ProxyEnvelope<T>) : { ok: false, error: '公告服务返回空响应。' };
  } catch {
    throw new Error(`公告服务返回了非 JSON 响应：${text.replace(/\s+/g, ' ').slice(0, 160)}`);
  }
}

function sendAnnouncement(event: AnnouncementEvent): void {
  if (!activeWebContents || activeWebContents.isDestroyed()) {
    return;
  }

  activeWebContents.send(IPC_CHANNELS.announcement, event);
}

function normalizeAnnouncementEvent(event: Partial<AnnouncementEvent> | undefined, baseUrl: string): AnnouncementEvent {
  const announcements = Array.isArray(event?.announcements)
    ? event.announcements
    : event?.announcement
      ? [event.announcement]
      : [];

  return {
    announcement: event?.announcement || announcements[0] || null,
    announcements,
    revision: event?.revision || '',
    sourceUrl: event?.sourceUrl || baseUrl,
    receivedAt: event?.receivedAt || new Date().toISOString()
  };
}

function stopReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
}

export function stopAnnouncementStream(): void {
  stopReconnectTimer();
  activeController?.abort();
  activeController = undefined;
  activeBaseUrl = '';
  activeWebContents = undefined;
  consecutiveFailures = 0;
}

export async function fetchLatestAnnouncement(sourceUrl?: string): Promise<AnnouncementEvent> {
  const baseUrl = normalizeBaseUrl(sourceUrl);

  if (!baseUrl) {
    return normalizeAnnouncementEvent(undefined, '');
  }

  try {
    const response = await fetch(`${baseUrl}/announcements/latest`, {
      headers: {
        Accept: 'application/json'
      },
      signal: timeoutSignal()
    });
    const text = await response.text();
    const envelope = parseEnvelope<AnnouncementEvent>(text);

    if (!response.ok || !envelope.ok) {
      throw new Error(envelope.error || `公告服务请求失败 (${response.status})。`);
    }

    return normalizeAnnouncementEvent(envelope.data, baseUrl);
  } catch (error) {
    console.warn(`Latest announcement unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return normalizeAnnouncementEvent(undefined, baseUrl);
  }
}

export async function checkProxyHealth(sourceUrl?: string): Promise<ProxyHealthResult> {
  const baseUrl = normalizeBaseUrl(sourceUrl);

  if (!baseUrl) {
    return {
      ok: false,
      sourceUrl: '',
      message: '未配置代理服务地址。'
    };
  }

  try {
    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        Accept: 'application/json'
      },
      signal: timeoutSignal()
    });
    const text = await response.text();
    const envelope = parseEnvelope<{
      status?: string;
      tokenCount?: number;
      rateLimitEnabled?: boolean;
      providerCount?: number;
      serviceUrls?: ProxyHealthResult['serviceUrls'];
      announcementEnabled?: boolean;
      announcementCount?: number;
      loadedAt?: string;
    }>(text);

    if (!response.ok || !envelope.ok) {
      throw new Error(envelope.error || `代理服务请求失败 (${response.status})。`);
    }

    return {
      ok: envelope.data?.status === 'ok' || envelope.ok,
      sourceUrl: baseUrl,
      message: '代理服务连接成功。',
      tokenCount: envelope.data?.tokenCount,
      rateLimitEnabled: envelope.data?.rateLimitEnabled,
      providerCount: envelope.data?.providerCount,
      serviceUrls: envelope.data?.serviceUrls,
      announcementEnabled: envelope.data?.announcementEnabled,
      announcementCount: envelope.data?.announcementCount,
      loadedAt: envelope.data?.loadedAt
    };
  } catch (error) {
    return {
      ok: false,
      sourceUrl: baseUrl,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

function scheduleReconnect(): void {
  stopReconnectTimer();

  if (!activeBaseUrl || !activeWebContents || activeWebContents.isDestroyed()) {
    return;
  }

  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    console.warn('Announcement stream stopped after repeated reconnect failures.');
    return;
  }

  const baseUrl = activeBaseUrl;
  const webContents = activeWebContents;
  const retryDelay = Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * 2 ** Math.max(0, consecutiveFailures - 1));
  const jitter = Math.round(retryDelay * (0.2 + Math.random() * 0.3));
  reconnectTimer = setTimeout(() => {
    void openAnnouncementStream(baseUrl, webContents);
  }, retryDelay + jitter);
}

function handleStreamPayload(payload: string, baseUrl: string): void {
  const trimmed = payload.trim();

  if (!trimmed) {
    return;
  }

  let event: AnnouncementStreamEvent;

  try {
    event = JSON.parse(trimmed) as AnnouncementStreamEvent;
  } catch {
    return;
  }

  if (event.type === 'announcement') {
    consecutiveFailures = 0;
    sendAnnouncement(normalizeAnnouncementEvent(event, baseUrl));
  }
}

function processSseBlock(block: string, baseUrl: string): void {
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }

  if (dataLines.length > 0) {
    handleStreamPayload(dataLines.join('\n'), baseUrl);
  }
}

async function openAnnouncementStream(baseUrl: string, webContents: WebContents): Promise<void> {
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;

  try {
    const response = await fetch(`${baseUrl}/announcements/stream`, {
      headers: {
        Accept: 'text/event-stream'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`公告流连接失败 (${response.status})。`);
    }

    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error('公告服务没有返回可读取的流式响应。');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();

        if (done || controller.signal.aborted || webContents.isDestroyed()) {
          break;
        }

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let boundary = buffer.indexOf('\n\n');

        while (boundary !== -1) {
          processSseBlock(buffer.slice(0, boundary), baseUrl);
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');
        }
      }

      const tail = decoder.decode().replace(/\r\n/g, '\n');

      if (tail) {
        buffer += tail;
      }

      if (buffer.trim()) {
        processSseBlock(buffer, baseUrl);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      consecutiveFailures += 1;
      console.warn(`Announcement stream disconnected: ${error instanceof Error ? error.message : String(error)}`);
    }
  } finally {
    if (activeController === controller) {
      activeController = undefined;
    }

    if (!controller.signal.aborted && !webContents.isDestroyed()) {
      scheduleReconnect();
    }
  }
}

export function connectAnnouncementStream(sourceUrl: string | undefined, webContents: WebContents): void {
  const baseUrl = normalizeBaseUrl(sourceUrl);

  if (!baseUrl) {
    stopAnnouncementStream();
    return;
  }

  if (activeBaseUrl === baseUrl && activeWebContents === webContents && activeController) {
    return;
  }

  stopReconnectTimer();
  activeController?.abort();
  activeBaseUrl = baseUrl;
  activeWebContents = webContents;
  consecutiveFailures = 0;
  void openAnnouncementStream(baseUrl, webContents);
}
