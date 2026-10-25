import { initials, type ProfileData } from '../Profile';
import { Button } from '../DesignSystem';
import { Icon } from '../Icon';
import { PetSprite } from '../PetSprite';
import type { ProviderSettings } from '../../core/settings';
import type { Section } from './types';

export function Overview({
  onChat,
  onOpen,
  provider,
  keyReady,
  profile,
  selectedPet,
  needsIdentity,
  onConfigureIdentity,
  onDismissIdentity,
}: {
  onChat: () => void;
  onOpen: (section: Section) => void;
  provider: ProviderSettings;
  keyReady: boolean;
  profile: ProfileData;
  selectedPet: string;
  needsIdentity: boolean;
  onConfigureIdentity: () => void;
  onDismissIdentity: () => void;
}) {
  const today = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date())
    .toLocaleUpperCase('pt-BR');
  return (
    <div className="page overview-page">
      <div className="welcome-row">
        <div>
          <span className="eyebrow">{today}</span>
          <h1>
            {profile.displayName
              ? `Olá, ${profile.displayName}. Vamos dar forma às suas ideias.`
              : 'Um espaço para dar forma às suas ideias.'}
          </h1>
          <p>Um lugar para pensar, criar e conversar com a IA que você escolher.</p>
        </div>
        <div className="welcome-mark">
          {profile.avatarDataUrl ? (
            <img src={profile.avatarDataUrl} alt="Avatar do perfil" />
          ) : (
            <span>{initials(profile.displayName)}</span>
          )}
          <i />
        </div>
      </div>
      {needsIdentity && (
        <section className="identity-setup-card" aria-label="Configuração de identidade">
          <div>
            <strong>Configurar identidade</strong>
            <p>Defina seu nome e as preferências usadas pelo OdeKrai.</p>
          </div>
          <Button type="button" variant="secondary" onClick={onConfigureIdentity}>
            Configurar
          </Button>
          <Button
            type="button"
            variant="ghost"
            aria-label="Dispensar cartão de configuração de identidade"
            onClick={onDismissIdentity}
          >
            Dispensar
          </Button>
        </section>
      )}
      <section className="hero-card">
        <div className="hero-pet-space">
          <PetSprite estado="idle" petId={selectedPet} />
        </div>
        <div className="hero-content">
          <span className="pill-label">
            <i /> OdeKrai
          </span>
          <h2>
            Uma mente curiosa.
            <br />
            <em>Seu jeito de fazer.</em>
          </h2>
          <p>
            Conecte seu provedor de IA e comece uma conversa. Sua chave fica no Gerenciador de
            Credenciais do Windows.
          </p>
          <button className="primary-button" onClick={onChat}>
            Iniciar conversa <Icon name="external-link" />
          </button>
        </div>
        <div className="hero-footer">
          <span>
            <i /> AMBIENTE LOCAL
          </span>
          <span>FEITO PARA ACOMPANHAR</span>
        </div>
      </section>
      <div className="section-title">
        <div>
          <span className="eyebrow">PONTO DE PARTIDA</span>
          <h3>Conheça o OdeKrai</h3>
        </div>
        <button className="text-button" onClick={() => onOpen('settings')}>
          Personalizar <Icon name="external-link" />
        </button>
      </div>
      <div className="cards-grid">
        <button className="feature-card provider-card" onClick={() => onOpen('providers')}>
          <div className="card-icon red-icon">
            <Icon name="connectors" />
          </div>
          <div className="feature-copy">
            <span className="eyebrow">INTELIGÊNCIA</span>
            <h4>{keyReady ? 'Provedor configurado' : 'Escolha sua IA'}</h4>
            <p>
              {keyReady
                ? `${provider.name} · ${provider.model}`
                : 'Conecte uma IA para habilitar conversas.'}
            </p>
          </div>
          <span className="card-arrow">
            <Icon name="external-link" />
          </span>
        </button>
        <button className="feature-card companion-card" onClick={() => onOpen('companion')}>
          <div className="card-icon neutral-icon">
            <Icon name="pet" />
          </div>
          <div className="feature-copy">
            <span className="eyebrow">PERSONALIZAÇÃO</span>
            <h4>Seu espaço de presença</h4>
            <p>Conheça o OdeKrai e configure seu pet.</p>
          </div>
          <span className="card-arrow">
            <Icon name="external-link" />
          </span>
        </button>
      </div>
      <div className="privacy-note">
        <Icon name="shield" />
        <p>
          <strong>Privacidade desde o primeiro passo.</strong> Preferências são salvas localmente. O
          conteúdo da conversa é enviado apenas ao provedor que você configurar.
        </p>
        <button onClick={() => onOpen('settings')}>
          Saiba mais <Icon name="external-link" />
        </button>
      </div>
      <div className="home-footer">
        <span>
          OdeKrai <b>·</b> VERSÃO 0.1.0
        </span>
        <span>UM COMPANHEIRO PARA O SEU DIA A DIA</span>
      </div>
    </div>
  );
}
