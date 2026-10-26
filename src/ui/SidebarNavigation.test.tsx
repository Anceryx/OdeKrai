import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SidebarNavigation } from './SidebarNavigation';

describe('SidebarNavigation', () => {
  it('renderiza os rótulos do menu com acentuação correta', () => {
    const markup = renderToStaticMarkup(
      <SidebarNavigation
        section="overview"
        onSelectSection={() => undefined}
        onSetChatMode={() => undefined}
        keySavedForSession={false}
      />,
    );

    for (const label of [
      'Visão geral',
      'Identidade e memória',
      'Configurações',
      'Permissões',
      'Habilidades',
    ]) {
      expect(markup).toContain(label);
    }
  });
});
