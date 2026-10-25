import { useState } from 'react';
import { parseMarkdown, type MarkdownInline } from '../core/markdown';

function InlineContent({ nodes }: { nodes: MarkdownInline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === 'strong') return <strong key={index}>{node.text}</strong>;
        if (node.type === 'code') return <code key={index}>{node.text}</code>;
        if (node.type === 'link')
          return (
            <a key={index} href={node.href} target="_blank" rel="noopener noreferrer">
              {node.text}
            </a>
          );
        return <span key={index}>{node.text}</span>;
      })}
    </>
  );
}

function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }
  return (
    <pre className="chat-code-block">
      <code>{text}</code>
      <button type="button" onClick={() => void copyCode()} aria-label="Copiar código">
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </pre>
  );
}

export function MessageMarkdown({ text }: { text: string }) {
  return (
    <div className="message-markdown">
      {parseMarkdown(text).map((block, index) => {
        if (block.type === 'code') return <CodeBlock key={index} text={block.text} />;
        if (block.type === 'list')
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <InlineContent nodes={item} />
                </li>
              ))}
            </ul>
          );
        if (block.type === 'ordered-list')
          return (
            <ol key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <InlineContent nodes={item} />
                </li>
              ))}
            </ol>
          );
        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 && <br />}
                <InlineContent nodes={line} />
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
