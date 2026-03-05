'use client';

/**
 * PipelineOutputPanel — Renders the list of stages for a pipeline run.
 * Extracted from RunCard in PipelineView.tsx (Task 28).
 */

import { useState, useCallback } from 'react';
import { PipelineStageCard } from './PipelineStageCard';
import { PIPELINE_STAGES, type PipelineStage, type PipelineRun } from '@/stores/pipeline';

export function PipelineOutputPanel({ run }: { run: PipelineRun }) {
  const [expandedStages, setExpandedStages] = useState<Set<PipelineStage>>(new Set());

  const toggleStage = useCallback((stage: PipelineStage) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  }, []);

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
          />
        );
      })}
    </div>
  );
}
