/**
 * PromptEvolver — Phase 1: Track prompt effectiveness per pipeline stage
 *
 * Phase 1 (current): Record which prompts produce higher readiness scores.
 *   - After each pipeline run, log the prompt text + resulting score.
 *   - Over time, surface which prompt variants score highest per stage.
 *
 * Phase 2 (future): A/B test prompt variants automatically.
 *   - For each stage, maintain 2-3 prompt variants.
 *   - Randomly select one per run, track avg score.
 *   - Auto-promote the best variant after N runs.
 *
 * Phase 3 (future): LLM-generated prompt improvements.
 *   - Feed low-scoring prompts + their output to a meta-LLM.
 *   - Ask it to suggest improved prompts.
 *   - Test the suggestion in Phase 2's A/B framework.
 */

export interface PromptExperiment {
  id: string;
  stage: string;
  variant: string;       // 'baseline' | 'v2' | 'v3' etc.
  promptText: string;
  avgScore: number;
  runCount: number;
  isActive: boolean;
  createdAt: number;
  lastUsedAt: number;
}

/**
 * Record a prompt's performance after a pipeline stage completes.
 * Phase 1: just log to D1 for later analysis.
 */
export async function recordPromptResult(
  stage: string,
  promptText: string,
  score: number,
): Promise<void> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx.env as Record<string, unknown>).DB as {
      prepare: (sql: string) => { bind: (...args: unknown[]) => { run: () => Promise<unknown> } };
    } | undefined;
    if (!db) return;

    const id = `pe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Check if a baseline exists for this stage
    await db.prepare(
      `INSERT INTO prompt_experiments (id, stage, variant, prompt_text, avg_score, run_count, is_active, created_at, last_used_at)
       VALUES (?, ?, 'baseline', ?, ?, 1, 1, datetime('now'), datetime('now'))
       ON CONFLICT(id) DO UPDATE SET avg_score = (avg_score * run_count + ?) / (run_count + 1), run_count = run_count + 1, last_used_at = datetime('now')`
    ).bind(id, stage, promptText.slice(0, 2000), score, score).run();
  } catch {
    // Non-blocking — prompt tracking is optional
  }
}

/**
 * Get the best-performing prompt for a stage (Phase 1: always returns null — use default).
 * Phase 2 will return the highest-scoring variant.
 */
export function getBestPrompt(_stage: string): string | null {
  // Phase 1: no A/B testing yet — always use default prompt
  return null;
}

/**
 * Get all experiments for analysis (Phase 1: read from D1).
 */
export async function getExperiments(stage?: string): Promise<PromptExperiment[]> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx.env as Record<string, unknown>).DB as {
      prepare: (sql: string) => {
        bind: (...args: unknown[]) => { all: () => Promise<{ results: Array<Record<string, unknown>> }> };
        all: () => Promise<{ results: Array<Record<string, unknown>> }>;
      };
    } | undefined;
    if (!db) return [];

    const query = stage
      ? db.prepare('SELECT * FROM prompt_experiments WHERE stage = ? ORDER BY avg_score DESC').bind(stage)
      : db.prepare('SELECT * FROM prompt_experiments ORDER BY avg_score DESC');

    const { results } = await query.all();
    return results.map((r) => ({
      id: String(r.id),
      stage: String(r.stage),
      variant: String(r.variant),
      promptText: String(r.prompt_text),
      avgScore: Number(r.avg_score),
      runCount: Number(r.run_count),
      isActive: Boolean(r.is_active),
      createdAt: new Date(String(r.created_at)).getTime(),
      lastUsedAt: r.last_used_at ? new Date(String(r.last_used_at)).getTime() : Date.now(),
    }));
  } catch {
    return [];
  }
}
