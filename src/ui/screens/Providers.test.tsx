import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../core/settings';
import { AI_PROVIDERS } from '../../core/providers';
import { ProvidersScreen } from './Providers';

describe('ProvidersScreen', () => {
  it('monta o catálogo', () => {
    const markup = renderToStaticMarkup(
      <ProvidersScreen
        settings={defaultSettings}
        keySaved={false}
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
});
