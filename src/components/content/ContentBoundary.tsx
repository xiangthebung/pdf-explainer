import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Raw source, offered to the reader when rendering fails. */
  source?: string;
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * A rendering failure in one block — a pathological KaTeX expression, a broken
 * table — must not take the study panel with it. The reader still gets the
 * source text, which is usually enough to keep going.
 */
export class ContentBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('Content failed to render', error.message, info.componentStack?.slice(0, 400));
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="rounded-[14px] border border-line bg-warn-soft p-3.5 text-[13px] leading-relaxed">
        <p className="font-medium text-ink">{this.props.label ?? 'This section could not be formatted'}</p>
        <p className="mt-0.5 text-ink-2">Showing the original text instead.</p>
        {this.props.source ? (
          <pre className="scroll-area mt-2.5 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-[10px] bg-surface p-3 font-mono text-[12px] text-ink-2">
            {this.props.source}
          </pre>
        ) : null}
      </div>
    );
  }
}
