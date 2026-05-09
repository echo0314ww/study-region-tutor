import type { WebContents } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc';
import type { AnnouncementEvent } from '../shared/types';

interface ProxyEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface AnnouncementStreamEvent extends Partial<AnnouncementEvent> {
  type?: string;
  message?: string;
}

const RETRY_DELAY_MS = 5000;

let activeBaseUrl = '';
let activeWebContents: WebContents | undefined;
let activeController: AbortController | undefined;
let reconnectTimer: NodeJS.Timeout | undefined;

function normalizeBaseUrl(sourceUrl?: string): string {
  const baseUrl = (sourceUrl?.trim() || process.env.TUTOR_PROXY_URL?.trim() || '').replace(/\/+$/, '');

  if (!baseUrl) {
    return '';
  }

  try {
    new URL(baseUrl);
  } catch {
    throw new Error('远程服务地址格式不正确，请填写类似 http://127.0.0.1:8787 的地址。');
  }

  return baseUrl;
}

function announcementEndpoint(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
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
}

export async function fetchLatestAnnouncement(sourceUrl?: string): Promise<AnnouncementEvent> {
  const baseUrl = normalizeBaseUrl(sourceUrl);

  if (!baseUrl) {
    return normalizeAnnouncementEvent(undefined, '');
  }

  const response = await fetch(announcementEndpoint(baseUrl, '/announcements/latest'), {
    headers: {
      Accept: 'application/json'
    }
  });
  const text = await response.text();
  const envelope = parseEnvelope<AnnouncementEvent>(text);

  if (!response.ok || !envelope.ok) {
    throw new Error(envelope.error || `公告服务请求失败 (${response.status})。`);
  }

  return normalizeAnnouncementEvent(envelope.data, baseUrl);
}

function scheduleReconnect(): void {
  stopReconnectTimer();

  if (!activeBaseUrl || !activeWebContents || activeWebContents.isDestroyed()) {
    return;
  }

  const baseUrl = activeBaseUrl;
  const webContents = activeWebContents;
  reconnectTimer = setTimeout(() => {
    void openAnnouncementStream(baseUrl, webContents);
  }, RETRY_DELAY_MS);
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
    const response = await fetch(announcementEndpoint(baseUrl, '/announcements/stream'), {
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

    for (;;) {
      const { done, value } = await reader.read();

      if (done || controller.signal.aborted || webContents.isDestroyed()) {
        break;
      }

      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');

      while (boundary !== -1) {
        processSseBlock(buffer.slice(0, boundary), baseUrl);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }

    const tail = decoder.decode();

    if (tail) {
      buffer = (buffer + tail).replace(/\r\n/g, '\n');
    }

    if (buffer.trim()) {
      processSseBlock(buffer, baseUrl);
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      console.warn(`Announcement stream disconnected: ${error instanceof Error ? error.message : String(error)}`);
    }
  } finally {
    if (activeController === controller) {
      activeController = undefined;
    }

    if (!controller.signal.aborted) {
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
  void openAnnouncementStream(baseUrl, webContents);
}
