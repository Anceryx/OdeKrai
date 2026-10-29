import { describe, expect, it } from 'vitest';
import settingsSource from '../ui/screens/Settings.tsx?raw';
import agentHomeSource from '../ui/AgentHome.tsx?raw';
import assistantSource from '../ui/screens/Assistant.tsx?raw';
import computerSource from '../ui/screens/Computer.tsx?raw';
import settingsModalSource from '../ui/SettingsModal.tsx?raw';
import securityCenterSource from '../ui/SecurityCenter.tsx?raw';
import {
  filterSettingsIndex,
  filterSettingsMenu,
  SETTINGS_INDEX,
  SETTINGS_MENU,
  settingsMenuLayout,
} from './settings-navigation';

const sourceBySection = {
  geral: settingsSource,
  'perfil-memoria': agentHomeSource,
  assistente: assistantSource,
  computador: computerSource,
  habilidades: settingsModalSource,
  conectores: settingsModalSource,
  privacidade: securityCenterSource,
  atividade: securityCenterSource,
  sobre: settingsSource,
} as const;

describe('navegação das configurações', () => {
  it('lista as nove seções previstas', () => {
    expect(SETTINGS_MENU.map((section) => section.id)).toEqual([
      'geral',
      'perfil-memoria',
      'assistente',
      'computador',
      'habilidades',
      'conectores',
      'privacidade',
      'atividade',
      'sobre',
    ]);
  });

  it('filtra opções e seções pelo mesmo índice', () => {
    expect(filterSettingsIndex('microfone').map((entry) => entry.anchor)).toContain(
      'settings-audio',
    );
    expect(filterSettingsMenu('microfone').map((section) => section.id)).toContain('geral');
    expect(filterSettingsIndex('memoria').map((entry) => entry.anchor)).toContain(
      'identity-memory',
    );
    expect(filterSettingsMenu('privacidade').map((section) => section.id)).toContain('privacidade');
  });

  it('garante que cada opção do índice aponta para um ID existente na tela correspondente', () => {
    const sources = new Map(Object.entries(sourceBySection));
    for (const entry of SETTINGS_INDEX) {
      expect(sources.get(entry.section), entry.title).toContain(entry.anchor);
    }
  });

  it('usa lista suspensa abaixo de 800 px e menu vertical a partir de 800 px', () => {
    expect(settingsMenuLayout(799)).toBe('select');
    expect(settingsMenuLayout(800)).toBe('vertical');
  });
});
