/**
 * D1-backed pipeline run + stage CRUD operations.
 * Falls back gracefully if D1 is unavailable (local dev).
 */
import { getD1 } from './drizzle';
import { pipelineRuns, pipelineStages } from './schema';
import { eq, desc, asc } from 'drizzle-orm';
import { generateId } from './queries';

export interface D1PipelineRun {
  id: string;
  sessionId: string;
  featureDescription: string;
  status: string;
  currentStage: string | null;
  planOutput: string | null;
  dbOutput: string | null;
  apiOutput: string | null;
  uiOutput: string | null;
  testsOutput: string | null;
  executeOutput: string | null;
  reviewOutput: string | null;
  totalTokens: number | null;
  totalDurationMs: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface D1PipelineStage {
  id: string;
  runId: string;
  stage: string;
  status: string;
  input: string | null;
  output: string | null;
  model: string | null;
  tokens: number | null;
  durationMs: number | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export async function d1CreatePipelineRun(data: {
  sessionId: string;
  featureDescription: string;
}): Promise<D1PipelineRun> {
  const id = generateId('run');
  const now = new Date().toISOString();
  const d1 = await getD1();

  if (d1) {
    await d1.insert(pipelineRuns).values({
      id,
      sessionId: data.sessionId,
      featureDescription: data.featureDescription,
      status: 'pending',
      currentStage: 'plan',
      totalTokens: 0,
      totalDurationMs: 0,
      createdAt: now,
    });
    const rows = await d1.select().from(pipelineRuns).where(eq(pipelineRuns.id, id));
    if (rows.length > 0) return rows[0] as unknown as D1PipelineRun;
  }

  return {
    id,
    sessionId: data.sessionId,
    featureDescription: data.featureDescription,
    status: 'pending',
    currentStage: 'plan',
    planOutput: null, dbOutput: null, apiOutput: null, uiOutput: null,
    testsOutput: null, executeOutput: null, reviewOutput: null,
    totalTokens: 0, totalDurationMs: 0,
    createdAt: now, completedAt: null,
  };
}

export async function d1GetPipelineRun(id: string): Promise<D1PipelineRun | null> {
  const d1 = await getD1();
  if (d1) {
    const rows = await d1.select().from(pipelineRuns).where(eq(pipelineRuns.id, id));
    return rows.length > 0 ? (rows[0] as unknown as D1PipelineRun) : null;
  }
  return null;
}

export async function d1GetPipelineRunsBySession(sessionId: string): Promise<D1PipelineRun[]> {
  const d1 = await getD1();
  if (d1) {
    const rows = await d1
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.sessionId, sessionId))
      .orderBy(desc(pipelineRuns.createdAt));
    return rows as unknown as D1PipelineRun[];
  }
  return [];
}

export async function d1UpdatePipelineRun(
  id: string,
  updates: Partial<Omit<D1PipelineRun, 'id' | 'sessionId' | 'createdAt'>>
): Promise<D1PipelineRun | null> {
  const d1 = await getD1();
  if (d1) {
    const setValues: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) setValues[key] = value;
    }
    if (Object.keys(setValues).length > 0) {
      await d1.update(pipelineRuns).set(setValues).where(eq(pipelineRuns.id, id));
    }
    const rows = await d1.select().from(pipelineRuns).where(eq(pipelineRuns.id, id));
    return rows.length > 0 ? (rows[0] as unknown as D1PipelineRun) : null;
  }
  return null;
}

export async function d1CreatePipelineStage(data: {
  runId: string;
  stage: string;
}): Promise<D1PipelineStage> {
  const id = generateId('stg');
  const d1 = await getD1();

  if (d1) {
    await d1.insert(pipelineStages).values({
      id,
      runId: data.runId,
      stage: data.stage as 'plan' | 'db' | 'api' | 'ui' | 'ux_validation' | 'tests' | 'execute' | 'review',
      status: 'pending',
      tokens: 0,
      durationMs: 0,
    });
    const rows = await d1.select().from(pipelineStages).where(eq(pipelineStages.id, id));
    if (rows.length > 0) return rows[0] as unknown as D1PipelineStage;
  }

  return {
    id, runId: data.runId, stage: data.stage, status: 'pending',
    input: null, output: null, model: null, tokens: 0, durationMs: 0,
    error: null, startedAt: null, completedAt: null,
  };
}

export async function d1GetStagesByRun(runId: string): Promise<D1PipelineStage[]> {
  const d1 = await getD1();
  if (d1) {
    const rows = await d1
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.runId, runId))
      .orderBy(asc(pipelineStages.startedAt));
    return rows as unknown as D1PipelineStage[];
  }
  return [];
}

export async function d1UpdatePipelineStage(
  id: string,
  updates: Partial<Omit<D1PipelineStage, 'id' | 'runId'>>
): Promise<D1PipelineStage | null> {
  const d1 = await getD1();
  if (d1) {
    const setValues: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) setValues[key] = value;
    }
    if (Object.keys(setValues).length > 0) {
      await d1.update(pipelineStages).set(setValues).where(eq(pipelineStages.id, id));
    }
    const rows = await d1.select().from(pipelineStages).where(eq(pipelineStages.id, id));
    return rows.length > 0 ? (rows[0] as unknown as D1PipelineStage) : null;
  }
  return null;
}
