/**
 * Pablo v9 — Multi-Agent Orchestrator
 *
 * Decomposes tasks into parallel subtasks, spawns worker agents,
 * coordinates results, and resolves conflicts.
 *
 * Architecture:
 *   LeadAgent (orchestrator) -> WorkerAgent[] (parallel execution)
 *   Each WorkerAgent has isolated context (assigned files, scoped prompt)
 *   LeadAgent merges results and resolves file conflicts
 */

import { callModel, type EnvConfig, type ModelConfig } from './modelRouter';
import { parseGeneratedFiles } from './agentEngine';
import type { AgentEventCallback, AgentEvent } from './agentEngine';

// --- Types ---

export interface WorkerTask {
  id: string;
  title: string;
  description: string;
  type: 'api' | 'ui' | 'database' | 'tests' | 'config' | 'docs' | 'refactor';
  assignedFiles: string[];
  contextFiles: string[];
  dependencies: string[];
  status: 'pending' | 'running' | 'complete' | 'failed';
  result?: WorkerResult;
}

export interface WorkerResult {
  taskId: string;
  files: Array<{ path: string; content: string; language: string }>;
  tokensUsed: number;
  durationMs: number;
  issues: string[];
}

export interface OrchestrationPlan {
  id: string;
  userMessage: string;
  tasks: WorkerTask[];
  parallelGroups: string[][];
  status: 'planning' | 'executing' | 'merging' | 'verifying' | 'done' | 'failed';
  startedAt: number;
  completedAt?: number;
}

export type OrchestratorEvent =
  | AgentEvent
  | { type: 'worker_spawned'; workerId: string; title: string }
  | { type: 'worker_complete'; workerId: string; files: Array<{ path: string }>; tokensUsed: number }
  | { type: 'worker_failed'; workerId: string; error: string }
  | { type: 'merge_start' }
  | { type: 'merge_conflict'; file: string }
  | { type: 'merge_complete'; fileCount: number };

// --- Planning ---

const PLANNING_PROMPT = `You are a lead software architect. Decompose the user's request into PARALLEL subtasks for a team of AI agents.

RULES:
1. Each task must specify which files it will CREATE or MODIFY (assignedFiles)
2. Each task must specify which existing files it needs to READ for context (contextFiles)
3. NO two tasks can have the same file in their assignedFiles (no write conflicts)
4. Tasks with no dependencies on each other go in the same parallel group
5. Keep tasks focused: one concern per task (API, UI, tests, etc.)
6. Maximum 6 tasks per plan

RESPOND WITH JSON ONLY:
{
  "tasks": [
    {
      "id": "task-1",
      "title": "Create API routes",
      "description": "Build Express/Next.js API routes for user authentication",
      "type": "api",
      "assignedFiles": ["src/app/api/auth/route.ts", "src/lib/auth.ts"],
      "contextFiles": ["src/lib/db/schema.ts"],
      "dependencies": []
    },
    {
      "id": "task-2",
      "title": "Build login UI",
      "description": "Create React login/register components with form validation",
      "type": "ui",
      "assignedFiles": ["src/components/auth/LoginForm.tsx", "src/components/auth/RegisterForm.tsx"],
      "contextFiles": [],
      "dependencies": []
    },
    {
      "id": "task-3",
      "title": "Write tests",
      "description": "Unit tests for auth API and integration tests for login flow",
      "type": "tests",
      "assignedFiles": ["src/__tests__/auth.test.ts"],
      "contextFiles": ["src/app/api/auth/route.ts", "src/lib/auth.ts"],
      "dependencies": ["task-1"]
    }
  ],
  "parallelGroups": [["task-1", "task-2"], ["task-3"]]
}`;

/**
 * Create a multi-agent execution plan from a user request
 */
export async function createOrchestrationPlan(
  userMessage: string,
  existingFiles: string[],
  env: EnvConfig,
  onEvent?: (event: OrchestratorEvent) => void,
): Promise<OrchestrationPlan> {
  const planId = `orch-${Date.now()}`;

  onEvent?.({ type: 'thinking', content: 'Analyzing request and creating parallel execution plan...' } as OrchestratorEvent);

  const contextStr = existingFiles.length > 0
    ? `\nEXISTING PROJECT FILES:\n${existingFiles.slice(0, 200).join('\n')}`
    : '\nThis is a NEW project (no existing files).';

  const result = await callModel({
    model: {
      provider: 'ollama_cloud',
      model: 'deepseek-v3.2',
      description: 'Planning model',
      max_tokens: 4096,
      temperature: 0.2,
      estimated_speed: '20-50 TPS',
    },
    systemPrompt: PLANNING_PROMPT,
    userMessage: `USER REQUEST: ${userMessage}${contextStr}`,
  }, env);

  // Parse the JSON plan
  const jsonMatch = result.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to generate orchestration plan');
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    tasks: Array<{
      id: string;
      title: string;
      description: string;
      type: WorkerTask['type'];
      assignedFiles: string[];
      contextFiles: string[];
      dependencies: string[];
    }>;
    parallelGroups: string[][];
  };

  const tasks: WorkerTask[] = parsed.tasks.map(t => ({
    ...t,
    status: 'pending' as const,
  }));

  const plan: OrchestrationPlan = {
    id: planId,
    userMessage,
    tasks,
    parallelGroups: parsed.parallelGroups,
    status: 'planning',
    startedAt: Date.now(),
  };

  onEvent?.({
    type: 'plan_created',
    plan: {
      goal: userMessage,
      steps: tasks.map(t => ({
        id: t.id,
        type: 'generate' as const,
        description: t.title,
        status: 'pending' as const,
        input: {},
      })),
      currentStepIndex: 0,
      totalTokensUsed: 0,
      totalDurationMs: 0,
      status: 'planning',
      currentIteration: 0,
      maxIterations: 3,
    },
  } as OrchestratorEvent);

  return plan;
}

