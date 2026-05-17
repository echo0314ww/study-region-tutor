import { Fragment, useMemo } from 'react';
import katex from 'katex';
import { cleanLatexSource, flatFormulaToLatex, latexToReadable, parseAnswerBlocks } from './answerFormat';
import type { AnswerBlock } from './answerFormat';
import 'katex/dist/katex.min.css';

interface AnswerRendererProps {
  text: string;
}

function inlineParts(text: string): Array<{ type: 'text' | 'math'; text: string }> {
  const pattern = /(\\\(.+?\\\)|\$[^$\n]+\$)/g;
  const parts: Array<{ type: 'text' | 'math'; text: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    parts.push({ type: 'math', text: match[0] });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', text: text.slice(lastIndex) });
  }

  // Second pass: try to convert flat formula segments in text parts
  const enriched: Array<{ type: 'text' | 'math'; text: string }> = [];

  for (const part of parts) {
    if (part.type === 'math') {
      enriched.push(part);
      continue;
    }

    // Try to find flat formula segments inside text
    // Match segments that look like formulas: contain math operators/Unicode scripts
    // with variables/numbers around them
    const flatPattern =
      /(?:[A-Za-z0-9_]+(?:[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎]+)?(?:\s*[+\-=<>×÷≤≥≠≈∈·±/]\s*)?)+(?:[A-Za-z0-9_]+(?:[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎]+)?)+|√[A-Za-z0-9(][^，。；\s]*/g;
    let flatMatch: RegExpExecArray | null;
    let flatLastIndex = 0;
    let hasConversions = false;
    const subParts: Array<{ type: 'text' | 'math'; text: string }> = [];

    while ((flatMatch = flatPattern.exec(part.text))) {
      const converted = flatFormulaToLatex(flatMatch[0]);

      if (!converted) {
        continue;
      }

      hasConversions = true;

      if (flatMatch.index > flatLastIndex) {
        subParts.push({ type: 'text', text: part.text.slice(flatLastIndex, flatMatch.index) });
      }

      subParts.push({ type: 'math', text: converted });
      flatLastIndex = flatPattern.lastIndex;
    }

    if (!hasConversions) {
      enriched.push(part);
    } else {
      if (flatLastIndex < part.text.length) {
        subParts.push({ type: 'text', text: part.text.slice(flatLastIndex) });
      }

      enriched.push(...subParts);
    }
  }

  return enriched;
}

function renderInline(text: string): JSX.Element[] {
  return inlineParts(text).map((part, index) => {
    if (part.type === 'math') {
      return <InlineMath source={part.text} key={`${part.type}-${index}`} />;
    }

    return <Fragment key={`${part.type}-${index}`}>{part.text}</Fragment>;
  });
}

function renderKatex(source: string, displayMode: boolean): string | undefined {
  try {
    const rendered = katex.renderToString(cleanLatexSource(source), {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false
    });

    return sanitizeKatexHtml(rendered);
  } catch {
    return undefined;
  }
}

function sanitizeKatexHtml(html: string): string {
  return html
    .replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
}

function mathTitle(source: string): string {
  return /(?:javascript|vbscript|data)\s*:/i.test(source) ? 'formula' : source;
}

function InlineMath({ source }: { source: string }): JSX.Element {
  const cleanSource = cleanLatexSource(source);
  const rendered = renderKatex(cleanSource, false);

  if (rendered) {
    return (
      <span
        className="inline-math-rendered"
        role="math"
        aria-label={mathTitle(cleanSource)}
        dangerouslySetInnerHTML={{ __html: rendered }}
        title={mathTitle(cleanSource)}
      />
    );
  }

  const readable = latexToReadable(cleanSource);

  return (
    <span className="inline-math" title={mathTitle(cleanSource)}>
      {readable || cleanSource}
    </span>
  );
}

function renderMathBlock(block: Extract<AnswerBlock, { type: 'math' }>, index: number): JSX.Element {
  const source = cleanLatexSource(block.source);
  const readable = latexToReadable(source);
  const rendered = renderKatex(source, true);

  return (
    <figure className="math-block" key={`math-${index}`}>
      {rendered ? (
        <div className="math-rendered" role="math" aria-label={mathTitle(source)} dangerouslySetInnerHTML={{ __html: rendered }} title={mathTitle(source)} />
      ) : (
        <div className="math-fallback">
          <div className="math-readable primary">{readable || source}</div>
        </div>
      )}
    </figure>
  );
}

function renderBlock(block: AnswerBlock, index: number): JSX.Element {
  if (block.type === 'heading') {
    const Heading = `h${Math.min(Math.max(block.level + 1, 2), 5)}` as keyof JSX.IntrinsicElements;

    return (
      <Heading className="answer-heading" key={`heading-${index}`}>
        {renderInline(block.text)}
      </Heading>
    );
  }

  if (block.type === 'paragraph') {
    return (
      <p className="answer-paragraph" key={`paragraph-${index}`}>
        {renderInline(block.text)}
      </p>
    );
  }

  if (block.type === 'list') {
    const List = block.ordered ? 'ol' : 'ul';

    return (
      <List className="answer-list" key={`list-${index}`}>
        {block.items.map((item, itemIndex) => (
          <li key={`item-${itemIndex}`}>{renderInline(item)}</li>
        ))}
      </List>
    );
  }

  if (block.type === 'math') {
    return renderMathBlock(block, index);
  }

  return (
    <pre className="answer-code" key={`code-${index}`}>
      {block.text}
    </pre>
  );
}

export function AnswerRenderer({ text }: AnswerRendererProps): JSX.Element {
  const blocks = useMemo(() => parseAnswerBlocks(text), [text]);

  return <div className="answer-renderer">{blocks.map(renderBlock)}</div>;
}
