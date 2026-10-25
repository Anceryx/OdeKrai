import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ScreenErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    window.dispatchEvent(new ErrorEvent('error', { error }));
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="screen-error" role="alert">
          Esta tela encontrou um erro. Consulte o banner Diagnóstico.
        </div>
      );
    }
    return this.props.children;
  }
}
