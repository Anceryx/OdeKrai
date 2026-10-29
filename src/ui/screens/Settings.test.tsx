import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../core/settings';
import { SettingsScreen } from './Settings';

describe('SettingsScreen', () => {
  it('monta as seções de preferências', () => {
    const markup = renderToStaticMarkup(
      <SettingsScreen
        settings={defaultSettings}
        update={() => undefined}
        onDeleteAllHistory={async () => false}
        onOpenPermissions={() => undefined}
      />,
    );
    expect(markup).toContain('Dados e privacidade');
    expect(markup).toContain('Provedores alternativos');
    expect(markup).toContain('Uso de tokens');
    expect(markup).toContain('Limite diário');
    expect(markup).toContain('Estado: Dentro do limite');
    expect(markup).toContain('Ao fechar a janela');
    expect(markup).toContain('Voltas máximas');
    expect(markup).toContain('Sempre perguntar');
    expect(markup).toContain('Abrir Permissões');
    expect(markup).toContain('Links externos');
    expect(markup).toContain('Sobre');
    expect(markup).toContain('WebView2');
    expect(markup).toContain('Data do build (local)');
    expect(markup).toContain('Data do build (UTC)');
    expect(markup).toContain('Windows');
    expect(markup).toContain('Licença');
    expect(markup).toContain('Copiar informações');
    expect(markup).toContain('Abrir pasta de logs');
  });

  it('limita a seção Sobre ao painel de informações quando embutida', () => {
    const markup = renderToStaticMarkup(
      <SettingsScreen
        settings={defaultSettings}
        update={() => undefined}
        onDeleteAllHistory={async () => false}
        onOpenPermissions={() => undefined}
        embedded
        embeddedSection="about"
      />,
    );
    expect(markup).toContain('settings-embedded-content about-only');
    expect(markup).toContain('id="settings-about"');
  });
});
