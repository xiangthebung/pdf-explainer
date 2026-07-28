/**
 * Markdown + LaTeX preparation.
 *
 * Model output is *almost* Markdown. It arrives with JSON-escaped backslashes,
 * `\[ ... \]` math, bare `\frac{}{}` outside any math delimiter, and dollar
 * signs that mean currency rather than maths. Rendering that directly makes
 * KaTeX throw or, worse, silently eat half a paragraph.
 *
 * The pipeline below is placeholder-based: code fences, inline code and maths
 * are lifted out first so no repair rule can ever reach inside them. Everything
 * is a pure string transform, which makes it cheap to test.
 */

const PLACEHOLDER_OPEN = '\uE000';
const PLACEHOLDER_CLOSE = '\uE001';

interface Vault {
  items: string[];
}

function stash(vault: Vault, value: string): string {
  vault.items.push(value);
  return `${PLACEHOLDER_OPEN}${vault.items.length - 1}${PLACEHOLDER_CLOSE}`;
}

function restore(text: string, vault: Vault): string {
  const pattern = new RegExp(`${PLACEHOLDER_OPEN}(\\d+)${PLACEHOLDER_CLOSE}`, 'g');
  let output = text;
  // A stashed span can itself contain a placeholder (inline code inside maths),
  // so expand until stable.
  for (let pass = 0; pass < 3 && pattern.test(output); pass += 1) {
    pattern.lastIndex = 0;
    output = output.replace(pattern, (match, index: string) => vault.items[Number(index)] ?? match);
  }
  return output;
}

/** LaTeX command names are ASCII letters, optionally followed by `*`. */
const OVER_ESCAPED_COMMAND = /\\{2,}(?=[a-zA-Z]{2,})/g;

/**
 * `\\frac` -> `\frac`. Only collapses when a command name follows, so genuine
 * `\\` row breaks inside `pmatrix`/`aligned` survive untouched.
 */
export function collapseEscapedCommands(math: string): string {
  return math.replace(OVER_ESCAPED_COMMAND, '\\');
}

/**
 * LaTeX commands that begin with `n`. Without this list, unescaping a literal
 * `\n` would quietly destroy `\nabla` and friends.
 */
const N_COMMANDS = new Set([
  'nabla',
  'ne',
  'neq',
  'nearrow',
  'newline',
  'nexists',
  'ncong',
  'ngeq',
  'ni',
  'nleftarrow',
  'nleq',
  'nmid',
  'nolimits',
  'nonumber',
  'normalsize',
  'not',
  'notin',
  'nparallel',
  'nrightarrow',
  'nsim',
  'nsubseteq',
  'nsupseteq',
  'nu',
  'nwarrow',
]);

/** Turn JSON escape leftovers (`\n`, `\t`) into real whitespace. */
function unescapeLiterals(input: string): string {
  return input
    .replace(/\\n([a-zA-Z]*)/g, (match, tail: string) => {
      const word = `n${tail}`;
      for (let length = word.length; length >= 2; length -= 1) {
        if (N_COMMANDS.has(word.slice(0, length))) return match;
      }
      return `\n${tail}`;
    })
    .replace(/\\t(?![a-zA-Z])/g, '\t');
}

/** Pull ``` fenced blocks (and ~~~ variants) out of harm's way. */
function vaultFences(text: string, vault: Vault): string {
  return text.replace(/(^|\n)([ \t]*)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)(?:\n[ \t]*\3[ \t]*(?=\n|$)|$)/g, (match, lead: string) => {
    const body = match.slice(lead.length);
    return `${lead}${stash(vault, body)}`;
  });
}

/** Pull `inline code` spans out of harm's way. */
function vaultInlineCode(text: string, vault: Vault): string {
  return text.replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (match) => stash(vault, match));
}

/** Normalise `\[..\]` / `\(..\)` (and their over-escaped twins) to `$$`/`$`. */
function normaliseMathDelimiters(text: string): string {
  return text
    .replace(/\\{1,2}\[([\s\S]*?)\\{1,2}\]/g, (_match, body: string) => `\n\n$$\n${String(body).trim()}\n$$\n\n`)
    .replace(/\\{1,2}\(([\s\S]*?)\\{1,2}\)/g, (_match, body: string) => `$${String(body).trim()}$`);
}

/**
 * Wrap a bare `\begin{env} ... \end{env}` that sits outside any math delimiter.
 * Without this KaTeX never sees it and the reader gets raw LaTeX source.
 */
function wrapBareEnvironments(text: string): string {
  return text.replace(
    /\\begin\{(align|aligned|alignat|array|bmatrix|pmatrix|vmatrix|Vmatrix|Bmatrix|matrix|cases|gather|gathered|split|equation)\*?\}[\s\S]*?\\end\{\1\*?\}/g,
    (match) => `\n\n$$\n${match}\n$$\n\n`,
  );
}

/**
 * Wrap a stray LaTeX macro run in inline math. Deliberately conservative: it
 * only grows the run across brace groups, sub/superscripts and adjacent
 * non-space maths tokens, so surrounding prose is never swallowed.
 */
