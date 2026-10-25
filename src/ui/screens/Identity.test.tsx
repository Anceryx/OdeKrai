import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IdentityScreen } from './Identity';

describe('IdentityScreen', () => {
  it('monta o painel de identidade', () => {
    const markup = renderToStaticMarkup(
      <IdentityScreen
        profileValue={{ displayName: '', nickname: '', avatarDataUrl: null }}
        onProfileChange={() => undefined}
      />,
    );
    expect(markup.length).toBeGreaterThan(0);
  });
});
