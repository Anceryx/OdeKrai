import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultProviderSettings } from '../../core/settings';
import { Overview } from './Overview';

describe('Overview', () => {
  it('monta a tela inicial com o conteúdo principal', () => {
    const markup = renderToStaticMarkup(
      <Overview
        onChat={() => undefined}
        onOpen={() => undefined}
        provider={{ ...defaultProviderSettings('openai'), model: 'gpt-test' }}
        keyReady={false}
        profile={{ displayName: 'Teste', nickname: '', avatarDataUrl: null }}
        selectedPet="character-female-a"
        needsIdentity={false}
        onConfigureIdentity={() => undefined}
        onDismissIdentity={() => undefined}
      />,
    );
    expect(markup).toContain('Olá, Teste. Vamos dar forma às suas ideias.');
    expect(markup).toContain('hero-card');
  });
});
