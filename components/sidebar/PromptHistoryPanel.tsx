'use client';

/**
 * Feature 26: Prompt History with Re-run
 * Every prompt ever run is saved. User can re-run or modify previous prompts.
 */

import { Clock, Play, Edit3, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useCallback } from 'react';
import { usePipelineStore } from '@/stores/pipeline';
import { toast } from '@/stores/toast';

export function PromptHistoryPanel() {
  const runs = usePipelineStore((s) => s.runs);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCopy = useCallback((prompt: string) => {
    navigator.clipboard.writeText(prompt).then(() => {
      toast('Copied', 'Prompt copied to clipboard');
    }).catch(() => {});
  }, []);

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return { text: 'text-pablo-green', label: 'Completed' };
      case 'failed': return { text: 'text-pablo-red', label: 'Failed' };
      case 'running': return { text: 'text-pablo-gold', label: 'Running' };
      case 'cancelled': return { text: 'text-pablo-text-muted', label: 'Cancelled' };
      default: return { text: 'text-pablo-text-muted', label: status };
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-pablo-border px-3 py-2 shrink-0">
        <Clock size={14} className="text-pablo-gold" />
        <span className="font-ui text-xs font-medium text-pablo-text">Prompt History</span>
        <span className="ml-auto font-code text-[10px] text-pablo-text-muted">{runs.length}</span>
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto">
        {runs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Clock size={24} className="text-pablo-text-muted" />
            <p className="font-ui text-xs text-pablo-text-muted">No pipeline runs yet</p>
            <p className="font-ui text-[10px] text-pablo-text-muted">
              Run a pipeline to see history here
            </p>
          </div>
        ) : (
          <div className="py-1">
            {runs.map((run) => {
              const statusInfo = getStatusIcon(run.status);
              const isExpanded = expandedId === run.id;
              const completedStages = run.stages.filter((s) => s.status === 'completed').length;

              return (
                <div key={run.id} className="border-b border-pablo-border/50">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : run.id)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-pablo-hover"
                  >
                    {isExpanded ? (
                      <ChevronDown size={12} className="mt-0.5 shrink-0 text-pablo-text-muted" />
                    ) : (
                      <ChevronRight size={12} className="mt-0.5 shrink-0 text-pablo-text-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-ui text-[11px] text-pablo-text-dim leading-tight truncate">
                        {run.featureDescription}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className={`font-code text-[9px] font-medium ${statusInfo.text}`}>
                          {completedStages}/{run.stages.length}
                        </span>
                        <span className="font-code text-[9px] text-pablo-text-muted">
                          {formatTime(run.createdAt)}
                        </span>
                        {run.totalTokens > 0 && (
                          <span className="font-code text-[9px] text-pablo-text-muted">
                            {run.totalTokens} tok
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-pablo-border/30 bg-pablo-bg px-3 py-2">
                      <p className="mb-2 whitespace-pre-wrap font-code text-[11px] text-pablo-text-dim leading-relaxed">
                        {run.featureDescription}
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopy(run.featureDescription)}
                          className="flex h-5 items-center gap-1 rounded bg-pablo-active px-1.5 font-ui text-[10px] text-pablo-text-dim transition-colors hover:bg-pablo-hover"
                        >
                          <Copy size={10} />
                          Copy
                        </button>
                      </div>
                      {/* Tech stack if available */}
                      {run.techStack?.fullLabel && (
                        <p className="mt-1.5 font-code text-[10px] text-pablo-text-muted">
                          Stack: {run.techStack.fullLabel}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