// --- Worker Execution ---

const WORKER_PROMPT = `You are a focused AI developer assigned to ONE specific task on a team.

YOUR TASK:
{task_description}

FILES YOU MUST CREATE/MODIFY:
{assigned_files}

CONTEXT FILES (read-only, for reference):
{context_files}

{context_content}

RULES:
1. ONLY create/modify the files listed in your assignment
2. Every file must be complete and production-ready
3. Use proper imports referencing other team members' files (they're being built in parallel)
4. Output code as markdown code blocks with full file paths: \`\`\`tsx src/components/LoginForm.tsx

GENERATE ALL ASSIGNED FILES NOW.`;

/**
 * Execute a single worker task
 */
async function executeWorker(
  task: WorkerTask,
  plan: OrchestrationPlan,
  existingFileContents: Map<string, string>,
  env: EnvConfig,
  onEvent?: (event: OrchestratorEvent) => void,
): Promise<WorkerResult> {
  const startTime = Date.now();

  onEvent?.({ type: 'thinking', content: `Worker started: ${task.title}` } as OrchestratorEvent);
  onEvent?.({ type: 'step_start', step: { id: task.id, type: 'generate', description: task.title, status: 'running', input: {} }, index: 0 } as OrchestratorEvent);

  // Build context from assigned context files
  const contextContent = task.contextFiles
    .map(f => {
      const content = existingFileContents.get(f);
      if (content) return `### ${f}\n\`\`\`\n${content}\n\`\`\``;
      return null;
    })
    .filter(Boolean)
    .join('\n\n');

  // Also include results from completed dependency tasks
  const depResults = task.dependencies
    .map(depId => plan.tasks.find(t => t.id === depId)?.result)
    .filter(Boolean)
    .flatMap(r => r!.files)
    .map(f => `### ${f.path} (from parallel worker)\n\`\`\`${f.language}\n${f.content}\n\`\`\``)
    .join('\n\n');

  const prompt = WORKER_PROMPT
    .replace('{task_description}', `${task.title}: ${task.description}`)
    .replace('{assigned_files}', task.assignedFiles.join(', '))
    .replace('{context_files}', task.contextFiles.join(', ') || 'None')
    .replace('{context_content}',
      (contextContent || depResults)
        ? `\nREFERENCE CODE:\n${contextContent}\n${depResults}`
        : ''
    );

  try {
    const result = await callModel({
      model: {
        provider: 'ollama_cloud',
        model: 'qwen3-coder:480b',
        description: 'Code generation worker',
        max_tokens: 16384,
        temperature: 0.2,
        estimated_speed: '15-30 TPS',
      },
      systemPrompt: 'You are a focused code generator. Output ONLY code as markdown code blocks with filenames.',
      userMessage: prompt,
    }, env);

    const files = parseGeneratedFiles(result.content);

    const workerResult: WorkerResult = {
      taskId: task.id,
      files,
      tokensUsed: result.tokens_used || 0,
      durationMs: Date.now() - startTime,
      issues: [],
    };

    task.status = 'complete';
    task.result = workerResult;

    onEvent?.({ type: 'step_complete', step: { id: task.id, type: 'generate', description: task.title, status: 'done', input: {} }, index: 0 } as OrchestratorEvent);
    onEvent?.({ type: 'thinking', content: `Worker done: ${task.title} (${files.length} files, ${workerResult.durationMs}ms)` } as OrchestratorEvent);

    for (const file of files) {
      onEvent?.({ type: 'file_written', path: file.path, content: file.content, language: file.language } as OrchestratorEvent);
    }

    return workerResult;
  } catch (error) {
    task.status = 'failed';
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    onEvent?.({ type: 'step_failed', step: { id: task.id, type: 'generate', description: task.title, status: 'failed', error: errorMsg, input: {} }, index: 0, error: errorMsg } as OrchestratorEvent);

    return {
      taskId: task.id,
      files: [],
      tokensUsed: 0,
      durationMs: Date.now() - startTime,
      issues: [errorMsg],
    };
  }
}

