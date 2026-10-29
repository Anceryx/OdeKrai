import { describe, expect, it } from 'vitest';
import {
  LEGACY_SETTINGS_SECTIONS,
  persistPage,
  persistSettingsSection,
  readLastPage,
  readLastSettingsSection,
  type NavigationView,
  resolveAgentReason,
  resolveConfigurationReason,
  resolveLegacySettingsNavigation,
  resolveLegacyScreenNavigation,
  resolveNavigation,
} from './navigation';
import type { Section } from '../ui/screens/types';

describe('modelo de navegação', () => {
  it('abre atividade pela rota antiga em tela completa', () => {
    expect(
      resolveLegacyScreenNavigation('activity', {
        route: { page: 'skills', settingsSection: 'privacidade' },
        section: 'skills',
        settingsOpen: true,
      }),
    ).toEqual({ route: { page: 'skills' }, section: 'activity', settingsOpen: false });
  });

  it.each([
    ['agent', 'perfil-memoria'],
    ['companion', 'assistente'],
    ['settings', 'geral'],
    ['permissions', 'privacidade'],
    ['activity', 'atividade'],
    ['computer', 'computador'],
  ] as const)('mapeia %s para a seção futura %s mantendo a tela legada', (id, settingsSection) => {
    const result = resolveNavigation(id);
    expect(result).toEqual({ route: { page: 'overview', settingsSection }, section: id });
  });

  it.each([
    'overview',
    'chat',
    'providers',
    'companion',
    'settings',
    'permissions',
    'activity',
    'agent',
    'computer',
    'skills',
    'calendar',
  ] as const satisfies readonly Section[])('mantém o destino de tela legado %s', (section) =>
    expect(resolveNavigation(section).section).toBe(section),
  );

  it('declara apenas os seis IDs de compatibilidade solicitados', () => {
    expect(Object.keys(LEGACY_SETTINGS_SECTIONS).sort()).toEqual(
      ['agent', 'activity', 'companion', 'computer', 'permissions', 'settings'].sort(),
    );
  });

  it.each([
    ['agent', 'perfil-memoria'],
    ['companion', 'assistente'],
    ['settings', 'geral'],
    ['permissions', 'privacidade'],
    ['activity', 'atividade'],
    ['computer', 'computador'],
  ] as const)('abre o modal por %s sem trocar a página atual', (id, settingsSection) => {
    const current = {
      route: { page: 'chat' as const },
      section: 'chat' as const,
      settingsOpen: false,
    };
    expect(resolveLegacySettingsNavigation(id, current)).toEqual({
      route: { page: 'chat', settingsSection },
      section: 'chat',
      settingsOpen: true,
    });
  });

  it('preserva a conversa ao abrir, fechar e reabrir Seu computador repetidamente', () => {
    const chatView = {
      route: { page: 'chat' as const },
      section: 'chat' as const,
      settingsOpen: false,
    };
    let current: NavigationView = chatView;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const opened = resolveLegacySettingsNavigation('computer', current);
      if (!opened) throw new Error('A seção de computador deve estar registrada.');
      expect(opened).toMatchObject({
        route: { page: 'chat', settingsSection: 'computador' },
        section: 'chat',
        settingsOpen: true,
      });
      current = { ...opened, settingsOpen: false };
    }

    expect(current).toEqual({
      route: { page: 'chat', settingsSection: 'computador' },
      section: 'chat',
      settingsOpen: false,
    });
  });

  it.each([
    ['pasta ausente', 'agent'],
    ['identidade pendente', 'agent'],
    ['habilidade indisponível', 'skills'],
    ['parada de emergência ativada', 'permissions'],
    ['outro motivo', 'providers'],
    ['pasta e parada de emergência', 'agent'],
  ] as const)('preserva o roteamento de disponibilidade: %s', (reason, expected) => {
    expect(resolveAgentReason(reason)).toBe(expected);
  });

  it.each([
    ['IDENTIDADE não aprovada', 'agent'],
    ['Pasta do OdeKrai ausente', 'agent'],
    ['habilidade desativada', 'skills'],
    ['limite diário atingido', 'settings'],
    ['erro de conexão', 'providers'],
  ] as const)('preserva o roteamento de configuração: %s', (reason, expected) => {
    expect(resolveConfigurationReason(reason)).toBe(expected);
  });

  it('lê e persiste somente páginas válidas', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(readLastPage(storage)).toBe('overview');
    persistPage('calendar', storage);
    expect(readLastPage(storage)).toBe('calendar');
    values.set('odekrai:last-page', 'agent');
    expect(readLastPage(storage)).toBe('overview');
  });

  it('lembra apenas seções de configurações válidas', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(readLastSettingsSection(storage)).toBe('geral');
    persistSettingsSection('sobre', storage);
    expect(readLastSettingsSection(storage)).toBe('sobre');
    values.set('odekrai:last-settings-section', 'computer');
    expect(readLastSettingsSection(storage)).toBe('geral');
  });
});
