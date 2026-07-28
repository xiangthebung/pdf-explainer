import { memo, useMemo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { isMermaidLanguage, isSvgLanguage, prepareMarkdown } from '~shared/markdown';
import { cx } from '../../lib/utils';
import { CodeBlock } from './CodeBlock';
import { ContentBoundary } from './ContentBoundary';
import { MermaidDiagram } from './MermaidDiagram';
import { SvgFigure } from './SvgFigure';

const KATEX_OPTIONS = {
  // Never throw: a malformed formula shows in red, the rest of the note survives.
  throwOnError: false,
  errorColor: 'var(--c-bad)',
  strict: 'ignore' as const,
  trust: false,
  output: 'htmlAndMathml' as const,
  maxSize: 24,
  maxExpand: 400,
  macros: {
    '\\R': '\\mathbb{R}',
    '\\N': '\\mathbb{N}',
    '\\Z': '\\mathbb{Z}',
    '\\eps': '\\varepsilon',
    '\\deg': '^{\\circ}',
  },
};

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
}

const OPAQUE_NODES = new Set(['code', 'inlineCode', 'math', 'inlineMath', 'html', 'yaml']);

/**
 * Treat a single newline as a line break.
 *
 * Models write notes the way people write in a chat box: `**Term**\ndefinition`.
 * Standard Markdown collapses that into one run-on line, which reads badly and
 * loses the author's structure. Code, maths and HTML nodes are left alone.
 */
function remarkSoftBreaks() {
  const walk = (node: MdastNode): void => {
    if (!node.children) return;
    const next: MdastNode[] = [];
    for (const child of node.children) {
      if (child.type === 'text' && child.value?.includes('\n')) {
        const pieces = child.value.split('\n');
        pieces.forEach((piece, index) => {
          if (index > 0) next.push({ type: 'break' });
          if (piece) next.push({ type: 'text', value: piece });
        });
        continue;
      }
      if (!OPAQUE_NODES.has(child.type)) walk(child);
      next.push(child);
    }
    node.children = next;
  };

  return (tree: MdastNode) => walk(tree);
}

function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (typeof node === 'object' && 'props' in (node as { props?: unknown })) {
    return nodeText((node as { props: { children?: ReactNode } }).props?.children);
  }
  return '';
}

const components: Components = {
  /**
   * Fenced blocks are handled here rather than in `code`, because only the `pre`
   * element can tell a block apart from an inline span in remark's output.
   */
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    const props =
      child && typeof child === 'object' && 'props' in (child as { props?: unknown })
        ? ((child as { props: { className?: string; children?: ReactNode } }).props ?? {})
        : {};
    const language = /language-([\w-]+)/.exec(props.className ?? '')?.[1];
    const code = nodeText(props.children ?? children).replace(/\n$/, '');

    if (!code.trim()) return <></>;
    if (isMermaidLanguage(language, code)) return <MermaidDiagram code={code} />;
    if (isSvgLanguage(language, code)) return <SvgFigure code={code} />;
    return <CodeBlock code={code} language={language} />;
  },
  a({ children, href }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    const source = typeof src === 'string' ? src : '';
    // Only same-origin or inline images; no remote beacons from model output.
    if (!source || /^https?:/i.test(source)) {
      return <span className="text-[12px] text-ink-3">{alt || 'image omitted'}</span>;
    }
    return <img src={source} alt={alt ?? ''} loading="lazy" decoding="async" />;
  },
  table({ children }) {
    return (
      <div className="scroll-area my-4 overflow-x-auto rounded-[12px] border border-line">
        <table>{children}</table>
      </div>
    );
  },
  input({ checked, type }) {
    // GFM task lists: render as a real, disabled checkbox.
    if (type !== 'checkbox') return null;
    return <input type="checkbox" checked={Boolean(checked)} disabled readOnly className="mr-1.5 align-middle" />;
  },
};

const inlineComponents: Components = {
  ...components,
  p({ children }) {
    return <span>{children}</span>;
  },
};

export interface MarkdownProps {
  children: string;
  /** Renders without block spacing, for quiz options and chips. */
  inline?: boolean;
  className?: string;
}

/**
 * The one place model-authored Markdown becomes DOM. Everything else in the app
 * routes through it, so LaTeX repair, sanitisation and error isolation are
 * applied uniformly.
 */
export const Markdown = memo(function Markdown({ children, inline, className }: MarkdownProps): React.JSX.Element {
  const source = useMemo(() => prepareMarkdown(children), [children]);
  if (!source) return <></>;

  // Inline mode renders inside paragraphs and buttons, so the wrapper has to be
  // a span — a div there is invalid HTML and React (rightly) complains.
  const Wrapper = inline ? 'span' : 'div';

  return (
    <ContentBoundary source={children}>
      <Wrapper className={cx(inline ? 'prose-inline' : 'prose-study', className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath, remarkSoftBreaks]}
          rehypePlugins={[[rehypeKatex, KATEX_OPTIONS]]}
          components={inline ? inlineComponents : components}
          skipHtml
        >
          {source}
        </ReactMarkdown>
      </Wrapper>
    </ContentBoundary>
  );
});
