import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PermissionsScreen } from './Permissions';

describe('PermissionsScreen', () => {
  it('monta a tela de permiss?es', () => {
    expect(renderToStaticMarkup(<PermissionsScreen />)).toContain('security-page');
  });
});
