/**
 * ErrorBoundary — top-level boundary that catches render errors and shows a
 * minimal token-styled "Something went wrong" card (var(--bg)/--surface/--text,
 * no hardcoded palette), logging the error to the console.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          background: 'var(--bg)',
          color: 'var(--text)',
        }}
      >
        <div
          className="card"
          style={{
            maxWidth: '28rem',
            padding: '2rem',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            textAlign: 'center',
          }}
        >
          <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
          <p className="muted" style={{ color: 'var(--muted)' }}>
            An unexpected error occurred. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-contrast)',
              border: 'none',
              borderRadius: 'var(--radius)',
              padding: '0.5rem 1.25rem',
              fontWeight: 500,
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
