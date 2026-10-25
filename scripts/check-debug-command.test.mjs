import { describe, expect, it } from 'vitest';
import { verifyDebugCommandSources } from './check-debug-command.mjs';

const guardedDeclaration =
  '#[cfg(debug_assertions)]\n#[tauri::command]\npub fn submit_simulated_action(';
const guardedRegistration = '#[cfg(debug_assertions)]\nsecurity::submit_simulated_action,';

describe('proteção de comandos exclusivos de debug', () => {
  it('aceita declaração e registro encontrados em arquivos Rust distintos', () => {
    expect(verifyDebugCommandSources([guardedDeclaration, guardedRegistration])).toBe(true);
  });

  it('rejeita a declaração sem cfg(debug_assertions)', () => {
    expect(
      verifyDebugCommandSources([
        '#[tauri::command]\npub fn submit_simulated_action(',
        guardedRegistration,
      ]),
    ).toBe(false);
  });

  it('rejeita registro do comando fora de cfg(debug_assertions)', () => {
    expect(
      verifyDebugCommandSources([
        guardedDeclaration,
        guardedRegistration,
        'security::submit_simulated_action,',
      ]),
    ).toBe(false);
  });
});
