/**
 * D1 Cost Tracking — LLM call logging
 *
 * Tracks every LLM call with model, tokens, estimated cost.
 * Pricing table for Ollama Cloud models.
 */

async function getDBAsync(): Promise<D1Database | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    return (ctx.env as Record<string, unknown>).DB as D1Database || null;
  } catch {
    return null;
  }
}

// Pricing per 1M tokens (approximate for Ollama Cloud)
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'qwen3-coder:480b':  { inputPer1M: 0.30, outputPer1M: 0.60 },
  'deepseek-v3.2':     { inputPer1M: 0.14, outputPer1M: 0.28 },
  'gpt-oss:120b':      { inputPer1M: 0.10, outputPer1M: 0.20 },
};

export interface LLMCallRecord {
  id: string;
  sessionId?: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  costUsd: number;
  source: string;
  createdAt: string;
}

export interface CostSummary {
  totalCostUsd: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCalls: number;
  byModel: Array<{ model: string; calls: number; costUsd: number; tokens: number }>;
  byDay: Array<{ date: string; costUsd: number; calls: number }>;
}

/**
 * Estimate cost of an LLM call
 */
export function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (tokensIn / 1_000_000) * pricing.inputPer1M + (tokensOut / 1_000_000) * pricing.outputPer1M;
}

/** ARCH-03: Default daily budget per user in USD. Override with DAILY_BUDGET_USD env var. */
const DEFAULT_DAILY_BUDGET_USD = 5.0;

/**
 * ARCH-03: Check if user has exceeded their daily budget.
 * Returns { allowed: boolean, spent: number, budget: number }.
 */
export async function checkDailyBudget(_userId?: string): Promise<{ allowed: boolean; spent: number; budget: number }> {
  const budget = parseFloat(process.env.DAILY_BUDGET_USD || '') || DEFAULT_DAILY_BUDGET_USD;
  const db = await getDBAsync();
  if (!db) return { allowed: true, spent: 0, budget };

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const row = await db.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) as spent FROM llm_calls WHERE date(created_at) = ?`
  ).bind(today).first<{ spent: number }>();

  const spent = row?.spent || 0;
  return { allowed: spent < budget, spent, budget };
}

/**
 * Log an LLM call to D1
 */
export async function d1LogLLMCall(record: Omit<LLMCallRecord, 'id' | 'createdAt'>): Promise<void> {
  const db = await getDBAsync();
  if (!db) return;

  const id = `llm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const costUsd = record.costUsd || estimateCost(record.model, record.tokensIn, record.tokensOut);

  await db.prepare(
    `INSERT INTO llm_calls (id, session_id, model, tokens_in, tokens_out, duration_ms, cost_usd, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    record.sessionId || null,
    record.model,
    record.tokensIn,
    record.tokensOut,
    record.durationMs,
    costUsd,
    record.source || 'chat',
  ).run();
}

/**
 * Get cost summary for a time range
 */
export async function d1GetCostSummary(days: number = 30): Promise<CostSummary> {
  const db = await getDBAsync();
  if (!db) {
    return { totalCostUsd: 0, totalTokensIn: 0, totalTokensOut: 0, totalCalls: 0, byModel: [], byDay: [] };
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Totals
  const totals = await db.prepare(
    `SELECT COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost,
            COALESCE(SUM(tokens_in), 0) as tin, COALESCE(SUM(tokens_out), 0) as tout
     FROM llm_calls WHERE created_at >= ?`
  ).bind(since).first<{ calls: number; cost: number; tin: number; tout: number }>();

  // By model
  const byModelRows = await db.prepare(
    `SELECT model, COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost,
            COALESCE(SUM(tokens_in + tokens_out), 0) as tokens
     FROM llm_calls WHERE created_at >= ?
     GROUP BY model ORDER BY cost DESC`
  ).bind(since).all<{ model: string; calls: number; cost: number; tokens: number }>();

  // By day
  const byDayRows = await db.prepare(
    `SELECT date(created_at) as date, COALESCE(SUM(cost_usd), 0) as cost, COUNT(*) as calls
     FROM llm_calls WHERE created_at >= ?
     GROUP BY date(created_at) ORDER BY date DESC LIMIT 30`
  ).bind(since).all<{ date: string; cost: number; calls: number }>();

  return {
    totalCostUsd: totals?.cost || 0,
    totalTokensIn: totals?.tin || 0,
    totalTokensOut: totals?.tout || 0,
    totalCalls: totals?.calls || 0,
    byModel: (byModelRows.results || []).map(r => ({
      model: r.model,
      calls: r.calls,
      costUsd: r.cost,
      tokens: r.tokens,
    })),
    byDay: (byDayRows.results || []).map(r => ({
      date: r.date,
      costUsd: r.cost,
      calls: r.calls,
    })),
  };
}
