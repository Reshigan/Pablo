'use client';

import { GitBranch, FileCode, Activity, Clock } from 'lucide-react';
import { useRepoStore } from '@/stores/repo';
import { useEditorStore } from '@/stores/editor';
import { usePipelineStore } from '@/stores/pipeline';

/**
 * v7 Part 9: Context bar — sits between TopBar and workspace.
 * Shows current repo, branch, file count, and pipeline status at a glance.
 */
export function ContextBar() {
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const selectedBranch = useRepoStore((s) => s.selectedBranch);
  const tabs = useEditorStore((s) => s.tabs);
  const runs = usePipelineStore((s) => s.runs);
  const activeRunId = usePipelineStore((s) => s.activeRunId);

  const activeRun = runs.find((r) => r.id === activeRunId);

  if (!selectedRepo) return null;

  return (
    <div className="flex h-6 shrink-0 items-center gap-3 border-b border-pablo-border bg-pablo-panel/50 px-3">
      {/* Repo + Branch */}
      <div className="flex items-center gap-1.5">
        <GitBranch size={12} className="text-pablo-text-muted" />
        <span className="font-ui text-[10px] text-pablo-text-dim">
          {selectedRepo.full_name}
        </span>
        <span className="text-pablo-text-muted">/</span>
        <span className="font-ui text-[10px] font-medium text-pablo-text">
          {selectedBranch || 'main'}
        </span>
      </div>

      {/* Separator */}
      <div className="h-3 w-px bg-pablo-border" />

      {/* Open files count */}
      <div className="flex items-center gap-1">
        <FileCode size={10} className="text-pablo-text-muted" />
        <span className="font-ui text-[10px] text-pablo-text-muted">
          {tabs.length} file{tabs.length !== 1 ? 's' : ''} open
        </span>
      </div>

      {/* Pipeline status */}
      {activeRun && (
        <>
          <div className="h-3 w-px bg-pablo-border" />
          <div className="flex items-center gap-1">
            {activeRun.status === 'running' ? (
              <Activity size={10} className="animate-pulse text-pablo-gold" />
            ) : (
              <Clock size={10} className="text-pablo-text-muted" />
            )}
            <span className={`font-ui text-[10px] ${
              activeRun.status === 'running' ? 'text-pablo-gold' :
              activeRun.status === 'completed' ? 'text-pablo-green' :
              activeRun.status === 'failed' ? 'text-pablo-red' :
              'text-pablo-text-muted'
            }`}>
              {activeRun.status === 'running'
                ? `Pipeline: ${activeRun.currentStage ?? 'starting'}...`
                : `Pipeline: ${activeRun.status}`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
