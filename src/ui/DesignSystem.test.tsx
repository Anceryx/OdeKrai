import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Badge,
  Banner,
  Button,
  Card,
  PageHeader,
  SelectableCard,
  SelectInput,
  TextInput,
  Toggle,
} from './DesignSystem';

describe('componentes visuais compartilhados', () => {
  it('aplica a variante solicitada ao botão', () => {
    expect(renderToStaticMarkup(<Button variant="primary">Salvar</Button>)).toContain(
      'ui-button--primary',
    );
  });

  it('mantém estado e nome acessíveis em alternância e cartão selecionável', () => {
    const markup = renderToStaticMarkup(
      <>
        <Toggle label="Ativar sons" checked />
        <SelectableCard selected onClick={() => undefined}>
          Sempre perguntar
        </SelectableCard>
      </>,
    );
    expect(markup).toContain('aria-label="Ativar sons"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain('aria-pressed="true"');
  });

  it('aplica papel, tom e estrutura comuns de aviso, selo e cabeçalho', () => {
    const markup = renderToStaticMarkup(
      <>
        <Banner tone="warning">Confirme a alteração.</Banner>
        <Badge tone="success">Ativo</Badge>
        <PageHeader eyebrow="PERFIL" title="Seu perfil" subtitle="Dados locais." />
      </>,
    );
    expect(markup).toContain('role="status"');
    expect(markup).toContain('ui-banner--warning');
    expect(markup).toContain('ui-badge--success');
    expect(markup).toContain('<h1>Seu perfil</h1>');
  });

  it('oferece cartão, campo de texto e seletor com classes compartilhadas', () => {
    const markup = renderToStaticMarkup(
      <>
        <Card aria-label="Preferências" />
        <TextInput aria-label="Nome" />
        <SelectInput aria-label="Idioma">
          <option>Português</option>
        </SelectInput>
      </>,
    );
    expect(markup).toContain('ui-card');
    expect(markup).toContain('ui-input');
    expect(markup).toContain('ui-select');
  });
});
