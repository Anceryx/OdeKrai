import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../core/settings';
import { SettingsScreen } from './Settings';
import { AboutSettings } from './AboutSettings';

describe('SettingsScreen', () => {
  it('monta as seções de preferências', () => {
    const markup = renderToStaticMarkup(
      <SettingsScreen
        settings={defaultSettings}
        update={() => undefined}
        onOpenPermissions={() => undefined}
      />,
    );
    expect(markup).toContain('Provedores alternativos');
    expect(markup).toContain('Uso de tokens');
    expect(markup).toContain('Limite diário');
    expect(markup).toContain('Estado: Dentro do limite');
    expect(markup).toContain('Ao fechar a janela');
    expect(markup).toContain('Voltas máximas');
    expect(markup).toContain('Sempre perguntar');
    expect(markup).toContain('Abrir Permissões');
    expect(markup).not.toContain('Links externos');
    expect(markup).toContain('Preferências deste dispositivo');
  });

  it('exibe as informações de versão em um componente independente', () => {
    const markup = renderToStaticMarkup(<AboutSettings />);
    expect(markup).toContain('id="settings-about"');
    expect(markup).toContain('WebView2');
    expect(markup).toContain('Licença');
    expect(markup).toContain('Abrir pasta de logs');
  });
});
