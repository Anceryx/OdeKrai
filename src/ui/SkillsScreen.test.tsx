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

const discordSkill: CatalogSkill = {
  id: 'discord.send',
  name: 'Enviar mensagem ao Discord',
  description: 'Envia mensagem por webhook, sempre após aprovação.',
  risk: 'comunicacao_externa',
  resultTrust: 'local',
  enabled: true,
  morePermissive: false,
  fixedBlocked: true,
  category: 'integration',
  status: 'installed',
  configurationRequired: false,
  family: 'mensagens',
  icon: 'message',
  examples: ['Envie uma mensagem aprovada.'],
  origin: { kind: 'builtin' },
};

describe('catálogo de habilidades', () => {
  it('distingue habilidade Discord ativa de ferramenta exposta ao agente', () => {
    const render = (agentRuntime: {
      modeEnabled: boolean;
      available: boolean;
      reason: string | null;
    }) =>
      renderToStaticMarkup(
        <SkillsCatalogView
          skills={[discordSkill]}
          initialFamily="mensagens"
          agentRuntime={agentRuntime}
          onFamilyToggle={noOperation}
          onSkillToggle={noOperation}
          onOverrideToggle={noOperation}
        />,
      );

    expect(render({ modeEnabled: false, available: true, reason: null })).toContain(
      'habilidade ativa, mas não exposta: o modo agente está desligado nesta conversa.',
    );
    expect(
      render({
        modeEnabled: false,
        available: false,
        reason: 'Este modelo não tem suporte verificado a ferramentas.',
      }),
    ).toContain('Este modelo não tem suporte verificado a ferramentas.');
    expect(render({ modeEnabled: true, available: true, reason: null })).toContain(
      'ferramenta disponível para esta conversa; cada envio ainda exige aprovação.',
    );
    expect(
      renderToStaticMarkup(
        <SkillsCatalogView
          skills={[
            {
              ...discordSkill,
              enabled: false,
              status: 'configuration_required',
              configurationRequired: true,
            },
          ]}
          initialFamily="mensagens"
          agentRuntime={{ modeEnabled: true, available: true, reason: null }}
          onFamilyToggle={noOperation}
          onSkillToggle={noOperation}
          onOverrideToggle={noOperation}
        />,
      ),
    ).toContain('configure e teste um webhook válido');
    expect(
      renderToStaticMarkup(
        <SkillsCatalogView
          skills={[{ ...discordSkill, enabled: false, status: 'available' }]}
          initialFamily="mensagens"
          agentRuntime={{ modeEnabled: true, available: true, reason: null }}
          onFamilyToggle={noOperation}
          onSkillToggle={noOperation}
          onOverrideToggle={noOperation}
        />,
      ),
    ).toContain('habilidade desativada; ela não é enviada ao modelo.');
  });

  it('não mantém estilos dos cartões individuais substituídos pelo catálogo por família', () => {
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    const legacySelectors = [
      '.skill-card',
      '.skill-title-row',
      '.skill-status',
      '.skills-catalog-group',
      '.skills-family-details',
    ];

    for (const selector of legacySelectors) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(styles).not.toMatch(new RegExp(`${escaped}(?=[\\s:{>+~])`));
    }
  });

  it('exibe somente as famílias e habilidades recebidas do registro simulado', () => {
    const markup = renderToStaticMarkup(
      <SkillsCatalogView
        skills={registryFixture}
        onOpenPrivacy={noOperation}
        onFamilyToggle={noOperation}
        onSkillToggle={noOperation}
        onOverrideToggle={noOperation}
      />,
    );
    expect(markup).toContain('Habilidades');
    expect(markup).toContain('Procurar habilidades');
    expect(markup).toContain('Computador');
    expect(markup).toContain('Computador');
    expect(markup).not.toContain('Integrações MCP');
    expect(markup).not.toContain('Conexão com o Google');
    expect(markup).not.toContain('Captura de tela: indisponível');
    expect(markup).toContain('Abrir Privacidade e permissões');
    expect(markup.match(/class="skills-family-card"/g)).toHaveLength(2);
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

  it('abre os detalhes, preserva exemplos e deixa overrides avançados recolhidos', () => {
    const markup = renderToStaticMarkup(
      <SkillsCatalogView
        skills={registryFixture}
        initialFamily="arquivos"
        onFamilyToggle={noOperation}
        onSkillToggle={noOperation}
        onOverrideToggle={noOperation}
        onOpenPrivacy={noOperation}
      />,
    );
    expect(markup).toContain('aria-label="Abrir detalhes de Arquivos"');
    expect(markup).toContain('Voltar às habilidades');
    expect(markup).toContain('Habilidades desta família');
    expect(markup).toContain('Categoria');
    expect(markup).toContain('Origem: OdeKrai');
    expect(markup).toContain('Leia o relatório da pasta permitida.');
    expect(markup).toContain('Desativar Ler arquivo');
    expect(markup).toContain('Risco: Leitura');
    expect(markup).toContain('Requisitos e estado');
    expect(markup).toContain('pasta de trabalho disponível');
    expect(markup).toContain('Abrir Privacidade e permissões');
    expect(markup).toMatch(/<details class="skill-advanced skills-override-settings">/);
    expect(markup).toContain('O OdeKrai solicitará confirmação nativa');
    expect(markup).toContain('Controle total não remove aprovações críticas');

    const experimentalMarkup = renderToStaticMarkup(
      <SkillsCatalogView
        skills={registryFixture}
        initialFamily="computador"
        onFamilyToggle={noOperation}
        onSkillToggle={noOperation}
        onOverrideToggle={noOperation}
      />,
    );
    expect(experimentalMarkup).toContain('Experimental');
  });

  it('explica bloqueios fixos e exibe o requisito ausente de aplicativo sem duplicar a lista', () => {
    const payment: CatalogSkill = {
      ...registryFixture[0],
      id: 'simulated.payment',
      name: 'Pagamento bloqueado',
      risk: 'destrutivo_financeiro',
      status: 'unavailable',
      fixedBlocked: true,
      enabled: false,
      examples: ['Não solicite pagamentos.'],
    };
    const blockedMarkup = renderToStaticMarkup(
      <SkillsCatalogView
        skills={[payment]}
        initialFamily="arquivos"
        onFamilyToggle={noOperation}
        onSkillToggle={noOperation}
        onOverrideToggle={noOperation}
      />,
    );
    expect(blockedMarkup).toContain('Bloqueio fixo: esta habilidade não pode ser liberada');
    expect(blockedMarkup).not.toContain('skills-override-settings');

    const appSkill: CatalogSkill = {
      ...registryFixture[0],
      id: 'app.launch',
      name: 'Iniciar aplicativo permitido',
      family: 'abrir_aplicativos',
      icon: 'app_window',
      examples: ['Inicie o aplicativo cadastrado.'],
    };
    const missingAppMarkup = renderToStaticMarkup(
      <SkillsCatalogView
        skills={[appSkill]}
        initialFamily="abrir_aplicativos"
        prerequisites={{ folderAvailable: true, appCount: 0, googleConnected: null }}
        onOpenPrivacy={noOperation}
        onFamilyToggle={noOperation}
        onSkillToggle={noOperation}
        onOverrideToggle={noOperation}
      />,
    );
    expect(missingAppMarkup).toContain('nenhum aplicativo cadastrado');
    expect(missingAppMarkup).toContain('Cadastrar aplicativo');
    expect(missingAppMarkup).toContain('Inicie o aplicativo cadastrado.');
    expect(missingAppMarkup).not.toContain('allowed-folder-list');
  });

  it('mantém busca e aba no mesmo estado da tela enquanto o painel é usado e volta ao catálogo', () => {
    const source = readFileSync(new URL('./SkillsScreen.tsx', import.meta.url), 'utf8');
    const rustSecurity = readFileSync(
      new URL('../../src-tauri/src/security/mod.rs', import.meta.url),
      'utf8',
    );
    expect(source).toContain('const [query, setQuery] = useState');
    expect(source).toContain('const [tab, setTab] = useState');
    expect(source).toContain('setSelectedFamily(null)');
    expect(source).toContain("document.getElementById('skills-search')?.focus()");
    expect(source).not.toContain("setQuery('')");
    expect(source).toContain('setSkillOverrideCommand(skill.id, enabled, invoke)');
    expect(source).not.toContain('window.confirm(');
    expect(rustSecurity).toContain('!confirm_native(format!(');
    expect(rustSecurity).toContain(
      'Esta exceção nunca ignora bloqueios fixos nem conteúdo externo.',
    );
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
    expect(source).toContain("invoke<Array<{ workspace: boolean }>>('get_allowed_folders')");
    expect(source).toContain("invoke<Array<{ id: string }>>('get_allowed_apps')");
    expect(source).toContain("invoke<GoogleOAuthStatus>('google_oauth_status')");
    expect(source).toContain("skill.id.startsWith('google.calendar.')");
    expect(source).toContain('PrivacyConfigurationSummary onOpen={onOpenPrivacy}');
  });
});
