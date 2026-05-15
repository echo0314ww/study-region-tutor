import { describe, expect, it } from 'vitest';
import {
  buildConversationMarkdown,
  buildObsidianStudyItemMarkdown,
  buildStudyLibraryAnkiCsv,
  buildStudyLibraryMarkdown
} from '../src/shared/exportConversation';
import type { ExportStudyLibraryRequest } from '../src/shared/types';

describe('buildConversationMarkdown', () => {
  it('exports conversation text without sensitive runtime fields', () => {
    const markdown = buildConversationMarkdown({
      appVersion: '1.0.4',
      exportedAt: '2026/5/12 15:00:00',
      model: 'demo-model',
      language: 'zh-CN',
      inputMode: 'image',
      reasoningOnly: false,
      turns: [
        {
          role: 'assistant',
          content: '第一轮讲解\n\\[x^2=1\\]'
        },
        {
          role: 'user',
          content: '为什么？'
        },
        {
          role: 'assistant',
          content: '因为平方关系。'
        }
      ]
    });

    expect(markdown).toContain('# Study Region Tutor 题目讲解');
    expect(markdown).toContain('- 模型：demo-model');
    expect(markdown).toContain('第一轮讲解');
    expect(markdown).toContain('\\[x^2=1\\]');
    expect(markdown).toContain('为什么？');
    expect(markdown).toContain('不包含截图、API Key、代理 Token 或代理服务地址');
    expect(markdown).not.toContain('apiKey');
    expect(markdown).not.toContain('proxyToken');
  });
});

const studyLibraryRequest: ExportStudyLibraryRequest = {
  appVersion: '1.2.0-dev',
  exportedAt: '2026/5/15 20:00:00',
  format: 'markdown',
  items: [
    {
      id: 'study-1',
      title: '导数错题',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T01:00:00.000Z',
      lastReviewedAt: '',
      nextReviewAt: '2026-05-16T00:00:00.000Z',
      appVersion: '1.2.0-dev',
      model: 'demo-model',
      providerId: 'demo-provider',
      inputMode: 'ocr-text',
      language: 'zh-CN',
      subject: 'math',
      tags: ['导数'],
      favorite: true,
      status: 'reviewing',
      reviewCount: 1,
      correctCount: 0,
      wrongCount: 1,
      difficulty: 'hard',
      mistakeReason: '公式选择错误',
      metadata: {
        subject: 'math',
        topic: '导数',
        questionType: '计算题',
        difficulty: 'hard',
        keyPoints: ['链式法则'],
        mistakeTraps: ['符号错误'],
        tags: ['微分'],
        summary: '练习导数计算。',
        extractedAt: '2026-05-15T01:00:00.000Z'
      },
      turns: [
        { role: 'user', content: '求 f(x)=x^2 的导数' },
        { role: 'assistant', content: '答案是 \\[2x\\]' }
      ]
    }
  ]
};

describe('study library export builders', () => {
  it('exports study library markdown without sensitive runtime fields', () => {
    const markdown = buildStudyLibraryMarkdown(studyLibraryRequest);

    expect(markdown).toContain('# Study Region Tutor 学习库');
    expect(markdown).toContain('导数错题');
    expect(markdown).toContain('链式法则');
    expect(markdown).toContain('不包含截图、API Key、代理 Token 或代理服务地址');
    expect(markdown).not.toContain('apiKey');
    expect(markdown).not.toContain('proxyToken');
  });

  it('exports Anki CSV with quoted formula content', () => {
    const csv = buildStudyLibraryAnkiCsv({ ...studyLibraryRequest, format: 'anki-csv' });

    expect(csv).toContain('"Front","Back","Subject"');
    expect(csv).toContain('"求 f(x)=x^2 的导数"');
    expect(csv).toContain('\\[2x\\]');
  });

  it('exports Obsidian markdown with frontmatter', () => {
    const markdown = buildObsidianStudyItemMarkdown(studyLibraryRequest.items[0]);

    expect(markdown).toContain('---');
    expect(markdown).toContain('subject: "math"');
    expect(markdown).toContain('reviewCount: 1');
  });
});
