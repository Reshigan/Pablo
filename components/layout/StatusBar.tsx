'use client';

import { Loader2, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRepoStore } from '@/stores/repo';
import { useEditorStore } from '@/stores/editor';
import { useChatStore } from '@/stores/chat';
import { usePipelineStore } from '@/stores/pipeline';
import { useSessionStore } from '@/stores/session';

/**
 * Task 39: Redesigned StatusBar — minimal by default, expandable on hover.
 * Default: 24px, 3 items only (AI status dot, language, cursor position).
 * Hover: slides up a detail row with model, tokens, cost, git branch, pipeline.
 */
export function StatusBar() {
  const [expanded, setExpanded] = useState(false);
  const { selectedRepo, selectedBranch } = useRepoStore();
  const { tabs, activeTabId } = useEditorStore();
  const { totalTokens } = useChatStore();
  const currentModel = useChatStore(s => s.currentModel) || 'devstral-2:123b';
  const runs = usePipelineStore(s => s.runs);
  const activeRun = useMemo(() => runs.find(r => r.status === 'running'), [runs]);
  const activeStage = useMemo(() => activeRun?.stages.find((s: { status: string }) => s.status === 'running'), [activeRun]);
  const completedStages = useMemo(() => activeRun?.stages.filter((s: { status: string }) => s.status === 'completed').length ?? 0, [activeRun]);
  const totalStages = activeRun?.stages.length ?? 0;

  // Task 24: Auto-save indicator
  const isSaving = useSessionStore(s => s.isSaving);
  const lastSavedAt = useSessionStore(s => s.lastSavedAt);
  const saveLabel = useMemo(() => {
    if (isSaving) return 'Saving...';
    if (!lastSavedAt) return '';
    const d = new Date(lastSavedAt);
    return `Saved ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [isSaving, lastSavedAt]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const language = activeTab?.language ?? '—';
  const gitBranch = selectedRepo ? selectedBranch : '—';
  const tokens = totalTokens;
  const cost = (tokens / 1000000 * 0.15).toFixed(4);
  const tokenDisplay = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : tokens.toString();

  return (
    <footer
      className="relative flex h-6 shrink-0 items-center justify-between border-t border-pablo-border bg-pablo-surface-0 px-3 font-ui text-[10px] text-pablo-text-muted"
      role="contentinfo"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Always visible — minimal */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-pablo-green" />
          AI Ready
        </span>
        {/* Task 24: Auto-save indicator */}
        {saveLabel && (
          <span className="flex items-center gap-1">
            {isSaving ? (
              <Loader2 size={10} className="animate-spin text-pablo-gold" />
            ) : (
              <Save size={10} className="text-pablo-green" />
            )}
            <span className={isSaving ? 'text-pablo-gold' : 'text-pablo-green'}>{saveLabel}</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span>{language}</span>
      </div>

      {/* Expanded details — slides up on hover */}
      {expanded && (
        <div className="absolute bottom-full left-0 right-0 flex h-6 items-center justify-between border-t border-pablo-border bg-pablo-surface-1 px-3 font-ui text-[10px] text-pablo-text-muted animate-slide-in shadow-panel">
          <div className="flex items-center gap-3">
            <span>Model: {currentModel}</span>
            <span>Tokens: {tokenDisplay}</span>
            <span>Cost: ${cost}</span>
          </div>
          <div className="flex items-center gap-3">
            <span>UTF-8</span>
            <span>Git: {gitBranch}</span>
            {activeRun && (
              <span className="text-pablo-green">
                Pipeline: {activeStage?.stage || 'starting'} ({completedStages}/{totalStages})
              </span>
            )}
          </div>
        </div>
      )}
    </footer>
  );
}
