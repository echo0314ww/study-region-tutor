export type AnswerBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'math'; source: string }
  | { type: 'code'; text: string };

const SUPERSCRIPTS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾'
};

const SUBSCRIPTS: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎'
};

const COMMAND_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\left/g, ''],
  [/\\right/g, ''],
  [/\\cdot/g, '·'],
  [/\\times/g, '×'],
  [/\\div/g, '÷'],
  [/\\pm/g, '±'],
  [/\\mp/g, '∓'],
  [/\\leq?/g, '≤'],
  [/\\geq?/g, '≥'],
  [/\\neq/g, '≠'],
  [/\\approx/g, '≈'],
  [/\\infty/g, '∞'],
  [/\\in/g, '∈'],
  [/\\notin/g, '∉'],
  [/\\sqrt\s*([A-Za-z0-9])/g, '√$1'],
  [/\\alpha/g, 'α'],
  [/\\beta/g, 'β'],
  [/\\gamma/g, 'γ'],
  [/\\delta/g, 'δ'],
  [/\\theta/g, 'θ'],
  [/\\lambda/g, 'λ'],
  [/\\mu/g, 'μ'],
  [/\\pi/g, 'π'],
  [/\\sigma/g, 'σ'],
  [/\\omega/g, 'ω'],
  [/\\displaystyle/g, ''],
  [/\\,/g, ' '],
  [/\\;/g, ' '],
  [/\\!/g, ''],
  [/\\quad/g, ' '],
  [/\\qquad/g, ' ']
];

function readBraced(input: string, openIndex: number): { value: string; end: number } | undefined {
  if (input[openIndex] !== '{') {
    return undefined;
  }

  let depth = 0;

  for (let index = openIndex; index < input.length; index += 1) {
    const char = input[index];

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return {
          value: input.slice(openIndex + 1, index),
          end: index + 1
        };
      }
    }
  }

  return undefined;
}

function skipSpaces(input: string, index: number): number {
  let cursor = index;

  while (cursor < input.length && /\s/.test(input[cursor])) {
    cursor += 1;
  }

  return cursor;
}

function readLatexArgument(input: string, startIndex: number): { value: string; end: number } | undefined {
  const cursor = skipSpaces(input, startIndex);

  if (input[cursor] === '{') {
    return readBraced(input, cursor);
  }

  if (cursor < input.length) {
    return {
      value: input[cursor],
      end: cursor + 1
    };
  }

  return undefined;
}

function wrapFractionPart(value: string): string {
  if (!value) {
    return value;
  }

  return /[+\-=,\s]/.test(value) ? `(${value})` : value;
}

function replaceTwoArgCommand(
  input: string,
  command: string,
  replacer: (first: string, second: string) => string
): string {
  let output = '';
  let cursor = 0;

  while (cursor < input.length) {
    const commandIndex = input.indexOf(command, cursor);

    if (commandIndex < 0) {
      output += input.slice(cursor);
      break;
    }

    output += input.slice(cursor, commandIndex);

    const first = readLatexArgument(input, commandIndex + command.length);
    const second = first ? readLatexArgument(input, first.end) : undefined;

    if (!first || !second) {
      output += command;
      cursor = commandIndex + command.length;
      continue;
    }

    output += replacer(latexToReadable(first.value), latexToReadable(second.value));
    cursor = second.end;
  }

  return output;
}

function replaceOneArgCommand(input: string, command: string, replacer: (value: string) => string): string {
  let output = '';
  let cursor = 0;

  while (cursor < input.length) {
    const commandIndex = input.indexOf(command, cursor);

    if (commandIndex < 0) {
      output += input.slice(cursor);
      break;
    }

    output += input.slice(cursor, commandIndex);

    const argument = readLatexArgument(input, commandIndex + command.length);

    if (!argument) {
      output += command;
      cursor = commandIndex + command.length;
      continue;
    }

    output += replacer(latexToReadable(argument.value));
    cursor = argument.end;
  }

  return output;
}

function toScript(value: string, table: Record<string, string>, fallbackPrefix: string): string {
  const converted = value
    .split('')
    .map((char) => table[char])
    .join('');

  return converted.length === value.length && converted ? converted : `${fallbackPrefix}(${value})`;
}

