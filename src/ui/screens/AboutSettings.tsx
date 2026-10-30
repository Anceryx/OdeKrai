import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Kbd } from '../DesignSystem';

type BuildInfo = {
  version: string;
  commit: string;
  build_date: string;
  webview_version: string;
  windows_version: string;
};

export function AboutSettings({
  releaseNotesUrl,
  onOpenReleaseNotes,
}: {
  releaseNotesUrl: string;
  onOpenReleaseNotes: () => void;
}) {
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [message, setMessage] = useState('');
  const buildDate = buildInfo?.build_date ? new Date(buildInfo.build_date) : null;
  const shortCommit =
    buildInfo?.commit && buildInfo.commit !== 'local' ? buildInfo.commit.slice(0, 7) : 'local';
  const aboutText = [
    `Versão: ${buildInfo?.version ?? '—'}`,
    `Commit: ${shortCommit}`,
    `Build (local): ${buildDate && !Number.isNaN(buildDate.valueOf()) ? buildDate.toLocaleString('pt-BR') : '—'}`,
    `Build (UTC): ${buildInfo?.build_date ?? '—'}`,
    `WebView2: ${buildInfo?.webview_version ?? '—'}`,
    `Windows: ${buildInfo?.windows_version ?? '—'}`,
    'Licença: MIT',
  ].join('\n');

  useEffect(() => {
    if (!isTauri()) return;
    void invoke<BuildInfo>('get_build_info')
      .then(setBuildInfo)
      .catch(() => setBuildInfo(null));
  }, []);

  return (
    <div className="settings-embedded-content">
      <section id="settings-about" className="settings-panel settings-section">
        <h2>Sobre</h2>
        <dl className="about-table">
          <div>
            <dt>Versão</dt>
            <dd>{buildInfo?.version ?? '—'}</dd>
          </div>
          <div>
            <dt>Commit</dt>
            <dd>
              {buildInfo?.commit && buildInfo.commit !== 'local' ? (
                <button
                  className="text-link-button"
                  onClick={() =>
                    void invoke('open_build_commit').catch((error: unknown) =>
                      setMessage(String(error)),
                    )
                  }
                >
                  {shortCommit} · Abrir no GitHub
                </button>
              ) : (
                shortCommit
              )}
            </dd>
          </div>
          <div>
            <dt>Data do build (local)</dt>
            <dd>
              {buildDate && !Number.isNaN(buildDate.valueOf())
                ? buildDate.toLocaleString('pt-BR')
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Data do build (UTC)</dt>
            <dd>{buildInfo?.build_date ?? '—'}</dd>
          </div>
          <div>
            <dt>WebView2</dt>
            <dd>{buildInfo?.webview_version ?? '—'}</dd>
          </div>
          <div>
            <dt>Windows</dt>
            <dd>{buildInfo?.windows_version ?? '—'}</dd>
          </div>
          <div>
            <dt>Licença</dt>
            <dd>MIT</dd>
          </div>
        </dl>
        <section className="settings-subsection" aria-labelledby="about-shortcuts-heading">
          <h3 id="about-shortcuts-heading">Atalhos de teclado</h3>
          <p className="settings-description">
            <Kbd>Ctrl+K</Kbd> Abrir a paleta de comandos
          </p>
        </section>
        <p className="settings-description">
          <a
            href={releaseNotesUrl}
            onClick={(event) => {
              event.preventDefault();
              onOpenReleaseNotes();
            }}
          >
            Notas completas da versão
          </a>
        </p>
        <div className="about-actions">
          <button
            className="secondary-button small-button"
            onClick={() =>
              void navigator.clipboard
                .writeText(aboutText)
                .then(() => setMessage('Informações copiadas.'))
                .catch(() => setMessage('Não foi possível copiar as informações.'))
            }
          >
            Copiar informações
          </button>
          <button
            className="secondary-button small-button"
            onClick={() =>
              void invoke('open_logs_folder').catch((error: unknown) => setMessage(String(error)))
            }
          >
            Abrir pasta de logs
          </button>
        </div>
        {message && (
          <p role="status" className="settings-description">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
