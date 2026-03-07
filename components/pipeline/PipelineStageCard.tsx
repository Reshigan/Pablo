'use client';

import {
  Circle,
  Loader2,
  CheckCircle2,
  XCircle,
  SkipForward,
  Clock,
  Zap,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import type { PipelineStage, StageStatus } from '@/stores/pipeline';

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

export function PipelineStageCard({
  stage,
  stageInfo,
  isExpanded,
  onToggle,
  onRetry,
}: {
  stage: { stage: PipelineStage; status: StageStatus; output: string; durationMs?: number; tokens?: number; model?: string };
  stageInfo: { label: string; description: string; model: string };
  isExpanded: boolean;
  onToggle: () => void;
  onRetry?: (stageName: PipelineStage) => void;
}) {
  const Icon = STATUS_ICONS[stage.status];
  const color = STATUS_COLORS[stage.status];

  // Show a live preview snippet of what the stage is doing (first 120 chars)
  const previewText = stage.output
    ? stage.output.replace(/```[\s\S]*?```/g, '[code block]').replace(/\n+/g, ' ').trim().slice(0, 120)
    : '';

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
          {/* Inline preview -- always visible when there is output */}
          {previewText && !isExpanded && (
            <p className={`mt-0.5 font-code text-[10px] leading-snug truncate ${
              stage.status === 'running' ? 'text-pablo-gold/70' : 'text-pablo-text-dim'
            }`}>
              {stage.status === 'running' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-pablo-gold animate-pulse mr-1 align-middle" />}
              {previewText}{previewText.length >= 120 ? '...' : ''}
            </p>
          )}
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
      {/* Issue 11: Retry button on failed stages */}
      {stage.status === 'failed' && onRetry && (
        <div className="px-3 py-1.5 border-t border-pablo-border">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetry(stage.stage);
            }}
            className="flex items-center gap-1 rounded bg-orange-500/10 px-2 py-0.5 font-ui text-[10px] text-orange-400 transition-colors hover:bg-orange-500/20"
          >
            <RotateCcw size={10} />
            Retry this stage
          </button>
        </div>
      )}
      {isExpanded && stage.output && (
        <div className="border-t border-pablo-border bg-pablo-bg px-3 py-2">
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap font-code text-[11px] text-pablo-text-dim leading-relaxed">
            {stage.output}
          </pre>
        </div>
      )}
    </div>
  );
}
