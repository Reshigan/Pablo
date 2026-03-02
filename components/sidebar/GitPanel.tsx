'use client';

import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  Plus,
  Minus,
  Edit3,
  RefreshCw,
  Check,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

type ChangeType = 'added' | 'modified' | 'deleted';

interface GitChange {
  file: string;
  type: ChangeType;
  staged: boolean;
}

const CHANGE_ICONS: Record<ChangeType, { icon: typeof Plus; color: string; label: string }> = {
  added: { icon: Plus, color: 'text-pablo-green', label: 'A' },
  modified: { icon: Edit3, color: 'text-pablo-orange', label: 'M' },
  deleted: { icon: Minus, color: 'text-pablo-red', label: 'D' },
};

export function GitPanel() {
  const [branch] = useState('main');
  const [commitMsg, setCommitMsg] = useState('');
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [unstagedExpanded, setUnstagedExpanded] = useState(true);
  const [changes] = useState<GitChange[]>([
    { file: 'src/app/page.tsx', type: 'modified', staged: true },
    { file: 'src/lib/utils.ts', type: 'modified', staged: false },
    { file: 'src/components/NewComponent.tsx', type: 'added', staged: false },
  ]);

  const staged = changes.filter((c) => c.staged);
  const unstaged = changes.filter((c) => !c.staged);

  return (
    <div className="flex flex-col">
      {/* Branch info */}
      <div className="flex items-center gap-2 border-b border-pablo-border px-3 py-2">
        <GitBranch size={14} className="shrink-0 text-pablo-gold" />
        <span className="font-ui text-xs text-pablo-text">{branch}</span>
        <button
          className="ml-auto flex h-5 w-5 items-center justify-center rounded text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim"
          aria-label="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Commit input */}
      <div className="border-b border-pablo-border p-2">
        <textarea
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          placeholder="Commit message..."
          className="w-full resize-none rounded-md border border-pablo-border bg-pablo-input px-2 py-1.5 font-ui text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
          rows={2}
        />
        <button
          disabled={!commitMsg.trim() || staged.length === 0}
          className="mt-1 flex w-full items-center justify-center gap-1 rounded-md bg-pablo-gold py-1 font-ui text-xs font-medium text-pablo-bg transition-colors hover:bg-pablo-gold-dim disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Check size={12} />
          Commit ({staged.length})
        </button>
      </div>

      {/* Staged changes */}
      <div>
        <button
          onClick={() => setStagedExpanded(!stagedExpanded)}
          className="flex w-full items-center gap-1 px-2 py-1.5 text-left transition-colors hover:bg-pablo-hover"
        >
          {stagedExpanded ? (
            <ChevronDown size={12} className="text-pablo-text-muted" />
          ) : (
            <ChevronRight size={12} className="text-pablo-text-muted" />
          )}
          <span className="font-ui text-[11px] font-medium text-pablo-text-dim">
            Staged Changes
          </span>
          <span className="ml-auto rounded bg-pablo-green/10 px-1.5 font-ui text-[10px] text-pablo-green">
            {staged.length}
          </span>
        </button>
        {stagedExpanded &&
          staged.map((change) => {
            const info = CHANGE_ICONS[change.type];
            return (
              <div
                key={change.file}
                className="flex items-center gap-1.5 px-5 py-0.5 transition-colors hover:bg-pablo-hover"
              >
                <span className={`shrink-0 font-code text-[10px] font-bold ${info.color}`}>
                  {info.label}
                </span>
                <span className="truncate font-ui text-xs text-pablo-text-dim">
                  {change.file.split('/').pop()}
                </span>
                <span className="ml-auto truncate font-ui text-[10px] text-pablo-text-muted">
                  {change.file}
                </span>
              </div>
            );
          })}
      </div>

      {/* Unstaged changes */}
      <div>
        <button
          onClick={() => setUnstagedExpanded(!unstagedExpanded)}
          className="flex w-full items-center gap-1 px-2 py-1.5 text-left transition-colors hover:bg-pablo-hover"
        >
          {unstagedExpanded ? (
            <ChevronDown size={12} className="text-pablo-text-muted" />
          ) : (
            <ChevronRight size={12} className="text-pablo-text-muted" />
          )}
          <span className="font-ui text-[11px] font-medium text-pablo-text-dim">
            Changes
          </span>
          <span className="ml-auto rounded bg-pablo-orange/10 px-1.5 font-ui text-[10px] text-pablo-orange">
            {unstaged.length}
          </span>
        </button>
        {unstagedExpanded &&
          unstaged.map((change) => {
            const info = CHANGE_ICONS[change.type];
            return (
              <div
                key={change.file}
                className="flex items-center gap-1.5 px-5 py-0.5 transition-colors hover:bg-pablo-hover"
              >
                <span className={`shrink-0 font-code text-[10px] font-bold ${info.color}`}>
                  {info.label}
                </span>
                <span className="truncate font-ui text-xs text-pablo-text-dim">
                  {change.file.split('/').pop()}
                </span>
                <span className="ml-auto truncate font-ui text-[10px] text-pablo-text-muted">
                  {change.file}
                </span>
              </div>
            );
          })}
      </div>

      {/* Quick actions */}
      <div className="mt-2 flex flex-col gap-1 border-t border-pablo-border px-2 pt-2">
        <button className="flex items-center gap-2 rounded px-2 py-1 text-left font-ui text-xs text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim">
          <GitPullRequest size={14} />
          Create Pull Request
        </button>
        <button className="flex items-center gap-2 rounded px-2 py-1 text-left font-ui text-xs text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim">
          <GitCommit size={14} />
          View History
        </button>
      </div>
    </div>
  );
}
