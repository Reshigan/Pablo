'use client';

import { BarChart3, Clock, Zap, Code, ArrowUp, ArrowDown } from 'lucide-react';
import { useMetricsStore } from '@/stores/metrics';
import { useState, useEffect } from 'react';

interface MetricItem {
  label: string;
  value: string;
  change?: number;
  unit?: string;
}

function MetricCard({ label, value, change, unit }: MetricItem) {
  return (
    <div className="rounded-lg border border-pablo-border bg-pablo-hover px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="font-ui text-[10px] text-pablo-text-muted">{label}</span>
        {change !== undefined && (
          <span
            className={`flex items-center gap-0.5 font-ui text-[9px] ${
              change >= 0 ? 'text-pablo-green' : 'text-pablo-red'
            }`}
          >
            {change >= 0 ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
            {Math.abs(change)}%
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="font-code text-lg font-bold text-pablo-text">{value}</span>
        {unit && <span className="font-ui text-[10px] text-pablo-text-muted">{unit}</span>}
      </div>
    </div>
  );
}

function ProgressBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="font-ui text-[10px] text-pablo-text-muted">{label}</span>
        <span className="font-code text-[10px] text-pablo-text-dim">
          {value}/{max}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-pablo-active">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function MetricsPanel() {
  const {
    totalTokens, featuresBuilt, totalRequests,
    successfulRequests, failedRequests,
    modelCalls, pipelineStagesCompleted,
    getSessionDuration, getSuccessRate,
  } = useMetricsStore();

  const [duration, setDuration] = useState('00:00');

  useEffect(() => {
    const interval = setInterval(() => {
      setDuration(formatDuration(getSessionDuration()));
    }, 1000);
    return () => clearInterval(interval);
  }, [getSessionDuration]);

  const successRate = getSuccessRate();
  const hasData = totalRequests > 0;

  return (
    <div className="flex flex-col">
      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-1.5 p-2">
        <MetricCard label="Total Tokens" value={formatTokens(totalTokens)} unit="tokens" />
        <MetricCard label="Features Built" value={String(featuresBuilt)} unit="total" />
        <MetricCard label="Requests" value={String(totalRequests)} unit={`${successfulRequests} ok / ${failedRequests} fail`} />
        <MetricCard label="Success Rate" value={hasData ? String(successRate) : '—'} unit={hasData ? '%' : ''} />
      </div>

      {!hasData && (
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pablo-gold/10">
            <BarChart3 size={24} className="text-pablo-gold" />
          </div>
          <p className="font-ui text-xs font-medium text-pablo-text-dim">Session Metrics</p>
          <p className="font-ui text-[11px] text-pablo-text-muted leading-relaxed">
            Track token usage, build times, and feature completion rates.
            Metrics appear after your first chat or pipeline run.
          </p>
        </div>
      )}

      {/* Model usage */}
      <div className="border-t border-pablo-border px-3 py-2">
        <p className="mb-2 font-ui text-[10px] font-semibold uppercase tracking-wider text-pablo-text-muted">
          Model Usage
        </p>
        <div className="flex flex-col gap-2">
          {Object.keys(modelCalls).length > 0 ? (
            Object.entries(modelCalls).map(([model, count]) => (
              <div key={model} className="flex items-center gap-2">
                <Zap size={12} className="text-pablo-purple" />
                <span className="font-ui text-xs text-pablo-text-dim truncate">{model}</span>
                <span className="ml-auto font-code text-[10px] text-pablo-text-muted">{count} calls</span>
              </div>
            ))
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Zap size={12} className="text-pablo-purple" />
                <span className="font-ui text-xs text-pablo-text-dim">deepseek-v3.2</span>
                <span className="ml-auto font-code text-[10px] text-pablo-text-muted">0 calls</span>
              </div>
              <div className="flex items-center gap-2">
                <Code size={12} className="text-pablo-blue" />
                <span className="font-ui text-xs text-pablo-text-dim">qwen3-coder:480b</span>
                <span className="ml-auto font-code text-[10px] text-pablo-text-muted">0 calls</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pipeline progress */}
      <div className="border-t border-pablo-border px-3 py-2">
        <p className="mb-2 font-ui text-[10px] font-semibold uppercase tracking-wider text-pablo-text-muted">
          Pipeline Stages
        </p>
        <div className="flex flex-col gap-1.5">
          {([
            ['Plan', 'plan', 'text-pablo-blue'],
            ['Database', 'db', 'text-pablo-green'],
            ['API', 'api', 'text-pablo-orange'],
            ['UI', 'ui', 'text-pablo-purple'],
            ['Tests', 'tests', 'text-pablo-red'],
            ['Execute', 'execute', 'text-pablo-gold'],
            ['Review', 'review', 'text-pablo-blue'],
          ] as const).map(([label, key, color]) => {
            const count = pipelineStagesCompleted[key] ?? 0;
            return (
              <div key={key} className="flex items-center justify-between">
                <span className="font-ui text-[10px] text-pablo-text-muted">{label}</span>
                <span className={`font-code text-[10px] ${count > 0 ? color : 'text-pablo-text-muted'}`}>
                  {count > 0 ? `${count} done` : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Session time */}
      <div className="border-t border-pablo-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Clock size={12} className="text-pablo-text-muted" />
          <span className="font-ui text-xs text-pablo-text-dim">Session Duration</span>
          <span className="ml-auto font-code text-xs text-pablo-gold">{duration}</span>
        </div>
      </div>
    </div>
  );
}
