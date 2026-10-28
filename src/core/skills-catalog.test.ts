import { describe, expect, it, vi } from 'vitest';
import {
  canEnableSkill,
  filterSkills,
  groupEnableTarget,
  groupSkills,
  setSkillEnabledCommand,
  setSkillGroupEnabledCommand,
  type CatalogSkill,
} from './skills-catalog';

const skills: CatalogSkill[] = [
  {
    id: 'files.read',
    name: 'Ler arquivo',
    description: 'Lê arquivos permitidos',
    category: 'local',
    status: 'available',
    enabled: false,
    fixedBlocked: false,
  },
  {
    id: 'discord.send',
    name: 'Enviar ao Discord',
    description: 'Envia mensagens por webhook',
    category: 'integration',
    status: 'configuration_required',
    enabled: false,
    fixedBlocked: false,
  },
  {
    id: 'mcp.placeholder',
    name: 'MCP indisponível',
    description: 'Não registrado',
    category: 'integration',
    status: 'unavailable',
    enabled: false,
    fixedBlocked: true,
  },
];

describe('catálogo de habilidades', () => {
  it('filtra por nome, descrição ou identificador sem diferenciar caixa', () => {
    expect(filterSkills(skills, 'ARQUIVOS').map(({ id }) => id)).toEqual(['files.read']);
    expect(filterSkills(skills, 'discord.send')).toHaveLength(1);
    expect(filterSkills(skills, '  desconhecida ')).toEqual([]);
  });

  it('separa habilidades locais e integrações pelo registro recebido', () => {
    expect(groupSkills(skills, 'local').map(({ id }) => id)).toEqual(['files.read']);
    expect(groupSkills(skills, 'integration')).toHaveLength(2);
  });

  it('não permite ativar itens indisponíveis ou ainda sem configuração', () => {
    expect(canEnableSkill(skills[0])).toBe(true);
    expect(canEnableSkill(skills[1], false)).toBe(false);
    expect(canEnableSkill(skills[1], true)).toBe(true);
    expect(canEnableSkill(skills[2], true)).toBe(false);
  });

  it('define ativação por grupo somente para itens elegíveis', () => {
    expect(groupEnableTarget(skills.slice(0, 1))).toBe(true);
    expect(groupEnableTarget(skills.slice(1), false)).toBeUndefined();
  });

  it('envia ativação individual e por grupo aos comandos Rust com parâmetros fechados', async () => {
    const command = vi.fn(async (_name: string, _args?: Record<string, unknown>) => undefined);
    await setSkillEnabledCommand('files.read', true, command);
    await setSkillGroupEnabledCommand('local', false, command);
    expect(command.mock.calls).toEqual([
      ['set_skill_enabled', { skillId: 'files.read', enabled: true }],
      ['set_skill_group_enabled', { category: 'local', enabled: false }],
    ]);
  });
});
