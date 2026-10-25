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
      />,
    );
    expect(markup).toContain('Dados e privacidade');
    expect(markup).toContain('Ao fechar a janela');
    expect(markup).toContain('Sobre');
    expect(markup).toContain('WebView2');
  });
});
