import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Last line of defence. Reloading is genuinely the right advice here, because
 * study sessions are persisted: the reader gets their notes back.
 */
export class RootBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error.message, info.componentStack?.slice(0, 600));
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-[420px] text-center">
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">Something broke</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
            The app hit an unexpected error. Your notes are saved on this device, so reloading should pick up where you
            left off.
          </p>
          <pre className="scroll-area mt-4 max-h-32 overflow-auto rounded-[12px] bg-surface-2 p-3 text-left font-mono text-[11.5px] text-ink-3">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 h-10 rounded-[11px] bg-accent px-4 text-[14px] font-medium text-white hover:bg-accent-hover"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
