'use client';

/**
 * AgentEventStream — Renders agent mode events (plan, steps, verification).
 * Extracted from ChatPanel.tsx (Task 29).
 *
 * This is a display-only component. The actual event processing logic
 * remains in ChatPanel (sendAgentMessage / sendOrchestratedMessage).
 * AgentEventStream renders the pipeline progress indicator and
 * validation score badge that appear during multi-turn chat runs.
 */

import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

interface PipelineProgress {
  active: boolean;
  currentStep: string;
  status: string;
  validationScore: number | null;
}

interface AgentEventStreamProps {
  pipeline: PipelineProgress;
}

export function AgentEventStream({ pipeline }: AgentEventStreamProps) {
  return (
    <>
      {/* Pipeline progress indicator */}
      {pipeline.active && (
        <div className="shrink-0 border-b border-pablo-gold/20 bg-pablo-gold/5 px-3 py-2">
          <div className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin text-pablo-gold" />
            <span className="font-ui text-xs font-medium text-pablo-gold">
              Multi-Turn Pipeline
            </span>
            {pipeline.currentStep && (
              <span className="font-ui text-xs text-pablo-text-dim">
                — {pipeline.currentStep}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Validation score badge (shown after pipeline completes) */}
      {!pipeline.active && pipeline.validationScore !== null && (
        <div className="shrink-0 border-b border-pablo-border px-3 py-1.5">
          <div className="flex items-center gap-2">
            {pipeline.validationScore >= 90 ? (
              <CheckCircle2 size={14} className="text-green-400" />
            ) : (
              <AlertTriangle size={14} className="text-yellow-400" />
            )}
            <span className="font-ui text-xs text-pablo-text-dim">
              Validation Score: <span className={`font-semibold ${pipeline.validationScore >= 90 ? 'text-green-400' : pipeline.validationScore >= 70 ? 'text-yellow-400' : 'text-pablo-red'}`}>{pipeline.validationScore}/100</span>
            </span>
          </div>
        </div>
      )}
    </>
  );
}
