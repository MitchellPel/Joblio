import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render crashes so staff see a recovery screen instead of a blank window.
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Joblio] UI crash:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#f1f5f9',
          fontFamily: 'Segoe UI, system-ui, sans-serif',
          color: '#26251e',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: '100%',
            background: '#fff',
            borderRadius: 16,
            padding: 28,
            boxShadow: '0 14px 40px rgba(0,0,0,0.12)',
          }}
        >
          <h1 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600 }}>
            Joblio hit a display error
          </h1>
          <p style={{ margin: '0 0 16px', fontSize: 14, color: '#6b6560', lineHeight: 1.45 }}>
            The window went blank on this PC. Click reload — if it happens again, reinstall from the
            Job Tracker updates folder on the server.
          </p>
          <pre
            style={{
              margin: '0 0 16px',
              padding: 12,
              fontSize: 11,
              background: '#f4f3ef',
              borderRadius: 8,
              overflow: 'auto',
              maxHeight: 120,
              whiteSpace: 'pre-wrap',
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              width: '100%',
              border: 0,
              borderRadius: 10,
              padding: '10px 14px',
              background: '#26251e',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload Joblio
          </button>
        </div>
      </div>
    );
  }
}
