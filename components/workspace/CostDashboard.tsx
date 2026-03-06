'use client';

/**
 * CostDashboard — LLM Cost Intelligence
 *
 * Shows: cost per session, cost per day, model usage breakdown,
 * token consumption trends, budget alerts.
 */

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Users } from 'lucide-react';

interface TeamCostSummary {
  spent: number;
  budget: number;
  userBreakdown: Array<{ userId: string; spent: number }>;
}

interface CostSummary {
  totalCostUsd: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCalls: number;
  byModel: Array<{ model: string; calls: number; costUsd: number; tokens: number }>;
  byDay: Array<{ date: string; costUsd: number; calls: number }>;
}

export function CostDashboard() {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [teamCost, setTeamCost] = useState<TeamCostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, teamRes] = await Promise.all([
        fetch(`/api/costs?days=${days}`),
        fetch('/api/costs?type=team'),
      ]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as CostSummary;
      setSummary(data);
      if (teamRes.ok) {
        const teamData = await teamRes.json() as TeamCostSummary;
        setTeamCost(teamData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-pablo-text-dim">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pablo-gold mr-3" />
        Loading cost data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-pablo-text-dim p-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pablo-orange/10 mb-2">
          <AlertTriangle size={20} className="text-pablo-orange" />
        </div>
        <p className="text-sm">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 px-3 py-1.5 text-xs bg-pablo-gold/10 hover:bg-pablo-gold/20 rounded text-pablo-gold transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!summary) return null;

  const formatCost = (n: number) => n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`;
  const formatTokens = (n: number) => n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n > 1000 ? `${(n / 1000).toFixed(1)}K` : n.toString();

  return (
    <div className="flex flex-col h-full bg-pablo-bg text-pablo-text overflow-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Cost Intelligence</h2>
        <div className="flex gap-2">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2 py-1 text-xs rounded ${
                days === d ? 'bg-pablo-gold text-pablo-bg' : 'bg-pablo-panel text-pablo-text-dim hover:bg-pablo-hover'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Phase 2.2: Team Budget Progress Bar */}
      {teamCost && (
        <div className="mb-4 rounded-lg border border-pablo-border bg-pablo-panel p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-pablo-blue" />
              <span className="text-xs font-medium text-pablo-text-dim">Team Daily Budget</span>
            </div>
            <span className="text-xs text-pablo-text-muted">
              ${teamCost.spent.toFixed(2)} / ${teamCost.budget.toFixed(2)}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-pablo-bg overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                teamCost.spent / teamCost.budget > 0.9
                  ? 'bg-red-500'
                  : teamCost.spent / teamCost.budget > 0.7
                  ? 'bg-pablo-orange'
                  : 'bg-pablo-green'
              }`}
              style={{ width: `${Math.min((teamCost.spent / teamCost.budget) * 100, 100)}%` }}
            />
          </div>
          {teamCost.spent / teamCost.budget > 0.9 && (
            <p className="mt-1.5 text-[10px] text-red-400 flex items-center gap-1">
              <AlertTriangle size={10} /> Team budget nearly exhausted
            </p>
          )}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          title="Total Cost"
          value={formatCost(summary.totalCostUsd)}
          subtitle={`${days} day${days > 1 ? 's' : ''}`}
          color="text-pablo-green"
        />
        <SummaryCard
          title="API Calls"
          value={summary.totalCalls.toLocaleString()}
          subtitle="total requests"
          color="text-pablo-blue"
        />
        <SummaryCard
          title="Tokens In"
          value={formatTokens(summary.totalTokensIn)}
          subtitle="input tokens"
          color="text-pablo-purple"
        />
        <SummaryCard
          title="Tokens Out"
          value={formatTokens(summary.totalTokensOut)}
          subtitle="output tokens"
          color="text-pablo-orange"
        />
      </div>

      {/* Model Breakdown */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-pablo-text-dim mb-3">Model Usage</h3>
        <div className="space-y-2">
          {summary.byModel.map((m) => {
            const maxCost = Math.max(...summary.byModel.map(x => x.costUsd), 0.01);
            const pct = (m.costUsd / maxCost) * 100;
            return (
              <div key={m.model} className="flex items-center gap-3">
                <span className="text-xs text-pablo-text-dim w-40 truncate font-mono">{m.model}</span>
                <div className="flex-1 h-4 bg-pablo-panel rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-pablo-blue to-pablo-purple rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-pablo-text-dim w-16 text-right">{formatCost(m.costUsd)}</span>
                <span className="text-xs text-pablo-text-muted w-12 text-right">{m.calls} calls</span>
              </div>
            );
          })}
          {summary.byModel.length === 0 && (
            <p className="text-xs text-pablo-text-muted">No data yet</p>
          )}
        </div>
      </div>

      {/* Daily Trend */}
      <div>
        <h3 className="text-sm font-medium text-pablo-text-dim mb-3">Daily Trend</h3>
        <div className="space-y-1">
          {summary.byDay.slice(0, 14).map((d) => {
            const maxCost = Math.max(...summary.byDay.map(x => x.costUsd), 0.01);
            const pct = (d.costUsd / maxCost) * 100;
            return (
              <div key={d.date} className="flex items-center gap-3">
                <span className="text-[10px] text-pablo-text-muted w-20 font-mono">{d.date}</span>
                <div className="flex-1 h-3 bg-pablo-panel rounded-full overflow-hidden">
                  <div
                    className="h-full bg-pablo-green/60 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] text-pablo-text-dim w-14 text-right">{formatCost(d.costUsd)}</span>
              </div>
            );
          })}
          {summary.byDay.length === 0 && (
            <p className="text-xs text-pablo-text-muted">No data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, subtitle, color }: {
  title: string;
  value: string;
  subtitle: string;
  color: string;
}) {
  return (
    <div className="bg-pablo-panel rounded-lg border border-pablo-border p-3">
      <div className="text-[10px] text-pablo-text-muted uppercase tracking-wider">{title}</div>
      <div className={`text-xl font-bold mt-1 ${color}`}>{value}</div>
      <div className="text-[10px] text-pablo-text-muted mt-0.5">{subtitle}</div>
    </div>
  );
}
