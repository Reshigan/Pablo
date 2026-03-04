'use client';

import { Loader2 } from 'lucide-react';
import { useRepoStore } from '@/stores/repo';
import { useEditorStore } from '@/stores/editor';
import { useChatStore } from '@/stores/chat';
import { useBackgroundTaskStore } from '@/stores/backgroundTasks';
import { usePipelineStore } from '@/stores/pipeline';

export function StatusBar() {
  const { selectedRepo, selectedBranch } = useRepoStore();
  const { tabs, activeTabId } = useEditorStore();
  const runningTasks = useBackgroundTaskStore((s) => s.tasks.filter(t => t.status === 'running'));
  const { totalTokens } = useChatStore();
  const currentModel = useChatStore(s => s.currentModel) || 'deepseek-v3.2';
  const activeRun = usePipelineStore(s => s.runs.find(r => r.status === 'running'));
  const activeStage = activeRun?.stages.find((s: { status: string }) => s.status === 'running');
  const completedStages = activeRun?.stages.filter((s: { status: string }) => s.status === 'completed').length ?? 0;
  const totalStages = activeRun?.stages.length ?? 0;

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
        {runningTasks.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Loader2 size={10} className="animate-spin text-pablo-gold" />
            <span className="text-pablo-gold">
              {runningTasks.length} task(s)
            </span>
          </div>
        )}

        {/* AI status (Issue 6) */}
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-pablo-green" />
          <span>AI: Ollama Cloud</span>
        </div>

        <span className="text-pablo-border">|</span>

        {/* Model (Issue 6: dynamic model name) */}
        <button className="transition-colors duration-150 hover:text-pablo-text-dim">
          Model: {currentModel}
        </button>

        {/* Pipeline progress (Issue 7) */}
        {activeRun && (
          <>
            <span className="text-pablo-border">|</span>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-pablo-green animate-pulse" />
              <span className="text-pablo-green">
                Pipeline: {activeStage?.stage || 'starting'} ({completedStages}/{totalStages})
              </span>
            </div>
          </>
        )}

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
