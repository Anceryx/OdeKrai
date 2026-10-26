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
  });
});
