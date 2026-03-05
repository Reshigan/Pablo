'use client';

import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { usePipelineStore } from '@/stores/pipeline';
import { useAgentStore } from '@/stores/agent';

/**
 * Task 38: Floating status pill — appears during active operations.
 * Positioned bottom-centre, above the StatusBar.
 */
export function ActivityIndicator() {
  const runs = usePipelineStore(s => s.runs);
  const activeRun = useMemo(() => runs.find(r => r.status === 'running'), [runs]);
  const agentRuns = useAgentStore(s => s.runs);
  const agentRun = useMemo(
    () => agentRuns.find(r => r.phase !== 'idle' && r.phase !== 'done' && r.phase !== 'failed'),
    [agentRuns],
  );

  if (!activeRun && !agentRun) return null;

  const label = activeRun
    ? `Pipeline: ${activeRun.currentStage || 'starting'}`
    : `Agent: ${agentRun?.phase || 'working'}`;

  const completed = activeRun
    ? activeRun.stages.filter((s: { status: string }) => s.status === 'completed').length
    : 0;
  const total = activeRun?.stages.length || 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="fixed bottom-10 left-1/2 z-50 -translate-x-1/2 animate-slide-in">
      <div className="flex items-center gap-3 rounded-full border border-pablo-gold/20 bg-pablo-surface-3/90 backdrop-blur-md px-4 py-2 shadow-glow">
        <Loader2 size={14} className="animate-spin text-pablo-gold" />
        <span className="font-ui text-xs font-medium text-pablo-text">{label}</span>
        {total > 0 && (
          <>
            <div className="h-1.5 w-20 rounded-full bg-pablo-surface-0 overflow-hidden">
              <div
                className="h-full rounded-full bg-pablo-gold transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-code text-[10px] text-pablo-text-dim">{pct}%</span>
          </>
        )}
      </div>
    </div>
  );
}
