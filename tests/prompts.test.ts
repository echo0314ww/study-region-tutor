import { describe, expect, it } from 'vitest';
import { buildTutorInstructions } from '../src/main/prompts';

describe('buildTutorInstructions', () => {
  it('keeps the app framed as learning support', () => {
    const prompt = buildTutorInstructions({
      providerId: '',
      model: 'gpt-4.1-mini',
      language: 'zh-CN',
      reasoningOnly: false,
      apiMode: 'chat-completions',
      apiBaseUrl: 'https://third-party.example/v1',
      apiKey: 'test-key',
      inputMode: 'ocr-text',
      ocrLanguage: 'chi_sim',
      ocrMathMode: true,
      reasoningEffort: 'off'
    });

    expect(prompt).toContain('学习辅导助手');
    expect(prompt).toContain('不要直接代答');
    expect(prompt).toContain('概念讲解和学习建议');
  });

  it('supports reasoning-only mode', () => {
    const prompt = buildTutorInstructions({
      providerId: '',
      model: 'gpt-4.1-mini',
      language: 'zh-CN',
      reasoningOnly: true,
      apiMode: 'chat-completions',
      apiBaseUrl: 'https://third-party.example/v1',
      apiKey: 'test-key',
      inputMode: 'ocr-text',
      ocrLanguage: 'chi_sim',
      ocrMathMode: true,
      reasoningEffort: 'off'
    });

    expect(prompt).toContain('只讲思路');
    expect(prompt).toContain('不要直接给出最终答案');
  });
});
