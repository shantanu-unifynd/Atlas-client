import { Component } from 'react';

// C4-01 — global error boundary. Catches render/runtime errors anywhere in the
// tree and shows a friendly fallback instead of a blank white screen. Never
// exposes a stack trace to visitors; details are logged only in development.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('Atlas client error:', error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="screen" role="alert">
          <div className="brand">Atlas</div>
          <p className="state-title">Something went wrong</p>
          <p className="hint">The map ran into an unexpected problem. Please reload the page.</p>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
