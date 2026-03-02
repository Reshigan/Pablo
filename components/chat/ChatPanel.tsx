'use client';

import { Send, Paperclip, StopCircle } from 'lucide-react';
import { useState, useRef } from 'react';
import { ChatEmptyState } from '@/components/layout/Sidebar';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export function ChatPanel() {
  const [messages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    // Will be implemented in Phase 3
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex h-full flex-col bg-pablo-panel">
      {/* Chat header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-pablo-border px-3">
        <span className="font-ui text-xs font-semibold uppercase tracking-wider text-pablo-text-dim">
          Chat
        </span>
        <span className="font-ui text-[10px] text-pablo-text-muted">
          {messages.length} messages
        </span>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <ChatEmptyState />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-lg px-3 py-2 font-ui text-sm animate-slide-in ${
                  msg.role === 'user'
                    ? 'ml-6 bg-pablo-gold-bg border border-pablo-gold/20 text-pablo-text'
                    : 'mr-6 bg-pablo-hover text-pablo-text'
                }`}
              >
                {msg.content}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-pablo-border p-3">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="flex items-end gap-2 rounded-lg border border-pablo-border bg-pablo-input px-3 py-2 focus-within:border-pablo-gold/50">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you want to build..."
              className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent font-ui text-sm text-pablo-text outline-none placeholder:text-pablo-text-muted"
              rows={1}
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md text-pablo-text-muted transition-colors duration-150 hover:bg-pablo-hover hover:text-pablo-text-dim"
                aria-label="Attach file"
              >
                <Paperclip size={14} />
              </button>
              {isStreaming ? (
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-pablo-red transition-colors duration-150 hover:bg-pablo-red/10"
                  aria-label="Stop generation"
                >
                  <StopCircle size={16} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-pablo-gold text-pablo-bg transition-colors duration-150 hover:bg-pablo-gold-dim disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Send message"
                >
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>
          <span className="font-ui text-[10px] text-pablo-text-muted">
            Enter to send, Shift+Enter for new line
          </span>
        </form>
      </div>
    </div>
  );
}
