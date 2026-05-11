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
    .replace(/^\\\(/, '')
    .replace(/\\\)$/, '')
    .replace(/^\\\[/, '')
    .replace(/\\\]$/, '')
    .replace(/^\$(?!\$)/, '')
    .replace(/(?<!\$)\$$/, '')
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

function normalizeLabelText(text: string): string {
  return text.replace(/[*_`]/g, '').trim();
}

function isLatexLabel(line: string): boolean {
  return /^(?:补充\s*)?latex\s*[:：]\s*$/i.test(normalizeLabelText(line));
}

function labeledMathSource(line: string): string | undefined {
  const match = normalizeLabelText(line).match(/^(?:补充\s*)?latex\s*[:：]\s*(.+)$/i);
  const source = match?.[1]?.trim();

  if (!source) {
    return undefined;
  }

  return /^(?:\\\(|\\\[|\$\$|\$)/.test(source) || looksLikeLatexSource(source) ? source : undefined;
}

function isMathStart(line: string): boolean {
  const trimmed = line.trim();

  return trimmed === '\\[' || trimmed.startsWith('\\[') || trimmed === '$$' || trimmed.startsWith('$$');
}

function stripDisplayMathLine(line: string, opening: '$$' | '\\[', closing: '$$' | '\\]'): string {
  let content = line.trim();

  if (content.startsWith(opening)) {
    content = content.slice(opening.length);
  }

  if (content.endsWith(closing)) {
    content = content.slice(0, -closing.length);
  }

  return content.trim();
}

function parseDisplayMathAt(lines: string[], startIndex: number): { source: string; endIndex: number } | undefined {
  const trimmed = lines[startIndex]?.trim() || '';

  if (!isMathStart(trimmed)) {
    return undefined;
  }

  const opening = trimmed.startsWith('$$') ? '$$' : '\\[';
  const closing = opening === '$$' ? '$$' : '\\]';
  const math: string[] = [];
  const firstLine = stripDisplayMathLine(trimmed, opening, closing);
  const isClosedOnFirstLine = trimmed !== opening && trimmed.endsWith(closing);
  let endIndex = startIndex;

  if (firstLine) {
    math.push(firstLine);
  }

  if (!isClosedOnFirstLine) {
    while (endIndex < lines.length - 1) {
      endIndex += 1;

      const currentLine = lines[endIndex];
      const mathLine = stripDisplayMathLine(currentLine, opening, closing);

      if (mathLine) {
        math.push(mathLine);
      }

      if (currentLine.trim().endsWith(closing)) {
        break;
      }
    }
  }

  return { source: math.join('\n'), endIndex };
}

function standaloneInlineMathSource(line: string): string | undefined {
  const trimmed = line.trim();

  if (/^\\\(.+\\\)$/.test(trimmed) || /^\$[^$\n]+\$$/.test(trimmed)) {
    return trimmed;
  }

  return undefined;
}

function looksLikeLatexSource(source: string): boolean {
  const cleanSource = cleanLatexSource(source);

  return (
    /\\(?:frac|sqrt|boxed|left|right|cdot|times|div|sum|int|lim|triangle|angle|overline|begin|end)\b/.test(
      cleanSource
    ) ||
    (/[=+\-*/^_{}]/.test(cleanSource) && /\\[A-Za-z]+/.test(cleanSource))
  );
}

function standaloneLatexSource(line: string): string | undefined {
  const trimmed = line.trim();

  // Lines containing inline math delimiters \(...\) are paragraphs with
  // embedded math, not standalone LaTeX expressions
  if (/\\\(|\\\)/.test(trimmed)) {
    return undefined;
  }

  // Lines with substantial natural language (Chinese) content are paragraphs
  if ((trimmed.match(/[一-鿿]/g) || []).length > 2) {
    return undefined;
  }

  // Lines with $...$ inline math surrounded by text are paragraphs
  if (/\$[^$]+\$/.test(trimmed)) {
    const stripped = trimmed.replace(/\$[^$]+\$/g, '').trim();

    if (stripped.length > 0 && /[一-鿿,，.。;；:：!！?？]/.test(stripped)) {
      return undefined;
    }
  }

  return looksLikeLatexSource(trimmed) ? trimmed : undefined;
}

function nextMathCandidateSource(lines: string[], startIndex: number): string | undefined {
  for (let index = startIndex; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();

    if (!trimmed) {
      continue;
    }

    const labeledSource = labeledMathSource(trimmed);

    if (labeledSource) {
      return labeledSource;
    }

    if (isLatexLabel(trimmed)) {
      continue;
    }

    return (
      parseDisplayMathAt(lines, index)?.source || standaloneInlineMathSource(trimmed) || standaloneLatexSource(trimmed)
    );
  }

  return undefined;
}

function normalizeFormulaForCompare(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/[，。；;、]/g, '')
    .replace(/\s+/g, '')
    .replace(/\^/g, '')
    .replace(/\\,/g, '')
    .replace(/·/g, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .trim();
}

function comparableFormulaText(text: string): string {
  const normalized = normalizeLabelText(text);

  return looksLikeLatexSource(normalized) || standaloneInlineMathSource(normalized)
    ? latexToReadable(normalized)
    : normalized;
}

function formulaComparableToSource(text: string, source: string): boolean {
  const left = normalizeFormulaForCompare(comparableFormulaText(text));
  const right = normalizeFormulaForCompare(latexToReadable(source));

  return left.length > 3 && left === right;
}

function isLikelyFormulaText(line: string): boolean {
  const text = normalizeLabelText(line);

  if (!text || /[。！？!?]$/.test(text)) {
    return false;
  }

  if (looksLikeLatexSource(text) || standaloneInlineMathSource(text)) {
    return true;
  }

  const hasMathOperator = /[=<>≤≥≠≈+\-*/×÷√^_]|[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/.test(text);
  const hasMathSubject = /[A-Za-z0-9]|[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(text);

  return hasMathOperator && hasMathSubject;
}

function isRedundantFormulaLine(line: string, nextMathSource: string | undefined): boolean {
  return Boolean(nextMathSource && isLikelyFormulaText(line) && formulaComparableToSource(line, nextMathSource));
}

// ---------------------------------------------------------------------------
// Flat formula → LaTeX conversion
// ---------------------------------------------------------------------------

const UNICODE_SUPERSCRIPT_MAP: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3',
  '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7',
  '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-',
  '⁼': '=', '⁽': '(', '⁾': ')'
};

const UNICODE_SUBSCRIPT_MAP: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3',
  '₄': '4', '₅': '5', '₆': '6', '₇': '7',
  '₈': '8', '₉': '9', '₊': '+', '₋': '-',
  '₌': '=', '₍': '(', '₎': ')'
};

function isSuperscriptChar(char: string): boolean {
  return char in UNICODE_SUPERSCRIPT_MAP;
}

function isSubscriptChar(char: string): boolean {
  return char in UNICODE_SUBSCRIPT_MAP;
}

function collectScript(text: string, start: number, testFn: (c: string) => boolean, map: Record<string, string>): { value: string; end: number } {
  let end = start;

  while (end < text.length && testFn(text[end])) {
    end += 1;
  }

  const mapped = Array.from(text.slice(start, end)).map((c) => map[c] || c).join('');

  return { value: mapped, end };
}

function tokenizeFlatFormula(text: string): string {
  let result = '';
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    // Unicode superscripts → ^{...}
    if (isSuperscriptChar(char)) {
      const { value, end } = collectScript(text, i, isSuperscriptChar, UNICODE_SUPERSCRIPT_MAP);
      result += `^{${value}}`;
      i = end;
      continue;
    }

    // Unicode subscripts → _{...}
    if (isSubscriptChar(char)) {
      const { value, end } = collectScript(text, i, isSubscriptChar, UNICODE_SUBSCRIPT_MAP);
      result += `_{${value}}`;
      i = end;
      continue;
    }

    // √ followed by content
    if (char === '√') {
      i += 1;
      // √(...)
      if (i < text.length && text[i] === '(') {
        let depth = 1;
        let j = i + 1;

        while (j < text.length && depth > 0) {
          if (text[j] === '(') {
            depth += 1;
          }

          if (text[j] === ')') {
            depth -= 1;
          }

          j += 1;
        }

        const inner = text.slice(i + 1, j - 1);
        result += `\\sqrt{${tokenizeFlatFormula(inner)}}`;
        i = j;
        continue;
      }

      // √ followed by a single digit/letter or a multi-char token
      let sqrtContent = '';
      const sqrtStart = i;

      while (i < text.length && /[A-Za-z0-9]/.test(text[i])) {
        sqrtContent += text[i];
        i += 1;
      }

      if (!sqrtContent) {
        result += '\\sqrt{}';
      } else {
        result += `\\sqrt{${sqrtContent}}`;
      }

      // If we only got 0 or 1 extra chars, check if there's nothing useful
      if (sqrtContent.length === 0 && i === sqrtStart) {
        result += '\\sqrt{}';
      }

      continue;
    }

    // × → \times
    if (char === '×') {
      result += '\\times ';
      i += 1;
      continue;
    }

    // ÷ → \div
    if (char === '÷') {
      result += '\\div ';
      i += 1;
      continue;
    }

    // ≤ → \leq
    if (char === '≤') {
      result += '\\leq ';
      i += 1;
      continue;
    }

    // ≥ → \geq
    if (char === '≥') {
      result += '\\geq ';
      i += 1;
      continue;
    }

    // ≠ → \neq
    if (char === '≠') {
      result += '\\neq ';
      i += 1;
      continue;
    }

    // ≈ → \approx
    if (char === '≈') {
      result += '\\approx ';
      i += 1;
      continue;
    }

    // ∈ → \in
    if (char === '∈') {
      result += '\\in ';
      i += 1;
      continue;
    }

    // · → \cdot
    if (char === '·') {
      result += '\\cdot ';
      i += 1;
      continue;
    }

    // ± → \pm
    if (char === '±') {
      result += '\\pm ';
      i += 1;
      continue;
    }

    // ∞ → \infty
    if (char === '∞') {
      result += '\\infty ';
      i += 1;
      continue;
    }

    // △ → \triangle
    if (char === '△') {
      result += '\\triangle ';
      i += 1;
      continue;
    }

    result += char;
    i += 1;
  }

  return result;
}

function convertSlashFractions(latex: string): string {
  // Convert patterns like A/B where A and B are simple tokens or groups
  // We need to be careful: only convert simple fraction patterns, not arbitrary slashes
  // Pattern: (single-token-or-group)/(single-token-or-group)
  // Single token: a letter, a digit sequence, or a braced group, or a \command{...}

  return latex.replace(
    /(?:(?:\\[a-zA-Z]+\{[^{}]*\})|(?:\{[^{}]+\})|(?:[A-Za-z](?:\^{[^{}]+}|_{[^{}]+})*)|(?:[0-9]+(?:\.[0-9]+)?))\/(?:(?:\\[a-zA-Z]+\{[^{}]*\})|(?:\{[^{}]+\})|(?:[A-Za-z](?:\^{[^{}]+}|_{[^{}]+})*)|(?:[0-9]+(?:\.[0-9]+)?))/g,
    (match) => {
      const slashIndex = findTopLevelSlash(match);

      if (slashIndex < 0) {
        return match;
      }

      const numerator = match.slice(0, slashIndex);
      const denominator = match.slice(slashIndex + 1);

      return `\\frac{${numerator}}{${denominator}}`;
    }
  );
}

function findTopLevelSlash(text: string): number {
  let depth = 0;

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '{') {
      depth += 1;
    }

    if (text[i] === '}') {
      depth -= 1;
    }

    if (text[i] === '/' && depth === 0) {
      return i;
    }
  }

  return -1;
}

export function flatFormulaToLatex(text: string): string | undefined {
  const trimmed = text.trim();

  if (!trimmed) {
    return undefined;
  }

  // Already has LaTeX delimiters — skip
  if (/^(?:\\\(|\\\[|\$\$|\$)/.test(trimmed)) {
    return undefined;
  }

  // Already looks like raw LaTeX source — skip
  if (looksLikeLatexSource(trimmed)) {
    return undefined;
  }

  // Must contain at least one "flat formula" indicator
  const hasSuperscript = /[⁰¹²³⁴-⁹⁺-⁾]/.test(trimmed);
  const hasSubscript = /[₀-₉₊-₎]/.test(trimmed);
  const hasSqrt = trimmed.includes('√');
  const hasSlashFraction = /[A-Za-z0-9)}²³]\/[A-Za-z0-9({]/.test(trimmed);
  const hasSpecialOp = /[×÷≤≥≠≈∈△]/.test(trimmed);

  if (!hasSuperscript && !hasSubscript && !hasSqrt && !hasSlashFraction && !hasSpecialOp) {
    return undefined;
  }

  // Too much natural language — probably not a pure formula
  const chineseCount = (trimmed.match(/[一-鿿]/g) || []).length;

  if (chineseCount > 4) {
    return undefined;
  }

  let latex = tokenizeFlatFormula(trimmed);

  latex = convertSlashFractions(latex);

  return latex || undefined;
}

/**
 * Checks whether a line of text is a standalone flat formula that should be
 * promoted to a display math block. Returns the converted LaTeX source, or
 * undefined if the line is not a suitable flat formula.
 */
export function tryPromoteFlatFormula(line: string): string | undefined {
  const trimmed = normalizeLabelText(line);

  if (!trimmed) {
    return undefined;
  }

  // Must look like a formula overall (operators + math subjects, no trailing punctuation)
  if (!isLikelyFormulaText(trimmed)) {
    return undefined;
  }

  return flatFormulaToLatex(trimmed);
}

function stripTrailingRedundantFormula(line: string, nextMathSource: string | undefined): string | undefined {
  if (!nextMathSource || !/[：:]/.test(line)) {
    return undefined;
  }

  const match = line.match(/^(.*[：:])\s*(.+)$/);

  if (!match) {
    return undefined;
  }

  return formulaComparableToSource(match[2], nextMathSource) ? match[1].trim() : undefined;
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

    const labeledSource = labeledMathSource(trimmed);

    if (labeledSource) {
      flushParagraph(blocks, paragraph);
      flushList(blocks, listItems, listOrdered);
      blocks.push({ type: 'math', source: labeledSource });
      continue;
    }

    if (isLatexLabel(trimmed) && nextMathCandidateSource(lines, index + 1)) {
      flushParagraph(blocks, paragraph);
      flushList(blocks, listItems, listOrdered);
      continue;
    }

    const inlineMathSource = standaloneInlineMathSource(trimmed);

    if (inlineMathSource) {
      flushParagraph(blocks, paragraph);
      flushList(blocks, listItems, listOrdered);
      blocks.push({ type: 'math', source: inlineMathSource });
      continue;
    }

    const displayMath = parseDisplayMathAt(lines, index);

    if (displayMath) {
      flushParagraph(blocks, paragraph);
      flushList(blocks, listItems, listOrdered);
      blocks.push({ type: 'math', source: displayMath.source });
      index = displayMath.endIndex;
      continue;
    }

    const standaloneSource = standaloneLatexSource(trimmed);

    if (standaloneSource) {
      flushParagraph(blocks, paragraph);
      flushList(blocks, listItems, listOrdered);
      blocks.push({ type: 'math', source: standaloneSource });
      continue;
    }

    const nextMathSource = nextMathCandidateSource(lines, index + 1);
    const textWithoutTrailingDuplicate = stripTrailingRedundantFormula(trimmed, nextMathSource);

    if (textWithoutTrailingDuplicate) {
      flushList(blocks, listItems, listOrdered);
      paragraph.push(textWithoutTrailingDuplicate);
      continue;
    }

    if (isRedundantFormulaLine(trimmed, nextMathSource)) {
      continue;
    }

    // Flat formula promotion: e.g. "x²/4 + y² = 1" → KaTeX display math
    // Placed after redundancy checks so duplicate flat formulas are still removed
    const promotedFlatFormula = tryPromoteFlatFormula(trimmed);

    if (promotedFlatFormula) {
      flushParagraph(blocks, paragraph);
      flushList(blocks, listItems, listOrdered);
      blocks.push({ type: 'math', source: promotedFlatFormula });
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