function replaceScripts(input: string): string {
  return input
    .replace(/\^\{([^{}]+)\}/g, (_match, value: string) => toScript(value, SUPERSCRIPTS, '^'))
    .replace(/_\{([^{}]+)\}/g, (_match, value: string) => toScript(value, SUBSCRIPTS, '_'))
    .replace(/\^([0-9+\-=()])/g, (_match, value: string) => toScript(value, SUPERSCRIPTS, '^'))
    .replace(/_([0-9+\-=()])/g, (_match, value: string) => toScript(value, SUBSCRIPTS, '_'));
}

export function cleanLatexSource(source: string): string {
  return source
    .trim()
    .replace(/^\\\[/, '')
    .replace(/\\\]$/, '')
    .replace(/^\$\$/, '')
    .replace(/\$\$$/, '')
    .trim();
}

export function latexToReadable(source: string): string {
  let text = cleanLatexSource(source).replace(/\r?\n/g, ' ');

  for (let pass = 0; pass < 4; pass += 1) {
    text = replaceTwoArgCommand(text, '\\frac', (numerator, denominator) => {
      return `${wrapFractionPart(numerator)}/${wrapFractionPart(denominator)}`;
    });
    text = replaceOneArgCommand(text, '\\sqrt', (value) => (/^[A-Za-z0-9]$/.test(value) ? `√${value}` : `√(${value})`));
    text = replaceOneArgCommand(text, '\\boxed', (value) => value);
  }

  for (const [pattern, replacement] of COMMAND_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  return replaceScripts(text)
    .replace(/[{}]/g, '')
    .replace(/\s*([=+×÷·≤≥≠≈∈∉])\s*/g, ' $1 ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function flushParagraph(blocks: AnswerBlock[], paragraph: string[]): void {
  if (paragraph.length === 0) {
    return;
  }

  blocks.push({ type: 'paragraph', text: paragraph.join(' ').trim() });
  paragraph.length = 0;
}

function flushList(blocks: AnswerBlock[], items: string[], ordered: boolean): void {
  if (items.length === 0) {
    return;
  }

  blocks.push({ type: 'list', ordered, items: [...items] });
  items.length = 0;
}

function parseListItem(line: string): { ordered: boolean; text: string } | undefined {
  const ordered = line.match(/^\s*(?:\d+[.)]|[（(]?[IVXivx]+[）).])\s*(.+)$/);

  if (ordered) {
    return { ordered: true, text: ordered[1].trim() };
  }

  const unordered = line.match(/^\s*[-*]\s+(.+)$/);

  if (unordered) {
    return { ordered: false, text: unordered[1].trim() };
  }

  return undefined;
}

export function parseAnswerBlocks(text: string): AnswerBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: AnswerBlock[] = [];
  const paragraph: string[] = [];
  const listItems: string[] = [];
  let listOrdered = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph(blocks, paragraph);
      flushList(blocks, listItems, listOrdered);
      continue;
    }

    if (trimmed.startsWith('```')) {
      flushParagraph(blocks, paragraph);
      flushList(blocks, listItems, listOrdered);

      const code: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }

      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }

    if (trimmed === '\\[' || trimmed.startsWith('\\[') || trimmed === '$$' || trimmed.startsWith('$$')) {
      flushParagraph(blocks, paragraph);
      flushList(blocks, listItems, listOrdered);

      const closing = trimmed.startsWith('$$') ? '$$' : '\\]';
      const openingOnly = trimmed === '\\[' || trimmed === '$$';
      const firstLine = trimmed.replace(/^\\\[/, '').replace(/^\$\$/, '');
      const math: string[] = firstLine ? [firstLine] : [];

      while (index < lines.length - 1) {
        if (!openingOnly && lines[index].trim().endsWith(closing)) {
          break;
        }

        index += 1;

        if (index < lines.length) {
          math.push(lines[index]);
        }

        if (lines[index].trim().endsWith(closing)) {
          break;
        }
      }

      blocks.push({ type: 'math', source: math.join('\n') });
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);

    if (heading) {
      flushParagraph(blocks, paragraph);
      flushList(blocks, listItems, listOrdered);
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      continue;
    }

    const listItem = parseListItem(line);

    if (listItem) {
      flushParagraph(blocks, paragraph);

      if (listItems.length > 0 && listOrdered !== listItem.ordered) {
        flushList(blocks, listItems, listOrdered);
      }

      listOrdered = listItem.ordered;
      listItems.push(listItem.text);
      continue;
    }

    flushList(blocks, listItems, listOrdered);
    paragraph.push(trimmed);
  }

  flushParagraph(blocks, paragraph);
  flushList(blocks, listItems, listOrdered);

  return blocks;
}
