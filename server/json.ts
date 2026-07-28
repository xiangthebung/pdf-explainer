/**
 * Getting JSON out of a language model.
 *
 * Even with `responseMimeType: application/json` the output can arrive fenced,
 * with stray backslashes from LaTeX, with trailing commas, or simply cut off
 * mid-object when it hits the token ceiling. The staged recovery below saves a
 * usable batch far more often than a bare `JSON.parse`, which matters when a
 * request costs the user real money and 90 seconds of waiting.
 */

export interface ParsedModelJson {
  data: unknown;
  /** Escaping or punctuation had to be fixed. */
  repaired: boolean;
  /** Output was cut off and we recovered the complete prefix. */
  truncated: boolean;
}

const VALID_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);

/**
 * `\b \f \n \r \t` are valid JSON escapes *and* the first letters of very common
 * LaTeX commands. `"\frac"` is almost certainly `\frac`, not form-feed + "rac",
 * so when the letters that follow spell a known command we treat the backslash
 * as literal. Anything else keeps its JSON meaning.
 */
const LATEX_AFTER_ESCAPE =
  /^(?:beta|begin|bmatrix|binom|bar|bullet|bigg?[lr]?|boldsymbol|bf|bot|boxed|bigcup|bigcap|because|frac|forall|floor|frown|fbox|flat|footnotesize|nabla|neq|ne|nu|ni|notin|not|nonumber|newline|nolimits|nleq|ngeq|nmid|nsim|nrightarrow|nleftarrow|normalsize|nexists|ncong|nsubseteq|nsupseteq|nearrow|nwarrow|rho|rightarrow|right|rangle|rceil|rfloor|rvert|rm|ref|rule|rbrace|rbrack|times|theta|tau|textbf|textit|textrm|textstyle|text|tanh|tan|tfrac|tbinom|top|to|therefore|tilde|triangle|tiny|tt)(?![a-zA-Z])/;

function startsLatexCommand(source: string, index: number): boolean {
  // `index` points at the escape character itself (the letter after the slash).
  const run = source.slice(index).match(/^[a-zA-Z]+/);
  if (!run) return false;
  return LATEX_AFTER_ESCAPE.test(run[0]);
}

/** Drop Markdown fences and any prose the model wrapped the JSON in. */
export function extractJsonText(raw: string): string {
  let text = raw.trim();

  const fenced = text.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)(?:\n?```|$)/);
  if (fenced?.[1]) text = fenced[1].trim();

  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const start =
    firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);
  if (start > 0) text = text.slice(start);

  const lastBrace = text.lastIndexOf('}');
  const lastBracket = text.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);
  if (end !== -1 && end < text.length - 1) text = text.slice(0, end + 1);

  return text.trim();
}

/**
 * Escape what the model forgot to escape inside strings — the single most
 * common failure, because LaTeX is nothing but backslashes.
 */
export function repairJsonEscapes(input: string): { text: string; changed: boolean } {
  let out = '';
  let inString = false;
  let changed = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (!inString) {
      if (char === '"') inString = true;
      out += char;
      continue;
    }

    if (char === '"') {
      inString = false;
      out += char;
      continue;
    }

    if (char === '\\') {
      const next = input[i + 1] ?? '';
      if (VALID_ESCAPES.has(next)) {
        if (next === 'u' && !/^[0-9a-fA-F]{4}$/.test(input.slice(i + 2, i + 6))) {
          out += '\\\\u';
          i += 1;
          changed = true;
          continue;
        }
        // `\frac` beats form-feed + "rac".
        if ('bfnrt'.includes(next) && startsLatexCommand(input, i + 1)) {
          out += '\\\\';
          changed = true;
          continue;
        }
        out += char + next;
        i += 1;
        continue;
      }
      // A lone backslash: `\frac` -> `\\frac` so it survives JSON.parse as `\frac`.
      out += '\\\\';
      changed = true;
      continue;
    }

    if (char === '\n' || char === '\r' || char === '\t') {
      out += char === '\t' ? '\\t' : '\\n';
      changed = true;
      continue;
    }

    out += char;
  }

  return { text: out, changed };
}

function stripTrailingCommas(input: string): { text: string; changed: boolean } {
  let out = '';
  let inString = false;
  let escaped = false;
  let changed = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === ',') {
      const rest = input.slice(i + 1);
      const nextMeaningful = rest.match(/^\s*([}\]])/);
      if (nextMeaningful) {
        changed = true;
        continue;
      }
    }
    out += char;
  }

  return { text: out, changed };
}

/**
 * Recover a truncated response by rewinding to the last complete value and
 * closing whatever containers are still open. Partial notes beat no notes.
 */
export function closeTruncatedJson(input: string): string | null {
  let inString = false;
  let escaped = false;
  let depth = 0;
  let lastSafe = -1;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      // A complete value closed at depth >= 1 is a safe place to stop.
      if (depth >= 1) lastSafe = i;
    }
  }

  if (depth <= 0 || lastSafe === -1) return null;

  const prefix = input.slice(0, lastSafe + 1);
  const stack: string[] = [];
  let s = false;
  let esc = false;
  for (let i = 0; i < prefix.length; i += 1) {
    const char = prefix[i];
    if (s) {
      if (esc) esc = false;
      else if (char === '\\') esc = true;
      else if (char === '"') s = false;
      continue;
    }
    if (char === '"') s = true;
    else if (char === '{') stack.push('}');
    else if (char === '[') stack.push(']');
    else if (char === '}' || char === ']') stack.pop();
  }

  return prefix + stack.reverse().join('');
}

export function parseModelJson(raw: string): ParsedModelJson | null {
  const base = extractJsonText(raw);
  if (!base) return null;

  const attempt = (text: string, repaired: boolean, truncated: boolean): ParsedModelJson | null => {
    try {
      return { data: JSON.parse(text) as unknown, repaired, truncated };
    } catch {
      return null;
    }
  };

  // Repairs come first when the text contains ambiguous escapes: `"\frac"` is
  // *valid* JSON (form-feed + "rac"), so a plain parse would silently corrupt
  // the maths rather than fail.
  const escaped = repairJsonEscapes(base);
  if (escaped.changed) {
    const repaired = attempt(escaped.text, true, false);
    if (repaired) return repaired;
  }

  const direct = attempt(base, false, false);
  if (direct) return direct;

  const afterEscapes = attempt(escaped.text, escaped.changed, false);
  if (afterEscapes) return afterEscapes;

  const commas = stripTrailingCommas(escaped.text);
  const afterCommas = attempt(commas.text, true, false);
  if (afterCommas) return afterCommas;

  const closed = closeTruncatedJson(commas.text);
  if (closed) {
    const salvaged = attempt(closed, true, true) ?? attempt(stripTrailingCommas(closed).text, true, true);
    if (salvaged) return salvaged;
  }

  return null;
}
