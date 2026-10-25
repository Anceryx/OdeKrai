export type ConversationNotes = { instructions: string; slang: string };

export function sanitizeIdentityName(value: string, maxLength: number): string {
  return value
    .replace(/[\p{C}\r\n]+/gu, ' ')
    .replace(/[^\p{L}\p{N} .'-]/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)
    .trim();
}

export function updateIdentityProfile(
  content: string,
  displayName: string,
  nickname: string,
): string | null {
  const name = sanitizeIdentityName(displayName, 60);
  const alias = sanitizeIdentityName(nickname, 40) || 'não informado';
  if (!name || !/^- Nome: .*$/m.test(content) || !/^- Apelido: .*$/m.test(content)) return null;
  return content
    .replace(/^- Nome: .*$/m, `- Nome: ${name}`)
    .replace(/^- Apelido: .*$/m, `- Apelido: ${alias}`);
}

export function parseConversationNotes(content: string): ConversationNotes {
  const section = (heading: string) =>
    content.match(new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`, 'm'))?.[1]?.trim() ?? '';
  return {
    instructions: section('Instruções pessoais'),
    slang: section('Gírias e expressões'),
  };
}

export function formatConversationNotes({ instructions, slang }: ConversationNotes): string {
  return `# Preferências de conversa\n\n## Instruções pessoais\n${instructions.trim()}\n\n## Gírias e expressões\n${slang.trim()}\n`;
}
