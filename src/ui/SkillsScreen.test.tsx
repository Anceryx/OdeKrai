import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CatalogSkill } from '../core/skills-catalog';
import { SkillsCatalogView } from './SkillsScreen';

const registryFixture: CatalogSkill[] = [
  {
    id: 'files.read',
    name: 'Ler arquivo',
    description: 'Lê texto em uma pasta permitida.',
    risk: 'leitura',
    resultTrust: 'local',
    enabled: true,
    morePermissive: false,
    fixedBlocked: false,
    category: 'local',
    status: 'installed',
    configurationRequired: false,
    family: 'arquivos',
    icon: 'folder',
    examples: ['Leia o relatório da pasta permitida.'],
    origin: { kind: 'builtin' },
  },
  {
    id: 'files.write',
    name: 'Gravar arquivo',
    description: 'Grava texto com cópia anterior reversível.',
    risk: 'escrita_reversivel',
    resultTrust: 'local',
    enabled: false,
    morePermissive: false,
    fixedBlocked: false,
    category: 'local',
    status: 'available',
    configurationRequired: false,
    family: 'arquivos',
    icon: 'folder',
    examples: ['Grave um resumo em notas.txt.'],
    origin: { kind: 'builtin' },
  },
  {
    id: 'theme.set',
    name: 'Alterar tema do Windows',
    description: 'Experimental: alterna entre tema claro e escuro.',
    risk: 'escrita_reversivel',
    resultTrust: 'local',
    enabled: false,
    morePermissive: false,
    fixedBlocked: false,
    category: 'local',
    status: 'available',
    configurationRequired: false,
    family: 'computador',
    icon: 'desktop',
    examples: ['Altere o tema do Windows para escuro.'],
    origin: { kind: 'builtin' },
  },
];

const noOperation = () => undefined;

describe('catálogo de habilidades', () => {
  it('exibe somente as famílias e habilidades recebidas do registro simulado', () => {
    const markup = renderToStaticMarkup(
      <SkillsCatalogView
        skills={registryFixture}
        initialFamily="computador"
        onOpenPrivacy={noOperation}
        onFamilyToggle={noOperation}
        onSkillToggle={noOperation}
        onOverrideToggle={noOperation}
      />,
    );
    expect(markup).toContain('Habilidades');
    expect(markup).toContain('Procurar habilidades');
    expect(markup).toContain('Computador');
    expect(markup).toContain('Alterar tema do Windows');
    expect(markup).not.toContain('Integrações MCP');
    expect(markup).not.toContain('Conexão com o Google');
    expect(markup).not.toContain('Captura de tela: indisponível');
    expect(markup).toContain('Abrir Privacidade e permissões');
    expect(markup.match(/class="skills-family-card(?: expanded)?"/g)).toHaveLength(2);
    expect(markup).toContain('Experimental');
  });

  it('mostra busca por teclado, status, risco e um interruptor por família', () => {
    const markup = renderToStaticMarkup(
      <SkillsCatalogView
        skills={registryFixture}
        onFamilyToggle={noOperation}
        onSkillToggle={noOperation}
        onOverrideToggle={noOperation}
      />,
    );
    expect(markup).toContain('type="search"');
    expect(markup).toContain('placeholder="Nome, descrição, exemplo ou família"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-label="Ativar todas as habilidades de Arquivos"');
    expect(markup).toContain('aria-label="Ativar todas as habilidades de Computador"');
    expect(markup).toContain('Risco: Escrita reversível');
    expect(markup.match(/role="switch"/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Famílias ativas"');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('role="tabpanel"');
  });

  it('adapta os cartões a janelas estreitas e mantém o foco visível', () => {
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    expect(css).toContain('grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr))');
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.skills-family-grid\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/,
    );
    expect(css).toContain('.skills-catalog-page :is(button, input):focus-visible');
  });

  it('mantém estados de carregamento e erro acessíveis', () => {
    const loading = renderToStaticMarkup(
      <SkillsCatalogView
        skills={[]}
        loading
        onFamilyToggle={noOperation}
        onSkillToggle={noOperation}
        onOverrideToggle={noOperation}
      />,
    );
    const failed = renderToStaticMarkup(
      <SkillsCatalogView
        skills={[]}
        error="Falha ao carregar habilidades."
        onFamilyToggle={noOperation}
        onSkillToggle={noOperation}
        onOverrideToggle={noOperation}
      />,
    );
    expect(loading).toContain('role="status"');
    expect(loading).toContain('Carregando habilidades');
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('Falha ao carregar habilidades.');
  });

  it('apresenta Público vazio e sem ações fictícias', () => {
    const markup = renderToStaticMarkup(
      <SkillsCatalogView
        skills={registryFixture}
        initialTab="publico"
        onFamilyToggle={noOperation}
        onSkillToggle={noOperation}
        onOverrideToggle={noOperation}
      />,
    );
    expect(markup).toContain('Pessoal');
    expect(markup).toContain('Público');
    expect(markup).toContain('Plugins públicos em breve');
    expect(markup).toContain('Populares');
    expect(markup).toContain('Novidades');
    expect(markup).toContain('Nenhum plugin publicado.');
    expect(markup).toMatch(/id="skills-panel-personal"[^>]*hidden=""/);
    expect(markup).not.toMatch(/id="skills-panel-public"[^>]*hidden=""/);
    expect(markup).not.toContain('Instalar');
  });

  it('mantém o atalho instalado abrindo detalhes e controles individuais dentro do gerenciamento', () => {
    const markup = renderToStaticMarkup(
      <SkillsCatalogView
        skills={registryFixture}
        initialFamily="arquivos"
        onFamilyToggle={noOperation}
        onSkillToggle={noOperation}
        onOverrideToggle={noOperation}
      />,
    );
    expect(markup).toContain('aria-label="Abrir detalhes de Arquivos"');
    expect(markup).toContain('Habilidades desta família');
    expect(markup).toContain('Leia o relatório da pasta permitida.');
    expect(markup).toContain('Desativar Ler arquivo');
  });

  it('mantém a configuração Google apenas nos detalhes quando as habilidades Google vêm do registro', () => {
    const googleSkill: CatalogSkill = {
      ...registryFixture[0],
      id: 'google.calendar.list_events',
      name: 'Consultar Google Calendar',
      family: 'agenda_lembretes',
      icon: 'calendar',
      examples: ['Consulte os eventos desta semana.'],
    };
    const markup = renderToStaticMarkup(
      <SkillsCatalogView
        skills={[googleSkill]}
        initialFamily="agenda_lembretes"
        googleConnection={<section>Conexão com o Google</section>}
        onFamilyToggle={noOperation}
        onSkillToggle={noOperation}
        onOverrideToggle={noOperation}
      />,
    );
    expect(markup).toContain('Conexão com o Google');
    expect(markup).toContain('Consultar Google Calendar');
  });

  it('mantém o catálogo baseado em get_skills e a ativação em comandos Rust', () => {
    const source = readFileSync(new URL('./SkillsScreen.tsx', import.meta.url), 'utf8');
    expect(source).toContain("invoke<CatalogSkill[]>('get_skills')");
    expect(source).toContain('setSkillGroupEnabledCommand(family, enabled, invoke)');
    expect(source).toContain('setSkillEnabledCommand(skill.id, enabled, invoke)');
    expect(source).toContain("invoke<GoogleOAuthStatus>('google_oauth_status')");
    expect(source).toContain("skill.id.startsWith('google.calendar.')");
    expect(source).toContain('PrivacyConfigurationSummary onOpen={onOpenPrivacy}');
  });
});
