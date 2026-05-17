import { describe, expect, it } from 'vitest';
import {
  guideDefinition,
  hasGuideContent,
  historyGuide,
  productGuide,
  releaseGuide,
  releaseGuideHistory,
  releaseGuideVersionList
} from '../src/renderer/src/guides';

describe('guides', () => {
  it('keeps the product guide focused on the full workflow', () => {
    const guide = productGuide('1.4.0');

    expect(guide.steps.length).toBeGreaterThan(0);
    expect(guide.steps.some((step) => step.body.includes('复制答案') && step.body.includes('导出答案'))).toBe(true);
    expect(guide.steps.some((step) => step.body.includes('学习库'))).toBe(true);
  });

  it('provides release guide content for the current feature update', () => {
    const guide = releaseGuide('1.4.0');

    expect(hasGuideContent('release', '1.4.0')).toBe(true);
    expect(guideDefinition('release', '1.4.0').steps).toHaveLength(4);
    expect(guide.steps.map((step) => step.title)).toEqual([
      '界面文案更完整',
      '主界面更易维护',
      '安全和稳定性更稳',
      '发布检查更严格'
    ]);
  });

  it('keeps historical release guides for users who install the latest version directly', () => {
    const history = historyGuide('1.4.0');

    expect(hasGuideContent('history', '1.4.0')).toBe(true);
    expect(history.historyVersions?.map((section) => section.version)).toContain('1.3.0');
    expect(history.historyVersions?.map((section) => section.version)).toContain('1.2.0');
    expect(history.historyVersions?.map((section) => section.version)).toContain('1.1.3');
    expect(history.historyVersions?.map((section) => section.version)).toContain('1.1.2');
    expect(history.historyVersions?.map((section) => section.version)).toContain('1.1.1');
    expect(history.historyVersions?.map((section) => section.version)).toContain('1.1.0');
    expect(history.historyVersions?.map((section) => section.version)).toContain('0.1.0');
    expect(history.historyVersions?.map((section) => section.version)).not.toContain('1.4.0');
  });

  it('orders historical release guides from newest to oldest and hides future entries', () => {
    const history = releaseGuideHistory('1.0.2');

    expect(history.map((section) => section.version)).toEqual(['1.0.1', '1.0.0', '0.5.0', '0.4.0', '0.3.1', '0.3.0', '0.2.0', '0.1.0']);
    expect(releaseGuideVersionList()[0]).toBe('1.4.0');
    expect(guideDefinition('history', '1.0.2').historyVersions?.[0]?.version).toBe('1.0.1');
  });
});
