'use client';

import { Brain, Zap, TrendingUp, Clock, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface PatternEntry {
  id: string;
  type: 'code_pattern' | 'error_fix' | 'architecture' | 'convention' | 'shortcut';
  trigger: string;
  action: string;
  confidence: number;
  usageCount: number;
}

const TYPE_STYLES: Record<string, { color: string; label: string }> = {
  code_pattern: { color: 'text-pablo-blue', label: 'Pattern' },
  error_fix: { color: 'text-pablo-red', label: 'Fix' },
  architecture: { color: 'text-pablo-purple', label: 'Arch' },
  convention: { color: 'text-pablo-green', label: 'Convention' },
  shortcut: { color: 'text-pablo-orange', label: 'Shortcut' },
};

export function MemoryPanel() {
  const [patterns] = useState<PatternEntry[]>([]);
  const [stats] = useState({
    totalPatterns: 0,
    sessionsAnalyzed: 0,
    avgConfidence: 0,
  });

  if (patterns.length === 0) {
    return (
      <div className="flex flex-col">
        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-1 border-b border-pablo-border p-2">
          <div className="flex flex-col items-center rounded bg-pablo-hover px-2 py-1.5">
            <span className="font-code text-sm font-bold text-pablo-gold">{stats.totalPatterns}</span>
            <span className="font-ui text-[9px] text-pablo-text-muted">Patterns</span>
          </div>
          <div className="flex flex-col items-center rounded bg-pablo-hover px-2 py-1.5">
            <span className="font-code text-sm font-bold text-pablo-text">{stats.sessionsAnalyzed}</span>
            <span className="font-ui text-[9px] text-pablo-text-muted">Sessions</span>
          </div>
          <div className="flex flex-col items-center rounded bg-pablo-hover px-2 py-1.5">
            <span className="font-code text-sm font-bold text-pablo-green">{stats.avgConfidence}%</span>
            <span className="font-ui text-[9px] text-pablo-text-muted">Confidence</span>
          </div>
        </div>

        {/* Empty state */}
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pablo-purple/10">
            <Brain size={24} className="text-pablo-purple" />
          </div>
          <p className="font-ui text-xs font-medium text-pablo-text-dim">
            Self-Learning System
          </p>
          <p className="font-ui text-[11px] text-pablo-text-muted leading-relaxed">
            Pablo learns from your coding patterns, error fixes, and architecture decisions.
            Start building features to see learned patterns here.
          </p>
          <div className="flex flex-col gap-1.5 w-full max-w-[200px]">
            <div className="flex items-center gap-2 rounded bg-pablo-hover px-2 py-1.5">
              <Zap size={12} className="text-pablo-gold" />
              <span className="font-ui text-[10px] text-pablo-text-dim">Code Patterns</span>
            </div>
            <div className="flex items-center gap-2 rounded bg-pablo-hover px-2 py-1.5">
              <TrendingUp size={12} className="text-pablo-green" />
              <span className="font-ui text-[10px] text-pablo-text-dim">Error Fixes</span>
            </div>
            <div className="flex items-center gap-2 rounded bg-pablo-hover px-2 py-1.5">
              <Clock size={12} className="text-pablo-blue" />
              <span className="font-ui text-[10px] text-pablo-text-dim">Conventions</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-1 border-b border-pablo-border p-2">
        <div className="flex flex-col items-center rounded bg-pablo-hover px-2 py-1.5">
          <span className="font-code text-sm font-bold text-pablo-gold">{stats.totalPatterns}</span>
          <span className="font-ui text-[9px] text-pablo-text-muted">Patterns</span>
        </div>
        <div className="flex flex-col items-center rounded bg-pablo-hover px-2 py-1.5">
          <span className="font-code text-sm font-bold text-pablo-text">{stats.sessionsAnalyzed}</span>
          <span className="font-ui text-[9px] text-pablo-text-muted">Sessions</span>
        </div>
        <div className="flex flex-col items-center rounded bg-pablo-hover px-2 py-1.5">
          <span className="font-code text-sm font-bold text-pablo-green">{stats.avgConfidence}%</span>
          <span className="font-ui text-[9px] text-pablo-text-muted">Confidence</span>
        </div>
      </div>

      {/* Pattern list */}
      <div className="overflow-y-auto">
        {patterns.map((pattern) => {
          const style = TYPE_STYLES[pattern.type] ?? TYPE_STYLES.code_pattern;
          return (
            <button
              key={pattern.id}
              className="flex w-full items-start gap-2 border-b border-pablo-border px-3 py-2 text-left transition-colors hover:bg-pablo-hover"
            >
              <span className={`mt-0.5 shrink-0 rounded px-1 font-ui text-[9px] font-bold ${style.color} bg-current/10`}>
                {style.label}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-ui text-xs text-pablo-text-dim">{pattern.trigger}</p>
                <p className="mt-0.5 truncate font-ui text-[10px] text-pablo-text-muted">{pattern.action}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-ui text-[9px] text-pablo-text-muted">
                    {Math.round(pattern.confidence * 100)}% conf
                  </span>
                  <span className="font-ui text-[9px] text-pablo-text-muted">
                    {pattern.usageCount}x used
                  </span>
                </div>
              </div>
              <ChevronRight size={12} className="mt-1 shrink-0 text-pablo-text-muted" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
