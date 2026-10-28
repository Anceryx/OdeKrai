import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../core/settings';
import { AI_PROVIDERS } from '../../core/providers';
import { Icon } from '../Icon';
import { ProvidersScreen } from './Providers';

describe('ProvidersScreen', () => {
  it('monta o catálogo', () => {
    const markup = renderToStaticMarkup(
      <ProvidersScreen
        settings={defaultSettings}
        selectedId={AI_PROVIDERS[0].id}
        onSelect={() => undefined}
        onSetPrimary={() => undefined}
        onToggleEnabled={() => undefined}
        onSave={() => undefined}
        onChat={() => undefined}
        onCredentialRemoved={() => undefined}
      />,
    );
    expect(markup).toContain('Provedores de IA');
  });

  it('mostra as três abas e um ícone de fallback no cartão local', () => {
    const markup = renderToStaticMarkup(
      <ProvidersScreen
        settings={defaultSettings}
        selectedId="local"
        onSelect={() => undefined}
        onSetPrimary={() => undefined}
        onToggleEnabled={() => undefined}
        onSave={() => undefined}
        onChat={() => undefined}
        onCredentialRemoved={() => undefined}
      />,
    );

    expect(markup).toContain('Conectados');
    expect(markup).toContain('Gratuitos');
    expect(markup).toContain('Todos');
    expect(markup).toContain(renderToStaticMarkup(<Icon name="harddrives" size={18} />));
  });
});
