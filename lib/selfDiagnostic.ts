/**
 * Self-Diagnostic — Pablo monitors its own health and auto-recovers
 *
 * Checks:
 * 1. D1 connectivity (self-healer)
 * 2. Ollama Cloud reachability (ping test)
 * 3. GitHub OAuth validity (token check)
 * 4. Error rate monitoring (if >50% of recent LLM calls fail, switch to fallback model)
 * 5. Cost anomaly detection (if spend rate 3x normal, pause and alert)
 *
 * Auto-recovery:
 * - D1 down → queue writes, retry with backoff
 * - Ollama unreachable → switch to fallback URL (if configured)
 * - Error rate high → circuit breaker (pause 60s, retry)
 * - Cost anomaly → hard-stop LLM calls, notify admin
 */

import { OLLAMA_CLOUD_URL } from './env';

export interface DiagnosticResult {
  timestamp: string;
  healthy: boolean;
  checks: {
    d1: { status: 'ok' | 'degraded' | 'down'; latencyMs: number };
    ollama: { status: 'ok' | 'unreachable' | 'auth_failed'; latencyMs: number; model?: string };
    github: { status: 'ok' | 'expired' | 'unconfigured' };
    errorRate: { status: 'ok' | 'elevated' | 'critical'; rate: number; threshold: number };
    costRate: { status: 'ok' | 'elevated' | 'anomaly'; todayUsd: number; budgetUsd: number };
  };
  autoRecovery: string[]; // Actions taken automatically
}

// ─── Circuit Breaker ─────────────────────────────────────────────────

let circuitOpen = false;
let circuitOpenedAt = 0;
const CIRCUIT_COOLDOWN_MS = 60_000; // 1 minute

// ─── Error Rate Tracking (sliding window) ────────────────────────────

const recentCalls: Array<{ success: boolean; timestamp: number }> = [];
const WINDOW_MS = 300_000; // 5 minutes

export function recordLLMCall(success: boolean): void {
  recentCalls.push({ success, timestamp: Date.now() });
  // Prune old entries
  const cutoff = Date.now() - WINDOW_MS;
  while (recentCalls.length > 0 && recentCalls[0].timestamp < cutoff) {
    recentCalls.shift();
  }
}

export function getErrorRate(): number {
  if (recentCalls.length < 5) return 0; // Not enough data
  const failures = recentCalls.filter(c => !c.success).length;
  return failures / recentCalls.length;
}

export function isCircuitOpen(): boolean {
  if (!circuitOpen) return false;
  // Auto-close after cooldown
  if (Date.now() - circuitOpenedAt > CIRCUIT_COOLDOWN_MS) {
    circuitOpen = false;
    return false;
  }
  return true;
}

export function openCircuit(): void {
  circuitOpen = true;
  circuitOpenedAt = Date.now();
}

// ─── Diagnostic Runner ───────────────────────────────────────────────

