'use client';

import { type AgentStatus } from '@/components/shared/StatusBadge';

interface StatusBarProps {
  ollamaStatus?: AgentStatus;
  modelName?: string;
  tokens?: number;
  cursorLine?: number;
  cursorCol?: number;
  encoding?: string;
  language?: string;
  gitBranch?: string;
}

export function StatusBar({
  ollamaStatus = 'connected',
  modelName = 'qwen3-coder-next',
  tokens = 0,
  cursorLine = 1,
  cursorCol = 1,
  encoding = 'UTF-8',
  language = 'TypeScript',
  gitBranch = 'main',
}: StatusBarProps) {
  const cost = (tokens / 1000000 * 0.15).toFixed(4);
  const tokenDisplay = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : tokens.toString();

  return (
    <footer
      className="flex h-[28px] shrink-0 items-center justify-between border-t border-pablo-border bg-pablo-bg px-3 font-ui text-[11px] text-pablo-text-muted"
      role="contentinfo"
    >
      {/* Left section */}
      <div className="flex items-center gap-3">
        {/* Ollama status */}
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              ollamaStatus === 'connected' ? 'bg-pablo-green' : 'bg-pablo-red'
            }`}
          />
          <span>Ollama: {ollamaStatus === 'connected' ? 'Connected' : 'Disconnected'}</span>
        </div>

        <span className="text-pablo-border">|</span>

        {/* Model */}
        <button className="transition-colors duration-150 hover:text-pablo-text-dim">
          Model: {modelName}
        </button>

        <span className="text-pablo-border">|</span>

        {/* Tokens */}
        <span>Tokens: {tokenDisplay}/${cost}</span>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        <span>Ln {cursorLine}, Col {cursorCol}</span>
        <span className="text-pablo-border">|</span>
        <span>{encoding}</span>
        <span className="text-pablo-border">|</span>
        <span>{language}</span>
        <span className="text-pablo-border">|</span>
        <span>Git: {gitBranch}</span>
      </div>
    </footer>
  );
}
