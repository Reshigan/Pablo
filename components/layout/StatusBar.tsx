'use client';

import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRepoStore } from '@/stores/repo';
import { useEditorStore } from '@/stores/editor';
import { useChatStore } from '@/stores/chat';
import { useBackgroundTaskStore } from '@/stores/backgroundTasks';
import { usePipelineStore } from '@/stores/pipeline';

export function StatusBar() {
  const [collapsed, setCollapsed] = useState(false);
  const { selectedRepo, selectedBranch } = useRepoStore();
  const { tabs, activeTabId } = useEditorStore();
  const tasks = useBackgroundTaskStore((s) => s.tasks);
  const runningTaskCount = useMemo(() => tasks.filter(t => t.status === 'running').length, [tasks]);
  const { totalTokens } = useChatStore();
  const currentModel = useChatStore(s => s.currentModel) || 'deepseek-v3.2';
  const runs = usePipelineStore(s => s.runs);
  const activeRun = useMemo(() => runs.find(r => r.status === 'running'), [runs]);
  const activeStage = useMemo(() => activeRun?.stages.find((s: { status: string }) => s.status === 'running'), [activeRun]);
  const completedStages = useMemo(() => activeRun?.stages.filter((s: { status: string }) => s.status === 'completed').length ?? 0, [activeRun]);
  const totalStages = activeRun?.stages.length ?? 0;

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const language = activeTab?.language ?? '—';
  const gitBranch = selectedRepo ? selectedBranch : '—';
  const tokens = totalTokens;
  const cost = (tokens / 1000000 * 0.15).toFixed(4);
  const tokenDisplay = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : tokens.toString();

  if (collapsed) {
    return (
      <footer
        className="flex h-[4px] shrink-0 cursor-pointer border-t border-pablo-border bg-pablo-bg transition-all hover:h-[6px] hover:bg-pablo-hover"
        role="contentinfo"
        onDoubleClick={() => setCollapsed(false)}
        title="Double-click to expand status bar"
      />
    );
  }

  return (
    <footer
      className="flex h-[28px] shrink-0 items-center justify-between border-t border-pablo-border bg-pablo-bg px-3 font-ui text-[11px] text-pablo-text-muted"
      role="contentinfo"
      onDoubleClick={() => setCollapsed(true)}
      title="Double-click to collapse"
    >
      {/* Left section */}
      <div className="flex items-center gap-3">
        {/* Background tasks indicator (Feature 14) */}
        {runningTaskCount > 0 && (
          <div className="flex items-center gap-1.5">
            <Loader2 size={10} className="animate-spin text-pablo-gold" />
            <span className="text-pablo-gold">
              {runningTaskCount} task(s)
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