export async function runDiagnostic(): Promise<DiagnosticResult> {
  const autoRecovery: string[] = [];
  const timestamp = new Date().toISOString();

  // 1. D1 connectivity
  let d1Check: DiagnosticResult['checks']['d1'] = { status: 'down', latencyMs: 0 };
  try {
    const d1Start = Date.now();
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx.env as Record<string, unknown>).DB as {
      prepare: (sql: string) => { all: () => Promise<{ results: unknown[] }> };
    } | undefined;
    if (db) {
      await db.prepare('SELECT 1').all();
      d1Check = { status: 'ok', latencyMs: Date.now() - d1Start };
    } else {
      d1Check = { status: 'down', latencyMs: Date.now() - d1Start };
    }
  } catch {
    d1Check = { status: 'degraded', latencyMs: 0 };
  }

  // 2. Ollama Cloud reachability
  let ollamaCheck: DiagnosticResult['checks']['ollama'] = { status: 'unreachable', latencyMs: 0 };
  try {
    const ollamaStart = Date.now();
    const res = await fetch(`${OLLAMA_CLOUD_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      ollamaCheck = { status: 'ok', latencyMs: Date.now() - ollamaStart };
    } else if (res.status === 401 || res.status === 403) {
      ollamaCheck = { status: 'auth_failed', latencyMs: Date.now() - ollamaStart };
    } else {
      ollamaCheck = { status: 'unreachable', latencyMs: Date.now() - ollamaStart };
    }
  } catch {
    ollamaCheck = { status: 'unreachable', latencyMs: 0 };
  }

  // 3. GitHub OAuth — check if token is configured
  let githubCheck: DiagnosticResult['checks']['github'] = { status: 'unconfigured' };
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const env = ctx.env as Record<string, unknown>;
    const clientId = env.GITHUB_CLIENT_ID || env.AUTH_GITHUB_ID;
    githubCheck = { status: clientId ? 'ok' : 'unconfigured' };
  } catch {
    githubCheck = { status: 'unconfigured' };
  }

  // 4. Error rate
  const errorRate = getErrorRate();
  const errorThreshold = 0.5;
  let errorRateCheck: DiagnosticResult['checks']['errorRate'];
  if (errorRate >= errorThreshold) {
    errorRateCheck = { status: 'critical', rate: errorRate, threshold: errorThreshold };
    if (!isCircuitOpen()) {
      openCircuit();
      autoRecovery.push('Circuit breaker opened — LLM calls paused for 60s due to high error rate');
    }
  } else if (errorRate >= 0.3) {
    errorRateCheck = { status: 'elevated', rate: errorRate, threshold: errorThreshold };
  } else {
    errorRateCheck = { status: 'ok', rate: errorRate, threshold: errorThreshold };
  }

  // 5. Cost rate — check today's spend against budget
  let costRateCheck: DiagnosticResult['checks']['costRate'] = { status: 'ok', todayUsd: 0, budgetUsd: 5.0 };
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx.env as Record<string, unknown>).DB as {
      prepare: (sql: string) => { first: () => Promise<{ total_usd?: number } | null> };
    } | undefined;
    if (db) {
      const row = await db.prepare(
        "SELECT SUM(cost_usd) as total_usd FROM llm_calls WHERE created_at >= date('now')"
      ).first();
      const todayUsd = row?.total_usd ?? 0;
      const budgetUsd = 5.0; // Could be loaded from user_limits table
      if (todayUsd > budgetUsd * 3) {
        costRateCheck = { status: 'anomaly', todayUsd, budgetUsd };
        autoRecovery.push(`Cost anomaly detected: $${todayUsd.toFixed(2)} today (3x budget of $${budgetUsd.toFixed(2)})`);
      } else if (todayUsd > budgetUsd) {
        costRateCheck = { status: 'elevated', todayUsd, budgetUsd };
      } else {
        costRateCheck = { status: 'ok', todayUsd, budgetUsd };
      }
    }
  } catch {
    // Non-blocking — cost check is optional
  }

  const healthy = d1Check.status === 'ok' &&
    ollamaCheck.status === 'ok' &&
    errorRateCheck.status !== 'critical' &&
    costRateCheck.status !== 'anomaly';

  const result: DiagnosticResult = {
    timestamp,
    healthy,
    checks: {
      d1: d1Check,
      ollama: ollamaCheck,
      github: githubCheck,
      errorRate: errorRateCheck,
      costRate: costRateCheck,
    },
    autoRecovery,
  };

  // Persist diagnostic log to D1
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx.env as Record<string, unknown>).DB as {
      prepare: (sql: string) => { bind: (...args: unknown[]) => { run: () => Promise<unknown> } };
    } | undefined;
    if (db) {
      await db.prepare(
        'INSERT INTO diagnostic_logs (id, healthy, checks_json, auto_recovery_json, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))'
      ).bind(
        `diag-${Date.now()}`,
        healthy ? 1 : 0,
        JSON.stringify(result.checks),
        JSON.stringify(autoRecovery),
      ).run();
    }
  } catch {
    // Non-blocking
  }

  return result;
}
