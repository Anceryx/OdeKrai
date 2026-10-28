import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Button } from './DesignSystem';

type Preview = { dataUrl: string; destination: string; width: number; height: number };

const VISION_MODELS: Record<string, string[]> = {
  openai: ['gpt-6-astra'],
  anthropic: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
};

export function supportsScreenshotAnalysis(providerId: string, model: string) {
  return VISION_MODELS[providerId]?.includes(model) ?? false;
}

export function canAnalyzeCapture({
  hasPreview,
  prompt,
  agentEnabled,
  agentAvailable,
  visionSupported,
  busy,
}: {
  hasPreview: boolean;
  prompt: string;
  agentEnabled: boolean;
  agentAvailable: boolean;
  visionSupported: boolean;
  busy: boolean;
}) {
  return (
    hasPreview &&
    Boolean(prompt.trim()) &&
    agentEnabled &&
    agentAvailable &&
    visionSupported &&
    !busy
  );
}

export async function requestCaptureAnalysis(
  confirmed: boolean,
  prompt: string,
  imageBase64: string,
  onAnalyze: (prompt: string, imageBase64: string) => Promise<boolean>,
) {
  if (!confirmed || !prompt.trim() || !imageBase64) return false;
  return onAnalyze(prompt.trim(), imageBase64);
}

export function ScreenCapture({
  providerId,
  providerModel,
  agentEnabled,
  agentAvailable,
  disabled,
  onAnalyze,
}: {
  providerId: string;
  providerModel: string;
  agentEnabled: boolean;
  agentAvailable: boolean;
  disabled: boolean;
  onAnalyze: (prompt: string, imageBase64: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [prompt, setPrompt] = useState('Analise esta captura de tela.');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const dialogHeading = useRef<HTMLHeadingElement>(null);
  const visionSupported = supportsScreenshotAnalysis(providerId, providerModel);

  useEffect(() => {
    if (!open) return;
    dialogHeading.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        setOpen(false);
        setPreview(null);
        setNotice('');
      } else if (event.key === 'Tab') {
        const elements = document.querySelectorAll<HTMLElement>(
          '.screen-capture-dialog button:not(:disabled), .screen-capture-dialog textarea',
        );
        if (elements.length === 0) return;
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, busy]);

  async function capture() {
    setBusy(true);
    setNotice('');
    try {
      setPreview(await invoke<Preview>('capture_screen_preview'));
    } catch (cause) {
      setNotice(String(cause));
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    setOpen(false);
    setPreview(null);
    setNotice('');
    setPrompt('Analise esta captura de tela.');
  }

  async function saveLocally() {
    if (!preview) return;
    setBusy(true);
    setNotice('');
    try {
      const imageBase64 = preview.dataUrl.slice(preview.dataUrl.indexOf(',') + 1);
      const path = await invoke<string>('save_screen_capture', { imageBase64 });
      setNotice(`Captura salva em ${path}`);
    } catch (cause) {
      setNotice(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    const currentPreview = preview;
    if (
      !canAnalyzeCapture({
        hasPreview: Boolean(currentPreview),
        prompt,
        agentEnabled,
        agentAvailable,
        visionSupported,
        busy,
      })
    )
      return;
    if (!currentPreview) return;
    setBusy(true);
    setNotice('');
    try {
      const imageBase64 = currentPreview.dataUrl.slice(currentPreview.dataUrl.indexOf(',') + 1);
      const sent = await requestCaptureAnalysis(true, prompt, imageBase64, onAnalyze);
      if (sent) {
        discard();
      } else {
        setNotice(
          'O agente não confirmou a conclusão. Confira a conversa antes de tentar novamente ou descarte a captura.',
        );
      }
    } catch (cause) {
      setNotice(String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || !isTauri()}
        onClick={() => {
          setNotice('');
          setPreview(null);
          setOpen(true);
        }}
      >
        Capturar tela
      </Button>
      {open && (
        <div className="screen-capture-backdrop">
          <section
            className="screen-capture-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="screen-capture-title"
          >
            <h2 id="screen-capture-title" ref={dialogHeading} tabIndex={-1}>
              {preview ? 'Prévia da captura' : 'Capturar tela'}
            </h2>
            {!preview ? (
              <>
                <p>
                  A captura inclui a tela inteira e pode conter senhas, mensagens privadas ou dados
                  bancários. Ela será processada localmente primeiro e só será enviada se você
                  revisar a prévia e escolher “Analisar e enviar”.
                </p>
                <div className="screen-capture-actions">
                  <Button type="button" variant="ghost" disabled={busy} onClick={discard}>
                    Cancelar
                  </Button>
                  <Button type="button" disabled={busy} onClick={() => void capture()}>
                    {busy ? 'Capturando…' : 'Continuar e capturar'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <img
                  className="screen-capture-preview"
                  src={preview.dataUrl}
                  alt="Prévia local da captura da tela"
                />
                <dl className="screen-capture-details">
                  <dt>Resolução enviada</dt>
                  <dd>
                    {preview.width} × {preview.height} px; JPEG reduzido, sem metadados
                  </dd>
                  <dt>Destino da análise</dt>
                  <dd>
                    {providerId} · {providerModel}
                  </dd>
                  <dt>Salvar captura localmente em</dt>
                  <dd className="screen-capture-path">{preview.destination}</dd>
                </dl>
                <label className="screen-capture-prompt">
                  Instrução para a IA
                  <textarea
                    value={prompt}
                    maxLength={2000}
                    onChange={(event) => setPrompt(event.target.value)}
                  />
                </label>
                {!visionSupported && (
                  <p role="status">Este provedor/modelo não tem suporte a imagens verificado.</p>
                )}
                {!agentEnabled && (
                  <p role="status">
                    Ative o agente para analisar a captura. Você ainda pode salvá-la localmente.
                  </p>
                )}
                {agentEnabled && !agentAvailable && (
                  <p role="status">O agente está indisponível; a captura não será enviada.</p>
                )}
                {notice && (
                  <p role="status" aria-live="polite">
                    {notice}
                  </p>
                )}
                <div className="screen-capture-actions">
                  <Button type="button" variant="ghost" disabled={busy} onClick={discard}>
                    Descartar
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void saveLocally()}
                  >
                    Salvar localmente
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      !canAnalyzeCapture({
                        hasPreview: Boolean(preview),
                        prompt,
                        agentEnabled,
                        agentAvailable,
                        visionSupported,
                        busy,
                      })
                    }
                    onClick={() => void analyze()}
                  >
                    {busy ? 'Aguarde…' : 'Analisar e enviar'}
                  </Button>
                </div>
                <p className="screen-capture-consent">
                  Ao confirmar, a imagem e a instrução acima serão enviadas ao provedor mostrado.
                  Cancelar ou descartar não envia dados.
                </p>
              </>
            )}
            {notice && !preview && <p role="alert">{notice}</p>}
          </section>
        </div>
      )}
    </>
  );
}
