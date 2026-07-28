import { sanitizeSvg } from './sanitizeSvg';

/**
 * Mermaid, kept at arm's length.
 *
 * Mermaid is the single heaviest dependency in the app, so it is imported only
 * when a diagram actually appears. It is also not reentrant and it likes to
 * leave error nodes attached to <body>, so every render goes through one queue
 * and cleans up after itself. The rendered SVG is sanitised like any other
 * untrusted markup before it reaches the DOM.
 */

type MermaidTheme = 'light' | 'dark';

type MermaidModule = typeof import('mermaid')['default'];

let modulePromise: Promise<MermaidModule> | null = null;
let configuredTheme: MermaidTheme | null = null;
let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

function themeVariables(theme: MermaidTheme): Record<string, string> {
  const dark = theme === 'dark';
  return {
    background: dark ? '#17171a' : '#ffffff',
    primaryColor: dark ? '#1f2937' : '#eef4ff',
    primaryBorderColor: dark ? '#3d9bff' : '#0b6fd6',
    primaryTextColor: dark ? '#f2f2f5' : '#1d1d1f',
    secondaryColor: dark ? '#26262b' : '#f2f2f5',
    tertiaryColor: dark ? '#26262b' : '#f7f7f9',
    lineColor: dark ? '#8b8b93' : '#6b6b74',
    textColor: dark ? '#e7e7ea' : '#1d1d1f',
    nodeBorder: dark ? '#3d9bff' : '#0b6fd6',
    clusterBkg: dark ? '#101014' : '#f7f7f9',
    clusterBorder: dark ? '#2f2f36' : '#e2e2e7',
    edgeLabelBackground: dark ? '#17171a' : '#ffffff',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: '14px',
  };
}

async function loadMermaid(theme: MermaidTheme): Promise<MermaidModule> {
  if (!modulePromise) {
    modulePromise = import('mermaid').then((module) => module.default);
  }
  const mermaid = await modulePromise;
  if (configuredTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      // 'strict' keeps HTML labels and click handlers out of the output.
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: themeVariables(theme),
      flowchart: { htmlLabels: false, useMaxWidth: true, curve: 'basis', padding: 12 },
      sequence: { useMaxWidth: true, wrap: true },
      class: { useMaxWidth: true },
      gantt: { useMaxWidth: true },
      er: { useMaxWidth: true },
      logLevel: 'fatal',
      deterministicIds: false,
    });
    configuredTheme = theme;
  }
  return mermaid;
}

/**
 * Best-effort repair for the mistakes models make in Mermaid source: unquoted
 * labels containing parentheses or slashes, and stray markdown fences.
 */
export function repairMermaid(source: string): string {
  let code = source.trim().replace(/^```(?:mermaid)?\s*\n?/i, '').replace(/\n?```$/i, '');

  // ID[(label)] -> ID[("label")] and ID([label]) -> ID(["label"])
  code = code.replace(/([A-Za-z0-9_-]+)\[\((?!")([^)\]]*?)\)\]/g, '$1[("$2")]');
  code = code.replace(/([A-Za-z0-9_-]+)\(\[(?!")([^\])]*?)\]\)/g, '$1(["$2"])');
  // ID[label] -> ID["label"] when the label needs quoting
  code = code.replace(/([A-Za-z0-9_-]+)\[(?!")([^[\]\n]*?)\]/g, (match, id: string, label: string) => {
    if (/^\(.*\)$/.test(label)) return match;
    if (!/[()/\\:;+*%&<>|"']/.test(label)) return match;
    return `${id}["${label.replace(/"/g, "'")}"]`;
  });
  // ID{label} (rhombus) -> ID{"label"}
  code = code.replace(/([A-Za-z0-9_-]+)\{(?!")([^{}\n]*?)\}/g, (match, id: string, label: string) => {
    if (!/[()/\\:;+*%&<>|"']/.test(label)) return match;
    return `${id}{"${label.replace(/"/g, "'")}"}`;
  });

  return code.trim();
}

export interface MermaidRender {
  markup: string;
  repaired: boolean;
}

/** Render to sanitised SVG markup, or throw with a readable message. */
export async function renderMermaid(source: string, theme: MermaidTheme): Promise<MermaidRender> {
  const run = async (): Promise<MermaidRender> => {
    const mermaid = await loadMermaid(theme);
    const attempts: Array<{ code: string; repaired: boolean }> = [
      { code: source.trim().replace(/^```(?:mermaid)?\s*\n?/i, '').replace(/\n?```$/i, ''), repaired: false },
    ];
    const repaired = repairMermaid(source);
    if (repaired !== attempts[0].code) attempts.push({ code: repaired, repaired: true });

    let lastError: unknown = null;
    for (const attempt of attempts) {
      counter += 1;
      const id = `pdfx-mermaid-${counter}`;
      try {
        const { svg } = await mermaid.render(id, attempt.code);
        const safe = sanitizeSvg(svg);
        if (!safe) throw new Error('Diagram output could not be sanitised.');
        return { markup: safe.markup, repaired: attempt.repaired };
      } catch (error) {
        lastError = error;
      } finally {
        // Mermaid leaves its scratch node behind when parsing fails.
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
      }
    }

    const message = lastError instanceof Error ? lastError.message : 'Unknown Mermaid error';
    throw new Error(message.split('\n')[0].slice(0, 200));
  };

  const task = queue.then(run, run);
  // Keep the chain alive even when a render rejects.
  queue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
