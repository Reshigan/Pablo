'use client';

/**
 * CostDashboard — LLM Cost Intelligence
 *
 * Shows: cost per session, cost per day, model usage breakdown,
 * token consumption trends, budget alerts.
 */

import { useState, useEffect, useCallback } from 'react';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/costs?days=${days}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as CostSummary;
      setSummary(data);
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
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400 mr-3" />
        Loading cost data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
        <div className="text-2xl mb-2">⚠️</div>
        <p className="text-sm">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 rounded text-white"
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
    <div className="flex flex-col h-full bg-[#1e1e2e] text-white overflow-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Cost Intelligence</h2>
        <div className="flex gap-2">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2 py-1 text-xs rounded ${
                days === d ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          title="Total Cost"
          value={formatCost(summary.totalCostUsd)}
          subtitle={`${days} day${days > 1 ? 's' : ''}`}
          color="text-green-400"
        />
        <SummaryCard
          title="API Calls"
          value={summary.totalCalls.toLocaleString()}
          subtitle="total requests"
          color="text-blue-400"
        />
        <SummaryCard
          title="Tokens In"
          value={formatTokens(summary.totalTokensIn)}
          subtitle="input tokens"
          color="text-purple-400"
        />
        <SummaryCard
          title="Tokens Out"
          value={formatTokens(summary.totalTokensOut)}
          subtitle="output tokens"
          color="text-orange-400"
        />
      </div>

      {/* Model Breakdown */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Model Usage</h3>
        <div className="space-y-2">
          {summary.byModel.map((m) => {
            const maxCost = Math.max(...summary.byModel.map(x => x.costUsd), 0.01);
            const pct = (m.costUsd / maxCost) * 100;
            return (
              <div key={m.model} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-40 truncate font-mono">{m.model}</span>
                <div className="flex-1 h-4 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-purple-600 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-300 w-16 text-right">{formatCost(m.costUsd)}</span>
                <span className="text-xs text-gray-500 w-12 text-right">{m.calls} calls</span>
              </div>
            );
          })}
          {summary.byModel.length === 0 && (
            <p className="text-xs text-gray-500">No data yet</p>
          )}
        </div>
      </div>

      {/* Daily Trend */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">Daily Trend</h3>
        <div className="space-y-1">
          {summary.byDay.slice(0, 14).map((d) => {
            const maxCost = Math.max(...summary.byDay.map(x => x.costUsd), 0.01);
            const pct = (d.costUsd / maxCost) * 100;
            return (
              <div key={d.date} className="flex items-center gap-3">
                <span className="text-[10px] text-gray-500 w-20 font-mono">{d.date}</span>
                <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-600/60 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 w-14 text-right">{formatCost(d.costUsd)}</span>
              </div>
            );
          })}
          {summary.byDay.length === 0 && (
            <p className="text-xs text-gray-500">No data yet</p>
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
    <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-3">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{title}</div>
      <div className={`text-xl font-bold mt-1 ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{subtitle}</div>
    </div>
  );
}
