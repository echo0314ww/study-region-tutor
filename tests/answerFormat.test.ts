import { describe, expect, it } from 'vitest';
import { cleanLatexSource, flatFormulaToLatex, latexToReadable, parseAnswerBlocks, tryPromoteFlatFormula } from '../src/renderer/src/answerFormat';

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
      { type: 'math', source: '\\boxed{\\frac{x^2}{4}+y^2=1}' }
    ]);
  });

  it('cleans inline and display math delimiters for KaTeX rendering', () => {
    expect(cleanLatexSource('\\(\\frac{4\\sqrt{7}}{7}b\\)')).toBe('\\frac{4\\sqrt{7}}{7}b');
    expect(cleanLatexSource('$\\frac{4\\sqrt{7}}{7}b$')).toBe('\\frac{4\\sqrt{7}}{7}b');
    expect(cleanLatexSource('$$\\frac{4\\sqrt{7}}{7}b$$')).toBe('\\frac{4\\sqrt{7}}{7}b');
    expect(cleanLatexSource('\\[\\frac{4\\sqrt{7}}{7}b\\]')).toBe('\\frac{4\\sqrt{7}}{7}b');
  });

  it('parses single-line display math blocks', () => {
    expect(parseAnswerBlocks('$$\\frac{4\\sqrt{7}}{7}b$$')).toEqual([
      { type: 'math', source: '\\frac{4\\sqrt{7}}{7}b' }
    ]);
  });

  it('hides LaTeX labels when they only introduce math', () => {
    expect(parseAnswerBlocks(['补充 LaTeX:', '\\[', 'S_{\\triangle MON}=\\frac{8\\sqrt{3}}{2}', '\\]'].join('\n'))).toEqual([
      { type: 'math', source: 'S_{\\triangle MON}=\\frac{8\\sqrt{3}}{2}' }
    ]);

    expect(parseAnswerBlocks('LaTeX: \\(\\frac{4\\sqrt{7}}{7}b\\)')).toEqual([
      { type: 'math', source: '\\(\\frac{4\\sqrt{7}}{7}b\\)' }
    ]);

    expect(parseAnswerBlocks('LaTeX: \\frac{x^2}{16}+\\frac{y^2}{12}=1')).toEqual([
      { type: 'math', source: '\\frac{x^2}{16}+\\frac{y^2}{12}=1' }
    ]);
  });

  it('promotes standalone inline math to display math blocks', () => {
    expect(parseAnswerBlocks(['题给距离为：', '\\(\\frac{4\\sqrt{7}}{7}b\\)'].join('\n'))).toEqual([
      { type: 'paragraph', text: '题给距离为：' },
      { type: 'math', source: '\\(\\frac{4\\sqrt{7}}{7}b\\)' }
    ]);
  });

  it('removes redundant flat formula lines before rendered LaTeX', () => {
    expect(
      parseAnswerBlocks(
        [
          '所以椭圆方程为：',
          '',
          'x²/16 + y²/12 = 1',
          '',
          '补充 LaTeX:',
          '\\[',
          '\\frac{x^2}{16}+\\frac{y^2}{12}=1',
          '\\]'
        ].join('\n')
      )
    ).toEqual([
      { type: 'paragraph', text: '所以椭圆方程为：' },
      { type: 'math', source: '\\frac{x^2}{16}+\\frac{y^2}{12}=1' }
    ]);
  });

  it('keeps the explanation prefix when stripping a duplicated trailing formula', () => {
    expect(
      parseAnswerBlocks(['所以椭圆方程为：x²/16 + y²/12 = 1', '\\[', '\\frac{x^2}{16}+\\frac{y^2}{12}=1', '\\]'].join('\n'))
    ).toEqual([
      { type: 'paragraph', text: '所以椭圆方程为：' },
      { type: 'math', source: '\\frac{x^2}{16}+\\frac{y^2}{12}=1' }
    ]);
  });

  it('promotes flat formulas to display math blocks', () => {
    const result = parseAnswerBlocks('x²/4 + y² = 1');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('math');
  });

  it('promotes flat formula lines with √ to display math', () => {
    const result = parseAnswerBlocks('S = √3');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('math');
    expect((result[0] as { type: 'math'; source: string }).source).toContain('\\sqrt');
  });
});

describe('flatFormulaToLatex', () => {
  it('converts Unicode superscripts to LaTeX', () => {
    const result = flatFormulaToLatex('x² + y²');
    expect(result).toBeDefined();
    expect(result).toContain('^{2}');
  });

  it('converts Unicode subscripts to LaTeX', () => {
    const result = flatFormulaToLatex('a₁ + a₂');
    expect(result).toBeDefined();
    expect(result).toContain('_{1}');
    expect(result).toContain('_{2}');
  });

  it('converts √ to \\sqrt', () => {
    const result = flatFormulaToLatex('√3');
    expect(result).toBeDefined();
    expect(result).toContain('\\sqrt{3}');
  });

  it('converts √(...) to \\sqrt{...}', () => {
    const result = flatFormulaToLatex('√(ab)');
    expect(result).toBeDefined();
    expect(result).toContain('\\sqrt{ab}');
  });

  it('converts slash fractions A/B to \\frac{A}{B}', () => {
    const result = flatFormulaToLatex('x²/4 + y²/1');
    expect(result).toBeDefined();
    expect(result).toContain('\\frac');
  });

  it('converts special operators', () => {
    expect(flatFormulaToLatex('a × b')).toContain('\\times');
    expect(flatFormulaToLatex('a ÷ b')).toContain('\\div');
    expect(flatFormulaToLatex('a ≤ b')).toContain('\\leq');
    expect(flatFormulaToLatex('a ≥ b')).toContain('\\geq');
    expect(flatFormulaToLatex('a ≠ b')).toContain('\\neq');
    expect(flatFormulaToLatex('a ≈ b')).toContain('\\approx');
    expect(flatFormulaToLatex('x ∈ R')).toContain('\\in');
    expect(flatFormulaToLatex('△ABC')).toContain('\\triangle');
  });

  it('returns undefined for plain text', () => {
    expect(flatFormulaToLatex('这是一段普通文字')).toBeUndefined();
  });

  it('returns undefined for already-delimited LaTeX', () => {
    expect(flatFormulaToLatex('\\(x^2\\)')).toBeUndefined();
    expect(flatFormulaToLatex('$x^2$')).toBeUndefined();
  });

  it('returns undefined for raw LaTeX source', () => {
    expect(flatFormulaToLatex('\\frac{x^2}{4}')).toBeUndefined();
  });
});

describe('tryPromoteFlatFormula', () => {
  it('promotes standalone flat formula lines', () => {
    expect(tryPromoteFlatFormula('x²/4 + y² = 1')).toBeDefined();
    expect(tryPromoteFlatFormula('S = √3')).toBeDefined();
  });

  it('rejects non-formula lines', () => {
    expect(tryPromoteFlatFormula('这是一段普通中文文本没有公式。')).toBeUndefined();
    expect(tryPromoteFlatFormula('Hello world')).toBeUndefined();
  });

  it('rejects lines with too much Chinese text', () => {
    expect(tryPromoteFlatFormula('所以根据以上分析可以得出结论如下所示')).toBeUndefined();
  });
});
