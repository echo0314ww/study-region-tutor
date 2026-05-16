import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnswerRenderer } from '../src/renderer/src/AnswerRenderer';

describe('AnswerRenderer', () => {
  it('renders plain HTML-looking answer text as escaped text', () => {
    const html = renderToStaticMarkup(
      createElement(AnswerRenderer, {
        text: '请看 <img src=x onerror=alert(1)> 和 <script>alert(1)</script>'
      })
    );

    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
  });

  it('does not trust javascript links emitted through KaTeX input', () => {
    const html = renderToStaticMarkup(
      createElement(AnswerRenderer, {
        text: String.raw`$\href{javascript:alert(1)}{bad}$`
      })
    );

    expect(html).not.toContain('javascript:alert');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('<annotation');
  });
});
