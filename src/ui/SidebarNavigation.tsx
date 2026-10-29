import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { initials, type ProfileData } from './Profile';
import { Icon, type IconName } from './Icon';
import type { Section } from './screens/types';

export const navigationItems: { id: Section; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Visão geral', icon: 'home' },
  { id: 'chat', label: 'Conversas', icon: 'chat' },
  { id: 'calendar', label: 'Agenda', icon: 'calendar' },
  { id: 'skills', label: 'Habilidades', icon: 'wrench' },
  { id: 'providers', label: 'Conectores de IA', icon: 'connectors' },
];

export const profileMenuItems = [
  { id: 'profile', label: 'Meu perfil', icon: 'profile' },
  { id: 'settings', label: 'Configurações', icon: 'settings' },
  { id: 'permissions', label: 'Permissões e segurança', icon: 'shield' },
  { id: 'help', label: 'Ajuda e suporte', icon: 'help' },
  { id: 'about', label: 'Sobre o OdeKrai', icon: 'info' },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];

export function nextProfileMenuFocus(
  key: string,
  currentIndex: number,
  itemCount: number,
): number | 'close' | null {
  if (!itemCount) return key === 'Escape' ? 'close' : null;
  if (key === 'Escape') return 'close';
  if (key === 'Home') return 0;
  if (key === 'End') return itemCount - 1;
  if (key === 'ArrowDown') return (currentIndex + 1 + itemCount) % itemCount;
  if (key === 'ArrowUp') return (currentIndex - 1 + itemCount) % itemCount;
  return null;
}

export function shouldShowStopAll(busy: boolean, agentRunning: boolean): boolean {
  return busy || agentRunning;
}

export function handleProfileMenuKey(
  key: string,
  currentIndex: number,
  items: Array<Pick<HTMLButtonElement, 'focus' | 'click'> | null>,
  close: () => void,
  restoreTriggerFocus: () => void,
): number | 'close' | null {
  if (key === 'Enter' && currentIndex >= 0) {
    items[currentIndex]?.click();
    return currentIndex;
  }
  const destination = nextProfileMenuFocus(key, currentIndex, items.length);
  if (destination === 'close') {
    close();
    restoreTriggerFocus();
    return destination;
  }
  if (destination !== null) items[destination]?.focus();
  return destination;
}

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
      {navigationItems.map((item) => (
        <button
          className={`nav-item ${section === item.id ? 'active' : ''}`}
          key={item.id}
          type="button"
          title={compact ? item.label : undefined}
          aria-label={compact ? item.label : undefined}
          aria-current={section === item.id ? 'page' : undefined}
          onClick={() => {
            onSelectSection(item.id);
            onSetChatMode(false);
          }}
        >
          <span className="nav-icon">
            <Icon name={item.icon} size={20} />
          </span>
          {!compact && <span>{item.label}</span>}
          {item.id === 'providers' && (
            <span
              className={`nav-status ${keySavedForSession ? 'configured' : ''}`}
              role="img"
              title={keySavedForSession ? 'Chave disponível nesta sessão' : 'Chave não configurada'}
              aria-label={
                keySavedForSession ? 'Chave disponível nesta sessão' : 'Chave não configurada'
              }
            />
          )}
        </button>
      ))}
    </nav>
  );
}

export function SidebarProfileMenu({
  profile,
  compact,
  onMyProfile,
  onSettings,
  onPermissions,
  onHelp,
  onAbout,
}: {
  profile: ProfileData;
  compact: boolean;
  onMyProfile: () => void;
  onSettings: () => void;
  onPermissions: () => void;
  onHelp: () => void;
  onAbout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const displayName = profile.displayName.trim() || 'Seu perfil';

  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !triggerRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = itemRefs.current.findIndex((item) => item === document.activeElement);
    const destination = handleProfileMenuKey(
      event.key,
      Math.max(0, currentIndex),
      itemRefs.current,
      () => setOpen(false),
      () => window.requestAnimationFrame(() => triggerRef.current?.focus()),
    );
    if (destination !== null) event.preventDefault();
  }

  const actions = {
    profile: onMyProfile,
    settings: onSettings,
    permissions: onPermissions,
    help: onHelp,
    about: onAbout,
  };

  return (
    <div className="sidebar-profile-footer">
      <button
        ref={triggerRef}
        className="profile-card sidebar-profile-trigger"
        type="button"
        title={compact ? `Perfil: ${displayName}` : undefined}
        aria-label={`Abrir menu do perfil: ${displayName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="avatar-small">
          {profile.avatarDataUrl ? (
            <img src={profile.avatarDataUrl} alt="" />
          ) : (
            initials(profile.displayName)
          )}
          <span className="online-dot" />
        </span>
        <span className="profile-copy">
          <strong>{displayName}</strong>
          <span>{profile.nickname.trim() || 'Editar perfil'}</span>
        </span>
      </button>
      {open && (
        <div
          ref={menuRef}
          className="sidebar-profile-popover"
          role="menu"
          aria-label="Menu do perfil"
          onKeyDown={handleMenuKeyDown}
        >
          {profileMenuItems.map((item, index) => (
            <button
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
                actions[item.id]();
              }}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PendingApprovalIndicator({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count < 1) return null;
  const label = `${count} ${count === 1 ? 'aprovação pendente' : 'aprovações pendentes'}; abrir Atividade`;
  return (
    <button
      type="button"
      className="pending-approval-indicator"
      aria-label={label}
      title={label}
      onClick={onOpen}
    >
      <span aria-hidden="true">{count}</span>
      <span>Aprovações</span>
    </button>
  );
}