function wrapStrayMacros(text: string): string {
  const macro = /\\[a-zA-Z]{2,}\*?/g;
  let result = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = macro.exec(text)) !== null) {
    const start = match.index;
    if (start < cursor) continue;

    let end = macro.lastIndex;
    // Grow across {...}, [...], _x, ^x and further macros while glued together.
    for (;;) {
      const next = text[end];
      if (next === '{' || next === '[' || next === '(') {
        const close = next === '{' ? '}' : next === '[' ? ']' : ')';
        let depth = 0;
        let i = end;
        for (; i < text.length; i += 1) {
          if (text[i] === next) depth += 1;
          else if (text[i] === close) {
            depth -= 1;
            if (depth === 0) {
              i += 1;
              break;
            }
          }
        }
        if (depth !== 0) break;
        end = i;
        continue;
      }
      if (next === '_' || next === '^') {
        end += 1;
        if (text[end] === '{') continue;
        while (end < text.length && /[A-Za-z0-9]/.test(text[end] ?? '')) end += 1;
        continue;
      }
      if (next === '\\' && /[a-zA-Z]/.test(text[end + 1] ?? '')) {
        const following = text.slice(end).match(/^\\[a-zA-Z]{2,}\*?/);
        if (following) {
          end += following[0].length;
          continue;
        }
      }
      break;
    }

    result += text.slice(cursor, start);
    result += `$${text.slice(start, end)}$`;
    cursor = end;
    macro.lastIndex = end;
  }

  return cursor === 0 ? text : result + text.slice(cursor);
}

/**
 * Escape currency so `$20 and $30` does not become an accidental formula.
 * A `$` followed by a digit only counts as maths when a closing `$` appears on
 * the same line and the enclosed text looks like an expression.
 */
function escapeCurrency(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line.replace(/(?<![\\$])\$(?=\d)/g, (match, offset: number) => {
        const rest = line.slice(offset + 1);
        const closing = rest.indexOf('$');
        // No partner on this line: it can only be money.
        if (closing === -1) return '\\$';

        const inner = rest.slice(0, closing);
        const afterClosing = rest[closing + 1] ?? '';
        // Structure means maths: a command, a script, a brace, a comparison.
        if (/[\\^_{}=<>]/.test(inner)) return match;
        // A closing delimiter never follows a space and then hugs the next token.
        // "$20 and $30" and "$12 receiver tracking $f_{L1}$" are both money.
        if (/\s$/.test(inner) && afterClosing !== '' && !/\s/.test(afterClosing)) return '\\$';
        // Everything below guards against a distant, unrelated `$` being mistaken
        // for a closing delimiter — the failure that swallows a whole sentence.
        if (inner.length > 40) return '\\$';
        if (/[.;:!?]\s/.test(inner)) return '\\$';
        if (inner.trim().split(/\s+/).length > 4) return '\\$';
        return /[a-zA-Z+\-*/]/.test(inner) || inner.length <= 12 ? match : '\\$';
      }),
    )
    .join('\n');
}

/** Lift `$$...$$` and `$...$` spans out, repairing the LaTeX inside them. */
function vaultMath(text: string, vault: Vault): string {
  const withBlocks = text.replace(/\$\$([\s\S]*?)\$\$/g, (_match, body: string) => {
    const repaired = collapseEscapedCommands(String(body));
    return stash(vault, `$$${repaired}$$`);
  });
  return withBlocks.replace(/(?<!\\)\$(?!\s)((?:[^$\n\\]|\\.)+?)(?<!\\)\$/g, (_match, body: string) => {
    const repaired = collapseEscapedCommands(String(body));
    return stash(vault, `$${repaired}$`);
  });
}

/**
 * Turn raw model Markdown into something react-markdown + KaTeX can render
 * without throwing or dropping content.
 */
export function prepareMarkdown(input: string | null | undefined): string {
  if (!input) return '';
  const vault: Vault = { items: [] };

  let text = String(input).replace(/\r\n?/g, '\n');
  // A fully double-encoded payload has no real newlines, so its fences cannot be
  // found until the escapes are undone. Otherwise vault first, which keeps a
  // literal "\n" inside a code sample exactly as the author wrote it.
  const doubleEncoded = !text.includes('\n');
  if (doubleEncoded) text = unescapeLiterals(text);
  text = vaultFences(text, vault);
  text = vaultInlineCode(text, vault);
  if (!doubleEncoded) text = unescapeLiterals(text);

  text = normaliseMathDelimiters(text);
  // Currency has to be settled before maths spans are lifted out, or a distant
  // `$` gets mistaken for a closing delimiter.
  text = escapeCurrency(text);
  text = vaultMath(text, vault);
  // Only now is it safe to wrap a bare environment: anything already inside
  // `$$ … $$` has been vaulted, so it cannot be wrapped twice. Vault the result
  // immediately so the macro pass below cannot reach inside it either.
  text = wrapBareEnvironments(text);
  text = vaultMath(text, vault);

  // Only untouched prose remains here, so repairing and wrapping stray macros
  // cannot reach into code or existing maths.
  text = collapseEscapedCommands(text);
  text = wrapStrayMacros(text);
  text = vaultMath(text, vault);

  return restore(text, vault).replace(/\n{4,}/g, '\n\n\n');
}

/* -------------------------------------------------------------------------- */
/* helpers used by renderers and exporters                                     */
/* -------------------------------------------------------------------------- */

export function isMermaidLanguage(language: string | undefined, code: string): boolean {
  if (language === 'mermaid') return true;
  if (language) return false;
  return /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|gitGraph)\b/.test(
    code,
  );
}

export function isSvgLanguage(language: string | undefined, code: string): boolean {
  if (language === 'svg') return true;
  if (language && language !== 'xml' && language !== 'html') return false;
  return /<svg[\s>]/i.test(code);
}

/** Flatten Markdown to readable plain text for chat context and exports. */
export function toPlainText(markdown: string, limit = 4000): string {
  let text = markdown
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, '$1$2')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length > limit) text = `${text.slice(0, limit).trimEnd()}…`;
  return text;
}
