import { describe, expect, it } from 'vitest';
import { findMissingWindowPermissions, findWindowCalls } from './check-window-api-acl.mjs';

describe('verificação de ACL da API de janela', () => {
  it('identifica métodos de janela e ignora comandos Rust', () => {
    expect(
      findWindowCalls(
        "getCurrentWindow().show(); getCurrentWindow().setFocus(); invoke('show_main_window');",
      ),
    ).toEqual(['show', 'setFocus']);
  });

  it('identifica chamadas por referência de janela atribuída a variável', () => {
    expect(findWindowCalls('const current = getCurrentWindow(); current.show();')).toEqual([
      'show',
    ]);
  });

  it('detecta chamada sem permissão na capability e aceita permissão específica', () => {
    expect(findMissingWindowPermissions(['show', 'setFocus'], ['core:window:allow-show'])).toEqual([
      'core:window:allow-set-focus',
    ]);
    expect(findMissingWindowPermissions(['show'], ['core:window:allow-show'])).toEqual([]);
  });
});
