export type MarkdownInline =
  { type: 'text' | 'strong' | 'code'; text: string } | { type: 'link'; text: string; href: string };

export type MarkdownBlock =
  | { type: 'paragraph'; lines: MarkdownInline[][] }
  | { type: 'list'; items: MarkdownInline[][] }
  | { type: 'ordered-list'; items: MarkdownInline[][] }
  | { type: 'code'; text: string };

const inlinePattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

export function parseMarkdown(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let listType: 'list' | 'ordered-list' = 'list';
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', lines: paragraph.map(parseInline) });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: listType, items: list.map(parseInline) });
    list = [];
  };

  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith('```')) {
      flushParagraph();
      flushList();
      if (code) {
        blocks.push({ type: 'code', text: code.join('\n') });
        code = null;
      } else {
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph();
      const nextListType = /^\s*\d+[.)]\s+/.test(line) ? 'ordered-list' : 'list';
      if (list.length && listType !== nextListType) flushList();
      listType = nextListType;
      list.push(line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, ''));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  if (code) blocks.push({ type: 'code', text: code.join('\n') });
  flushParagraph();
  flushList();
  return blocks;
}

function parseInline(text: string): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  let previousEnd = 0;
  for (const match of text.matchAll(inlinePattern)) {
    const index = match.index ?? 0;
    if (index > previousEnd) nodes.push({ type: 'text', text: text.slice(previousEnd, index) });
    if (match[1] !== undefined && match[2] !== undefined) {
      const href = safeMarkdownUrl(match[2]);
      nodes.push(href ? { type: 'link', text: match[1], href } : { type: 'text', text: match[0] });
    } else if (match[3] !== undefined) {
      nodes.push({ type: 'strong', text: match[3] });
    } else if (match[4] !== undefined) {
      nodes.push({ type: 'code', text: match[4] });
    }
    previousEnd = index + match[0].length;
  }
  if (previousEnd < text.length) nodes.push({ type: 'text', text: text.slice(previousEnd) });
  return nodes;
}

export function safeMarkdownUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
