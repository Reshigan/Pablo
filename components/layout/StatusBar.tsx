'use client';

import { Loader2 } from 'lucide-react';
import { useRepoStore } from '@/stores/repo';
import { useEditorStore } from '@/stores/editor';
import { useChatStore } from '@/stores/chat';
import { useBackgroundTaskStore } from '@/stores/backgroundTasks';

export function StatusBar() {
  const { selectedRepo, selectedBranch } = useRepoStore();
  const { tabs, activeTabId } = useEditorStore();
  const { totalTokens } = useChatStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const language = activeTab?.language ?? '—';
  const gitBranch = selectedRepo ? selectedBranch : '—';
  const tokens = totalTokens;
  const cost = (tokens / 1000000 * 0.15).toFixed(4);
  const tokenDisplay = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : tokens.toString();

  return (
    <footer
      className="flex h-[28px] shrink-0 items-center justify-between border-t border-pablo-border bg-pablo-bg px-3 font-ui text-[11px] text-pablo-text-muted"
      role="contentinfo"
    >
      {/* Left section */}
      <div className="flex items-center gap-3">
        {/* Background tasks indicator (Feature 14) */}
        {useBackgroundTaskStore.getState().getRunningTasks().length > 0 && (
          <div className="flex items-center gap-1.5">
            <Loader2 size={10} className="animate-spin text-pablo-gold" />
            <span className="text-pablo-gold">
              {useBackgroundTaskStore.getState().getRunningTasks().length} task(s)
            </span>
          </div>
        )}

        {/* AI status */}
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-pablo-green" />
          <span>AI: Workers AI</span>
        </div>

        <span className="text-pablo-border">|</span>

        {/* Model */}
        <button className="transition-colors duration-150 hover:text-pablo-text-dim">
          Model: deepseek-r1
        </button>

        <span className="text-pablo-border">|</span>

        {/* Tokens */}
        <span>Tokens: {tokenDisplay}/${cost}</span>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        <span>UTF-8</span>
        <span className="text-pablo-border">|</span>
        <span>{language}</span>
        <span className="text-pablo-border">|</span>
        <span>Git: {gitBranch}</span>
      </div>
    </footer>
  );
}
