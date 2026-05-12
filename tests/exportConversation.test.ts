import { describe, expect, it } from 'vitest';
import { buildConversationMarkdown } from '../src/shared/exportConversation';

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
