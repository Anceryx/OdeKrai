import { describe, expect, it } from 'vitest';
import {
  formatConversationNotes,
  parseConversationNotes,
  sanitizeIdentityName,
  updateIdentityProfile,
} from './identity';

describe('preferências de identidade', () => {
  it('preserva instruções e expressões ao salvar e reler as notas de conversa', () => {
    const notes = { instructions: 'Prefiro respostas curtas.', slang: 'beleza, valeu' };
    expect(parseConversationNotes(formatConversationNotes(notes))).toEqual(notes);
  });

  it('usa campos vazios quando o arquivo de preferências ainda não existe', () => {
    expect(parseConversationNotes('')).toEqual({ instructions: '', slang: '' });
  });

  it('impede que nome ou apelido adicionem novas linhas e regras', () => {
    expect(sanitizeIdentityName('Ana\n# nova regra', 60)).toBe('Ana nova regra');
    expect(sanitizeIdentityName('**Ana**', 60)).toBe('Ana');
    expect(sanitizeIdentityName('x'.repeat(61), 60)).toHaveLength(60);
  });

  it('atualiza os campos de perfil do arquivo base sem alterar as demais regras', () => {
    const source = '- Nome: Antigo\n- Apelido: Anterior\n- Idioma: pt-BR\n';
    expect(updateIdentityProfile(source, 'Marina', 'Mari')).toBe(
      '- Nome: Marina\n- Apelido: Mari\n- Idioma: pt-BR\n',
    );
    expect(updateIdentityProfile(source, 'Ana\n- Modo: total', '')).toBe(
      '- Nome: Ana - Modo total\n- Apelido: não informado\n- Idioma: pt-BR\n',
    );
    expect(updateIdentityProfile('arquivo incompleto', 'Ana', '')).toBeNull();
  });
});
