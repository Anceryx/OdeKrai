import { describe, expect, it } from 'vitest';
import {
  LEGACY_SETTINGS_SECTIONS,
  persistPage,
  readLastPage,
  resolveAgentReason,
  resolveConfigurationReason,
  resolveNavigation,
} from './navigation';
import type { Section } from '../ui/screens/types';

describe('modelo de navegação', () => {
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
});
