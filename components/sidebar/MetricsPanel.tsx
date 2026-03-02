'use client';

import { BarChart3, Clock, Zap, Code, ArrowUp, ArrowDown } from 'lucide-react';

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

export function MetricsPanel() {
  const hasData = false;

  if (!hasData) {
    return (
      <div className="flex flex-col">
        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-1.5 p-2">
          <MetricCard label="Total Tokens" value="0" unit="tokens" />
          <MetricCard label="Features Built" value="0" unit="total" />
          <MetricCard label="Avg. Time" value="—" unit="" />
          <MetricCard label="Success Rate" value="—" unit="" />
        </div>

        {/* Empty state */}
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pablo-gold/10">
            <BarChart3 size={24} className="text-pablo-gold" />
          </div>
          <p className="font-ui text-xs font-medium text-pablo-text-dim">
            Session Metrics
          </p>
          <p className="font-ui text-[11px] text-pablo-text-muted leading-relaxed">
            Track token usage, build times, and feature completion rates.
            Metrics appear after your first feature pipeline run.
          </p>
        </div>

        {/* Model usage */}
        <div className="border-t border-pablo-border px-3 py-2">
          <p className="mb-2 font-ui text-[10px] font-semibold uppercase tracking-wider text-pablo-text-muted">
            Model Usage
          </p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Zap size={12} className="text-pablo-purple" />
              <span className="font-ui text-xs text-pablo-text-dim">DeepSeek-R1</span>
              <span className="ml-auto font-code text-[10px] text-pablo-text-muted">0 calls</span>
            </div>
            <div className="flex items-center gap-2">
              <Code size={12} className="text-pablo-blue" />
              <span className="font-ui text-xs text-pablo-text-dim">Qwen3-Coder</span>
              <span className="ml-auto font-code text-[10px] text-pablo-text-muted">0 calls</span>
            </div>
          </div>
        </div>

        {/* Pipeline progress */}
        <div className="border-t border-pablo-border px-3 py-2">
          <p className="mb-2 font-ui text-[10px] font-semibold uppercase tracking-wider text-pablo-text-muted">
            Pipeline Stages
          </p>
          <div className="flex flex-col gap-2">
            <ProgressBar label="Plan" value={0} max={1} color="bg-pablo-blue" />
            <ProgressBar label="Database" value={0} max={1} color="bg-pablo-green" />
            <ProgressBar label="API" value={0} max={1} color="bg-pablo-orange" />
            <ProgressBar label="UI" value={0} max={1} color="bg-pablo-purple" />
            <ProgressBar label="Tests" value={0} max={1} color="bg-pablo-red" />
            <ProgressBar label="Execute" value={0} max={1} color="bg-pablo-gold" />
            <ProgressBar label="Review" value={0} max={1} color="bg-pablo-blue" />
          </div>
        </div>

        {/* Session time */}
        <div className="border-t border-pablo-border px-3 py-2">
          <div className="flex items-center gap-2">
            <Clock size={12} className="text-pablo-text-muted" />
            <span className="font-ui text-xs text-pablo-text-dim">Session Duration</span>
            <span className="ml-auto font-code text-xs text-pablo-gold">00:00</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-2 gap-1.5 p-2">
        <MetricCard label="Total Tokens" value="12.4k" unit="tokens" change={-5} />
        <MetricCard label="Features Built" value="3" unit="total" change={50} />
        <MetricCard label="Avg. Time" value="4.2" unit="min" change={-12} />
        <MetricCard label="Success Rate" value="92" unit="%" change={8} />
      </div>
    </div>
  );
}
