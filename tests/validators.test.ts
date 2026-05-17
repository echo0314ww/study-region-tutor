import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/renderer/src/constants';
import type { ExportStudyLibraryRequest } from '../src/shared/types';
import {
  parseBooleanFlag,
  parseCancelRequest,
  parseExportConversationRequest,
  parseExportStudyLibraryRequest,
  parseExtractStudyMetadataRequest,
  parseExplainRecognizedTextRequest,
  parseExplainRequest,
  parseFollowUpRequest,
  parseOptionalProxyServiceUrl,
  parseOptionalSourceUrl,
  parseOptionalTutorSettings,
  parseProxyToken,
  parseRunDiagnosticsRequest,
  parseRunPromptEvalRequest,
  parseStudyLibraryBackup,
  ValidationError
} from '../src/shared/validators';

const settings = {
  ...DEFAULT_SETTINGS,
  model: 'model-a',
  providerId: 'provider-a'
};

describe('ipc validators', () => {
  it('accepts a valid explain request', () => {
    expect(
      parseExplainRequest({
        requestId: 'request-1',
        region: { x: -100, y: 20, width: 300, height: 180 },
        settings
      })
    ).toMatchObject({
      requestId: 'request-1',
      region: { x: -100, y: 20, width: 300, height: 180 },
      settings: {
        model: 'model-a',
        providerId: 'provider-a'
      }
    });
  });

  it('rejects invalid capture regions before main process work starts', () => {
    expect(() =>
      parseExplainRequest({
        requestId: 'request-1',
        region: { x: 0, y: 0, width: 0, height: 180 },
        settings
      })
    ).toThrow(ValidationError);
    expect(() =>
      parseExplainRequest({
        requestId: 'request-1',
        region: { x: 100_001, y: 0, width: 100, height: 100 },
        settings
      })
    ).toThrow(ValidationError);
  });

  it('rejects invalid settings enum values', () => {
    expect(() =>
      parseFollowUpRequest({
        requestId: 'request-1',
        sessionId: 'session-1',
        question: 'why?',
        settings: {
          ...settings,
          inputMode: 'clipboard'
        }
      })
    ).toThrow(/settings.inputMode/);
  });

  it('accepts OCR text requests and preserves fallback context', () => {
    expect(
      parseExplainRecognizedTextRequest({
        requestId: 'request-1',
        recognizedText: '题目文本',
        settings,
        sourceMode: 'ocr-text',
        reason: 'image-fallback',
        fallbackReason: 'vision endpoint failed'
      })
    ).toMatchObject({
      requestId: 'request-1',
      recognizedText: '题目文本',
      fallbackReason: 'vision endpoint failed'
    });
  });

  it('validates study library export requests', () => {
    const request: ExportStudyLibraryRequest = {
      appVersion: '1.2.0',
      exportedAt: '2026-05-16 12:00:00',
      format: 'markdown',
      items: [
        {
          id: 'item-1',
          title: '导数题',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
          lastReviewedAt: '',
          nextReviewAt: '',
          appVersion: '1.2.0',
          model: 'model-a',
          providerId: 'provider-a',
          inputMode: 'ocr-text',
          language: 'zh-CN',
          subject: 'math',
          tags: ['导数'],
          favorite: false,
          status: 'new',
          reviewCount: 0,
          correctCount: 0,
          wrongCount: 0,
          difficulty: 'normal',
          mistakeReason: '',
          turns: [
            {
              role: 'user',
              content: '求导'
            },
            {
              role: 'assistant',
              content: '使用求导法则。'
            }
          ]
        }
      ]
    };

    expect(parseExportStudyLibraryRequest(request)).toEqual(request);
  });

  it('rejects malformed study library export items', () => {
    expect(() =>
      parseExportStudyLibraryRequest({
        appVersion: '1.2.0',
        exportedAt: '2026-05-16 12:00:00',
        format: 'markdown',
        items: [
          {
            id: 'item-1',
            title: 'bad item',
            reviewCount: -1
          }
        ]
      })
    ).toThrow(ValidationError);
  });

  it('validates diagnostics and metadata extraction requests', () => {
    expect(
      parseRunDiagnosticsRequest({
        settings,
        appVersion: '1.2.0',
        deepCheck: true
      })
    ).toMatchObject({ appVersion: '1.2.0', deepCheck: true });

    expect(
      parseExtractStudyMetadataRequest({
        text: '题目和讲解',
        settings
      })
    ).toMatchObject({ text: '题目和讲解' });
  });

  it('validates prompt eval variants and limits variant count', () => {
    const parsedEval = parseRunPromptEvalRequest({
        requestId: 'eval-1',
        inputText: '题目文本',
        settings,
        variants: [
          {
            id: 'variant-1',
            providerId: 'provider-a',
            model: 'model-a',
            promptTemplateId: 'standard'
          }
        ]
      });

    expect(parsedEval.requestId).toBe('eval-1');
    expect(parsedEval.variants).toHaveLength(1);

    expect(() =>
      parseRunPromptEvalRequest({
        inputText: '题目文本',
        settings,
        variants: Array.from({ length: 21 }, (_, index) => ({
          id: `variant-${index}`,
          providerId: 'provider-a',
          model: 'model-a',
          promptTemplateId: 'standard'
        }))
      })
    ).toThrow(/variants/);
    expect(() =>
      parseRunPromptEvalRequest({
        inputText: '题目文本',
        settings,
        variants: []
      })
    ).toThrow(/variants/);
  });

  it('validates cancel request ids', () => {
    expect(parseCancelRequest({ requestId: 'request-1' })).toEqual({ requestId: 'request-1' });
    expect(() => parseCancelRequest({ requestId: '' })).toThrow(ValidationError);
  });

  it('validates smaller IPC boundary primitives', () => {
    expect(parseOptionalTutorSettings(undefined)).toBeUndefined();
    expect(parseOptionalTutorSettings(settings)).toMatchObject({ model: 'model-a' });
    expect(parseProxyToken(' token ')).toBe(' token ');
    expect(parseBooleanFlag(true, 'debugMode')).toBe(true);
    expect(parseOptionalSourceUrl(undefined)).toBeUndefined();
    expect(parseOptionalSourceUrl('https://proxy.example/path/')).toBe('https://proxy.example/path');
    expect(parseOptionalProxyServiceUrl('http://127.0.0.1:8787/')).toBe('http://127.0.0.1:8787');
    expect(parseOptionalProxyServiceUrl('http://192.168.1.10:8787')).toBe('http://192.168.1.10:8787');
    expect(() => parseProxyToken(123)).toThrow(ValidationError);
    expect(() => parseBooleanFlag('true', 'debugMode')).toThrow(ValidationError);
    expect(() => parseOptionalSourceUrl('file:///tmp/a')).toThrow(/sourceUrl/);
    expect(() => parseOptionalProxyServiceUrl('file:///tmp/a')).toThrow(/proxyUrl/);
    expect(() => parseOptionalSourceUrl('http://127.0.0.1:8787')).toThrow(/sourceUrl/);
    expect(() => parseOptionalSourceUrl('https://user:pass@proxy.example')).toThrow(/sourceUrl/);
    expect(() => parseOptionalProxyServiceUrl('https://user:pass@proxy.example')).toThrow(/proxyUrl/);
  });

  it('blocks IPv6 private and reserved addresses (SSRF prevention)', () => {
    expect(() => parseOptionalSourceUrl('http://[fe80::1]:8787')).toThrow(/sourceUrl/);
    expect(() => parseOptionalSourceUrl('http://[fd00::1]:8787')).toThrow(/sourceUrl/);
    expect(() => parseOptionalSourceUrl('http://[fc00::1]:8787')).toThrow(/sourceUrl/);
    expect(() => parseOptionalSourceUrl('http://[::ffff:127.0.0.1]:8787')).toThrow(/sourceUrl/);
    expect(() => parseOptionalSourceUrl('http://[::ffff:10.0.0.1]:8787')).toThrow(/sourceUrl/);
    expect(() => parseOptionalSourceUrl('http://[::ffff:192.168.1.1]:8787')).toThrow(/sourceUrl/);
    expect(() => parseOptionalSourceUrl('http://[::10.0.0.1]:8787')).toThrow(/sourceUrl/);
    expect(parseOptionalSourceUrl('https://proxy.example.com:8787')).toBe('https://proxy.example.com:8787');
  });

  it('validates conversation export requests', () => {
    const request = {
      appVersion: '1.2.0',
      exportedAt: '2026-05-16 12:00:00',
      model: 'model-a',
      language: 'zh-CN',
      inputMode: 'ocr-text',
      reasoningOnly: false,
      turns: [
        { role: 'user', content: '题目' },
        { role: 'assistant', content: '讲解' }
      ]
    };

    expect(parseExportConversationRequest(request)).toEqual(request);
    expect(() => parseExportConversationRequest({ ...request, turns: [{ role: 'system', content: 'bad' }] })).toThrow(
      ValidationError
    );
  });

  it('validates study library backup imports deeply', () => {
    const backup = parseStudyLibraryBackup({
      version: 1,
      exportedAt: '2026-05-17T00:00:00.000Z',
      appVersion: '1.3.0',
      itemCount: 999,
      items: [
        {
          id: 'item-1',
          title: '导数题',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
          lastReviewedAt: '',
          nextReviewAt: '',
          appVersion: '1.3.0',
          model: 'model-a',
          providerId: 'provider-a',
          inputMode: 'ocr-text',
          language: 'zh-CN',
          subject: 'math',
          tags: ['导数'],
          favorite: false,
          status: 'new',
          reviewCount: 0,
          correctCount: 0,
          wrongCount: 0,
          difficulty: 'normal',
          mistakeReason: '',
          turns: [{ role: 'user', content: '求导' }]
        }
      ]
    });

    expect(backup.itemCount).toBe(1);
    expect(backup.items[0].subject).toBe('math');
    expect(() =>
      parseStudyLibraryBackup({
        version: 1,
        exportedAt: '2026-05-17T00:00:00.000Z',
        appVersion: '1.3.0',
        itemCount: 1,
        items: [{ id: 'bad' }]
      })
    ).toThrow(ValidationError);
  });
});