// --- Parallel Execution ---

/**
 * Execute a group of tasks in parallel
 */
async function executeParallelGroup(
  taskIds: string[],
  plan: OrchestrationPlan,
  existingFileContents: Map<string, string>,
  env: EnvConfig,
  onEvent?: (event: OrchestratorEvent) => void,
): Promise<WorkerResult[]> {
  const tasks = taskIds
    .map(id => plan.tasks.find(t => t.id === id))
    .filter((t): t is WorkerTask => t !== undefined);

  const results = await Promise.allSettled(
    tasks.map(task => executeWorker(task, plan, existingFileContents, env, onEvent))
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      taskId: tasks[i].id,
      files: [],
      tokensUsed: 0,
      durationMs: 0,
      issues: [r.reason?.message || 'Worker crashed'],
    };
  });
}

// --- Merge Results ---

/**
 * Merge all worker results, detecting and resolving file conflicts
 */
function mergeResults(
  allResults: WorkerResult[],
  onEvent?: (event: OrchestratorEvent) => void,
): Array<{ path: string; content: string; language: string }> {
  onEvent?.({ type: 'thinking', content: 'Merging results from all workers...' } as OrchestratorEvent);

  const fileMap = new Map<string, { content: string; language: string; sources: string[] }>();

  for (const result of allResults) {
    for (const file of result.files) {
      const existing = fileMap.get(file.path);
      if (existing) {
        // Conflict: two workers wrote the same file — take the longer version
        onEvent?.({ type: 'thinking', content: `Conflict on ${file.path} - taking longer version` } as OrchestratorEvent);
        if (file.content.length > existing.content.length) {
          fileMap.set(file.path, { content: file.content, language: file.language, sources: [...existing.sources, result.taskId] });
        }
      } else {
        fileMap.set(file.path, { content: file.content, language: file.language, sources: [result.taskId] });
      }
    }
  }

  onEvent?.({ type: 'thinking', content: `Merged ${fileMap.size} files from ${allResults.length} workers` } as OrchestratorEvent);

  return Array.from(fileMap.entries()).map(([path, data]) => ({
    path,
    content: data.content,
    language: data.language,
  }));
}

// --- Main Orchestrator ---

/**
 * Run the full multi-agent orchestration pipeline
 *
 * Flow:
 *   1. Plan -> decompose into parallel tasks
 *   2. For each parallel group (sequential between groups):
 *      - Execute all tasks in the group simultaneously
 *   3. Merge all results
 *   4. Return merged files
 */
export async function runOrchestrator(
  userMessage: string,
  existingFiles: Map<string, string>,
  env: EnvConfig,
  onEvent?: (event: OrchestratorEvent) => void,
): Promise<{
  plan: OrchestrationPlan;
  files: Array<{ path: string; content: string; language: string }>;
  totalTokens: number;
  totalDurationMs: number;
}> {
  const existingFilePaths = Array.from(existingFiles.keys());

  // Phase 1: Plan
  const plan = await createOrchestrationPlan(userMessage, existingFilePaths, env, onEvent);
  plan.status = 'executing';

  // Phase 2: Execute parallel groups
  const allResults: WorkerResult[] = [];

  for (let groupIdx = 0; groupIdx < plan.parallelGroups.length; groupIdx++) {
    const group = plan.parallelGroups[groupIdx];
    onEvent?.({ type: 'thinking', content: `Executing parallel group ${groupIdx + 1}/${plan.parallelGroups.length}: ${group.length} workers` } as OrchestratorEvent);

    const groupResults = await executeParallelGroup(group, plan, existingFiles, env, onEvent);
    allResults.push(...groupResults);

    // After each group, add generated files to the context for the next group
    for (const result of groupResults) {
      for (const file of result.files) {
        existingFiles.set(file.path, file.content);
      }
    }
  }

  // Phase 3: Merge
  plan.status = 'merging';
  const mergedFiles = mergeResults(allResults, onEvent);

  // Summary
  const totalTokens = allResults.reduce((sum, r) => sum + r.tokensUsed, 0);
  const totalDurationMs = Date.now() - plan.startedAt;
  const failedTasks = plan.tasks.filter(t => t.status === 'failed');

  plan.status = failedTasks.length === plan.tasks.length ? 'failed' : 'done';
  plan.completedAt = Date.now();

  onEvent?.({
    type: 'done',
    summary: `Orchestration complete: ${mergedFiles.length} files from ${plan.tasks.length} workers (${failedTasks.length} failed), ${totalTokens} tokens, ${(totalDurationMs / 1000).toFixed(1)}s`,
    filesChanged: mergedFiles.map(f => f.path),
  } as OrchestratorEvent);

  return { plan, files: mergedFiles, totalTokens, totalDurationMs };
}
