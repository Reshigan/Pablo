'use client';

/**
 * MessageBubble — Renders a single chat message (user or assistant).
 * Extracted from ChatPanel.tsx (Task 29).
 */

import { Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlockRenderer } from './CodeBlock';
import { StreamingIndicator } from './StreamingIndicator';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
}

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <div
      className={`flex gap-2 animate-slide-in ${
        message.role === 'user' ? 'justify-end' : 'justify-start'
      }`}
    >
      {message.role === 'assistant' && (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-pablo-gold-bg">
          <Bot size={14} className="text-pablo-gold" />
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 font-ui text-sm ${
          message.role === 'user'
            ? 'bg-pablo-gold-bg border border-pablo-gold/20 text-pablo-text'
            : 'bg-pablo-hover text-pablo-text'
        }`}
      >
        <div className="prose-pablo break-words">
          {message.role === 'assistant' ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  return <CodeBlockRenderer className={className} {...props}>{children}</CodeBlockRenderer>;
                },
                p({ children }) { return <p className="mb-2 last:mb-0">{children}</p>; },
                ul({ children }) { return <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>; },
                ol({ children }) { return <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>; },
                li({ children }) { return <li className="text-pablo-text-dim">{children}</li>; },
                h1({ children }) { return <h1 className="mb-2 text-base font-bold text-pablo-text">{children}</h1>; },
                h2({ children }) { return <h2 className="mb-2 text-sm font-bold text-pablo-text">{children}</h2>; },
                h3({ children }) { return <h3 className="mb-1 text-sm font-semibold text-pablo-text">{children}</h3>; },
                strong({ children }) { return <strong className="font-semibold text-pablo-text">{children}</strong>; },
                a({ href, children }) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-pablo-blue underline hover:text-pablo-blue/80">{children}</a>; },
                blockquote({ children }) { return <blockquote className="my-2 border-l-2 border-pablo-gold/50 pl-3 text-pablo-text-muted italic">{children}</blockquote>; },
                table({ children }) { return <table className="my-2 w-full border-collapse text-xs">{children}</table>; },
                th({ children }) { return <th className="border border-pablo-border bg-pablo-active px-2 py-1 text-left font-semibold text-pablo-text-dim">{children}</th>; },
                td({ children }) { return <td className="border border-pablo-border px-2 py-1 text-pablo-text-dim">{children}</td>; },
              }}
            >
              {message.content}
            </ReactMarkdown>
          ) : (
            <span className="whitespace-pre-wrap">{message.content}</span>
          )}
          {message.isStreaming && <StreamingIndicator />}
        </div>
      </div>
      {message.role === 'user' && (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-pablo-active">
          <User size={14} className="text-pablo-text-dim" />
        </div>
      )}
    </div>
  );
}
