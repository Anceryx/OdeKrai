export type MarkdownInline =
  { type: 'text' | 'strong' | 'code'; text: string } | { type: 'link'; text: string; href: string };

export type MarkdownBlock =
  | { type: 'paragraph'; lines: MarkdownInline[][] }
  | { type: 'list'; items: MarkdownInline[][] }
  | { type: 'ordered-list'; items: MarkdownInline[][] }
  | { type: 'code'; text: string };

const plainUrlPattern = /\b(?:https?:\/\/|mailto:)[^\s<>"'`]+/gi;
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
    if (index > previousEnd) nodes.push(...parsePlainUrls(text.slice(previousEnd, index)));
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
  if (previousEnd < text.length) nodes.push(...parsePlainUrls(text.slice(previousEnd)));
  return nodes;
}

function parsePlainUrls(text: string): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  let previousEnd = 0;
  for (const match of text.matchAll(plainUrlPattern)) {
    const index = match.index ?? 0;
    let candidate = match[0];
    while (/[.,!?;:]$/.test(candidate)) candidate = candidate.slice(0, -1);
    while (/[)\]}]$/.test(candidate)) candidate = candidate.slice(0, -1);
    const href = safeMarkdownUrl(candidate);
    if (!href) continue;
    if (index > previousEnd) nodes.push({ type: 'text', text: text.slice(previousEnd, index) });
    nodes.push({ type: 'link', text: candidate, href });
    previousEnd = index + candidate.length;
  }
  if (previousEnd < text.length) nodes.push({ type: 'text', text: text.slice(previousEnd) });
  return nodes;
}

export function safeMarkdownUrl(value: string): string | null {
  if (
    !value ||
    value.length > 2048 ||
    /[\u0000-\u0020\u007f\\]/.test(value) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value) ||
    value !== value.trim()
  )
    return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (url.protocol === 'http:' || url.protocol === 'https:')
      return url.hostname ? url.href : null;
    if (url.protocol === 'mailto:' && /^[^@\s]+@[^@\s]+$/.test(url.pathname)) return url.href;
    return null;
  } catch {
    return null;
  }
}

export function externalLinkDomain(value: string): string | null {
  const safeUrl = safeMarkdownUrl(value);
  if (!safeUrl) return null;
  const url = new URL(safeUrl);
  if (url.protocol === 'mailto:')
    return url.pathname.slice(url.pathname.lastIndexOf('@') + 1).toLowerCase();
  return url.hostname.toLowerCase();
}

export function normalizeTrustedLinkDomain(value: string): string | null {
  if (!value || value.length > 253 || /[\u0000-\u0020\u007f/@?#\\]/.test(value)) return null;
  try {
    const url = new URL(`https://${value}`);
    if (url.username || url.password || url.pathname !== '/' || !url.hostname) return null;
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}
