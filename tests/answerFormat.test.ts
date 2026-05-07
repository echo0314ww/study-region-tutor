import { describe, expect, it } from 'vitest';
import { latexToReadable, parseAnswerBlocks } from '../src/renderer/src/answerFormat';

describe('answer formatting', () => {
  it('converts common LaTeX math into readable text', () => {
    expect(latexToReadable('\\boxed{\\frac{x^2}{4}+y^2=1}')).toBe('x²/4 + y² = 1');
    expect(latexToReadable('m\\in\\left(-\\frac{3\\sqrt3}{2}, \\frac{3\\sqrt3}{2}\\right)')).toBe(
      'm ∈ (-3√3/2, 3√3/2)'
    );
    expect(latexToReadable('\\frac43')).toBe('4/3');
  });

  it('parses markdown headings and display math blocks', () => {
    expect(
      parseAnswerBlocks(['## 六、结果', '', '\\[', '\\boxed{\\frac{x^2}{4}+y^2=1}', '\\]'].join('\n'))
    ).toEqual([
      { type: 'heading', level: 2, text: '六、结果' },
      { type: 'math', source: '\\boxed{\\frac{x^2}{4}+y^2=1}\n\\]' }
    ]);
  });
});
