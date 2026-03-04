/**
 * D1 Agent Runs — CRUD for agent_runs table
 *
 * Tracks every specialist agent execution:
 *   - Which agent ran, for which session
 *   - Input/output summaries
 *   - Token usage, duration, cost
 *   - Status and issues
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

export interface AgentRunRecord {
  id: string;
  sessionId: string;
  orchestrationId: string;
  agentName: string;
  phase: string;
  status: 'running' | 'complete' | 'failed';
  inputSummary: string;
  outputSummary: string;
  filesGenerated: number;
  tokensUsed: number;
  durationMs: number;
  issues: string;
  createdAt: string;
  completedAt: string | null;
}

/**
 * Insert a new agent run record
 */
export async function d1CreateAgentRun(
  record: Omit<AgentRunRecord, 'id' | 'createdAt' | 'completedAt'>
): Promise<string | null> {
  const db = await getDBAsync();
  if (!db) return null;

  const id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await db.prepare(
    `INSERT INTO agent_runs (id, session_id, orchestration_id, agent_name, phase, status, input_summary, output_summary, files_generated, tokens_used, duration_ms, issues)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    record.sessionId,
    record.orchestrationId,
    record.agentName,
    record.phase,
    record.status,
    record.inputSummary,
    record.outputSummary,
    record.filesGenerated,
    record.tokensUsed,
    record.durationMs,
    record.issues,
  ).run();

  return id;
}

/**
 * Update an agent run status and output
 */
export async function d1UpdateAgentRun(
  id: string,
  updates: Partial<Pick<AgentRunRecord, 'status' | 'outputSummary' | 'filesGenerated' | 'tokensUsed' | 'durationMs' | 'issues'>>
): Promise<void> {
  const db = await getDBAsync();
  if (!db) return;

  const setClauses: string[] = [];
  const values: (string | number)[] = [];

  if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status); }
  if (updates.outputSummary !== undefined) { setClauses.push('output_summary = ?'); values.push(updates.outputSummary); }
  if (updates.filesGenerated !== undefined) { setClauses.push('files_generated = ?'); values.push(updates.filesGenerated); }
  if (updates.tokensUsed !== undefined) { setClauses.push('tokens_used = ?'); values.push(updates.tokensUsed); }
  if (updates.durationMs !== undefined) { setClauses.push('duration_ms = ?'); values.push(updates.durationMs); }
  if (updates.issues !== undefined) { setClauses.push('issues = ?'); values.push(updates.issues); }

  if (updates.status === 'complete' || updates.status === 'failed') {
    setClauses.push('completed_at = datetime(\'now\')');
  }

  if (setClauses.length === 0) return;

  values.push(id);
  await db.prepare(
    `UPDATE agent_runs SET ${setClauses.join(', ')} WHERE id = ?`
  ).bind(...values).run();
}

/**
 * Get all agent runs for a session
 */
export async function d1GetAgentRuns(sessionId: string): Promise<AgentRunRecord[]> {
  const db = await getDBAsync();
  if (!db) return [];

  const result = await db.prepare(
    `SELECT id, session_id as sessionId, orchestration_id as orchestrationId,
            agent_name as agentName, phase, status, input_summary as inputSummary,
            output_summary as outputSummary, files_generated as filesGenerated,
            tokens_used as tokensUsed, duration_ms as durationMs, issues,
            created_at as createdAt, completed_at as completedAt
     FROM agent_runs WHERE session_id = ? ORDER BY created_at DESC`
  ).bind(sessionId).all<AgentRunRecord>();

  return result.results || [];
}

/**
 * Get agent runs for a specific orchestration
 */
export async function d1GetOrchestrationRuns(orchestrationId: string): Promise<AgentRunRecord[]> {
  const db = await getDBAsync();
  if (!db) return [];

  const result = await db.prepare(
    `SELECT id, session_id as sessionId, orchestration_id as orchestrationId,
            agent_name as agentName, phase, status, input_summary as inputSummary,
            output_summary as outputSummary, files_generated as filesGenerated,
            tokens_used as tokensUsed, duration_ms as durationMs, issues,
            created_at as createdAt, completed_at as completedAt
     FROM agent_runs WHERE orchestration_id = ? ORDER BY created_at ASC`
  ).bind(orchestrationId).all<AgentRunRecord>();

  return result.results || [];
}
