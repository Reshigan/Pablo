'use client';

/**
 * CodeBlock — Code block with language label and copy button.
 * Extracted from ChatPanel.tsx (Task 29).
 */

import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <button onClick={handleCopy} className="flex h-5 w-5 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text-dim" aria-label="Copy code">
      {copied ? <Check size={12} className="text-pablo-green" /> : <Copy size={12} />}
    </button>
  );
}

export { CopyButton };

interface CodeBlockProps {
  className?: string;
  children?: React.ReactNode;
}

/**
 * Custom code renderer for ReactMarkdown.
 * Renders inline code as styled <code> and fenced blocks with header + copy button.
 */
export function CodeBlockRenderer({ className, children, ...props }: CodeBlockProps) {
  const match = /language-(\w+)/.exec(className || '');
  const isInline = !match && !String(children).includes('\n');
  if (isInline) {
    return <code className="rounded bg-pablo-active px-1 py-0.5 font-code text-xs text-pablo-gold" {...props}>{children}</code>;
  }
  return (
    <div className="group relative my-2">
      <div className="flex items-center justify-between rounded-t-md bg-pablo-active px-3 py-1">
        <span className="font-code text-[10px] text-pablo-text-muted">{match?.[1] || 'code'}</span>
        <CopyButton text={String(children).replace(/\n$/, '')} />
      </div>
      <pre className="overflow-x-auto rounded-b-md bg-[#0d1117] p-3 font-code text-xs leading-relaxed text-pablo-text-dim"><code className={className} {...props}>{children}</code></pre>
    </div>
  );
}
