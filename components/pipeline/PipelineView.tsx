'use client';

import {
  Play,
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  SkipForward,
  Clock,
  Zap,
  ChevronDown,
  ChevronRight,
  StopCircle,
} from 'lucide-react';
import { useState, useCallback } from 'react';
import {
  usePipelineStore,
  PIPELINE_STAGES,
  type PipelineStage,
  type StageStatus,
  type PipelineRun,
} from '@/stores/pipeline';

const STATUS_ICONS: Record<StageStatus, typeof Circle> = {
  pending: Circle,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  skipped: SkipForward,
};

const STATUS_COLORS: Record<StageStatus, string> = {
  pending: 'text-pablo-text-muted',
  running: 'text-pablo-gold',
  completed: 'text-pablo-green',
  failed: 'text-pablo-red',
  skipped: 'text-pablo-text-muted',
};

function StageItem({
  stage,
  stageInfo,
  isExpanded,
  onToggle,
}: {
  stage: { stage: PipelineStage; status: StageStatus; output: string; durationMs?: number; tokens?: number; model?: string };
  stageInfo: { label: string; description: string; model: string };
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const Icon = STATUS_ICONS[stage.status];
  const color = STATUS_COLORS[stage.status];

  return (
    <div className="border-b border-pablo-border last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-pablo-hover"
      >
        <Icon
          size={16}
          className={`shrink-0 ${color} ${stage.status === 'running' ? 'animate-spin' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-ui text-xs font-medium text-pablo-text">{stageInfo.label}</span>
            {stage.model && (
              <span className="rounded bg-pablo-active px-1 font-code text-[9px] text-pablo-text-muted">
                {stage.model}
              </span>
            )}
          </div>
          <p className="font-ui text-[10px] text-pablo-text-muted">{stageInfo.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {stage.durationMs !== undefined && (
            <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-text-muted">
              <Clock size={10} />
              {(stage.durationMs / 1000).toFixed(1)}s
            </span>
          )}
          {stage.tokens !== undefined && stage.tokens > 0 && (
            <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-text-muted">
              <Zap size={10} />
              {stage.tokens}
            </span>
          )}
          {stage.output ? (
            isExpanded ? (
              <ChevronDown size={12} className="text-pablo-text-muted" />
            ) : (
              <ChevronRight size={12} className="text-pablo-text-muted" />
            )
          ) : null}
        </div>
      </button>
      {isExpanded && stage.output && (
        <div className="border-t border-pablo-border bg-pablo-bg px-3 py-2">
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-code text-[11px] text-pablo-text-dim leading-relaxed">
            {stage.output}
          </pre>
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: PipelineRun }) {
  const [expandedStages, setExpandedStages] = useState<Set<PipelineStage>>(new Set());
  const { completeRun } = usePipelineStore();

  const toggleStage = useCallback((stage: PipelineStage) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  }, []);

  const completedCount = run.stages.filter((s) => s.status === 'completed').length;
  const progress = (completedCount / run.stages.length) * 100;

  return (
    <div className="rounded-lg border border-pablo-border bg-pablo-panel overflow-hidden">
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
        {run.status === 'running' && (
          <button
            onClick={() => completeRun(run.id, 'cancelled')}
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

      {/* Stages */}
      <div>
        {run.stages.map((stage) => {
          const stageInfo = PIPELINE_STAGES.find((s) => s.id === stage.stage);
          if (!stageInfo) return null;
          return (
            <StageItem
              key={stage.stage}
              stage={stage}
              stageInfo={stageInfo}
              isExpanded={expandedStages.has(stage.stage)}
              onToggle={() => toggleStage(stage.stage)}
            />
          );
        })}
      </div>
    </div>
  );
}

export function PipelineView() {
  const { runs, startRun } = usePipelineStore();
  const [featureInput, setFeatureInput] = useState('');

  const handleStart = useCallback(() => {
    if (!featureInput.trim()) return;
    startRun(featureInput.trim());
    setFeatureInput('');
  }, [featureInput, startRun]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleStart();
      }
    },
    [handleStart]
  );

  return (
    <div className="flex h-full flex-col bg-pablo-panel">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-pablo-border px-3">
        <span className="font-ui text-xs font-semibold uppercase tracking-wider text-pablo-text-dim">
          Feature Factory
        </span>
        <span className="font-ui text-[10px] text-pablo-text-muted">
          {runs.length} runs
        </span>
      </div>

      {/* Feature input */}
      <div className="shrink-0 border-b border-pablo-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={featureInput}
            onChange={(e) => setFeatureInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe a feature to build (e.g., 'Add user authentication with JWT')..."
            className="min-h-[48px] max-h-24 flex-1 resize-none rounded-lg border border-pablo-border bg-pablo-input px-3 py-2 font-ui text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
            rows={2}
          />
          <button
            onClick={handleStart}
            disabled={!featureInput.trim()}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-pablo-gold px-3 font-ui text-xs font-medium text-pablo-bg transition-colors hover:bg-pablo-gold-dim disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Play size={12} />
            Build
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="font-ui text-[10px] text-pablo-text-muted">7-Stage Pipeline:</span>
          <div className="flex items-center gap-1">
            {PIPELINE_STAGES.map((s, i) => (
              <span key={s.id} className="flex items-center gap-1">
                <span className="font-ui text-[10px] text-pablo-gold">{s.label}</span>
                {i < PIPELINE_STAGES.length - 1 && (
                  <span className="text-pablo-text-muted">&rarr;</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Runs list */}
      <div className="flex-1 overflow-y-auto p-3">
        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pablo-gold/10">
              <Play size={24} className="text-pablo-gold" />
            </div>
            <p className="font-ui text-xs font-medium text-pablo-text-dim">
              Feature Factory Pipeline
            </p>
            <p className="max-w-xs font-ui text-[11px] text-pablo-text-muted leading-relaxed">
              Describe a feature and Pablo will plan, implement, test, and review it
              automatically through a 7-stage pipeline.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {runs.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
