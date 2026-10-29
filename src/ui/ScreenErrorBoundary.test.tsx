import type { ErrorInfo } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScreenErrorBoundary } from './ScreenErrorBoundary';

afterEach(() => vi.unstubAllGlobals());

describe('limite de erro de tela', () => {
  it('troca a tela com falha por estado isolado', () => {
    expect(ScreenErrorBoundary.getDerivedStateFromError(new Error('falha'))).toEqual({
      failed: true,
    });
  });

  it('envia a mensagem e a pilha de componentes para o diagnóstico global', () => {
    class TestErrorEvent {
      constructor(
        readonly type: string,
        readonly options: { error: Error },
      ) {}
    }
    const dispatchEvent = vi.fn();
    vi.stubGlobal('ErrorEvent', TestErrorEvent);
    vi.stubGlobal('window', { dispatchEvent });

    const boundary = new ScreenErrorBoundary({ children: null });
    boundary.componentDidCatch(new Error('erro de renderização'), {
      componentStack: '\n    at ComputerScreen',
    } as ErrorInfo);

    expect(dispatchEvent).toHaveBeenCalledOnce();
    const event = dispatchEvent.mock.calls[0][0] as TestErrorEvent;
    expect(event.type).toBe('error');
    expect(event.options.error.message).toContain('erro de renderização');
    expect(event.options.error.message).toContain('ComputerScreen');
  });
});
