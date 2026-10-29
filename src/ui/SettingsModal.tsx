import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings } from '../core/settings';
import {
  filterSettingsIndex,
  filterSettingsMenu,
  SETTINGS_MENU,
} from '../core/settings-navigation';
import type { SettingsSection } from '../core/navigation';
import type { ProfileData } from './Profile';
import type { Section } from './screens/types';
import { Button, Toggle } from './DesignSystem';
import { Modal } from './Modal';

const SettingsScreen = lazy(() =>
  import('./screens/Settings').then((module) => ({ default: module.SettingsScreen })),
);
const IdentityScreen = lazy(() =>
  import('./screens/Identity').then((module) => ({ default: module.IdentityScreen })),
);
const AssistantScreen = lazy(() =>
  import('./screens/Assistant').then((module) => ({ default: module.AssistantScreen })),
);
const ComputerScreen = lazy(() =>
  import('./screens/Computer').then((module) => ({ default: module.ComputerScreen })),
);
const SecurityCenter = lazy(() =>
  import('./SecurityCenter').then((module) => ({ default: module.SecurityCenter })),
);

export function SettingsModal({
  open,
  section,
  onClose,
  onSelectSection,
  settings,
  update,
  profile,
  setProfile,
  petVisible,
  setPetVisible,
  selectedPet,
  onSelectPet,
  onError,
  onDeleteAllHistory,
  onOpenPage,
  onAgentStatus,
}: {
  open: boolean;
  section: SettingsSection;
  onClose: () => void;
  onSelectSection: (section: SettingsSection) => void;
  settings: AppSettings;
  update: (settings: AppSettings) => void;
  profile: ProfileData;
  setProfile: (profile: ProfileData) => void;
  petVisible: boolean;
  setPetVisible: (visible: boolean) => void;
  selectedPet: string;
  onSelectPet: (petId: string) => void;
  onError: (message: string) => void;
  onDeleteAllHistory: () => Promise<boolean>;
  onOpenPage: (page: Extract<Section, 'skills' | 'providers'>) => void;
  onAgentStatus: () => void;
}) {
  const [query, setQuery] = useState('');
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const menu = useMemo(() => filterSettingsMenu(query), [query]);
  const results = useMemo(() => filterSettingsIndex(query), [query]);
  const activeTitle = SETTINGS_MENU.find((item) => item.id === section)?.title ?? 'Configurações';

  useEffect(() => {
    if (!pendingAnchor || !contentRef.current) return;
    const container = contentRef.current;
    const reveal = () => {
      const anchor = container.querySelector<HTMLElement>(`#${CSS.escape(pendingAnchor)}`);
      if (!anchor) return false;
      anchor.scrollIntoView({ block: 'start', behavior: 'auto' });
      setPendingAnchor(null);
      return true;
    };
    if (reveal()) return;
    const observer = new MutationObserver(() => {
      if (reveal()) observer.disconnect();
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pendingAnchor, section]);

  function chooseSection(next: SettingsSection, anchor?: string) {
    setPendingAnchor(anchor ?? null);
    onSelectSection(next);
  }

  const content = (() => {
    switch (section) {
      case 'geral':
      case 'sobre':
        return (
          <SettingsScreen
            settings={settings}
            update={update}
            onDeleteAllHistory={onDeleteAllHistory}
            onOpenPermissions={() => chooseSection('privacidade')}
            embedded
            embeddedSection={section === 'sobre' ? 'about' : 'general'}
          />
        );
      case 'perfil-memoria':
        return (
          <IdentityScreen
            initialName={profile.displayName}
            initialNickname={profile.nickname}
            profileValue={profile}
            onProfileChange={setProfile}
            onStatus={onAgentStatus}
            embedded
          />
        );
      case 'assistente':
        return (
          <AssistantScreen
            settings={settings}
            update={update}
            petVisible={petVisible}
            onPetVisibilityChange={setPetVisible}
            onError={onError}
            selectedPet={selectedPet}
            onSelectPet={onSelectPet}
            embedded
          />
        );
      case 'computador':
        return <ComputerScreen embedded />;
      case 'privacidade':
        return <SecurityCenter page="permissions" embedded />;
      case 'atividade':
        return <SecurityCenter page="activity" embedded />;
      case 'habilidades':
        return (
          <GlobalPreferences
            id="skills-global-preferences"
            settings={settings}
            update={update}
            onOpenPage={() => onOpenPage('skills')}
            title="Preferências globais"
          />
        );
      case 'conectores':
        return (
          <GlobalPreferences
            id="connectors-global-preferences"
            settings={settings}
            update={update}
            onOpenPage={() => onOpenPage('providers')}
            title="Preferências globais"
          />
        );
    }
  })();

  return (
    <Modal open={open} title="Configurações" onClose={onClose}>
      <div className="settings-modal-content">
        <label className="settings-modal-search">
          <span>Pesquisar configurações</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex.: microfone, memória, permissões"
            autoFocus
          />
        </label>
        {query.trim() && (
          <div className="settings-modal-results" aria-label="Resultados da pesquisa">
            {results.length ? (
              results.map((result) => (
                <button
                  type="button"
                  key={result.anchor}
                  onClick={() => chooseSection(result.section, result.anchor)}
                >
                  <span>{result.title}</span>
                  <small>{SETTINGS_MENU.find((item) => item.id === result.section)?.title}</small>
                </button>
              ))
            ) : (
              <p role="status">Nenhuma opção encontrada.</p>
            )}
          </div>
        )}
        <div className="settings-modal-layout">
          <nav className="settings-modal-menu" aria-label="Seções de configurações">
            <div className="settings-modal-menu-wide">
              {menu.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={item.id === section ? 'active' : ''}
                  aria-current={item.id === section ? 'page' : undefined}
                  onClick={() => chooseSection(item.id)}
                >
                  {item.title}
                </button>
              ))}
            </div>
            <label className="settings-modal-menu-narrow">
              <span>Seção</span>
              <select
                value={section}
                onChange={(event) => chooseSection(event.target.value as SettingsSection)}
              >
                {!menu.some((item) => item.id === section) && (
                  <option value={section}>{activeTitle}</option>
                )}
                {menu.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          </nav>
          <section className="settings-modal-panel" aria-label={activeTitle} ref={contentRef}>
            <Suspense fallback={<p role="status">Carregando configurações…</p>}>{content}</Suspense>
          </section>
        </div>
      </div>
    </Modal>
  );
}

function GlobalPreferences({
  id,
  title,
  settings,
  update,
  onOpenPage,
}: {
  id: string;
  title: string;
  settings: AppSettings;
  update: (settings: AppSettings) => void;
  onOpenPage: () => void;
}) {
  return (
    <div className="settings-embedded-content">
      <section id={id} className="settings-panel settings-section">
        <h2>{title}</h2>
        <div className="preference-row">
          <div>
            <strong>Reduzir animações</strong>
            <span>Respeita a preferência do sistema.</span>
          </div>
          <Toggle
            checked={settings.reduceMotion}
            label="Reduzir animações"
            onClick={() => update({ ...settings, reduceMotion: !settings.reduceMotion })}
          />
        </div>
        <div className="preference-row">
          <div>
            <strong>Usar mascote nas respostas</strong>
            <span>Preferência global do assistente.</span>
          </div>
          <Toggle
            checked={settings.useMascotAsAssistantAvatar}
            label="Usar mascote nas respostas"
            onClick={() =>
              update({
                ...settings,
                useMascotAsAssistantAvatar: !settings.useMascotAsAssistantAvatar,
              })
            }
          />
        </div>
        <Button type="button" variant="secondary" onClick={onOpenPage}>
          Abrir página
        </Button>
      </section>
    </div>
  );
}
