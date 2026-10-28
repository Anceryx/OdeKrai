import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  canAnalyzeCapture,
  requestCaptureAnalysis,
  ScreenCapture,
  supportsScreenshotAnalysis,
} from './ScreenCapture';

describe('captura de tela', () => {
  it('exige consentimento explícito antes de chamar o envio', async () => {
    const send = vi.fn(async () => true);

    await expect(requestCaptureAnalysis(false, 'Leia a tela', 'c2NyZWVu', send)).resolves.toBe(
      false,
    );
    expect(send).not.toHaveBeenCalled();

    await expect(requestCaptureAnalysis(true, '  Leia a tela  ', 'c2NyZWVu', send)).resolves.toBe(
      true,
    );
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith('Leia a tela', 'c2NyZWVu');
  });

  it('preserva a prévia quando o envio confirmado falha', async () => {
    const send = vi.fn(async () => false);
    await expect(requestCaptureAnalysis(true, 'Leia a tela', 'c2NyZWVu', send)).resolves.toBe(
      false,
    );
    expect(send).toHaveBeenCalledOnce();
  });

  it('habilita somente os modelos de visão documentados por ID exato', () => {
    expect(supportsScreenshotAnalysis('openai', 'gpt-6-astra')).toBe(true);
    expect(supportsScreenshotAnalysis('openai', 'gpt-6-luna')).toBe(false);
    expect(supportsScreenshotAnalysis('anthropic', 'claude-sonnet-5-5')).toBe(true);
    expect(supportsScreenshotAnalysis('local', 'claude-sonnet-5-5')).toBe(false);
  });

  it('bloqueia análise sem prévia, agente ativo ou modelo compatível', () => {
    const ready = {
      hasPreview: true,
      prompt: 'Leia a tela',
      agentEnabled: true,
      agentAvailable: true,
      visionSupported: true,
      busy: false,
    };
    expect(canAnalyzeCapture(ready)).toBe(true);
    expect(canAnalyzeCapture({ ...ready, hasPreview: false })).toBe(false);
    expect(canAnalyzeCapture({ ...ready, agentEnabled: false })).toBe(false);
    expect(canAnalyzeCapture({ ...ready, agentAvailable: false })).toBe(false);
    expect(canAnalyzeCapture({ ...ready, visionSupported: false })).toBe(false);
  });

  it('mostra o comando de captura sem capturar nem iniciar chamadas automaticamente', () => {
    const markup = renderToStaticMarkup(
      <ScreenCapture
        providerId="openai"
        providerModel="gpt-6-astra"
        agentEnabled={false}
        agentAvailable={false}
        disabled={false}
        onAnalyze={vi.fn(async () => true)}
      />,
    );

    expect(markup).toContain('Capturar tela');
    expect(markup).not.toContain('Analisar e enviar');
    expect(markup).not.toContain('data:image/');
  });
});
