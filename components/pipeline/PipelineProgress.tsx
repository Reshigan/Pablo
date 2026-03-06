'use client';

/**
 * PipelineProgress — Progress bar and stats for a pipeline run header.
 * Extracted from RunCard in PipelineView.tsx (Task 28).
 */

import { StopCircle, Timer } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { PipelineRun } from '@/stores/pipeline';

/** ENH-3: Format elapsed time as mm:ss */
function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Stage timeout threshold (matches PipelineView STAGE_TIMEOUT_MS) */
const STAGE_TIMEOUT_MS = 300_000;

/** ENH-3: Live timer for the currently running stage */
function StageTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // Compute initial elapsed on mount (inside effect to avoid impure render)
    setElapsed(Date.now() - startedAt);
    const interval = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const pct = Math.min((elapsed / STAGE_TIMEOUT_MS) * 100, 100);
  const isNearTimeout = pct > 80;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Timer size={12} className={isNearTimeout ? 'text-pablo-red animate-pulse' : 'text-pablo-text-muted'} />
      <span className={`font-code text-[10px] ${isNearTimeout ? 'text-pablo-red' : 'text-pablo-text-muted'}`}>
        {formatElapsed(elapsed)}
      </span>
      {isNearTimeout && (
        <span className="font-ui text-[9px] text-pablo-red">timeout soon</span>
      )}
    </div>
  );
}

export function PipelineProgress({
  run,
  onCancel,
}: {
  run: PipelineRun;
  onCancel?: () => void;
}) {
  const completedCount = run.stages.filter((s) => s.status === 'completed').length;
  const progress = (completedCount / run.stages.length) * 100;

  return (
    <>
      {/* Run header */}
      <div className="flex items-start gap-2 border-b border-pablo-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="font-ui text-xs font-medium text-pablo-text">{run.featureDescription}</p>
          <div className="mt-1 flex items-center gap-3">
            <span className={`font-ui text-[10px] font-medium ${
              run.status === 'running' ? 'text-pablo-gold' :
              run.status === 'completed' ? 'text-pablo-green' :
              run.status === 'failed' ? 'text-pablo-red' : 'text-pablo-text-muted'
            }`}>
              {run.status.toUpperCase()}
            </span>
            <span className="font-code text-[10px] text-pablo-text-muted">
              {completedCount}/{run.stages.length} stages
            </span>
            {run.totalTokens > 0 && (
              <span className="font-code text-[10px] text-pablo-text-muted">
                {run.totalTokens} tokens
              </span>
            )}
          </div>
        </div>

        {/* ENH-3: Running stage timeout indicator */}
        {run.status === 'running' && (() => {
          const runningStage = run.stages.find(s => s.status === 'running');
          if (!runningStage?.startedAt) return null;
          return <StageTimer startedAt={runningStage.startedAt} />;
        })()}
        {run.status === 'running' && onCancel && (
          <button
            onClick={onCancel}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-pablo-red transition-colors hover:bg-pablo-red/10"
            aria-label="Cancel run"
          >
            <StopCircle size={14} />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full bg-pablo-active">
        <div
          className={`h-full transition-all duration-500 ${
            run.status === 'running' ? 'bg-pablo-gold' :
            run.status === 'completed' ? 'bg-pablo-green' :
            run.status === 'failed' ? 'bg-pablo-red' : 'bg-pablo-text-muted'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </>
  );
}
