import { Fragment, useMemo } from 'react';
import { cleanLatexSource, latexToReadable, parseAnswerBlocks } from './answerFormat';
import type { AnswerBlock } from './answerFormat';

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

  return parts;
}

function renderInline(text: string): JSX.Element[] {
  return inlineParts(text).map((part, index) => {
    if (part.type === 'math') {
      return (
        <span className="inline-math" key={`${part.type}-${index}`}>
          {latexToReadable(part.text)}
        </span>
      );
    }

    return <Fragment key={`${part.type}-${index}`}>{part.text}</Fragment>;
  });
}

function renderMathBlock(block: Extract<AnswerBlock, { type: 'math' }>, index: number): JSX.Element {
  const source = cleanLatexSource(block.source);
  const readable = latexToReadable(source);
  const showSource = source !== readable && /\\|[_^{}]/.test(source);

  return (
    <figure className="math-block" key={`math-${index}`}>
      <div className="math-readable">{readable}</div>
      {showSource && <code className="math-source">LaTeX: {source}</code>}
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
