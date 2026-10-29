import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ScreenErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(_error: Error) {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const componentStack = info.componentStack?.trim();
    const diagnosticError = componentStack
      ? new Error(`${error.message}\nComponentes React:${componentStack}`)
      : error;
    window.dispatchEvent(new ErrorEvent('error', { error: diagnosticError }));
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
