import { releaseNotesManifest } from '../core/release-notes-manifest';
import { Button } from './DesignSystem';
import { Modal } from './Modal';

export function ReleaseNotesContent({
  showAllVersions,
  onShowAllVersions,
  onShowCurrent,
  onClose,
}: {
  showAllVersions: boolean;
  onShowAllVersions: () => void;
  onShowCurrent: () => void;
  onClose: () => void;
}) {
  const current = releaseNotesManifest.releases.find(
    (release) => release.version === releaseNotesManifest.currentVersion,
  );
  if (!current) return null;

  const releases = showAllVersions ? releaseNotesManifest.releases : [current];
  return (
    <div
      className="release-notes-content"
      aria-label={
        showAllVersions ? 'Notas de todas as versões' : `Novidades da versão ${current.version}`
      }
    >
      {releases.map((release) => (
        <article className="release-notes-entry" key={release.version}>
          {showAllVersions && <h3>Versão {release.version}</h3>}
          <p className="release-notes-date">{release.date}</p>
          <p>{release.summary}</p>
          <ul>
            {release.changes.map((change, index) => (
              <li key={`${release.version}-${index}`}>{change}</li>
            ))}
          </ul>
        </article>
      ))}
      <footer className="release-notes-actions">
        {showAllVersions ? (
          <Button type="button" variant="secondary" onClick={onShowCurrent}>
            Voltar às novidades
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={onShowAllVersions}>
            Ver todas as versões
          </Button>
        )}
        <Button type="button" variant="primary" onClick={onClose}>
          Fechar
        </Button>
      </footer>
    </div>
  );
}

export function ReleaseNotesModal({
  open,
  showAllVersions,
  onShowAllVersions,
  onShowCurrent,
  onClose,
}: {
  open: boolean;
  showAllVersions: boolean;
  onShowAllVersions: () => void;
  onShowCurrent: () => void;
  onClose: () => void;
}) {
  const current = releaseNotesManifest.releases.find(
    (release) => release.version === releaseNotesManifest.currentVersion,
  );
  if (!current) return null;

  return (
    <Modal
      open={open}
      title={
        showAllVersions
          ? 'Notas de versão do OdeKrai'
          : `O que há de novo na versão ${current.version}`
      }
      onClose={onClose}
    >
      <ReleaseNotesContent
        showAllVersions={showAllVersions}
        onShowAllVersions={onShowAllVersions}
        onShowCurrent={onShowCurrent}
        onClose={onClose}
      />
    </Modal>
  );
}
