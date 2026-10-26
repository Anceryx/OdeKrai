import { Icon, type IconName } from './Icon';
import type { Section } from './screens/types';

export const navigationItems: { id: Section; label: string; icon: IconName; group: string }[] = [
  { id: 'overview', label: 'Visão geral', icon: 'home', group: 'ESPAÇO DE TRABALHO' },
  { id: 'chat', label: 'Conversas', icon: 'chat', group: 'ESPAÇO DE TRABALHO' },
  { id: 'agent', label: 'Identidade e memória', icon: 'memory', group: 'ESPAÇO DE TRABALHO' },
  { id: 'providers', label: 'Conectores de IA', icon: 'connectors', group: 'INTELIGÊNCIA' },
  { id: 'computer', label: 'Seu computador', icon: 'activity', group: 'INTELIGÊNCIA' },
  { id: 'skills', label: 'Habilidades', icon: 'activity', group: 'INTELIGÊNCIA' },
  { id: 'companion', label: 'Assistente do OdeKrai', icon: 'pet', group: 'PERSONALIZAÇÃO' },
  { id: 'settings', label: 'Configurações', icon: 'settings', group: 'PERSONALIZAÇÃO' },
  { id: 'permissions', label: 'Permissões', icon: 'shield', group: 'PERSONALIZAÇÃO' },
  { id: 'activity', label: 'Atividade', icon: 'activity', group: 'PERSONALIZAÇÃO' },
];

const navigationGroups = ['ESPAÇO DE TRABALHO', 'INTELIGÊNCIA', 'PERSONALIZAÇÃO'] as const;

export function SidebarNavigation({
  section,
  onSelectSection,
  onSetChatMode,
  keySavedForSession,
  compact = false,
}: {
  section: Section;
  onSelectSection: (section: Section) => void;
  onSetChatMode: (enabled: boolean) => void;
  keySavedForSession: boolean;
  compact?: boolean;
}) {
  return (
    <nav
      className={`nav-list ${compact ? 'nav-list-compact' : ''}`}
      aria-label="Navegação principal"
    >
      {navigationGroups.map((group) => (
        <div className="nav-group" key={group}>
          {!compact && <span className="nav-heading">{group}</span>}
          {navigationItems
            .filter((item) => item.group === group)
            .map((item) => (
              <button
                className={`nav-item ${section === item.id ? 'active' : ''}`}
                key={item.id}
                title={compact ? item.label : undefined}
                aria-label={compact ? item.label : undefined}
                onClick={() => {
                  onSelectSection(item.id);
                  onSetChatMode(false);
                }}
              >
                <span className="nav-icon">
                  <Icon name={item.icon} size={20} />
                </span>
                {!compact && item.label}
                {item.id === 'providers' && (
                  <span
                    className="nav-status"
                    aria-label={
                      keySavedForSession ? 'Chave disponível nesta sessão' : 'Chave não configurada'
                    }
                  />
                )}
              </button>
            ))}
        </div>
      ))}
    </nav>
  );
}
