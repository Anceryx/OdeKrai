import { describe, expect, it } from 'vitest';
import { hasDebugGuard } from './check-debug-command.mjs';

describe('proteção de comandos exclusivos de debug', () => {
  it('aceita a declaração e o registro condicionados a debug_assertions', () => {
    const declaration =
      /#\[cfg\(debug_assertions\)\]\s*#\[tauri::command\]\s*pub\s+fn\s+submit_simulated_action\s*\(/;
    const registration = /#\[cfg\(debug_assertions\)\]\s*security::submit_simulated_action\s*,/;
    expect(
      hasDebugGuard(
        '#[cfg(debug_assertions)]\n#[tauri::command]\npub fn submit_simulated_action(',
        declaration,
      ),
    ).toBe(true);
    expect(
      hasDebugGuard('#[cfg(debug_assertions)]\nsecurity::submit_simulated_action,', registration),
    ).toBe(true);
  });

  it('rejeita o comando quando a guarda de release está ausente', () => {
    const registration = /#\[cfg\(debug_assertions\)\]\s*security::submit_simulated_action\s*,/;
    expect(hasDebugGuard('security::submit_simulated_action,', registration)).toBe(false);
  });
});
