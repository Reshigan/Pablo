'use client';

/**
 * PipelineOutputPanel — Renders the list of stages for a pipeline run.
 * Extracted from RunCard in PipelineView.tsx (Task 28).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { PipelineStageCard } from './PipelineStageCard';
import { PIPELINE_STAGES, type PipelineStage, type PipelineRun } from '@/stores/pipeline';

export function PipelineOutputPanel({ run, onRetryStage }: { run: PipelineRun; onRetryStage?: (stageName: PipelineStage) => void }) {
  const [expandedStages, setExpandedStages] = useState<Set<PipelineStage>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  const toggleStage = useCallback((stage: PipelineStage) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  }, []);

  // Auto-scroll to the currently running stage so user sees progress
  const runningStageId = run.stages.find(s => s.status === 'running')?.stage;
  useEffect(() => {
    if (!runningStageId) return;
    // Small delay to let the DOM update after stage status change
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-stage-id="${runningStageId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [runningStageId]);

  // Also scroll to bottom when pipeline completes
  const runStatus = run.status;
  useEffect(() => {
    if (runStatus === 'completed' || runStatus === 'failed') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [runStatus]);

  return (
    <div>
      {run.stages.map((stage) => {
        const stageInfo = PIPELINE_STAGES.find((s) => s.id === stage.stage);
        if (!stageInfo) return null;
        return (
          <PipelineStageCard
            key={stage.stage}
            stage={stage}
            stageInfo={stageInfo}
            isExpanded={expandedStages.has(stage.stage)}
            onToggle={() => toggleStage(stage.stage)}
            onRetry={onRetryStage}
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
