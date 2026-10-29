import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../core/settings';
import { PrivacyConfigurationSummary, PrivacyConfigurations } from './PrivacyConfigurations';

describe('configurações de privacidade', () => {
  it('mantém os controles em Privacidade e o resumo de Habilidades somente para leitura', () => {
    const settingsMarkup = renderToStaticMarkup(
      <PrivacyConfigurations settings={defaultSettings} update={() => undefined} />,
    );
    const summaryMarkup = renderToStaticMarkup(
      <PrivacyConfigurationSummary onOpen={() => undefined} />,
    );
    expect(settingsMarkup).toContain('Pastas permitidas');
    expect(settingsMarkup).toContain('Aplicativos permitidos');
    expect(settingsMarkup).toContain('Servidores locais');
    expect(summaryMarkup).toContain('Abrir Privacidade e permissões');
    expect(summaryMarkup).not.toContain('Escolher aplicativo');
    expect(summaryMarkup).not.toContain('Adicionar Documentos');
  });

  it('preserva os comandos de persistência da interface e seus registros Rust', () => {
    const ui = readFileSync(new URL('./PrivacyConfigurations.tsx', import.meta.url), 'utf8');
    const skillsUi = readFileSync(new URL('./SkillsScreen.tsx', import.meta.url), 'utf8');
    const rustCommands = readFileSync(
      new URL('../../src-tauri/src/lib.rs', import.meta.url),
      'utf8',
    );
    const commands = [
      'get_allowed_folders',
      'add_allowed_folder',
      'remove_allowed_folder',
      'get_allowed_apps',
      'register_allowed_app',
      'remove_allowed_app',
      'mcp_list_servers',
      'mcp_add_server',
      'mcp_set_secret',
      'mcp_set_enabled',
      'mcp_test_connection',
      'mcp_remove_server',
      'get_trusted_external_domains',
      'trust_external_domain',
      'forget_external_domain',
    ];
    for (const command of commands) {
      expect(ui, `interface: ${command}`).toContain(command);
      expect(skillsUi, `sem duplicação em Habilidades: ${command}`).not.toContain(command);
      expect(rustCommands, `registro Rust: ${command}`).toContain(command);
    }
    const discordUi = readFileSync(
      new URL('./DiscordWebhooksSettings.tsx', import.meta.url),
      'utf8',
    );
    const discordCommands = readFileSync(
      new URL('../core/discord-integration.ts', import.meta.url),
      'utf8',
    );
    expect(discordUi).toContain('discord_list');
    expect(rustCommands).toContain('discord_list');
    for (const command of ['discord_test_connection', 'discord_save', 'discord_remove']) {
      expect(discordCommands).toContain(command);
    }
  });
});
