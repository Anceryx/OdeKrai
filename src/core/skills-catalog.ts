export type SkillStatus = 'installed' | 'available' | 'configuration_required' | 'unavailable';

export type SkillCategory = 'local' | 'integration';

export type CatalogSkill = {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  status: SkillStatus;
  enabled: boolean;
  fixedBlocked: boolean;
};

type SkillCommand = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export async function setSkillEnabledCommand(
  skillId: string,
  enabled: boolean,
  command: SkillCommand,
): Promise<void> {
  await command('set_skill_enabled', { skillId, enabled });
}

export async function setSkillGroupEnabledCommand(
  category: SkillCategory,
  enabled: boolean,
  command: SkillCommand,
): Promise<void> {
  await command('set_skill_group_enabled', { category, enabled });
}

export function filterSkills<T extends CatalogSkill>(skills: T[], query: string): T[] {
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  if (!normalized) return skills;
  return skills.filter((skill) =>
    `${skill.name} ${skill.description} ${skill.id}`
      .toLocaleLowerCase('pt-BR')
      .includes(normalized),
  );
}

export function groupSkills<T extends CatalogSkill>(skills: T[], category: SkillCategory): T[] {
  return skills.filter((skill) => skill.category === category);
}

export function canEnableSkill(skill: CatalogSkill, configured = true): boolean {
  return (
    skill.status !== 'unavailable' && (skill.status !== 'configuration_required' || configured)
  );
}

export function groupEnableTarget(skills: CatalogSkill[], configured = true): boolean | undefined {
  const eligible = skills.filter((skill) => canEnableSkill(skill, configured));
  if (eligible.length === 0) return undefined;
  return !eligible.every((skill) => skill.enabled);
}
